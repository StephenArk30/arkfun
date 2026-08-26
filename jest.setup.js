// jsdom 的 canvas.getContext 默认返回 null（未安装 node-canvas），
// 这里 mock 原型方法，每次调用返回一个全新的 ctx mock。
const createMockContext = () => ({
  fillStyle: '',
  fillRect: jest.fn(),
  beginPath: jest.fn(),
  arc: jest.fn(),
  fill: jest.fn(),
  rect: jest.fn(),
});

HTMLCanvasElement.prototype.getContext = jest.fn(() => createMockContext());
