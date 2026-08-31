import SnakeGameEnv from '../src/env';
import Snake, { SnakeDirection } from '../src/snake';
import { MapNode, NodeType } from '../src/common';
import { appendCanvas, createMockContext, mockRandRange } from './helpers';

// 手工摆放蛇与地图，直接调用 protected 方法测 moveSnake 的各种碰撞
const placeSnake = (
  env: SnakeGameEnv,
  nodes: Array<[number, number]>,
  direction: SnakeDirection,
) => {
  const snake = new Snake({
    head: new MapNode(nodes[0][0], nodes[0][1]),
    ctx: createMockContext(),
    color: '#fff',
    gridA: 20,
    direction,
  });
  nodes.slice(1).forEach(([col, row]) => snake.nodes.push(new MapNode(col, row)));
  (env as any).snake = snake;
  const map: NodeType[][] = Array.from(
    { length: 5 },
    () => Array.from({ length: 5 }, () => NodeType.Empty),
  );
  nodes.forEach(([col, row], index) => {
    map[row][col] = index === 0 ? NodeType.SnakeHead : NodeType.SnakeBody;
  });
  (env as any).map = map;
  return snake;
};

const runMoveSnake = (nodes: Array<[number, number]>, direction: SnakeDirection) => {
  const env = new SnakeGameEnv(appendCanvas(), { col: 5, row: 5 });
  placeSnake(env, nodes, direction);
  return (env as any).moveSnake(direction) as boolean;
};

describe('SnakeGameEnv', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('constructs from a canvas element and merges default config', () => {
    const canvas = appendCanvas();
    const env = new SnakeGameEnv(canvas, { col: 5, row: 5 });
    expect(env.canvas).toBe(canvas);
    expect((env as any).config.snakeColor).toBe('#fff');
    expect((env as any).config.foodColor).toBe('#ff0');
    expect((env as any).config.bgColor).toBe('#000');
    expect((env as any).config.barrierColor).toBe('#888');
    expect(env.gridA).toBe(20);
    expect(env.score).toBe(0);
    expect(env.map).toHaveLength(5);
    expect(env.map[0]).toHaveLength(5);
    expect(env.snake).toBeInstanceOf(Snake);
    expect(env.food).toBeInstanceOf(MapNode);
  });

  it('constructs from a canvas element id', () => {
    const canvas = appendCanvas('test_canvas');
    const env = new SnakeGameEnv('test_canvas', { col: 5, row: 5 });
    expect(env.canvas).toBe(canvas);
  });

  it('constructs with default arguments', () => {
    const canvas = appendCanvas('snake_container');
    const env = new SnakeGameEnv();
    expect(env.canvas).toBe(canvas);
  });

  it('throws when the 2d context is unavailable', () => {
    const canvas = appendCanvas();
    (HTMLCanvasElement.prototype.getContext as jest.Mock).mockReturnValueOnce(null);
    expect(() => new SnakeGameEnv(canvas, { col: 5, row: 5 }))
      .toThrow('get canvas context failed');
  });

  it('randomNode retries while the random cell is occupied by the snake', () => {
    mockRandRange(2, 2, 2, 2, 3, 2);
    const env = new SnakeGameEnv(appendCanvas(), {
      col: 5,
      row: 5,
      direction: SnakeDirection.RIGHT,
    });
    expect(env.snake.head.toArray()).toEqual([2, 2]);
    expect(env.food.toArray()).toEqual([3, 2]);
  });

  it('passes the direction config to the snake', () => {
    mockRandRange(2, 2, 3, 2);
    const env = new SnakeGameEnv(appendCanvas(), {
      col: 5,
      row: 5,
      direction: SnakeDirection.RIGHT,
    });
    expect(env.snake.getDirection()).toBe(SnakeDirection.RIGHT);
  });

  it('reset regenerates the game state', () => {
    const env = new SnakeGameEnv(appendCanvas(), { col: 5, row: 5 });
    env.score = 3;
    const { observation } = env.reset();
    expect(env.score).toBe(0);
    expect(observation.map).toBe(env.map);
    expect(observation.snake).toBe(env.snake);
    expect(observation.food).toBe(env.food);
  });

  it('render fills the canvas and draws food and snake', () => {
    const env = new SnakeGameEnv(appendCanvas(), { col: 5, row: 5 });
    const ctx = env.ctx as any;
    env.fillCanvas();
    expect(ctx.fillStyle).toBe('#000');
    env.render();
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 100, 100);
    expect(ctx.arc).toHaveBeenCalled();
    expect(ctx.rect).toHaveBeenCalled();
  });

  it('close renders on the next animation frame', () => {
    const env = new SnakeGameEnv(appendCanvas(), { col: 5, row: 5 });
    const ctx = env.ctx as any;
    let frame: FrameRequestCallback | undefined;
    window.requestAnimationFrame = jest.fn((cb) => { frame = cb; return 0; });
    env.close();
    expect(frame).toBeDefined();
    (frame as FrameRequestCallback)(0);
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 100, 100);
  });

  it('moveSnake detects hitting each wall', () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    expect(runMoveSnake([[0, 2]], SnakeDirection.LEFT)).toBe(true);
    expect(runMoveSnake([[2, 0]], SnakeDirection.UP)).toBe(true);
    expect(runMoveSnake([[4, 2]], SnakeDirection.RIGHT)).toBe(true);
    expect(runMoveSnake([[2, 4]], SnakeDirection.DOWN)).toBe(true);
    expect(logSpy).toHaveBeenCalledWith('game over!', 0);
  });

  it('moveSnake detects colliding with its own body', () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    expect(runMoveSnake([[2, 2], [2, 3], [3, 3]], SnakeDirection.DOWN)).toBe(true);
    expect(logSpy).toHaveBeenCalledWith('game over!', 0);
  });

  it('moveSnake returns false for a safe move and updates the map', () => {
    const env = new SnakeGameEnv(appendCanvas(), { col: 5, row: 5 });
    const snake = placeSnake(env, [[2, 2], [2, 3]], SnakeDirection.LEFT);
    expect((env as any).moveSnake(SnakeDirection.LEFT)).toBe(false);
    expect(snake.head.toArray()).toEqual([1, 2]);
    expect(env.map[2][1]).toBe(NodeType.SnakeHead);
  });

  it('step eats food, ignores opposite actions and ends on a wall', () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    mockRandRange(2, 2, 3, 2, 1, 1);
    const env = new SnakeGameEnv(appendCanvas(), {
      col: 5,
      row: 5,
      direction: SnakeDirection.RIGHT,
    });

    // 向右吃到食物：奖励、得分、变长、生成新食物
    let res = env.step(SnakeDirection.RIGHT);
    expect(res.reward).toBe(1);
    expect(res.done).toBe(false);
    expect(env.score).toBe(1);
    expect(env.snake.length).toBe(2);
    expect(env.snake.head.toArray()).toEqual([3, 2]);
    expect(env.food.toArray()).toEqual([1, 1]);
    expect(env.map[2][3]).toBe(NodeType.SnakeHead);

    // 普通移动（长度 >= 2，蛇头原位置记为 SnakeBody）
    res = env.step(SnakeDirection.UP);
    expect(res.reward).toBe(0);
    expect(res.done).toBe(false);
    expect(env.snake.head.toArray()).toEqual([3, 1]);
    expect(env.map[2][3]).toBe(NodeType.SnakeBody);

    // 反向输入被忽略，仍按当前方向前进
    res = env.step(SnakeDirection.DOWN);
    expect(res.done).toBe(false);
    expect(env.snake.head.toArray()).toEqual([3, 0]);

    // 撞上边界，游戏结束
    res = env.step(SnakeDirection.UP);
    expect(res.done).toBe(true);
    expect(logSpy).toHaveBeenCalledWith('game over!', 1);
  });
});
