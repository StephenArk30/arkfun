// onnxruntime 最小接口：由调用方注入（demo 中来自 CDN 全局 `ort`，
// 测试中为 mock），本模块保持纯逻辑、零依赖，便于单测与 tree-shaking。
export type OrtTensor = {
  data: ArrayLike<number>;
};

export type OrtSession = {
  run: (feeds: Record<string, unknown>) => Promise<Record<string, OrtTensor>>;
};

export type OrtLike = {
  Tensor: new (type: string, data: Float32Array, dims: number[]) => unknown;
  InferenceSession: {
    create: (model: ArrayBuffer | Uint8Array | string) => Promise<OrtSession>;
  };
};

// 与 src/training/bridge.py 的 SCALAR_COUNT、snakegame 的 SCALAR_COUNT 保持一致
export const SCALAR_COUNT = 11;

export type OnnxSnakePlayer = {
  // 输入 window（NHWC Float32Array，长度 windowSize² × 3）与 scalars（长度 11），
  // 返回 argmax 后的动作（0 左转 / 1 直行 / 2 右转）
  act: (window: Float32Array, scalars: Float32Array) => Promise<number>;
};

export const argmax = (data: ArrayLike<number>): number => {
  let best = 0;
  for (let i = 1; i < data.length; i += 1) {
    if (data[i] > data[best]) best = i;
  }
  return best;
};

export const createOnnxSnakePlayer = async (
  ort: OrtLike,
  model: ArrayBuffer | Uint8Array | string,
  windowSize = 15,
): Promise<OnnxSnakePlayer> => {
  const session = await ort.InferenceSession.create(model);
  return {
    async act(window: Float32Array, scalars: Float32Array): Promise<number> {
      const feeds = {
        window: new ort.Tensor('float32', window, [1, windowSize, windowSize, 3]),
        scalars: new ort.Tensor('float32', scalars, [1, SCALAR_COUNT]),
      };
      const out = await session.run(feeds);
      // 输出名与 src/training/export.py 的 output_names 对齐
      return argmax(out.logits.data);
    },
  };
};
