"""多策略对比：PPO / BC+PPO / A* baseline 在同一评估矩阵上的横评。

除打印 markdown 表格外，还输出 JSON（默认 output/compare.json）供 web demo
渲染对比区块。新增策略只需在 --models 里追加 name=path。

用法：
    uv run --package snakegame-ai python packages/snakegame-ai/src/training/compare.py
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from stable_baselines3 import PPO

from bridge import SCALAR_COUNT, SnakeBridge
from eval import EvalConfig, evaluate
from policy import SnakeFeaturesExtractor  # noqa: F401  PPO.load 反序列化需要

TRAINING_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = TRAINING_DIR / "output"
# 对比数据的正式归宿：models/compare.json（demo 直接加载）
MODELS_DIR = TRAINING_DIR.parent.parent / "models"

DEFAULT_MODELS = {
    "ppo": OUTPUT_DIR / "ppo_snake.zip",
    "bc_ppo": OUTPUT_DIR / "bc_ppo_snake.zip",
}
DEFAULT_LABELS = {
    "ppo": "PPO（从零训练）",
    "bc_ppo": "BC+PPO（A* 预训练）",
    "astar": "A* 启发式（老师）",
}


@dataclass
class PolicyEntry:
    name: str
    label: str
    # None 表示 A* baseline（teacher 直接 rollout，不经过 PyTorch）
    model: PPO | None


def evaluate_astar(cfg: EvalConfig, window_size: int,
                   rng: np.random.Generator) -> dict:
    """A* baseline：teacher_actions 驱动 rollout，与 eval.evaluate 同口径。"""
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
            "maxSteps": 4 * cfg.col * cfg.row,
            "debug": False,
        }
        for _ in range(cfg.episodes):
            bridge.create_env(env_cfg)

        for i in range(cfg.episodes):
            bridge.reset_env(i, int(rng.integers(0, 2**31)))

        done = np.zeros(cfg.episodes, dtype=bool)
        steps = np.zeros(cfg.episodes, dtype=np.int64)
        scores = np.zeros(cfg.episodes, dtype=np.int64)
        while not done.all():
            actions = bridge.teacher_actions()
            actions[done] = -1  # 跳过已结束 env
            result = bridge.step(actions)
            newly_done = ~done & result.done
            steps[~done] += 1
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
    parser = argparse.ArgumentParser(description="Multi-policy comparison")
    parser.add_argument(
        "--models", default=None,
        help="comma separated name=path pairs; defaults to the ppo/bc_ppo pair. "
             "Missing files are skipped with a warning.",
    )
    parser.add_argument("--no-astar", action="store_true",
                        help="exclude the A* baseline")
    parser.add_argument("--episodes", type=int, default=20)
    parser.add_argument("--sizes", default="8x8,12x12,16x16,20x20,25x25,30x30")
    parser.add_argument("--barriers", default="0,5,15,30,60")
    parser.add_argument("--seed", type=int, default=1234)
    parser.add_argument("--output", type=Path, default=MODELS_DIR / "compare.json")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    rng = np.random.default_rng(args.seed)

    if args.models:
        models = {}
        for token in args.models.split(","):
            name, _, path = token.strip().partition("=")
            models[name] = Path(path)
    else:
        models = dict(DEFAULT_MODELS)

    entries: list[PolicyEntry] = []
    for name, path in models.items():
        if not path.exists():
            print(f"# skip {name}: {path} not found")
            continue
        entries.append(PolicyEntry(
            name=name,
            label=DEFAULT_LABELS.get(name, name),
            model=PPO.load(path),
        ))
    if not args.no_astar:
        entries.append(PolicyEntry(
            name="astar", label=DEFAULT_LABELS["astar"], model=None
        ))

    sizes = []
    for token in args.sizes.split(","):
        col, _, row = token.strip().lower().partition("x")
        sizes.append((int(col), int(row)))
    barrier_counts = [int(t) for t in args.barriers.split(",")]

    # 同一个 window_size 评估所有策略（取第一个有模型的 entry；A* 不依赖）
    window_size = 15
    for entry in entries:
        if entry.model is not None:
            window_size = entry.model.observation_space.spaces["window"].shape[0]
            break

    # 每个策略独立 RNG 序列但同起点：所有策略面对同一批布局（种子一致）
    report = {
        "meta": {
            "episodes": args.episodes,
            "sizes": [f"{c}x{r}" for c, r in sizes],
            "barriers": barrier_counts,
            "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "window_size": window_size,
        },
        "policies": [],
    }

    print(f"# comparison: {args.episodes} episodes/cell\n")

    # 先跑完所有评估（report_cells[name][size][barriers]），再渲染 markdown
    report_cells: dict[str, dict] = {}
    for entry in entries:
        cells: dict[str, dict] = {}
        for col, row in sizes:
            size_cells = {}
            for barriers in barrier_counts:
                cfg = EvalConfig(col=col, row=row, barriers=barriers,
                                 episodes=args.episodes)
                if entry.model is not None:
                    stats = evaluate(entry.model, cfg, window_size,
                                     np.random.default_rng(args.seed))
                else:
                    stats = evaluate_astar(cfg, window_size,
                                           np.random.default_rng(args.seed))
                size_cells[str(barriers)] = {
                    "score": round(stats["mean_score"], 2),
                    "steps": round(stats["mean_steps"], 1),
                }
            cells[f"{col}x{row}"] = size_cells
        report_cells[entry.name] = cells
        report["policies"].append({
            "name": entry.name,
            "label": entry.label,
            "cells": cells,
        })

    for col, row in sizes:
        print(f"## {col}x{row}")
        header = "| policy | " + " | ".join(f"b={b}" for b in barrier_counts) + " |"
        print(header)
        print("|" + "---|" * (len(barrier_counts) + 1))
        for entry in entries:
            cells_md = []
            for barriers in barrier_counts:
                cell = report_cells[entry.name][f"{col}x{row}"][str(barriers)]
                cells_md.append(f"{cell['score']:.1f} ({cell['steps']:.0f})")
            print(f"| {entry.label} | " + " | ".join(cells_md) + " |")
        print()

    print("# cell format: mean score (mean steps); score = food eaten")

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"# json written to {args.output} (for the web demo)")


if __name__ == "__main__":
    main()
