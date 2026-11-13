import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyRallyPointState,
  checkSetWin,
  checkSubstitutionRule,
  computeSetsStanding,
  detectLineupWarnings,
  determineMatchWinner,
  formatPlayerDisplay,
  getCurrentPosForIndex,
  getDefaultLineupForSystem,
  getIndexForCourtPos,
  getSetsToWin,
  getSetTargetPoints,
  rotateClockwise,
  rotateCounterClockwise
} from '../src/lib/matchEngine.ts';
import type { BenchPlayer, PlayerSetup, RotationPosition } from '../src/lib/types.ts';

describe('matchEngine', () => {
  it('computes set point targets and set wins across Bo5, Bo3, and open formats', () => {
    assert.equal(getSetTargetPoints(1, 'bo5'), 25);
    assert.equal(getSetTargetPoints(4, 'bo5'), 25);
    assert.equal(getSetTargetPoints(5, 'bo5'), 15);
    assert.equal(getSetTargetPoints(3, 'bo3'), 15);
    assert.equal(getSetTargetPoints(5, 'open'), 25);

    assert.equal(getSetsToWin('bo5'), 3);
    assert.equal(getSetsToWin('bo3'), 2);
    assert.equal(getSetsToWin('open'), null);

    assert.equal(checkSetWin(25, 23, 25), 'us');
    assert.equal(checkSetWin(25, 24, 25), null);
    assert.equal(checkSetWin(26, 24, 25), 'us');
    assert.equal(checkSetWin(15, 13, 15), 'us');
    assert.equal(checkSetWin(15, 14, 15), null);
    assert.equal(checkSetWin(14, 16, 15), 'them');
  });

  it('computes set standing and match winner across multi-set and single-set games', () => {
    const sets = [
      { setNumber: 1, myScore: 25, opponentScore: 21 },
      { setNumber: 2, myScore: 22, opponentScore: 25 },
      { setNumber: 3, myScore: 25, opponentScore: 19 }
    ];
    assert.deepEqual(computeSetsStanding(sets), { us: 2, them: 1 });
    assert.equal(determineMatchWinner(sets, 25, 19), 'us');
    assert.equal(
      determineMatchWinner([{ setNumber: 1, myScore: 18, opponentScore: 25 }], 18, 25),
      'them'
    );
  });

  it('rotates both teams accurately under side-out rally scoring', () => {
    let state = {
      myScore: 0,
      opponentScore: 0,
      servingTeam: 'them' as const,
      currentRotation: 1 as RotationPosition,
      opponentRotation: 1 as RotationPosition
    };

    // We receive & win rally -> side-out + our rotation 1 -> 6, opponent stays R1
    const r1 = applyRallyPointState(state, 'us');
    assert.equal(r1.myScore, 1);
    assert.equal(r1.servingTeam, 'us');
    assert.equal(r1.currentRotation, 6);
    assert.equal(r1.opponentRotation, 1);
    assert.equal(r1.didSideout, true);

    // We serve & win rally -> break point, no rotation change
    const r2 = applyRallyPointState(r1, 'us');
    assert.equal(r2.myScore, 2);
    assert.equal(r2.currentRotation, 6);
    assert.equal(r2.didSideout, false);

    // We serve & lose rally -> opponent side-out & opponent rotates 1 -> 6
    const r3 = applyRallyPointState(r2, 'them');
    assert.equal(r3.opponentScore, 1);
    assert.equal(r3.servingTeam, 'them');
    assert.equal(r3.currentRotation, 6);
    assert.equal(r3.opponentRotation, 6);
    assert.equal(r3.didSideout, true);
  });

  it('maintains inverse relationship between court position and lineup index across rotations', () => {
    let rot: RotationPosition = 1;
    for (let step = 0; step < 6; step++) {
      for (let idx = 0; idx < 6; idx++) {
        const pos = getCurrentPosForIndex(idx, rot);
        assert.equal(getIndexForCourtPos(pos, rot), idx);
      }
      rot = rotateClockwise(rot);
    }
    assert.equal(rot, 1);
    assert.equal(rotateCounterClockwise(1), 2);
  });

  it('validates FIVB substitution count and pairing warnings', () => {
    const courtPlayers: PlayerSetup[] = getDefaultLineupForSystem('5-1');
    const benchPlayers: BenchPlayer[] = [
      { id: 'b1', number: '11', name: 'Hannah', role: 'OH2', isLibero: false },
      { id: 'b2', number: '14', name: 'Lea', role: 'OPP', isLibero: false }
    ];

    const okSub = checkSubstitutionRule({
      outgoing: courtPlayers[1],
      incoming: benchPlayers[0],
      substitutionCount: 0,
      subPairs: [],
      courtPlayers,
      benchPlayers
    });
    assert.equal(okSub.warning, undefined);

    const pairedWarn = checkSubstitutionRule({
      outgoing: courtPlayers[2],
      incoming: benchPlayers[0],
      substitutionCount: 1,
      subPairs: [{ starterId: courtPlayers[1].id!, subId: 'b1' }],
      courtPlayers,
      benchPlayers
    });
    assert.match(pairedWarn.warning ?? '', /FIVB-Paarregel/);

    const limitWarn = checkSubstitutionRule({
      outgoing: courtPlayers[3],
      incoming: benchPlayers[1],
      substitutionCount: 6,
      subPairs: [],
      courtPlayers,
      benchPlayers
    });
    assert.match(limitWarn.warning ?? '', /6\/6/);
  });

  it('formats jersey numbers cleanly and flags invalid setups', () => {
    assert.equal(
      formatPlayerDisplay({ name: 'Mila', number: '7', role: 'OH1' }),
      '#7 Mila (OH1)'
    );
    const broken = getDefaultLineupForSystem('5-1').map((p, idx) =>
      idx === 0 ? { ...p, role: 'OH1' as const } : p
    );
    const warnings = detectLineupWarnings(broken, '5-1');
    assert.ok(warnings.some((w) => w.includes('Kein Zuspiel')));
    assert.ok(warnings.some((w) => w.includes('OH1')));
  });
});
