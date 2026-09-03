"""策略网络：window（NHWC）→ CNN，scalars → MLP，特征拼接。

CNN 输入约定为 NHWC（与 JS 侧 observation.ts 的窗口编码、ONNX 导出布局
完全一致），forward 内部 permute 到 NCHW 供 PyTorch conv2d 使用。
"""

from __future__ import annotations

import torch as th
from gymnasium import spaces
from stable_baselines3.common.torch_layers import BaseFeaturesExtractor


class SnakeFeaturesExtractor(BaseFeaturesExtractor):
    """Dict 观察（window + scalars）的特征提取器。"""

    def __init__(
        self,
        observation_space: spaces.Dict,
        features_dim: int = 192,
        window_size: int = 15,
    ):
        super().__init__(observation_space, features_dim)
        self.window_size = window_size
        scalar_dim = observation_space.spaces["scalars"].shape[0]

        # 4 次 stride-2 卷积：15 -> 8 -> 4 -> 2 -> 1
        self.cnn = th.nn.Sequential(
            th.nn.Conv2d(3, 32, 3, stride=2, padding=1),
            th.nn.ReLU(),
            th.nn.Conv2d(32, 32, 3, stride=2, padding=1),
            th.nn.ReLU(),
            th.nn.Conv2d(32, 64, 3, stride=2, padding=1),
            th.nn.ReLU(),
            th.nn.Conv2d(64, 64, 3, stride=2, padding=1),
            th.nn.ReLU(),
            th.nn.Flatten(),
        )
        with th.no_grad():
            cnn_out_dim = self.cnn(th.zeros(1, 3, window_size, window_size)).shape[1]

        self.fc_window = th.nn.Sequential(
            th.nn.Linear(cnn_out_dim, 256),
            th.nn.ReLU(),
        )
        self.fc_scalars = th.nn.Sequential(
            th.nn.Linear(scalar_dim, 64),
            th.nn.ReLU(),
            th.nn.Linear(64, 64),
            th.nn.ReLU(),
        )
        self.head = th.nn.Sequential(
            th.nn.Linear(256 + 64, features_dim),
            th.nn.ReLU(),
        )

    def forward(self, observations: dict[str, th.Tensor]) -> th.Tensor:
        window = observations["window"].permute(0, 3, 1, 2)  # NHWC -> NCHW
        h_window = self.fc_window(self.cnn(window))
        h_scalars = self.fc_scalars(observations["scalars"])
        return self.head(th.cat([h_window, h_scalars], dim=1))
