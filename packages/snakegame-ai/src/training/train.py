"""PPO 训练入口。

用法（仓库根目录）：
    npx lerna run build --scope=@arkfun/snakegame        # 生成 dist/index.cjs
    uv run --package snakegame-ai python \
        packages/snakegame-ai/src/training/train.py --total-timesteps 1_000_000

训练分布默认：地图 8×8 ~ 20×20、障碍 0 ~ 30、初始蛇长 1 ~ 3，
每局换地图（--rebuild-prob 1.0）。
"""

from __future__ import annotations

import argparse
from pathlib import Path

from stable_baselines3 import PPO

from bridge import DEFAULT_WINDOW_SIZE, SnakeBridge
from callbacks import ScoreMeanCallback
from env import DomainConfig, SnakeVecEnv
from policy import SnakeFeaturesExtractor

TRAINING_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = TRAINING_DIR / "output"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="PPO training for snakegame")
    # 观察与网络
    parser.add_argument("--window-size", type=int, default=DEFAULT_WINDOW_SIZE)
    # 训练分布（域随机化）
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
    # 奖励塑形
    parser.add_argument("--food-reward", type=float, default=1.0)
    parser.add_argument("--step-reward", type=float, default=-0.01)
    parser.add_argument("--death-reward", type=float, default=-1.0)
    parser.add_argument("--win-reward", type=float, default=10.0)
    # 食物距离势能塑形系数（0 = 关闭；>0 时每步 reward += coef*(d_prev−d_new)）
    parser.add_argument("--shape-coef", type=float, default=0.1)
    # PPO
    parser.add_argument("--n-envs", type=int, default=64)
    parser.add_argument("--rollout-steps", type=int, default=256)
    parser.add_argument("--batch-size", type=int, default=512)
    parser.add_argument("--learning-rate", type=float, default=3e-4)
    # 约束更新幅度与保持探索：无 target_kl 时 late-run approx_kl 会冲到
    # 0.1 以上（clip_fraction 0.2+），策略被单次更新破坏；熵坍塌会让
    # 探索在发现食物之前就死亡
    parser.add_argument("--target-kl", type=float, default=0.03)
    parser.add_argument("--ent-coef", type=float, default=0.01)
    parser.add_argument("--total-timesteps", type=int, default=1_000_000)
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--output", type=Path, default=OUTPUT_DIR / "ppo_snake.zip")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    bridge = SnakeBridge(window_size=args.window_size)
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
    env = SnakeVecEnv(
        bridge, domain, n_envs=args.n_envs, seed=args.seed, shape_coef=args.shape_coef
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
    model.learn(
        total_timesteps=args.total_timesteps,
        progress_bar=True,
        callback=[ScoreMeanCallback()],
    )

    args.output.parent.mkdir(parents=True, exist_ok=True)
    model.save(args.output)
    # 显式收尾：关闭 SummaryWriter 与 V8 bridge。不关 SummaryWriter 时，
    # Python 3.13 退出阶段的 GC finalizer 会 join EventFileWriter 的后台
    # 线程，而此时 GIL 已冻结 → 进程在保存模型之后挂死不退出。
    model.logger.close()
    env.close()
    print(f"model saved to {args.output}")
    print(f"next: uv run --package snakegame-ai python "
          f"{TRAINING_DIR / 'export.py'} --model {args.output}")
    print(f"curves: uv run --package snakegame-ai tensorboard "
          f"--logdir {OUTPUT_DIR / 'tensorboard'}")


if __name__ == "__main__":
    main()
