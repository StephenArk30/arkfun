import common, { MapNode, NodeType, random } from '../src/common';

describe('MapNode', () => {
  it('stores col and row', () => {
    const node = new MapNode(3, 5);
    expect(node.col).toBe(3);
    expect(node.row).toBe(5);
  });

  it('moves by a delta', () => {
    const node = new MapNode(3, 5);
    node.move(1, -1);
    expect(node.col).toBe(4);
    expect(node.row).toBe(4);
  });

  it('converts to an array', () => {
    expect(new MapNode(3, 5).toArray()).toEqual([3, 5]);
  });

  it('compares with another node', () => {
    expect(new MapNode(3, 5).equals(new MapNode(3, 5))).toBe(true);
    expect(new MapNode(3, 5).equals(new MapNode(5, 3))).toBe(false);
  });
});

describe('random', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('choice picks an element of the array', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    expect(random.choice([1, 2, 3])).toBe(1);
    jest.spyOn(Math, 'random').mockReturnValue(0.99);
    expect(random.choice([1, 2, 3])).toBe(3);
  });

  it('randRange works with min and max', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    expect(random.randRange(2, 5)).toBe(2);
    jest.spyOn(Math, 'random').mockReturnValue(0.999);
    expect(random.randRange(2, 5)).toBe(5);
  });

  it('randRange treats a single argument as max', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    expect(random.randRange(5)).toBe(3);
  });
});

it('default export exposes MapNode and util.random', () => {
  expect(common.MapNode).toBe(MapNode);
  expect(common.util.random).toBe(random);
});

it('NodeType enumerates all cell kinds', () => {
  expect(NodeType.Empty).toBe(0);
  expect(NodeType.Food).toBe(1);
  expect(NodeType.SnakeHead).toBe(2);
  expect(NodeType.SnakeBody).toBe(3);
  expect(NodeType.Barrier).toBe(4);
});
