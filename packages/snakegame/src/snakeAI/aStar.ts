import { SnakeAIFunction } from './common';
import { DirectionDelta, opposite, SnakeDirection } from '../snake';
import { MapNode, NodeType } from '../common';

const manhattan = (
  node1: MapNode,
  node2: MapNode,
) => Math.abs(node1.col - node2.col) + Math.abs(node1.row - node2.row);

const RANDOM_THRESHOLD = 0.9;
const RANDOM_MAX = 0.1;

// in case two directions have equal score
const random = () => (
  Math.random() < RANDOM_THRESHOLD ? (RANDOM_MAX - 0.01) * Math.random() : 0
);

const isBarrier = (x: number, y: number, map: NodeType[][]): 1 | 0 => {
  if (x < 0 || x >= map[0].length
    || y < 0 || y >= map.length
    || map[y][x] === NodeType.Barrier
    || [NodeType.SnakeHead, NodeType.SnakeBody].includes(map[y][x])) {
    return 1;
  }
  return 0;
};

const getVDirection = (direction: SnakeDirection) => (
  [SnakeDirection.UP, SnakeDirection.DOWN].includes(direction)
    ? [SnakeDirection.LEFT, SnakeDirection.RIGHT]
    : [SnakeDirection.UP, SnakeDirection.DOWN]
);

// a*: f(n) = g(n) + h(n)
export const aStar: SnakeAIFunction = async (obs) => {
  const [x, y] = obs.snake.head.toArray();

  const Fs = {
    [SnakeDirection.UP]: 0,
    [SnakeDirection.DOWN]: 0,
    [SnakeDirection.LEFT]: 0,
    [SnakeDirection.RIGHT]: 0,
  };
  for (let direction = SnakeDirection.MIN; direction <= SnakeDirection.MAX; direction += 1) {
    if (direction !== opposite(obs.snake.getDirection())) {
      const [deltaX, deltaY] = DirectionDelta[direction].toArray();
      const [nextX, nextY] = [x + deltaX, y + deltaY];
      const g = isBarrier(nextX, nextY, obs.map);
      // the snake trend to move cling to the wall or itself,
      // to have more space
      getVDirection(direction).forEach((vDirection) => {
        Fs[vDirection] += g;
      });
      const h = -manhattan(new MapNode(nextX, nextY), obs.food);
      // the max difference between to directions is 2
      const F = g * (-2 - RANDOM_MAX) + h + random();
      Fs[direction] += F;
    }
  }

  let maxDirection = obs.snake.getDirection();
  for (let direction = SnakeDirection.MIN; direction <= SnakeDirection.MAX; direction += 1) {
    if (direction !== opposite(obs.snake.getDirection())
      && Fs[direction] > Fs[maxDirection]) {
      maxDirection = direction;
    }
  }
  return maxDirection;
};
