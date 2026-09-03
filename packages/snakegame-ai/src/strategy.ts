// 策略注册表：demo 按 id 选择策略（ONNX 模型 / 内置算法），后续新增
// 模型或算法只需 registerStrategy 一次，UI 与主循环零改动。
import {
  aStarSync, SnakeDirection, SnakeGameEnv, SnakeRelativeAction,
} from '@arkfun/snakegame';
import { createOnnxSnakePlayer } from './onnxPlayer';
import type { OnnxSnakePlayer, OrtLike } from './onnxPlayer';

// 策略每步拿到的上下文：模型策略只读 window/scalars；内置算法策略
// （如 A*）额外读 env 的完整状态（map/snake/food）与地图尺寸
export type StrategyContext = {
  env: SnakeGameEnv;
  window: Float32Array;
  scalars: Float32Array;
  col: number;
  row: number;
};

export type StrategyPlayer = (ctx: StrategyContext) => Promise<SnakeRelativeAction>;

export type Strategy = {
  id: string;
  label: string;
  // 加载可能失败（如模型文件缺失），失败时 demo 显示原因并保持当前策略
  load: () => Promise<StrategyPlayer>;
};

const strategies = new Map<string, Strategy>();

export const registerStrategy = (strategy: Strategy): void => {
  strategies.set(strategy.id, strategy);
};

export const listStrategies = (): Strategy[] => Array.from(strategies.values());

export const getStrategy = (id: string): Strategy | undefined => strategies.get(id);

// ---- 内置工厂 ----

// 方向换算（SnakeDirection 枚举非循环序，查表而非模运算），
// 与 snakegame snake.ts 的 relativeToAbsolute 互逆
const LEFT_OF: Record<SnakeDirection, SnakeDirection> = {
  [SnakeDirection.UP]: SnakeDirection.LEFT,
  [SnakeDirection.LEFT]: SnakeDirection.DOWN,
  [SnakeDirection.DOWN]: SnakeDirection.RIGHT,
  [SnakeDirection.RIGHT]: SnakeDirection.UP,
};

export const absoluteToRelative = (
  current: SnakeDirection,
  target: SnakeDirection,
): SnakeRelativeAction => {
  if (target === current) return SnakeRelativeAction.Forward;
  if (LEFT_OF[current] === target) return SnakeRelativeAction.TurnLeft;
  return SnakeRelativeAction.TurnRight;
};

export const createAStarPlayer = (): StrategyPlayer => (
  async ({ env, col, row }) => {
    const direction = aStarSync({
      type: 'full',
      map: env.map,
      col,
      row,
      snake: env.snake,
      food: env.food,
      barriers: env.barriers,
    });
    return absoluteToRelative(env.snake.getDirection(), direction);
  }
);

export const createOnnxPlayer = (
  player: OnnxSnakePlayer,
): StrategyPlayer => (
  async ({ window, scalars }) => player.act(window, scalars)
);

// ONNX 策略工厂：ort 运行时按需懒加载（demo 从 CDN 加载，测试 mock）
export const createOnnxStrategy = (
  id: string,
  label: string,
  ortLoader: () => Promise<OrtLike>,
  modelUrl: string,
  windowSize = 15,
): Strategy => ({
  id,
  label,
  load: async () => {
    const resp = await fetch(modelUrl);
    if (!resp.ok) throw new Error(`${modelUrl} HTTP ${resp.status}`);
    const buffer = await resp.arrayBuffer();
    const player = await createOnnxSnakePlayer(await ortLoader(), buffer, windowSize);
    return createOnnxPlayer(player);
  },
});

// A* 策略工厂：无外部依赖，load 永远成功
export const createAStarStrategy = (id: string, label: string): Strategy => ({
  id,
  label,
  load: async () => createAStarPlayer(),
});
