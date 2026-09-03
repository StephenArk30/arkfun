"""SB3 兼容的向量化环境：一次边界调用批量 step + episode 边界域随机化。

VecEnv 语义（SB3 约定）：done 的 env 在同一次 step 返回中携带 reset 后的
新初始观察；episode 结束时按 rebuild_prob 重新采样地图配置（尺寸/障碍数/
初始蛇长），实现跨尺寸、跨障碍密度泛化训练。
"""

from __future__ import annotations

from dataclasses import dataclass

import gymnasium as gym
import numpy as np
from stable_baselines3.common.vec_env import VecEnv

from bridge import SCALAR_COUNT, SnakeBridge


@dataclass
class DomainConfig:
    """训练分布：每个量支持 (min, max) 区间，reset 时重采样。

    col/row 决定地图尺寸（env 创建时固定，episode 边界重建时才变化）；
    barriers/snakeLen 由 snakegame 在每局 reset 内部随机。
    """

    col: tuple[int, int] = (8, 20)
    row: tuple[int, int] = (8, 20)
    barriers: tuple[int, int] = (0, 30)
    snake_len: tuple[int, int] = (1, 3)
    max_steps: int = 500
    # episode 结束时重新采样地图配置（含尺寸）的概率；1.0 = 每局都换地图
    rebuild_prob: float = 1.0
    # 奖励塑形
    food_reward: float = 1.0
    step_reward: float = -0.01
    death_reward: float = -1.0
    win_reward: float = 10.0

    def sample(self, rng: np.random.Generator, window_size: int) -> dict:
        cfg = {
            "col": int(rng.integers(self.col[0], self.col[1] + 1)),
            "row": int(rng.integers(self.row[0], self.row[1] + 1)),
            "barriers": [self.barriers[0], self.barriers[1]],
            "snakeLen": [self.snake_len[0], self.snake_len[1]],
            "maxSteps": self.max_steps,
            "foodReward": self.food_reward,
            "stepReward": self.step_reward,
            "deathReward": self.death_reward,
            "winReward": self.win_reward,
            "barrierPlacement": "reachable",
            "actionMode": "relative",
            "observationType": "window",
            "windowSize": window_size,
            "debug": False,
        }
        return cfg


class SnakeVecEnv(VecEnv):
    """把 N 个 headless env 桥接为 SB3 VecEnv。

    - step：一次 bridge.step 批量推进全部 env（单次边界调用）
    - done 处理：按 rebuild_prob 重建 env（域随机化）后 reset，
      观察覆盖为新一局初始观察
    - 动作空间：relative（0 左转 / 1 直行 / 2 右转），Discrete(3)
    """

    def __init__(
        self,
        bridge: SnakeBridge,
        domain: DomainConfig,
        n_envs: int,
        seed: int = 0,
    ):
        w = bridge.window_size
        observation_space = gym.spaces.Dict(
            {
                "window": gym.spaces.Box(0.0, 1.0, shape=(w, w, 3), dtype=np.float32),
                "scalars": gym.spaces.Box(-1.0, 1.0, shape=(SCALAR_COUNT,), dtype=np.float32),
            }
        )
        super().__init__(n_envs, observation_space, gym.spaces.Discrete(3))
        self.bridge = bridge
        self.domain = domain
        self._rng = np.random.default_rng(seed)
        for _ in range(n_envs):
            self.bridge.create_env(self._sample_cfg())

    # ---- 内部工具 ----

    def _sample_cfg(self) -> dict:
        return self.domain.sample(self._rng, self.bridge.window_size)

    def _next_seed(self) -> int:
        return int(self._rng.integers(0, 2**31))

    # ---- VecEnv 接口 ----

    def reset(self) -> dict:
        w = self.bridge.window_size
        windows = np.empty((self.num_envs, w, w, 3), dtype=np.float32)
        scalars = np.empty((self.num_envs, SCALAR_COUNT), dtype=np.float32)
        for i in range(self.num_envs):
            windows[i], scalars[i] = self.bridge.reset_env(i, self._next_seed())
        return {"window": windows, "scalars": scalars}

    def step_async(self, actions: np.ndarray) -> None:
        self._actions = np.asarray(actions)

    def step_wait(self):
        result = self.bridge.step(self._actions)
        done_idx = np.nonzero(result.done)[0]
        infos: list[dict] = [{} for _ in range(self.num_envs)]
        for i in done_idx:
            # 域随机化：episode 边界按概率换一张地图（含尺寸）
            if self._rng.random() < self.domain.rebuild_prob:
                self.bridge.replace_env(i, self._sample_cfg())
            window, scalars = self.bridge.reset_env(i, self._next_seed())
            result.windows[i] = window
            result.scalars[i] = scalars
            infos[i] = {"score": int(result.scores[i])}
        obs = {"window": result.windows, "scalars": result.scalars}
        return obs, result.rewards, result.done, infos

    def close(self) -> None:
        self.bridge.close()

    def env_is_wrapped(self, indices=None, wrapper_class=...):
        return [False] * self.num_envs

    def env_method(self, method_name, *args, indices=None, **kwargs):
        return [None] * self.num_envs

    def get_attr(self, attr_name, indices=None):
        return [None] * self.num_envs

    def set_attr(self, attr_name, value, indices=None) -> None:
        return None
