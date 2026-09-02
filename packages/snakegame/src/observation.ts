import { MapNode, NodeType } from './common';
import { SnakeDirection } from './snake';

// ===== 局部窗口观察 =====
// 以蛇头为中心的 windowSize × windowSize 窗口（越界视为墙），3 通道、
// 通道在最后（NHWC，直接可喂 conv2d）：
//   ch0: 障碍（Barrier 或越界墙）
//   ch1: 蛇身（SnakeHead / SnakeBody）
//   ch2: 食物
// 窗口与地图绝对尺寸无关，任意 col/row 下输出形状恒定，可跨尺寸泛化。
export const WINDOW_CHANNELS = 3;

// ===== Ray 观察 =====
// 8 个罗盘方向（顺时针从正东开始），每条 ray 4 个特征：
//   [0] 1/(1+dist)，dist 为沿该方向到第一个阻挡格（墙/障碍/蛇身）的步数，
//       越近值越大；食物不阻挡射线（食物方向见全局标量）
//   [1..3] 命中类型 one-hot（墙 / 障碍 / 蛇身）
export const RAY_DIRECTIONS: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1],
];
export const RAY_FEATURES = 4;

// ===== 全局标量（window / ray 共用）=====
// [0] foodDx = (food.col - head.col) / col          ∈ [-1, 1]
// [1] foodDy = (food.row - head.row) / row          ∈ [-1, 1]
// [2..5] 朝向 one-hot（UP / DOWN / LEFT / RIGHT）
// [6] snakeLen / (col*row)
// [7] barrierCount / (col*row)
// [8] 空格率（扣除蛇身、障碍与食物占 1 格）
// [9] col / max(col, row)
// [10] row / max(col, row)
export const SCALAR_COUNT = 11;

export type ScalarInputs = {
  col: number;
  row: number;
  head: MapNode;
  food: MapNode;
  direction: SnakeDirection;
  snakeLen: number;
  barrierCount: number;
};

export const buildScalars = ({
  col, row, head, food, direction, snakeLen, barrierCount,
}: ScalarInputs): Float32Array => {
  const scalars = new Float32Array(SCALAR_COUNT);
  scalars[0] = (food.col - head.col) / col;
  scalars[1] = (food.row - head.row) / row;
  scalars[2 + direction] = 1;
  const cells = col * row;
  scalars[6] = snakeLen / cells;
  scalars[7] = barrierCount / cells;
  scalars[8] = (cells - snakeLen - barrierCount - 1) / cells;
  const maxDim = Math.max(col, row);
  scalars[9] = col / maxDim;
  scalars[10] = row / maxDim;
  return scalars;
};

export type WindowObservation = {
  type: 'window';
  window: Float32Array;
  scalars: Float32Array;
};

export type WindowInputs = ScalarInputs & {
  map: Uint8Array;
  windowSize?: number; // 缺省 15；偶数自动 +1 保证有中心格
};

export const buildWindowObservation = ({
  map, windowSize = 15, ...rest
}: WindowInputs): WindowObservation => {
  const size = windowSize % 2 === 1 ? windowSize : windowSize + 1;
  const { col, row, head } = rest;
  const window = new Float32Array(size * size * WINDOW_CHANNELS);
  const off = Math.floor(size / 2);
  for (let r = 0; r < size; r += 1) {
    const mapRow = head.row + r - off;
    for (let c = 0; c < size; c += 1) {
      const mapCol = head.col + c - off;
      const out = mapRow < 0 || mapRow >= row || mapCol < 0 || mapCol >= col;
      const cell = out ? NodeType.Empty : map[mapRow * col + mapCol];
      const idx = (r * size + c) * WINDOW_CHANNELS;
      window[idx] = out || cell === NodeType.Barrier ? 1 : 0;
      window[idx + 1] = cell === NodeType.SnakeHead || cell === NodeType.SnakeBody ? 1 : 0;
      window[idx + 2] = cell === NodeType.Food ? 1 : 0;
    }
  }
  return { type: 'window', window, scalars: buildScalars(rest) };
};

export type RayObservation = {
  type: 'ray';
  rays: Float32Array;
  scalars: Float32Array;
};

export type RayInputs = ScalarInputs & { map: Uint8Array };

export const buildRayObservation = (inputs: RayInputs): RayObservation => {
  const { map, col, row, head } = inputs;
  const rays = new Float32Array(RAY_DIRECTIONS.length * RAY_FEATURES);
  RAY_DIRECTIONS.forEach(([dCol, dRow], i) => {
    let dist = 0;
    let hitWall = 0;
    let hitBarrier = 0;
    let hitBody = 0;
    let c = head.col + dCol;
    let r = head.row + dRow;
    // 地图有界，射线必然终止于墙 / 障碍 / 蛇身
    for (;;) {
      if (c < 0 || c >= col || r < 0 || r >= row) {
        hitWall = 1;
        break;
      }
      const cell = map[r * col + c];
      if (cell === NodeType.Barrier) {
        hitBarrier = 1;
        break;
      }
      if (cell === NodeType.SnakeHead || cell === NodeType.SnakeBody) {
        hitBody = 1;
        break;
      }
      dist += 1;
      c += dCol;
      r += dRow;
    }
    const idx = i * RAY_FEATURES;
    rays[idx] = 1 / (1 + dist);
    rays[idx + 1] = hitWall;
    rays[idx + 2] = hitBarrier;
    rays[idx + 3] = hitBody;
  });
  return { type: 'ray', rays, scalars: buildScalars(inputs) };
};
