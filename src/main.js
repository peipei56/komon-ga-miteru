// Game loop, input, HUD, the diary pages and saved data.
import { Practice } from './game.js';
import { Renderer } from './render.js';
import { Sound } from './audio.js';
import { botInput } from './bot.js';
import { addRank, cleanRanks } from './ranking.js';
import { STAGES, LEVELS, MAX_STRIKES, FINISH_BONUS, titleFor } from './data.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const lapsText = (n) => (Number.isInteger(n) ? `${n}周` : `${n.toFixed(1)}周`);
const STEP = 1 / 60;

// ------------------------------------------------------------------ saved data (this device only)
const KEY = 'komon-ga-miteru-save-v1';
const save = { ranks: [], name: '', sound: true, progress: null };
try {
  Object.assign(save, JSON.parse(localStorage.getItem(KEY) || '{}'));
} catch {}
save.ranks = cleanRanks(save.ranks);
save.name = typeof save.name === 'string' ? save.name.slice(0, 12) : '';
{
  const p = save.progress;
  if (!p || !Array.isArray(p.results) || !(p.index >= 1 && p.index < STAGES.length) || p.results.length !== p.index) save.progress = null;
}
function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {}
}

const canvas = $('cv');
const renderer = new Renderer(canvas);
const sound = new Sound();
sound.on = save.sound !== false;

let mode = 'title'; // title | intro | play | pause | result | final
let run = null; // { index, results }
let game = null;
let demo = newDemo();
let acc = 0, last = performance.now();
let hold = false, deeperQueued = false;
let latestRank = null;
let cache = {};
const total = () => run.results.reduce((a, r) => a + r.total, 0);

function newDemo() {
  return new Practice({ index: Math.floor(Math.random() * STAGES.length) });
}

function setMode(m) {
  mode = m;
  $('title').hidden = m !== 'title';
  $('intro').hidden = m !== 'intro';
  $('pause').hidden = m !== 'pause';
  $('result').hidden = m !== 'result';
  $('final').hidden = m !== 'final';
  const inGame = m !== 'title';
  $('hud').hidden = !inGame;
  $('controls').hidden = !(m === 'play' || m === 'pause');
  if (m !== 'play') {
    hold = false;
    deeperQueued = false;
    $('runBtn').classList.remove('down');
  }
  layout();
  const first = $(m) && $(m).querySelector('.go');
  if (first && m !== 'title' && m !== 'play') first.focus({ preventScroll: true });
}

/** Keep the ground clear of the HUD and the buttons. */
function layout() {
  const top = $('hud').hidden ? 0 : $('hud').offsetHeight;
  const bottom = $('controls').hidden ? (mode === 'title' ? 0 : 110) : $('controls').offsetHeight;
  // On a wide screen the title page covers the left side: show the demo beside it.
  const page = mode === 'title' ? $('title').firstElementChild.offsetWidth : 0;
  const left = page && page < window.innerWidth - 200 ? page : 0;
  renderer.insets = { top: top + 6, bottom: bottom + 6, left };
  renderer.resize();
}

// ------------------------------------------------------------------ title
function renderTitle() {
  const p = save.progress;
  $('continueBtn').hidden = !p;
  if (p) $('continueBtn').textContent = `${STAGES[p.index].month}から続ける（${p.results.reduce((a, r) => a + r.total, 0)}pt）`;
  $('startBtn').textContent = p ? '4月からやり直す' : '4月から入部する';
  $('startBtn').className = p ? 'plain' : 'go';
  $('soundBtn').textContent = `音: ${save.sound ? 'ON' : 'OFF'}`;
  if ($('nameInput').value !== save.name) $('nameInput').value = save.name;
  const rows = $('levelRows');
  rows.textContent = '';
  for (const lv of LEVELS.slice(1)) {
    const tr = el('tr');
    tr.append(el('td', '', lv.label), el('td', '', '+' + lv.pts), el('td', '', lv.getup ? lv.getup.toFixed(2) + '秒' : 'すぐ'));
    rows.append(tr);
  }
  const ol = $('ranks');
  ol.textContent = '';
  $('rankEmpty').hidden = save.ranks.length > 0;
  save.ranks.forEach((e, i) => {
    const li = el('li', e === latestRank ? 'latest' : '');
    const who = el('span', 'who', e.name || '名無し部員');
    who.append(el('small', '', `${titleFor(e.score)}${e.cleared ? '・完走' : ''}`));
    li.append(el('span', 'place', i + 1), who, el('span', 'pts', e.score));
    ol.append(li);
  });
}
$('nameInput').addEventListener('input', (e) => {
  save.name = e.target.value.trim().slice(0, 12);
  persist();
});
$('soundBtn').onclick = () => {
  save.sound = !save.sound;
  persist();
  sound.init();
  sound.setOn(save.sound);
  sound.play('select');
  renderTitle();
};
$('startBtn').onclick = () => {
  sound.init();
  run = { index: 0, results: [] };
  save.progress = null;
  persist();
  showIntro();
};
$('continueBtn').onclick = () => {
  sound.init();
  run = { index: save.progress.index, results: save.progress.results.slice() };
  showIntro();
};

// ------------------------------------------------------------------ practice flow
function showIntro() {
  const s = STAGES[run.index];
  game = new Practice({ index: run.index });
  cache = {};
  $('iWhen').textContent = `${s.month}　${run.index + 1} / ${STAGES.length}`;
  $('iTitle').textContent = s.title;
  $('iNote').textContent = s.note;
  $('iLen').textContent = mmss(s.len);
  $('iQuota').textContent = lapsText(s.quota);
  $('iTotal').textContent = total() + 'pt';
  sound.play('select');
  setMode('intro');
  updateHud();
}
$('goBtn').onclick = () => {
  sound.init();
  sound.play('whistle');
  sound.ambience(game.cfg.id);
  renderer.bubbles.length = 0;
  renderer.say('coach', '外周、はじめ！', 1.4);
  acc = 0;
  last = performance.now();
  setMode('play');
};

function endPractice() {
  sound.ambience(null);
  const r = game.result();
  run.results.push(r);
  const s = STAGES[r.index], lastStage = r.index === STAGES.length - 1;
  if (r.clear && !lastStage) {
    run.index++;
    save.progress = { index: run.index, results: run.results };
  } else save.progress = null;
  persist();

  $('rWhen').textContent = `${s.month}　${s.title}`;
  $('rHead').textContent = r.clear ? '練習終了' : r.failWhy === 'scolded' ? '怒られた' : 'ノルマ未達';
  const log = $('rLog');
  log.textContent = '';
  const rows = [
    ['走った距離（ノルマ）', `${r.laps.toFixed(1)}周（${lapsText(r.quota)}）`],
    ['バレずにサボった時間', `${r.slack}秒`],
    ['　うち寝転び', `${r.slackTime[4]}秒`],
    ['怒られた回数', `${r.strikes}回`],
    ['ギリギリ回避', `${r.nice}回`],
    ['サボりpt', r.base],
  ];
  if (r.bonus) rows.push(['練習をやり切った', '+' + r.bonus]);
  for (const [k, v] of rows) log.append(el('dt', '', k), el('dd', '', v));
  log.append(el('dt', 'sum', 'この練習の得点'), el('dd', 'sum', r.total));
  let comment;
  if (r.failWhy === 'scolded') comment = '顧問「罰として外周10周！」';
  else if (r.failWhy === 'quota') comment = '顧問「周回が足りん。居残りだ」';
  else if (r.strikes === 0 && r.slack >= 30) comment = '顧問「今日はよく走っていたな」';
  else if (r.strikes === 0) comment = '顧問「その調子だ」';
  else comment = '顧問「もっと集中しろ」';
  $('rComment').textContent = comment;
  $('nextBtn').textContent = r.clear && !lastStage ? `${STAGES[run.index].month}の練習へ` : '一年の結果を見る';
  sound.play(r.clear ? 'chime' : 'fail');
  setMode('result');
}
$('nextBtn').onclick = () => {
  const r = run.results[run.results.length - 1];
  if (r.clear && r.index < STAGES.length - 1) showIntro();
  else showFinal();
};

function showFinal() {
  const lastR = run.results[run.results.length - 1];
  const cleared = lastR.clear && lastR.index === STAGES.length - 1;
  const score = total() + (cleared ? FINISH_BONUS : 0);
  const entry = { score, name: save.name, cleared, date: Date.now() };
  const place = addRank(save.ranks, entry);
  latestRank = place ? entry : null;
  persist();
  $('fTitle').textContent = titleFor(score);
  $('fScore').textContent = score;
  $('fPlace').hidden = !place;
  $('fPlace').textContent = place ? `ランキング ${place}位` : '';
  const rows = $('fRows');
  rows.textContent = '';
  for (const r of run.results) {
    const tr = el('tr');
    tr.append(el('td', '', `${STAGES[r.index].month} ${STAGES[r.index].title}`), el('td', '', `${r.laps.toFixed(1)}周`), el('td', '', `${r.slack}秒`), el('td', '', `${r.strikes}回`), el('td', '', r.total));
    rows.append(tr);
  }
  if (cleared) {
    const tr = el('tr');
    tr.append(el('td', '', '一年間やり切った'), el('td', '', ''), el('td', '', ''), el('td', '', ''), el('td', '', '+' + FINISH_BONUS));
    rows.append(tr);
  }
  setMode('final');
}
$('againBtn').onclick = () => $('startBtn').click();
$('homeBtn').onclick = () => {
  demo = newDemo();
  renderTitle();
  setMode('title');
};
$('pauseBtn').onclick = () => pause();
$('resumeBtn').onclick = () => {
  last = performance.now();
  setMode('play');
};
$('quitBtn').onclick = () => {
  sound.ambience(null);
  demo = newDemo();
  renderTitle();
  setMode('title');
};
function pause() {
  if (mode === 'play') setMode('pause');
}

// ------------------------------------------------------------------ HUD
function setText(id, v) {
  if (cache[id] !== v) {
    cache[id] = v;
    $(id).textContent = v;
  }
}
function setWidth(id, f) {
  const v = Math.round(Math.max(0, Math.min(1, f)) * 200) / 2 + '%';
  if (cache[id] !== v) {
    cache[id] = v;
    $(id).style.width = v;
  }
}
function setClass(id, cls, on) {
  const k = id + cls;
  if (cache[k] !== on) {
    cache[k] = on;
    $(id).classList.toggle(cls, on);
  }
}
function updateHud() {
  const g = game, p = g.p, left = g.cfg.len - g.t;
  setText('hMonth', g.cfg.month);
  setText('hTitle', g.cfg.title);
  setText('hTime', mmss(Math.ceil(left)));
  setClass('hTime', 'late', left < 15 && g.laps < g.cfg.quota);
  setText('hPts', total() + Math.floor(g.points));
  setWidth('mStamina', p.stamina / 100);
  $('mStamina').parentElement.parentElement.classList.toggle('low', p.stamina < 25 || p.gassed > 0);
  setWidth('mAnger', g.anger / 100);
  setText('mStrikes', '●'.repeat(g.strikes) + '○'.repeat(MAX_STRIKES - g.strikes));
  setText('mLaps', `${(Math.floor(g.laps * 10) / 10).toFixed(1)} / ${lapsText(g.cfg.quota)}`);
  setWidth('mQuota', g.laps / g.cfg.quota);
  $('mQuota').parentElement.parentElement.classList.toggle('done', g.laps >= g.cfg.quota);
  const lv = LEVELS[p.level];
  let text, cls = '';
  if (g.seen && p.level > 0) {
    text = '見られている！　走れ！';
    cls = 'seen';
  } else if (p.gassed > 0) text = 'バテた…（走れない）';
  else if (p.level === 0) text = g.seen ? '走っている（見られている）' : '走っている';
  else {
    text = `${lv.label}　+${lv.pts}pt/秒`;
    cls = 'safe';
  }
  if (cache.state !== text) {
    cache.state = text;
    $('state').textContent = text;
    $('state').className = 'state ' + cls;
  }
  setClass('runBtn', 'off', p.gassed > 0);
}

function handleFx(fx) {
  for (const e of fx) {
    switch (e.t) {
      case 'strike':
        sound.play('whistle');
        sound.play('yell');
        renderer.bubbles.push({ who: 'coach', text: game.strikes >= MAX_STRIKES ? 'いい加減にしろ！！' : 'コラーッ！！', life: 1.6, max: 1.6, shout: true });
        renderer.say('player', 'ひっ…', 1.2);
        break;
      case 'nice':
        sound.play('nice');
        renderer.say('player', 'セーフ +5', 1.1);
        break;
      case 'gassed':
        sound.play('gassed');
        renderer.say('player', 'ぜぇ…ぜぇ…', 2);
        break;
      case 'alert': sound.play('alert'); break;
      case 'bell': sound.play('bell'); break;
      case 'lap':
        sound.play('lap');
        renderer.say('player', `${e.n}周目`, 1);
        break;
    }
  }
  fx.length = 0;
}

// ------------------------------------------------------------------ input
const RUN_KEYS = new Set(['Space', 'ArrowRight', 'ArrowUp', 'KeyD', 'KeyW', 'KeyJ']);
const SLACK_KEYS = new Set(['ArrowDown', 'KeyS', 'KeyK', 'ShiftLeft', 'ShiftRight']);
const keysDown = new Set();
let pointerHold = false;
const syncHold = () => {
  hold = pointerHold || [...keysDown].some((k) => RUN_KEYS.has(k));
  $('runBtn').classList.toggle('down', hold);
};
function slackPress() {
  if (mode !== 'play') return;
  deeperQueued = true;
  sound.play('deeper');
  $('slackBtn').classList.add('down');
  setTimeout(() => $('slackBtn').classList.remove('down'), 120);
}
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  if (mode === 'play' && (RUN_KEYS.has(e.code) || SLACK_KEYS.has(e.code))) e.preventDefault();
  if (e.repeat) return;
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (mode === 'play') pause();
    else if (mode === 'pause') $('resumeBtn').click();
    return;
  }
  if (mode !== 'play') return;
  if (RUN_KEYS.has(e.code)) {
    keysDown.add(e.code);
    syncHold();
  } else if (SLACK_KEYS.has(e.code)) slackPress();
});
window.addEventListener('keyup', (e) => {
  keysDown.delete(e.code);
  syncHold();
});
window.addEventListener('blur', () => {
  keysDown.clear();
  pointerHold = false;
  syncHold();
});
const press = (e) => {
  if (mode !== 'play') return;
  e.preventDefault();
  sound.init();
  pointerHold = true;
  syncHold();
};
const release = () => {
  pointerHold = false;
  syncHold();
};
for (const target of [$('runBtn'), canvas]) {
  target.addEventListener('pointerdown', press);
  target.addEventListener('pointerup', release);
  target.addEventListener('pointercancel', release);
  target.addEventListener('pointerleave', release);
  target.addEventListener('contextmenu', (e) => e.preventDefault());
}
$('slackBtn').addEventListener('pointerdown', (e) => {
  e.preventDefault();
  slackPress();
});

// ------------------------------------------------------------------ loop
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (mode === 'title') {
    acc += dt;
    while (acc >= STEP) {
      acc -= STEP;
      demo.update(STEP, botInput(demo));
      demo.fx.length = 0;
      if (demo.over) demo = newDemo();
    }
    renderer.draw(demo, dt, { demo: true });
    return;
  }
  if (mode === 'play') {
    acc += dt;
    let n = 0;
    while (acc >= STEP && n++ < 5 && !game.over) {
      acc -= STEP;
      game.update(STEP, { hold, deeper: deeperQueued });
      deeperQueued = false;
      handleFx(game.fx);
    }
    if (acc > STEP * 5) acc = 0;
    const tense = game.seen && game.p.level > 0 ? Math.min(1, 0.4 + game.anger / 100) : game.anger > 55 ? 0.3 : 0;
    sound.tick(dt, game.p.v, tense);
    updateHud();
    if (game.over) endPractice();
  }
  renderer.draw(game, mode === 'play' ? dt : 0);
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
  last = performance.now();
});
window.addEventListener('resize', layout);
if (typeof ResizeObserver === 'function') new ResizeObserver(layout).observe(canvas);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);

renderTitle();
setMode('title');
requestAnimationFrame(frame);

// For debugging and automated browser checks.
window.__komon = { get game() { return game; }, get mode() { return mode; }, get run() { return run; }, save, renderer };
