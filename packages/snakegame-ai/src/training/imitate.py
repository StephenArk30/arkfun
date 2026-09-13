"""模仿学习 + PPO 微调（BC+PPO）：用内置 A* 当老师给策略网络一个好起点。

三个阶段：
1. 数据生成：域随机化配置下 A* 老师 rollout，收集 (观察, 老师相对动作,
   折现 return-to-go) 三元组
2. 行为克隆（BC）：对 PPO policy 的 actor 路径做交叉熵，同时对 value
   head 回归老师的 return-to-go——critic 若随机初始化，PPO 微调的
   advantage 全是噪声，会毁掉 BC 学到的策略（上一版 BC+PPO 退化到
   纯 PPO 水平的主因之一）
3. PPO 微调：从 BC 权重出发照常 learn（on-policy 不挑初始权重）

用法：
    uv run --package snakegame-ai python \
        packages/snakegame-ai/src/training/imitate.py --total-timesteps 1_000_000

产出 output/bc_ppo_snake.zip，与纯 PPO 的 output/ppo_snake.zip 对照实验。
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import torch as th
from stable_baselines3 import PPO

from bridge import DEFAULT_WINDOW_SIZE, SnakeBridge
from callbacks import InitialMetricsCallback, ScoreMeanCallback
from env import DomainConfig, FoodDistanceShaper, SnakeVecEnv
from policy import SnakeFeaturesExtractor

TRAINING_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = TRAINING_DIR / "output"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="BC + PPO training for snakegame")
    # 观察与网络
    parser.add_argument("--window-size", type=int, default=DEFAULT_WINDOW_SIZE)
    # 域随机化（与 train.py 保持一致：两者对比才有意义）
    parser.add_argument("--col-min", type=int, default=8)
    parser.add_argument("--col-max", type=int, default=20)
    parser.add_argument("--row-min", type=int, default=8)
    parser.add_argument("--row-max", type=int, default=20)
    parser.add_argument("--barriers-min", type=int, default=0)
    parser.add_argument("--barriers-max", type=int, default=30)
    parser.add_argument("--snake-len-min", type=int, default=1)
    parser.add_argument("--snake-len-max", type=int, default=3)
    parser.add_argument("--rebuild-prob", type=float, default=1.0)
    parser.add_argument("--max-steps", type=int, default=500)
    parser.add_argument("--food-reward", type=float, default=1.0)
    parser.add_argument("--step-reward", type=float, default=-0.01)
    parser.add_argument("--death-reward", type=float, default=-1.0)
    parser.add_argument("--win-reward", type=float, default=10.0)
    # 食物距离势能塑形系数（与 train.py 一致；BC 数据收集同样应用）
    parser.add_argument("--shape-coef", type=float, default=0.1)
    # BC 阶段
    parser.add_argument("--bc-envs", type=int, default=32, help="数据生成的并行 env 数")
    parser.add_argument("--bc-samples", type=int, default=100_000,
                        help="BC 训练样本数（约等于老师步数）")
    parser.add_argument("--bc-epochs", type=int, default=4)
    parser.add_argument("--bc-lr", type=float, default=1e-3)
    parser.add_argument("--bc-batch-size", type=int, default=1024)
    parser.add_argument("--bc-gamma", type=float, default=0.99,
                        help="return-to-go 的折扣（与 PPO gamma 保持一致）")
    parser.add_argument("--bc-vf-coef", type=float, default=0.5,
                        help="value head 回归损失系数（对齐 PPO vf_coef）")
    # PPO 阶段（超参与 train.py 一致）
    parser.add_argument("--n-envs", type=int, default=64)
    parser.add_argument("--rollout-steps", type=int, default=256)
    parser.add_argument("--batch-size", type=int, default=512)
    parser.add_argument("--learning-rate", type=float, default=3e-4)
    parser.add_argument("--target-kl", type=float, default=0.03)
    parser.add_argument("--ent-coef", type=float, default=0.01)
    parser.add_argument("--total-timesteps", type=int, default=1_000_000)
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--output", type=Path, default=OUTPUT_DIR / "bc_ppo_snake.zip")
    return parser.parse_args()


def collect_teacher_data(
    bridge: SnakeBridge,
    domain: DomainConfig,
    n_envs: int,
    n_samples: int,
    window_size: int,
    rng: np.random.Generator,
    shape_coef: float = 0.0,
    gamma: float = 0.99,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """A* 老师 rollout 收集 (观察, 老师动作, 折现 return-to-go)。

    老师自己也会死（贪心路线自困）——死掉的 env 直接重开，教师数据
    天然带"老师水平"的上限，这正是留给 PPO 阶段超越的部分。

    塑形与 PPO 阶段一致（shape_coef > 0 时每步 reward += coef*(d_prev−d_new)），
    保证 value head 预训练与后续 PPO 微调看到的奖励信号同分布。
    """
    wc = window_size * window_size * 3
    windows = np.empty((n_samples, window_size, window_size, 3), dtype=np.float32)
    scalars = np.empty((n_samples, 11), dtype=np.float32)
    actions = np.empty(n_samples, dtype=np.int64)
    rewards = np.empty(n_samples, dtype=np.float64)
    dones = np.empty(n_samples, dtype=bool)

    cols = np.zeros(n_envs, dtype=np.int64)
    rows = np.zeros(n_envs, dtype=np.int64)
    shaper = FoodDistanceShaper(shape_coef, n_envs) if shape_coef else None

    for i in range(n_envs):
        cfg = domain.sample(rng, window_size)
        bridge.create_env(cfg)
        cols[i] = cfg["col"]
        rows[i] = cfg["row"]

    n = bridge.env_count
    cur_windows = np.empty((n, window_size, window_size, 3), dtype=np.float32)
    cur_scalars = np.empty((n, 11), dtype=np.float32)
    for i in range(n):
        cur_windows[i], cur_scalars[i] = bridge.reset_env(
            i, int(rng.integers(0, 2**31))
        )
    if shaper is not None:
        shaper.begin_all(cur_scalars, cols, rows)

    # 样本按 [step, env] 块顺序落盘；记录每块边界供 return 倒序累加
    blocks: list[tuple[int, int]] = []
    count = 0
    while count < n_samples:
        teacher = bridge.teacher_actions()
        take = min(n, n_samples - count)
        start = count
        windows[start : start + take] = cur_windows[:take]
        scalars[start : start + take] = cur_scalars[:take]
        actions[start : start + take] = teacher[:take]
        blocks.append((start, start + take))
        count += take

        result = bridge.step(teacher)
        step_rewards = result.rewards
        if shaper is not None:
            step_rewards = step_rewards + shaper.shape(result.scalars, cols, rows)
        rewards[start : start + take] = step_rewards[:take]
        dones[start : start + take] = result.done[:take]
        for i in np.nonzero(result.done)[0]:
            if rng.random() < domain.rebuild_prob:
                cfg = domain.sample(rng, window_size)
                bridge.replace_env(i, cfg)
                cols[i] = cfg["col"]
                rows[i] = cfg["row"]
            cur_windows[i], cur_scalars[i] = bridge.reset_env(
                i, int(rng.integers(0, 2**31))
            )
            if shaper is not None:
                shaper.begin(i, cur_scalars[i], cols[i], rows[i])
        alive = ~result.done
        cur_windows[alive] = result.windows[alive]
        cur_scalars[alive] = result.scalars[alive]

    # 折现 return-to-go：块内样本属同一 step 的不同 env，倒序逐块累加。
    # dones[b] 为真表示 b 是该局最后一步：其后（更晚的）同 env 样本属于
    # 新一局，其 return 不应计入 b 所在局——碰到 done 先清零再累加。
    returns = np.empty(n_samples, dtype=np.float64)
    run = np.zeros(n_envs, dtype=np.float64)
    for start, end in reversed(blocks):
        for b in range(end - 1, start - 1, -1):
            i = b - start
            if dones[b]:
                run[i] = 0.0
            returns[b] = rewards[b] + gamma * run[i]
            run[i] = returns[b]

    return (
        np.concatenate([windows.reshape(n_samples, wc), scalars], axis=1),
        actions,
        returns,
    )


def behavior_cloning(
    model: PPO,
    features: np.ndarray,
    actions: np.ndarray,
    returns: np.ndarray,
    window_size: int,
    epochs: int,
    lr: float,
    batch_size: int,
    seed: int,
    vf_coef: float = 0.5,
) -> tuple[list[float], list[float]]:
    """BC：actor 路径交叉熵 + value head 回归 return-to-go。

    直接复用 SB3 policy 的分布/值接口，保证 BC 权重与后续 PPO 训练的
    网络结构逐层对齐，无需任何权重搬运/改名。
    """
    device = model.device
    x = th.as_tensor(features, dtype=th.float32, device=device)
    y = th.as_tensor(actions, dtype=th.long, device=device)
    ret = th.as_tensor(returns, dtype=th.float32, device=device)
    wc = window_size * window_size * 3
    params = list(model.policy.parameters())
    opt = th.optim.Adam(params, lr=lr)
    gen = th.Generator().manual_seed(seed)
    ce_losses: list[float] = []
    vf_losses: list[float] = []
    n = x.shape[0]
    model.policy.set_training_mode(True)
    for _ in range(epochs):
        perm = th.randperm(n, generator=gen).to(device)
        epoch_ce = 0.0
        epoch_vf = 0.0
        batches = 0
        for start in range(0, n, batch_size):
            idx = perm[start : start + batch_size]
            obs = {
                "window": x[idx, :wc].reshape(-1, window_size, window_size, 3),
                "scalars": x[idx, wc:],
            }
            dist = model.policy.get_distribution(obs)
            ce = -dist.log_prob(y[idx]).mean()
            values = model.policy.predict_values(obs).flatten()
            vf = th.nn.functional.mse_loss(values, ret[idx])
            loss = ce + vf_coef * vf
            opt.zero_grad()
            loss.backward()
            opt.step()
            epoch_ce += ce.item()
            epoch_vf += vf.item()
            batches += 1
        ce_losses.append(epoch_ce / batches)
        vf_losses.append(epoch_vf / batches)
    model.policy.set_training_mode(False)
    return ce_losses, vf_losses


def main() -> None:
    args = parse_args()

    domain = DomainConfig(
        col=(args.col_min, args.col_max),
        row=(args.row_min, args.row_max),
        barriers=(args.barriers_min, args.barriers_max),
        snake_len=(args.snake_len_min, args.snake_len_max),
        max_steps=args.max_steps,
        rebuild_prob=args.rebuild_prob,
        food_reward=args.food_reward,
        step_reward=args.step_reward,
        death_reward=args.death_reward,
        win_reward=args.win_reward,
    )

    # ---- 阶段 1：A* 老师数据 ----
    print(f"[bc] collecting {args.bc_samples} teacher samples "
          f"({args.bc_envs} parallel envs, A* policy)...")
    data_bridge = SnakeBridge(window_size=args.window_size)
    try:
        features, actions, returns = collect_teacher_data(
            data_bridge, domain, args.bc_envs, args.bc_samples,
            args.window_size, np.random.default_rng(args.seed),
            shape_coef=args.shape_coef, gamma=args.bc_gamma,
        )
    finally:
        data_bridge.close()

    # ---- 阶段 2：构造 PPO 并做 BC（权重天然落入 policy）----
    train_bridge = SnakeBridge(window_size=args.window_size)
    env = SnakeVecEnv(
        train_bridge, domain, n_envs=args.n_envs, seed=args.seed,
        shape_coef=args.shape_coef,
    )
    model = PPO(
        "MultiInputPolicy",
        env,
        policy_kwargs=dict(
            features_extractor_class=SnakeFeaturesExtractor,
            features_extractor_kwargs=dict(window_size=args.window_size),
        ),
        n_steps=args.rollout_steps,
        batch_size=args.batch_size,
        learning_rate=args.learning_rate,
        gamma=0.99,
        target_kl=args.target_kl,
        ent_coef=args.ent_coef,
        seed=args.seed,
        verbose=1,
        tensorboard_log=str(OUTPUT_DIR / "tensorboard"),
    )

    print(f"[bc] training actor + value head for {args.bc_epochs} epochs "
          f"(lr={args.bc_lr}, batch={args.bc_batch_size})...")
    ce_losses, vf_losses = behavior_cloning(
        model, features, actions, returns, args.window_size, args.bc_epochs,
        args.bc_lr, args.bc_batch_size, args.seed, args.bc_vf_coef,
    )
    for i, (ce, vf) in enumerate(zip(ce_losses, vf_losses)):
        print(f"[bc] epoch {i + 1}: cross-entropy = {ce:.4f}, value-mse = {vf:.4f}")

    # ---- 阶段 3：PPO 微调（照常训练，起点为 BC 权重）----
    print(f"[ppo] fine-tuning for {args.total_timesteps} steps...")
    model.learn(
        total_timesteps=args.total_timesteps,
        progress_bar=True,
        callback=[
            ScoreMeanCallback(),
            InitialMetricsCallback({
                "bc/cross_entropy": ce_losses[-1],
                "bc/value_mse": vf_losses[-1],
            }),
        ],
    )

    args.output.parent.mkdir(parents=True, exist_ok=True)
    model.save(args.output)
    # 显式收尾（同 train.py）：避免 Python 3.13 退出阶段 GC finalizer 与
    # EventFileWriter 后台线程的死锁挂起。
    model.logger.close()
    env.close()
    print(f"model saved to {args.output}")
    print(f"next: uv run --package snakegame-ai python "
          f"{TRAINING_DIR / 'export.py'} --model {args.output} "
          f"--output {args.output.parent / 'bc_ppo_model.onnx'}")
    print(f"curves: uv run --package snakegame-ai tensorboard "
          f"--logdir {OUTPUT_DIR / 'tensorboard'}")


if __name__ == "__main__":
    main()
