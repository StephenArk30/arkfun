import { MapNode } from './common';

export default class Food extends MapNode {
  constructor(
    node: MapNode,
    protected ctx: CanvasRenderingContext2D,
    protected radius: number,
    protected color: string = '#fff',
    protected bgColor: string = '#000',
  ) {
    super(node.col, node.row);
  }

  draw() {
    this.ctx.fillStyle = this.color;
    this.ctx.beginPath();
    this.ctx.arc(
      this.col * this.radius * 2 + this.radius,
      this.row * this.radius * 2 + this.radius,
      this.radius,
      0,
      Math.PI * 2,
      true,
    );
    this.ctx.fill();
  }

  clear() {
    this.ctx.fillStyle = this.bgColor;
    this.ctx.fillRect(this.col, this.row, this.radius * 2, this.radius * 2);
  }
}
