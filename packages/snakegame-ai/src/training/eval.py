"""泛化评估：地图尺寸 × 障碍数 矩阵上的确定性策略表现。

每个评估配置使用独立的 bridge（MiniRacer 实例），done 的 env 以
action = -1 跳过（bridge 约定），跑满 episodes 后汇总。

用法：
    uv run --package snakegame-ai python \
        packages/snakegame-ai/src/training/eval.py --model src/training/output/ppo_snake.zip
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from stable_baselines3 import PPO

from bridge import SCALAR_COUNT, SnakeBridge
from policy import SnakeFeaturesExtractor  # noqa: F401  PPO.load 反序列化需要该模块可导入

TRAINING_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = TRAINING_DIR / "output"


@dataclass
class EvalConfig:
    col: int
    row: int
    barriers: int  # 固定障碍数（评估需可控、可比）
    episodes: int


def evaluate(model: PPO, cfg: EvalConfig, window_size: int, rng: np.random.Generator):
    """返回该配置下 {mean_score, mean_steps, mean_survival_ratio}。"""
    bridge = SnakeBridge(window_size=window_size)
    try:
        env_cfg = {
            "col": cfg.col,
            "row": cfg.row,
            "barriers": cfg.barriers,
            "barrierPlacement": "reachable",
            "actionMode": "relative",
            "observationType": "window",
            "windowSize": window_size,
            "maxSteps": 4 * cfg.col * cfg.row,  # 评估不设人为截断，只防死循环
            "debug": False,
        }
        for _ in range(cfg.episodes):
            bridge.create_env(env_cfg)

        windows = np.empty((cfg.episodes, window_size, window_size, 3), dtype=np.float32)
        scalars = np.empty((cfg.episodes, SCALAR_COUNT), dtype=np.float32)
        for i in range(cfg.episodes):
            windows[i], scalars[i] = bridge.reset_env(
                i, int(rng.integers(0, 2**31))
            )

        done = np.zeros(cfg.episodes, dtype=bool)
        steps = np.zeros(cfg.episodes, dtype=np.int64)
        scores = np.zeros(cfg.episodes, dtype=np.int64)
        while not done.all():
            actions = np.full(cfg.episodes, -1, dtype=np.int64)  # -1 跳过已结束 env
            alive = ~done
            obs = {"window": windows[alive], "scalars": scalars[alive]}
            acts, _ = model.predict(obs, deterministic=True)
            actions[alive] = acts
            result = bridge.step(actions)
            newly_done = alive & result.done
            steps[alive] += 1
            scores[newly_done] = result.scores[newly_done]
            done |= result.done
        return {
            "mean_score": float(scores.mean()),
            "mean_steps": float(steps.mean()),
            "max_steps_cap": 4 * cfg.col * cfg.row,
        }
    finally:
        bridge.close()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generalization evaluation matrix")
    parser.add_argument("--model", type=Path, default=OUTPUT_DIR / "ppo_snake.zip")
    parser.add_argument("--episodes", type=int, default=20)
    parser.add_argument(
        "--sizes",
        default="8x8,12x12,16x16,20x20,25x25,30x30",
        help="comma separated COLxROW pairs; include sizes beyond the training range",
    )
    parser.add_argument(
        "--barriers",
        default="0,5,15,30,60",
        help="comma separated fixed barrier counts per size",
    )
    parser.add_argument("--seed", type=int, default=1234)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    # 自定义 policy 类随 pickle 存储在 zip 中，load 时按模块路径反序列化，
    # 因此需要 import policy 模块（见文件顶部 noqa）
    model = PPO.load(args.model)
    # window_size 从模型观察空间推断，保证与训练一致
    window_size = model.observation_space.spaces["window"].shape[0]
    rng = np.random.default_rng(args.seed)

    sizes = []
    for token in args.sizes.split(","):
        col, row = token.strip().lower().split("x")
        sizes.append((int(col), int(row)))
    barrier_counts = [int(t) for t in args.barriers.split(",")]

    print(f"# evaluation: {args.episodes} episodes/cell, deterministic policy\n")
    header = f"| {'size':>8} | " + " | ".join(f"b={b}" for b in barrier_counts) + " |"
    print(header)
    print("|" + "---|" * (len(barrier_counts) + 1))
    for col, row in sizes:
        cells = []
        for barriers in barrier_counts:
            cfg = EvalConfig(col=col, row=row, barriers=barriers, episodes=args.episodes)
            stats = evaluate(model, cfg, window_size, rng)
            cells.append(f"{stats['mean_score']:.1f} ({stats['mean_steps']:.0f})")
        print(f"| {col}x{row} | " + " | ".join(cells) + " |")
    print("\n# cell format: mean score (mean steps); score = food eaten")


if __name__ == "__main__":
    main()
