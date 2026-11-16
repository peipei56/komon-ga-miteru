// Canvas drawing: the ground seen from above, the watchers' vision cones, runners and speech bubbles.
import { W, H, CX, CY, A, R, TW, L, TAU, trackPos, conePoly } from './geom.js';
import { WATER, SPOTS } from './data.js';

const PAL = {
  spring: { ground: '#dccba6', grass: '#93c26d', stripe: '#89ba63', track: '#c26a4c', leaf: '#f4b8ca', leaf2: '#ea9db6', tint: null, drift: '#ffd3e0' },
  rainy: { ground: '#c2b79d', grass: '#72ae6c', stripe: '#69a564', track: '#a95b45', leaf: '#4f9c57', leaf2: '#3f8848', tint: 'rgba(60,90,115,0.13)', drift: null, puddles: true },
  summer: { ground: '#e6d3a3', grass: '#7fc251', stripe: '#74b848', track: '#cb6b45', leaf: '#2f9142', leaf2: '#237a35', tint: 'rgba(255,225,130,0.08)', drift: null },
  autumn: { ground: '#d5bc92', grass: '#a6af5e', stripe: '#9ca556', track: '#b96043', leaf: '#e38d30', leaf2: '#c9641f', tint: 'rgba(255,130,50,0.13)', drift: '#e89a3c' },
  winter: { ground: '#cbc6bd', grass: '#9ea98e', stripe: '#95a085', track: '#a9614d', leaf: '#8d8275', leaf2: '#786d61', tint: 'rgba(50,70,140,0.22)', drift: '#ffffff' },
};
const MATE = ['#2b6cb0', '#2f855a', '#b7791f', '#6b46c1', '#2c7a7b', '#c05621', '#4a5568', '#b83280', '#3182ce'];

export class Renderer {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.bubbles = [];
    this.poly = [];
    this.time = 0;
    this.insets = { top: 96, bottom: 100, left: 0 };
    this.staticKey = '';
    this.drift = Array.from({ length: 34 }, () => ({ x: Math.random(), y: Math.random(), v: 0.03 + Math.random() * 0.05, w: Math.random() * 6 }));
    this.reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.cv.clientWidth || 800, h = this.cv.clientHeight || 600;
    this.cv.width = Math.round(w * dpr);
    this.cv.height = Math.round(h * dpr);
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    const availH = Math.max(120, h - this.insets.top - this.insets.bottom);
    this.portrait = h > w * 1.05;
    const fw = this.portrait ? H : W, fh = this.portrait ? W : H;
    const left = this.insets.left || 0, availW = Math.max(120, w - left);
    this.sc = Math.min(availW / fw, availH / fh);
    this.ox = left + (availW - fw * this.sc) / 2;
    this.oy = this.insets.top + (availH - fh * this.sc) / 2;
    this.staticKey = '';
  }

  /** World point to CSS pixels. In portrait the ground is turned a quarter. */
  toScreen(x, y) {
    return this.portrait ? [this.ox + (H - y) * this.sc, this.oy + x * this.sc] : [this.ox + x * this.sc, this.oy + y * this.sc];
  }
  worldTransform(ctx, k) {
    if (this.portrait) ctx.setTransform(0, this.sc * k, -this.sc * k, 0, (this.ox + H * this.sc) * k, this.oy * k);
    else ctx.setTransform(this.sc * k, 0, 0, this.sc * k, this.ox * k, this.oy * k);
  }

  say(who, text, life = 1.6) {
    this.bubbles = this.bubbles.filter((b) => b.who !== who);
    this.bubbles.push({ who, text, life, max: life });
  }

  // ---------------------------------------------------------------- static layer

  trackPath(ctx, off) {
    const r = R + off;
    ctx.beginPath();
    ctx.moveTo(CX - A, CY + r);
    ctx.lineTo(CX + A, CY + r);
    ctx.arc(CX + A, CY, r, Math.PI / 2, -Math.PI / 2, true);
    ctx.lineTo(CX - A, CY - r);
    ctx.arc(CX - A, CY, r, -Math.PI / 2, Math.PI / 2, true);
    ctx.closePath();
  }

  buildStatic(g) {
    const pal = PAL[g.cfg.id];
    const k = this.sc * this.dpr;
    const cv = (this.staticCv ||= document.createElement('canvas'));
    cv.width = Math.ceil(W * k);
    cv.height = Math.ceil(H * k);
    const c = cv.getContext('2d');
    c.setTransform(k, 0, 0, k, 0, 0);
    c.fillStyle = pal.ground;
    c.fillRect(0, 0, W, H);
    // scuffed dirt
    for (let i = 0; i < 260; i++) {
      c.fillStyle = i % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(80,60,30,0.05)';
      const x = (i * 197.3) % W, y = 64 + ((i * 91.7) % (H - 64));
      c.fillRect(x, y, 14 + (i % 7) * 4, 2);
    }
    // school building along the top edge
    c.fillStyle = '#ece7dc';
    c.fillRect(0, 0, W, 52);
    c.fillStyle = '#b9b2a4';
    c.fillRect(0, 52, W, 5);
    c.fillStyle = '#7f9bb5';
    for (let x = 16; x < W - 30; x += 46) {
      if (Math.abs(x + 15 - CX) < 46) continue;
      c.fillRect(x, 12, 30, 12);
      c.fillRect(x, 30, 30, 12);
    }
    c.fillStyle = '#8c8577';
    c.fillRect(CX - 26, 30, 52, 22); // entrance
    // track
    this.trackPath(c, 0);
    c.lineWidth = TW;
    c.strokeStyle = pal.track;
    c.stroke();
    c.lineWidth = 1.2;
    c.strokeStyle = 'rgba(255,255,255,0.75)';
    for (const off of [-TW / 2, -TW / 4, 0, TW / 4, TW / 2]) {
      this.trackPath(c, off);
      c.stroke();
    }
    // infield
    this.trackPath(c, -TW / 2 - 1);
    c.fillStyle = pal.grass;
    c.fill();
    c.save();
    c.clip();
    c.fillStyle = pal.stripe;
    for (let x = CX - A - R; x < CX + A + R; x += 80) c.fillRect(x, CY - R, 40, R * 2);
    c.strokeStyle = 'rgba(255,255,255,0.55)';
    c.lineWidth = 2;
    c.strokeRect(CX - 300, CY - 122, 600, 244);
    c.beginPath();
    c.moveTo(CX, CY - 122);
    c.lineTo(CX, CY + 122);
    c.moveTo(CX + 42, CY);
    c.arc(CX, CY, 42, 0, TAU);
    c.stroke();
    c.strokeRect(CX - 300, CY - 62, 70, 124);
    c.strokeRect(CX + 230, CY - 62, 70, 124);
    c.restore();
    // puddles after rain
    if (pal.puddles) {
      c.fillStyle = 'rgba(120,150,180,0.45)';
      for (const [x, y, rx, ry] of [[200, 560, 46, 12], [820, 96, 40, 10], [960, 420, 22, 30], [600, 575, 30, 8]]) {
        c.beginPath();
        c.ellipse(x, y, rx, ry, 0, 0, TAU);
        c.fill();
      }
    }
    // start line
    c.strokeStyle = '#ffffff';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(CX - A, CY + R - TW / 2);
    c.lineTo(CX - A, CY + R + TW / 2);
    c.stroke();
    // morning-assembly platform where the coach likes to stand
    c.fillStyle = '#9a9488';
    c.fillRect(SPOTS.home[0] - 26, SPOTS.home[1] - 12, 52, 26);
    c.fillStyle = '#b5afa2';
    c.fillRect(SPOTS.home[0] - 22, SPOTS.home[1] - 9, 44, 20);
    // water tap
    if (g.cfg.water) {
      c.strokeStyle = 'rgba(80,170,255,0.9)';
      c.lineWidth = 4;
      c.setLineDash([8, 6]);
      c.beginPath();
      for (let d = -WATER.half; d <= WATER.half; d += 6) {
        const q = trackPos(WATER.s + d, TW / 2 + 4);
        if (d === -WATER.half) c.moveTo(q.x, q.y);
        else c.lineTo(q.x, q.y);
      }
      c.stroke();
      c.setLineDash([]);
      c.fillStyle = '#8f9aa3';
      c.fillRect(WATER.x - 10, WATER.y - 22, 20, 44);
      c.fillStyle = '#4aa8ff';
      for (const dy of [-14, 0, 14]) {
        c.beginPath();
        c.arc(WATER.x + 4, WATER.y + dy, 3.5, 0, TAU);
        c.fill();
      }
    }
    this.staticKey = g.cfg.id + '|' + k.toFixed(3);
  }

  // ---------------------------------------------------------------- pieces

  drawOcc(c, o, pal) {
    if (o.kind === 'tree') {
      c.fillStyle = 'rgba(0,0,0,0.16)';
      c.beginPath();
      c.ellipse(o.x + 7, o.y + 9, o.r * 1.05, o.r * 0.9, 0, 0, TAU);
      c.fill();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + o.x;
        c.fillStyle = i % 2 ? pal.leaf : pal.leaf2;
        c.beginPath();
        c.arc(o.x + Math.cos(a) * o.r * 0.42, o.y + Math.sin(a) * o.r * 0.42, o.r * 0.62, 0, TAU);
        c.fill();
      }
      c.fillStyle = pal.leaf;
      c.beginPath();
      c.arc(o.x - 2, o.y - 2, o.r * 0.5, 0, TAU);
      c.fill();
      return;
    }
    c.fillStyle = 'rgba(0,0,0,0.18)';
    c.fillRect(o.x + 6, o.y + 7, o.w, o.h);
    if (o.kind === 'tent') {
      c.fillStyle = '#f7f5ee';
      c.fillRect(o.x, o.y, o.w, o.h);
      c.fillStyle = '#3d7dd8';
      for (let x = o.x; x < o.x + o.w; x += 30) c.fillRect(x, o.y, 15, o.h);
      c.strokeStyle = 'rgba(0,0,0,0.25)';
      c.lineWidth = 1.5;
      c.strokeRect(o.x, o.y, o.w, o.h);
      c.beginPath();
      c.moveTo(o.x, o.y + o.h / 2);
      c.lineTo(o.x + o.w, o.y + o.h / 2);
      c.stroke();
    } else if (o.kind === 'mat') {
      c.fillStyle = '#2f6fc4';
      c.fillRect(o.x, o.y, o.w, o.h);
      c.fillStyle = '#4b8be0';
      c.fillRect(o.x + 4, o.y + 4, o.w - 8, o.h - 8);
      c.strokeStyle = 'rgba(255,255,255,0.5)';
      c.lineWidth = 1.5;
      c.strokeRect(o.x + 4, o.y + 4, o.w / 2 - 4, o.h - 8);
    } else if (o.kind === 'board') {
      c.fillStyle = '#24543a';
      c.fillRect(o.x, o.y, o.w, o.h);
      c.fillStyle = '#e9e4d6';
      c.fillRect(o.x + 6, o.y + 4, 22, 8);
      c.fillRect(o.x + o.w - 28, o.y + 4, 22, 8);
    } else {
      c.fillStyle = '#8b8f95';
      c.fillRect(o.x, o.y, o.w, o.h);
      c.fillStyle = '#a3a8ae';
      c.fillRect(o.x, o.y, o.w, o.h / 2);
      c.strokeStyle = 'rgba(0,0,0,0.3)';
      c.lineWidth = 1.5;
      c.strokeRect(o.x, o.y, o.w, o.h);
    }
  }

  /** A person seen from above, facing +x after rotation. */
  person(c, x, y, ang, stride, o) {
    const s = o.scale || 1, pose = o.pose || 'run';
    c.save();
    c.translate(x, y);
    c.rotate(ang);
    c.scale(s, s);
    c.lineCap = 'round';
    if (pose === 'lie') {
      c.fillStyle = 'rgba(0,0,0,0.15)';
      c.fillRect(-13, -6, 26, 14);
      c.strokeStyle = o.skin;
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(-2, -5);
      c.lineTo(-7, -11);
      c.moveTo(-2, 5);
      c.lineTo(-7, 11);
      c.stroke();
      c.strokeStyle = o.pants;
      c.lineWidth = 3.4;
      c.beginPath();
      c.moveTo(-6, -2.5);
      c.lineTo(-16, -3.5);
      c.moveTo(-6, 2.5);
      c.lineTo(-16, 4);
      c.stroke();
      c.fillStyle = o.shirt;
      c.beginPath();
      c.ellipse(-1, 0, 8, 5.4, 0, 0, TAU);
      c.fill();
      c.fillStyle = o.hair;
      c.beginPath();
      c.arc(9, 0, 4.4, 0, TAU);
      c.fill();
      c.restore();
      return;
    }
    const amp = pose === 'run' ? 6 : pose === 'walk' ? 2.6 : 0;
    const sw = Math.sin(stride) * amp;
    c.fillStyle = 'rgba(0,0,0,0.16)';
    c.beginPath();
    c.ellipse(2, 3, 7, 8, 0, 0, TAU);
    c.fill();
    // legs
    c.strokeStyle = o.pants;
    c.lineWidth = 3.4;
    c.beginPath();
    if (pose === 'sit') {
      c.moveTo(2, -3);
      c.lineTo(11, -4);
      c.moveTo(2, 3);
      c.lineTo(11, 4);
    } else {
      c.moveTo(0, -3);
      c.lineTo(sw, -3);
      c.moveTo(0, 3);
      c.lineTo(-sw, 3);
    }
    c.stroke();
    // arms
    c.strokeStyle = o.skin;
    c.lineWidth = 2.6;
    c.beginPath();
    if (pose === 'stop') {
      c.moveTo(1, -6.5);
      c.lineTo(7, -4.5);
      c.moveTo(1, 6.5);
      c.lineTo(7, 4.5);
    } else if (pose === 'sit') {
      c.moveTo(-1, -6.5);
      c.lineTo(-6, -9);
      c.moveTo(-1, 6.5);
      c.lineTo(-6, 9);
    } else {
      c.moveTo(0, -7);
      c.lineTo(-sw * 0.8, -7.5);
      c.moveTo(0, 7);
      c.lineTo(sw * 0.8, 7.5);
    }
    c.stroke();
    c.fillStyle = o.shirt;
    c.beginPath();
    c.ellipse(0, 0, pose === 'sit' ? 5.5 : 4.6, 7.4, 0, 0, TAU);
    c.fill();
    c.fillStyle = o.hair;
    c.beginPath();
    c.arc(pose === 'stop' ? 3.5 : 1, 0, 4.3, 0, TAU);
    c.fill();
    if (o.cap) {
      c.fillStyle = o.cap;
      c.beginPath();
      c.arc(1, 0, 4.5, 0, TAU);
      c.fill();
      c.fillRect(3, -3.4, 5.5, 6.8);
    }
    c.restore();
  }

  cone(c, w, occ, hot, rgb) {
    const poly = conePoly(w, occ, this.poly);
    if (poly.length < 6) return;
    c.beginPath();
    c.moveTo(poly[0], poly[1]);
    for (let i = 2; i < poly.length; i += 2) c.lineTo(poly[i], poly[i + 1]);
    c.closePath();
    const col = hot ? '255,64,48' : rgb;
    const gr = c.createRadialGradient(w.x, w.y, 6, w.x, w.y, w.range);
    gr.addColorStop(0, `rgba(${col},${hot ? 0.62 : 0.55})`);
    gr.addColorStop(0.6, `rgba(${col},${hot ? 0.4 : 0.32})`);
    gr.addColorStop(1, `rgba(${col},0.14)`);
    c.fillStyle = gr;
    c.fill();
    c.strokeStyle = `rgba(${col},0.75)`;
    c.lineWidth = 1.5;
    c.stroke();
  }

  bubble(c, x, y, text, alpha, style = 'talk') {
    c.save();
    c.globalAlpha = alpha;
    const big = style === 'shout';
    c.font = `${big ? 22 : 15}px "Yusei Magic", "Zen Kaku Gothic New", sans-serif`;
    const tw = c.measureText(text).width, padX = 9, bh = big ? 34 : 26;
    let bx = Math.max(6, Math.min(this.w - tw - padX * 2 - 6, x - tw / 2 - padX));
    const by = Math.max(this.insets.top - 30, y - bh - 14);
    c.fillStyle = big ? '#e2231a' : '#ffffff';
    c.strokeStyle = big ? '#7d0d08' : '#3a3a3a';
    c.lineWidth = 2;
    c.beginPath();
    c.roundRect(bx, by, tw + padX * 2, bh, 9);
    c.fill();
    c.stroke();
    c.fillStyle = big ? '#ffffff' : '#222222';
    c.textBaseline = 'middle';
    c.fillText(text, bx + padX, by + bh / 2 + 1);
    c.restore();
  }

  // ---------------------------------------------------------------- frame

  draw(g, dt, opts = {}) {
    const c = this.ctx, pal = PAL[g.cfg.id];
    this.time += dt;
    const key = g.cfg.id + '|' + (this.sc * this.dpr).toFixed(3);
    if (key !== this.staticKey) this.buildStatic(g);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = pal.ground;
    c.fillRect(0, 0, this.cv.width, this.cv.height);
    this.worldTransform(c, this.dpr);
    c.drawImage(this.staticCv, 0, 0, W, H);

    const p = g.p;
    const hot = g.seen && p.level > 0;
    for (const w of g.watchers) this.cone(c, w, g.occ, hot && w === g.coach ? true : hot, w.kind === 'sub' ? '255,168,96' : '255,214,64');
    for (const o of g.occ) this.drawOcc(c, o, pal);

    // teammates
    for (const m of g.mates) {
      const q = trackPos(m.s, m.off);
      this.person(c, q.x, q.y, q.ang, m.stride, { shirt: '#f4f4f0', pants: MATE[m.hue % MATE.length], skin: '#e8b98f', hair: '#2b2118', pose: 'run', scale: 1.25 });
    }
    // the player
    const pose = ['run', 'walk', 'stop', 'sit', 'lie'][p.level];
    c.strokeStyle = hot ? 'rgba(255,60,40,0.95)' : 'rgba(255,255,255,0.95)';
    c.lineWidth = 2.5;
    c.beginPath();
    c.arc(p.x, p.y, 15 + Math.sin(this.time * 6) * 1.2, 0, TAU);
    c.stroke();
    this.person(c, p.x, p.y, p.ang, p.stride, { shirt: '#ffd23f', pants: '#1f3a8a', skin: '#e8b98f', hair: '#2b2118', pose, scale: 1.45 });

    // watchers
    for (const w of g.watchers) {
      if (w.bike) {
        c.save();
        c.translate(w.x, w.y);
        c.rotate(w.th - w.look);
        c.strokeStyle = '#30343a';
        c.lineWidth = 3;
        c.beginPath();
        c.moveTo(-15, 0);
        c.lineTo(15, 0);
        c.stroke();
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(11, -7);
        c.lineTo(11, 7);
        c.stroke();
        c.restore();
      }
      const away = w.on < 0.5;
      this.person(c, w.x, w.y, w.th, this.time * 6, { shirt: w.kind === 'sub' ? '#28457a' : '#d6332e', pants: '#2b2b33', skin: '#dba87c', hair: '#3a2f25', cap: w.kind === 'sub' ? null : '#ffffff', pose: w.state === 'move' ? 'walk' : away ? 'stop' : 'run', scale: 1.7 });
    }

    // ---- screen space
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (pal.tint) {
      // season light over everything, edge to edge
      c.fillStyle = pal.tint;
      c.fillRect(0, 0, this.w, this.h);
    }
    if (pal.drift && !this.reduced) {
      c.fillStyle = pal.drift;
      for (const d of this.drift) {
        d.y += d.v * dt;
        d.x += Math.sin(this.time + d.w) * 0.02 * dt;
        if (d.y > 1) {
          d.y = 0;
          d.x = Math.random();
        }
        c.globalAlpha = 0.75;
        c.beginPath();
        c.ellipse(d.x * this.w, d.y * this.h, 3, 2, d.w + this.time, 0, TAU);
        c.fill();
      }
      c.globalAlpha = 1;
    }
    const [px, py] = this.toScreen(p.x, p.y);
    if (!opts.demo) {
      // "you" marker
      c.fillStyle = '#ffd23f';
      c.strokeStyle = '#1b1b1b';
      c.lineWidth = 2;
      c.beginPath();
      const my = py - 26 * Math.max(0.8, this.sc) - 4 + Math.sin(this.time * 5) * 2;
      c.moveTo(px, my + 9);
      c.lineTo(px - 7, my);
      c.lineTo(px + 7, my);
      c.closePath();
      c.fill();
      c.stroke();
    }
    if (p.level === 4 && !hot) {
      c.font = '16px "Yusei Magic", sans-serif';
      c.fillStyle = '#ffffff';
      c.strokeStyle = '#333';
      c.lineWidth = 3;
      for (let i = 0; i < 3; i++) {
        const ph = (this.time * 0.7 + i / 3) % 1;
        c.globalAlpha = 1 - ph;
        c.strokeText('z', px + 12 + ph * 16, py - 10 - ph * 22);
        c.fillText('z', px + 12 + ph * 16, py - 10 - ph * 22);
      }
      c.globalAlpha = 1;
    }
    for (const w of g.watchers) {
      const [wx, wy] = this.toScreen(w.x, w.y);
      if (w.alert) this.bubble(c, wx, wy - 4, '！', 1, 'shout');
      else if (w.label) this.bubble(c, wx, wy - 4, w.label, 0.95);
    }
    let n = 0;
    for (const b of this.bubbles) {
      b.life -= dt;
      if (b.life <= 0) continue;
      const src = b.who === 'player' ? p : b.who === 'sub' && g.sub ? g.sub : g.coach;
      const [bx, by] = this.toScreen(src.x, src.y);
      this.bubble(c, bx, by - (b.who === 'player' ? 14 : 4), b.text, Math.min(1, b.life * 3), b.shout ? 'shout' : 'talk');
      this.bubbles[n++] = b;
    }
    this.bubbles.length = n;

    // red edges while being watched slacking
    if (hot || g.anger > 60) {
      const a = Math.min(0.55, (hot ? 0.25 : 0) + (g.anger / 100) * 0.3);
      const v = c.createRadialGradient(this.w / 2, this.h / 2, Math.min(this.w, this.h) * 0.35, this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.75);
      v.addColorStop(0, 'rgba(226,35,26,0)');
      v.addColorStop(1, `rgba(226,35,26,${a})`);
      c.fillStyle = v;
      c.fillRect(0, 0, this.w, this.h);
    }
  }
}
