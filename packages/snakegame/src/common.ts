export class MapNode {
  constructor(
    public col: number,
    public row: number,
  ) {}

  move(col: number, row: number) {
    this.col += col;
    this.row += row;
  }

  toArray(): [number, number] {
    return [this.col, this.row];
  }

  equals(node: MapNode) {
    return this.col === node.col && this.row === node.row;
  }
}

// 伪随机数发生器接口：与全局 random 行为一致，可注入实现确定性采样
export type RNG = {
  randRange: (min: number, max?: number) => number;
  choice: (arr: any[]) => any;
};

// randRange 返回 [min, max] 内的整数（含边界）；单个参数时视作 max
const makeRNG = (nextFloat: () => number): RNG => {
  const rng: RNG = {
    randRange(min: number, max?: number): number {
      if (max === undefined) return rng.randRange(0, min);
      return Math.floor(
        nextFloat() * (Math.floor(max) - Math.ceil(min) + 1),
      ) + Math.ceil(min);
    },
    choice: (arr: any[]) => arr[Math.floor(nextFloat() * arr.length)],
  };
  return rng;
};

// 惰性取 Math.random，保证运行时替换（如测试 spy）仍然生效
export const random: RNG = makeRNG(() => Math.random());

// mulberry32：轻量确定性 PRNG，供 reset(seed) 复现实验使用
export const createRNG = (seed: number): RNG => {
  let state = seed >>> 0;
  const nextFloat = () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return makeRNG(nextFloat);
};

export enum NodeType {
  Empty,
  Food,
  SnakeHead,
  SnakeBody,
  Barrier,
}

export default {
  MapNode,
  util: {
    random,
  },
};
