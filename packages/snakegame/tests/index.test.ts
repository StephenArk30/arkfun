import '../src/types';
import '../src/snakeAI/common';
import * as snakegame from '../src';

it('re-exports the public API', () => {
  expect(snakegame.SnakeGameEnv).toBeDefined();
  expect(snakegame.PlaySnakeGame).toBeInstanceOf(Function);
  expect(snakegame.PlaySnakeGameHuman).toBeInstanceOf(Function);
});
