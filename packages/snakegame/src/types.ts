export interface Env<ActType, ObsType, RenderFrame> {
  step: (action: ActType) => {
    observation: ObsType;
    reward: number;
    done: boolean;
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

export type AIFunction<ActType, ObsType> = (obs: ObsType) => ActType | Promise<ActType>;
