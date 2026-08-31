import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

describe('Dice player lobby — no room selection', () => {
  it('does not render a room list, room codes, or DICE10SIM', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'apps/web/src/modules/games/dice/DiceGamePage.tsx'),
      'utf8',
    );
    assert.match(src, /DiceAutoJoinPage/);
    assert.match(src, /Joining dice table/);
    assert.equal(src.includes('Open Tables'), false);
    assert.equal(src.includes('DICE10SIM'), false);
    assert.equal(src.includes('10 PLAYER LIVE TEST'), false);
    assert.equal(src.includes('/api/dice/rooms'), false);
    assert.match(src, /\/api\/dice\/play/);
  });

  it('does not import Node-only game-engine logic into the player bundle', () => {
    const browserSrc = readFileSync(
      resolve(process.cwd(), 'packages/game-engine/src/browser.ts'),
      'utf8',
    );
    const hookSrc = readFileSync(
      resolve(process.cwd(), 'apps/web/src/modules/games/dice/hooks/useDiceGame.ts'),
      'utf8',
    );
    const appSrc = readFileSync(
      resolve(process.cwd(), 'apps/web/src/App.tsx'),
      'utf8',
    );
    assert.equal(browserSrc.includes('node:crypto'), false);
    assert.equal(browserSrc.includes("from './games/dice/dice.logic"), false);
    assert.match(hookSrc, /from '@games\/game-engine\/browser'/);
    assert.equal(hookSrc.includes('dice.logic'), false);
    assert.match(appSrc, /lazy\(/);
    assert.match(appSrc, /import\('\.\/modules\/games\/dice\/DiceGamePage'\)/);
  });
});
