import SnakeGameEnv from '../src/env';
import { SnakeDirection } from '../src/snake';
import { NodeType } from '../src/common';
import { cell, mockRandRange } from './helpers';

// P1 初始蛇长：固定值 / [min, max] 随机 / 上限钳制，且整条蛇落在界内
describe('SnakeGameEnv snakeLen', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('grows a straight snake behind the head along the opposite direction', () => {
    // direction RIGHT，蛇身向左排布；col ∈ [2,4]，抽到 4，row 抽到 2，食物 (0,0)
    mockRandRange(4, 2, 0, 0);
    const env = new SnakeGameEnv(null, {
      col: 5,
      row: 5,
      direction: SnakeDirection.RIGHT,
      snakeLen: 3,
    });

    expect(env.snake.length).toBe(3);
    expect(env.snake.head.toArray()).toEqual([4, 2]);
    expect(env.snake.nodes.map((n) => n.toArray())).toEqual([[4, 2], [3, 2], [2, 2]]);
    expect(cell(env.map, 2, 4, 5)).toBe(NodeType.SnakeHead);
    expect(cell(env.map, 2, 3, 5)).toBe(NodeType.SnakeBody);
    expect(cell(env.map, 2, 2, 5)).toBe(NodeType.SnakeBody);
    // 食物落在蛇身之外
    expect(env.food.toArray()).toEqual([0, 0]);
  });

  it('draws a random length within [min, max]', () => {
    // 长度抽到 3，col ∈ [2,4] 抽到 4，row 抽到 2，食物 (0,0)
    mockRandRange(3, 4, 2, 0, 0);
    const env = new SnakeGameEnv(null, {
      col: 5,
      row: 5,
      direction: SnakeDirection.RIGHT,
      snakeLen: [2, 4],
    });
    expect(env.snake.length).toBe(3);
    expect(env.snake.head.toArray()).toEqual([4, 2]);
  });

  it('normalises a reversed [min, max] range', () => {
    // [4, 2] 视作 [2, 4]，长度抽到 2，col ∈ [1,4] 抽到 2，row 抽到 2
    mockRandRange(2, 2, 2, 3, 3);
    const env = new SnakeGameEnv(null, {
      col: 5,
      row: 5,
      direction: SnakeDirection.RIGHT,
      snakeLen: [4, 2],
    });
    expect(env.snake.length).toBe(2);
    expect(env.snake.head.toArray()).toEqual([2, 2]);
    expect(env.food.toArray()).toEqual([3, 3]);
  });

  it('clamps the length to the shorter map side', () => {
    // 5x5 地图上 100 长的蛇被钳制为 5：col 强制为 4，row 抽到 2
    mockRandRange(4, 2, 3, 3);
    const env = new SnakeGameEnv(null, {
      col: 5,
      row: 5,
      direction: SnakeDirection.RIGHT,
      snakeLen: 100,
    });
    expect(env.snake.length).toBe(5);
    expect(env.snake.nodes.map((n) => n.toArray()))
      .toEqual([[4, 2], [3, 2], [2, 2], [1, 2], [0, 2]]);
  });

  it('clamps a non-positive length to 1', () => {
    mockRandRange(2, 2, 3, 3);
    const env = new SnakeGameEnv(null, {
      col: 5,
      row: 5,
      direction: SnakeDirection.RIGHT,
      snakeLen: 0,
    });
    expect(env.snake.length).toBe(1);
  });

  it('places vertical snakes within bounds for every heading', () => {
    // DOWN：蛇身在上方，row ∈ [len-1, 4]；长度 3 → row ∈ [2,4]，抽到 3；col 抽到 1；食物 (4,4)
    mockRandRange(1, 3, 4, 4);
    const env = new SnakeGameEnv(null, {
      col: 5,
      row: 5,
      direction: SnakeDirection.DOWN,
      snakeLen: 3,
    });
    expect(env.snake.nodes.map((n) => n.toArray()))
      .toEqual([[1, 3], [1, 2], [1, 1]]);
    // 食物 (4,4) 在界内且不与蛇重叠
    expect(env.food.toArray()).toEqual([4, 4]);
  });
});
