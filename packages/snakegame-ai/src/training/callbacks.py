"""训练期回调：把 SnakeVecEnv 终局 info 里的 score 汇总为 TensorBoard 曲线。

- ``rollout/ep_score_mean``：最近 buffer_size 局的平均得分（吃到食物数），
  即"得分能力曲线"，比 ep_rew_mean 更直观（不含 step/death 等惩罚项）。
- ``InitialMetricsCallback``：把训练开始前的常数指标（如 BC 阶段 loss）
  写入 TensorBoard——SB3 的 logger 在 learn() 内部才创建，训练前的指标
  必须借回调带进去。
"""

from __future__ import annotations

from collections import deque

import numpy as np
from stable_baselines3.common.callbacks import BaseCallback


class ScoreMeanCallback(BaseCallback):
    """从 info["score"] 计算 rollout/ep_score_mean。"""

    def __init__(self, buffer_size: int = 100):
        super().__init__()
        self._scores: deque[float] = deque(maxlen=buffer_size)

    def _on_step(self) -> bool:
        for info in self.locals["infos"]:
            if "score" in info:
                self._scores.append(float(info["score"]))
        if self._scores:
            self.logger.record("rollout/ep_score_mean", float(np.mean(self._scores)))
        return True


class InitialMetricsCallback(BaseCallback):
    """learn() 开始时把常数指标写入 logger（首个 dump 时落到 TensorBoard）。"""

    def __init__(self, metrics: dict[str, float]):
        super().__init__()
        self._metrics = metrics

    def _on_training_start(self) -> None:
        for key, value in self._metrics.items():
            self.logger.record(key, value)

    def _on_step(self) -> bool:
        return True

