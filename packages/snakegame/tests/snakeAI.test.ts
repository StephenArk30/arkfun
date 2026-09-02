import AI from '../src/snakeAI';
import { aStar } from '../src/snakeAI/aStar';
import Snake, { SnakeDirection } from '../src/snake';
import { MapNode, NodeType } from '../src/common';
import { createMockContext } from './helpers';
import '../src/snakeAI/common';

// 构造一个 5x5 的观测：默认全空地图，蛇头位置标记为 SnakeHead，
// mapOverrides 用 [x, y, type] 覆盖单元格。
const buildObs = (
  head: [number, number],
  direction: SnakeDirection,
  food: [number, number],
  mapOverrides: Array<[number, number, NodeType]> = [],
) => {
  const map = new Uint8Array(5 * 5);
  map[head[1] * 5 + head[0]] = NodeType.SnakeHead;
  mapOverrides.forEach(([x, y, type]) => { map[y * 5 + x] = type; });
  const snake = new Snake({
    head: new MapNode(head[0], head[1]),
    ctx: createMockContext(),
    color: '#fff',
    gridA: 1,
    direction,
  });
  return {
    type: 'full' as const,
    map,
    col: 5,
    row: 5,
    snake,
    food: new MapNode(food[0], food[1]),
    barriers: [] as MapNode[],
  };
};

describe('aStar', () => {
  beforeEach(() => {
    // random() 的加分固定为 (0.1 - 0.01) * 0.5 = 0.045，结果可手工推演
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('moves towards the food on an empty map', async () => {
    const obs = buildObs([2, 2], SnakeDirection.RIGHT, [4, 2]);
    await expect(aStar(obs)).resolves.toBe(SnakeDirection.RIGHT);
  });

  it('penalises moving out of bounds on every side', async () => {
    // x < 0：左侧是墙
    await expect(aStar(buildObs([0, 2], SnakeDirection.UP, [2, 2])))
      .resolves.toBe(SnakeDirection.RIGHT);
    // x >= col：右侧是墙
    await expect(aStar(buildObs([4, 2], SnakeDirection.UP, [2, 2])))
      .resolves.toBe(SnakeDirection.LEFT);
    // y < 0：上方是墙
    await expect(aStar(buildObs([2, 0], SnakeDirection.RIGHT, [2, 2])))
      .resolves.toBe(SnakeDirection.DOWN);
    // y >= row：下方是墙
    await expect(aStar(buildObs([2, 4], SnakeDirection.RIGHT, [2, 2])))
      .resolves.toBe(SnakeDirection.UP);
  });

  it('penalises barriers and snake cells', async () => {
    // 下方是 Barrier
    await expect(aStar(buildObs([2, 2], SnakeDirection.DOWN, [2, 4], [
      [2, 3, NodeType.Barrier],
    ]))).resolves.toBe(SnakeDirection.LEFT);
    // 下方是 SnakeBody、左方是 SnakeHead
    await expect(aStar(buildObs([2, 2], SnakeDirection.DOWN, [2, 4], [
      [2, 3, NodeType.SnakeBody],
      [1, 2, NodeType.SnakeHead],
    ]))).resolves.toBe(SnakeDirection.RIGHT);
  });

  it('uses a zero bonus when the random value is not below the threshold', async () => {
    (Math.random as jest.Mock).mockReturnValue(0.95);
    const obs = buildObs([2, 2], SnakeDirection.RIGHT, [4, 2]);
    await expect(aStar(obs)).resolves.toBe(SnakeDirection.RIGHT);
  });

  it('default export delegates to aStar', async () => {
    const obs = buildObs([2, 2], SnakeDirection.RIGHT, [4, 2]);
    await expect(AI(obs)).resolves.toBe(SnakeDirection.RIGHT);
  });
});
