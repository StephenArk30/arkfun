"""模仿学习 + PPO 微调（BC+PPO）：用内置 A* 当老师给策略网络一个好起点。

三个阶段：
1. 数据生成：域随机化配置下 A* 老师 rollout，收集 (观察, 老师相对动作) 对
2. 行为克隆（BC）：对 PPO policy 的 actor 路径做交叉熵监督训练
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
from env import DomainConfig, SnakeVecEnv
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
    # BC 阶段
    parser.add_argument("--bc-envs", type=int, default=32, help="数据生成的并行 env 数")
    parser.add_argument("--bc-samples", type=int, default=100_000,
                        help="BC 训练样本数（约等于老师步数）")
    parser.add_argument("--bc-epochs", type=int, default=4)
    parser.add_argument("--bc-lr", type=float, default=1e-3)
    parser.add_argument("--bc-batch-size", type=int, default=1024)
    # PPO 阶段（超参与 train.py 一致）
    parser.add_argument("--n-envs", type=int, default=64)
    parser.add_argument("--rollout-steps", type=int, default=256)
    parser.add_argument("--batch-size", type=int, default=512)
    parser.add_argument("--learning-rate", type=float, default=3e-4)
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
) -> tuple[np.ndarray, np.ndarray]:
    """A* 老师 rollout 收集 (观察, 老师动作)。

    老师自己也会死（贪心路线自困）——死掉的 env 直接重开，教师数据
    天然带"老师水平"的上限，这正是留给 PPO 阶段超越的部分。
    """
    wc = window_size * window_size * 3
    windows = np.empty((n_samples, window_size, window_size, 3), dtype=np.float32)
    scalars = np.empty((n_samples, 11), dtype=np.float32)
    actions = np.empty(n_samples, dtype=np.int64)

    cfg = domain.sample(rng, window_size)
    for _ in range(n_envs):
        bridge.create_env(cfg)

    n = bridge.env_count
    cur_windows = np.empty((n, window_size, window_size, 3), dtype=np.float32)
    cur_scalars = np.empty((n, 11), dtype=np.float32)
    for i in range(n):
        cur_windows[i], cur_scalars[i] = bridge.reset_env(
            i, int(rng.integers(0, 2**31))
        )

    count = 0
    while count < n_samples:
        teacher = bridge.teacher_actions()
        take = min(n, n_samples - count)
        windows[count : count + take] = cur_windows[:take]
        scalars[count : count + take] = cur_scalars[:take]
        actions[count : count + take] = teacher[:take]
        count += take

        result = bridge.step(teacher)
        for i in np.nonzero(result.done)[0]:
            if rng.random() < domain.rebuild_prob:
                bridge.replace_env(i, domain.sample(rng, window_size))
            cur_windows[i], cur_scalars[i] = bridge.reset_env(
                i, int(rng.integers(0, 2**31))
            )
        alive = ~result.done
        cur_windows[alive] = result.windows[alive]
        cur_scalars[alive] = result.scalars[alive]

    return (
        np.concatenate([windows[:n_samples].reshape(n_samples, wc), scalars[:n_samples]],
                       axis=1),
        actions[:n_samples],
    )


def behavior_cloning(model: PPO, features: np.ndarray, actions: np.ndarray,
                     window_size: int, epochs: int, lr: float,
                     batch_size: int, seed: int) -> list[float]:
    """对 policy 的 actor 路径（extractor -> mlp_extractor -> action_net）做交叉熵。

    直接复用 SB3 policy 的分布接口，保证 BC 权重与后续 PPO 训练的网络
    结构逐层对齐，无需任何权重搬运/改名。
    """
    device = model.device
    x = th.as_tensor(features, dtype=th.float32, device=device)
    y = th.as_tensor(actions, dtype=th.long, device=device)
    wc = window_size * window_size * 3
    params = list(model.policy.parameters())
    opt = th.optim.Adam(params, lr=lr)
    gen = th.Generator().manual_seed(seed)
    losses: list[float] = []
    n = x.shape[0]
    model.policy.set_training_mode(True)
    for _ in range(epochs):
        perm = th.randperm(n, generator=gen).to(device)
        epoch_loss = 0.0
        batches = 0
        for start in range(0, n, batch_size):
            idx = perm[start : start + batch_size]
            obs = {
                "window": x[idx, :wc].reshape(-1, window_size, window_size, 3),
                "scalars": x[idx, wc:],
            }
            dist = model.policy.get_distribution(obs)
            loss = -dist.log_prob(y[idx]).mean()
            opt.zero_grad()
            loss.backward()
            opt.step()
            epoch_loss += loss.item()
            batches += 1
        losses.append(epoch_loss / batches)
    model.policy.set_training_mode(False)
    return losses


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
        features, actions = collect_teacher_data(
            data_bridge, domain, args.bc_envs, args.bc_samples,
            args.window_size, np.random.default_rng(args.seed),
        )
    finally:
        data_bridge.close()

    # ---- 阶段 2：构造 PPO 并做 BC（权重天然落入 policy）----
    train_bridge = SnakeBridge(window_size=args.window_size)
    env = SnakeVecEnv(train_bridge, domain, n_envs=args.n_envs, seed=args.seed)
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
        seed=args.seed,
        verbose=1,
        tensorboard_log=str(OUTPUT_DIR / "tensorboard"),
    )

    print(f"[bc] training actor for {args.bc_epochs} epochs "
          f"(lr={args.bc_lr}, batch={args.bc_batch_size})...")
    losses = behavior_cloning(
        model, features, actions, args.window_size, args.bc_epochs,
        args.bc_lr, args.bc_batch_size, args.seed,
    )
    for i, loss in enumerate(losses):
        print(f"[bc] epoch {i + 1}: cross-entropy = {loss:.4f}")

    # ---- 阶段 3：PPO 微调（照常训练，起点为 BC 权重）----
    print(f"[ppo] fine-tuning for {args.total_timesteps} steps...")
    model.learn(total_timesteps=args.total_timesteps, progress_bar=True)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    model.save(args.output)
    print(f"model saved to {args.output}")
    print(f"next: uv run --package snakegame-ai python "
          f"{TRAINING_DIR / 'export.py'} --model {args.output} "
          f"--output {args.output.parent / 'bc_ppo_model.onnx'}")


if __name__ == "__main__":
    main()
