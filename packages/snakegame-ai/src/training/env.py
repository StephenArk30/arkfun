"""SB3 兼容的向量化环境：一次边界调用批量 step + episode 边界域随机化。

VecEnv 语义（SB3 约定）：done 的 env 在同一次 step 返回中携带 reset 后的
新初始观察；episode 结束时按 rebuild_prob 重新采样地图配置（尺寸/障碍数/
初始蛇长），实现跨尺寸、跨障碍密度泛化训练。

done 的 env 在 info 中额外携带：
- ``episode``: {"r", "l", "t"}（Monitor 语义）→ SB3 自动记录
  ``rollout/ep_rew_mean`` / ``rollout/ep_len_mean``
- ``score``: 该局最终得分（吃到食物数）
- ``terminal_observation``: 终局观察（reset 覆盖前的观察）
- ``TimeLimit.truncated``: 是否因 maxSteps 截断 → SB3 据此对 timeout
  正确 bootstrap 值函数（见 SB3 on_policy_algorithm 的 GitHub issue #633）

可选食物距离势能塑形（shape_coef > 0 时启用）：为稀疏的食物奖励提供
密集的"靠近食物"梯度信号。
"""

from __future__ import annotations

import time
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


class FoodDistanceShaper:
    """食物距离势能塑形：每步 ``r += coef * (d_prev − d_new)``。

    d 为蛇头到食物的曼哈顿距离（格子数），由观察 scalars 前两维
    （foodDx / foodDy，分别按 col / row 归一化）与地图尺寸换算：

        d = |foodDx| * col + |foodDy| * row

    - γ=1 的简化势能塑形（常见实践）：靠近食物得正塑形、远离得负，
      不改变最优策略的排序（势能项逐局 telescoping），只为稀疏的
      +1 食物奖励提供密集梯度。
    - 吃到食物的一步 d_new 以刷新后的新食物位置计，塑形项含一次
      距离跳变噪声（势能函数只依赖状态，理论保证仍成立）。
    """

    def __init__(self, coef: float, n_envs: int):
        self.coef = coef
        self._prev_d = np.zeros(n_envs, dtype=np.float64)

    @staticmethod
    def distances(
        scalars: np.ndarray, cols: np.ndarray, rows: np.ndarray
    ) -> np.ndarray:
        """scalars (N, 11) → (N,) 曼哈顿距离（格子数）。"""
        return np.abs(scalars[:, 0]) * cols + np.abs(scalars[:, 1]) * rows

    def begin(self, i: int, scalars: np.ndarray, col: int, row: int) -> None:
        """单个 env 开始新 episode：锚定初始距离。"""
        self._prev_d[i] = abs(scalars[0]) * col + abs(scalars[1]) * row

    def begin_all(
        self, scalars: np.ndarray, cols: np.ndarray, rows: np.ndarray
    ) -> None:
        """全部 env 开始新 episode（VecEnv.reset 后调用）。"""
        self._prev_d = self.distances(scalars, cols, rows)

    def shape(
        self, scalars: np.ndarray, cols: np.ndarray, rows: np.ndarray
    ) -> np.ndarray:
        """返回塑形项 (N,) 并更新内部距离（终局转移同样参与）。"""
        d_new = self.distances(scalars, cols, rows)
        delta = self.coef * (self._prev_d - d_new)
        self._prev_d = d_new
        return delta


class SnakeVecEnv(VecEnv):
    """把 N 个 headless env 桥接为 SB3 VecEnv。

    - step：一次 bridge.step 批量推进全部 env（单次边界调用）
    - done 处理：按 rebuild_prob 重建 env（域随机化）后 reset，
      观察覆盖为新一局初始观察；info 携带 Monitor 统计、终局观察
      与截断标记（见模块 docstring）
    - 动作空间：relative（0 左转 / 1 直行 / 2 右转），Discrete(3)
    - shape_coef > 0 时启用食物距离势能塑形
    """

    def __init__(
        self,
        bridge: SnakeBridge,
        domain: DomainConfig,
        n_envs: int,
        seed: int = 0,
        shape_coef: float = 0.0,
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
        # Python 侧跟踪每个 env 的地图尺寸（塑形距离换算用）
        self._cols = np.zeros(n_envs, dtype=np.int64)
        self._rows = np.zeros(n_envs, dtype=np.int64)
        # Monitor 语义的 episode 统计
        self._ep_rewards = np.zeros(n_envs, dtype=np.float64)
        self._ep_lengths = np.zeros(n_envs, dtype=np.int64)
        self._t0 = time.time()
        self._shaper: FoodDistanceShaper | None = (
            FoodDistanceShaper(shape_coef, n_envs) if shape_coef else None
        )
        for i in range(n_envs):
            cfg = self._sample_cfg()
            self.bridge.create_env(cfg)
            self._cols[i] = cfg["col"]
            self._rows[i] = cfg["row"]

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
        self._ep_rewards[:] = 0.0
        self._ep_lengths[:] = 0
        if self._shaper is not None:
            self._shaper.begin_all(scalars, self._cols, self._rows)
        return {"window": windows, "scalars": scalars}

    def step_async(self, actions: np.ndarray) -> None:
        self._actions = np.asarray(actions)

    def step_wait(self):
        result = self.bridge.step(self._actions)
        # 势能塑形（新数组：不依赖 bridge 返回的 rewards 可写性）；
        # 终局转移同样参与（d_new 取终局观察中的食物位置）
        rewards = result.rewards
        if self._shaper is not None:
            rewards = rewards + self._shaper.shape(
                result.scalars, self._cols, self._rows
            )
        # episode 统计（含终局步的 reward）
        self._ep_rewards += rewards
        self._ep_lengths += 1

        done_idx = np.nonzero(result.done)[0]
        infos: list[dict] = [{} for _ in range(self.num_envs)]
        for i in done_idx:
            # 终局观察（reset 覆盖前捕获）：供 SB3 对 timeout 做 value bootstrap
            terminal = {
                "window": result.windows[i].copy(),
                "scalars": result.scalars[i].copy(),
            }
            # 域随机化：episode 边界按概率换一张地图（含尺寸）
            if self._rng.random() < self.domain.rebuild_prob:
                cfg = self._sample_cfg()
                self.bridge.replace_env(i, cfg)
                self._cols[i] = cfg["col"]
                self._rows[i] = cfg["row"]
            window, scalars = self.bridge.reset_env(i, self._next_seed())
            result.windows[i] = window
            result.scalars[i] = scalars
            infos[i] = {
                "score": int(result.scores[i]),
                "episode": {
                    "r": round(float(self._ep_rewards[i]), 6),
                    "l": int(self._ep_lengths[i]),
                    "t": round(time.time() - self._t0, 6),
                },
                "terminal_observation": terminal,
                "TimeLimit.truncated": bool(result.truncated[i]),
            }
            self._ep_rewards[i] = 0.0
            self._ep_lengths[i] = 0
            if self._shaper is not None:
                self._shaper.begin(i, scalars, self._cols[i], self._rows[i])
        obs = {"window": result.windows, "scalars": result.scalars}
        return obs, rewards, result.done, infos

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
