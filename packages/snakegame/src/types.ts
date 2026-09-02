// Gym 风格环境接口，与 SnakeGameEnv 实际签名对齐：
// - step 返回 gymnasium 语义的 terminated / truncated
// - reset(seed) 仅在显式传入 seed 时重新播种
export interface Env<ActType, ObsType> {
  step: (action: ActType) => {
    observation: ObsType;
    reward: number;
    done: boolean;
    // terminated = 真实终止（死亡/胜利）；truncated = 超时截断
    terminated: boolean;
    truncated: boolean;
    info?: any;
  };

  reset: (seed?: number) => {
    observation: ObsType;
    info?: any;
  };

  render: () => void;

  close: () => void;
}

export type AIFunction<ActType, ObsType> = (obs: ObsType) => Promise<ActType>;
