import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formations,
  getPhasePlayers,
  getPhasePlayersForLineup
} from '../src/lib/formations.ts';
import { getDefaultLineupForSystem } from '../src/lib/matchEngine.ts';
import { isLegalFormation, validateFormation } from '../src/lib/validateFormation.ts';
import type { PlayerSetup, SystemType } from '../src/lib/types.ts';

describe('formations', () => {
  it('validates every curated 5-1 receive rotation (R1-R6) under FIVB rules', () => {
    for (let rot = 1; rot <= 6; rot++) {
      const players = getPhasePlayers(rot, 'receive');
      const errors = validateFormation(players);
      assert.equal(
        errors.length,
        0,
        `Curated 5-1 receive R${rot} should have 0 errors, got: ${JSON.stringify(errors)}`
      );
      assert.equal(isLegalFormation(players), true);
    }
  });

  it('places OH1 on left wing and OPP on right wing in Rotation 1 transition', () => {
    const rot1Transition = formations[1].transition;
    assert.ok(rot1Transition.OH1.x < 30, 'OH1 should transition to Pos 4 (left wing)');
    assert.ok(rot1Transition.OPP.x > 70, 'OPP should transition to Pos 2 (right wing)');
  });

  it('generates FIVB-legal receive formations dynamically across 5-1 (S-MB-OH), 6-2, and 4-2 systems', () => {
    const systems: { name: string; system: SystemType; lineup: PlayerSetup[] }[] = [
      {
        name: '5-1 (S-MB-OH order)',
        system: '5-1',
        lineup: [
          { position: 1, name: 'S', role: 'S' },
          { position: 2, name: 'MB1', role: 'MB1' },
          { position: 3, name: 'OH1', role: 'OH1' },
          { position: 4, name: 'OPP', role: 'OPP' },
          { position: 5, name: 'MB2', role: 'MB2' },
          { position: 6, name: 'OH2', role: 'OH2' }
        ]
      },
      {
        name: '6-2',
        system: '6-2',
        lineup: getDefaultLineupForSystem('6-2')
      },
      {
        name: '4-2',
        system: '4-2',
        lineup: getDefaultLineupForSystem('4-2')
      }
    ];

    for (const cfg of systems) {
      for (const hasLibero of [true, false]) {
        for (let rot = 1; rot <= 6; rot++) {
          const players = getPhasePlayersForLineup({
            courtPlayers: cfg.lineup,
            rotation: rot,
            phase: 'receive',
            system: cfg.system,
            hasLibero
          });
          assert.equal(players.length, 6);
          const errors = validateFormation(players);
          assert.equal(
            errors.length,
            0,
            `${cfg.name} (hasLibero=${hasLibero}) R${rot} invalid: ${JSON.stringify(errors)}`
          );
        }
      }
    }
  });
});
