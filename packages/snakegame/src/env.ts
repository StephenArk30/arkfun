import Snake, { opposite, SnakeDirection } from './snake';
import { MapNode, NodeType, random } from './common';
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
}

const defaultConfig: SnakeGameConfig = {
  col: 10,
  row: 10,
  snakeColor: '#fff',
  foodColor: '#ff0',
  bgColor: '#000',
  barrierColor: '#888',
};

export class SnakeGameEnv implements Env<SnakeDirection, SnakeObservation, any> {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  protected config: SnakeGameConfig;
  snake: Snake = null;
  food: Food = null;
  barriers: MapNode[] = [];
  gridA: number = 0;
  score: number = 0;
  map: NodeType[][] = null;

  constructor(
    canvas: string | HTMLCanvasElement = 'snake_container',
    config: Partial<SnakeGameConfig> = {},
  ) {
    this.canvas = typeof canvas === 'string'
      ? document.getElementById(canvas) as HTMLCanvasElement
      : canvas;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('get canvas context failed');
    this.ctx = ctx;
    this.config = {
      ...defaultConfig,
      ...config,
    };
    this.config.col = Math.min(this.config.col, this.canvas.width);
    this.config.row = Math.min(this.config.row, this.canvas.height);
    this.canvas.width -= this.canvas.width % this.config.col;
    this.gridA = this.canvas.width / this.config.col;
    this.canvas.height = this.config.row * this.gridA;
    this.reset();
  }

  randomNode() {
    let col = random.randRange(this.config.col as number - 1);
    let row = random.randRange(this.config.row as number - 1);
    // genSnake 生成新蛇前地图为全空，此时仍需避让上一局的旧蛇
    while ((this.snake != null && this.snake.includes(new MapNode(col, row)))
      || this.map[row][col] !== NodeType.Empty) {
      col = random.randRange(this.config.col as number - 1);
      row = random.randRange(this.config.row as number - 1);
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
      count = random.randRange(min, max);
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

  reset() {
    this.genMap();
    this.genSnake();
    this.genBarriers();
    this.genFood();
    this.score = 0;
    return { observation: this.getObservation() };
  }

  fillCanvas() {
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
    if (this.barriers.length === 0) return;
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
    console.log('game over!', this.score);
  }

  protected gameWin() {
    console.log('you win!', this.score);
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

    let reward = 0;
    let done = false;
    const head = this.snake.moveHead(action);
    if (head.equals(this.food)) {
      this.eatFood(action);
      reward += 1;
      this.score += reward;
      if (this.isWin()) {
        this.gameWin();
        done = true;
      } else {
        this.genFood();
      }
    } else {
      done = this.moveSnake(action);
    }
    return {
      reward,
      done,
      observation: this.getObservation(),
    };
  }

  close(): void {
    window.requestAnimationFrame(() => {
      this.render();
    });
  }
}

export default SnakeGameEnv;
