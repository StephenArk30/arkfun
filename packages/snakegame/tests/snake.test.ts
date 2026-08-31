import Snake, { DirectionDelta, opposite, SnakeDirection } from '../src/snake';
import { MapNode, random } from '../src/common';
import { createMockContext } from './helpers';

describe('opposite', () => {
  it('maps each direction to its opposite', () => {
    expect(opposite(SnakeDirection.UP)).toBe(SnakeDirection.DOWN);
    expect(opposite(SnakeDirection.DOWN)).toBe(SnakeDirection.UP);
    expect(opposite(SnakeDirection.LEFT)).toBe(SnakeDirection.RIGHT);
    expect(opposite(SnakeDirection.RIGHT)).toBe(SnakeDirection.LEFT);
  });

  it('returns the input itself for an unknown direction', () => {
    expect(opposite(42 as SnakeDirection)).toBe(42);
  });
});

it('DirectionDelta maps every direction to its delta', () => {
  expect(DirectionDelta[SnakeDirection.UP].toArray()).toEqual([0, -1]);
  expect(DirectionDelta[SnakeDirection.DOWN].toArray()).toEqual([0, 1]);
  expect(DirectionDelta[SnakeDirection.LEFT].toArray()).toEqual([-1, 0]);
  expect(DirectionDelta[SnakeDirection.RIGHT].toArray()).toEqual([1, 0]);
});

describe('Snake', () => {
  const makeSnake = (overrides: Record<string, unknown> = {}) => new Snake({
    head: new MapNode(5, 5),
    ctx: createMockContext(),
    color: '#0f0',
    gridA: 10,
    ...overrides,
  } as any);

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('constructs with a valid direction and snakeLen', () => {
    const snake = makeSnake({ direction: SnakeDirection.RIGHT, snakeLen: 3 });
    expect(snake.getDirection()).toBe(SnakeDirection.RIGHT);
    expect(snake.length).toBe(3);
    expect(snake.nodes.map((node) => node.toArray())).toEqual([[5, 5], [4, 5], [3, 5]]);
    expect(snake.head.toArray()).toEqual([5, 5]);
    expect(snake.tail.toArray()).toEqual([3, 5]);
  });

  it('falls back to a random direction when direction is missing or invalid', () => {
    const spy = jest.spyOn(random, 'randRange').mockReturnValue(SnakeDirection.DOWN);
    expect(makeSnake().getDirection()).toBe(SnakeDirection.DOWN);
    expect(makeSnake({ direction: -1 }).getDirection()).toBe(SnakeDirection.DOWN);
    expect(makeSnake({ direction: 99 }).getDirection()).toBe(SnakeDirection.DOWN);
    expect(spy).toHaveBeenCalledWith(SnakeDirection.MIN, SnakeDirection.MAX);
  });

  it('defaults to length 1 without snakeLen', () => {
    expect(makeSnake({ direction: SnakeDirection.UP }).length).toBe(1);
  });

  it('moveHead returns the next head without mutating the snake', () => {
    const snake = makeSnake({ direction: SnakeDirection.RIGHT });
    expect(snake.moveHead(SnakeDirection.DOWN).toArray()).toEqual([5, 6]);
    expect(snake.head.toArray()).toEqual([5, 5]);
  });

  it('move shifts nodes and optionally changes direction', () => {
    const snake = makeSnake({ direction: SnakeDirection.RIGHT, snakeLen: 2 });
    snake.move(SnakeDirection.LEFT);
    expect(snake.getDirection()).toBe(SnakeDirection.LEFT);
    expect(snake.head.toArray()).toEqual([4, 5]);
    expect(snake.length).toBe(2);
    snake.move();
    expect(snake.getDirection()).toBe(SnakeDirection.LEFT);
    expect(snake.head.toArray()).toEqual([3, 5]);
  });

  it('includes checks whether a node is part of the snake', () => {
    const snake = makeSnake({ direction: SnakeDirection.RIGHT, snakeLen: 3 });
    expect(snake.includes(new MapNode(4, 5))).toBe(true);
    expect(snake.includes(new MapNode(0, 0))).toBe(false);
  });

  it('draws every node on the context', () => {
    const ctx = createMockContext();
    const snake = new Snake({
      head: new MapNode(5, 5),
      ctx,
      color: '#0f0',
      gridA: 10,
      direction: SnakeDirection.RIGHT,
      snakeLen: 2,
    });
    snake.draw();
    expect(ctx.fillStyle).toBe('#0f0');
    expect(ctx.rect).toHaveBeenCalledTimes(2);
    // nodes 为 [(5,5), (4,5)]，最后一次绘制的是蛇身节点 (4,5)
    expect(ctx.rect).toHaveBeenNthCalledWith(1, 50, 50, 10, 10);
    expect(ctx.rect).toHaveBeenNthCalledWith(2, 40, 50, 10, 10);
    expect(ctx.fill).toHaveBeenCalled();
  });

  it('eat grows towards the food and changes direction', () => {
    const snake = makeSnake({ direction: SnakeDirection.RIGHT });
    const head = snake.eat(SnakeDirection.UP, new MapNode(5, 6));
    expect(head.toArray()).toEqual([5, 6]);
    expect(snake.head.toArray()).toEqual([5, 6]);
    expect(snake.getDirection()).toBe(SnakeDirection.UP);
    expect(snake.length).toBe(2);
  });
});
