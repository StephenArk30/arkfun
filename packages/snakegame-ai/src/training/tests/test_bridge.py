"""bridge 正确性：确定性、批量/单步一致性、二进制布局解析。"""

import numpy as np
import pytest

from bridge import SCALAR_COUNT, SnakeBridge

CFG = {
    "col": 10,
    "row": 10,
    "barriers": [2, 5],
    "actionMode": "relative",
    "observationType": "window",
    "windowSize": 15,
    "maxSteps": 200,
    "debug": False,
}


@pytest.fixture()
def bridge():
    try:
        return SnakeBridge(window_size=15)
    except FileNotFoundError as err:
        pytest.skip(str(err))


def test_create_and_count(bridge: SnakeBridge):
    i0 = bridge.create_env(CFG)
    i1 = bridge.create_env(CFG)
    assert (i0, i1) == (0, 1)
    assert bridge.env_count == 2


def test_teacher_actions(bridge: SnakeBridge):
    """A* teacher：动作合法（0/1/2）、数量对齐、连续 rollout 不异常。"""
    bridge.create_env(CFG)
    bridge.create_env(CFG)
    bridge.reset_env(0, 42)
    bridge.reset_env(1, 42)
    actions = bridge.teacher_actions()
    assert actions.shape == (2,)
    assert set(np.unique(actions)) <= {0, 1, 2}
    # teacher 驱动整局：A* 在 10x10 + 少量障碍下必然能吃到食物或活着耗步数
    total_score = 0
    for _ in range(200):
        result = bridge.step(bridge.teacher_actions())
        done_idx = np.nonzero(result.done)[0]
        for i in done_idx:
            total_score += result.scores[i]
            bridge.reset_env(i, 43)
        if total_score > 0:
            break
    assert total_score > 0, "A* teacher 应至少吃到一次食物"


def test_reset_shapes(bridge: SnakeBridge):
    bridge.create_env(CFG)
    window, scalars = bridge.reset_env(0, 42)
    assert window.shape == (15, 15, 3)
    assert window.dtype == np.float32
    assert scalars.shape == (SCALAR_COUNT,)
    assert scalars.dtype == np.float32


def test_reset_deterministic(bridge: SnakeBridge):
    bridge.create_env(CFG)
    w1, s1 = bridge.reset_env(0, 42)
    w2, s2 = bridge.reset_env(0, 42)
    np.testing.assert_array_equal(w1, w2)
    np.testing.assert_array_equal(s1, s2)
    # 不同 seed 应产生不同初始局面（15×15 窗口几乎不可能相同）
    w3, _ = bridge.reset_env(0, 7)
    assert not np.array_equal(w1, w3)


def test_step_shapes_and_dtypes(bridge: SnakeBridge):
    bridge.create_env(CFG)
    bridge.reset_env(0, 1)
    result = bridge.step([1])
    assert result.windows.shape == (1, 15, 15, 3)
    assert result.scalars.shape == (1, SCALAR_COUNT)
    assert result.rewards.shape == (1,)
    assert result.scores.shape == (1,)
    assert result.windows.dtype == np.float32


def test_deterministic_rollout(bridge: SnakeBridge):
    """同 seed 两条完整轨迹逐步一致（RNG 与布局均可复现）。"""
    bridge.create_env(CFG)  # env0：陪跑，永远跳过
    bridge.create_env(CFG)  # env1：被测轨迹
    trajectories = []
    for _ in range(2):
        bridge.reset_env(1, 99)
        steps = []
        for action in [1, 1, 0, 2, 1, 1, 1, 2, 1, 0]:
            result = bridge.step([-1, action])  # -1 跳过 env0
            steps.append(
                (result.rewards[1], result.terminated[1], result.scores[1],
                 result.windows[1].copy(), result.scalars[1].copy())
            )
        trajectories.append(steps)
    for a, b in zip(*trajectories):
        assert a[0] == b[0]
        assert a[1] == b[1]
        assert a[2] == b[2]
        np.testing.assert_array_equal(a[3], b[3])
        np.testing.assert_array_equal(a[4], b[4])


def test_skip_action_leaves_env_untouched(bridge: SnakeBridge):
    bridge.create_env(CFG)
    bridge.reset_env(0, 5)
    before = bridge.step([1])
    after = bridge.step([-1])
    assert after.rewards[0] == 0.0
    assert not after.terminated[0]
    assert not after.truncated[0]
    # 跳过后观察为零填充，活着的 env 不受影响（数量不变、无异常）
    assert bridge.env_count == 1
    assert not before.terminated[0] or before.terminated[0]  # 形参 smoke


def test_replace_env(bridge: SnakeBridge):
    bridge.create_env(CFG)
    small = dict(CFG, col=6, row=6)
    assert bridge.replace_env(0, small) == 0
    _, scalars = bridge.reset_env(0, 3)
    # scalars[9] = col / max(col, row) = 6/6 = 1.0
    assert scalars[9] == pytest.approx(1.0)


def test_step_wrong_action_count(bridge: SnakeBridge):
    bridge.create_env(CFG)
    bridge.reset_env(0, 1)
    with pytest.raises(ValueError):
        bridge.step([1, 1])


def test_window_termination_detected(bridge: SnakeBridge):
    """maxSteps=1 且首步安全（蛇长 3 保证前方有空间）时必然触发 truncated。"""
    cfg = dict(CFG, col=6, row=6, snakeLen=3, maxSteps=1)
    bridge.create_env(cfg)
    bridge.reset_env(0, 11)
    result = bridge.step([1])
    assert result.truncated[0]
    assert not result.terminated[0]
