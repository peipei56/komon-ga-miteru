// The school ground: track shape, line-of-sight and vision cones. Pure math, no DOM.
export const W = 1040, H = 620; // world size
export const CX = 520, CY = 330; // centre of the track
export const A = 250; // half length of each straight
export const R = 170; // radius of the curves (running line)
export const TW = 56; // width of the track band
export const L = 4 * A + 2 * Math.PI * R; // one lap along the running line
export const TAU = Math.PI * 2;

export const angDiff = (a, b) => {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
};

/** Point on the track at distance s (counter-clockwise from the start line). `off` shifts outward. */
export function trackPos(s, off = 0) {
  s = ((s % L) + L) % L;
  const r = R + off, curve = Math.PI * R;
  if (s < 2 * A) return { x: CX - A + s, y: CY + r, ang: 0 };
  s -= 2 * A;
  if (s < curve) {
    const p = s / R;
    return { x: CX + A + r * Math.sin(p), y: CY + r * Math.cos(p), ang: -p };
  }
  s -= curve;
  if (s < 2 * A) return { x: CX + A - s, y: CY - r, ang: Math.PI };
  s -= 2 * A;
  const p = s / R;
  return { x: CX - A - r * Math.sin(p), y: CY - r * Math.cos(p), ang: Math.PI - p };
}

/** Distance along a ray until it hits something in `occ` (rectangles and circles), or maxT. */
export function raycast(ox, oy, dx, dy, maxT, occ) {
  let best = maxT;
  for (let i = 0; i < occ.length; i++) {
    const o = occ[i];
    if (o.r) {
      const fx = ox - o.x, fy = oy - o.y;
      const b = fx * dx + fy * dy, c = fx * fx + fy * fy - o.r * o.r;
      if (c <= 0) continue; // standing inside: ignore
      const disc = b * b - c;
      if (disc < 0) continue;
      const t = -b - Math.sqrt(disc);
      if (t > 0 && t < best) best = t;
    } else {
      let t0 = 0, t1 = best, ok = true;
      if (Math.abs(dx) < 1e-9) ok = ox >= o.x && ox <= o.x + o.w;
      else {
        let a = (o.x - ox) / dx, b = (o.x + o.w - ox) / dx;
        if (a > b) [a, b] = [b, a];
        t0 = Math.max(t0, a);
        t1 = Math.min(t1, b);
      }
      if (ok) {
        if (Math.abs(dy) < 1e-9) ok = oy >= o.y && oy <= o.y + o.h;
        else {
          let a = (o.y - oy) / dy, b = (o.y + o.h - oy) / dy;
          if (a > b) [a, b] = [b, a];
          t0 = Math.max(t0, a);
          t1 = Math.min(t1, b);
        }
      }
      if (ok && t0 <= t1 && t0 > 1e-6) best = t0;
    }
  }
  return best;
}

/** Half-angle of a watcher's cone right now (0 while they look away). */
export const halfFov = (c) => c.fov * c.on;

/** Can watcher c see the point? extraFov / extraRange widen the cone for "about to be seen" checks. */
export function visible(c, px, py, occ, extraFov = 0, extraRange = 0) {
  const hf = halfFov(c);
  if (hf <= 0.01 && extraFov < 3) return false;
  const dx = px - c.x, dy = py - c.y, d = Math.hypot(dx, dy);
  if (d > c.range + extraRange) return false;
  if (d < 1) return true;
  if (Math.abs(angDiff(Math.atan2(dy, dx), c.th)) > hf + extraFov) return false;
  return raycast(c.x, c.y, dx / d, dy / d, d, occ) >= d - 0.5;
}

/** Outline of what watcher c can see, as [x0,y0,x1,y1,...] starting at the watcher. */
export function conePoly(c, occ, out = []) {
  out.length = 0;
  const hf = halfFov(c);
  if (hf <= 0.01) return out;
  out.push(c.x, c.y);
  const n = Math.max(6, Math.ceil((hf * 2) / 0.025));
  for (let i = 0; i <= n; i++) {
    const a = c.th - hf + (i / n) * hf * 2, dx = Math.cos(a), dy = Math.sin(a);
    const t = raycast(c.x, c.y, dx, dy, c.range, occ);
    out.push(c.x + dx * t, c.y + dy * t);
  }
  return out;
}
