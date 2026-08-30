// ============================================================
// 汉金之战 — 游戏常量定义
// ============================================================

const CANVAS_W = 1100;
const CANVAS_H = 550;
const DEPLOY_POINTS = 60;
const START_GOLD = 30;      // 战斗初始金币：让小朋友开局就能放出第一个技能
const GATE_MAX_HP = 500;
const MAX_PARTICLES = 1400;

// ---- 游戏状态枚举 ----
const State = Object.freeze({
  START_SCREEN: 'START_SCREEN',
  SIDE_SELECT: 'SIDE_SELECT',
  DEPLOYMENT: 'DEPLOYMENT',
  BATTLE: 'BATTLE',
  VICTORY: 'VICTORY',
});

// ---- 难度定义 ----
const DIFF_DEFS = {
  easy:   { name: '简单', budget: 45, hpMul: 0.85, atkMul: 0.9 },
  normal: { name: '标准', budget: 60, hpMul: 1.0,  atkMul: 1.0 },
  hard:   { name: '困难', budget: 75, hpMul: 1.15, atkMul: 1.2 },
};

// ---- 兵种定义 ----
const TROOP_DEFS = {
  sword:    { name: '剑兵', emoji: '⚔️', cost: 1, hp: 80,  atk: 15, speed: 1.2, range: 30,  color: '#E74C3C', desc: '基础步兵' },
  spear:    { name: '矛兵', emoji: '🔱', cost: 2, hp: 100, atk: 18, speed: 0.9, range: 55,  color: '#E67E22', desc: '对骑兵2×伤害' },
  halberd:  { name: '戟兵', emoji: '🗡️', cost: 2, hp: 120, atk: 22, speed: 0.7, range: 40,  color: '#8E44AD', desc: '高护甲坦克' },
  cavalry:  { name: '骑兵', emoji: '🐴', cost: 3, hp: 90,  atk: 20, speed: 2.5, range: 35,  color: '#C0392B', desc: '快速机动' },
  ram:       { name: '撞门器', emoji: '🐏', cost: 3, hp: 200, atk: 40, speed: 1.0, range: 25,  color: '#5D4037', desc: '对城门3×伤害' },
  catapult:  { name: '投石器', emoji: '💣', cost: 3, hp: 60,  atk: 35, speed: 0.5, range: 250, color: '#7F8C8D', desc: '远程范围伤害' },
  dragon:    { name: '巨龙',   emoji: '🐉', cost: 8, hp: 300, atk: 60, speed: 1.2, range: 180, color: '#E74C3C', desc: '天空霸主，范围火焰攻击', auraRange: 90 },
  crossbow:  { name: '弩兵',   emoji: '🏹', cost: 2, hp: 70,  atk: 22, speed: 0.9, range: 120, color: '#2ECC71', desc: '远程快速射击', atkSpeed: 0.6 },
  shield:    { name: '盾兵',   emoji: '🛡️', cost: 2, hp: 180, atk: 10, speed: 0.6, range: 25,  color: '#3498DB', desc: '高防御坦克', blockChance: 0.5, blockPct: 0.3 },
  strategist:{ name: '军师',   emoji: '📜', cost: 3, hp: 50,  atk: 8,  speed: 0.8, range: 200, color: '#E91E63', desc: '范围攻速光环', auraRange: 80, atkAura: 0.2, spdAura: 0.9 },
  bomber:    { name: '火罐兵', emoji: '🧨', cost: 3, hp: 70,  atk: 30, speed: 0.9, range: 160, color: '#E67E22', desc: '投掷燃烧罐，范围灼烧' },
  elephant:  { name: '战象',   emoji: '🐘', cost: 5, hp: 260, atk: 30, speed: 0.9, range: 30,  color: '#6D4C41', desc: '巨象冲锋，践踏周围敌军' },
  general:   { name: '大将军', emoji: '🚩', cost: 6, hp: 220, atk: 28, speed: 1.1, range: 35,  color: '#F39C12', desc: '沙场主帅，光环鼓舞全军', auraRange: 90, atkAura: 0.15, spdAura: 1.0 },
};

const SOLDIER_NAMES = ['小虎','大壮','铁蛋','飞毛腿','石头','阿勇','冲锋','刚子','猛猛','小旋风'];

const SKILL_DEFS = {
  fire:      { name: '火攻', emoji: '🔥', cost: 30,  cooldown: 20, duration: 8,  desc: '城门附近燃起大火，灼烧敌军' },
  night:     { name: '夜战', emoji: '🌙', cost: 25,  cooldown: 18, duration: 12, desc: '夜幕降临，提升己方暴击率' },
  messenger: { name: '传令', emoji: '📯', cost: 30,  cooldown: 20, duration: 0,  desc: '召唤3-4名援军，己方全体加速' },
  decree:    { name: '诏令', emoji: '👑', cost: 60, cooldown: 35, duration: 0,  desc: '敌军受百分比伤害并减速，己方攻击提升' },
};

const WEATHER_TYPES = {
  clear: { name: '晴', emoji: '☀️', speedMul: 1.0, desc: '天气晴朗' },
  rain:  { name: '雨', emoji: '🌧️', speedMul: 0.75, desc: '行军减缓' },
  wind:  { name: '风', emoji: '💨', speedMul: 1.0, desc: '远程射程提升' },
  storm: { name: '雷', emoji: '⛈️', speedMul: 0.65, desc: '雷击与减速' },
  snow:  { name: '雪', emoji: '❄️', speedMul: 0.8, desc: '风雪行军减缓' },
};

const COMBO_LEVELS = [
  { threshold: 3,  text: '势如破竹', color: '#FFFFFF', fontSize: 26 },
  { threshold: 5,  text: '所向披靡', color: '#FFD700', fontSize: 32 },
  { threshold: 8,  text: '万夫莫敌', color: '#F39C12', fontSize: 38 },
  { threshold: 12, text: '天下无双', color: '#E74C3C', fontSize: 46 },
];

// ---- 战功殿（元进度） ----
// 兵种精锐升级：每级 +15% 生命与攻击，最多 2 级
const UPGRADE_DEFS = {
  sword:      { price: 100 },
  spear:      { price: 120 },
  halberd:    { price: 120 },
  cavalry:    { price: 150 },
  ram:        { price: 150 },
  catapult:   { price: 150 },
  crossbow:   { price: 120 },
  shield:     { price: 120 },
  strategist: { price: 150 },
  dragon:     { price: 200 },
};
const UPGRADE_MAX = 2;      // 每兵种最多升级次数
const UPGRADE_BONUS = 0.15; // 每次 +15% hp/atk

// 战功殿：新兵种解锁（解锁后才能手动部署）
const UNLOCK_DEFS = {
  bomber:   { name: '火罐兵', emoji: '🧨', price: 250, desc: '投掷燃烧罐，范围灼烧敌军' },
  elephant: { name: '战象',   emoji: '🐘', price: 400, desc: '巨象冲锋，践踏周围敌军' },
  general:  { name: '大将军', emoji: '🚩', price: 600, desc: '沙场主帅，光环鼓舞全军' },
};

// 军旗皮肤：影响己方单位脚下光环与名字颜色
const SKIN_DEFS = {
  default: { name: '汉红金蓝', cost: 0,   own: '#C0392B', enemy: '#2E86C1', desc: '初始军旗，汉红金蓝' },
  gold:    { name: '金戈铁马', cost: 300, own: '#F0D68A', enemy: '#8E44AD', desc: '皇者金甲，金光闪闪' },
  emerald: { name: '碧血丹心', cost: 300, own: '#2ECC71', enemy: '#16A085', desc: '翠绿禁军，碧血丹心' },
};

// 称号（按累计胜场自动晋升）
const TITLE_DEFS = [
  { wins: 0,  name: '新兵' },
  { wins: 1,  name: '百夫长' },
  { wins: 5,  name: '千夫长' },
  { wins: 10, name: '骠骑将军' },
  { wins: 20, name: '大将军' },
];

// ---- 战役模式（6 关连续攻城，玩家固定扮演汉军攻方） ----
const CAMPAIGN_DEFS = [
  { name: '夜袭粮仓', intro: '趁夜色偷袭金军粮仓！先小试牛刀。', map: 'canyon', diff: 'easy',   points: 45, aiBudget: 40 },
  { name: '峡谷伏击', intro: '金军主力在峡谷设伏！林间作战要小心。', map: 'forest', diff: 'normal', points: 50, aiBudget: 52 },
  { name: '决战金城', intro: '决战时刻！攻破金城，一战定乾坤！', map: 'canyon', diff: 'hard',   points: 55, aiBudget: 62 },
  { name: '雪原奔袭', intro: '金军退守雪原！风雪中发起追击！', map: 'snow', diff: 'normal', points: 60, aiBudget: 66 },
  { name: '风雪围城', intro: '暴雪封山，金军困兽犹斗！', map: 'snow', diff: 'hard', points: 60, aiBudget: 74 },
  { name: '帝都决战', intro: '金城之下，决一死战！功成名就在此一役！', map: 'canyon', diff: 'hard', points: 65, aiBudget: 80 },
];
