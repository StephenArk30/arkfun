import { MapNode, random } from './common';

export enum SnakeDirection {
  MIN,
  UP = SnakeDirection.MIN,
  DOWN,
  LEFT,
  RIGHT,
  MAX = SnakeDirection.RIGHT,
}

export interface SnakeConfig {
  head: MapNode;
  ctx: CanvasRenderingContext2D;
  direction?: SnakeDirection;
  snakeLen?: number; // 初始长度，>= 1
  color: string;
  gridA: number;
}

export const DirectionDelta = {
  // [Direction]: [deltaCol, deltaRow]
  [SnakeDirection.UP]: new MapNode(0, -1),
  [SnakeDirection.DOWN]: new MapNode(0, 1),
  [SnakeDirection.LEFT]: new MapNode(-1, 0),
  [SnakeDirection.RIGHT]: new MapNode(1, 0),
};

export function opposite(direction: SnakeDirection) {
  switch (direction) {
  case SnakeDirection.UP:
    return SnakeDirection.DOWN;
  case SnakeDirection.DOWN:
    return SnakeDirection.UP;
  case SnakeDirection.LEFT:
    return SnakeDirection.RIGHT;
  case SnakeDirection.RIGHT:
    return SnakeDirection.LEFT;
  default:
    return direction;
  }
}

export default class Snake {
  protected ctx: CanvasRenderingContext2D;
  protected direction: SnakeDirection;
  nodes: MapNode[] = [];
  head: MapNode;
  color: string;
  protected gridA: number;

  constructor(config: SnakeConfig) {
    this.ctx = config.ctx;
    this.color = config.color;
    this.gridA = config.gridA;
    this.direction = typeof config.direction === 'number'
      && config.direction >= SnakeDirection.MIN
      && config.direction <= SnakeDirection.MAX
      ? config.direction
      : random.randRange(SnakeDirection.MIN, SnakeDirection.MAX);
    this.nodes.push(config.head);
    [this.head] = this.nodes;

    if (config.snakeLen) {
      for (let i = 1; i < config.snakeLen; i += 1) {
        this.nodes.push(new MapNode(
          this.head.col - DirectionDelta[this.direction].col,
          this.head.row - DirectionDelta[this.direction].row,
        ));
      }
    }
  }

  moveHead(direction: SnakeDirection): MapNode {
    const head = new MapNode(this.head.col, this.head.row);
    head.move(...DirectionDelta[direction].toArray());
    return head;
  }

  move(direction?: SnakeDirection): MapNode {
    if (typeof direction === 'number') this.direction = direction;
    this.head = this.moveHead(this.direction);
    this.nodes.unshift(this.head);
    this.nodes.pop();
    return this.head;
  }

  includes(node: MapNode): boolean {
    for (let i = 0; i < this.nodes.length; i += 1) {
      if (this.nodes[i].equals(node)) return true;
    }
    return false;
  }

  draw() {
    this.ctx.fillStyle = this.color;
    this.nodes.forEach((node) => {
      this.ctx.rect(
        node.col * this.gridA,
        node.row * this.gridA,
        this.gridA,
        this.gridA,
      );
    });
    this.ctx.fill();
  }

  eat(direction: SnakeDirection, food: MapNode) {
    this.direction = direction;
    this.nodes.unshift(new MapNode(food.col, food.row));
    [this.head] = this.nodes;
    return this.head;
  }

  getDirection() {
    return this.direction;
  }

  get tail() {
    return this.nodes[this.nodes.length - 1];
  }

  get length() {
    return this.nodes.length;
  }
}
