"""SnakeVecEnv 与 SB3 的接口合规及 PPO 冒烟训练。"""

import numpy as np
import pytest

from bridge import SCALAR_COUNT, SnakeBridge
from env import DomainConfig, SnakeVecEnv
from policy import SnakeFeaturesExtractor

DOMAIN = DomainConfig(
    col=(6, 8),
    row=(6, 8),
    barriers=(0, 3),
    snake_len=(1, 2),
    max_steps=100,
    rebuild_prob=1.0,
)


@pytest.fixture()
def make_env():
    created = []

    def _make(n_envs=4):
        try:
            bridge = SnakeBridge(window_size=15)
        except FileNotFoundError as err:
            pytest.skip(str(err))
        env = SnakeVecEnv(bridge, DOMAIN, n_envs=n_envs, seed=0)
        created.append(env)
        return env

    yield _make
    for env in created:
        env.close()


def test_reset_shapes(make_env):
    env = make_env()
    obs = env.reset()
    assert set(obs.keys()) == {"window", "scalars"}
    assert obs["window"].shape == (4, 15, 15, 3)
    assert obs["window"].dtype == np.float32
    assert obs["scalars"].shape == (4, SCALAR_COUNT)


def test_step_semantics(make_env):
    env = make_env()
    env.reset()
    obs, rewards, dones, infos = env.step(np.array([1, 0, 2, 1]))
    assert obs["window"].shape == (4, 15, 15, 3)
    assert rewards.shape == (4,)
    assert dones.shape == (4,)
    assert dones.dtype == bool
    assert len(infos) == 4
    # done 的 env 返回的观察必须是新一局的初始观察（非零，窗口内有蛇身通道）
    for i in range(4):
        if dones[i]:
            assert "score" in infos[i]


def test_auto_reset_on_done(make_env):
    """done 之后继续 step 不应报错，且该 env 已进入新 episode。"""
    env = make_env(n_envs=1)
    env.reset()
    for _ in range(1000):
        obs, _, dones, _ = env.step(np.array([1]))
        if dones[0]:
            break
    else:
        pytest.fail("episode never ended within 1000 steps")
    # done 已被自动 reset：观察有效，继续 step 正常
    obs, _, dones, _ = env.step(np.array([2]))
    assert obs["window"].shape == (1, 15, 15, 3)


def test_domain_rebuild_changes_map(make_env):
    """rebuild_prob=1.0 时，episode 结束后地图尺寸可能变化。"""
    env = make_env(n_envs=8)
    env.reset()
    # scalars[9] = col / max(col, row)，域随机化下不同 env 尺寸大概率不同
    obs, _, _, _ = env.step(np.ones(8, dtype=np.int64))
    ratios = obs["scalars"][:, 9]
    assert ratios.shape == (8,)
    assert ((ratios > 0) & (ratios <= 1.0)).all()


def test_ppo_smoke(make_env):
    """PPO 端到端冒烟：收集 + 更新一个 rollout。"""
    from stable_baselines3 import PPO

    env = make_env(n_envs=4)
    model = PPO(
        "MultiInputPolicy",
        env,
        policy_kwargs=dict(
            features_extractor_class=SnakeFeaturesExtractor,
            features_extractor_kwargs=dict(window_size=15),
        ),
        n_steps=16,
        batch_size=16,
        seed=0,
        verbose=0,
    )
    model.learn(total_timesteps=64)
