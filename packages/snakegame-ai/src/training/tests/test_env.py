"""SnakeVecEnv 与 SB3 的接口合规及 PPO 冒烟训练。"""

import numpy as np
import pytest

from bridge import SCALAR_COUNT, SnakeBridge
from env import DomainConfig, FoodDistanceShaper, SnakeVecEnv
from policy import SnakeFeaturesExtractor

DOMAIN = DomainConfig(
    col=(6, 8),
    row=(6, 8),
    barriers=(0, 3),
    snake_len=(1, 2),
    max_steps=100,
    rebuild_prob=1.0,
)

# max_steps=3：让 timeout 截断成为最常见的 episode 结束方式
TINY_DOMAIN = DomainConfig(
    col=(6, 8),
    row=(6, 8),
    barriers=(0, 3),
    snake_len=(1, 2),
    max_steps=3,
    rebuild_prob=1.0,
)


@pytest.fixture()
def make_env():
    created = []

    def _make(n_envs=4, domain=DOMAIN, shape_coef=0.0):
        try:
            bridge = SnakeBridge(window_size=15)
        except FileNotFoundError as err:
            pytest.skip(str(err))
        env = SnakeVecEnv(
            bridge, domain, n_envs=n_envs, seed=0, shape_coef=shape_coef
        )
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


def test_episode_info_protocol(make_env):
    """done 的 info 必须携带 Monitor 统计（episode r/l/t）与 score。"""
    env = make_env(n_envs=4)
    env.reset()
    done_info = None
    for _ in range(300):
        _, _, dones, infos = env.step(np.array([1, 0, 2, 1]))
        for i in range(4):
            if dones[i]:
                done_info = infos[i]
                break
        if done_info is not None:
            break
    assert done_info is not None, "episode never ended within 300 steps"
    assert isinstance(done_info["score"], int)
    ep = done_info["episode"]
    assert np.isfinite(ep["r"])
    assert isinstance(ep["l"], int) and ep["l"] >= 1
    assert ep["t"] >= 0.0


def test_truncation_bootstrap_info(make_env):
    """timeout 截断：done 时带 terminal_observation 且 TimeLimit.truncated=True。

    SB3 依赖这两个 info 键对超时 episode 做 value bootstrap
    （on_policy_algorithm GitHub issue #633）；缺失时超时会被当成
    真 terminal，"熬到超时"变成逃避未来负奖励的手段。
    """
    env = make_env(n_envs=4, domain=TINY_DOMAIN)
    env.reset()
    saw_truncated = False
    for _ in range(20):
        _, _, dones, infos = env.step(np.array([1, 1, 1, 1]))
        for i in range(4):
            if not dones[i]:
                continue
            info = infos[i]
            assert "terminal_observation" in info
            terminal = info["terminal_observation"]
            assert terminal["window"].shape == (15, 15, 3)
            assert terminal["scalars"].shape == (SCALAR_COUNT,)
            assert isinstance(info["TimeLimit.truncated"], bool)
            if info["TimeLimit.truncated"]:
                saw_truncated = True
                assert info["episode"]["l"] == 3
        if saw_truncated:
            break
    assert saw_truncated, "no truncation observed with max_steps=3 envs"


def test_death_is_not_truncated(make_env):
    """死亡/胜利终止（非超时）：TimeLimit.truncated=False，但仍带终局观察。"""
    env = make_env(n_envs=8)
    env.reset()
    saw_terminated = False
    for _ in range(300):
        _, _, dones, infos = env.step(np.ones(8, dtype=np.int64))
        for i in range(8):
            if dones[i] and not infos[i]["TimeLimit.truncated"]:
                saw_terminated = True
                assert "terminal_observation" in infos[i]
                assert infos[i]["episode"]["l"] <= 100
        if saw_terminated:
            break
    assert saw_terminated, "no true termination observed within 300 steps"


def test_food_distance_shaper_unit():
    """距离递减 → 正塑形；递增 → 负塑形（系数与距离差成比例）。"""
    shaper = FoodDistanceShaper(coef=0.1, n_envs=1)
    cols = np.array([10])
    rows = np.array([10])

    def scalars_with(dx: float) -> np.ndarray:
        s = np.zeros((1, 11), dtype=np.float32)
        s[0, 0] = dx
        return s

    shaper.begin_all(scalars_with(0.5), cols, rows)  # d = 5
    # 靠近：d: 5 → 3，delta = 0.1 * (5 − 3) = 0.2
    assert shaper.shape(scalars_with(0.3), cols, rows)[0] == pytest.approx(0.2)
    # 远离：d: 3 → 6，delta = 0.1 * (3 − 6) = −0.3
    assert shaper.shape(scalars_with(0.6), cols, rows)[0] == pytest.approx(-0.3)


def test_shaping_rewards(make_env):
    """同 seed 下三条轨迹完全一致：coef=0 与未启用塑形逐位相同，coef>0 改变奖励。"""
    env_plain = make_env(n_envs=2)
    env_zero = make_env(n_envs=2, shape_coef=0.0)
    env_shaped = make_env(n_envs=2, shape_coef=0.1)
    o_plain = env_plain.reset()
    o_zero = env_zero.reset()
    o_shaped = env_shaped.reset()
    assert np.array_equal(o_plain["scalars"], o_zero["scalars"])
    assert np.array_equal(o_plain["scalars"], o_shaped["scalars"])

    for _ in range(20):
        actions = np.array([1, 2])
        _, r_plain, d_plain, _ = env_plain.step(actions)
        _, r_zero, d_zero, _ = env_zero.step(actions)
        _, r_shaped, d_shaped, _ = env_shaped.step(actions)
        assert (d_plain == d_zero).all() and (d_plain == d_shaped).all()
        assert np.array_equal(r_plain, r_zero)
        # 每步移动都会改变曼哈顿距离（±1 格），塑形项必非零
        assert not np.allclose(r_plain, r_shaped)
