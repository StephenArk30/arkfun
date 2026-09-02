import { random } from '../src/common';

export const createMockContext = (): CanvasRenderingContext2D => ({
  fillStyle: '',
  fillRect: jest.fn(),
  beginPath: jest.fn(),
  arc: jest.fn(),
  fill: jest.fn(),
  rect: jest.fn(),
} as unknown as CanvasRenderingContext2D);

export const appendCanvas = (id?: string) => {
  const canvas = document.createElement('canvas');
  canvas.width = 100;
  canvas.height = 100;
  if (id) {
    canvas.id = id;
    document.body.appendChild(canvas);
  }
  return canvas;
};

// 展平地图取格：index = row * width + col
export const cell = (
  map: Uint8Array,
  row: number,
  col: number,
  width: number,
) => map[row * width + col];

// 依次返回 values 中的值，耗尽后重复最后一个值。
// 用于让 randomNode 的落点（以及 AI 初始动作）变得确定。
export const mockRandRange = (...values: number[]) => {
  const queue = [...values];
  return jest.spyOn(random, 'randRange').mockImplementation(() => {
    if (queue.length > 0) return queue.shift() as number;
    return values[values.length - 1];
  });
};
