import { SnakeAIFunction } from './common';
import { aStar, aStarSync } from './aStar';

const AI: SnakeAIFunction = (obs) => aStar(obs);

export default AI;
export { aStar, aStarSync };
