import { AIFunction } from '../types';
import { SnakeDirection } from '../snake';
import { SnakeObservation } from '../env';

export type SnakeAIFunction = AIFunction<SnakeDirection, SnakeObservation>;
