import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeMatchAnalytics, toChronologicalEvents } from '../src/lib/analytics.ts';
import type { VolleyballEvent } from '../src/lib/types.ts';

const sampleChronological: VolleyballEvent[] = [
  {
    id: '1',
    timestamp: '18:00:01',
    isoTimestamp: '2026-11-12T18:00:01.000Z',
    setNumber: 1,
    actionId: 'pass_3',
    category: 'reception',
    quality: 'good',
    action: 'Perfekte Annahme (3)',
    rotation: 1,
    player: '#7 Mila (OH1)',
    team: 'myTeam',
    wasServing: 'them',
    passRating: 3
  },
  {
    id: '2',
    timestamp: '18:00:04',
    isoTimestamp: '2026-11-12T18:00:04.000Z',
    setNumber: 1,
    actionId: 'kill',
    category: 'attack',
    quality: 'good',
    action: 'Kill Angriff',
    rotation: 1,
    player: '#7 Mila (OH1)',
    team: 'myTeam',
    wasServing: 'them',
    scoreAfter: '1:0',
    isSideout: true
  },
  {
    id: '3',
    timestamp: '18:00:15',
    isoTimestamp: '2026-11-12T18:00:15.000Z',
    setNumber: 1,
    actionId: 'ace',
    category: 'serve',
    quality: 'good',
    action: 'Ass',
    rotation: 6,
    player: '#4 Anna (MB1)',
    team: 'myTeam',
    wasServing: 'us',
    scoreAfter: '2:0'
  },
  {
    id: '4',
    timestamp: '18:00:30',
    isoTimestamp: '2026-11-12T18:00:30.000Z',
    setNumber: 1,
    actionId: 'err_atk',
    category: 'attack',
    quality: 'bad',
    action: 'Angriff Aus/Netz',
    rotation: 6,
    player: '#10 Sara (OPP)',
    team: 'myTeam',
    wasServing: 'us',
    scoreAfter: '2:1',
    isSideout: true
  },
  {
    id: '5',
    timestamp: '18:00:45',
    isoTimestamp: '2026-11-12T18:00:45.000Z',
    setNumber: 1,
    actionId: 'pass_2',
    category: 'reception',
    quality: 'neutral',
    action: 'Gute Annahme (2)',
    rotation: 6,
    player: '#7 Mila (OH1)',
    team: 'myTeam',
    wasServing: 'them',
    passRating: 2
  },
  {
    id: '6',
    timestamp: '18:00:49',
    isoTimestamp: '2026-11-12T18:00:49.000Z',
    setNumber: 1,
    actionId: 'err_rcv',
    category: 'reception',
    quality: 'bad',
    action: 'Annahmefehler (0)',
    rotation: 6,
    player: '#7 Mila (OH1)',
    team: 'myTeam',
    wasServing: 'them',
    passRating: 0,
    scoreAfter: '2:2'
  },
  {
    id: '7',
    timestamp: '18:10:00',
    isoTimestamp: '2026-11-12T18:10:00.000Z',
    setNumber: 2,
    actionId: 'block',
    category: 'block',
    quality: 'good',
    action: 'Kill Block',
    rotation: 2,
    player: '#4 Anna (MB1)',
    team: 'myTeam',
    wasServing: 'us',
    scoreAfter: '1:0'
  }
];

describe('analytics', () => {
  it('normalizes newest-first live events into chronological order identically', () => {
    const newestFirst = [...sampleChronological].reverse();
    const chrono = toChronologicalEvents(newestFirst);
    assert.deepEqual(
      chrono.map((e) => e.id),
      sampleChronological.map((e) => e.id)
    );
  });

  it('computes accurate Side-out %, Break %, Attack efficiency, reception average, and rotation breakdown', () => {
    const newestFirst = [...sampleChronological].reverse();
    const set1 = computeMatchAnalytics(newestFirst, { setFilter: 1, initialServe: 'them' });

    // Set 1 points while receiving: #2 kill (won), #6 err_rcv (lost) => 1/2 = 50%
    assert.equal(set1.sideoutWon, 1);
    assert.equal(set1.sideoutTotal, 2);
    assert.equal(set1.sideoutPct, 50);

    // Set 1 points while serving: #3 ace (won), #4 err_atk (lost) => 1/2 = 50%
    assert.equal(set1.breakWon, 1);
    assert.equal(set1.breakTotal, 2);
    assert.equal(set1.breakPct, 50);

    // Reception ratings: 3, 2, 0 => sum=5, count=3 => 1.67, positive (2+3)=2/3=67%
    assert.equal(set1.passCount, 3);
    assert.equal(set1.passAvgFormatted, '1.67');
    assert.equal(set1.passPositivePct, 67);
    assert.equal(set1.passPerfectPct, 33);

    // Opponent scored last 2 points (#4 and #6) in Set 1
    assert.equal(set1.activeOpponentRun, 2);
    assert.equal(set1.activeOwnRun, 0);

    const rot1 = set1.rotationStats.find((r) => r.rot === 1)!;
    assert.equal(rot1.won, 1);
    assert.equal(rot1.lost, 0);
    assert.equal(rot1.diff, 1);
    assert.equal(rot1.sideoutPct, 100);

    const rot6 = set1.rotationStats.find((r) => r.rot === 6)!;
    assert.equal(rot6.won, 1);
    assert.equal(rot6.lost, 2);
    assert.equal(rot6.diff, -1);
    assert.equal(rot6.sideoutPct, 0);
  });

  it('resets active runs across set boundaries and aggregates all sets accurately', () => {
    const all = computeMatchAnalytics(sampleChronological, { setFilter: 'all' });
    assert.equal(all.blocks, 1);
    assert.equal(all.aces, 1);
    assert.equal(all.kills, 1);
    assert.equal(all.activeOwnRun, 1);
    assert.equal(all.activeOpponentRun, 0);
  });
});
