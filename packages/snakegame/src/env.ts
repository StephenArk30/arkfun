import Snake, { opposite, SnakeDirection } from './snake';
import { MapNode, NodeType, random } from './common';
import Food from './food';
import { Env } from './types';

export type SnakeObservation = {
  map: NodeType[][];
  snake: Snake;
  food: MapNode;
};

export type SnakeGameConfig = {
  col: number,
  row: number,
  snakeColor?: string,
  bgColor?: string,
  direction?: SnakeDirection,
}

const defaultConfig: SnakeGameConfig = {
  col: 10,
  row: 10,
  snakeColor: '#fff',
  bgColor: '#000',
};

export class SnakeGameEnv implements Env<SnakeDirection, SnakeObservation, any> {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  protected config: SnakeGameConfig;
  snake: Snake = null;
  food: Food = null;
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
    if (this.snake) {
      while (this.snake.includes(new MapNode(col, row))) {
        col = random.randRange(this.config.col as number - 1);
        row = random.randRange(this.config.row as number - 1);
      }
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
      this.config.snakeColor as string,
      this.config.bgColor as string,
    );
    this.map[this.food.row][this.food.col] = NodeType.Food;
  }
  //#endregion

  protected getObservation() {
    return {
      map: this.map,
      snake: this.snake,
      food: this.food,
    };
  }

  reset() {
    this.genMap();
    this.genSnake();
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
    this.snake.draw();
  }

  protected gameOver() {
    console.log('game over!', this.score);
  }

  protected moveSnake(direction: SnakeDirection) {
    let { head } = this.snake;
    this.map[head.row][head.col] = this.snake.length === 1 ? NodeType.Empty : NodeType.SnakeBody;
    const { tail } = this.snake;
    this.map[tail.row][tail.col] = NodeType.Empty;
    head = this.snake.move(direction);
    if (head.col < 0 || head.row < 0
      || head.col >= this.config.col || head.row >= this.config.row
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
    this.genFood();
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
    } else {
      done = this.moveSnake(action);
    }
    this.score += reward;
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
