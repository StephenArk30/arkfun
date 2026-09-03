import { SnakeGameEnv, SnakeDirection, SnakeRelativeAction } from '@arkfun/snakegame';
import type { WindowObservation } from '@arkfun/snakegame';
import {
  absoluteToRelative,
  createAStarPlayer,
  createAStarStrategy,
  createOnnxPlayer,
  createOnnxStrategy,
  getStrategy,
  listStrategies,
  registerStrategy,
} from '../src/index';
import type { OrtLike } from '../src/index';

class FakeTensor {
  constructor(
    public type: string,
    public data: Float32Array,
    public dims: number[],
  ) {}
}

const makeOrt = async (): Promise<OrtLike> => ({
  Tensor: FakeTensor,
  InferenceSession: {
    create: async () => ({
      run: async () => ({ logits: { data: new Float32Array([0.1, 0.8, 0.1]) } }),
    }),
  },
} as unknown as OrtLike);

describe('registry', () => {
  it('registers, lists and looks up strategies by id', () => {
    const before = listStrategies().length;
    registerStrategy(createAStarStrategy('test-astar', 'Test A*'));
    expect(listStrategies().length).toBe(before + 1);
    expect(getStrategy('test-astar')?.label).toBe('Test A*');
    expect(getStrategy('missing')).toBeUndefined();
  });

  it('later registration with the same id replaces the earlier one', () => {
    registerStrategy(createAStarStrategy('dup', 'first'));
    registerStrategy(createAStarStrategy('dup', 'second'));
    expect(getStrategy('dup')?.label).toBe('second');
  });
});

describe('absoluteToRelative', () => {
  it('maps forward, left and right turns', () => {
    expect(absoluteToRelative(SnakeDirection.UP, SnakeDirection.UP))
      .toBe(SnakeRelativeAction.Forward);
    expect(absoluteToRelative(SnakeDirection.UP, SnakeDirection.LEFT))
      .toBe(SnakeRelativeAction.TurnLeft);
    expect(absoluteToRelative(SnakeDirection.UP, SnakeDirection.RIGHT))
      .toBe(SnakeRelativeAction.TurnRight);
    // 逆时针链：UP→LEFT→DOWN→RIGHT→UP
    expect(absoluteToRelative(SnakeDirection.LEFT, SnakeDirection.DOWN))
      .toBe(SnakeRelativeAction.TurnLeft);
    expect(absoluteToRelative(SnakeDirection.DOWN, SnakeDirection.RIGHT))
      .toBe(SnakeRelativeAction.TurnLeft);
  });
});

describe('createAStarPlayer', () => {
  it('returns a legal relative action from real headless env state', async () => {
    const env = new SnakeGameEnv(null, {
      col: 12,
      row: 12,
      barriers: 5,
      actionMode: 'relative',
      observationType: 'window',
      seed: 7,
    });
    const { observation } = env.reset(7);
    const { window, scalars } = observation as WindowObservation;
    const player = createAStarPlayer();
    const action = await player({
      env,
      window,
      scalars,
      col: 12,
      row: 12,
    });
    expect([0, 1, 2]).toContain(action);
    // A* 不产生反向动作：任意步数内 step 都不会因非法输入异常
    for (let i = 0; i < 20; i += 1) {
      const out = env.step(action);
      if (out.done) break;
    }
  });
});

describe('createOnnxStrategy', () => {
  const windowSize = 15;
  const window = new Float32Array(windowSize * windowSize * 3);
  const scalars = new Float32Array(11);

  it('loads the model via fetch and ort, then acts', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const strategy = createOnnxStrategy('m', 'Model', makeOrt, 'models/x.onnx');
    const player = await strategy.load();
    expect(fetchMock).toHaveBeenCalledWith('models/x.onnx');
    const action = await player({
      env: null as never, window, scalars, col: 10, row: 10,
    });
    expect(action).toBe(SnakeRelativeAction.Forward); // logits argmax = 1
  });

  it('throws with the HTTP status when the model file is missing', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 }) as never;
    const strategy = createOnnxStrategy('m404', 'Missing', makeOrt, 'models/none.onnx');
    await expect(strategy.load()).rejects.toThrow('HTTP 404');
  });
});

describe('createOnnxPlayer / createAStarStrategy loaders', () => {
  it('createOnnxPlayer delegates to the wrapped player', async () => {
    let called = 0;
    const inner = { act: async () => { called += 1; return 2; } };
    const player = createOnnxPlayer(inner as never);
    const action = await player({
      env: null as never,
      window: new Float32Array(1),
      scalars: new Float32Array(1),
      col: 5,
      row: 5,
    });
    expect(action).toBe(2);
    expect(called).toBe(1);
  });

  it('createAStarStrategy load always succeeds', async () => {
    const strategy = createAStarStrategy('astar-load', 'A*');
    const player = await strategy.load();
    expect(typeof player).toBe('function');
  });
});
