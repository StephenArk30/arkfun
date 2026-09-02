export interface Env<ActType, ObsType, RenderFrame> {
  step: (action: ActType) => {
    observation: ObsType;
    reward: number;
    done: boolean;
    // gymnasium 语义：terminated = 真实终止（死亡/胜利），truncated = 超时截断
    terminated: boolean;
    truncated: boolean;
    info?: any;
  };

  reset: (
    seed?: number,
    returnInfo?: boolean,
    options?: any,
  ) => {
    observation: ObsType;
    info?: any;
  };

  render: (mode?: 'human' | 'single_rgb_array' | 'rgb_array' | 'ansi') => RenderFrame | RenderFrame[];

  close: () => void;
}

export type AIFunction<ActType, ObsType> = (obs: ObsType) => Promise<ActType>;
