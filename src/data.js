// Tuning and content: slack levels, things on the ground, and the five practices of the year.
import { CX, CY, A, R, L } from './geom.js';

export const VR = L / 20; // running speed: one lap in 20 seconds
export const VW = VR * 0.3; // strolling speed
export const MAX_STRIKES = 3;
export const CLEAR_BONUS = 30;
export const FINISH_BONUS = 200; // for getting through the whole year

// How you can slack. pts = points per second while unseen, regen = stamina per second,
// anger = how fast the coach's anger fills per second while he is watching, getup = seconds to start running again.
export const LEVELS = [
  { id: 'run', label: '走っている', pts: 0, regen: 0, anger: -8, getup: 0 },
  { id: 'walk', label: 'ちんたら歩き', pts: 1, regen: 7, anger: 30, getup: 0 },
  { id: 'stop', label: '立ち止まり', pts: 3, regen: 12, anger: 60, getup: 0.15 },
  { id: 'sit', label: '座り込み', pts: 6, regen: 18, anger: 110, getup: 0.45 },
  { id: 'lie', label: '寝転び', pts: 10, regen: 26, anger: 250, getup: 0.9 },
];

// Where the coach can stand.
export const SPOTS = {
  center: [CX, CY - 8],
  home: [CX, CY + R + 66],
  right: [CX + 225, CY],
  left: [CX - 258, CY - 12],
  back: [CX, CY - R - 64],
};

// Things that block the view. Rectangles have w/h, trees have r.
export const OCC = {
  tent: { kind: 'tent', x: CX - 75, y: CY + 62, w: 150, h: 52 },
  mat: { kind: 'mat', x: CX + 148, y: CY - 108, w: 74, h: 48 },
  board: { kind: 'board', x: CX - 284, y: CY - 116, w: 92, h: 16 },
  shed: { kind: 'shed', x: CX - 350, y: CY + 42, w: 72, h: 54 },
  treeR: { kind: 'tree', x: CX + 330, y: CY, r: 26 },
  treeL: { kind: 'tree', x: CX - 372, y: CY - 14, r: 22 },
  treeT: { kind: 'tree', x: CX - 60, y: CY - 96, r: 22 },
};

// The water tap sits outside the left curve.
export const WATER = { x: CX - A - R - 52, y: CY, s: 4 * A + Math.PI * R + (R * Math.PI) / 2, half: 55, regen: 45 };

const ALL = ['tent', 'mat', 'board', 'shed', 'treeR', 'treeL', 'treeT'];

// coach: omega = how fast he turns his head, fov = half-angle of his view, track = how often he looks straight at you,
// sweep / distract = seconds [min,max], pDistract / pMove / pScope = what he does next, snap = how well he finds you
// when he looks up again, feint = chance that looking away is a fake.
export const STAGES = [
  {
    id: 'spring', month: '4月', title: '仮入部', len: 70, quota: 1.5, drain: 7.5, occ: ALL,
    note: '顧問はグラウンドの真ん中から動かない。よそ見も多い。テントや木の陰に入れば、どこを向いていても見えない。',
    coach: { spots: ['center'], omega: 0.6, fov: 0.5, range: 520, track: 0.15, sweep: [5, 8], distract: [4.5, 7], pDistract: 0.6, pMove: 0, pScope: 0, snap: 0.2, feint: 0 },
  },
  {
    id: 'rainy', month: '6月', title: '梅雨の晴れ間', len: 80, quota: 2, drain: 7.5, occ: ALL,
    note: '顧問が歩いて場所を変えるようになった。立つ場所が変わると、陰になる場所も変わる。',
    coach: { spots: ['center', 'home', 'right', 'left'], omega: 0.8, fov: 0.55, range: 540, track: 0.25, sweep: [4, 7], distract: [3.5, 5.5], pDistract: 0.4, pMove: 0.4, pScope: 0, snap: 0.45, feint: 0 },
  },
  {
    id: 'summer', month: '8月', title: '夏合宿', len: 85, quota: 2, drain: 10, occ: ALL, water: true,
    note: '暑さでスタミナの減りが早い。水飲み場のそばで止まると一気に回復する。顧問はときどき双眼鏡でこちらを追いかけてくる。',
    coach: { spots: ['center', 'home', 'right'], omega: 0.9, fov: 0.55, range: 540, track: 0.3, sweep: [4, 6.5], distract: [3, 5], pDistract: 0.35, pMove: 0.25, pScope: 0.25, snap: 0.5, feint: 0 },
  },
  {
    id: 'autumn', month: '10月', title: '駅伝前', len: 85, quota: 2, drain: 8, occ: ['mat', 'shed', 'treeR', 'treeL', 'treeT'], bike: true,
    note: '顧問が自転車で逆回りしてくる。こいでいる間は前しか見ていないので、すれ違う間だけ走ればいい。ベルが鳴ったら、止まって振り返る合図。',
    coach: { fov: 0.6, range: 320, speed: 0.8, ride: [5, 9], omega: 1, track: 0, sweep: [1, 1], distract: [1, 1], pDistract: 0, pMove: 0, pScope: 0, snap: 0, feint: 0, spots: ['center'] },
  },
  {
    id: 'winter', month: '2月', title: '冬季練習', len: 90, quota: 2.5, drain: 7.5, occ: ['mat', 'board', 'shed', 'treeR', 'treeL', 'treeT'], sub: true,
    note: '副顧問も校舎の前から、グラウンドの校舎側半分を見張っている。テントは片付けられた。顧問はよそ見のふりをしてすぐ顔を上げることがある。',
    coach: { spots: ['center', 'home', 'right', 'left'], omega: 1.1, fov: 0.58, range: 540, track: 0.4, sweep: [3.5, 6], distract: [2.8, 4.5], pDistract: 0.4, pMove: 0.35, pScope: 0, snap: 0.75, feint: 0.35 },
  },
];

export const DISTRACTIONS = ['電話中', '記録をつけている', 'お茶を飲んでいる', '立ち話'];

export const TITLES = [
  [1400, 'サボりの神'],
  [1000, '伝説の幽霊部員'],
  [700, '要領のいい部員'],
  [400, 'ときどき歩く部員'],
  [0, 'まじめな部員'],
];
export const titleFor = (score) => TITLES.find(([min]) => score >= min)[1];
