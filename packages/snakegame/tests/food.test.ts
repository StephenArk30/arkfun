import Food from '../src/food';
import { MapNode } from '../src/common';
import { createMockContext } from './helpers';

it('constructs from a MapNode', () => {
  const food = new Food(new MapNode(2, 3), createMockContext(), 10);
  expect(food.col).toBe(2);
  expect(food.row).toBe(3);
  expect(food.equals(new MapNode(2, 3))).toBe(true);
});

it('draws a circle with the given color', () => {
  const ctx = createMockContext();
  const food = new Food(new MapNode(2, 3), ctx, 10, '#fff', '#000');
  food.draw();
  expect(ctx.fillStyle).toBe('#fff');
  expect(ctx.beginPath).toHaveBeenCalled();
  expect(ctx.arc).toHaveBeenCalledWith(50, 70, 10, 0, Math.PI * 2, true);
  expect(ctx.fill).toHaveBeenCalled();
});

it('clears with the background color', () => {
  const ctx = createMockContext();
  const food = new Food(new MapNode(2, 3), ctx, 10, '#fff', '#000');
  food.clear();
  expect(ctx.fillStyle).toBe('#000');
  expect(ctx.fillRect).toHaveBeenCalledWith(2, 3, 20, 20);
});
