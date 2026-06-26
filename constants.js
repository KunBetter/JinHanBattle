// ============================================================
// 汉金之战 — 游戏常量定义
// ============================================================

const CANVAS_W = 1100;
const CANVAS_H = 550;
const DEPLOY_POINTS = 60;
const GATE_MAX_HP = 500;

// ---- 游戏状态枚举 ----
const State = Object.freeze({
  START_SCREEN: 'START_SCREEN',
  SIDE_SELECT: 'SIDE_SELECT',
  DEPLOYMENT: 'DEPLOYMENT',
  BATTLE: 'BATTLE',
  NIGHT_BATTLE: 'NIGHT_BATTLE',
  VICTORY: 'VICTORY',
});

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
};

const SOLDIER_NAMES = ['小虎','大壮','铁蛋','飞毛腿','石头','阿勇','冲锋','刚子','猛猛','小旋风'];

const SKILL_DEFS = {
  fire:      { name: '火攻', emoji: '🔥', cost: 50,  cooldown: 30, duration: 8,  desc: '城门附近燃起大火，灼烧敌军' },
  night:     { name: '夜战', emoji: '🌙', cost: 40,  cooldown: 25, duration: 12, desc: '夜幕降临，提升己方暴击率' },
  messenger: { name: '传令', emoji: '📯', cost: 50,  cooldown: 28, duration: 0,  desc: '召唤3-4名援军，己方全体加速' },
  decree:    { name: '诏令', emoji: '👑', cost: 100, cooldown: 50, duration: 0,  desc: '敌军受百分比伤害并减速，己方攻击提升' },
};

const WEATHER_TYPES = {
  clear: { name: '晴', emoji: '☀️', speedMul: 1.0, desc: '天气晴朗' },
  rain:  { name: '雨', emoji: '🌧️', speedMul: 0.75, desc: '行军减缓' },
  wind:  { name: '风', emoji: '💨', speedMul: 1.0, desc: '远程射程提升' },
  storm: { name: '雷', emoji: '⛈️', speedMul: 0.65, desc: '雷击与减速' },
};

const COMBO_LEVELS = [
  { threshold: 3,  text: '勢如破竹', color: '#FFFFFF', fontSize: 26 },
  { threshold: 5,  text: '所向披靡', color: '#FFD700', fontSize: 32 },
  { threshold: 8,  text: '萬夫莫敵', color: '#F39C12', fontSize: 38 },
  { threshold: 12, text: '天下無雙', color: '#E74C3C', fontSize: 46 },
];
