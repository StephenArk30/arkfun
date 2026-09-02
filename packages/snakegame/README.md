# snakegame

Snake game in JS

## Features

1. [Gym](https://github.com/openai/gym) like game environment, easy to write AI algorithm
2. All class members are protected, easy to extend
3. 0 dependency
4. Map barriers: fixed count or random count in a range

## Barriers

`SnakeGameEnv` 支持在地图上生成障碍物（`barriers`），障碍物会渲染在画布上、
食物生成时会自动避让、蛇头撞上即游戏结束，内置 A* AI 也会绕开障碍物。

```ts
new SnakeGameEnv(canvas, {
  col: 20,
  row: 20,
  barriers: 5,        // 每局固定生成 5 个障碍物
  barriers: [3, 8],   // 或每局在 [3, 8] 区间内随机生成（min > max 自动交换）
  barrierColor: '#888', // 障碍物颜色，默认 '#888'
  foodColor: '#ff0',    // 食物颜色，默认 '#ff0'
});
```

数量会被自动限制在可用空格内（始终为蛇和食物保留位置）。

## Training (headless mode)

`SnakeGameEnv` 支持无头模式：`canvas` 传 `null` 即可在 Node.js 中无 DOM 运行，
游戏逻辑与渲染完全解耦，适合 RL 训练：

```ts
const env = new SnakeGameEnv(null, {
  col: 15,
  row: 15,
  barriers: [0, 20],   // 每局随机障碍数（domain randomization）
  seed: 42,            // mulberry32 确定性 RNG，实验可复现
  // 奖励塑形（默认：仅吃食物 +1）
  foodReward: 1,
  stepReward: -0.01,
  deathReward: -1,
  winReward: 10,
  maxSteps: 500,       // 超时截断，0 = 不限制
});

env.reset(42);         // gym 惯例：仅显式传 seed 时才重新播种
let done = false;
while (!done) {
  const { reward, done: _done, terminated, truncated } = env.step(action);
  done = _done;        // done = terminated || truncated（gymnasium 语义）
}
```

- `reset(seed)` / 构造配置 `seed`：确定性采样（蛇/食物/障碍布局、随机初始朝向均可复现）
- `step` 返回 `terminated`（死亡/胜利）与 `truncated`（`maxSteps` 超时），
  便于训练时正确 bootstrap 值函数
- `debug: true` 时才会在游戏结束/胜利时打印日志（训练时保持关闭）
- 无头模式下 `render()`/`close()` 均为安全空操作

## Size-independent observations & relative actions (P1)

### 观察编码 `observationType`

默认 `'full'` 返回完整地图。为跨地图尺寸泛化训练，另有两种**输出形状恒定**的编码：

```ts
const env = new SnakeGameEnv(null, {
  col: 15, row: 15,
  barriers: [0, 20],
  observationType: 'window', // 'full'（默认）| 'window' | 'ray'
  windowSize: 15,            // window 模式边长（奇数），默认 15
});

const { observation } = env.reset();
// window 模式：
//   observation.window: Float32Array(windowSize² × 3)，NHWC 通道在最后
//     ch0 障碍（含越界墙）、ch1 蛇身、ch2 食物，以蛇头为中心
//   observation.scalars: Float32Array(11)
//     [0,1] 食物相对方向、[2,5] 朝向 one-hot、[6] 蛇长占比、
//     [7] 障碍占比、[8] 空格率、[9,10] 地图宽高比
// ray 模式：
//   observation.rays: Float32Array(8 × 4)
//     8 个罗盘方向，每向 [1/(1+距离), 墙, 障碍, 蛇身 one-hot]
//   observation.scalars 同上
```

内部地图为行优先展平的 `Uint8Array`（`index = row * col + col`），
`'full'` 观察附带 `col`/`row` 字段方便索引，也便于直接序列化喂给 Python。

### 动作空间 `actionMode`

```ts
const env = new SnakeGameEnv(null, {
  col: 10, row: 10,
  actionMode: 'relative', // 'absolute'（默认，4 方向）| 'relative'
});

import { SnakeRelativeAction } from '@arkfun/snakegame';
env.step(SnakeRelativeAction.TurnLeft);  // 左转（逆时针）
env.step(SnakeRelativeAction.Forward);   // 直行
env.step(SnakeRelativeAction.TurnRight); // 右转（顺时针）
```

- `relative` 模式以蛇当前朝向为基准，**不存在非法动作**，策略天然与绝对朝向解耦
- `absolute` 模式下反向输入默认静默替换为当前方向；配置
  `illegalAction: 'penalty'`（配合 `illegalReward`，默认 -0.1）可额外扣分

### 初始蛇长 `snakeLen`

```ts
snakeLen: 3,       // 固定 3 节
snakeLen: [2, 5],  // 每局在 [2, 5] 内随机
```

上限自动钳制到 `min(col, row)`；蛇身沿运动反方向排布并保证落在界内。

## Developing

```bash
npx lerna run dev --scope=@arkfun/snakegame
```

## Publish

```bash
npx lerna publish
```
