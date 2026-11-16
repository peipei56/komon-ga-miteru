// Every sound is synthesised: footsteps, the whistle, the bicycle bell, cicadas and the school chime.
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class Sound {
  constructor() {
    this.ctx = null;
    this.on = true;
    this.stepAcc = 0;
    this.beatAcc = 0;
    this.amb = null;
  }

  /** Browsers only allow audio after a tap or key press. */
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.out = this.ctx.createGain();
    this.out.gain.value = this.on ? 0.55 : 0;
    this.out.connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  setOn(v) {
    this.on = v;
    if (this.out) this.out.gain.value = v ? 0.55 : 0;
  }

  tone(freq, dur, type = 'sine', vol = 0.2, when = 0, slide = 0) {
    const t = this.ctx.currentTime + when, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.out);
    o.start(t);
    o.stop(t + dur + 0.03);
  }

  noise(dur, vol, freq, type = 'lowpass', when = 0) {
    const t = this.ctx.currentTime + when, s = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    s.buffer = this.noiseBuf;
    f.type = type;
    f.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f);
    f.connect(g);
    g.connect(this.out);
    s.start(t, Math.random() * 0.4, dur + 0.03);
  }

  play(name) {
    if (!this.ctx || !this.on) return;
    switch (name) {
      case 'whistle': // pea whistle: two close tones with a fast warble
        for (const f of [2350, 2500]) {
          const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain(), l = this.ctx.createOscillator(), lg = this.ctx.createGain();
          o.frequency.value = f;
          l.frequency.value = 38;
          lg.gain.value = 90;
          l.connect(lg);
          lg.connect(o.frequency);
          g.gain.setValueAtTime(0.0001, t);
          g.gain.linearRampToValueAtTime(0.16, t + 0.02);
          g.gain.setValueAtTime(0.16, t + 0.5);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 0.62);
          o.connect(g);
          g.connect(this.out);
          o.start(t);
          l.start(t);
          o.stop(t + 0.65);
          l.stop(t + 0.65);
        }
        break;
      case 'yell': this.tone(240, 0.5, 'sawtooth', 0.22, 0.05, 120); this.noise(0.4, 0.2, 900, 'bandpass', 0.05); break;
      case 'alert': this.tone(1568, 0.07, 'square', 0.1); this.tone(2093, 0.1, 'square', 0.1, 0.08); break;
      case 'bell': for (const w of [0, 0.16]) { this.tone(2637, 0.3, 'sine', 0.16, w); this.tone(3951, 0.2, 'sine', 0.07, w); } break;
      case 'nice': [0, 5, 9].forEach((n, i) => this.tone(mtof(79 + n), 0.1, 'triangle', 0.14, i * 0.05)); break;
      case 'deeper': this.tone(330, 0.12, 'sine', 0.12, 0, 190); break;
      case 'lap': this.tone(mtof(76), 0.12, 'triangle', 0.14); this.tone(mtof(83), 0.2, 'triangle', 0.14, 0.1); break;
      case 'gassed': this.noise(0.5, 0.14, 1400, 'bandpass'); this.noise(0.5, 0.12, 1200, 'bandpass', 0.7); break;
      case 'select': this.tone(660, 0.08, 'triangle', 0.14, 0, 990); break;
      case 'fail': [0, -2, -5, -9].forEach((n, i) => this.tone(mtof(64 + n), 0.3, 'sawtooth', 0.1, i * 0.22)); break;
      case 'chime': {
        // The Westminster chime that ends the school day.
        const seq = [64, 60, 62, 55, null, 55, 62, 64, 60];
        let when = 0;
        for (const n of seq) {
          if (n !== null) {
            this.tone(mtof(n + 12), 1.1, 'sine', 0.13, when);
            this.tone(mtof(n + 24), 0.6, 'sine', 0.04, when);
          }
          when += n === null ? 0.25 : 0.42;
        }
        break;
      }
    }
  }

  /** Footsteps and heartbeat, driven from the game loop. */
  tick(dt, speed, tense) {
    if (!this.ctx || !this.on) return;
    if (speed > 12) {
      this.stepAcc += dt * (1.6 + speed / 34);
      if (this.stepAcc >= 1) {
        this.stepAcc = 0;
        this.noise(0.045, 0.05 + speed / 1400, 700 + Math.random() * 300);
      }
    }
    if (tense > 0) {
      this.beatAcc += dt * (1.6 + tense * 2.2);
      if (this.beatAcc >= 1) {
        this.beatAcc = 0;
        this.tone(62, 0.16, 'sine', 0.3 * tense + 0.1);
        this.tone(52, 0.2, 'sine', 0.22 * tense + 0.06, 0.13);
      }
    }
  }

  /** Summer practice: cicadas. Any other id stops them. */
  ambience(id) {
    if (this.amb) {
      try {
        this.amb.stop();
      } catch {}
      this.amb = null;
    }
    if (!this.ctx || id !== 'summer') return;
    const s = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain(), l = this.ctx.createOscillator(), lg = this.ctx.createGain();
    s.buffer = this.noiseBuf;
    s.loop = true;
    f.type = 'bandpass';
    f.frequency.value = 4700;
    f.Q.value = 9;
    g.gain.value = 0.05;
    l.frequency.value = 21;
    lg.gain.value = 0.04;
    l.connect(lg);
    lg.connect(g.gain);
    s.connect(f);
    f.connect(g);
    g.connect(this.out);
    s.start();
    l.start();
    this.amb = { stop: () => { s.stop(); l.stop(); } };
  }
}
