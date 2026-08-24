import { gameRegistry } from '@games/game-engine';
import { dicePlugin } from '../modules/dice/dice.plugin.js';

export function registerGamePlugins() {
  gameRegistry.register(dicePlugin);
}
