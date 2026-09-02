import SnakeGameEnv from '../src/env';
import { NodeType } from '../src/common';
import { SnakeDirection } from '../src/snake';
import { appendCanvas, mockRandRange } from './helpers';

describe('SnakeGameEnv barriers', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('generates a fixed number of barriers avoiding the snake', () => {
    // 蛇头 (2,2)，障碍物 (0,0)、(4,4)，食物 (3,3)
    mockRandRange(2, 2, 0, 0, 4, 4, 3, 3);
    const env = new SnakeGameEnv(appendCanvas(), {
      col: 5,
      row: 5,
      barriers: 2,
      direction: SnakeDirection.RIGHT,
    });
    expect(env.barriers).toHaveLength(2);
    expect(env.barriers[0].toArray()).toEqual([0, 0]);
    expect(env.barriers[1].toArray()).toEqual([4, 4]);
    expect(env.map[0][0]).toBe(NodeType.Barrier);
    expect(env.map[4][4]).toBe(NodeType.Barrier);
    expect(env.food.toArray()).toEqual([3, 3]);
  });

  it('generates a random number of barriers within [min, max]', () => {
    // 数量抽到 3，障碍物 (0,0)、(4,4)、(1,1)，食物 (3,3)
    mockRandRange(2, 2, 3, 0, 0, 4, 4, 1, 1, 3, 3);
    const env = new SnakeGameEnv(appendCanvas(), {
      col: 5,
      row: 5,
      barriers: [2, 4],
      direction: SnakeDirection.RIGHT,
    });
    expect(env.barriers).toHaveLength(3);
    expect(env.map[0][0]).toBe(NodeType.Barrier);
    expect(env.map[4][4]).toBe(NodeType.Barrier);
    expect(env.map[1][1]).toBe(NodeType.Barrier);
    expect(env.food.toArray()).toEqual([3, 3]);
  });

  it('normalises a reversed [min, max] range', () => {
    // [4, 2] 视作 [2, 4]，数量抽到 2
    mockRandRange(2, 2, 2, 0, 0, 4, 4, 3, 3);
    const env = new SnakeGameEnv(appendCanvas(), {
      col: 5,
      row: 5,
      barriers: [4, 2],
      direction: SnakeDirection.RIGHT,
    });
    expect(env.barriers).toHaveLength(2);
  });

  it('generates no barriers when configured as 0', () => {
    mockRandRange(2, 2, 3, 3);
    const env = new SnakeGameEnv(appendCanvas(), { col: 5, row: 5, barriers: 0 });
    expect(env.barriers).toHaveLength(0);
    expect(env.map.flat().filter((t) => t === NodeType.Barrier)).toHaveLength(0);
  });

  it('clamps the barrier count to the available free cells', () => {
    const env = new SnakeGameEnv(appendCanvas(), { col: 5, row: 5, barriers: 100 });
    // 25 格 - 蛇(1) - 食物(1) = 23
    expect(env.barriers).toHaveLength(23);
    expect(env.map.flat().filter((t) => t === NodeType.Barrier)).toHaveLength(23);
    expect(env.map.flat().filter((t) => t === NodeType.Empty)).toHaveLength(0);
  });

  it('retries food placement when the candidate cell is a barrier', () => {
    // 障碍物 (3,2)，食物先抽中 (3,2) 被占，重试后落在 (1,1)
    mockRandRange(2, 2, 3, 2, 3, 2, 1, 1);
    const env = new SnakeGameEnv(appendCanvas(), {
      col: 5,
      row: 5,
      barriers: 1,
      direction: SnakeDirection.RIGHT,
    });
    expect(env.map[2][3]).toBe(NodeType.Barrier);
    expect(env.food.toArray()).toEqual([1, 1]);
    expect(env.map[1][1]).toBe(NodeType.Food);
  });

  it('ends the game when the snake head hits a barrier', () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    // 障碍物 (3,2) 位于蛇头 (2,2) 右侧，食物 (1,1)
    mockRandRange(2, 2, 3, 2, 1, 1);
    const env = new SnakeGameEnv(appendCanvas(), {
      col: 5,
      row: 5,
      barriers: 1,
      direction: SnakeDirection.RIGHT,
      debug: true,
    });
    const res = env.step(SnakeDirection.RIGHT);
    expect(res.done).toBe(true);
    expect(logSpy).toHaveBeenCalledWith('game over!', 0);
  });

  it('render draws barriers as grid cells', () => {
    mockRandRange(2, 2, 0, 0, 4, 4, 3, 3);
    const env = new SnakeGameEnv(appendCanvas(), { col: 5, row: 5, barriers: 2 });
    const ctx = env.ctx as any;
    env.render();
    // 蛇(1格) + 障碍物(2格)
    expect(ctx.rect).toHaveBeenCalledTimes(3);
    expect(ctx.fill).toHaveBeenCalled();
  });

  it('exposes barriers in the observation', () => {
    mockRandRange(2, 2, 0, 0, 4, 4, 3, 3);
    const env = new SnakeGameEnv(appendCanvas(), { col: 5, row: 5, barriers: 2 });
    // reset 后：蛇头 (2,2)，障碍物 (0,0)、(4,4)，食物 (3,3)
    jest.restoreAllMocks();
    mockRandRange(2, 2, 0, 0, 4, 4, 3, 3, 1, 1);
    expect(env.reset().observation.barriers).toBe(env.barriers);
  });

  it('reset regenerates a random number of barriers each time', () => {
    // 第一次数量抽到 1（障碍物 (0,0)），食物 (3,3)
    mockRandRange(2, 2, 1, 0, 0, 3, 3);
    const env = new SnakeGameEnv(appendCanvas(), {
      col: 5,
      row: 5,
      barriers: [1, 3],
      direction: SnakeDirection.RIGHT,
    });
    expect(env.barriers).toHaveLength(1);
    // reset 后数量抽到 2：蛇头 (2,2)，障碍物 (4,4)、(3,3)，食物 (1,1)
    jest.restoreAllMocks();
    mockRandRange(2, 2, 2, 4, 4, 3, 3, 1, 1);
    env.reset();
    expect(env.barriers).toHaveLength(2);
    expect(env.snake.head.toArray()).toEqual([2, 2]);
    expect(env.map[4][4]).toBe(NodeType.Barrier);
    expect(env.map[3][3]).toBe(NodeType.Barrier);
  });
});
