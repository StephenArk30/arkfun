import SnakeGameEnv from '../src/env';
import { SnakeDirection } from '../src/snake';
import { mockRandRange } from './helpers';

// P0 训练支持：无头模式、可复现 RNG、奖励塑形与超时截断、debug 日志开关
describe('SnakeGameEnv training support', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('headless mode', () => {
    it('runs reset/step/render/close without a canvas', () => {
      const env = new SnakeGameEnv(null, { col: 5, row: 5, barriers: 2 });
      expect(env.canvas).toBeNull();
      expect(env.ctx).toBeNull();
      expect(env.gridA).toBe(0);
      expect(env.map).toHaveLength(25);
      expect(env.barriers).toHaveLength(2);

      // 渲染相关方法在无头模式下全部安全空转
      expect(() => env.render()).not.toThrow();
      expect(() => env.fillCanvas()).not.toThrow();
      expect(() => env.close()).not.toThrow();

      const res = env.step(SnakeDirection.UP);
      expect(typeof res.reward).toBe('number');
      expect(typeof res.done).toBe('boolean');
      expect(typeof res.terminated).toBe('boolean');
      expect(typeof res.truncated).toBe('boolean');
      expect(env.steps).toBe(1);
    });

    it('throws a clear error when a canvas id cannot be found', () => {
      expect(() => new SnakeGameEnv('missing_canvas'))
        .toThrow('canvas missing_canvas not found');
    });
  });

  describe('seeded reset', () => {
    const snapshot = (env: SnakeGameEnv) => JSON.stringify({
      head: env.snake.head.toArray(),
      direction: env.snake.getDirection(),
      food: env.food.toArray(),
      barriers: env.barriers.map((node) => node.toArray()),
      map: env.map,
    });

    const makeEnv = (seed?: number) => new SnakeGameEnv(null, {
      col: 8,
      row: 8,
      barriers: [2, 6],
      seed,
    });

    it('reproduces the same episode for the same seed', () => {
      const envA = makeEnv();
      const envB = makeEnv();
      envA.reset(42);
      envB.reset(42);
      expect(snapshot(envA)).toBe(snapshot(envB));

      // 相同动作序列产生完全相同的轨迹与奖励
      for (let i = 0; i < 50; i += 1) {
        const action = envA.snake.getDirection();
        const resA = envA.step(action);
        const resB = envB.step(action);
        expect(resA.reward).toBe(resB.reward);
        expect(resA.done).toBe(resB.done);
        expect(envA.steps).toBe(envB.steps);
        expect(snapshot(envA)).toBe(snapshot(envB));
        if (resA.done) break;
      }
    });

    it('produces different layouts for different seeds', () => {
      const envA = makeEnv();
      const envB = makeEnv();
      envA.reset(1);
      envB.reset(2);
      expect(snapshot(envA)).not.toBe(snapshot(envB));
    });

    it('seeds the initial reset from config', () => {
      expect(snapshot(makeEnv(7))).toBe(snapshot(makeEnv(7)));
    });
  });

  describe('reward shaping and truncation', () => {
    it('applies step/food/death rewards', () => {
      // 蛇头 (2,2)、食物 (3,2)、吃后新食物 (0,0)
      mockRandRange(2, 2, 3, 2, 0, 0);
      const env = new SnakeGameEnv(null, {
        col: 5,
        row: 5,
        direction: SnakeDirection.RIGHT,
        stepReward: -0.01,
        deathReward: -1,
      });

      // 吃到食物：stepReward + foodReward
      let res = env.step(SnakeDirection.RIGHT);
      expect(res.reward).toBeCloseTo(0.99);
      expect(res.terminated).toBe(false);
      expect(res.truncated).toBe(false);

      // 普通移动
      res = env.step(SnakeDirection.RIGHT);
      expect(res.reward).toBeCloseTo(-0.01);

      // 撞右墙：stepReward + deathReward
      res = env.step(SnakeDirection.RIGHT);
      expect(res.done).toBe(true);
      expect(res.terminated).toBe(true);
      expect(res.truncated).toBe(false);
      expect(res.reward).toBeCloseTo(-1.01);
      expect(res.info.cause).toBe('wall');
      expect(res.info.illegal).toBe(false);
      expect(env.score).toBe(1);
    });

    it('truncates an episode at maxSteps without terminating', () => {
      mockRandRange(2, 2, 3, 2, 0, 0);
      const env = new SnakeGameEnv(null, {
        col: 5,
        row: 5,
        direction: SnakeDirection.RIGHT,
        maxSteps: 2,
      });

      let res = env.step(SnakeDirection.RIGHT);
      expect(res.done).toBe(false);
      expect(env.steps).toBe(1);

      res = env.step(SnakeDirection.RIGHT);
      expect(res.done).toBe(true);
      expect(res.terminated).toBe(false);
      expect(res.truncated).toBe(true);
      expect(res.info.cause).toBe('timeout');
      expect(env.steps).toBe(2);
    });

    it('resets the step counter and honours winReward', () => {
      // 3x1 地图：蛇头 (0,0)、食物 (1,0)、新食物 (2,0)，两次吃满即胜利；
      // 胜利后 reset：蛇头 (1,0)、食物 (2,0)
      mockRandRange(0, 0, 1, 0, 2, 0, 1, 0, 2, 0);
      const env = new SnakeGameEnv(null, {
        col: 3,
        row: 1,
        direction: SnakeDirection.RIGHT,
        winReward: 10,
      });

      let res = env.step(SnakeDirection.RIGHT);
      expect(res.done).toBe(false);
      expect(env.steps).toBe(1);

      res = env.step(SnakeDirection.RIGHT);
      expect(res.done).toBe(true);
      expect(res.terminated).toBe(true);
      expect(res.info.cause).toBe('win');
      // 胜利奖励 = foodReward + winReward
      expect(res.reward).toBe(11);

      // reset 后步数清零
      env.reset();
      expect(env.steps).toBe(0);
    });
  });

  describe('debug logging', () => {
    it('stays silent by default and logs on game over when enabled', () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      // 蛇头 (2,2)、食物 (3,2)、新食物 (1,1)：右三步撞墙
      mockRandRange(2, 2, 3, 2, 1, 1);
      const quiet = new SnakeGameEnv(null, {
        col: 5,
        row: 5,
        direction: SnakeDirection.RIGHT,
      });
      quiet.step(SnakeDirection.RIGHT);
      quiet.step(SnakeDirection.RIGHT);
      quiet.step(SnakeDirection.RIGHT);
      expect(logSpy).not.toHaveBeenCalled();

      mockRandRange(2, 2, 3, 2, 1, 1);
      const loud = new SnakeGameEnv(null, {
        col: 5,
        row: 5,
        direction: SnakeDirection.RIGHT,
        debug: true,
      });
      loud.step(SnakeDirection.RIGHT);
      loud.step(SnakeDirection.RIGHT);
      loud.step(SnakeDirection.RIGHT);
      expect(logSpy).toHaveBeenCalledWith('game over!', 1);
    });
  });
});
