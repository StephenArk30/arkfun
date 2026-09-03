"""PyMiniRacer 桥接层：在 Python 进程内嵌入 V8 运行 @arkfun/snakegame 无头环境。

设计要点：
- 单引擎实例多 env：所有 SnakeGameEnv(null, ...) 生活在同一个 V8 isolate 内，
  彼此独立（各持 map/snake/barriers），无共享状态。
- 批量二进制传输：step 全量批量为一次 Python↔JS 边界调用，观察/奖励以
  ArrayBuffer(->bytes) 返回，numpy 直接 frombuffer 零拷贝解析。
- 观察统一为 window 模式（尺寸无关，NHWC），与浏览器 demo 侧共用
  snakegame 同一份 observation.ts 编码，训练-推理零漂移。

使用前需构建 JS 包：
    npx lerna run build --scope=@arkfun/snakegame
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from py_mini_racer import MiniRacer

# 与 snakegame src/observation.ts 的 SCALAR_COUNT 对齐
SCALAR_COUNT = 11

DEFAULT_WINDOW_SIZE = 15


def find_bundle() -> Path:
    """定位 packages/snakegame/dist/index.cjs（从本文件向上找仓库根）。"""
    here = Path(__file__).resolve()
    for parent in here.parents:
        candidate = parent / "packages" / "snakegame" / "dist" / "index.cjs"
        if candidate.exists():
            return candidate
    raise FileNotFoundError(
        "packages/snakegame/dist/index.cjs not found; "
        "run `npx lerna run build --scope=@arkfun/snakegame` first"
    )


# 注入 V8 的批量 helper。{{BUNDLE}} 处替换为 snakegame 的 CJS 产物。
JS_HELPERS = r"""
var module = { exports: {} };
var exports = module.exports;
{{BUNDLE}}
var SDK = module.exports;

var envs = [];
var W = {{WINDOW_SIZE}};
var SC = 11;
var WC = W * W * 3;

// MiniRacer 的 call() 返回值不做 ArrayBuffer 转换（eval 才做），
// 因此批量结果先存全局 _lastBuffer，Python 侧 call 执行后 eval 取回。
var _lastBuffer = null;

function jsEnvCount() { return envs.length; }

// headless 创建一个 env，返回其下标
function jsCreateEnv(cfgJson) {
  envs.push(new SDK.SnakeGameEnv(null, JSON.parse(cfgJson)));
  return envs.length - 1;
}

// 原位替换（域随机化：episode 结束时重采样地图尺寸/障碍配置）
function jsReplaceEnv(i, cfgJson) {
  envs[i] = new SDK.SnakeGameEnv(null, JSON.parse(cfgJson));
  return i;
}

// 重置单个 env，初始观察写入 _lastBuffer：[window(WC) | scalars(SC)] float32
function jsResetEnv(i, seed) {
  var obs = envs[i].reset(seed).observation;
  var buf = new ArrayBuffer((WC + SC) * 4);
  var f32 = new Float32Array(buf);
  f32.set(obs.window, 0);
  f32.set(obs.scalars, WC);
  _lastBuffer = buf;
  return 0;
}

// 批量推进所有 env（actions[i] < 0 表示跳过该 env，返回零值——eval 专用，
// 训练侧 VecEnv 语义保证 done 的 env 在下一 step 前已被 reset）。
// ArrayBuffer 布局（float32 段在前保证 4 字节对齐）：
//   float32 按环境交错：[window(WC) | scalars(SC) | reward(1)] × N
//   int32:  [score(N)]
//   uint8:  [terminated(N) | truncated(N)]
function jsStepBatch(actions) {
  var n = envs.length;
  var stride = WC + SC + 1;
  var f32Count = n * stride;
  var buf = new ArrayBuffer(f32Count * 4 + n * 4 + n * 2);
  var f32 = new Float32Array(buf, 0, f32Count);
  var i32 = new Int32Array(buf, f32Count * 4, n);
  var u8 = new Uint8Array(buf, f32Count * 4 + n * 4, n * 2);
  for (var i = 0; i < n; i += 1) {
    if (actions[i] < 0) continue;
    var out = envs[i].step(actions[i]);
    var base = i * stride;
    f32.set(out.observation.window, base);
    f32.set(out.observation.scalars, base + WC);
    f32[base + WC + SC] = out.reward;
    i32[i] = out.info.score;
    u8[i] = out.terminated ? 1 : 0;
    u8[n + i] = out.truncated ? 1 : 0;
  }
  _lastBuffer = buf;
  return 0;
}

// ===== A* teacher（模仿学习数据生成 / 评估 baseline）=====
// SnakeDirection 枚举 UP=0 DOWN=1 LEFT=2 RIGHT=3 为非循环序（DOWN/LEFT 交叉），
// 逆时针换算需查表，不能做模 4 算术
var LEFT_OF = {};
LEFT_OF[0] = 2; // UP    -> LEFT
LEFT_OF[2] = 1; // LEFT  -> DOWN
LEFT_OF[1] = 3; // DOWN  -> RIGHT
LEFT_OF[3] = 0; // RIGHT -> UP

// absoluteToRelative: 与 snake.ts 的 relativeToAbsolute 互逆。
// aStarSync 只会返回 {当前方向, 左, 右}（内部已排除反向），转换安全。
function absoluteToRelative(current, target) {
  if (target === current) return 1;          // Forward
  if (LEFT_OF[current] === target) return 0; // TurnLeft
  return 2;                                  // TurnRight
}

// 为每个 env 的当前状态求 A* 老师动作（relative 编码，可直达 step）
function jsTeacherActions() {
  var out = [];
  for (var i = 0; i < envs.length; i += 1) {
    var e = envs[i];
    var obs = {
      type: 'full',
      map: e.map,
      col: e.config.col,
      row: e.config.row,
      snake: e.snake,
      food: e.food,
      barriers: e.barriers,
    };
    var dir = SDK.aStarSync(obs);
    out.push(absoluteToRelative(e.snake.getDirection(), dir));
  }
  return out;
}
"""


@dataclass
class StepResult:
    """一次批量 step 的解析结果（按 env 维度对齐）。"""

    windows: np.ndarray  # (N, W, W, 3) float32 NHWC
    scalars: np.ndarray  # (N, 11) float32
    rewards: np.ndarray  # (N,) float32
    scores: np.ndarray  # (N,) int32（终局时刻即该局最终得分）
    terminated: np.ndarray  # (N,) bool
    truncated: np.ndarray  # (N,) bool

    @property
    def done(self) -> np.ndarray:
        return self.terminated | self.truncated


class SnakeBridge:
    """单 V8 isolate 承载 N 个 headless env，二进制批量通信。"""

    def __init__(self, window_size: int = DEFAULT_WINDOW_SIZE, bundle_path: Path | None = None):
        self.window_size = window_size if window_size % 2 == 1 else window_size + 1
        self.wc = self.window_size * self.window_size * 3
        self._ctx = MiniRacer()
        bundle = (bundle_path or find_bundle()).read_text(encoding="utf-8")
        helpers = (
            JS_HELPERS
            .replace("{{BUNDLE}}", bundle)
            .replace("{{WINDOW_SIZE}}", str(self.window_size))
        )
        self._ctx.eval(helpers)

    @property
    def env_count(self) -> int:
        return int(self._ctx.call("jsEnvCount"))

    def create_env(self, config: dict) -> int:
        """headless 创建 env，返回下标。config 见 snakegame SnakeGameConfig。"""
        return int(self._ctx.call("jsCreateEnv", json.dumps(config)))

    def replace_env(self, index: int, config: dict) -> int:
        """原位替换 env（新配置立即生效），返回下标。"""
        # index 可能是 np.int64（np.nonzero 产物），MiniRacer.call 内部会
        # 对参数做 JSON 序列化，numpy 标量必须先转原生 int
        return int(self._ctx.call("jsReplaceEnv", int(index), json.dumps(config)))

    def reset_env(self, index: int, seed: int) -> tuple[np.ndarray, np.ndarray]:
        """重置单个 env，返回 (window (W,W,3) float32, scalars (11,) float32)。"""
        self._ctx.call("jsResetEnv", int(index), int(seed))
        buf = self._bytes(self._ctx.eval("_lastBuffer"))
        arr = np.frombuffer(buf, dtype=np.float32)
        window = arr[: self.wc].reshape(self.window_size, self.window_size, 3).copy()
        scalars = arr[self.wc : self.wc + SCALAR_COUNT].copy()
        return window, scalars

    def step(self, actions) -> StepResult:
        """批量推进所有 env。actions[i] < 0 跳过 env i（观察/奖励为零值）。"""
        n = self.env_count
        if len(actions) != n:
            raise ValueError(f"expected {n} actions, got {len(actions)}")
        self._ctx.call("jsStepBatch", [int(a) for a in actions])
        buf = self._bytes(self._ctx.eval("_lastBuffer"))
        stride = self.wc + SCALAR_COUNT + 1
        f32 = np.frombuffer(buf, dtype=np.float32, count=n * stride)
        records = f32.reshape(n, stride)
        # np.array 显式拷贝：frombuffer 视图只读，VecEnv 需要在 episode 边界
        # 覆盖 done env 的观察；rewards 保持零拷贝（下游只读）
        windows = np.array(records[:, : self.wc]).reshape(
            n, self.window_size, self.window_size, 3
        )
        scalars = np.array(records[:, self.wc : self.wc + SCALAR_COUNT])
        rewards = np.ascontiguousarray(records[:, -1])
        offset = n * stride * 4
        scores = np.frombuffer(buf, dtype=np.int32, count=n, offset=offset).copy()
        u8 = np.frombuffer(buf, dtype=np.uint8, count=2 * n, offset=offset + n * 4)
        return StepResult(
            windows=windows,
            scalars=scalars,
            rewards=rewards,
            scores=scores,
            terminated=u8[:n].astype(bool),
            truncated=u8[n:].astype(bool),
        )

    def teacher_actions(self) -> np.ndarray:
        """A* 老师为每个 env 的当前状态给出相对动作，(N,) int64。

        模仿学习数据生成与 A* baseline 评估共用；done 的 env 返回值无意义，
        调用方负责先 reset。
        """
        return np.asarray(self._ctx.call("jsTeacherActions"), dtype=np.int64)

    def close(self) -> None:
        self._ctx.close()

    @staticmethod
    def _bytes(value) -> bytes:
        if not isinstance(value, (bytes, bytearray, memoryview)):
            raise TypeError(
                f"MiniRacer returned {type(value)!r} instead of bytes; "
                "JS↔Python ArrayBuffer conversion requires mini-racer >= 0.12"
            )
        return bytes(value)
