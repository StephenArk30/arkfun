import SnakeGameEnv from '../src/env';
import { SnakeDirection } from '../src/snake';
import { NodeType } from '../src/common';
import { cell, mockRandRange } from './helpers';

// P2 连通性检查：barrierPlacement 'reachable' 通过 BFS 保证食物落在蛇头可达的空格
describe('SnakeGameEnv barrierPlacement', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('keeps the default uniform placement untouched', () => {
    // 蛇头 (2,2)，食物 (3,2)：与障碍物无连通性约束
    mockRandRange(2, 2, 3, 2);
    const env = new SnakeGameEnv(null, {
      col: 5,
      row: 5,
      direction: SnakeDirection.RIGHT,
      barrierPlacement: 'uniform',
    });
    expect(env.food.toArray()).toEqual([3, 2]);
  });

  it('places food in the region reachable from the head', () => {
    // 5x3 地图：蛇头 (1,1)，第 3 列整列障碍 (3,0)(3,1)(3,2) 封死右侧。
    // 可达空格为 col 0-2 共 8 格（BFS 顺序：(1,0)(1,2)(0,1)(2,1)(0,0)(2,0)(0,2)(2,2)），
    // pick 抽到 0 → (1,0)
    mockRandRange(1, 1, 3, 0, 3, 1, 3, 2, 0);
    const env = new SnakeGameEnv(null, {
      col: 5,
      row: 3,
      direction: SnakeDirection.RIGHT,
      barriers: 3,
      barrierPlacement: 'reachable',
    });
    expect(env.barriers.map((b) => b.toArray()))
      .toEqual([[3, 0], [3, 1], [3, 2]]);
    // 食物必然落在可达区（col <= 2），这里抽到 (1,0)
    expect(env.food.toArray()).toEqual([1, 0]);
    expect(cell(env.map, 0, 1, 5)).toBe(NodeType.Food);
  });

  it('scans to the map border on a barrier-free corridor', () => {
    // 3x1 通道无障碍：蛇头 (0,0)，可达空格 (1,0)(2,0)，pick 抽到 1 → (2,0)
    mockRandRange(0, 0, 1);
    const env = new SnakeGameEnv(null, {
      col: 3,
      row: 1,
      direction: SnakeDirection.RIGHT,
      barrierPlacement: 'reachable',
    });
    expect(env.food.toArray()).toEqual([2, 0]);
  });

  it('falls back to uniform placement when no reachable empty cell exists', () => {
    // 3x1 地图：蛇头 (0,0)，唯一障碍 (1,0) 把蛇头封死在左侧，
    // 唯一空格 (2,0) 不可达 → 退回均匀随机并落在 (2,0)
    mockRandRange(0, 0, 1, 0, 2, 0);
    const env = new SnakeGameEnv(null, {
      col: 3,
      row: 1,
      direction: SnakeDirection.RIGHT,
      barriers: 1,
      barrierPlacement: 'reachable',
    });
    expect(env.barriers.map((b) => b.toArray())).toEqual([[1, 0]]);
    expect(env.food.toArray()).toEqual([2, 0]);
  });
});
