import SnakeGameEnv from '../src/env';
import { NodeType } from '../src/common';
import { SnakeDirection } from '../src/snake';
import { appendCanvas, cell, mockRandRange } from './helpers';

// genSnake 从不传 snakeLen，蛇初始长度恒为 1，因此「index === 0」为 false 的
// 分支（标记 SnakeBody）无法通过公开 API 触发。这里 mock Snake 使其默认带
// 一节蛇身，覆盖地图标记的完整逻辑。
jest.mock('../src/snake', () => {
  const actual = jest.requireActual('../src/snake');
  const OriginalSnake = actual.default;
  class SnakeWithBody extends OriginalSnake {
    constructor(config: any) {
      super({ ...config, snakeLen: 2 });
    }
  }
  // __esModule 不可枚举，spread 不会带上它，必须显式声明，
  // 否则 esModuleInterop 的 default 导入会拿到整个模块对象
  return { __esModule: true, ...actual, default: SnakeWithBody };
});

it('genSnake marks the head and body nodes on the map', () => {
  mockRandRange(2, 2, 3, 2);
  const env = new SnakeGameEnv(appendCanvas(), {
    col: 5,
    row: 5,
    direction: SnakeDirection.RIGHT,
  });
  // 蛇头 (2,2)，蛇身在运动方向的反方向 (1,2)
  expect(env.snake.length).toBe(2);
  expect(cell(env.map, 2, 2, 5)).toBe(NodeType.SnakeHead);
  expect(cell(env.map, 2, 1, 5)).toBe(NodeType.SnakeBody);
  expect(cell(env.map, 2, 3, 5)).toBe(NodeType.Food);
});
