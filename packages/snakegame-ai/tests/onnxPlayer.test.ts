import {
  argmax,
  createOnnxSnakePlayer,
  SCALAR_COUNT,
} from '../src/index';
import type { OrtLike, OrtSession } from '../src/index';

class FakeTensor {
  constructor(
    public type: string,
    public data: Float32Array,
    public dims: number[],
  ) {}
}

const makeOrt = (
  logits: number[],
  onRun?: (feeds: Record<string, unknown>) => void,
): OrtLike => {
  const session: OrtSession = {
    run: async (feeds) => {
      if (onRun) onRun(feeds);
      return { logits: { data: new Float32Array(logits) } };
    },
  };
  return {
    Tensor: FakeTensor,
    InferenceSession: {
      create: async () => session,
    },
  } as unknown as OrtLike;
};

describe('argmax', () => {
  it('returns the index of the maximum value', () => {
    expect(argmax(new Float32Array([0.1, 0.9, 0.3]))).toBe(1);
    expect(argmax([1, 2, 3])).toBe(2);
  });

  it('keeps the first index on ties', () => {
    expect(argmax(new Float32Array([0.5, 0.5, 0.2]))).toBe(0);
  });

  it('handles single element arrays', () => {
    expect(argmax(new Float32Array([0.7]))).toBe(0);
  });
});

describe('createOnnxSnakePlayer', () => {
  const windowSize = 15;
  const window = new Float32Array(windowSize * windowSize * 3);
  const scalars = new Float32Array(SCALAR_COUNT);

  it('feeds NHWC window and scalars, returns argmax action', async () => {
    const player = await createOnnxSnakePlayer(
      makeOrt([0.2, 0.7, 0.1]),
      'model.onnx',
      windowSize,
    );
    await expect(player.act(window, scalars)).resolves.toBe(1);
  });

  it('defaults windowSize to 15 when omitted', async () => {
    const player = await createOnnxSnakePlayer(makeOrt([0.9, 0.1, 0.3]), 'm.onnx');
    await expect(player.act(window, scalars)).resolves.toBe(0);
  });

  it('builds tensors with expected names and shapes', async () => {
    let captured: Record<string, FakeTensor> | null = null;
    const ort = makeOrt([1, 0, 0], (feeds) => {
      captured = feeds as Record<string, FakeTensor>;
    });

    const player = await createOnnxSnakePlayer(ort, new ArrayBuffer(8), windowSize);
    await player.act(window, scalars);

    expect(captured).not.toBeNull();
    expect(captured!.window.dims).toEqual([1, windowSize, windowSize, 3]);
    expect(captured!.window.data).toBe(window);
    expect(captured!.scalars.dims).toEqual([1, SCALAR_COUNT]);
    expect(captured!.scalars.type).toBe('float32');
  });
});
