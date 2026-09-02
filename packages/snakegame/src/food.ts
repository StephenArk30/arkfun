import { MapNode } from './common';

export default class Food extends MapNode {
  constructor(
    node: MapNode,
    // 无头模式下 ctx 为 null，Food 只承担位置逻辑
    protected ctx: CanvasRenderingContext2D | null,
    protected radius: number,
    protected color: string = '#fff',
    protected bgColor: string = '#000',
  ) {
    super(node.col, node.row);
  }

  draw() {
    if (!this.ctx) return;
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
    if (!this.ctx) return;
    this.ctx.fillStyle = this.bgColor;
    this.ctx.fillRect(
      this.col * this.radius * 2,
      this.row * this.radius * 2,
      this.radius * 2,
      this.radius * 2,
    );
  }
}
