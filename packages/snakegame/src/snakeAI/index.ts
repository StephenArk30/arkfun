import { SnakeAIFunction } from './common';
import { aStar } from './aStar';

const AI: SnakeAIFunction = (obs) => aStar(obs);

export default AI;
