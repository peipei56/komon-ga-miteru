// One practice session. No DOM here: the browser and the Node tests run the same code.
import { L, trackPos, visible, angDiff, TAU } from './geom.js';
import { STAGES, SPOTS, OCC, LEVELS, WATER, VR, VW, MAX_STRIKES, CLEAR_BONUS, DISTRACTIONS } from './data.js';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const ACC = 420;
const turn = (from, to, max) => {
  const d = angDiff(to, from);
  return Math.abs(d) <= max ? to : from + Math.sign(d) * max;
};

export class Practice {
  constructor({ index = 0, seed = (Date.now() & 0x7fffffff) } = {}) {
    this.index = index;
    this.cfg = STAGES[index];
    this.rng = mulberry32(seed);
    this.occ = this.cfg.occ.map((k) => OCC[k]);
    this.t = 0;
    this.points = 0;
    this.anger = 0;
    this.strikes = 0;
    this.nice = 0;
    this.seen = false;
    this.seenSlack = 0;
    this.slackTime = [0, 0, 0, 0, 0];
    this.over = false;
    this.clear = false;
    this.failWhy = null;
    this.fx = [];
    this.p = { s: 0, v: 0, level: 1, getting: 0, gassed: 0, stamina: 100, slackStart: 0, lastSlackEnd: -9, lastSlackLen: 0, x: 0, y: 0, ang: 0, stride: 0 };
    this.place();
    const c = this.cfg.coach;
    const [x, y] = SPOTS[c.spots[0]];
    this.coach = { kind: 'coach', x, y, th: Math.PI / 2, fov: c.fov, range: c.range, on: 1, state: 'sweep', timer: this.rand(c.sweep[0], c.sweep[1]), target: Math.PI / 2, pause: 0, lock: 0, alert: false, label: '', spot: c.spots[0], bike: !!this.cfg.bike, sC: L * 0.55, look: 0 };
    if (this.cfg.bike) {
      this.coach.state = 'ride';
      this.coach.timer = this.rand(c.ride[0], c.ride[1]);
      this.placeBike();
    }
    this.watchers = [this.coach];
    if (this.cfg.sub) {
      const [sx, sy] = SPOTS.back;
      this.sub = { kind: 'sub', x: sx, y: sy, th: Math.PI / 2, fov: 0.22, range: 345, on: 1, state: 'scan', alert: false, label: '' };
      this.watchers.push(this.sub);
    }
    // Teammates: scenery that also shows what honest running looks like.
    this.mates = [];
    for (let i = 0; i < 9; i++) this.mates.push({ s: this.rng() * L, v: VR * this.rand(0.72, 0.98), off: this.rand(-18, 18), hue: i, stride: this.rng() * 6 });
  }

  rand(a, b) {
    return a + this.rng() * (b - a);
  }
  emit(t, extra) {
    if (this.fx.length < 60) this.fx.push({ t, ...extra });
  }
  place() {
    const q = trackPos(this.p.s);
    this.p.x = q.x;
    this.p.y = q.y;
    this.p.ang = q.ang;
  }
  placeBike() {
    const c = this.coach, q = trackPos(c.sC, -44);
    c.x = q.x;
    c.y = q.y;
    c.th = q.ang + Math.PI + c.look; // he rides against the runners, facing them
  }
  get laps() {
    return this.p.s / L;
  }
  inWater() {
    if (!this.cfg.water) return false;
    const d = Math.abs((((this.p.s - WATER.s) % L) + L + L / 2) % L - L / 2);
    return d < WATER.half;
  }
  angleToPlayer(c) {
    return Math.atan2(this.p.y - c.y, this.p.x - c.x);
  }
  /** Would any watcher see the player if their cone were this much wider? Used for warnings and by the bot. */
  threat(extraFov = 0, extraRange = 0) {
    for (const c of this.watchers) if (visible(c, this.p.x, this.p.y, this.occ, extraFov, extraRange)) return true;
    return false;
  }
  /** Nothing between the player and a watcher, whichever way that watcher is facing. */
  exposed() {
    for (const c of this.watchers) {
      const on = c.on;
      c.on = 1;
      const v = visible(c, this.p.x, this.p.y, this.occ, 7, 0);
      c.on = on;
      if (v) return true;
    }
    return false;
  }

  // ------------------------------------------------------------ coach

  nextCoachState() {
    const c = this.coach, k = this.cfg.coach, r = this.rng();
    c.alert = false;
    c.label = '';
    if (r < k.pDistract) {
      c.state = 'distract';
      c.feint = this.rng() < k.feint;
      c.timer = c.feint ? this.rand(0.9, 1.5) : this.rand(k.distract[0], k.distract[1]);
      c.label = DISTRACTIONS[Math.floor(this.rng() * DISTRACTIONS.length)];
      this.emit('distract');
    } else if (r < k.pDistract + k.pMove && k.spots.length > 1) {
      const others = k.spots.filter((s) => s !== c.spot);
      c.spot = others[Math.floor(this.rng() * others.length)];
      c.state = 'move';
    } else if (r < k.pDistract + k.pMove + k.pScope) {
      c.state = 'scopeWarn';
      c.timer = 0.7;
      c.alert = true;
      c.label = '双眼鏡';
      this.emit('alert');
    } else {
      c.state = 'sweep';
      c.timer = this.rand(k.sweep[0], k.sweep[1]);
    }
  }

  pickTarget() {
    const c = this.coach, k = this.cfg.coach;
    const bias = k.track + (this.anger / 100) * 0.45;
    if (this.rng() < bias) c.target = this.angleToPlayer(c) + this.rand(-0.25, 0.25);
    else {
      const q = trackPos(this.rng() * L);
      c.target = Math.atan2(q.y - c.y, q.x - c.x);
    }
    c.pause = this.rand(0.25, 0.8);
  }

  updateCoach(dt) {
    const c = this.coach, k = this.cfg.coach;
    const slackSeen = this.seen && this.p.level > 0;
    if (c.bike) return this.updateBike(dt);
    let wantOn = 1, fov = k.fov, range = k.range;
    switch (c.state) {
      case 'sweep': {
        if (slackSeen) c.lock = 1;
        if (c.lock > 0) {
          c.lock -= dt;
          c.th = turn(c.th, this.angleToPlayer(c), k.omega * 2.2 * dt);
        } else {
          const before = c.th;
          c.th = turn(c.th, c.target, k.omega * dt);
          if (c.th === before || c.th === c.target) {
            c.pause -= dt;
            if (c.pause <= 0) this.pickTarget();
          }
          c.timer -= dt;
          if (c.timer <= 0) this.nextCoachState();
        }
        break;
      }
      case 'distract': {
        wantOn = 0;
        c.timer -= dt;
        if (!c.alert && c.timer < 0.45) {
          c.alert = true;
          this.emit('alert');
        }
        if (c.timer <= 0) {
          c.state = 'snap';
          c.alert = false;
          c.label = '';
          c.target = this.rng() < k.snap ? this.angleToPlayer(c) : c.th + this.rand(-1.6, 1.6);
        }
        break;
      }
      case 'snap': {
        c.th = turn(c.th, c.target, k.omega * 5 * dt);
        if (c.th === c.target) {
          c.state = 'sweep';
          c.timer = this.rand(k.sweep[0], k.sweep[1]);
          c.pause = 0.5;
        }
        break;
      }
      case 'move': {
        const [tx, ty] = SPOTS[c.spot], dx = tx - c.x, dy = ty - c.y, d = Math.hypot(dx, dy);
        fov = k.fov * 0.75;
        if (d < 2) {
          c.x = tx;
          c.y = ty;
          c.state = 'sweep';
          c.timer = this.rand(k.sweep[0], k.sweep[1]);
          this.pickTarget();
        } else {
          const step = Math.min(d, 78 * dt);
          c.x += (dx / d) * step;
          c.y += (dy / d) * step;
          c.th = turn(c.th, slackSeen ? this.angleToPlayer(c) : Math.atan2(dy, dx), 3 * dt);
        }
        break;
      }
      case 'yell': {
        c.th = turn(c.th, this.angleToPlayer(c), 8 * dt);
        c.timer -= dt;
        if (c.timer <= 0) {
          c.state = 'stare';
          c.timer = 2.2;
        }
        break;
      }
      case 'stare': {
        c.th = turn(c.th, this.angleToPlayer(c), k.omega * 2.5 * dt);
        c.timer -= dt;
        if (c.timer <= 0) {
          c.state = 'sweep';
          c.timer = this.rand(k.sweep[0], k.sweep[1]);
          this.pickTarget();
        }
        break;
      }
      case 'scopeWarn': {
        c.th = turn(c.th, this.angleToPlayer(c), 2.5 * dt);
        c.timer -= dt;
        if (c.timer <= 0) {
          c.state = 'scope';
          c.timer = 3;
          c.alert = false;
        }
        break;
      }
      case 'scope': {
        fov = 0.13;
        range = 800;
        c.th = turn(c.th, this.angleToPlayer(c), 1.25 * dt);
        c.timer -= dt;
        if (c.timer <= 0) {
          c.label = '';
          c.state = 'sweep';
          c.timer = this.rand(k.sweep[0], k.sweep[1]);
          this.pickTarget();
        }
        break;
      }
    }
    c.fov = c.fov + (fov - c.fov) * Math.min(1, dt * 10);
    c.range = c.range + (range - c.range) * Math.min(1, dt * 10);
    c.on = wantOn ? Math.min(1, c.on + dt * 6) : Math.max(0, c.on - dt * 5);
  }

  updateBike(dt) {
    const c = this.coach, k = this.cfg.coach;
    if (c.state === 'ride') {
      c.sC -= VR * k.speed * dt;
      c.look = turn(c.look, 0, 4 * dt);
      c.timer -= dt;
      if (c.timer <= 0) {
        c.state = 'bell';
        c.timer = 0.6;
        c.alert = true;
        this.emit('bell');
      }
    } else if (c.state === 'bell') {
      c.sC -= VR * k.speed * 0.4 * dt;
      c.timer -= dt;
      if (c.timer <= 0) {
        c.state = 'lookback';
        c.timer = 2.2;
        c.alert = false;
        c.swing = this.rng() < 0.5 ? 1 : -1;
      }
    } else if (c.state === 'yell') {
      c.look = turn(c.look, angDiff(this.angleToPlayer(c), trackPos(c.sC).ang + Math.PI), 8 * dt);
      c.timer -= dt;
      if (c.timer <= 0) {
        c.state = 'ride';
        c.timer = this.rand(k.ride[0], k.ride[1]);
      }
    } else {
      // Stopped, looking back over the shoulder with a small sweep.
      c.look = turn(c.look, Math.PI * c.swing + Math.sin(c.timer * 3) * 0.45, 5 * dt);
      c.timer -= dt;
      if (c.timer <= 0) {
        c.state = 'ride';
        c.timer = this.rand(k.ride[0], k.ride[1]);
      }
    }
    this.placeBike();
  }

  strike() {
    this.strikes++;
    const lost = Math.floor(this.points * 0.15);
    this.points -= lost;
    this.anger = 35;
    const p = this.p;
    p.level = 1;
    p.getting = 0;
    this.coach.state = 'yell';
    this.coach.timer = 1.2;
    this.coach.alert = false;
    this.coach.label = '';
    this.coach.on = 1;
    this.emit('strike', { lost });
    if (this.strikes >= MAX_STRIKES) {
      this.over = true;
      this.failWhy = 'scolded';
    }
  }

  // ------------------------------------------------------------ frame

  /** input: { hold: run button held, deeper: true on the frame the slack button was pressed } */
  update(dt, input) {
    if (this.over) return;
    this.t += dt;
    const p = this.p, was = p.level;

    if (input.deeper) {
      p.getting = 0;
      p.level = Math.min(4, Math.max(2, p.level + 1));
    } else if (input.hold && p.gassed <= 0) {
      if (p.level === 1) p.level = 0;
      else if (p.level >= 2) {
        p.getting += dt;
        if (p.getting >= LEVELS[p.level].getup) {
          p.level = 0;
          p.getting = 0;
        }
      }
    } else {
      p.getting = 0;
      if (p.level === 0) p.level = 1;
    }
    if (was === 0 && p.level > 0) p.slackStart = this.t;
    if (was > 0 && p.level === 0) {
      p.lastSlackEnd = this.t;
      p.lastSlackLen = this.t - p.slackStart;
    }

    const lv = LEVELS[p.level];
    const target = p.level === 0 ? VR : p.level === 1 ? VW : 0;
    p.v += Math.max(-ACC * dt, Math.min(ACC * dt, target - p.v));
    const lapBefore = Math.floor(this.laps);
    p.s += p.v * dt;
    p.stride += p.v * dt * 0.09;
    this.place();
    if (Math.floor(this.laps) > lapBefore) this.emit('lap', { n: Math.floor(this.laps) });

    if (p.level === 0) {
      p.stamina -= this.cfg.drain * dt;
      if (p.stamina <= 0) {
        p.stamina = 0;
        p.gassed = 2.5;
        p.level = 1;
        p.slackStart = this.t;
        this.emit('gassed');
      }
    } else {
      const water = p.level >= 2 && this.inWater();
      p.stamina = Math.min(100, p.stamina + (water ? WATER.regen : lv.regen) * dt);
    }
    if (p.gassed > 0) p.gassed -= dt;

    for (const m of this.mates) {
      m.s += m.v * dt;
      m.stride += m.v * dt * 0.09;
    }
    if (this.sub) this.sub.th = Math.PI / 2 + Math.sin(this.t * 0.42 + 1) * 1.15;

    const seenBefore = this.seen;
    this.seen = this.threat();
    this.updateCoach(dt);

    if (this.seen) {
      if (p.level > 0) {
        this.seenSlack += dt;
        if (this.seenSlack > 0.15) this.anger += lv.anger * dt;
      } else {
        this.seenSlack = 0;
        this.anger += lv.anger * dt;
        // Got back to running just before the eyes arrived.
        if (!seenBefore && this.t - p.lastSlackEnd < 0.7 && p.lastSlackLen >= 1) {
          this.nice++;
          this.points += 5;
          p.lastSlackLen = 0;
          this.emit('nice');
        }
      }
    } else {
      this.seenSlack = 0;
      this.anger -= 2 * dt;
      if (p.level > 0) {
        this.points += lv.pts * dt;
        this.slackTime[p.level] += dt;
      }
    }
    this.anger = Math.max(0, this.anger);
    if (this.anger >= 100) this.strike();

    if (!this.over && this.t >= this.cfg.len) {
      this.t = this.cfg.len;
      this.over = true;
      this.clear = this.laps >= this.cfg.quota - 1e-6;
      if (!this.clear) this.failWhy = 'quota';
    }
  }

  result() {
    const slack = this.slackTime.reduce((a, b) => a + b, 0);
    const base = Math.floor(this.points);
    return {
      index: this.index, clear: this.clear, failWhy: this.failWhy, laps: Math.floor(this.laps * 10) / 10, quota: this.cfg.quota,
      slack: Math.round(slack), slackTime: this.slackTime.map((x) => Math.round(x)), strikes: this.strikes, nice: this.nice,
      base, bonus: this.clear ? CLEAR_BONUS : 0, total: base + (this.clear ? CLEAR_BONUS : 0),
    };
  }
}
