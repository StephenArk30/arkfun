import Snake, {
  DirectionDelta, opposite, relativeToAbsolute, SnakeDirection, SnakeRelativeAction,
} from './snake';
import { createRNG, MapNode, NodeType, random, RNG } from './common';
import Food from './food';
import {
  buildRayObservation,
  buildWindowObservation,
  RayObservation,
  WindowObservation,
} from './observation';
import { Env } from './types';

// 'full' 模式观察：完整地图 + 实体引用。map 为行优先展平的 Uint8Array，
// 索引 = row * col + col（NodeType 值 0-4，Empty = 0 即零填充）
export type SnakeObservation = {
  type: 'full';
  map: Uint8Array;
  col: number;
  row: number;
  snake: Snake;
  food: MapNode;
  barriers: MapNode[];
};

export type SnakeAnyObservation = SnakeObservation | WindowObservation | RayObservation;

// 终止原因：wall/body/barrier 为死亡，win 为胜利，timeout 为超时截断
export type SnakeDeathCause = 'wall' | 'body' | 'barrier' | 'win' | 'timeout';

// step 返回的 info：训练监控与死因归因
export type SnakeStepInfo = {
  cause?: SnakeDeathCause;
  illegal: boolean;
  score: number;
  steps: number;
};

// 障碍物数量：固定数量，或 [min, max] 区间内随机（含边界，min > max 时自动交换）
export type BarrierCount = number | [number, number];

// 初始蛇长：固定值，或 [min, max] 区间内随机；上限 min(col, row)
export type SnakeLenCount = number | [number, number];

export type SnakeGameConfig = {
  col: number,
  row: number,
  snakeColor?: string,
  foodColor?: string,
  bgColor?: string,
  direction?: SnakeDirection,
  barriers?: BarrierCount,
  barrierColor?: string,
  // 游戏结束/胜利时是否打印日志（训练时保持关闭，避免刷屏拖慢速度）
  debug?: boolean,
  // 随机种子：构造时或 reset(seed) 时传入，使用 mulberry32 确定性 RNG 复现实验
  seed?: number,
  // 奖励塑形。默认值保持原有行为：仅吃食物 +1，其余为 0
  foodReward?: number,
  stepReward?: number,
  deathReward?: number,
  winReward?: number,
  // 每局最大步数，达到后截断（truncated = true）；0 表示不限制
  maxSteps?: number,
  // 动作空间：'absolute'（默认，4 绝对方向）| 'relative'（左转/直行/右转，
  // 不存在非法动作，天然与绝对朝向解耦，利于跨尺寸泛化）
  actionMode?: 'absolute' | 'relative',
  // absolute 模式下反向输入的处理：'ignore'（默认，静默替换为当前方向）|
  // 'penalty'（替换之外额外加 illegalReward）
  illegalAction?: 'ignore' | 'penalty',
  illegalReward?: number,
  // 初始蛇长：固定值或 [min, max] 随机；缺省 1
  snakeLen?: SnakeLenCount,
  // 障碍生成策略：'uniform'（默认，均匀随机）| 'reachable'（BFS 保证食物与蛇头连通）
  barrierPlacement?: 'uniform' | 'reachable',
  // 观察编码：'full'（默认，完整地图）| 'window'（局部窗口+全局标量）|
  // 'ray'（8 向射线+全局标量）。后两者输出形状与地图尺寸无关
  observationType?: 'full' | 'window' | 'ray',
  // window 模式边长（奇数，偶数自动 +1），默认 15
  windowSize?: number,
}

const defaultConfig: SnakeGameConfig = {
  col: 10,
  row: 10,
  snakeColor: '#fff',
  foodColor: '#ff0',
  bgColor: '#000',
  barrierColor: '#888',
  debug: false,
  foodReward: 1,
  stepReward: 0,
  deathReward: 0,
  winReward: 0,
  maxSteps: 0,
  actionMode: 'absolute',
  illegalAction: 'ignore',
  illegalReward: -0.1,
  barrierPlacement: 'uniform',
  observationType: 'full',
  windowSize: 15,
};

export class SnakeGameEnv implements Env<
  SnakeDirection | SnakeRelativeAction,
  SnakeAnyObservation
> {
  // 无头模式（canvas 传 null）下 canvas/ctx 为 null，游戏逻辑完全不依赖 DOM
  canvas: HTMLCanvasElement | null;
  ctx: CanvasRenderingContext2D | null;
  protected config: SnakeGameConfig;
  // 当前 RNG：默认全局随机源，reset(seed) 后切换为确定性 RNG
  protected rng: RNG = random;
  snake: Snake = null;
  food: Food = null;
  barriers: MapNode[] = [];
  gridA: number = 0;
  score: number = 0;
  steps: number = 0;
  map: Uint8Array = null;

  constructor(
    canvas: string | HTMLCanvasElement | null = 'snake_container',
    config: Partial<SnakeGameConfig> = {},
  ) {
    this.config = {
      ...defaultConfig,
      ...config,
    };
    if (canvas === null) {
      // 无头模式：col/row 是纯逻辑量，跳过所有渲染初始化
      this.canvas = null;
      this.ctx = null;
      this.gridA = 0;
    } else {
      this.canvas = typeof canvas === 'string'
        ? document.getElementById(canvas) as HTMLCanvasElement
        : canvas;
      if (this.canvas == null) throw new Error(`canvas ${canvas} not found`);
      const ctx = this.canvas.getContext('2d');
      if (!ctx) throw new Error('get canvas context failed');
      this.ctx = ctx;
      this.config.col = Math.min(this.config.col, this.canvas.width);
      this.config.row = Math.min(this.config.row, this.canvas.height);
      this.canvas.width -= this.canvas.width % this.config.col;
      this.gridA = this.canvas.width / this.config.col;
      this.canvas.height = this.config.row * this.gridA;
    }
    this.reset(this.config.seed);
  }

  randomNode() {
    const width = this.config.col;
    const height = this.config.row;
    let col = this.rng.randRange(width - 1);
    let row = this.rng.randRange(height - 1);
    while (this.map[row * width + col] !== NodeType.Empty) {
      col = this.rng.randRange(width - 1);
      row = this.rng.randRange(height - 1);
    }
    return new MapNode(col, row);
  }

  //#region Generate
  protected genMap() {
    // Empty = 0，零填充即全空地图
    this.map = new Uint8Array(this.config.col * this.config.row);
  }

  protected genSnake() {
    const { col, row, snakeLen } = this.config;
    let len = Array.isArray(snakeLen)
      ? this.rng.randRange(
        Math.min(snakeLen[0], snakeLen[1]),
        Math.max(snakeLen[0], snakeLen[1]),
      )
      : snakeLen ?? 1;
    // 蛇身沿运动反方向直线排布，最长不超过地图短边
    len = Math.min(Math.max(len, 1), Math.min(col, row));

    const direction: SnakeDirection = typeof this.config.direction === 'number'
      && this.config.direction >= SnakeDirection.MIN
      && this.config.direction <= SnakeDirection.MAX
      ? this.config.direction
      : this.rng.randRange(SnakeDirection.MIN, SnakeDirection.MAX) as SnakeDirection;

    // 蛇身节点 i 位于 head - delta * i。直接计算合法的头部取值区间，
    // 保证整条蛇落在界内（genSnake 时地图全空，无需检查占用）
    const { col: dCol, row: dRow } = DirectionDelta[direction];
    const extent = len - 1;
    const col0 = dCol > 0 ? dCol * extent : 0;
    const col1 = dCol < 0 ? col - 1 + dCol * extent : col - 1;
    const row0 = dRow > 0 ? dRow * extent : 0;
    const row1 = dRow < 0 ? row - 1 + dRow * extent : row - 1;
    const head = new MapNode(this.rng.randRange(col0, col1), this.rng.randRange(row0, row1));

    this.snake = new Snake({
      head,
      ctx: this.ctx,
      color: this.config.snakeColor as string,
      direction,
      snakeLen: len,
      gridA: this.gridA,
      rng: this.rng,
    });
    this.snake.nodes.forEach((node, index) => {
      this.map[node.row * col + node.col] = index === 0
        ? NodeType.SnakeHead
        : NodeType.SnakeBody;
    });
  }

  protected genFood() {
    const node = this.config.barrierPlacement === 'reachable'
      ? this.randomReachableNode()
      : this.randomNode();
    this.food = new Food(
      node,
      this.ctx,
      this.gridA / 2,
      this.config.foodColor as string,
      this.config.bgColor as string,
    );
    this.map[this.food.row * this.config.col + this.food.col] = NodeType.Food;
  }

  // BFS 遍历蛇头可达的所有非障碍格（蛇身可穿越——蛇会移动），
  // 从可达的空格中均匀挑一个放食物，保证开局食物必然可达。
  // 极端情况下（蛇头被障碍完全围死、无可达空格）退回均匀随机。
  protected randomReachableNode(): MapNode {
    const { col, row } = this.config;
    const visited = new Uint8Array(col * row);
    const headIdx = this.snake.head.row * col + this.snake.head.col;
    const queue = [headIdx];
    visited[headIdx] = 1;
    const candidates: number[] = [];
    const visit = (next: number) => {
      if (!visited[next] && this.map[next] !== NodeType.Barrier) {
        visited[next] = 1;
        queue.push(next);
      }
    };
    for (let qi = 0; qi < queue.length; qi += 1) {
      const idx = queue[qi];
      const r = Math.floor(idx / col);
      const c = idx % col;
      if (this.map[idx] === NodeType.Empty) candidates.push(idx);
      if (r > 0) visit(idx - col);
      if (r < row - 1) visit(idx + col);
      if (c > 0) visit(idx - 1);
      if (c < col - 1) visit(idx + 1);
    }
    if (candidates.length === 0) return this.randomNode();
    const pick = candidates[this.rng.randRange(0, candidates.length - 1)];
    return new MapNode(pick % col, Math.floor(pick / col));
  }

  protected genBarriers() {
    this.barriers = [];
    const { barriers } = this.config;
    if (barriers == null) return;

    let count: number;
    if (Array.isArray(barriers)) {
      const min = Math.min(barriers[0], barriers[1]);
      const max = Math.max(barriers[0], barriers[1]);
      count = this.rng.randRange(min, max);
    } else {
      count = barriers;
    }

    // 为食物至少保留一个空格
    const maxCount = this.config.col * this.config.row - this.snake.length - 1;
    count = Math.min(Math.max(count, 0), maxCount);

    for (let i = 0; i < count; i += 1) {
      const node = this.randomNode();
      this.barriers.push(node);
      this.map[node.row * this.config.col + node.col] = NodeType.Barrier;
    }
  }
  //#endregion

  protected getObservation(): SnakeAnyObservation {
    const { observationType } = this.config;
    if (observationType === 'window' || observationType === 'ray') {
      const inputs = {
        col: this.config.col,
        row: this.config.row,
        head: this.snake.head,
        food: this.food,
        direction: this.snake.getDirection(),
        snakeLen: this.snake.length,
        barrierCount: this.barriers.length,
        map: this.map,
      };
      return observationType === 'window'
        ? buildWindowObservation({ ...inputs, windowSize: this.config.windowSize })
        : buildRayObservation(inputs);
    }
    return {
      type: 'full',
      map: this.map,
      col: this.config.col,
      row: this.config.row,
      snake: this.snake,
      food: this.food,
      barriers: this.barriers,
    };
  }

  reset(seed?: number) {
    // gym 惯例：仅在显式传入 seed 时重新播种，否则沿用当前 RNG
    if (seed !== undefined) this.rng = createRNG(seed);
    this.genMap();
    this.genSnake();
    this.genBarriers();
    this.genFood();
    this.score = 0;
    this.steps = 0;
    return { observation: this.getObservation() };
  }

  fillCanvas() {
    if (!this.ctx) return;
    this.ctx.fillStyle = this.config.bgColor as string;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  render() {
    this.fillCanvas();
    this.food.draw();
    this.drawBarriers();
    this.snake.draw();
  }

  protected drawBarriers() {
    if (this.barriers.length === 0 || !this.ctx) return;
    this.ctx.fillStyle = this.config.barrierColor as string;
    this.ctx.beginPath();
    this.barriers.forEach((node) => {
      this.ctx.rect(
        node.col * this.gridA,
        node.row * this.gridA,
        this.gridA,
        this.gridA,
      );
    });
    this.ctx.fill();
  }

  protected gameOver() {
    if (this.config.debug) console.log('game over!', this.score);
  }

  protected gameWin() {
    if (this.config.debug) console.log('you win!', this.score);
  }

  protected moveSnake(direction: SnakeDirection): SnakeDeathCause | null {
    const width = this.config.col;
    let { head } = this.snake;
    this.map[head.row * width + head.col] = this.snake.length === 1
      ? NodeType.Empty
      : NodeType.SnakeBody;
    const { tail } = this.snake;
    this.map[tail.row * width + tail.col] = NodeType.Empty;
    head = this.snake.move(direction);
    // map 查表判定碰撞：蛇头原格已改为 SnakeBody、蛇尾已清空，
    // 因此越界 / 障碍 / 蛇身（追尾合法）；O(1) 而非 O(蛇长)
    if (head.col < 0 || head.row < 0
      || head.col >= this.config.col || head.row >= this.config.row) {
      this.gameOver();
      return 'wall';
    }
    const cell = this.map[head.row * width + head.col];
    if (cell === NodeType.Barrier) {
      this.gameOver();
      return 'barrier';
    }
    if (cell === NodeType.SnakeBody) {
      this.gameOver();
      return 'body';
    }
    this.map[head.row * width + head.col] = NodeType.SnakeHead;
    return null;
  }

  protected eatFood(direction: SnakeDirection) {
    const width = this.config.col;
    this.map[this.snake.head.row * width + this.snake.head.col] = NodeType.SnakeBody;
    this.map[this.food.row * width + this.food.col] = NodeType.SnakeHead;
    this.snake.eat(direction, this.food);
  }

  // 蛇占满所有可用格子时,没有空位再放食物,即达成胜利
  protected isWin() {
    return this.snake.length
      >= this.config.col * this.config.row - this.barriers.length;
  }

  step(action: SnakeDirection | SnakeRelativeAction) {
    let illegal = false;
    let direction: SnakeDirection;
    if (this.config.actionMode === 'relative') {
      direction = relativeToAbsolute(
        this.snake.getDirection(),
        action as SnakeRelativeAction,
      );
    } else {
      direction = action as SnakeDirection;
      if (direction === opposite(this.snake.getDirection())) {
        illegal = true;
        direction = this.snake.getDirection();
      }
    }

    let reward = this.config.stepReward as number;
    if (illegal && this.config.illegalAction === 'penalty') {
      reward += this.config.illegalReward as number;
    }
    let terminated = false;
    let truncated = false;
    let cause: SnakeDeathCause | undefined;
    const head = this.snake.moveHead(direction);
    if (head.equals(this.food)) {
      this.eatFood(direction);
      reward += this.config.foodReward as number;
      this.score += this.config.foodReward as number;
      if (this.isWin()) {
        reward += this.config.winReward as number;
        this.gameWin();
        terminated = true;
        cause = 'win';
      } else {
        this.genFood();
      }
    } else {
      const deathCause = this.moveSnake(direction);
      if (deathCause != null) {
        reward += this.config.deathReward as number;
        terminated = true;
        cause = deathCause;
      }
    }
    this.steps += 1;
    const maxSteps = this.config.maxSteps as number;
    if (!terminated && maxSteps > 0 && this.steps >= maxSteps) {
      truncated = true;
      cause = 'timeout';
    }
    const info: SnakeStepInfo = {
      cause,
      illegal,
      score: this.score,
      steps: this.steps,
    };
    return {
      reward,
      done: terminated || truncated,
      terminated,
      truncated,
      observation: this.getObservation(),
      info,
    };
  }

  close(): void {
    if (!this.ctx) return;
    window.requestAnimationFrame(() => {
      this.render();
    });
  }
}

export default SnakeGameEnv;
