import SnakeGameEnv, { SnakeObservation } from '../src/env';
import { WindowObservation, RayObservation, SCALAR_COUNT, WINDOW_CHANNELS } from '../src/observation';
import { SnakeDirection } from '../src/snake';
import { mockRandRange } from './helpers';

// P1 观察编码：observationType 'window' / 'ray' 输出与地图尺寸无关的定长特征
describe('SnakeGameEnv observation types', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns a head-centric window plus scalars in window mode', () => {
    // 构造 reset：蛇头 (2,2)、食物 (3,2)；显式 reset 同布局；吃后新食物 (1,1)
    mockRandRange(2, 2, 3, 2, 2, 2, 3, 2, 1, 1);
    const env = new SnakeGameEnv(null, {
      col: 5,
      row: 5,
      direction: SnakeDirection.RIGHT,
      observationType: 'window',
      windowSize: 5,
    });

    const { observation } = env.reset();
    const obs = observation as WindowObservation;
    expect(obs.type).toBe('window');
    expect(obs.window).toHaveLength(5 * 5 * WINDOW_CHANNELS);
    expect(obs.scalars).toHaveLength(SCALAR_COUNT);

    // 窗口中心 (2,2) 是蛇头
    expect(obs.window[(2 * 5 + 2) * WINDOW_CHANNELS + 1]).toBe(1);
    // 食物 (3,2) 在窗口 (2,3)
    expect(obs.window[(2 * 5 + 3) * WINDOW_CHANNELS + 2]).toBe(1);
    // 标量：foodDx = (3-2)/5
    expect(obs.scalars[0]).toBeCloseTo(1 / 5);
    // 朝向 RIGHT one-hot
    expect(obs.scalars[5]).toBe(1);

    // 吃掉食物后蛇头 (3,2)，再上行到 (3,1)，新食物 (1,1) 映射到窗口 (r=2, c=0)
    env.step(SnakeDirection.RIGHT);
    const after = env.step(SnakeDirection.UP) as any;
    const w = after.observation as WindowObservation;
    expect(w.window[(2 * 5 + 0) * WINDOW_CHANNELS + 2]).toBe(1);
  });

  it('returns fixed-length ray features in ray mode', () => {
    // 构造 reset 与显式 reset 均为：蛇头 (2,2)、食物 (0,0)
    mockRandRange(2, 2, 0, 0, 2, 2, 0, 0);
    const env = new SnakeGameEnv(null, {
      col: 5,
      row: 5,
      direction: SnakeDirection.RIGHT,
      observationType: 'ray',
    });

    const { observation } = env.reset();
    const obs = observation as RayObservation;
    expect(obs.type).toBe('ray');
    expect(obs.rays).toHaveLength(8 * 4);
    expect(obs.scalars).toHaveLength(SCALAR_COUNT);

    // 东向（RAY_DIRECTIONS[0]）：(3,2)、(4,2) 空后撞右墙，dist 2
    expect(obs.rays[0]).toBeCloseTo(1 / 3);
    expect(obs.rays[1]).toBe(1);
  });

  it('keeps the full observation shape by default', () => {
    // 构造 reset 与显式 reset 均为：蛇头 (2,2)、食物 (3,2)
    mockRandRange(2, 2, 3, 2, 2, 2, 3, 2);
    const env = new SnakeGameEnv(null, {
      col: 5,
      row: 5,
      direction: SnakeDirection.RIGHT,
    });
    const { observation } = env.reset();
    const obs = observation as SnakeObservation;
    expect(obs.type).toBe('full');
    expect(obs.map).toHaveLength(25);
    expect(obs.col).toBe(5);
    expect(obs.row).toBe(5);
  });
});
