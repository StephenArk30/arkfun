"""导出 ONNX：PyTorch policy → (window NHWC, scalars) → logits(3)。

输入布局与浏览器 demo 侧完全对齐：
    window:  float32 [batch, W, W, 3] NHWC（snakegame observation.ts 原生布局）
    scalars: float32 [batch, 11]
    logits:  float32 [batch, 3]（0 左转 / 1 直行 / 2 右转）

用法：
    uv run --package snakegame-ai python \
        packages/snakegame-ai/src/training/export.py --model src/training/output/ppo_snake.zip
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import onnxruntime as ort
import torch as th
from stable_baselines3 import PPO

from bridge import SCALAR_COUNT

TRAINING_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = TRAINING_DIR / "output"
# 模型的正式归宿：包内 models/ 目录（提交 git，demo 直接加载）
MODELS_DIR = TRAINING_DIR.parent.parent / "models"


class PolicyWrapper(th.nn.Module):
    """NHWC window 输入 → 动作 logits，供 ONNX 导出。"""

    def __init__(self, policy):
        super().__init__()
        self.policy = policy

    def forward(self, window: th.Tensor, scalars: th.Tensor) -> th.Tensor:
        # window [B, W, W, 3]：extract_features 内由 SnakeFeaturesExtractor
        # 负责 NHWC -> NCHW，此处直接透传 Dict 观察
        features = self.policy.extract_features({"window": window, "scalars": scalars})
        latent = self.policy.mlp_extractor.forward_actor(features)
        return self.policy.action_net(latent)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Export snakegame policy to ONNX")
    parser.add_argument("--model", type=Path, default=OUTPUT_DIR / "ppo_snake.zip")
    parser.add_argument("--output", type=Path, default=MODELS_DIR / "ppo.onnx")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    model = PPO.load(args.model)
    window_size = model.observation_space.spaces["window"].shape[0]

    wrapper = PolicyWrapper(model.policy).eval()
    dummy = (
        th.zeros(1, window_size, window_size, 3, dtype=th.float32),
        th.zeros(1, SCALAR_COUNT, dtype=th.float32),
    )

    args.output.parent.mkdir(parents=True, exist_ok=True)
    th.onnx.export(
        wrapper,
        dummy,
        str(args.output),
        input_names=["window", "scalars"],
        output_names=["logits"],
        dynamic_axes={
            "window": {0: "batch"},
            "scalars": {0: "batch"},
            "logits": {0: "batch"},
        },
        opset_version=17,
        dynamo=False,  # legacy exporter：纯前馈网络足够，且不依赖 onnxscript
    )

    # 加载校验：输入输出形状与约定一致
    session = ort.InferenceSession(str(args.output), providers=["CPUExecutionProvider"])
    feeds = {
        "window": np.zeros((2, window_size, window_size, 3), dtype=np.float32),
        "scalars": np.zeros((2, SCALAR_COUNT), dtype=np.float32),
    }
    logits = session.run(["logits"], feeds)[0]
    assert logits.shape == (2, 3), f"unexpected logits shape {logits.shape}"

    print(f"ONNX exported to {args.output}")
    print(f"the demo loads it from the models/ directory "
          f"(no copy step needed, restart the dev server)")


if __name__ == "__main__":
    main()
