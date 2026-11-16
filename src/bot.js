// An autopilot that slacks sensibly. It runs the demo behind the title screen and the balance tests.
import { L } from './geom.js';
import { VR, LEVELS } from './data.js';

export function botInput(g, { nerve = 1 } = {}) {
  const p = g.p, left = g.cfg.len - g.t;
  const need = g.cfg.quota * L - p.s;
  // Seconds that can still be spent not running. Running needs breathers, hence the 1.35.
  const spare = left - (Math.max(0, need) / VR) * 1.35 - 4;
  const getup = LEVELS[p.level].getup;
  // Coach looking away with time to spare: treat as safe.
  const c = g.coach;
  const away = c.state === 'distract' && !c.feint && c.timer > getup + 0.7;
  const margin = 0.28 / nerve + getup * 1.3;
  // On the bike the coach rings the bell before turning round: react to the sound if he is close.
  const turning = c.bike && (c.state === 'bell' || c.state === 'lookback') && Math.hypot(p.x - c.x, p.y - c.y) < c.range + 40;
  const danger = turning || (!away && g.threat(margin, c.bike ? 70 + getup * 210 : 30));
  const behind = spare < 1.5 && need > 0;
  if (danger || (behind && p.stamina > 6 && p.gassed <= 0)) return { hold: true, deeper: false };
  // Safe to slack: how deep?
  let want = 1;
  const calm = !g.threat(1.0, 60) || away;
  if (spare > 5 || need <= 0) {
    const bikeNear = c.bike && Math.hypot(p.x - c.x, p.y - c.y) < c.range + 150;
    if (bikeNear) want = calm ? 2 : 1;
    else if (!g.exposed()) want = 4;
    else if (calm) want = away ? 3 : 2;
  }
  if (g.cfg.water && g.inWater() && p.stamina < 60 && calm) want = Math.max(want, 2);
  if (p.stamina < 12 && calm) want = Math.max(want, 2);
  return { hold: false, deeper: p.level >= 1 && p.level < want };
}
