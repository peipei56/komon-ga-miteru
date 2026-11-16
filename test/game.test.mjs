// Run with: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { Practice } from '../src/game.js';
import { botInput } from '../src/bot.js';
import { L, trackPos, raycast, visible, conePoly, W, H } from '../src/geom.js';
import { STAGES, OCC, SPOTS, LEVELS, VR, MAX_STRIKES, titleFor } from '../src/data.js';
import { addRank, RANK_MAX } from '../src/ranking.js';

export function play(index, seed, input = botInput, opts) {
  const g = new Practice({ index, seed });
  while (!g.over) {
    g.update(1 / 60, input(g, opts));
    g.fx.length = 0;
  }
  return g;
}

test('the track is a closed loop of the stated length', () => {
  let len = 0, prev = trackPos(0);
  const n = 4000;
  for (let i = 1; i <= n; i++) {
    const q = trackPos((i / n) * L);
    len += Math.hypot(q.x - prev.x, q.y - prev.y);
    prev = q;
    assert.ok(q.x > 0 && q.x < W && q.y > 0 && q.y < H);
  }
  assert.ok(Math.abs(len - L) < 1, `measured ${len} vs ${L}`);
  const a = trackPos(0), b = trackPos(L);
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < 1e-6);
});

test('line of sight: walls and trees block, open ground does not', () => {
  const wall = [{ x: 10, y: -5, w: 4, h: 10 }];
  assert.equal(raycast(0, 0, 1, 0, 100, wall), 10);
  assert.equal(raycast(0, 0, -1, 0, 100, wall), 100);
  assert.equal(raycast(0, 0, 0, 1, 100, wall), 100);
  const tree = [{ x: 20, y: 0, r: 5 }];
  assert.equal(raycast(0, 0, 1, 0, 100, tree), 15);
  const c = { x: 0, y: 0, th: 0, fov: 0.5, on: 1, range: 100 };
  assert.ok(visible(c, 50, 0, []));
  assert.ok(!visible(c, 50, 0, wall), 'behind the wall');
  assert.ok(!visible(c, 0, 50, []), 'outside the cone');
  assert.ok(!visible(c, 150, 0, []), 'too far');
  assert.ok(!visible({ ...c, on: 0 }, 50, 0, []), 'looking away');
  const poly = conePoly(c, wall);
  assert.ok(poly.length > 10 && poly.every(Number.isFinite));
});

test('coach spots are not inside anything that blocks the view', () => {
  for (const [name, [x, y]] of Object.entries(SPOTS)) {
    for (const o of Object.values(OCC)) {
      const inside = o.r ? Math.hypot(x - o.x, y - o.y) < o.r + 4 : x > o.x - 4 && x < o.x + o.w + 4 && y > o.y - 4 && y < o.y + o.h + 4;
      assert.ok(!inside, `${name} is inside ${o.kind}`);
    }
  }
});

test('every practice has real hiding places on the track', () => {
  for (let i = 0; i < STAGES.length; i++) {
    const g = new Practice({ index: i, seed: 1 });
    if (g.cfg.bike) continue;
    let hidden = 0;
    const n = 400;
    for (let k = 0; k < n; k++) {
      g.p.s = (k / n) * L;
      g.place();
      if (!g.exposed()) hidden++;
    }
    assert.ok(hidden / n > 0.08, `${g.cfg.id}: only ${((hidden / n) * 100).toFixed(0)}% of the track is hidden`);
  }
});

test('you cannot run the whole time: stamina runs out', () => {
  for (let i = 0; i < STAGES.length; i++) {
    const g = new Practice({ index: i, seed: 3 });
    let ranOut = false;
    while (!g.over) {
      g.update(1 / 60, { hold: true });
      if (g.fx.some((e) => e.t === 'gassed')) ranOut = true;
      g.fx.length = 0;
    }
    assert.ok(ranOut, `${g.cfg.id}: stamina should run out`);
  }
});

test('lying down in front of the coach gets you scolded fast', () => {
  const g = new Practice({ index: 0, seed: 2 });
  g.coach.state = 'stare';
  g.coach.timer = 99;
  g.p.s = L * 0.3;
  g.place();
  let t = 0;
  g.update(1 / 60, { deeper: true });
  g.update(1 / 60, { deeper: true });
  g.update(1 / 60, { deeper: true });
  assert.equal(g.p.level, 4);
  while (g.strikes === 0 && t < 5) {
    g.update(1 / 60, {});
    t += 1 / 60;
  }
  assert.ok(g.strikes === 1 && t < 2.5, `took ${t.toFixed(2)}s`);
  assert.equal(g.p.level, 1, 'you jump to your feet');
});

test('getting up takes longer the deeper you slack', () => {
  const time = (presses) => {
    const g = new Practice({ index: 0, seed: 2 });
    for (let i = 0; i < presses; i++) g.update(1 / 120, { deeper: true });
    let t = 0;
    while (g.p.level !== 0 && t < 3) {
      g.update(1 / 120, { hold: true });
      t += 1 / 120;
    }
    return t;
  };
  const stop = time(1), sit = time(2), lie = time(3);
  assert.ok(stop < sit && sit < lie, `${stop} ${sit} ${lie}`);
  assert.ok(Math.abs(lie - LEVELS[4].getup) < 0.05);
});

test('points only come from slacking unseen, and the quota decides the result', () => {
  const lazy = play(0, 5, () => ({ hold: false }));
  assert.ok(!lazy.clear && (lazy.failWhy === 'quota' || lazy.failWhy === 'scolded'));
  const honest = play(0, 5, () => ({ hold: true }));
  assert.ok(honest.result().base < 40, 'an honest runner earns almost nothing');
});

test('the same seed gives the same practice', () => {
  const a = play(2, 77).result(), b = play(2, 77).result();
  assert.deepEqual(a, b);
});

test('a sensible slacker can clear every practice, and state stays finite', () => {
  for (let i = 0; i < STAGES.length; i++) {
    let clears = 0, pts = 0;
    const n = 30;
    for (let seed = 1; seed <= n; seed++) {
      const g = play(i, seed);
      const r = g.result();
      assert.ok(Number.isFinite(g.p.s + g.p.stamina + g.anger + g.points + g.coach.x + g.coach.th), 'finite');
      assert.ok(g.strikes <= MAX_STRIKES && g.p.stamina >= 0 && g.p.stamina <= 100);
      if (r.clear) clears++;
      pts += r.total;
    }
    assert.ok(clears / n >= 0.6, `${STAGES[i].id}: bot cleared ${clears}/${n}`);
    assert.ok(pts / n > 60, `${STAGES[i].id}: average ${pts / n}`);
  }
});

test('titles and ranking', () => {
  assert.equal(titleFor(0), 'まじめな部員');
  assert.equal(typeof titleFor(99999), 'string');
  const list = [];
  for (let i = 0; i < 14; i++) addRank(list, { score: i * 50 });
  assert.equal(list.length, RANK_MAX);
  assert.equal(list[0].score, 650);
  assert.ok(VR > 0);
});

test('the drawn cone and the detection rule agree', () => {
  const inside = (poly, x, y) => {
    let hit = false;
    for (let i = 0, j = poly.length - 2; i < poly.length; j = i, i += 2) {
      const xi = poly[i], yi = poly[i + 1], xj = poly[j], yj = poly[j + 1];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  };
  let checked = 0, differ = 0;
  for (let i = 0; i < STAGES.length; i++) {
    const g = new Practice({ index: i, seed: 8 });
    for (let step = 0; step < 900; step++) {
      g.update(1 / 30, botInput(g));
      g.fx.length = 0;
      if (g.over) break;
      for (const w of g.watchers) {
        const poly = conePoly(w, g.occ, []);
        for (let k = 0; k < 12; k++) {
          const q = trackPos((k / 12) * L + step * 7);
          const a = visible(w, q.x, q.y, g.occ), b = poly.length > 4 && inside(poly, q.x, q.y);
          checked++;
          if (a !== b) differ++;
        }
      }
    }
  }
  // Only points sitting right on a cone edge may disagree (the outline is drawn with a finite number of rays).
  assert.ok(differ / checked < 0.01, `${differ} of ${checked} differ`);
});
