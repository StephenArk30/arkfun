import { PlaySnakeGame, PlaySnakeGameHuman, printMap } from '../src/play';
import snakeAI from '../src/snakeAI';
import { MapNode, NodeType } from '../src/common';
import Snake, { SnakeDirection } from '../src/snake';
import { appendCanvas, createMockContext, mockRandRange } from './helpers';

// AI 动作由测试直接控制，帧循环手动驱动
jest.mock('../src/snakeAI', () => ({
  __esModule: true,
  default: jest.fn(),
}));

const snakeAIMock = snakeAI as unknown as jest.Mock;

describe('PlaySnakeGame', () => {
  let rafCallbacks: FrameRequestCallback[];
  let timeoutCallbacks: Array<() => void>;

  beforeEach(() => {
    rafCallbacks = [];
    timeoutCallbacks = [];
    jest.spyOn(console, 'log').mockImplementation(() => {});
    window.requestAnimationFrame = jest.fn((cb: FrameRequestCallback) => {
      rafCallbacks.push(cb);
      return 0;
    });
    window.setTimeout = jest.fn((cb: () => void) => {
      timeoutCallbacks.push(cb);
      return 0;
    }) as unknown as typeof window.setTimeout;
    snakeAIMock.mockReset();
    snakeAIMock.mockResolvedValue(SnakeDirection.RIGHT);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('schedules the first frame with default arguments', () => {
    appendCanvas('snake_container');
    PlaySnakeGame();
    expect(rafCallbacks.length).toBe(1);
  });

  it('runs frames without debug output while the game continues', async () => {
    // 构造器 reset：蛇头 (2,2)、食物 (3,2)；
    // PlaySnakeGame 内部再次 reset：蛇头 (2,2)、食物 (3,2)；
    // 第 1 帧吃到食物后新食物 (4,2)。
    mockRandRange(2, 2, 3, 2, 2, 2, 3, 2, 4, 2, 1, 1);
    const canvas = appendCanvas();
    PlaySnakeGame(canvas, {
      col: 5,
      row: 5,
      direction: SnakeDirection.RIGHT,
    });

    await rafCallbacks.shift()!(0);
    // 游戏未结束：调度下一帧，且 debug 关闭时不打印地图
    expect(timeoutCallbacks.length).toBe(1);
    expect(console.log).not.toHaveBeenCalled();
  });

  it('plays a full episode with debug output and closes on game over', async () => {
    mockRandRange(2, 2, 3, 2, 2, 2, 3, 2, 4, 2, 1, 1);
    const canvas = appendCanvas();
    PlaySnakeGame(canvas, {
      col: 5,
      row: 5,
      direction: SnakeDirection.RIGHT,
    }, true);

    expect(rafCallbacks.length).toBe(1);
    // 初始地图打印（食物 'o'、蛇头 '>'）
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('o'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('>'));

    await rafCallbacks.shift()!(0); // 第 1 帧：吃到食物 (3,2)
    expect(timeoutCallbacks.length).toBe(1);
    await timeoutCallbacks.shift()!(); // 调度下一帧
    expect(rafCallbacks.length).toBe(1);

    await rafCallbacks.shift()!(0); // 第 2 帧：吃到食物 (4,2)
    expect(timeoutCallbacks.length).toBe(1);
    await timeoutCallbacks.shift()!(); // 调度下一帧

    await rafCallbacks.shift()!(0); // 第 3 帧：撞墙，游戏结束

    expect(console.log).toHaveBeenCalledWith('game over!', 2);
    expect(timeoutCallbacks.length).toBe(0);
    // env.close() 注册了最后一个渲染帧
    expect(rafCallbacks.length).toBe(1);
    rafCallbacks.shift()!(0);
  });
});

describe('PlaySnakeGameHuman', () => {
  let rafCallbacks: FrameRequestCallback[];
  let timeoutCallbacks: Array<() => void>;

  beforeEach(() => {
    rafCallbacks = [];
    timeoutCallbacks = [];
    jest.spyOn(console, 'log').mockImplementation(() => {});
    window.requestAnimationFrame = jest.fn((cb: FrameRequestCallback) => {
      rafCallbacks.push(cb);
      return 0;
    });
    window.setTimeout = jest.fn((cb: () => void) => {
      timeoutCallbacks.push(cb);
      return 0;
    }) as unknown as typeof window.setTimeout;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('schedules the first frame with default arguments', () => {
    appendCanvas('snake_container');
    PlaySnakeGameHuman();
    expect(rafCallbacks.length).toBe(1);
  });

  it('reacts to the keyboard and cleans up when game over', async () => {
    // 构造器 reset：蛇头 (1,1)、食物 (0,0)；
    // 内部再次 reset：蛇头 (1,1)、食物 (2,2)；
    // 随后 randRange 为初始动作。
    mockRandRange(1, 1, 0, 0, 1, 1, 2, 2, 3, 3, 0);
    const removeSpy = jest.spyOn(window, 'removeEventListener');
    const canvas = appendCanvas();
    PlaySnakeGameHuman(canvas, {
      col: 5,
      row: 5,
      direction: SnakeDirection.RIGHT,
    });

    // 覆盖键盘监听的 4 个方向分支与 default 分支
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x' }));

    expect(rafCallbacks.length).toBe(1);
    await rafCallbacks.shift()!(0); // 帧 1：(1,1) → (2,1)
    expect(timeoutCallbacks.length).toBe(1);
    await timeoutCallbacks.shift()!();
    await rafCallbacks.shift()!(0); // 帧 2：→ (3,1)
    await timeoutCallbacks.shift()!();
    await rafCallbacks.shift()!(0); // 帧 3：→ (4,1)
    await timeoutCallbacks.shift()!();
    await rafCallbacks.shift()!(0); // 帧 4：→ (5,1) 撞墙，游戏结束

    // debug 关闭时游戏结束不再打印日志
    expect(console.log).not.toHaveBeenCalled();
    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
    // env.close() 注册的渲染帧
    expect(rafCallbacks.length).toBe(1);
    rafCallbacks.shift()!(0);
  });
});

describe('printMap', () => {
  it('prints every node type and all direction heads', () => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    const map = [
      [NodeType.Food, NodeType.SnakeHead, NodeType.SnakeBody],
      [NodeType.Barrier, NodeType.Empty, 99 as unknown as NodeType],
    ];
    const directions = [
      SnakeDirection.UP,
      SnakeDirection.DOWN,
      SnakeDirection.LEFT,
      SnakeDirection.RIGHT,
    ];
    directions.forEach((direction) => {
      const snake = new Snake({
        head: new MapNode(1, 0),
        ctx: createMockContext(),
        color: '#fff',
        gridA: 1,
        direction,
      });
      printMap({ map, snake, food: new MapNode(0, 0), barriers: [] });
    });

    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('o'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('^'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('v'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('<'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('>'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('+'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('*'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining(' '));
  });
});
