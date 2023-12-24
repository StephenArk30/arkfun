import SnakeGameEnv, { SnakeGameConfig, SnakeObservation } from './env';
import snakeAI from './snakeAI/index';
import { NodeType, random } from './common';
import { SnakeDirection } from './snake';

const HEAD_STR_MAP = {
  [SnakeDirection.UP]: '^',
  [SnakeDirection.DOWN]: 'v',
  [SnakeDirection.LEFT]: '<',
  [SnakeDirection.RIGHT]: '>',
};

export function printMap({ map, snake }: SnakeObservation) {
  let mapStr = ' \t';
  for (let i = 0; i < map[0].length; i += 1) {
    mapStr += `${i}\t`;
  }
  mapStr += '\n';
  for (let i = 0; i < map.length; i += 1) {
    mapStr += `${i}\t`;
    for (let j = 0; j < map[i].length; j += 1) {
      switch (map[i][j]) {
      case NodeType.Food:
        mapStr += 'o';
        break;
      case NodeType.SnakeHead:
        mapStr += HEAD_STR_MAP[snake.getDirection()];
        break;
      case NodeType.SnakeBody:
        mapStr += '+';
        break;
      case NodeType.Barrier:
        mapStr += '*';
        break;
      case NodeType.Empty:
      default:
        mapStr += ' ';
        break;
      }
      mapStr += '\t';
    }
    mapStr += '\n';
  }
  console.log(mapStr);
}

export function PlaySnakeGame(
  canvas: string | HTMLCanvasElement = 'snake_container',
  config: Partial<SnakeGameConfig> = {},
  debug = false,
) {
  const env = new SnakeGameEnv(canvas, config);
  let { observation } = env.reset();
  if (debug) printMap(observation);
  let done = false;
  let action;
  async function performOneFrame() {
    env.render();
    action = await snakeAI(observation);
    const { observation: _obs, done: _done } = env.step(action);
    observation = _obs;
    if (debug) printMap(observation);
    done = _done;
    if (!done) {
      window.setTimeout(() => {
        window.requestAnimationFrame(performOneFrame);
      }, 100);
    } else {
      env.close();
    }
  }
  window.requestAnimationFrame(performOneFrame);
}

export function PlaySnakeGameHuman(
  canvas: string | HTMLCanvasElement = 'snake_container',
  config: Partial<SnakeGameConfig> = {},
) {
  const env = new SnakeGameEnv(canvas, config);
  env.reset();
  let done = false;
  let action = random.randRange(SnakeDirection.MIN, SnakeDirection.MAX);
  const keyboardListener = (event: KeyboardEvent) => {
    switch (event.key) {
    case 'ArrowUp':
      action = SnakeDirection.UP;
      break;
    case 'ArrowDown':
      action = SnakeDirection.DOWN;
      break;
    case 'ArrowLeft':
      action = SnakeDirection.LEFT;
      break;
    case 'ArrowRight':
      action = SnakeDirection.RIGHT;
      break;
    default:
      break;
    }
  };
  window.addEventListener('keydown', keyboardListener);

  function performOneFrame() {
    env.render();
    const { done: _done } = env.step(action);
    done = _done;
    if (!done) {
      setTimeout(() => window.requestAnimationFrame(performOneFrame), 300);
    } else {
      env.close();
      window.removeEventListener('keydown', keyboardListener);
    }
  }
  window.requestAnimationFrame(performOneFrame);
}
