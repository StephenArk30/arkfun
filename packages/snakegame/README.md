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

## Developing

```bash
npx lerna run dev --scope=@arkfun/snakegame
```

## Publish

```bash
npx lerna publish
```
