import '../src/types';
import '../src/snakeAI/common';
import * as snakegame from '../src';

it('re-exports the public API', () => {
  expect(snakegame.SnakeGameEnv).toBeDefined();
  expect(snakegame.PlaySnakeGame).toBeInstanceOf(Function);
  expect(snakegame.PlaySnakeGameHuman).toBeInstanceOf(Function);

  // 观察编码
  expect(snakegame.printMap).toBeInstanceOf(Function);
  expect(snakegame.buildWindowObservation).toBeInstanceOf(Function);
  expect(snakegame.buildRayObservation).toBeInstanceOf(Function);
  expect(snakegame.buildScalars).toBeInstanceOf(Function);
  expect(Array.isArray(snakegame.RAY_DIRECTIONS)).toBe(true);
  expect(snakegame.RAY_FEATURES).toBe(4);
  expect(snakegame.SCALAR_COUNT).toBe(11);
  expect(snakegame.WINDOW_CHANNELS).toBe(3);

  // 蛇与动作
  expect(snakegame.Snake).toBeInstanceOf(Function);
  expect(snakegame.DirectionDelta).toBeDefined();
  expect(snakegame.opposite).toBeInstanceOf(Function);
  expect(snakegame.relativeToAbsolute).toBeInstanceOf(Function);
  expect(snakegame.SnakeDirection).toBeDefined();
  expect(snakegame.SnakeRelativeAction).toBeDefined();
});
