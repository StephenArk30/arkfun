import {
  buildRayObservation,
  buildScalars,
  buildWindowObservation,
  RAY_DIRECTIONS,
  SCALAR_COUNT,
  WINDOW_CHANNELS,
} from '../src/observation';
import { MapNode, NodeType } from '../src/common';
import { SnakeDirection } from '../src/snake';

// 5x5 全空地图 + 蛇头 (2,2)，overrides 覆盖指定格子
const buildMap = (overrides: Array<[number, number, NodeType]> = []) => {
  const map = new Uint8Array(5 * 5);
  map[2 * 5 + 2] = NodeType.SnakeHead;
  overrides.forEach(([col, row, type]) => { map[row * 5 + col] = type; });
  return map;
};

const scalarInputs = {
  col: 5,
  row: 3,
  head: new MapNode(2, 1),
  food: new MapNode(4, 0),
  direction: SnakeDirection.RIGHT,
  snakeLen: 2,
  barrierCount: 3,
};

describe('buildScalars', () => {
  it('encodes food direction, one-hot heading and size statistics', () => {
    const s = buildScalars(scalarInputs);
    expect(s).toHaveLength(SCALAR_COUNT);
    expect(s[0]).toBeCloseTo(2 / 5);   // foodDx = (4-2)/5
    expect(s[1]).toBeCloseTo(-1 / 3);  // foodDy = (0-1)/3
    expect(Array.from(s.slice(2, 6))).toEqual([0, 0, 0, 1]); // RIGHT one-hot
    expect(s[6]).toBeCloseTo(2 / 15);  // snakeLen / cells
    expect(s[7]).toBeCloseTo(3 / 15);  // barrierCount / cells
    expect(s[8]).toBeCloseTo(9 / 15);  // (15-2-3-1)/15
    expect(s[9]).toBeCloseTo(1);       // col / maxDim
    expect(s[10]).toBeCloseTo(3 / 5);  // row / maxDim
  });
});

describe('buildWindowObservation', () => {
  it('crops a head-centric window with channel-last layout', () => {
    const obs = buildWindowObservation({
      ...scalarInputs,
      col: 5,
      row: 5,
      head: new MapNode(2, 2),
      map: buildMap([
        [2, 1, NodeType.Barrier], // (col,row)：蛇头上方是障碍
        [3, 2, NodeType.Food],    // 蛇头右侧是食物
        [1, 2, NodeType.SnakeBody],
      ]),
      windowSize: 3,
    });
    expect(obs.type).toBe('window');
    expect(obs.window).toHaveLength(3 * 3 * WINDOW_CHANNELS);
    expect(obs.scalars).toHaveLength(SCALAR_COUNT);

    const at = (r: number, c: number, ch: number) => (
      obs.window[(r * 3 + c) * WINDOW_CHANNELS + ch]
    );
    // 中心 (1,1) 是蛇头
    expect(at(1, 1, 1)).toBe(1);
    // 上方 (0,1) 是障碍
    expect(at(0, 1, 0)).toBe(1);
    // 右侧 (1,2) 是食物
    expect(at(1, 2, 2)).toBe(1);
    // 左侧 (1,0) 是蛇身
    expect(at(1, 0, 1)).toBe(1);
    // 下方 (2,1) 为空
    expect(at(2, 1, 0)).toBe(0);
    expect(at(2, 1, 1)).toBe(0);
    expect(at(2, 1, 2)).toBe(0);
  });

  it('treats out-of-map cells as walls near the border', () => {
    const obs = buildWindowObservation({
      ...scalarInputs,
      col: 5,
      row: 5,
      head: new MapNode(0, 0),
      map: buildMap(),
      windowSize: 3,
    });
    const at = (r: number, c: number) => obs.window[(r * 3 + c) * WINDOW_CHANNELS];
    // 左上 2x2 越界为墙
    expect(at(0, 0)).toBe(1);
    expect(at(0, 1)).toBe(1);
    expect(at(1, 0)).toBe(1);
    // 右下象限在界内且为空
    expect(at(1, 1)).toBe(0); // 蛇头中心不算障碍
    expect(at(2, 2)).toBe(0);
  });

  it('normalises an even windowSize to the next odd size', () => {
    const obs = buildWindowObservation({
      ...scalarInputs,
      col: 5,
      row: 5,
      head: new MapNode(2, 2),
      map: buildMap(),
      windowSize: 4,
    });
    expect(obs.window).toHaveLength(5 * 5 * WINDOW_CHANNELS);
  });

  it('defaults the window size to 15', () => {
    const obs = buildWindowObservation({
      ...scalarInputs,
      col: 5,
      row: 5,
      head: new MapNode(2, 2),
      map: buildMap(),
    });
    expect(obs.window).toHaveLength(15 * 15 * WINDOW_CHANNELS);
  });
});

describe('buildRayObservation', () => {
  it('casts eight compass rays with distance and hit type', () => {
    const obs = buildRayObservation({
      ...scalarInputs,
      col: 5,
      row: 5,
      head: new MapNode(2, 2),
      map: buildMap([
        [3, 2, NodeType.SnakeBody], // 正东一格是蛇身
        [2, 3, NodeType.Barrier],   // 正南一格是障碍
      ]),
    });
    expect(obs.type).toBe('ray');
    expect(obs.rays).toHaveLength(RAY_DIRECTIONS.length * 4);
    expect(obs.scalars).toHaveLength(SCALAR_COUNT);

    const ray = (i: number) => [
      obs.rays[i * 4], obs.rays[i * 4 + 1], obs.rays[i * 4 + 2], obs.rays[i * 4 + 3],
    ];
    // 东 (3,2) 蛇身：dist 0
    expect(ray(0)).toEqual([1, 0, 0, 1]);
    // 东南 (3,3)、(4,4) 空后出界撞墙：dist 2
    expect(ray(1)[0]).toBeCloseTo(1 / 3);
    expect(ray(1)[1]).toBe(1);
    // 南 (2,3) 障碍：dist 0
    expect(ray(2)).toEqual([1, 0, 1, 0]);
    // 西 (1,2)、(0,2) 空后撞墙：dist 2
    expect(ray(4)[0]).toBeCloseTo(1 / 3);
    expect(ray(4)[1]).toBe(1);
    // 北 (2,1)、(2,0) 空后撞墙：dist 2
    expect(ray(6)[0]).toBeCloseTo(1 / 3);
    expect(ray(6)[1]).toBe(1);
  });

  it('lets rays pass over food cells', () => {
    const obs = buildRayObservation({
      ...scalarInputs,
      col: 5,
      row: 5,
      head: new MapNode(2, 2),
      map: buildMap([[4, 2, NodeType.Food]]), // 正东两格是食物
    });
    // 东向射线穿过食物撞右墙：dist 2
    expect(obs.rays[0]).toBeCloseTo(1 / 3);
    expect(obs.rays[1]).toBe(1);
  });
});
