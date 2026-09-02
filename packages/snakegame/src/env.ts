import Snake, { opposite, SnakeDirection } from './snake';
import { createRNG, MapNode, NodeType, random, RNG } from './common';
import Food from './food';
import { Env } from './types';

export type SnakeObservation = {
  map: NodeType[][];
  snake: Snake;
  food: MapNode;
  barriers: MapNode[];
};

// 障碍物数量：固定数量，或 [min, max] 区间内随机（含边界，min > max 时自动交换）
export type BarrierCount = number | [number, number];

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
};

export class SnakeGameEnv implements Env<SnakeDirection, SnakeObservation, any> {
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
  map: NodeType[][] = null;

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
    let col = this.rng.randRange(this.config.col as number - 1);
    let row = this.rng.randRange(this.config.row as number - 1);
    while (this.map[row][col] !== NodeType.Empty) {
      col = this.rng.randRange(this.config.col as number - 1);
      row = this.rng.randRange(this.config.row as number - 1);
    }
    return new MapNode(col, row);
  }

  //#region Generate
  protected genMap() {
    this.map = Array.from({ length: this.config.row }).map(() => {
      const row = Array.from({ length: this.config.col });
      for (let col = 0; col < this.config.col; col += 1) row[col] = NodeType.Empty;
      return row as NodeType[];
    });
  }

  protected genSnake() {
    this.snake = new Snake({
      head: this.randomNode(),
      ctx: this.ctx,
      color: this.config.snakeColor as string,
      direction: this.config.direction,
      gridA: this.gridA,
      rng: this.rng,
    });
    this.snake.nodes.forEach((node, index) => {
      let type = NodeType.SnakeBody;
      if (index === 0) type = NodeType.SnakeHead;
      this.map[node.row][node.col] = type;
    });
  }

  protected genFood() {
    this.food = new Food(
      this.randomNode(),
      this.ctx,
      this.gridA / 2,
      this.config.foodColor as string,
      this.config.bgColor as string,
    );
    this.map[this.food.row][this.food.col] = NodeType.Food;
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
      this.map[node.row][node.col] = NodeType.Barrier;
    }
  }
  //#endregion

  protected getObservation() {
    return {
      map: this.map,
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

  protected moveSnake(direction: SnakeDirection) {
    let { head } = this.snake;
    this.map[head.row][head.col] = this.snake.length === 1 ? NodeType.Empty : NodeType.SnakeBody;
    const { tail } = this.snake;
    this.map[tail.row][tail.col] = NodeType.Empty;
    head = this.snake.move(direction);
    if (head.col < 0 || head.row < 0
      || head.col >= this.config.col || head.row >= this.config.row
      || this.map[head.row][head.col] === NodeType.Barrier
      || this.snake.nodes.some((node, index) => index !== 0 && node.equals(head))) {
      this.gameOver();
      return true;
    }
    this.map[head.row][head.col] = NodeType.SnakeHead;
    return false;
  }

  protected eatFood(direction: SnakeDirection) {
    this.map[this.snake.head.row][this.snake.head.col] = NodeType.SnakeBody;
    this.map[this.food.row][this.food.col] = NodeType.SnakeHead;
    this.snake.eat(direction, this.food);
  }

  // 蛇占满所有可用格子时,没有空位再放食物,即达成胜利
  protected isWin() {
    return this.snake.length
      >= (this.config.col as number) * (this.config.row as number) - this.barriers.length;
  }

  step(action: SnakeDirection) {
    if (action === opposite(this.snake.getDirection())) {
      action = this.snake.getDirection();
    }

    let reward = this.config.stepReward as number;
    let terminated = false;
    let truncated = false;
    const head = this.snake.moveHead(action);
    if (head.equals(this.food)) {
      this.eatFood(action);
      reward += this.config.foodReward as number;
      this.score += this.config.foodReward as number;
      if (this.isWin()) {
        reward += this.config.winReward as number;
        this.gameWin();
        terminated = true;
      } else {
        this.genFood();
      }
    } else if (this.moveSnake(action)) {
      reward += this.config.deathReward as number;
      this.gameOver();
      terminated = true;
    }
    this.steps += 1;
    const maxSteps = this.config.maxSteps as number;
    if (!terminated && maxSteps > 0 && this.steps >= maxSteps) {
      truncated = true;
    }
    return {
      reward,
      done: terminated || truncated,
      terminated,
      truncated,
      observation: this.getObservation(),
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
