import SnakeGameEnv from '../src/env';
import {
  relativeToAbsolute,
  SnakeDirection,
  SnakeRelativeAction,
} from '../src/snake';
import { appendCanvas, mockRandRange } from './helpers';

describe('relativeToAbsolute', () => {
  it('maps forward to the current heading', () => {
    expect(relativeToAbsolute(SnakeDirection.UP, SnakeRelativeAction.Forward))
      .toBe(SnakeDirection.UP);
    expect(relativeToAbsolute(SnakeDirection.RIGHT, SnakeRelativeAction.Forward))
      .toBe(SnakeDirection.RIGHT);
  });

  it('turns left counter-clockwise and right clockwise for every heading', () => {
    const { TurnLeft, TurnRight } = SnakeRelativeAction;
    expect(relativeToAbsolute(SnakeDirection.UP, TurnLeft)).toBe(SnakeDirection.LEFT);
    expect(relativeToAbsolute(SnakeDirection.LEFT, TurnLeft)).toBe(SnakeDirection.DOWN);
    expect(relativeToAbsolute(SnakeDirection.DOWN, TurnLeft)).toBe(SnakeDirection.RIGHT);
    expect(relativeToAbsolute(SnakeDirection.RIGHT, TurnLeft)).toBe(SnakeDirection.UP);
    expect(relativeToAbsolute(SnakeDirection.UP, TurnRight)).toBe(SnakeDirection.RIGHT);
    expect(relativeToAbsolute(SnakeDirection.RIGHT, TurnRight)).toBe(SnakeDirection.DOWN);
    expect(relativeToAbsolute(SnakeDirection.DOWN, TurnRight)).toBe(SnakeDirection.LEFT);
    expect(relativeToAbsolute(SnakeDirection.LEFT, TurnRight)).toBe(SnakeDirection.UP);
  });

  it('returns the input itself for an unknown direction', () => {
    expect(relativeToAbsolute(42 as SnakeDirection, SnakeRelativeAction.TurnLeft))
      .toBe(42);
  });
});

describe('SnakeGameEnv action modes', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('executes relative actions from the current heading without illegal replacement', () => {
    // 蛇头 (2,2)、食物 (0,0)
    mockRandRange(2, 2, 0, 0);
    const env = new SnakeGameEnv(appendCanvas(), {
      col: 5,
      row: 5,
      direction: SnakeDirection.RIGHT,
      actionMode: 'relative',
    });

    // 右转：朝向 RIGHT → DOWN（顺时针），蛇头下移到 (2,3)
    env.step(SnakeRelativeAction.TurnRight);
    expect(env.snake.head.toArray()).toEqual([2, 3]);
    expect(env.snake.getDirection()).toBe(SnakeDirection.DOWN);

    // 左转：朝向 DOWN → RIGHT，蛇头右移到 (3,3)
    env.step(SnakeRelativeAction.TurnLeft);
    expect(env.snake.head.toArray()).toEqual([3, 3]);
    expect(env.snake.getDirection()).toBe(SnakeDirection.RIGHT);

    // 直行：保持 RIGHT，蛇头右移到 (4,3)
    env.step(SnakeRelativeAction.Forward);
    expect(env.snake.head.toArray()).toEqual([4, 3]);
    expect(env.snake.getDirection()).toBe(SnakeDirection.RIGHT);
  });

  it('applies the illegal reward in penalty mode but still moves forward', () => {
    // 蛇头 (2,2)、食物 (3,2)、新食物 (1,1)
    mockRandRange(2, 2, 3, 2, 1, 1);
    const env = new SnakeGameEnv(appendCanvas(), {
      col: 5,
      row: 5,
      direction: SnakeDirection.RIGHT,
      illegalAction: 'penalty',
      illegalReward: -0.5,
    });

    // 反向输入 LEFT 被替换为 RIGHT：吃到食物，奖励 = food + illegal
    const res = env.step(SnakeDirection.LEFT);
    expect(res.reward).toBeCloseTo(0.5);
    expect(env.snake.head.toArray()).toEqual([3, 2]);
    expect(env.snake.getDirection()).toBe(SnakeDirection.RIGHT);
  });

  it('keeps the ignore semantics by default for opposite inputs', () => {
    // 蛇头 (2,2)、食物 (3,2)、新食物 (1,1)
    mockRandRange(2, 2, 3, 2, 1, 1);
    const env = new SnakeGameEnv(appendCanvas(), {
      col: 5,
      row: 5,
      direction: SnakeDirection.RIGHT,
    });

    const res = env.step(SnakeDirection.LEFT);
    expect(res.reward).toBe(1); // 吃到食物，无非法动作惩罚
    expect(env.snake.getDirection()).toBe(SnakeDirection.RIGHT);
  });
});
