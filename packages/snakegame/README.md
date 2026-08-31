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

## Developing

```bash
npx lerna run dev --scope=@arkfun/snakegame
```

## Publish

```bash
npx lerna publish
```
