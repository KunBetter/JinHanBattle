// ============================================================
// 汉金之战 — 古代攻城网页游戏
// ============================================================

// ---- DOM 元素 ----
const canvas = document.getElementById('game-canvas');
let ctx = canvas.getContext('2d'); // 可临时切换到背景缓存画布

const $ = (id) => document.getElementById(id);
const overlayStart   = $('overlay-start');
const overlaySetup   = $('overlay-setup');
const overlayVictory = $('overlay-victory');
const troopBar       = $('troop-bar');
const skillBar       = $('skill-bar');
const pointsNum      = $('points-num');
const comboDisplay   = $('combo-display');
const timerDisplay   = document.querySelector('.timer-value');
const goldDisplay    = document.querySelector('.gold-value');
const weatherIcon    = $('weather-icon');
const vsBadge        = $('vs-badge');
const victoryTitle   = $('victory-title');
const victoryAchs    = $('victory-achievements');
const achievementsRow = $('achievements-row');
const btnStartBattle = $('btn-start-battle');

// ---- 云朵 PNG 纹理键与 alpha 缓存（避免每帧重复解析） ----
const CLOUD_KEYS = ['png_cloud1', 'png_cloud2', 'png_cloud3', 'png_cloud4', 'png_cloud5'];
const CLOUD_ALPHA_CACHE = {};

// ---- 背景静态层依赖的懒加载素材（加载完成需重绘一次缓存） ----
const BG_ASSET_KEYS = ['png_sun','png_moon','png_cloud1','png_cloud2','png_cloud3','png_cloud4','png_cloud5','png_hills1','texture_grass','texture_ground','texture_stone','texture_wood'];

// ============================================================
// 游戏主类
// ============================================================

class Game {
  constructor() {
    this.state = State.START_SCREEN;
    this.sound = new SoundManager();
    this.playerSide = null;  // 'han' | 'jin'
    this.mapType = 'canyon';  // 'canyon' | 'forest'
    this.aiSide = null;
    this._pendingSide = null; // setup 页面暂存
    this._pendingMap = null;
    this.difficulty = 'normal';
    this._pendingDiff = 'normal';
    this.deployPoints = DEPLOY_POINTS;
    this.selectedType = null;   // 当前选中的兵种 key
    this.selectedUnitIdxs = []; // 多选己方单位索引
    this._dragSelect = null;    // 拖拽框选 { sx, sy, ex, ey }
    this.units = [];            // 已部署的所有单位
    this.gateHP = GATE_MAX_HP;

    // 玩家控制系统
    this.selectedUnitIdx = -1;  // 当前选中的己方单位索引
    this._cmdMarker = null;     // { x, y, life } 移动指令标记

    this.combo = 0;
    this._comboDecay = 0;
    this.gold = 0;
    this.killCount = 0;
    this._catapultKills = 0;
    this.maxCombo = 0;
    this.battleElapsed = 0;
    this.unlockedAchievements = this._loadAchievements();
    this._shownAchievements = { ...this.unlockedAchievements };
    this._skillsUsed = { fire: false, night: false, messenger: false, decree: false };
    this._skills = {
      fire:      { cd: 0, active: false, timer: 0 },
      night:     { cd: 0, active: false, timer: 0 },
      messenger: { cd: 0, active: false, timer: 0 },
      decree:    { cd: 0, active: false, timer: 0 },
    };
    // 技能按钮 DOM 缓存（避免每帧查询 DOM）
    this._skillBtns = {};
    for (const key of Object.keys(SKILL_DEFS)) {
      const btn = $(`btn-${key}`);
      this._skillBtns[key] = btn ? {
        btn,
        name: btn.querySelector('.skill-name'),
        cost: btn.querySelector('.skill-cost'),
        cdFill: btn.querySelector('.skill-cd-fill'),
        cdText: btn.querySelector('.skill-cd-text'),
      } : null;
    }
    this._skillUIAccum = 0;
    this._nightMode = false;

    // 天气系统
    this._weather = { type: 'clear', timer: 0, nextChange: 40 };

    // 地形系统
    this._terrain = []; // { type, x, y, w, h, hp, maxHP }

    // 宝箱系统
    this._chests = [];
    this._chestSpawnTimer = 0;
    this._chestSpawnDelay = 20;
    this._pickupBuffs = { atk: 0, spd: 0 };
    this._messengerBuff = 0;
    this._decreeBuff = { atk: 0, enemySlow: 0 };

    // 战斗特效状态
    this.damageNumbers = [];    // { x, y, text, color, life, vy }
    this.particles = [];        // { x, y, vx, vy, life, maxLife, color, size, type, data }
    this._killMarks = [];
    this._birds = [];
    this._brazierTimers = [0, 0, 0];
    this._lightningFlash = 0;
    this._lastBattleTime = 0;
    this._lastShownSec = -1;
    this._screenShake = 0;
    this._gateFlash = 0;

    // 背景静态层离屏缓存（仅场景变化时重绘）
    this._bgCanvas = document.createElement('canvas');
    this._bgCanvas.width = CANVAS_W;
    this._bgCanvas.height = CANVAS_H;
    this._bgCtx = this._bgCanvas.getContext('2d');
    this._bgKey = null;
    this._bgAssetsSig = -1;

    // 鼠标/触摸状态
    this.mouseX = 0;
    this.mouseY = 0;
    this.hoveredUnitIdx = -1;

    // 战斗节奏控制（儿童友好：加速/暂停/退出）
    this._speedMul = 1;      // 1x / 2x
    this._paused = false;
    this._quitArmed = false; // 退出按钮二次确认
    this._autoAdvance = true; // 全军出击（默认开，士兵自动冲锋）

    // 胜利/失败庆祝（慢动作 + 烟花）
    this._celebration = null; // { t, dur }
    this._result = null;      // 'win' | 'lose'
    this._gateBoom = false;

    // 新手引导
    let tutDone = false;
    try { tutDone = !!localStorage.getItem('hanjin_tut_done'); } catch {}
    this._tutorial = { active: false, step: -1, done: tutDone };
    this._tutTimer = null;
    this.tutorialBox = $('tutorial-box');

    // 元进度（战功殿）：累计金币 / 兵种精锐 / 皮肤 / 称号
    this._meta = this._loadMeta();
    this._skinColors = SKIN_DEFS[this._meta.skin] || SKIN_DEFS.default;

    // 战役模式
    this.campaign = { active: false, level: 0, points: CAMPAIGN_DEFS[0].points };

    // 随机中立事件（商人 / 山崩 / 狼群）
    this._events = { merchant: null, wolves: [] };
    this._eventTimer = 0;
    this._eventDelay = 18;
    this._lightningStrike = null; // { x, y, warn }

    // 触屏状态
    this._touch = { lastTap: null, longPressTimer: null, longPressActive: false, touchMoved: false, startX: 0, startY: 0, drag: null };

    // 预渲染特效精灵（避免每帧 createRadialGradient 的 GC/CPU 开销）
    this._fx = {
      shadow: this._makeFX('shadow'),
      fire: this._makeFX('fire'),
      star: this._makeFX('star'),
      impact: this._makeFX('impact'),
    };

    // 音乐音量滑杆
    const volSlider = $('music-vol');
    if (volSlider) {
      volSlider.addEventListener('input', () => {
        this.sound.setMusicVolume(volSlider.value / 100);
      });
    }

    // 全局按钮点击音（capture 阶段捕获，禁用按钮不会触发）
    document.addEventListener('click', (e) => {
      if (e.target && e.target.closest && e.target.closest('button')) {
        this.sound.click();
      }
    }, true);

    // 兵种令牌 hover 说明
    this._bindTroopTip();

    this._bindEvents();
    this._showOverlay('start');
    this._startGameLoop();
  }

  _startGameLoop() {
    const self = this;
    const loop = (timestamp) => {
      if (this.state === State.BATTLE) {
        if (!this._lastBattleTime) this._lastBattleTime = timestamp;
        const rawDt = Math.min((timestamp - this._lastBattleTime) / 1000, 0.05);
        this._lastBattleTime = timestamp;
        if (!this._paused) {
          let dt = rawDt * this._speedMul;
          if (this._celebration) dt = rawDt * 0.3; // 胜利/失败慢动作
          this._updateBattle(dt);
        }
      }
      this._render();
      this._loopId = requestAnimationFrame(loop);
    };
    this._loopId = requestAnimationFrame(loop);
  }

  // ---- 存档（localStorage） ----
  _loadAchievements() {
    try {
      return JSON.parse(localStorage.getItem('hanjin_achs')) || {};
    } catch { return {}; }
  }

  _saveAchievements() {
    try {
      localStorage.setItem('hanjin_achs', JSON.stringify(this.unlockedAchievements));
    } catch {}
  }

  _unlockAchievement(key) {
    if (this.unlockedAchievements[key]) return;
    this.unlockedAchievements[key] = true;
    this._saveAchievements();
    this._showToast('解锁成就！');
  }

  // ---- 元进度（战功殿） ----
  _loadMeta() {
    try {
      const m = JSON.parse(localStorage.getItem('hanjin_meta')) || {};
      return {
        gold: m.gold || 0,
        upgrades: m.upgrades || {},
        unlocks: m.unlocks || {},
        skin: m.skin || 'default',
        wins: m.wins || 0,
        losses: m.losses || 0,
        campaignDone: !!m.campaignDone,
      };
    } catch { return { gold: 0, upgrades: {}, unlocks: {}, skin: 'default', wins: 0, losses: 0, campaignDone: false }; }
  }

  _saveMeta() {
    try { localStorage.setItem('hanjin_meta', JSON.stringify(this._meta)); } catch {}
  }

  _getTitle() {
    if (this._meta.campaignDone) return '护国大将军';
    let title = TITLE_DEFS[0].name;
    for (const t of TITLE_DEFS) {
      if (this._meta.wins >= t.wins) title = t.name;
    }
    return title;
  }

  // 兵种精锐加成后的属性（仅玩家部队生效）
  _unitStats(type) {
    const def = TROOP_DEFS[type];
    const lv = Math.min(UPGRADE_MAX, this._meta.upgrades[type] || 0);
    const mul = 1 + UPGRADE_BONUS * lv;
    return { hp: Math.round(def.hp * mul), atk: Math.round(def.atk * mul), atkMul: mul };
  }

  _updateMetaDisplay() {
    const mt = $('meta-title'), mg = $('meta-gold');
    if (mt) mt.textContent = this._getTitle();
    if (mg) mg.textContent = `◆ ${this._meta.gold}`;
  }

  // 主菜单 → 战功殿
  _openShop() {
    overlayStart.classList.add('hidden');
    const shopOv = $('overlay-shop');
    shopOv.classList.remove('hidden');
    this._renderShop();
  }

  _closeShop() {
    $('overlay-shop').classList.add('hidden');
    overlayStart.classList.remove('hidden');
    this._updateMetaDisplay();
  }

  _renderShop() {
    const goldNum = $('shop-gold-num');
    if (goldNum) goldNum.textContent = this._meta.gold;

    // 新兵种解锁
    const unlockKeys = Object.keys(UNLOCK_DEFS);
    if (unlockKeys.length > 0) {
      const sec = document.createElement('h3');
      sec.className = 'shop-sec-title';
      sec.textContent = '神兵阁（解锁新兵种）';
      const unWrap = $('shop-unlocks');
      if (unWrap) {
        unWrap.innerHTML = '';
        for (const type of unlockKeys) {
          const u = UNLOCK_DEFS[type];
          const owned = !!this._meta.unlocks[type];
          const row = document.createElement('div');
          row.className = 'shop-row';
          const btnTxt = owned ? '已解锁' : (this._meta.gold >= u.price ? `◆${u.price} 解锁` : `◆${u.price}`);
          row.innerHTML =
            `<span class="sr-icon">${owned ? u.emoji : '🔒'}</span>` +
            `<span class="sr-name">${u.name}</span>` +
            `<span class="sr-desc">${u.desc}</span>` +
            `<button class="sr-btn" ${owned || this._meta.gold < u.price ? 'disabled' : ''}>${btnTxt}</button>`;
          const btn = row.querySelector('.sr-btn');
          if (btn && !owned && this._meta.gold >= u.price) {
            btn.addEventListener('click', () => this._buyUnlock(type));
          }
          unWrap.appendChild(row);
        }
      }
    }

    // 兵种精锐
    const upWrap = $('shop-upgrades');
    if (upWrap) {
      upWrap.innerHTML = '';
      for (const type of Object.keys(UPGRADE_DEFS)) {
        const def = TROOP_DEFS[type];
        const lv = Math.min(UPGRADE_MAX, this._meta.upgrades[type] || 0);
        const price = UPGRADE_DEFS[type].price;
        const row = document.createElement('div');
        row.className = 'shop-row';
        const stars = lv >= UPGRADE_MAX ? '已满级' : '★'.repeat(lv) + '☆'.repeat(UPGRADE_MAX - lv);
        const btnTxt = lv >= UPGRADE_MAX ? '满级' : (this._meta.gold >= price ? `◆${price} 升级` : `◆${price}`);
        row.innerHTML =
          `<span class="sr-icon">${def.emoji}</span>` +
          `<span class="sr-name">${def.name}</span>` +
          `<span class="sr-stars">${stars}</span>` +
          `<span class="sr-desc">${def.desc}</span>` +
          `<button class="sr-btn" ${lv >= UPGRADE_MAX || this._meta.gold < price ? 'disabled' : ''}>${btnTxt}</button>`;
        const btn = row.querySelector('.sr-btn');
        if (btn && lv < UPGRADE_MAX && this._meta.gold >= price) {
          btn.addEventListener('click', () => this._buyUpgrade(type));
        }
        upWrap.appendChild(row);
      }
    }

    // 皮肤
    const skWrap = $('shop-skins');
    if (skWrap) {
      skWrap.innerHTML = '';
      for (const key of Object.keys(SKIN_DEFS)) {
        const s = SKIN_DEFS[key];
        const owned = key === 'default' || this._meta.skin === key;
        const row = document.createElement('div');
        row.className = 'shop-row skin-row';
        const btnTxt = this._meta.skin === key ? '使用中' : (key === 'default' ? '使用' : (this._meta.gold >= s.cost ? `◆${s.cost} 购买` : `◆${s.cost}`));
        row.innerHTML =
          `<span class="sr-icon">⚑</span>` +
          `<span class="sr-name">${s.name}</span>` +
          `<span class="sr-desc">${s.desc}</span>` +
          `<button class="sr-btn" ${this._meta.skin === key ? 'disabled' : (key !== 'default' && this._meta.gold < s.cost ? 'disabled' : '')}>${btnTxt}</button>`;
        const btn = row.querySelector('.sr-btn');
        if (btn && this._meta.skin !== key && (key === 'default' || this._meta.gold >= s.cost)) {
          btn.addEventListener('click', () => this._buySkin(key));
        }
        skWrap.appendChild(row);
      }
    }

    // 战绩
    const st = $('shop-stats');
    if (st) {
      st.innerHTML =
        `胜 <b>${this._meta.wins}</b> 场 · 负 <b>${this._meta.losses}</b> 场` +
        ` · 称号 <b>${this._getTitle()}</b>` +
        (this._meta.campaignDone ? ' · 已通关战役 🏆' : '');
    }
  }

  _buyUpgrade(type) {
    const def = UPGRADE_DEFS[type];
    const lv = Math.min(UPGRADE_MAX, this._meta.upgrades[type] || 0);
    if (lv >= UPGRADE_MAX || this._meta.gold < def.price) return;
    this._meta.gold -= def.price;
    this._meta.upgrades[type] = lv + 1;
    this._saveMeta();
    this.sound.buy();
    this._showToast(`${TROOP_DEFS[type].name} 精锐升级！生命与攻击 +${Math.round(UPGRADE_BONUS * 100)}%`);
    this._renderShop();
  }

  _buyUnlock(type) {
    const u = UNLOCK_DEFS[type];
    if (!u || this._meta.unlocks[type] || this._meta.gold < u.price) return;
    this._meta.gold -= u.price;
    this._meta.unlocks[type] = true;
    this._saveMeta();
    this.sound.buy();
    this._showToast(`🎉 解锁新兵种：${u.name}！部署时就能召唤了`);
    this._renderShop();
  }

  _buySkin(key) {
    const s = SKIN_DEFS[key];
    if (key !== 'default' && this._meta.gold < s.cost) return;
    if (key !== 'default') this._meta.gold -= s.cost;
    this._meta.skin = key;
    this._saveMeta();
    this._skinColors = SKIN_DEFS[key] || SKIN_DEFS.default;
    this.sound.buy();
    this._showToast(`军旗更换为「${s.name}」！`);
    this._renderShop();
  }

  // ---- 覆盖层控制 ----
  _showOverlay(name) {
    overlayStart.classList.toggle('hidden', name !== 'start');
    overlaySetup.classList.toggle('hidden', name !== 'setup');
    overlayVictory.classList.toggle('hidden', name !== 'victory');
    troopBar.classList.toggle('visible', name === 'deployment');
    skillBar.classList.toggle('visible', name === 'battle');
    const shopOv = $('overlay-shop');
    if (shopOv) shopOv.classList.toggle('hidden', name !== 'shop');

    // 战斗专用按钮（加速/暂停/退出/全军出击）
    const battleActions = $('battle-actions');
    if (battleActions) battleActions.classList.toggle('hidden', name !== 'battle');

    // 确保部署模式下按钮可见
    if (name === 'deployment') {
      btnStartBattle.style.display = '';
    }

    // 战斗模式下显示操控提示
    const hint = document.getElementById('control-hint');
    if (hint) hint.classList.toggle('visible', name === 'battle');

    if (name === 'start') {
      this._renderAchievements();
      this._updateMetaDisplay();
    }
  }

  // ---- 事件绑定 ----
  _bindEvents() {
    // 开始游戏 → 进入阵营+战场选择合并画面
    $('btn-start-game').addEventListener('click', () => {
      // 首次用户交互：启动背景音乐（浏览器要求手势后才能发声）
      this.sound.startMusic();
      this._pendingSide = null;
      this._pendingMap = null;
      this._updateSetupUI();
      this._showOverlay('setup');
    });

    // 选择阵营（高亮 + 记录）
    $('btn-han').addEventListener('click', () => { this._pendingSide = 'han'; this._updateSetupUI(); });
    $('btn-jin').addEventListener('click', () => { this._pendingSide = 'jin'; this._updateSetupUI(); });

    // 选择地图（高亮 + 记录）
    $('btn-canyon').addEventListener('click', () => { this._pendingMap = 'canyon'; this._updateSetupUI(); });
    $('btn-forest').addEventListener('click', () => { this._pendingMap = 'forest'; this._updateSetupUI(); });
    $('btn-snow').addEventListener('click', () => { this._pendingMap = 'snow'; this._updateSetupUI(); });

    // 选择难度（高亮 + 记录）
    ['easy', 'normal', 'hard'].forEach(d => {
      $('btn-diff-' + d).addEventListener('click', () => {
        this._pendingDiff = d;
        this._updateSetupUI();
      });
    });

    // 确认选择 → 直接进入部署
    $('btn-confirm-setup').addEventListener('click', () => this._confirmSetup());

    // 兵种选择（点击令牌）
    document.querySelectorAll('.troop-token').forEach(el => {
      el.addEventListener('click', () => {
        const type = el.dataset.type;
        // 新兵种需在战功殿解锁
        if (UNLOCK_DEFS[type] && !this._meta.unlocks[type]) {
          this._showToast(`🔒 ${UNLOCK_DEFS[type].name} 未解锁！去「战功殿」购买`);
          return;
        }
        const cost = parseInt(el.dataset.cost);
        if (this.deployPoints >= cost) {
          this.selectedType = type;
          this._updateTroopBarUI();
          // 新手引导：已选兵种 → 提示放置
          if (this._tutorial.active && this._tutorial.step === 0) {
            this._tutShow('② 点击战场放置士兵', '移动鼠标到发亮区域，点击地面放下你的士兵！（右键可撤回）', 6000);
            this._tutorial.step = 1;
          }
        }
      });
    });

    // Canvas 点击 — 部署/指挥
    canvas.addEventListener('mousedown', (e) => this._onCanvasMouseDown(e));
    canvas.addEventListener('mouseup', (e) => this._onCanvasMouseUp(e));
    canvas.addEventListener('mousemove', (e) => this._onCanvasMove(e));
    canvas.addEventListener('contextmenu', (e) => this._onCanvasRightClick(e));

    // 键盘控制
    document.addEventListener('keydown', (e) => this._onKeyDown(e));

    // 触摸事件（双击全选 / 双指框选 / 长按指令菜单）
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (e.touches.length >= 2) {
        // 双指框选
        this._touch.drag = {
          p1: { x: e.touches[0].clientX, y: e.touches[0].clientY },
          p2: { x: e.touches[1].clientX, y: e.touches[1].clientY },
        };
        if (this._touch.longPressTimer) { clearTimeout(this._touch.longPressTimer); this._touch.longPressTimer = null; }
        this._closeTouchMenu();
        return;
      }
      const t = e.touches[0];
      this._updateMouseFromEvent(t);
      if (this.state === State.DEPLOYMENT) {
        this._deployAtCursor();
        return;
      }
      if (this.state !== State.BATTLE) return;
      this._closeTouchMenu(); // 新触摸时关闭旧菜单

      // 双击全选
      const now = Date.now();
      if (this._touch.lastTap &&
          now - this._touch.lastTap.t < 400 &&
          Math.abs(t.clientX - this._touch.lastTap.x) < 90 &&
          Math.abs(t.clientY - this._touch.lastTap.y) < 90) {
        this._touch.lastTap = null;
        if (this._touch.longPressTimer) { clearTimeout(this._touch.longPressTimer); this._touch.longPressTimer = null; }
        this._selectAllOwn();
        return;
      }
      this._touch.lastTap = { t: now, x: t.clientX, y: t.clientY };
      this._touch.touchMoved = false;
      this._touch.startX = t.clientX;
      this._touch.startY = t.clientY;

      // 长按弹出指令菜单（按在己方单位附近时）
      const hx = this.mouseX, hy = this.mouseY;
      let overOwn = false;
      for (const u of this.units) {
        if (u.hp <= 0 || u.side !== this.playerSide) continue;
        const dx = u.x - hx, dy = u.y - hy;
        if (dx * dx + dy * dy < 900) { overOwn = true; break; }
      }
      if (overOwn) {
        if (this._touch.longPressTimer) clearTimeout(this._touch.longPressTimer);
        this._touch.longPressTimer = setTimeout(() => {
          this._touch.longPressActive = true;
          this._showTouchMenu(t.clientX, t.clientY);
        }, 550);
      }
    });
    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (this._touch.drag && e.touches.length >= 2) {
        this._touch.drag.p2 = { x: e.touches[1].clientX, y: e.touches[1].clientY };
        return;
      }
      const t = e.touches[0];
      this._updateMouseFromEvent(t);
      if (Math.abs(t.clientX - this._touch.startX) > 24 || Math.abs(t.clientY - this._touch.startY) > 24) {
        this._touch.touchMoved = true;
        if (this._touch.longPressTimer) { clearTimeout(this._touch.longPressTimer); this._touch.longPressTimer = null; }
        this._closeTouchMenu();
      }
    });
    canvas.addEventListener('touchend', (e) => {
      e.preventDefault();
      if (this._touch.drag) {
        // 双指框选结算
        const d = this._touch.drag;
        this._touch.drag = null;
        if (this.state === State.BATTLE) {
          const a = this._clientToCanvas(d.p1.x, d.p1.y);
          const b = this._clientToCanvas(d.p2.x, d.p2.y);
          const x1 = Math.min(a.x, b.x), x2 = Math.max(a.x, b.x);
          const y1 = Math.min(a.y, b.y), y2 = Math.max(a.y, b.y);
          if (x2 - x1 > 20 || y2 - y1 > 20) {
            this.selectedUnitIdxs = [];
            for (let i = 0; i < this.units.length; i++) {
              const u = this.units[i];
              if (u.hp <= 0 || u.side !== this.playerSide) continue;
              if (u.x >= x1 && u.x <= x2 && u.y >= y1 && u.y <= y2) this.selectedUnitIdxs.push(i);
            }
            if (this.selectedUnitIdxs.length > 0) this.selectedUnitIdx = this.selectedUnitIdxs[0];
          }
        }
        return;
      }
      if (this._touch.longPressActive) {
        this._touch.longPressActive = false;
        return; // 长按已触发菜单，抑制单击
      }
      if (this._touch.longPressTimer) { clearTimeout(this._touch.longPressTimer); this._touch.longPressTimer = null; }
      if (this.state === State.BATTLE && !this._touch.touchMoved) {
        this._handleBattleClick(e);
      }
    });

    // 自动部署
    $('btn-auto-deploy').addEventListener('click', () => this._autoDeploy());

    // 清空部署
    $('btn-clear-deploy').addEventListener('click', () => {
      if (this.state !== State.DEPLOYMENT) return;
      const refund = this.units.reduce((s, u) => s + (TROOP_DEFS[u.type] ? TROOP_DEFS[u.type].cost : 0), 0);
      this.units = [];
      this.deployPoints = DEPLOY_POINTS;
      this.selectedType = null;
      this._updateTroopBarUI();
      this._showToast(refund > 0 ? '已清空部署，兵符全额返还！' : '战场空空，先点令牌选兵种吧');
    });

    // 全军出击 / 固守待命
    $('btn-auto-advance').addEventListener('click', () => {
      if (this.state !== State.BATTLE) return;
      this._autoAdvance = !this._autoAdvance;
      const btn = $('btn-auto-advance');
      btn.classList.toggle('active', this._autoAdvance);
      this._showToast(this._autoAdvance ? '全军出击！士兵自动冲向敌人' : '固守待命！等待你的指令');
    });

    // 加速 / 暂停 / 退出
    $('btn-speed').addEventListener('click', () => this._toggleSpeed());
    $('btn-pause').addEventListener('click', () => this._togglePause());
    $('btn-quit').addEventListener('click', () => {
      if (this.state !== State.BATTLE) return;
      if (!this._quitArmed) {
        this._quitArmed = true;
        $('btn-quit').classList.add('confirm');
        this._showToast('再点一次 ✕ 确认退出战斗');
        setTimeout(() => {
          this._quitArmed = false;
          $('btn-quit').classList.remove('confirm');
        }, 2500);
        return;
      }
      this._quitArmed = false;
      $('btn-quit').classList.remove('confirm');
      this._resetGame();
    });

    // 开始战斗
    btnStartBattle.addEventListener('click', () => this._startBattle());

    // 技能按钮
    $('btn-fire').addEventListener('click', () => this._activateSkill('fire'));
    $('btn-night').addEventListener('click', () => this._activateSkill('night'));
    $('btn-messenger').addEventListener('click', () => this._activateSkill('messenger'));
    $('btn-decree').addEventListener('click', () => this._activateSkill('decree'));

    // 音效开关
    $('btn-mute').addEventListener('click', () => {
      const on = this.sound.toggle();
      $('btn-mute').classList.toggle('muted', !on);
    });

    // 再来一局（战役中胜利且未通关 → 「下一关」）
    $('btn-replay').addEventListener('click', () => {
      if (this.campaign.active && this._lastResult === 'win' &&
          this.campaign.level < CAMPAIGN_DEFS.length - 1) {
        this._nextCampaignLevel();
      } else {
        this._replaySame();
      }
    });

    // 回主菜单
    $('btn-home').addEventListener('click', () => this._resetGame());

    // 战功殿
    $('btn-shop').addEventListener('click', () => this._openShop());
    $('btn-shop-close').addEventListener('click', () => this._closeShop());

    // 战役模式入口
    $('btn-campaign').addEventListener('click', () => this._startCampaign());
  }

  _updateMouseFromEvent(e) {
    const p = this._clientToCanvas(e.clientX, e.clientY);
    this.mouseX = p.x;
    this.mouseY = p.y;
  }

  _onCanvasMouseDown(e) {
    this._updateMouseFromEvent(e);
    if (this.state !== State.BATTLE) return;

    // 检测是否点击在己方单位上
    let clickedOwn = false;
    for (const u of this.units) {
      if (u.hp <= 0 || u.side !== this.playerSide) continue;
      const dx = u.x - this.mouseX, dy = u.y - this.mouseY;
      if (dx*dx + dy*dy < 484) { clickedOwn = true; break; } // 22²
    }

    // 点击地面 → 开始拖拽框选
    if (!clickedOwn) {
      this._dragSelect = { sx: this.mouseX, sy: this.mouseY, ex: this.mouseX, ey: this.mouseY };
    }
  }

  _onCanvasMouseUp(e) {
    this._updateMouseFromEvent(e);

    if (this.state === State.DEPLOYMENT) {
      this._deployAtCursor();
      return;
    }
    if (this.state !== State.BATTLE) return;

    // 拖拽框选
    if (this._dragSelect) {
      const ds = this._dragSelect;
      const dx = Math.abs(ds.ex - ds.sx), dy = Math.abs(ds.ey - ds.sy);

      if (dx > 5 || dy > 5) {
        // 有效拖拽 → 框选
        const x1 = Math.min(ds.sx, ds.ex), x2 = Math.max(ds.sx, ds.ex);
        const y1 = Math.min(ds.sy, ds.ey), y2 = Math.max(ds.sy, ds.ey);
        this.selectedUnitIdxs = [];
        for (let i = 0; i < this.units.length; i++) {
          const u = this.units[i];
          if (u.hp <= 0 || u.side !== this.playerSide) continue;
          if (u.x >= x1 && u.x <= x2 && u.y >= y1 && u.y <= y2) {
            this.selectedUnitIdxs.push(i);
          }
        }
        if (this.selectedUnitIdxs.length > 0) {
          this.selectedUnitIdx = this.selectedUnitIdxs[0];
        }
      } else {
        // 极小移动 → 当作点击处理
        this._dragSelect = null;
        this._handleBattleClick(e);
        return;
      }
      this._dragSelect = null;
    }
  }

  _onCanvasMove(e) {
    this._updateMouseFromEvent(e);

    // 更新拖拽框选
    if (this._dragSelect) {
      this._dragSelect.ex = this.mouseX;
      this._dragSelect.ey = this.mouseY;
    }

    // 更新光标样式
    if (this.state === State.BATTLE) {
      let overOwn = false;
      for (const u of this.units) {
        if (u.hp <= 0 || u.side !== this.playerSide) continue;
        const dx = u.x - this.mouseX, dy = u.y - this.mouseY;
        if (dx*dx + dy*dy < 484) { overOwn = true; break; } // 22²
      }
      canvas.style.cursor = overOwn ? 'pointer' : 'crosshair';
    } else if (this.state === State.DEPLOYMENT) {
      canvas.style.cursor = 'crosshair';
    }
  }

  _onCanvasRightClick(e) {
    e.preventDefault();
    this._updateMouseFromEvent(e);

    if (this.state === State.DEPLOYMENT) {
      // 右键：撤回该位置的已部署单位，返还兵符
      let removed = -1;
      for (let i = 0; i < this.units.length; i++) {
        const u = this.units[i];
        const dx = u.x - this.mouseX, dy = u.y - this.mouseY;
        if (dx * dx + dy * dy < 1600) { removed = i; break; } // 40²
      }
      if (removed >= 0) {
        const u = this.units[removed];
        const def = TROOP_DEFS[u.type];
        this.deployPoints += def.cost;
        this.units.splice(removed, 1);
        this._showToast(`已撤回 ${def.name}，返还 ◆${def.cost}`);
        this._updateTroopBarUI();
      } else {
        this._showToast('点中要撤回的士兵再右键；或点「清空」全部撤走');
      }
      return;
    }

    if (this.state === State.BATTLE) {
      this.selectedUnitIdxs = [];
      this.selectedUnitIdx = -1;
    }
  }

  // 客户端坐标 → 画布坐标
  _clientToCanvas(cx, cy) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (cx - rect.left) * (CANVAS_W / rect.width),
      y: (cy - rect.top) * (CANVAS_H / rect.height),
    };
  }

  // 全选己方存活单位
  _selectAllOwn() {
    this.selectedUnitIdxs = [];
    for (let i = 0; i < this.units.length; i++) {
      const u = this.units[i];
      if (u.hp > 0 && u.side === this.playerSide) this.selectedUnitIdxs.push(i);
    }
    if (this.selectedUnitIdxs.length > 0) {
      this.selectedUnitIdx = this.selectedUnitIdxs[0];
      this._showToast(`已全选 ${this.selectedUnitIdxs.length} 支部队！`);
    } else {
      this._showToast('没有可指挥的部队了');
    }
  }

  _closeTouchMenu() {
    const menu = $('touch-menu');
    if (menu) menu.classList.add('hidden');
  }

  _showTouchMenu(clientX, clientY) {
    const menu = $('touch-menu');
    if (!menu || this.state !== State.BATTLE) return;
    const sels = this._getSelectedUnits();
    if (sels.length === 0) { this._selectAllOwn(); return; }
    const items = [];
    const title = sels.length === 1
      ? `${this.units[sels[0]].name}（${TROOP_DEFS[this.units[sels[0]].type].name}）`
      : `已选 ${sels.length} 支部队`;
    const attack = () => this._touchAttackNearest(sels);
    const gate = () => this._touchAttackGate(sels);
    const hold = () => this._touchHold(sels);
    const all = () => this._selectAllOwn();
    items.push(['⚔ 进攻最近敌人', attack]);
    if (this.playerSide === 'han') items.push(['🏯 破门攻城', gate]);
    items.push(['🏳 固守待命', hold]);
    items.push(['◎ 全选部队', all]);

    menu.innerHTML = '';
    const tt = document.createElement('div');
    tt.className = 'tm-title';
    tt.textContent = title;
    menu.appendChild(tt);
    for (const [label, act] of items) {
      const b = document.createElement('button');
      b.className = 'tm-item';
      b.textContent = label;
      b.addEventListener('click', () => {
        this._closeTouchMenu();
        act();
      });
      menu.appendChild(b);
    }
    const close = document.createElement('button');
    close.className = 'tm-item';
    close.textContent = '✕ 取消';
    close.addEventListener('click', () => this._closeTouchMenu());
    menu.appendChild(close);

    menu.classList.remove('hidden');
    // 定位（容器缩放坐标）
    const crect = document.getElementById('game-container').getBoundingClientRect();
    const scale = crect.width / 1100;
    let left = (clientX - crect.left) / scale - 40;
    let top = (clientY - crect.top) / scale - 10;
    left = Math.max(4, Math.min(1096 - 150, left));
    top = Math.max(4, Math.min(766 - 220, top));
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
  }

  _touchAttackNearest(sels) {
    for (const idx of sels) {
      const u = this.units[idx];
      if (!u || u.hp <= 0) continue;
      const eIdx = this._findNearestEnemyFor(u);
      if (eIdx >= 0) this._commandAttack(idx, eIdx);
    }
    this._showToast('全军进攻！');
  }

  _touchAttackGate(sels) {
    for (const idx of sels) {
      const u = this.units[idx];
      if (!u || u.hp <= 0) continue;
      this._commandAttackGate(idx);
    }
    this._showToast('集中火力破城门！');
  }

  _touchHold(sels) {
    for (const idx of sels) {
      const u = this.units[idx];
      if (!u) continue;
      u.cmdType = null; u.cmdTarget = null;
    }
    this._showToast('部队原地固守');
  }

  // 兵种令牌 hover 说明
  _bindTroopTip() {
    const tip = $('troop-tip');
    if (!tip) return;
    const tokens = document.querySelectorAll('.troop-token');
    const container = document.getElementById('game-container');
    for (const el of tokens) {
      el.addEventListener('mouseenter', () => {
        const type = el.dataset.type;
        const def = TROOP_DEFS[type];
        if (!def) return;
        if (UNLOCK_DEFS[type] && !this._meta.unlocks[type]) {
          tip.innerHTML = `<span class="tt-name">🔒 ${def.emoji} ${def.name}（◆${def.cost}）</span><div class="tt-desc">在「战功殿」神兵阁用战功金币解锁！</div>`;
          tip.classList.remove('hidden');
          const r2 = el.getBoundingClientRect();
          const cr2 = container.getBoundingClientRect();
          const sc2 = cr2.width / 1100;
          const tx2 = (r2.left - cr2.left) / sc2 + r2.width / sc2 / 2;
          const ty2 = (r2.top - cr2.top) / sc2 - 10;
          tip.style.left = Math.max(4, Math.min(1096 - 224, tx2 - 100)) + 'px';
          tip.style.top = Math.max(4, ty2 - 90) + 'px';
          return;
        }
        tip.innerHTML =
          `<span class="tt-name">${def.emoji} ${def.name}（◆${def.cost}）</span>` +
          `<div class="tt-stats">生命 ${def.hp} · 攻击 ${def.atk} · 速度 ${def.speed} · 射程 ${def.range}</div>` +
          `<div class="tt-desc">${def.desc || ''}</div>`;
        tip.classList.remove('hidden');
        const r = el.getBoundingClientRect();
        const cr = container.getBoundingClientRect();
        const scale = cr.width / 1100;
        const tx = (r.left - cr.left) / scale + r.width / scale / 2;
        const ty = (r.top - cr.top) / scale - 10;
        tip.style.left = Math.max(4, Math.min(1096 - 224, tx - 100)) + 'px';
        tip.style.top = Math.max(4, ty - 90) + 'px';
      });
      el.addEventListener('mouseleave', () => tip.classList.add('hidden'));
    }
  }

  _handleBattleClick(e) {
    this._closeTouchMenu();
    // 新手引导：小朋友开始手动指挥后，引导完成
    if (this._tutorial.active && this._tutorial.step === 3) this._tutComplete();

    // 商人点击购买
    if (this._events.merchant) {
      const m = this._events.merchant;
      const dx = m.x - this.mouseX, dy = m.y - this.mouseY;
      if (dx * dx + dy * dy < 1600) {
        this._merchantClick();
        return;
      }
    }

    // 查找点击位置的己方单位
    let clickedOwn = -1;
    let clickedEnemy = -1;
    let clickedGate = false;

    // 检测城门
    const gx = 860, gy = 340;
    const gateDx = this.mouseX - gx, gateDy = this.mouseY - gy;
    if (gateDx * gateDx + gateDy * gateDy < 1600) { // 40²
      clickedGate = true;
    }

    // 检测单位
    for (let i = 0; i < this.units.length; i++) {
      const u = this.units[i];
      if (u.hp <= 0) continue;
      const dx = u.x - this.mouseX;
      const dy = u.y - this.mouseY;
      if (dx * dx + dy * dy < 484) { // 22²
        if (u.side === this.playerSide) {
          clickedOwn = i;
        } else {
          clickedEnemy = i;
        }
      }
    }

    // Shift+点击追加选择
    const addMode = e.shiftKey;

    if (clickedOwn >= 0) {
      if (addMode) {
        // 追加/取消单个单位
        const idx = this.selectedUnitIdxs.indexOf(clickedOwn);
        if (idx >= 0) this.selectedUnitIdxs.splice(idx, 1);
        else this.selectedUnitIdxs.push(clickedOwn);
      } else {
        // 单击选中
        this.selectedUnitIdxs = [clickedOwn];
      }
      this.selectedUnitIdx = clickedOwn;
    } else {
      const sels = this._getSelectedUnits();
      if (sels.length === 0) return;

      if (clickedEnemy >= 0) {
        // 所有选中单位攻击敌军
        for (const idx of this.selectedUnitIdxs) {
          this._commandAttack(idx, clickedEnemy);
        }
      } else if (clickedGate && this.playerSide === 'han') {
        // 所有选中单位攻击城门
        for (const idx of this.selectedUnitIdxs) {
          this._commandAttackGate(idx);
        }
      } else if (this.mouseY >= 280 && this.mouseY <= 480) {
        // 所有选中单位移动到目标位置（分散阵型）
        this._commandMoveGroup(this.mouseX, this.mouseY);
      }
    }
  }

  // 获取所有存活的选中单位
  _getSelectedUnits() {
    return this.selectedUnitIdxs.filter(i => {
      const u = this.units[i];
      return u && u.hp > 0 && u.side === this.playerSide;
    });
  }

  // 编队移动（分散阵型）
  _commandMoveGroup(tx, ty) {
    const sels = this._getSelectedUnits();
    if (sels.length === 0) return;

    const cx = Math.max(60, Math.min(1040, tx));
    const cy = Math.max(290, Math.min(480, ty));

    if (sels.length === 1) {
      this._commandMove(sels[0], cx, cy);
      return;
    }

    // 分散排列：以目标点为中心形成方阵
    const cols = Math.ceil(Math.sqrt(sels.length));
    const spacing = 35;
    const ox = cx - (cols - 1) * spacing / 2;
    const oy = cy - (Math.ceil(sels.length / cols) - 1) * spacing / 2;

    sels.forEach((idx, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const ux = Math.max(60, Math.min(1040, ox + col * spacing));
      const uy = Math.max(290, Math.min(480, oy + row * spacing));
      this._commandMove(idx, ux, uy);
    });

    this._cmdMarker = { x: cx, y: cy, life: 1.5 };
  }

  // ---- 阵营+战场合并选择 ----
  _updateSetupUI() {
    // 高亮侧边按钮
    ['han','jin'].forEach(s => {
      const btn = $('btn-' + s);
      btn.classList.toggle('selected', this._pendingSide === s);
    });
    // 高亮地图按钮
    ['canyon','forest','snow'].forEach(m => {
      const btn = $('btn-' + m);
      btn.classList.toggle('selected', this._pendingMap === m);
    });
    // 高亮难度按钮
    ['easy','normal','hard'].forEach(d => {
      const btn = $('btn-diff-' + d);
      if (btn) btn.classList.toggle('selected', this._pendingDiff === d);
    });
    // 两项都选好才启用确认按钮
    $('btn-confirm-setup').disabled = !(this._pendingSide && this._pendingMap);
  }

  _confirmSetup() {
    if (!this._pendingSide || !this._pendingMap) return;

    this.playerSide = this._pendingSide;
    this.aiSide = this._pendingSide === 'han' ? 'jin' : 'han';
    this.difficulty = this._pendingDiff;
    this.mapType = this._pendingMap;
    this._forestSeed = 12345;
    this._setVsBadge(this.playerSide);
    this._beginDeployment(DEPLOY_POINTS);

    // 新手引导：首次游玩时提示先选兵种
    if (!this._tutorial.done) this._tutStartDeploy();
  }

  // VS 徽章高亮
  _setVsBadge(side) {
    const vsHan = vsBadge.querySelector('.vs-han');
    const vsJin = vsBadge.querySelector('.vs-jin');
    if (!side) {
      vsHan.style.color = ''; vsHan.style.textShadow = '';
      vsJin.style.color = ''; vsJin.style.textShadow = '';
      return;
    }
    if (side === 'han') {
      vsHan.style.color = '#E74C3C';
      vsHan.style.textShadow = '0 0 8px rgba(231,76,60,0.6)';
      vsJin.style.color = '';
      vsJin.style.textShadow = '';
    } else {
      vsJin.style.color = '#5DADE2';
      vsJin.style.textShadow = '0 0 8px rgba(93,173,226,0.6)';
      vsHan.style.color = '';
      vsHan.style.textShadow = '';
    }
  }

  // 进入部署阶段（共享初始化：自由模式 / 战役 / 再战）
  _beginDeployment(points) {
    this.state = State.DEPLOYMENT;
    this.deployPoints = points;
    this.units = [];
    this.selectedType = null;
    this.gateHP = GATE_MAX_HP;
    this._celebration = null;
    this._result = null;
    this._paused = false;
    this._speedMul = 1;
    this._autoAdvance = true;
    this._tutHide();
    pointsNum.textContent = this.deployPoints;
    this._updateTroopBarUI();
    this._showOverlay('deployment');
    btnStartBattle.style.display = '';
  }

  // 确定性伪随机数（消除森林背景闪烁）
  _rnd() {
    let s = this._forestSeed;
    s = Math.imul(s ^ s >>> 15, s | 1);
    s ^= s + Math.imul(s ^ s >>> 7, s | 61);
    this._forestSeed = ((s ^ s >>> 14) >>> 0);
    return this._forestSeed / 4294967296;
  }

  // ---- 兵种栏 UI ----
  _updateTroopBarUI() {
    document.querySelectorAll('.troop-token').forEach(el => {
      const cost = parseInt(el.dataset.cost);
      const type = el.dataset.type;
      const locked = UNLOCK_DEFS[type] && !this._meta.unlocks[type];
      el.classList.toggle('selected', type === this.selectedType);
      el.classList.toggle('locked', !!locked);
      // 锁定令牌保持可点击（弹出解锁提示），仅点数不足时禁用
      el.classList.toggle('disabled', this.deployPoints < cost && !locked);
    });
    pointsNum.textContent = this.deployPoints;
  }

  // ---- 部署单位 ----
  _deployAtCursor() {
    if (this.state !== State.DEPLOYMENT) return;
    if (!this.selectedType) return;
    const def = TROOP_DEFS[this.selectedType];
    if (this.deployPoints < def.cost) return;

    // 验证部署区域
    if (!this._isInDeployZone(this.mouseX, this.mouseY)) return;

    // 碰撞检测（不与已有单位重叠）
    if (this._isUnitCollision(this.mouseX, this.mouseY, 40)) return;

    // 精锐加成（兵符升级）
    const stats = this._unitStats(this.selectedType);
    const y = this.selectedType === 'dragon'
      ? Math.max(200, Math.min(260, this.mouseY))
      : this.mouseY;

    this.units.push(this._createUnit(this.selectedType, this.mouseX, y, this.playerSide, {
      hp: stats.hp,
      atkMul: stats.atkMul,
    }));

    this.sound.deploy();

    this.deployPoints -= def.cost;
    if (this.deployPoints < def.cost) this.selectedType = null;

    pointsNum.textContent = this.deployPoints;
    this._updateTroopBarUI();

    // 新手引导：已放第一个兵 → 提示出战
    if (this._tutorial.active && this._tutorial.step === 1) {
      this._tutShow('③ 点击「出 战」开始战斗！', '布置更多士兵（试试左边发光的🐉巨龙！），然后点击右下角红色「出 战」按钮', 7000);
      this._tutorial.step = 2;
    }
  }

  _isInDeployZone(x, y) {
    // 地面区域
    if (y < 280 || y > 480) return false;

    if (this.playerSide === 'han') {
      // 汉（攻方）在左侧部署
      return x >= 60 && x <= 480;
    } else {
      // 金（守方）在城堡前方部署
      return x >= 500 && x <= 820;
    }
  }

  // ---- 地形辅助 ----
  _isBlocked(x, y, r) {
    r = r || 16;
    for (const t of this._terrain) {
      if (t.hp <= 0) continue;
      if (t.type === 'highground' || t.type === 'swamp') continue; // 可通行
      const closestX = Math.max(t.x, Math.min(x, t.x + t.w));
      const closestY = Math.max(t.y, Math.min(y, t.y + t.h));
      const dx = x - closestX, dy = y - closestY;
      if (Math.sqrt(dx * dx + dy * dy) < r) return true;
    }
    return false;
  }

  _isOnHighGround(x, y) {
    for (const t of this._terrain) {
      if (t.type !== 'highground') continue;
      if (x >= t.x && x <= t.x + t.w && y >= t.y && y <= t.y + t.h) return true;
    }
    return false;
  }

  _isInSwamp(x, y) {
    for (const t of this._terrain) {
      if (t.type !== 'swamp') continue;
      if (x >= t.x && x <= t.x + t.w && y >= t.y && y <= t.y + t.h) return true;
    }
    return false;
  }

  _attackObstacle(u, def) {
    let nearest = null, nearestDist = Infinity;
    for (const t of this._terrain) {
      if (t.hp <= 0 || t.type === 'highground' || t.type === 'swamp') continue;
      const tcx = t.x + t.w / 2;
      const tcy = t.y + t.h / 2;
      const dx = tcx - u.x, dy = tcy - u.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < def.range + 15 && dist < nearestDist) {
        nearestDist = dist;
        nearest = t;
      }
    }
    if (nearest) {
      nearest.hp -= def.atk;
      u.atkCooldown = def.atkSpeed || 1.0;
      u._attackFlash = 0.2;
      this._addDamageNum(nearest.x + nearest.w/2, nearest.y, Math.round(def.atk), false, 'normal');
    }
  }

  // ---- 玩家指令系统 ----
  _commandMove(idx, tx, ty) {
    const u = this.units[idx];
    if (!u || u.hp <= 0) return;
    u.cmdType = 'move';
    u.cmdX = Math.max(60, Math.min(1040, tx));
    u.cmdY = Math.max(290, Math.min(480, ty));
    u.cmdTarget = null;
    // 显示移动标记
    this._cmdMarker = { x: u.cmdX, y: u.cmdY, life: 1.5 };
  }

  _commandAttack(idx, targetIdx) {
    const u = this.units[idx];
    const t = this.units[targetIdx];
    if (!u || !t || u.hp <= 0 || t.hp <= 0) return;
    u.cmdType = 'attack';
    u.cmdTarget = targetIdx;
    u.cmdX = null;
    u.cmdY = null;
  }

  _commandAttackGate(idx) {
    const u = this.units[idx];
    if (!u || u.hp <= 0) return;
    u.cmdType = 'attackGate';
    u.cmdTarget = null;
    u.cmdX = null;
    u.cmdY = null;
  }

  _onKeyDown(e) {
    if (this.state !== State.BATTLE) return;

    // P 暂停 / 2 加速
    if (e.key === 'p' || e.key === 'P') { this._togglePause(); return; }
    if (e.key === '2') { this._toggleSpeed(); return; }

    // Tab 切换选中单位
    if (e.key === 'Tab') {
      e.preventDefault();
      this._cycleSelection();
      return;
    }
    // Escape 取消选中
    if (e.key === 'Escape') {
      this.selectedUnitIdxs = [];
      this.selectedUnitIdx = -1;
      return;
    }

    if (this.selectedUnitIdx < 0) return;
    const sel = this.units[this.selectedUnitIdx];
    if (!sel || sel.hp <= 0) { this.selectedUnitIdxs = []; this.selectedUnitIdx = -1; return; }

    // WSAD 移动
    if (['w','W','s','S','a','A','d','D'].includes(e.key)) {
      e.preventDefault();
      const step = 40;
      let nx = sel.x, ny = sel.y;
      if (e.key === 'w' || e.key === 'W') ny -= step;
      if (e.key === 's' || e.key === 'S') ny += step;
      if (e.key === 'a' || e.key === 'A') nx -= step;
      if (e.key === 'd' || e.key === 'D') nx += step;
      this._commandMove(this.selectedUnitIdx, nx, ny);
      return;
    }

    // 空格键攻击最近敌人
    if (e.key === ' ') {
      e.preventDefault();
      const enemyIdx = this._findNearestEnemyFor(sel);
      if (enemyIdx >= 0) {
        this._commandAttack(this.selectedUnitIdx, enemyIdx);
      } else if (this.playerSide === 'han') {
        this._commandAttackGate(this.selectedUnitIdx);
      }
      return;
    }
  }

  _cycleSelection() {
    const ownUnits = [];
    for (let i = 0; i < this.units.length; i++) {
      if (this.units[i].side === this.playerSide && this.units[i].hp > 0) {
        ownUnits.push(i);
      }
    }
    if (ownUnits.length === 0) { this.selectedUnitIdxs = []; this.selectedUnitIdx = -1; return; }
    const curPos = ownUnits.indexOf(this.selectedUnitIdx);
    this.selectedUnitIdx = ownUnits[(curPos + 1) % ownUnits.length];
  }

  // ============================================================
  // 共享战斗计算方法（消除重复代码）
  // ============================================================

  // 计算单位有效移动速度（6 层叠加）
  _getEffectiveSpeed(u, hasSpdDebuff) {
    const def = TROOP_DEFS[u.type];
    let spd = def.speed;
    const isPlayer = u.side === this.playerSide;

    if (isPlayer && this._messengerBuff > 0) spd *= 1.25;
    if (!isPlayer && this._decreeBuff.enemySlow > 0) spd *= 0.6;
    if (this._nightMode && !isPlayer) spd *= 0.7;
    spd *= WEATHER_TYPES[this._weather.type].speedMul;
    if (isPlayer && this._pickupBuffs.spd > 0) spd *= 1.3;
    if (hasSpdDebuff) spd *= TROOP_DEFS.strategist.spdAura;
    if (isPlayer && this._isInSwamp(u.x, u.y)) spd *= 0.4;

    return spd;
  }

  // 计算单位有效攻击射程（天气 + 地形）
  _getEffectiveRange(u, isGate) {
    const def = TROOP_DEFS[u.type];
    let range = def.range;
    if (isGate) range += 20;
    if (this._weather.type === 'wind' && (u.type === 'catapult' || u.type === 'spear' || u.type === 'bomber' || u.type === 'crossbow')) {
      range *= 1.5;
    }
    if (this._isOnHighGround(u.x, u.y)) range *= 1.2;
    return range;
  }

  // 计算基础伤害（暴击/格挡前）
  _calcDamage(u, target, auraAtk, isGate) {
    const def = TROOP_DEFS[u.type];
    let dmg = def.atk * (u._atkMul || 1); // AI 难度/精锐 攻击倍率
    const isPlayer = u.side === this.playerSide;

    if (isGate) {
      if (u.type === 'ram') dmg *= 3;
    } else if (target) {
      if (u.type === 'spear' && target.type === 'cavalry') dmg *= 2;
    }

    if (isPlayer && this._pickupBuffs.atk > 0) dmg *= 1.5;
    if (isPlayer && this._decreeBuff.atk > 0) dmg *= 1.15;
    if (auraAtk > 0) dmg *= (1 + auraAtk);
    if (this._isOnHighGround(u.x, u.y)) dmg *= 1.1;

    return dmg;
  }

  // 计算暴击率
  _getCritRate(u) {
    let rate = 0.1;
    if (u.type === 'halberd') rate = 0.15;
    else if (u.type === 'cavalry') rate = 0.05;
    if (this._nightMode && u.side === this.playerSide) rate += 0.15;
    return rate;
  }

  // 执行城门攻击全流程（伤害、CD、特效、音效）
  _doGateAttack(u, def, auraAtk) {
    const gx = 860, gy = 340;
    let dmg = this._calcDamage(u, null, auraAtk, true);
    const isCrit = Math.random() < this._getCritRate(u);
    if (isCrit) dmg *= 2;

    this.gateHP = Math.max(0, this.gateHP - dmg);
    u.atkCooldown = def.atkSpeed || 1.0;
    u._attackFlash = 0.2;
    this._addDamageNum(gx, gy - 35, Math.round(dmg), isCrit, isCrit ? 'crit' : 'normal');
    this._screenShake = Math.max(this._screenShake, u.type === 'ram' ? 6 : 2);
    this._gateFlash = 0.15;
    this.sound.gateHit();
    this._spawnAttackFX(u, gx, gy, isCrit, true);
  }

  // 执行一帧移动（碰撞检测、尘土粒子、飞行限位）
  _moveToward(u, dx, dy, dist, spd, dt, spawnDust) {
    if (dist < 1) return; // 防止 dist=0 时产生 NaN 坐标
    const vx = (dx / dist) * spd * 60 * dt;
    const vy = (dy / dist) * spd * 60 * dt;
    const nx = u.x + vx, ny = u.y + vy;

    if (u.type === 'dragon') {
      u.x = nx;
      u.y = Math.max(200, Math.min(300, ny));
    } else if (!this._isBlocked(nx, ny)) {
      u.x = nx;
      u.y = ny;
      if (spawnDust && Math.random() < 0.3) {
        this.particles.push({
          x: u.x + (Math.random() - 0.5) * 10,
          y: u.y + 18,
          vx: (Math.random() - 0.5) * 8,
          vy: -5 - Math.random() * 10,
          life: 0.3 + Math.random() * 0.3,
          maxLife: 0.6,
          color: 'rgba(139,119,90,0.4)',
          size: 2 + Math.random() * 3,
          type: 'dust',
        });
      }
    } else if (u.atkCooldown <= 0) {
      this._attackObstacle(u, TROOP_DEFS[u.type]);
    }

    if (u.type !== 'dragon') {
      u.y = Math.max(290, Math.min(480, u.y));
    }
  }

  _findNearestEnemyFor(u) {
    let nearest = -1, nearestDist = Infinity;
    for (let i = 0; i < this.units.length; i++) {
      const e = this.units[i];
      if (e.side === u.side || e.hp <= 0) continue;
      const dx = e.x - u.x, dy = e.y - u.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < nearestDist) { nearestDist = dist; nearest = i; }
    }
    return nearest;
  }

  // ---- 共享辅助：单位工厂 / 重叠检测 / 寻敌 ----
  // 统一创建单位（玩家带精锐加成，AI 带难度倍率）
  _createUnit(type, x, y, side, opts) {
    opts = opts || {};
    const def = TROOP_DEFS[type];
    const hp = opts.hp != null ? opts.hp : def.hp;
    const unit = {
      type,
      name: opts.name || SOLDIER_NAMES[Math.floor(Math.random() * SOLDIER_NAMES.length)],
      x, y,
      hp, maxHP: hp,
      side, state: 'idle',
      targetX: null, targetY: null, atkCooldown: 0,
      _sprite: opts.sprite || Assets.get('unit_' + side + '_' + type),
      _bobPhase: Math.random() * Math.PI * 2,
      _attackFlash: 0,
    };
    if (opts.atkMul != null) unit._atkMul = opts.atkMul;
    return unit;
  }

  // 位置是否与存活单位重叠
  _isUnitCollision(x, y, r) {
    const r2 = r * r;
    for (const u of this.units) {
      if (u.hp <= 0) continue;
      const dx = u.x - x, dy = u.y - y;
      if (dx * dx + dy * dy < r2) return true;
    }
    return false;
  }

  // 在 alive 列表中寻找最近敌人（maxRange 限定射程；不传则全图）
  _findNearestEnemy(u, alive, maxRange) {
    let nearest = null, nearestDist = maxRange != null ? maxRange * maxRange : Infinity;
    for (const enemy of alive) {
      if (enemy.side === u.side) continue;
      const dx = enemy.x - u.x, dy = enemy.y - u.y;
      const dist = dx * dx + dy * dy;
      if (dist < nearestDist) { nearestDist = dist; nearest = enemy; }
    }
    return nearest;
  }

  // ---- 玩家单位更新（每帧调用） ----
  _updatePlayerUnit(u, def, alive, auraAtk, hasSpdDebuff, dt) {
    // 清除失效指令
    if (u.cmdType === 'attack' && u.cmdTarget != null) {
      const t = this.units[u.cmdTarget];
      if (!t || t.hp <= 0) { u.cmdType = null; u.cmdTarget = null; }
    }
    if (u.cmdType === 'move') {
      const dx = u.x - u.cmdX, dy = u.y - u.cmdY;
      if (Math.sqrt(dx*dx + dy*dy) < 8) { u.cmdType = null; }
    }

    // 无指令时：全军出击模式下自动寻找敌人冲锋；固守模式下仅反击射程内敌人
    if (!u.cmdType) {
      if (this._autoAdvance) {
        // 寻找最近的敌人（任意距离），主动接近并攻击
        const nearestEnemy = this._findNearestEnemy(u, alive);
        if (nearestEnemy) {
          const autoRange = this._getEffectiveRange(u, false);
          const dx = nearestEnemy.x - u.x, dy = nearestEnemy.y - u.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist <= autoRange) {
            if (u.atkCooldown <= 0) this._doAttack(u, def, nearestEnemy, auraAtk, false);
          } else {
            const spd = this._getEffectiveSpeed(u, hasSpdDebuff);
            this._moveToward(u, dx, dy, dist, spd, dt, true);
          }
          return;
        }
        // 攻方没有敌人时 → 自动冲向城门；守方原地待命
        if (this.playerSide === 'han') {
          const gx = 860, gy = 340;
          const dx = gx - u.x, dy = gy - u.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const gateRange = this._getEffectiveRange(u, true);
          if (dist <= gateRange) {
            if (u.atkCooldown <= 0) this._doGateAttack(u, def, auraAtk);
          } else {
            const spd = this._getEffectiveSpeed(u, hasSpdDebuff);
            this._moveToward(u, dx, dy, dist, spd, dt, true);
          }
        }
        return;
      }

      // 固守模式：自动反击范围内的敌人
      const autoRange = this._getEffectiveRange(u, false);
      const nearestEnemy = this._findNearestEnemy(u, alive, autoRange);
      if (nearestEnemy) {
        this._doAttack(u, def, nearestEnemy, auraAtk, false);
      }
      return;
    }

    // 执行移动指令
    if (u.cmdType === 'move') {
      const dx = u.cmdX - u.x, dy = u.cmdY - u.y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      if (dist < 5) { u.cmdType = null; return; }

      // 移动途中遇到敌人自动攻击
      const autoRange = this._getEffectiveRange(u, false);
      const nearestEnemy = this._findNearestEnemy(u, alive, autoRange);
      if (nearestEnemy && u.atkCooldown <= 0) {
        this._doAttack(u, def, nearestEnemy, auraAtk, false);
        return; // 攻击时不移动
      }

      const spd = this._getEffectiveSpeed(u, hasSpdDebuff);
      this._moveToward(u, dx, dy, dist, spd, dt, false);
      return;
    }

    // 执行攻击敌军指令
    if (u.cmdType === 'attack' && u.cmdTarget != null) {
      const t = this.units[u.cmdTarget];
      if (!t || t.hp <= 0) { u.cmdType = null; u.cmdTarget = null; return; }
      const dx = t.x - u.x, dy = t.y - u.y;
      const dist = Math.sqrt(dx*dx + dy*dy);

      const atkRange = this._getEffectiveRange(u, false);

      if (dist <= atkRange) {
        if (u.atkCooldown <= 0) {
          this._doAttack(u, def, t, auraAtk, false);
          if (t.hp <= 0) { u.cmdType = null; u.cmdTarget = null; }
        }
      } else {
        const spd = this._getEffectiveSpeed(u, hasSpdDebuff);
        this._moveToward(u, dx, dy, dist, spd, dt, false);
      }
      return;
    }

    // 执行攻击城门指令
    if (u.cmdType === 'attackGate') {
      const gx = 860, gy = 340;
      const dx = gx - u.x, dy = gy - u.y;
      const dist = Math.sqrt(dx*dx + dy*dy);

      const atkRange = this._getEffectiveRange(u, true);

      if (dist <= atkRange) {
        if (u.atkCooldown <= 0) {
          this._doGateAttack(u, def, auraAtk);
        }
      } else {
        const spd = this._getEffectiveSpeed(u, hasSpdDebuff);
        this._moveToward(u, dx, dy, dist, spd, dt, false);
      }
      return;
    }
  }

  // 执行一次攻击（复用攻击逻辑）
  _doAttack(u, def, target, auraAtk, isGate) {
    // Dragon breathes fire at target
    if (u.type === 'dragon' && !isGate) {
      this._dragonFireBreath(u, target.x, target.y);
    }
    let dmg = this._calcDamage(u, target, auraAtk, false);
    const isCrit = Math.random() < this._getCritRate(u);
    if (isCrit) dmg *= 2;

    let blocked = false;
    if (target.type === 'shield' && Math.random() < TROOP_DEFS.shield.blockChance) {
      dmg *= (1 - TROOP_DEFS.shield.blockPct);
      blocked = true;
    }
    target.hp -= dmg;
    target._lostSegFlash = 0.3;
    u.atkCooldown = def.atkSpeed || 1.0;
    u._attackFlash = 0.2;
    { const atkType = isCrit ? 'crit' : 'normal'; this._addDamageNum(target.x, target.y - 28, Math.round(dmg), isCrit, atkType); }
    if (blocked) {
      this._addDamageNum(target.x, target.y - 40, Math.round(dmg), false, 'block');
    }
    if (isCrit) this.sound.crit(); else this.sound.hit();

    target._hitFlash = 0.12;
    this._spawnAttackFX(u, target.x, target.y, isCrit, false);

    if (target.hp <= 0) {
      target.hp = 0;
      target._deathTime = this.battleElapsed;
      // 下载的 PNG 爆炸特效（大型单位/暴击击杀）
      if (isCrit || u.type === 'catapult' || target.type === 'ram' || target.type === 'catapult') {
        this.particles.push({
          x: target.x, y: target.y, vx: 0, vy: 0,
          life: 0.5, maxLife: 0.5,
          color: null, size: 40 + Math.random() * 20,
          type: 'explosion_png',
        });
      }
      this._onKill(target, u.type);
    }

    // ---- 范围溅射：火罐兵（灼烧）/ 战象（践踏） ----
    if (u.type === 'bomber' || u.type === 'elephant') {
      const splashR = u.type === 'bomber' ? 44 : 50;
      const splashPct = u.type === 'bomber' ? 0.5 : 0.6;
      const r2 = splashR * splashR;
      for (const other of this.units) {
        if (other === target || other.hp <= 0 || other.side === u.side) continue;
        const dx = other.x - target.x, dy = other.y - target.y;
        if (dx * dx + dy * dy < r2) {
          const sdmg = dmg * splashPct;
          other.hp -= sdmg;
          other._lostSegFlash = 0.3;
          this._addDamageNum(other.x, other.y - 28, Math.round(sdmg), false, 'normal');
          if (u.type === 'bomber' && Math.random() < 0.6) {
            this.particles.push({
              x: other.x, y: other.y,
              vx: (Math.random() - 0.5) * 30,
              vy: -20 - Math.random() * 30,
              life: 0.4 + Math.random() * 0.4, maxLife: 0.8,
              color: null, size: 4 + Math.random() * 5, type: 'fire',
            });
          }
          if (other.hp <= 0) {
            other.hp = 0;
            other._deathTime = this.battleElapsed;
            this._onKill(other, u.type);
          }
        }
      }
    }
  }

  // 巨龙吐火 — spawn flame particle stream toward target
  _dragonFireBreath(u, tx, ty) {
    const dx = tx - u.x;
    const dy = ty - u.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const steps = Math.floor(dist / 10);
    const sheet = Assets.get('fire_breath');
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const px = u.x + dx * t + (Math.random() - 0.5) * 30;
      const py = u.y + dy * t + (Math.random() - 0.5) * 15;
      this.particles.push({
        x: px, y: py,
        vx: (Math.random() - 0.5) * 20,
        vy: (Math.random() - 0.5) * 20 - 30,
        life: 0.8 + Math.random() * 0.7,
        maxLife: 1.5,
        color: null,
        size: 12 + Math.random() * 16,
        type: 'fire_breath',
        data: { frameIdx: Math.floor(Math.random() * 12) }
      });
    }
    // Impact fire burst
    for (let j = 0; j < 8; j++) {
      this.particles.push({
        x: tx, y: ty,
        vx: (Math.random() - 0.5) * 80,
        vy: (Math.random() - 0.5) * 80 - 40,
        life: 0.4 + Math.random() * 0.3,
        maxLife: 0.7,
        color: null,
        size: 10 + Math.random() * 18,
        type: 'fire_breath',
        data: { frameIdx: Math.floor(Math.random() * 12) }
      });
    }
  }

  // 攻击特效
  // 粒子爆发（随机角度扩散，支持上偏/抖动/多色）
  _burst(x, y, color, count, speedMin, speedMax, type, opts) {
    opts = opts || {};
    const up = opts.up || 0;
    const life = opts.life != null ? opts.life : 0.6;
    const lifeR = opts.lifeR || 0.4;
    const maxLife = opts.maxLife != null ? opts.maxLife : life + lifeR;
    const size = opts.size != null ? opts.size : 2;
    const sizeR = opts.sizeR || 0;
    const jx = (opts.jitter && opts.jitter.x) || 0;
    const jy = (opts.jitter && opts.jitter.y) || 0;
    const colors = Array.isArray(color) ? color : null;
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = speedMin + Math.random() * (speedMax - speedMin);
      const l = life + Math.random() * lifeR;
      this.particles.push({
        x: x + (Math.random() - 0.5) * jx,
        y: y + (Math.random() - 0.5) * jy,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - up,
        life: l, maxLife,
        color: colors ? colors[Math.floor(Math.random() * colors.length)] : color,
        size: size + Math.random() * sizeR,
        type: type || 'spark',
      });
    }
  }

  _spawnAttackFX(u, tx, ty, isCrit, isGate) {
    const sideColor = u.side === 'han' ? '#E74C3C' : '#3498DB';
    const meleeTypes = ['sword', 'spear', 'halberd', 'cavalry', 'shield', 'ram', 'elephant', 'general'];
    const isMelee = meleeTypes.includes(u.type);

    // 攻击轨迹
    const trailColor = isCrit ? '#FFD700' : sideColor;
    const trailSize = isCrit ? 3.5 : 2;
    this.particles.push({
      x: tx, y: ty, vx: 0, vy: 0,
      life: 0.25, maxLife: 0.25,
      color: trailColor, size: trailSize,
      type: isMelee ? 'slash' : 'tracer',
      data: { sx: u.x, sy: u.y, tx, ty },
    });

    // 受击火花
    this._burst(tx, ty, isCrit ? '#FFD700' : sideColor, isCrit ? 8 : 4, 50, 170, 'spark', {
      life: 0.2, lifeR: 0.3, maxLife: 0.5, size: 1.5, sizeR: 2.5,
    });

    // 受击光晕
    if (isCrit) {
      this.particles.push({
        x: tx, y: ty, vx: 0, vy: 0,
        life: 0.3, maxLife: 0.3,
        color: null, size: 8 + Math.random() * 8,
        type: 'impact',
      });
    }

    // 城门额外碎片 + PNG爆炸
    if (isGate) {
      // PNG 爆炸特效
      this.particles.push({
        x: tx, y: ty, vx: 0, vy: 0,
        life: 0.5, maxLife: 0.5,
        color: null, size: 45 + Math.random() * 15,
        type: 'explosion_png',
      });
      for (let i = 0; i < 6; i++) {
        this.particles.push({
          x: tx + (Math.random() - 0.5) * 30,
          y: ty + Math.random() * 10,
          vx: (Math.random() - 0.5) * 100,
          vy: -40 - Math.random() * 80,
          life: 0.4 + Math.random() * 0.4,
          maxLife: 0.8,
          color: 'rgba(139,119,90,0.7)',
          size: 3 + Math.random() * 5,
          type: 'dust',
        });
      }
    }
  }

  // ---- 自动部署 ----
  _autoDeploy() {
    this.units = [];
    this.deployPoints = DEPLOY_POINTS;

    // 已解锁的新兵种加入自动布阵
    const extras = [];
    if (this._meta.unlocks.bomber) extras.push('bomber', 'bomber');
    if (this._meta.unlocks.elephant) extras.push('elephant');
    if (this._meta.unlocks.general) extras.push('general');

    if (this.playerSide === 'han') {
      this._executeDeployPlan([
        'catapult','dragon','crossbow','crossbow','crossbow',
        'ram','ram','cavalry','cavalry','cavalry',
        'strategist','shield','shield','halberd','halberd',
        'spear','spear','spear','sword','sword','sword','sword',
        ...extras,
      ]);
    } else {
      this._executeDeployPlan([
        'catapult','dragon','crossbow','crossbow','crossbow',
        'strategist','shield','shield','shield','halberd',
        'halberd','cavalry','cavalry','cavalry','spear',
        'spear','spear','sword','sword','sword','sword',
        ...extras,
      ]);
    }

    this._updateTroopBarUI();
  }

  _executeDeployPlan(plan) {
    let pts = DEPLOY_POINTS;
    const baseZone = this.playerSide === 'han'
      ? { xMin: 80, xMax: 460, yMin: 300, yMax: 470 }
      : { xMin: 520, xMax: 800, yMin: 300, yMax: 470 };

    for (const type of plan) {
      const def = TROOP_DEFS[type];
      if (pts < def.cost) continue;

      // Dragons deploy in the air (y: 200-260), others on ground (y: 300-470)
      const isDragon = type === 'dragon';

      // 找到不重叠的位置
      let placed = false;
      for (let attempt = 0; attempt < 50; attempt++) {
        const x = baseZone.xMin + Math.random() * (baseZone.xMax - baseZone.xMin);
        const y = isDragon ? (200 + Math.random() * 60) : (baseZone.yMin + Math.random() * (baseZone.yMax - baseZone.yMin));
        if (!this._isUnitCollision(x, y, 45)) {
          const stats = this._unitStats(type);
          this.units.push(this._createUnit(type, x, y, this.playerSide, {
            hp: stats.hp,
            atkMul: stats.atkMul,
          }));
          pts -= def.cost;
          placed = true;
          break;
        }
      }
      if (!placed) continue;
    }
    this.deployPoints = pts;
  }

  // ---- 开始战斗 ----
  // 重置战斗状态字段（开战 / 重开共用）
  _resetBattleFields(initialGold) {
    this.battleElapsed = 0;
    this._lastBattleTime = 0;
    this.combo = 0;
    this._comboDecay = 0;
    this.gold = initialGold;
    this.killCount = 0;
    this._catapultKills = 0;
    this.maxCombo = 0;
    this.gateHP = GATE_MAX_HP;
    this.damageNumbers = [];
    this.particles = [];
    this._killMarks = [];
    this._birds = [];
    this._brazierTimers = [0, 0, 0];
    this._screenShake = 0;
    this._gateFlash = 0;
    this._lightningFlash = 0;
    this._skillsUsed = { fire: false, night: false, messenger: false, decree: false };
    this._skills = {};
    for (const key of Object.keys(SKILL_DEFS)) {
      this._skills[key] = { cd: 0, active: false, timer: 0 };
    }
    this._nightMode = false;
    this._weather = { type: 'clear', timer: 0, nextChange: 40 };
    this._terrain = [];
    this._chests = [];
    this._chestSpawnTimer = 0;
    this._chestSpawnDelay = 20;
    this._events = { merchant: null, wolves: [] };
    this._eventTimer = 0;
    this._eventDelay = 18;
    this._lightningStrike = null;
    this._pickupBuffs = { atk: 0, spd: 0 };
    this._messengerBuff = 0;
    this._decreeBuff = { atk: 0, enemySlow: 0 };
    this.selectedUnitIdxs = [];
    this.selectedUnitIdx = -1;
    this._cmdMarker = null;
    this._speedMul = 1;
    this._paused = false;
    this._quitArmed = false;
    this._autoAdvance = true;
    this._celebration = null;
    this._result = null;
    this._lastResult = null;
    this._gateBoom = false;
    comboDisplay.textContent = '';
    goldDisplay.textContent = `${this.gold}`;
    timerDisplay.textContent = '00:00';
    this._lastShownSec = -1;
    this._skillUIAccum = 1; // 第一帧立即刷新技能按钮状态
    const spdBtn = $('btn-speed'); if (spdBtn) { spdBtn.textContent = '⏩'; spdBtn.classList.remove('active'); }
    const psBtn = $('btn-pause'); if (psBtn) { psBtn.textContent = '⏸'; psBtn.classList.remove('active'); }
    const advBtn = $('btn-auto-advance'); if (advBtn) advBtn.classList.add('active');
    const qBtn = $('btn-quit'); if (qBtn) qBtn.classList.remove('confirm');
  }

  _startBattle() {
    if (this.units.length === 0) {
      this._showToast('请先部署士兵！');
      return;
    }
    this.state = State.BATTLE;
    this._resetBattleFields(START_GOLD);

    // 生成地形
    this._generateTerrain();

    // 生成 AI 单位
    this._spawnAIUnits();

    this._showOverlay('battle');
    btnStartBattle.style.display = 'none';

    // 新手引导：第一次进入战斗，教小朋友怎么指挥
    if (!this._tutorial.done) {
      this._tutShow('④ 指挥你的部队！', '士兵已经自动冲锋！你还可以：点击/框选部队 → 点击敌人或城门进攻；按 ⚑ 可切换固守。看到上方技能条了吗？攒够金币就能放🔥火攻！', 9000);
      this._tutorial.step = 3;
    }
  }

  _spawnAIUnits() {
    const playerCount = this.units.filter(u => u.side === this.playerSide).length;
    const zone = this.aiSide === 'han'
      ? { xMin: 80, xMax: 460, yMin: 300, yMax: 470 }
      : { xMin: 520, xMax: 800, yMin: 300, yMax: 470 };
    const diff = DIFF_DEFS[this.difficulty] || DIFF_DEFS.normal;

    const plan = this._generateAIPlan(playerCount);

    // 战役模式用关卡专属 AI 预算，普通模式用难度预算
    let pts2 = this.campaign.active
      ? CAMPAIGN_DEFS[this.campaign.level].aiBudget
      : diff.budget;
    for (let ti2 = 0; ti2 < plan.length; ti2++) {
      const type2 = plan[ti2];
      const def2 = TROOP_DEFS[type2];
      if (pts2 < def2.cost) continue;
      const isDragonAI = type2 === 'dragon';
      for (let attempt2 = 0; attempt2 < 50; attempt2++) {
        const x2 = zone.xMin + Math.random() * (zone.xMax - zone.xMin);
        const y2 = isDragonAI ? 200 + Math.random() * 60 : zone.yMin + Math.random() * (zone.yMax - zone.yMin);
        if (!this._isUnitCollision(x2, y2, 45)) {
          this.units.push(this._createUnit(type2, x2, y2, this.aiSide, {
            hp: Math.round(def2.hp * diff.hpMul),
            atkMul: diff.atkMul,
          }));
          pts2 -= def2.cost;
          break;
        }
      }
    }
  }

  _generateAIPlan(targetCount) {
    const plan = [];
    const diff = DIFF_DEFS[this.difficulty] || DIFF_DEFS.normal;
    let budget = diff.budget;

    // 按难度选择必出兵种（简单不含巨龙，困难双巨龙精锐压阵）
    const priorityTypes = this.difficulty === 'easy'
      ? ['strategist', 'catapult', 'spear']
      : this.difficulty === 'hard'
        ? ['dragon', 'dragon', 'catapult', 'strategist', 'cavalry']
        : ['strategist', 'catapult', 'dragon'];
    for (const type of priorityTypes) {
      if (plan.length < targetCount && TROOP_DEFS[type].cost <= budget) {
        plan.push(type);
        budget -= TROOP_DEFS[type].cost;
      }
    }

    // Fill remaining slots with a balanced mix
    const tier2 = this.difficulty === 'easy'
      ? ['spear', 'shield', 'crossbow', 'bomber']
      : ['crossbow', 'shield', 'cavalry', 'halberd', 'spear', 'ram', 'bomber', 'elephant'];
    const tier1 = ['sword'];

    while (plan.length < targetCount && budget >= 1) {
      const pool = budget >= 2 ? [...tier2, ...tier1] : tier1;
      const type = pool[Math.floor(Math.random() * pool.length)];
      if (TROOP_DEFS[type].cost <= budget) {
        plan.push(type);
        budget -= TROOP_DEFS[type].cost;
      }
    }

    return plan;
  }

  // ---- 战役 AI 生成 ----
  // ---- 地形生成 ----
  _generateTerrain() {
    if (this.mapType === 'forest') {
      this._generateForestTerrain();
      return;
    }
    if (this.mapType === 'snow') {
      this._generateSnowTerrain();
      return;
    }
    this._terrain = [];

    // 岩石（不可通行，可破坏）
    const rocks = [
      { x: 280, y: 390 }, { x: 420, y: 370 }, { x: 580, y: 400 },
      { x: 650, y: 350 }, { x: 750, y: 380 }, { x: 350, y: 440 },
    ];
    for (const r of rocks) {
      const w = 30 + Math.random() * 20;
      const h = 28 + Math.random() * 16;
      this._terrain.push({ type: 'rock', x: r.x, y: r.y, w, h, hp: 100, maxHP: 100 });
    }

    // 拒马（低血量路障）
    const barricades = [
      { x: 320, y: 330 }, { x: 540, y: 340 }, { x: 700, y: 330 },
    ];
    for (const b of barricades) {
      this._terrain.push({ type: 'barricade', x: b.x, y: b.y, w: 50, h: 8, hp: 60, maxHP: 60 });
    }

    // 高地（提供增益）
    const highGrounds = [
      { x: 200, y: 320, w: 120, h: 40 },
      { x: 700, y: 310, w: 130, h: 50 },
      { x: 480, y: 350, w: 80, h: 35 },
    ];
    for (const hg of highGrounds) {
      this._terrain.push({ type: 'highground', x: hg.x, y: hg.y, w: hg.w, h: hg.h, hp: Infinity, maxHP: Infinity });
    }
  }

  _generateForestTerrain() {
    this._terrain = [];

    // 树木（可破坏障碍物）
    const trees = [
      { x: 200, y: 380 }, { x: 280, y: 420 }, { x: 380, y: 370 },
      { x: 500, y: 400 }, { x: 580, y: 360 }, { x: 680, y: 390 },
      { x: 780, y: 370 }, { x: 330, y: 450 }, { x: 620, y: 440 },
      { x: 720, y: 430 },
    ];
    for (const t of trees) {
      this._terrain.push({ type: 'tree', x: t.x, y: t.y, w: 24, h: 24, hp: 80, maxHP: 80 });
    }

    // 灌木丛（低血量，可破坏）
    const bushes = [
      { x: 150, y: 350 }, { x: 350, y: 330 }, { x: 450, y: 350 },
      { x: 560, y: 340 }, { x: 650, y: 330 }, { x: 750, y: 340 },
      { x: 260, y: 380 }, { x: 520, y: 370 },
    ];
    for (const b of bushes) {
      this._terrain.push({ type: 'bush', x: b.x, y: b.y, w: 40 + Math.random() * 15, h: 16, hp: 40, maxHP: 40 });
    }

    // 沼泽（减速区域，不可破坏）
    const swamps = [
      { x: 350, y: 460, w: 120, h: 40 },
      { x: 600, y: 470, w: 140, h: 35 },
    ];
    for (const s of swamps) {
      this._terrain.push({ type: 'swamp', x: s.x, y: s.y, w: s.w, h: s.h, hp: Infinity, maxHP: Infinity });
    }

    // 森林高地
    const highGrounds = [
      { x: 220, y: 310, w: 100, h: 35 },
      { x: 680, y: 305, w: 120, h: 40 },
      { x: 450, y: 340, w: 70, h: 30 },
    ];
    for (const hg of highGrounds) {
      this._terrain.push({ type: 'highground', x: hg.x, y: hg.y, w: hg.w, h: hg.h, hp: Infinity, maxHP: Infinity });
    }
  }

  _generateSnowTerrain() {
    this._terrain = [];

    // 雪松（可破坏障碍）
    const trees = [
      { x: 200, y: 380 }, { x: 300, y: 430 }, { x: 420, y: 370 },
      { x: 520, y: 410 }, { x: 620, y: 360 }, { x: 720, y: 400 },
      { x: 800, y: 375 }, { x: 350, y: 455 }, { x: 660, y: 445 },
    ];
    for (const t of trees) {
      this._terrain.push({ type: 'tree', x: t.x, y: t.y, w: 24, h: 24, hp: 90, maxHP: 90 });
    }

    // 雪堆（低血量，可破坏）
    const drifts = [
      { x: 150, y: 350 }, { x: 340, y: 335 }, { x: 460, y: 355 },
      { x: 580, y: 345 }, { x: 700, y: 335 }, { x: 250, y: 385 },
      { x: 540, y: 375 },
    ];
    for (const d of drifts) {
      this._terrain.push({ type: 'bush', x: d.x, y: d.y, w: 42 + Math.random() * 14, h: 16, hp: 45, maxHP: 45 });
    }

    // 冻土岩（不可破坏通行、可破坏）
    const rocks = [
      { x: 380, y: 400 }, { x: 650, y: 420 },
    ];
    for (const r of rocks) {
      this._terrain.push({ type: 'rock', x: r.x, y: r.y, w: 32, h: 26, hp: 130, maxHP: 130 });
    }

    // 冰面（减速区域，踩上去打滑）
    const ice = [
      { x: 320, y: 465, w: 130, h: 35 },
      { x: 580, y: 470, w: 140, h: 30 },
    ];
    for (const s of ice) {
      this._terrain.push({ type: 'swamp', x: s.x, y: s.y, w: s.w, h: s.h, hp: Infinity, maxHP: Infinity });
    }

    // 雪原高地
    const highGrounds = [
      { x: 200, y: 315, w: 110, h: 38 },
      { x: 690, y: 310, w: 125, h: 42 },
      { x: 460, y: 340, w: 75, h: 32 },
    ];
    for (const hg of highGrounds) {
      this._terrain.push({ type: 'highground', x: hg.x, y: hg.y, w: hg.w, h: hg.h, hp: Infinity, maxHP: Infinity });
    }
  }

  // ---- 重置游戏 ----
  _resetGame() {
    this.state = State.START_SCREEN;
    this.playerSide = null;
    this.mapType = 'canyon';
    this.aiSide = null;
    this._pendingSide = null;
    this._pendingMap = null;
    this.difficulty = 'normal';
    this._pendingDiff = 'normal';
    this.deployPoints = DEPLOY_POINTS;
    this.selectedType = null;
    this.units = [];
    this._shownAchievements = { ...this.unlockedAchievements };
    this._resetBattleFields(0);
    this._tutHide();
    // 战役/触屏状态重置
    this.campaign.active = false;
    this.campaign.level = 0;
    this._closeTouchMenu();
    const banner = $('campaign-banner');
    if (banner) banner.classList.add('hidden');
    this._updateMetaDisplay();
    this._showOverlay('start');
    btnStartBattle.style.display = '';
    this._setVsBadge(null);
    this._bgKey = null; // 菜单背景需按当前场景重绘
  }

  // ---- Toast 提示 ----
  _showToast(msg) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    document.getElementById('game-container').appendChild(el);
    setTimeout(() => el.remove(), 2200);
  }

  // ---- 新手引导 ----
  _tutStartDeploy() {
    this._tutorial.active = true;
    this._tutorial.step = 0;
    this._tutShow('① 选择你的兵种', '点击下方令牌选择一个兵种，比如左边发光的 🐉巨龙！然后点战场放下它', 7000);
  }

  _tutShow(text, sub, ms) {
    if (!this.tutorialBox) return;
    this.tutorialBox.innerHTML = `<span class="tut-main">${text}</span><span class="tut-sub">${sub || ''}</span>`;
    this.tutorialBox.classList.remove('hidden');
    if (this._tutTimer) clearTimeout(this._tutTimer);
    this._tutTimer = setTimeout(() => this._tutHide(), ms || 6000);
  }

  _tutHide() {
    if (this.tutorialBox) this.tutorialBox.classList.add('hidden');
    if (this._tutTimer) { clearTimeout(this._tutTimer); this._tutTimer = null; }
  }

  _tutComplete() {
    this._tutorial.active = false;
    this._tutorial.done = true;
    try { localStorage.setItem('hanjin_tut_done', '1'); } catch {}
    this._tutHide();
  }

  // ---- 战斗节奏控制 ----
  _toggleSpeed() {
    if (this.state !== State.BATTLE) return;
    this._speedMul = this._speedMul === 1 ? 2 : 1;
    const btn = $('btn-speed');
    btn.textContent = this._speedMul === 2 ? '⏩⏩' : '⏩';
    btn.classList.toggle('active', this._speedMul === 2);
    this._showToast(this._speedMul === 2 ? '⚡ 2倍速行军！' : '恢复正常速度');
  }

  _togglePause() {
    if (this.state !== State.BATTLE) return;
    this._paused = !this._paused;
    const btn = $('btn-pause');
    btn.textContent = this._paused ? '▶' : '⏸';
    btn.classList.toggle('active', this._paused);
    this._showToast(this._paused ? '⏸ 已暂停' : '▶ 继续战斗');
  }

  // ---- 同配置再战：跳过选边/选图/难度，直接回到部署 ----
  _replaySame() {
    this._beginDeployment(this.campaign.active ? this.campaign.points : DEPLOY_POINTS);
  }

  // ---- 战役模式：3 关连续攻城（固定汉军攻方） ----
  _startCampaign() {
    this.campaign.active = true;
    this.campaign.level = 0;
    this._campaignSetup();
  }

  _campaignSetup() {
    const lvl = CAMPAIGN_DEFS[this.campaign.level];
    this.playerSide = 'han';
    this.aiSide = 'jin';
    this.mapType = lvl.map;
    this.difficulty = lvl.diff;
    this.campaign.points = lvl.points;
    this._setVsBadge('han');
    this._beginDeployment(lvl.points);
    this._showCampaignBanner(this.campaign.level);
  }

  _nextCampaignLevel() {
    this.campaign.level++;
    this._campaignSetup();
  }

  _showCampaignBanner(level) {
    const lvl = CAMPAIGN_DEFS[level];
    const banner = $('campaign-banner');
    if (!banner || !lvl) return;
    banner.innerHTML = `<span class="cb-level">第 ${level + 1} 关 · ${lvl.name}</span><span class="cb-intro">${lvl.intro}</span>`;
    banner.classList.remove('hidden');
    clearTimeout(this._bannerTimer);
    this._bannerTimer = setTimeout(() => banner.classList.add('hidden'), 4000);
  }

  // ---- 胜利庆祝烟花 ----
  _spawnFirework() {
    const x = 150 + Math.random() * 800;
    const y = 70 + Math.random() * 150;
    const colors = ['#FFD700', '#E74C3C', '#2ECC71', '#5DADE2', '#F39C12', '#FF6B6B', '#F0D68A'];
    const c = colors[Math.floor(Math.random() * colors.length)];
    this._burst(x, y, c, 26, 40, 130, 'confetti', {
      life: 0.8, lifeR: 0.7, maxLife: 1.5, size: 2, sizeR: 3,
    });
    this.particles.push({ x, y, vx: 0, vy: 0, life: 0.25, maxLife: 0.25, color: '#fff', size: 6, type: 'spark' });
  }

  // ---- Combo 弹出 ----
  _showComboPopup(count, level) {
    const container = document.getElementById('game-container');
    const el = document.createElement('div');
    el.className = 'combo-popup';
    const text = level ? level.text : `x${count}`;
    el.textContent = text;
    el.style.color = level ? level.color : '#FFD700';
    el.style.fontSize = `${level ? level.fontSize : 30}px`;
    if (level && level.threshold >= 12) {
      el.style.textShadow = '0 0 40px rgba(231,76,60,0.8), 0 2px 8px rgba(0,0,0,0.6)';
    }
    if (count >= 5) {
      this._screenShake = Math.max(this._screenShake, count >= 8 ? 8 : 4);
    }
    container.appendChild(el);
    setTimeout(() => el.remove(), 1500);
  }

  // ---- 成就渲染 ----
  _renderAchievements() {
    const names = ['初出茅庐','连击大师','闪电战','铜墙铁壁','火力全开','弹无虚发','诏令之主','全成就'];
    const keys  = ['first_win','combo_8','speed_120','gate_80','all_skills','catapult_5','decree_win','all_done'];
    let html = '';
    for (let i = 0; i < names.length; i++) {
      const unlocked = this.unlockedAchievements[keys[i]];
      html += '<span class="ach-tag' + (unlocked ? ' ach-done' : '') + '">' + (unlocked ? '✓' : '○') + ' ' + names[i] + '</span>';
    }
    achievementsRow.innerHTML = html;
  }

  // ============================================================
  // 渲染
  // ============================================================

  // 一次性生成特效精灵（阴影/火焰/星芒/冲击光）
  _makeFX(kind) {
    const c = document.createElement('canvas');
    const W = 40, H = 40;
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    if (kind === 'shadow') {
      c.width = 32; c.height = 12;
      const grad = g.createRadialGradient(16, 6, 2, 16, 6, 14);
      grad.addColorStop(0, 'rgba(0,0,0,0.35)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.ellipse(16, 6, 14, 4, 0, 0, Math.PI * 2);
      g.fill();
    } else if (kind === 'fire') {
      const grad = g.createRadialGradient(20, 20, 3, 20, 20, 19);
      grad.addColorStop(0, 'rgba(255,255,200,0.95)');
      grad.addColorStop(0.3, 'rgba(255,150,20,0.75)');
      grad.addColorStop(0.7, 'rgba(255,60,0,0.45)');
      grad.addColorStop(1, 'rgba(255,20,0,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(20, 20, 19, 0, Math.PI * 2);
      g.fill();
    } else if (kind === 'star') {
      const grad = g.createRadialGradient(20, 20, 0, 20, 20, 18);
      grad.addColorStop(0, 'rgba(255,255,255,0.95)');
      grad.addColorStop(0.2, 'rgba(255,215,0,0.7)');
      grad.addColorStop(1, 'rgba(255,215,0,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(20, 20, 18, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(20, 20, 4, 0, Math.PI * 2);
      g.fill();
    } else if (kind === 'impact') {
      const grad = g.createRadialGradient(20, 20, 0, 20, 20, 19);
      grad.addColorStop(0, 'rgba(255,255,255,0.95)');
      grad.addColorStop(0.3, 'rgba(255,200,50,0.65)');
      grad.addColorStop(1, 'rgba(255,100,0,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(20, 20, 19, 0, Math.PI * 2);
      g.fill();
    }
    return c;
  }

  _render() {
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    // 屏幕震动
    let shakeX = 0, shakeY = 0;
    if (this._screenShake > 0.1) {
      shakeX = (Math.random() - 0.5) * this._screenShake * 2;
      shakeY = (Math.random() - 0.5) * this._screenShake * 2;
      ctx.save();
      ctx.translate(shakeX, shakeY);
    }

    this._renderBackground();  // 静态背景（离屏缓存，仅场景变化时重绘）
    ctx.drawImage(this._bgCanvas, 0, 0); // 将缓存背景合成到主画布
    this._drawSkyDynamic();    // 动态天空装饰（闪电/星星/热浪/萤火虫）
    this._drawCastleDynamic(); // 城门 HP 条（随血量每帧变化）
    this._drawBirds();

    if (this.state === State.DEPLOYMENT) {
      this._drawDeployZone();
    }

    this._drawTerrain();
    this._drawKillMarks();
    this._drawUnits();
    this._drawChests();
    this._drawEvents();
    this._drawDeathAnimations();
    this._drawParticles();
    this._drawDamageNumbers();

    if (this.state === State.DEPLOYMENT && this.selectedType) {
      this._drawDeployPreview();
    }

    // 连击进度环
    if (this.combo >= 3 && this._comboDecay < 4) {
      const ringX = 100, ringY = 605, ringR = 20;
      const decayPct = this._comboDecay / 5;
      const ringColor = decayPct > 0.8 ? '#E74C3C' : decayPct > 0.6 ? '#F39C12' : '#FFD700';

      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(ringX, ringY, ringR, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = ringColor;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(ringX, ringY, ringR, -Math.PI/2, -Math.PI/2 + Math.PI*2*(1-decayPct));
      ctx.stroke();
    }

    // 城门受击闪光
    if (this._gateFlash > 0) {
      ctx.fillStyle = `rgba(255,200,100,${this._gateFlash * 3})`;
      ctx.beginPath();
      ctx.arc(860, 340, 50, 0, Math.PI * 2);
      ctx.fill();
    }

    if (this._screenShake > 0.1) {
      ctx.restore();
    }

    // 拖拽框选
    if (this._dragSelect) {
      const ds = this._dragSelect;
      const x = Math.min(ds.sx, ds.ex), y = Math.min(ds.sy, ds.ey);
      const w = Math.abs(ds.ex - ds.sx), h = Math.abs(ds.ey - ds.sy);
      ctx.strokeStyle = 'rgba(255,215,0,0.8)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = 'rgba(255,215,0,0.08)';
      ctx.fillRect(x, y, w, h);
      ctx.setLineDash([]);
    }

    // 暂停遮罩
    if (this._paused) {
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.fillStyle = '#F0D68A';
      ctx.font = 'bold 42px "PingFang SC","Microsoft YaHei","Noto Serif SC",serif';
      ctx.textAlign = 'center';
      ctx.fillText('⏸ 已暂停', CANVAS_W / 2, CANVAS_H / 2);
      ctx.font = '16px "PingFang SC",sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillText('按 P 或点顶部 ▶ 继续战斗', CANVAS_W / 2, CANVAS_H / 2 + 36);
    }

    // 战斗中的顶栏信息
    if (this.state === State.BATTLE && this.combo >= 8) {
      // 高连击时顶栏金光闪烁
      comboDisplay.style.color = this.combo >= 10 ? '#FF4500' : '#FFD700';
      comboDisplay.style.fontSize = this.combo >= 10 ? '22px' : '18px';
    }
  }

  // 静态背景层 — 离屏缓存，仅在地图/天气/夜战/懒加载素材变化时重绘
  _renderBackground() {
    // 懒加载 PNG 就绪后使缓存失效一次，避免素材缺失被固化
    let sig = 0;
    for (let i = 0; i < BG_ASSET_KEYS.length; i++) {
      if (Assets.get(BG_ASSET_KEYS[i])) sig |= (1 << i);
    }
    if (sig !== this._bgAssetsSig) {
      this._bgAssetsSig = sig;
      this._bgKey = null;
    }

    const bgKey = this.mapType + '|' + this._weather.type + '|' + (this._nightMode ? 1 : 0);
    if (this._bgKey === bgKey) return;
    this._bgKey = bgKey;

    if (this.mapType === 'forest') this._forestSeed = 12345;
    const savedCtx = ctx;
    ctx = this._bgCtx; // 临时切换全局 ctx 到缓存画布
    try {
      this._drawSkyStatic();
      if (this.mapType === 'forest') this._drawForest();
      else if (this.mapType === 'snow') this._drawSnowfield();
      else this._drawCanyon();
      this._drawCastleStatic();
    } finally {
      ctx = savedCtx;
    }
  }

  _drawSkyStatic() {
    if (this.mapType === 'snow') {
      // 雪原天空 — 灰白阴沉
      const grad = ctx.createLinearGradient(0, 0, 0, 280);
      grad.addColorStop(0, '#B8C6D2');
      grad.addColorStop(0.5, '#CFDAE2');
      grad.addColorStop(1, '#E8EEF2');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, CANVAS_W, 280);
      // 远山雪峰
      ctx.fillStyle = '#A9B7C3';
      ctx.beginPath();
      for (let x = -40; x < 1140; x += 170) {
        const h = 100 + this._rnd() * 55;
        ctx.moveTo(x - 70, 280);
        ctx.lineTo(x, 280 - h);
        ctx.lineTo(x + 70, 280);
      }
      ctx.fill();
      // 雪帽高光
      ctx.fillStyle = '#F2F6F9';
      for (let x = -40; x < 1140; x += 170) {
        const h = 100 + this._rnd() * 55;
        ctx.beginPath();
        ctx.moveTo(x - 18, 280 - h * 0.55);
        ctx.lineTo(x, 280 - h);
        ctx.lineTo(x + 18, 280 - h * 0.55);
        ctx.closePath(); ctx.fill();
      }
      // 云
      this._drawCloudPNG(180, 60, 0.9, 'rgba(255,255,255,0.75)');
      this._drawCloudPNG(620, 42, 1.0, 'rgba(255,255,255,0.75)');
      this._drawCloudPNG(950, 75, 0.7, 'rgba(255,255,255,0.65)');
      return;
    }
    if (this.mapType === 'forest') {
      if (this._nightMode) {
        const grad = ctx.createLinearGradient(0, 0, 0, 280);
        grad.addColorStop(0, '#0A0A1E');
        grad.addColorStop(0.6, '#0F1F0F');
        grad.addColorStop(1, '#1A3A1A');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, CANVAS_W, 280);

        // 树冠剪影
        ctx.fillStyle = '#051005';
        ctx.beginPath();
        for (let x = -30; x < 1150; x += 40 + this._rnd() * 25) {
          const h = 50 + Math.sin(x * 0.05) * 25;
          ctx.moveTo(x, 0);
          ctx.quadraticCurveTo(x + 30, -20, x + 60, h);
          ctx.lineTo(x + 60, 0);
        }
        ctx.fill();

        // 月光透过树叶
        ctx.fillStyle = 'rgba(200,200,180,0.06)';
        ctx.beginPath();
        ctx.arc(200, 60, 55, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(200,200,180,0.1)';
        ctx.beginPath();
        ctx.arc(200, 60, 30, 0, Math.PI * 2);
        ctx.fill();

      } else if (this._weather.type === 'storm') {
        const grad = ctx.createLinearGradient(0, 0, 0, 280);
        grad.addColorStop(0, '#1A2A1A');
        grad.addColorStop(0.5, '#2A3A2A');
        grad.addColorStop(1, '#3A4A3A');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, CANVAS_W, 280);

        // 树冠剪影
        ctx.fillStyle = '#0A1A0A';
        ctx.beginPath();
        for (let x = -30; x < 1150; x += 40 + this._rnd() * 25) {
          const h = 55 + Math.sin(x * 0.04) * 20;
          ctx.moveTo(x, 0);
          ctx.quadraticCurveTo(x + 30, -15, x + 60, h);
          ctx.lineTo(x + 60, 0);
        }
        ctx.fill();
        this._drawCloudPNG(300, 60, 0.6, 'rgba(150,160,140,0.3)');
        this._drawCloudPNG(700, 50, 0.7, 'rgba(150,160,140,0.3)');

      } else if (this._weather.type === 'rain') {
        const grad = ctx.createLinearGradient(0, 0, 0, 280);
        grad.addColorStop(0, '#4A6A4A');
        grad.addColorStop(0.5, '#5A7A5A');
        grad.addColorStop(1, '#6A8A6A');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, CANVAS_W, 280);

        ctx.fillStyle = '#2A4A2A';
        ctx.beginPath();
        for (let x = -30; x < 1150; x += 40 + this._rnd() * 25) {
          const h = 50 + Math.sin(x * 0.05) * 20;
          ctx.moveTo(x, 0);
          ctx.quadraticCurveTo(x + 30, -15, x + 60, h);
          ctx.lineTo(x + 60, 0);
        }
        ctx.fill();
        this._drawCloudPNG(300, 60, 0.7, 'rgba(160,180,160,0.4)');
        this._drawCloudPNG(700, 50, 0.8, 'rgba(160,180,160,0.4)');
      } else {
        // 晴朗森林天空 — 透过树冠的阳光
        const grad = ctx.createLinearGradient(0, 0, 0, 280);
        grad.addColorStop(0, '#4A8F3F');
        grad.addColorStop(0.3, '#5DA04F');
        grad.addColorStop(0.7, '#7AB86A');
        grad.addColorStop(1, '#A8D88A');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, CANVAS_W, 280);

        // 树冠剪影（顶部）
        ctx.fillStyle = '#2D5A1E';
        ctx.beginPath();
        for (let x = -40; x < 1150; x += 35 + this._rnd() * 30) {
          const h = 45 + Math.sin(x * 0.04) * 25;
          ctx.moveTo(x, 0);
          ctx.quadraticCurveTo(x + 25, -15, x + 55, h);
          ctx.lineTo(x + 55, 0);
        }
        ctx.fill();

        // 阳光透过树叶的光束
        ctx.fillStyle = 'rgba(255,255,200,0.07)';
        for (let i = 0; i < 6; i++) {
          const bx = 100 + i * 170;
          ctx.beginPath();
          ctx.moveTo(bx, 0);
          ctx.lineTo(bx - 20 + this._rnd() * 40, 280);
          ctx.lineTo(bx + 30 + this._rnd() * 20, 280);
          ctx.lineTo(bx + 15, 0);
          ctx.fill();
        }

        // 光斑
        ctx.fillStyle = 'rgba(255,255,220,0.12)';
        for (let i = 0; i < 8; i++) {
          const sx = 80 + i * 130;
          const sy = 100 + Math.sin(i * 1.5) * 80;
          ctx.beginPath();
          ctx.ellipse(sx, sy, 25 + this._rnd() * 20, 10 + this._rnd() * 8, 0, 0, Math.PI * 2);
          ctx.fill();
        }

        this._drawCloudPNG(250, 50, 0.5, 'rgba(255,255,255,0.2)');
        this._drawCloudPNG(700, 40, 0.6, 'rgba(255,255,255,0.2)');
      }
      return;
    }

    if (this._nightMode) {
      const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
      grad.addColorStop(0, '#08081E');
      grad.addColorStop(0.25, '#0E0E30');
      grad.addColorStop(0.5, '#151540');
      grad.addColorStop(0.75, '#1C1C4A');
      grad.addColorStop(1, '#252550');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      // 月亮 — PNG 纹理 (Kenney Background Elements, 85x85)
      const moonPNG = Assets.get('png_moon');
      if (moonPNG) {
        // 外层光晕
        ctx.fillStyle = 'rgba(245,245,220,0.08)';
        ctx.beginPath(); ctx.arc(150, 80, 65, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(245,245,220,0.15)';
        ctx.beginPath(); ctx.arc(150, 80, 45, 0, Math.PI * 2); ctx.fill();
        // PNG 月亮本体 (85x85 -> 42x42)
        ctx.drawImage(moonPNG, 150 - 21, 80 - 21, 42, 42);
      } else {
        // 后备程序化月亮
        ctx.fillStyle = 'rgba(245,245,220,0.08)';
        ctx.beginPath(); ctx.arc(150, 80, 70, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(245,245,220,0.15)';
        ctx.beginPath(); ctx.arc(150, 80, 50, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#F5F5DC';
        ctx.beginPath(); ctx.arc(150, 80, 35, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#08081E';
        ctx.beginPath(); ctx.arc(162, 74, 30, 0, Math.PI * 2); ctx.fill();
      }

      // 夜空云雾 — PNG 纹理
      this._drawCloudPNG(300, 60, 0.7, 'rgba(200,200,220,0.15)');
      this._drawCloudPNG(650, 45, 0.8, 'rgba(200,200,220,0.15)');
      this._drawCloudPNG(880, 70, 0.5, 'rgba(200,200,220,0.15)');

    } else if (this._weather.type === 'storm') {
      const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
      grad.addColorStop(0, '#1A1A2E');
      grad.addColorStop(0.3, '#252540');
      grad.addColorStop(0.6, '#303050');
      grad.addColorStop(1, '#3A3A5A');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      this._drawCloudPNG(300, 60, 0.7, 'rgba(180,180,200,0.4)');
      this._drawCloudPNG(650, 45, 0.8, 'rgba(180,180,200,0.4)');
      this._drawCloudPNG(880, 70, 0.5, 'rgba(180,180,200,0.4)');
    } else if (this._weather.type === 'rain') {
      const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
      grad.addColorStop(0, '#7A8B9A');
      grad.addColorStop(0.5, '#9AABBA');
      grad.addColorStop(1, '#BACADA');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      this._drawCloudPNG(300, 60, 0.7, 'rgba(200,200,210,0.5)');
      this._drawCloudPNG(650, 45, 0.9, 'rgba(200,200,210,0.5)');
      this._drawCloudPNG(880, 70, 0.6, 'rgba(200,200,210,0.5)');

    } else {
      // 多层天空渐变（更深的天空）
      const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
      grad.addColorStop(0, '#5BA0D0');
      grad.addColorStop(0.15, '#7DB8E0');
      grad.addColorStop(0.35, '#A8D4F0');
      grad.addColorStop(0.6, '#C8E4F8');
      grad.addColorStop(0.8, '#D8ECFA');
      grad.addColorStop(1, '#E8F0F8');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      // 太阳 — PNG 纹理 (Kenney Background Elements, 87x86)
      const sunX = 150, sunY = 70;
      const sunPNG = Assets.get('png_sun');
      if (sunPNG) {
        // 外层光晕（程序化增强）
        ctx.fillStyle = 'rgba(255,255,220,0.12)';
        ctx.beginPath(); ctx.arc(sunX, sunY, 70, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,200,0.2)';
        ctx.beginPath(); ctx.arc(sunX, sunY, 50, 0, Math.PI * 2); ctx.fill();
        // PNG 太阳本体 (87x86 -> 54x54)
        ctx.drawImage(sunPNG, sunX - 27, sunY - 27, 54, 54);
      } else {
        // 后备程序化太阳
        ctx.fillStyle = 'rgba(255,255,220,0.15)';
        ctx.beginPath(); ctx.arc(sunX, sunY, 90, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,200,0.25)';
        ctx.beginPath(); ctx.arc(sunX, sunY, 65, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,250,180,0.5)';
        ctx.beginPath(); ctx.arc(sunX, sunY, 48, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#FFF8DC';
        ctx.beginPath(); ctx.arc(sunX, sunY, 38, 0, Math.PI * 2); ctx.fill();
        // 太阳光芒射线
        ctx.save(); ctx.globalAlpha = 0.06;
        for (let i = 0; i < 12; i++) {
          const angle = (i / 12) * Math.PI * 2 + this.battleElapsed * 0.02;
          const rayLen = 70 + (i % 3) * 30;
          ctx.fillStyle = '#FFF8DC'; ctx.beginPath();
          ctx.moveTo(sunX + Math.cos(angle - 0.04) * 38, sunY + Math.sin(angle - 0.04) * 38);
          ctx.lineTo(sunX + Math.cos(angle) * rayLen, sunY + Math.sin(angle) * rayLen);
          ctx.lineTo(sunX + Math.cos(angle + 0.04) * 38, sunY + Math.sin(angle + 0.04) * 38);
          ctx.closePath(); ctx.fill();
        }
        ctx.restore();
      }

      // 云朵 — PNG 纹理
      this._drawCloudPNG(300, 60, 0.8);
      this._drawCloudPNG(650, 45, 1.0);
      this._drawCloudPNG(880, 70, 0.6);

      // 远山 — PNG 纹理 (Kenney Background Elements, 1001x128)
      const hillsPNG = Assets.get('png_hills1');
      if (hillsPNG) {
        ctx.save();
        ctx.globalAlpha = 0.35;
        ctx.drawImage(hillsPNG, 0, 225, CANVAS_W, 55);
        ctx.restore();
      }

    }
  }

  // 动态天空装饰（每帧叠加在缓存背景之上）
  _drawSkyDynamic() {
    // 雷暴闪白
    if (this._lightningFlash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${this._lightningFlash * 0.3})`;
      ctx.fillRect(0, 0, 1100, 550);
    }

    // 雷击预警红圈（0.9 秒倒计时）
    if (this._lightningStrike) {
      const s = this._lightningStrike;
      const pulse = 1 + Math.sin(Date.now() / 120) * 0.15;
      const alpha = Math.max(0.25, s.warn / 0.9);
      ctx.strokeStyle = `rgba(255,60,40,${alpha})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 44 * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = `rgba(255,60,40,${alpha * 0.15})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 44 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(255,220,80,${alpha})`;
      ctx.font = 'bold 18px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('⚡', s.x, s.y - 34);
    }

    if (this.mapType === 'forest') {
      // 森林夜战萤火虫
      if (this._nightMode) {
        ctx.fillStyle = 'rgba(255,255,150,0.5)';
        for (let i = 0; i < 12; i++) {
          const fx = 50 + i * 90 + Math.sin(Date.now() / 2000 + i) * 30;
          const fy = 40 + Math.cos(Date.now() / 3000 + i) * 30;
          ctx.beginPath();
          ctx.arc(fx, fy, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (this._weather.type === 'storm') {
        // 森林闪电（动态）
        if (Math.random() < 0.15) {
          ctx.strokeStyle = 'rgba(255,255,200,0.7)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          const lx = 300 + Math.random() * 500;
          ctx.moveTo(lx, 0);
          ctx.lineTo(lx - 20 + Math.random() * 40, 60);
          ctx.lineTo(lx + 10 + Math.random() * 20, 130);
          ctx.lineTo(lx - 30 + Math.random() * 60, 200);
          ctx.lineTo(lx + 15 + Math.random() * 25, 280);
          ctx.stroke();
        }
      }
      return;
    }

    if (this._nightMode) {
      // 闪烁星星
      const starPositions = [[200,40],[400,70],[550,30],[750,55],[900,35],[1000,60],[350,90],[680,80],[820,50],[120,100]];
      for (let i = 0; i < starPositions.length; i++) {
        const [sx, sy] = starPositions[i];
        const twinkle = 0.5 + Math.sin(this.battleElapsed * 3 + i) * 0.5;
        ctx.fillStyle = `rgba(255,215,0,${0.5 + twinkle * 0.5})`;
        ctx.beginPath();
        ctx.arc(sx, sy, 0.8 + twinkle * 0.6, 0, Math.PI * 2);
        ctx.fill();
        // Star cross twinkle
        if (twinkle > 0.8) {
          ctx.strokeStyle = `rgba(255,215,0,${(twinkle - 0.8) * 2})`;
          ctx.lineWidth = 0.3;
          ctx.beginPath();
          ctx.moveTo(sx - 3, sy);
          ctx.lineTo(sx + 3, sy);
          ctx.moveTo(sx, sy - 3);
          ctx.lineTo(sx, sy + 3);
          ctx.stroke();
        }
      }
    } else if (this._weather.type === 'storm') {
      // 峡谷闪电（多层 + 光晕，动态）
      if (Math.random() < 0.12) {
        const lx = 400 + Math.random() * 300;
        // 外层光晕
        ctx.strokeStyle = 'rgba(255,255,220,0.25)';
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.moveTo(lx, 0);
        ctx.lineTo(lx - 18 + Math.random() * 36, 80);
        ctx.lineTo(lx + 8 + Math.random() * 16, 160);
        ctx.lineTo(lx - 25 + Math.random() * 50, 240);
        ctx.stroke();
        // 中层
        ctx.strokeStyle = 'rgba(255,255,240,0.5)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(lx, 0);
        ctx.lineTo(lx - 20 + Math.random() * 40, 80);
        ctx.lineTo(lx + 10 + Math.random() * 20, 160);
        ctx.lineTo(lx - 30 + Math.random() * 60, 240);
        ctx.stroke();
        // 核心白线
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(lx, 0);
        ctx.lineTo(lx - 18 + Math.random() * 36, 80);
        ctx.lineTo(lx + 6 + Math.random() * 12, 160);
        ctx.lineTo(lx - 28 + Math.random() * 56, 240);
        ctx.stroke();
        // 分支
        ctx.strokeStyle = 'rgba(255,255,200,0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(lx - 18 + Math.random() * 36, 80);
        ctx.lineTo(lx - 35 + Math.random() * 30, 130);
        ctx.stroke();
      }
    } else if (this._weather.type === 'clear' && this.state === State.BATTLE) {
      // 热浪波纹 + 光柱（晴天战斗）
      for (let i = 0; i < 3; i++) {
        const wx = 100 + i * 350 + Math.sin(this.battleElapsed * 1.5 + i) * 40;
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let j = 0; j < 100; j++) {
          const wy = 250 + j * 2;
          const offset = Math.sin(wx * 0.1 + j * 0.3 + this.battleElapsed * 2) * 3;
          if (j === 0) ctx.moveTo(wx + offset, wy);
          else ctx.lineTo(wx + offset, wy);
        }
        ctx.stroke();
      }
      // God rays
      for (let i = 0; i < 5; i++) {
        const rayX = 300 + i * 150;
        const rayAngle = -0.3 + i * 0.1;
        ctx.save();
        ctx.globalAlpha = 0.03;
        const rayGrad = ctx.createLinearGradient(rayX, 60, rayX + Math.cos(rayAngle) * 400, 60 + Math.sin(rayAngle) * 400);
        rayGrad.addColorStop(0, 'rgba(255,240,200,0.4)');
        rayGrad.addColorStop(1, 'rgba(255,240,200,0)');
        ctx.fillStyle = rayGrad;
        ctx.beginPath();
        ctx.moveTo(rayX - 5, 50);
        ctx.lineTo(rayX + 5, 50);
        ctx.lineTo(rayX + Math.cos(rayAngle + 0.05) * 400, 400);
        ctx.lineTo(rayX + Math.cos(rayAngle - 0.05) * 400, 400);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    } else if (this._weather.type === 'rain' && this.state === State.BATTLE) {
      // 地面积水反光（雨天战斗）
      const waterGrad = ctx.createLinearGradient(0, 280, 0, 550);
      waterGrad.addColorStop(0, 'rgba(100,150,200,0.03)');
      waterGrad.addColorStop(1, 'rgba(100,150,200,0.06)');
      ctx.fillStyle = waterGrad;
      ctx.fillRect(0, 280, 1100, 270);
    }
  }

  _drawCloud(x, y, scale, color) {
    ctx.fillStyle = color || 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(x, y, 22 * scale, 0, Math.PI * 2);
    ctx.arc(x + 25 * scale, y - 8 * scale, 18 * scale, 0, Math.PI * 2);
    ctx.arc(x + 48 * scale, y, 22 * scale, 0, Math.PI * 2);
    ctx.arc(x + 20 * scale, y + 5 * scale, 16 * scale, 0, Math.PI * 2);
    ctx.fill();
  }

  // 使用下载的 PNG 云朵纹理绘制云（带程序化回退）
  _drawCloudPNG(x, y, scale, color) {
    // 基于 x,y 选择固定云朵变体
    const idx = Math.floor((x * 7 + y * 13) % CLOUD_KEYS.length);
    const cloudPNG = Assets.get(CLOUD_KEYS[idx]);
    if (cloudPNG) {
      ctx.save();
      if (color) {
        // 从 rgba() 字符串提取 alpha 值
        if (!CLOUD_ALPHA_CACHE[color]) {
          const m = color.match(/([\d.]+)\)\s*$/);
          CLOUD_ALPHA_CACHE[color] = m ? parseFloat(m[1]) : 0.9;
        }
        ctx.globalAlpha = CLOUD_ALPHA_CACHE[color];
      }
      const w = cloudPNG.width * scale * 0.7;
      const h = cloudPNG.height * scale * 0.7;
      ctx.drawImage(cloudPNG, x - w / 2, y - h / 2, w, h);
      ctx.restore();
    } else {
      // 回退到程序化云朵
      this._drawCloud(x, y, scale, color);
    }
  }

  _drawCanyon() {
    // 左侧岩壁
    const leftGrad = ctx.createLinearGradient(0, 0, 220, 0);
    leftGrad.addColorStop(0, '#5D4037');
    leftGrad.addColorStop(0.3, '#6D4C41');
    leftGrad.addColorStop(0.7, '#8D6E63');
    leftGrad.addColorStop(1, '#A1887F');
    ctx.fillStyle = leftGrad;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(80, 0);
    ctx.lineTo(120, 60);
    ctx.lineTo(90, 140);
    ctx.lineTo(130, 200);
    ctx.lineTo(80, 280);
    ctx.lineTo(0, 280);
    ctx.closePath();
    ctx.fill();

    // 左侧岩壁纹理
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      const lx = 20 + Math.random() * 70;
      const ly = 30 + i * 30;
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.lineTo(lx + 40, ly + 15);
      ctx.stroke();
    }

    // 右侧岩壁
    const rightGrad = ctx.createLinearGradient(880, 0, 1100, 0);
    rightGrad.addColorStop(0, '#A1887F');
    rightGrad.addColorStop(0.3, '#8D6E63');
    rightGrad.addColorStop(0.7, '#6D4C41');
    rightGrad.addColorStop(1, '#5D4037');
    ctx.fillStyle = rightGrad;
    ctx.beginPath();
    ctx.moveTo(1100, 0);
    ctx.lineTo(1020, 0);
    ctx.lineTo(980, 50);
    ctx.lineTo(1010, 130);
    ctx.lineTo(960, 210);
    ctx.lineTo(1000, 280);
    ctx.lineTo(1100, 280);
    ctx.closePath();
    ctx.fill();

    // 地面 — 草地（使用纹理 + 渐变叠加）
    const gTex = Assets.get('texture_grass');
    if (gTex) {
      ctx.fillStyle = ctx.createPattern(gTex, 'repeat');
    } else {
      ctx.fillStyle = '#52BE80';
    }
    ctx.fillRect(0, 280, CANVAS_W, CANVAS_H - 280);
    // 渐变叠加增加深度
    const groundGrad = ctx.createLinearGradient(0, 280, 0, CANVAS_H);
    groundGrad.addColorStop(0, 'rgba(125,206,160,0.4)');
    groundGrad.addColorStop(0.3, 'rgba(82,190,128,0.15)');
    groundGrad.addColorStop(1, 'rgba(30,132,73,0.4)');
    ctx.fillStyle = groundGrad;
    ctx.fillRect(0, 280, CANVAS_W, CANVAS_H - 280);

    // 草地纹理
    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 30; i++) {
      const gx = 50 + i * 35;
      const gy = 285 + Math.random() * 250;
      ctx.beginPath();
      ctx.moveTo(gx, gy);
      ctx.lineTo(gx + 5, gy - 12);
      ctx.stroke();
    }

    // 道路（中间土路）
    ctx.fillStyle = 'rgba(139,119,90,0.35)';
    ctx.beginPath();
    ctx.moveTo(0, 400);
    ctx.quadraticCurveTo(550, 370, 860, 390);
    ctx.lineTo(860, 430);
    ctx.quadraticCurveTo(550, 410, 0, 440);
    ctx.closePath();
    ctx.fill();
  }

  _drawForest() {
    // 远景树林（天空与地面交界处的树冠轮廓）
    ctx.fillStyle = '#1B5E20';
    ctx.beginPath();
    // 左侧远景树冠
    for (let x = -20; x < 400; x += 50 + this._rnd() * 30) {
      const h = 60 + Math.sin(x * 0.05) * 30;
      ctx.moveTo(x, 280);
      ctx.quadraticCurveTo(x + 35, 280 - h, x + 70, 280);
    }
    ctx.fill();

    // 右侧远景树冠
    ctx.fillStyle = '#1B5E20';
    ctx.beginPath();
    for (let x = 600; x < 1140; x += 50 + this._rnd() * 30) {
      const h = 60 + Math.sin(x * 0.04) * 25;
      ctx.moveTo(x, 280);
      ctx.quadraticCurveTo(x + 35, 280 - h, x + 70, 280);
    }
    ctx.fill();

    // 森林地面 — 深色泥土（纹理 + 渐变）
    const gndTex = Assets.get('texture_ground');
    if (gndTex) {
      ctx.fillStyle = ctx.createPattern(gndTex, 'repeat');
    } else {
      ctx.fillStyle = '#4A7A2E';
    }
    ctx.fillRect(0, 280, CANVAS_W, CANVAS_H - 280);
    const groundGrad = ctx.createLinearGradient(0, 280, 0, CANVAS_H);
    groundGrad.addColorStop(0, 'rgba(93,138,60,0.35)');
    groundGrad.addColorStop(0.15, 'rgba(74,122,46,0.2)');
    groundGrad.addColorStop(0.5, 'rgba(61,90,46,0.15)');
    groundGrad.addColorStop(1, 'rgba(46,61,30,0.5)');
    ctx.fillStyle = groundGrad;
    ctx.fillRect(0, 280, CANVAS_W, CANVAS_H - 280);

    // 地面落叶纹理
    ctx.fillStyle = 'rgba(139,119,45,0.15)';
    for (let i = 0; i < 50; i++) {
      const lx = 20 + this._rnd() * 1060;
      const ly = 285 + this._rnd() * 255;
      ctx.beginPath();
      ctx.arc(lx, ly, 1.5 + this._rnd() * 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // 斑驳光点（透过树冠的阳光）
    ctx.fillStyle = 'rgba(255,255,200,0.06)';
    for (let i = 0; i < 20; i++) {
      const sx = 40 + this._rnd() * 1020;
      const sy = 285 + this._rnd() * 250;
      ctx.beginPath();
      ctx.ellipse(sx, sy, 15 + this._rnd() * 25, 8 + this._rnd() * 12, this._rnd() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }

    // 粗大树根/倒木（不可通行暗示）
    ctx.strokeStyle = 'rgba(101,67,33,0.4)';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    const logs = [[120, 420, 60], [750, 380, -40], [400, 480, 30], [950, 440, -20]];
    for (const [lx, ly, len] of logs) {
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.lineTo(lx + len, ly + 8);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(101,67,33,0.25)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(lx, ly + 4);
      ctx.lineTo(lx + len * 0.3 + 5, ly - 4);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(101,67,33,0.4)';
      ctx.lineWidth = 4;
    }

    // 林间小路
    ctx.fillStyle = 'rgba(139,100,70,0.3)';
    ctx.beginPath();
    ctx.moveTo(0, 390);
    ctx.quadraticCurveTo(300, 350, 550, 370);
    ctx.quadraticCurveTo(700, 380, 860, 400);
    ctx.lineTo(860, 430);
    ctx.quadraticCurveTo(700, 410, 550, 400);
    ctx.quadraticCurveTo(300, 380, 0, 420);
    ctx.closePath();
    ctx.fill();

    // 小路车辙
    ctx.strokeStyle = 'rgba(100,70,40,0.2)';
    ctx.lineWidth = 1.5;
    for (let wx = 50; wx < 850; wx += 80 + this._rnd() * 40) {
      const wy = 370 + Math.sin(wx * 0.008) * 25;
      ctx.beginPath();
      ctx.moveTo(wx - 8, wy);
      ctx.quadraticCurveTo(wx, wy + 8, wx + 80, wy + Math.sin((wx + 80) * 0.008) * 25);
      ctx.stroke();
    }

    // 背景树干（左侧）
    ctx.fillStyle = '#4E342E';
    for (let i = 0; i < 5; i++) {
      const tx = 10 + i * 65;
      const th = 80 + Math.sin(tx) * 30;
      ctx.fillRect(tx - 8, 280 - th + 30, 16, th);
      // 树冠
      ctx.fillStyle = '#2E5A1E';
      ctx.beginPath();
      ctx.arc(tx, 280 - th + 25, 30 + this._rnd() * 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#4E342E';
    }

    // 背景树干（右侧）
    ctx.fillStyle = '#4E342E';
    for (let i = 0; i < 6; i++) {
      const tx = 950 + i * 35;
      const th = 70 + Math.sin(tx) * 25;
      ctx.fillRect(tx - 7, 280 - th + 25, 14, th);
      ctx.fillStyle = '#2E5A1E';
      ctx.beginPath();
      ctx.arc(tx, 280 - th + 20, 25 + this._rnd() * 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#4E342E';
    }
  }

  _roundRectPath(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // 雪原背景 — 皑皑白雪 + 松林 + 雪路
  _drawSnowfield() {
    // 远景松林剪影
    ctx.fillStyle = '#7C8B99';
    ctx.beginPath();
    for (let x = -20; x < 1140; x += 46 + this._rnd() * 26) {
      const h = 55 + Math.sin(x * 0.05) * 22;
      ctx.moveTo(x, 280);
      ctx.lineTo(x + 14, 280 - h);
      ctx.lineTo(x + 28, 280);
    }
    ctx.fill();

    // 雪地地面（纹理 + 渐变）
    ctx.fillStyle = '#EEF2F5';
    ctx.fillRect(0, 280, CANVAS_W, CANVAS_H - 280);
    const snowGrad = ctx.createLinearGradient(0, 280, 0, CANVAS_H);
    snowGrad.addColorStop(0, 'rgba(255,255,255,0.75)');
    snowGrad.addColorStop(0.4, 'rgba(235,240,245,0.5)');
    snowGrad.addColorStop(1, 'rgba(180,200,215,0.55)');
    ctx.fillStyle = snowGrad;
    ctx.fillRect(0, 280, CANVAS_W, CANVAS_H - 280);

    // 雪面微光点
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    for (let i = 0; i < 60; i++) {
      const sx = 10 + this._rnd() * 1080;
      const sy = 285 + this._rnd() * 250;
      ctx.beginPath();
      ctx.arc(sx, sy, 1 + this._rnd() * 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // 远处松树（雪挂）
    for (let i = 0; i < 7; i++) {
      const tx = 30 + i * 155;
      const th = 85 + Math.sin(tx * 0.3) * 22;
      // 树干
      ctx.fillStyle = '#5D4A38';
      ctx.fillRect(tx - 5, 280 - th * 0.35, 10, th * 0.35);
      // 三层雪松冠
      ctx.fillStyle = '#4A6B52';
      for (let l = 0; l < 3; l++) {
        const ly = 280 - th * (0.15 + l * 0.28);
        const lw = 26 - l * 6;
        ctx.beginPath();
        ctx.moveTo(tx - lw, ly);
        ctx.lineTo(tx, ly - th * 0.42);
        ctx.lineTo(tx + lw, ly);
        ctx.closePath();
        ctx.fill();
      }
      // 雪帽
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.moveTo(tx - 14, 280 - th * 0.72);
      ctx.lineTo(tx, 280 - th * 0.95);
      ctx.lineTo(tx + 14, 280 - th * 0.72);
      ctx.closePath();
      ctx.fill();
    }

    // 道路（被雪覆盖的土路）
    ctx.fillStyle = 'rgba(150,165,175,0.5)';
    ctx.beginPath();
    ctx.moveTo(0, 400);
    ctx.quadraticCurveTo(550, 370, 860, 390);
    ctx.lineTo(860, 430);
    ctx.quadraticCurveTo(550, 410, 0, 440);
    ctx.closePath();
    ctx.fill();
    // 路上的雪痕
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      const px = 60 + i * 130;
      ctx.beginPath();
      ctx.moveTo(px, 400 + Math.sin(px * 0.02) * 8);
      ctx.lineTo(px + 40, 400 + Math.sin(px * 0.02) * 8 + 6);
      ctx.stroke();
    }

    // 雪堆（近景）
    ctx.fillStyle = 'rgba(230,238,244,0.8)';
    for (let i = 0; i < 8; i++) {
      const sx = 40 + this._rnd() * 1020;
      const sy = 300 + this._rnd() * 180;
      ctx.beginPath();
      ctx.ellipse(sx, sy, 22 + this._rnd() * 18, 7 + this._rnd() * 5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawCastleStatic() {
    const cx = 860, cy = 270;

    // 城堡主体 — 使用石砖纹理
    const stTex = Assets.get('texture_stone');
    if (stTex) {
      const pattern = ctx.createPattern(stTex, 'repeat');
      ctx.fillStyle = pattern;
    } else {
      const wallGrad = ctx.createLinearGradient(cx - 100, 0, cx + 140, 0);
      wallGrad.addColorStop(0, '#95A5A6');
      wallGrad.addColorStop(0.5, '#BDC3C7');
      wallGrad.addColorStop(1, '#7F8C8D');
      ctx.fillStyle = wallGrad;
    }
    ctx.fillRect(cx - 80, cy - 120, 200, 140);

    // 阴影渐变叠加（增加深度）
    const shadowGrad = ctx.createLinearGradient(cx - 80, 0, cx + 120, 0);
    shadowGrad.addColorStop(0, 'rgba(0,0,0,0.3)');
    shadowGrad.addColorStop(0.5, 'rgba(0,0,0,0.05)');
    shadowGrad.addColorStop(1, 'rgba(0,0,0,0.25)');
    ctx.fillStyle = shadowGrad;
    ctx.fillRect(cx - 80, cy - 120, 200, 140);

    // 森林地图：藤蔓装饰
    if (this.mapType === 'forest') {
      ctx.strokeStyle = '#3D6B2E';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      [
        [cx - 75, cy - 100], [cx - 30, cy - 90], [cx + 20, cy - 80],
        [cx + 60, cy - 70],
      ].forEach(([vx, vy]) => {
        ctx.beginPath();
        ctx.moveTo(vx, vy);
        ctx.quadraticCurveTo(vx + 8, vy + 25, vx - 5, vy + 50);
        ctx.stroke();
      });
      // 藤蔓叶子
      ctx.fillStyle = '#4CAF50';
      [
        [cx - 70, cy - 85], [cx - 25, cy - 75], [cx + 25, cy - 65], [cx + 65, cy - 55],
        [cx - 80, cy - 70], [cx - 35, cy - 60], [cx + 15, cy - 50],
      ].forEach(([lx, ly]) => {
        ctx.beginPath();
        ctx.arc(lx, ly, 5, 0, Math.PI * 2);
        ctx.fill();
      });
      // 苔藓
      ctx.fillStyle = 'rgba(100,160,80,0.35)';
      ctx.fillRect(cx - 80, cy + 10, 200, 10);
      ctx.fillStyle = 'rgba(100,160,80,0.25)';
      ctx.fillRect(cx - 60, cy + 5, 40, 7);
      ctx.fillRect(cx + 30, cy - 5, 35, 6);
    }

    // 城垛 — 带阴影
    for (let i = 0; i < 5; i++) {
      const bx = cx - 75 + i * 40;
      const btmGrad = ctx.createLinearGradient(0, cy - 135, 0, cy - 115);
      btmGrad.addColorStop(0, '#A0A8AA');
      btmGrad.addColorStop(0.4, '#90989A');
      btmGrad.addColorStop(1, '#70787A');
      ctx.fillStyle = btmGrad;
      ctx.fillRect(bx, cy - 135, 20, 22);
      // Crenel gap shadow
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.fillRect(bx, cy - 135, 20, 4);
    }

    // 城门
    const gateX = cx - 30, gateY = cy - 30, gateW = 60, gateH = 60, gateR = 8;
    const wTex = Assets.get('texture_wood');
    if (wTex) {
      const wPattern = ctx.createPattern(wTex, 'repeat');
      ctx.fillStyle = wPattern;
    } else {
      const gateGrad = ctx.createLinearGradient(0, gateY, 0, gateY + gateH);
      gateGrad.addColorStop(0, '#8B4513');
      gateGrad.addColorStop(1, '#5D2E0C');
      ctx.fillStyle = gateGrad;
    }
    ctx.beginPath();
    ctx.moveTo(gateX + gateR, gateY);
    ctx.lineTo(gateX + gateW - gateR, gateY);
    ctx.quadraticCurveTo(gateX + gateW, gateY, gateX + gateW, gateY + gateR);
    ctx.lineTo(gateX + gateW, gateY + gateH - gateR);
    ctx.quadraticCurveTo(gateX + gateW, gateY + gateH, gateX + gateW - gateR, gateY + gateH);
    ctx.lineTo(gateX + gateR, gateY + gateH);
    ctx.quadraticCurveTo(gateX, gateY + gateH, gateX, gateY + gateH - gateR);
    ctx.lineTo(gateX, gateY + gateR);
    ctx.quadraticCurveTo(gateX, gateY, gateX + gateR, gateY);
    ctx.closePath();
    ctx.fill();
    // Gate border
    ctx.strokeStyle = '#4A2A0A';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 城门拱形
    const archGrad = ctx.createLinearGradient(0, gateY - 30, 0, gateY);
    archGrad.addColorStop(0, '#B06030');
    archGrad.addColorStop(0.5, '#9A5020');
    archGrad.addColorStop(1, '#6B3010');
    ctx.fillStyle = archGrad;
    ctx.beginPath();
    ctx.arc(cx, gateY, 30, Math.PI, 0);
    ctx.fill();
    ctx.strokeStyle = '#4A2A0A';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 城门铆钉
    ctx.fillStyle = '#FFD700';
    [
      [gateX + 14, gateY + 14], [gateX + 40, gateY + 14],
      [gateX + 14, gateY + 34], [gateX + 40, gateY + 34],
    ].forEach(([rx, ry]) => {
      ctx.beginPath();
      ctx.arc(rx, ry, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FFF';
      ctx.beginPath();
      ctx.arc(rx - 0.8, ry - 1, 1.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FFD700';
    });

    // 旗帜 — 使用精灵图
    const flagKey = this.playerSide === 'han' ? 'sprite_flag_han' : 'sprite_flag_jin';
    const flagSprite = Assets.get(flagKey);
    if (flagSprite) {
      ctx.drawImage(flagSprite, cx - 24, cy - 155, 48, 60);
    } else {
      // Fallback
      ctx.fillStyle = '#8B0000';
      ctx.beginPath();
      ctx.moveTo(cx, cy - 145);
      ctx.lineTo(cx + 30, cy - 130);
      ctx.lineTo(cx, cy - 115);
      ctx.fill();
      ctx.strokeStyle = '#5D2E0C';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy - 155);
      ctx.lineTo(cx, cy - 115);
      ctx.stroke();
      ctx.fillStyle = '#FFD700';
      ctx.font = '14px "Noto Serif SC",serif';
      ctx.textAlign = 'center';
      ctx.fillText('金', cx + 14, cy - 118);
    }
  }

  // 城门 HP 条（随血量每帧绘制，不进入背景缓存）
  _drawCastleDynamic() {
    if (this.state !== State.BATTLE) return;
    const cx = 860, cy = 270;
    const hpPct = this.gateHP / GATE_MAX_HP;
    const barW = 100, barH = 10, barX = cx - 50, barY = cy - 50;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    this._roundRectPath(barX - 2, barY - 2, barW + 4, barH + 4, 3);
    ctx.fill();
    const hpGrad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
    const hpColor1 = hpPct > 0.5 ? '#2ECC71' : hpPct > 0.25 ? '#F39C12' : '#E74C3C';
    const hpColor2 = hpPct > 0.5 ? '#27AE60' : hpPct > 0.25 ? '#E67E22' : '#C0392B';
    hpGrad.addColorStop(0, hpColor1);
    hpGrad.addColorStop(1, hpColor2);
    ctx.fillStyle = hpGrad;
    this._roundRectPath(barX, barY, barW * Math.max(0.02, hpPct), barH, 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px "Noto Sans SC","PingFang SC",sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`城门 ${Math.ceil(this.gateHP)}/${GATE_MAX_HP}`, cx, barY - 4);
  }

  _drawDeployZone() {
    const pulse = 0.7 + Math.sin(this.battleElapsed * 2) * 0.3;
    if (this.playerSide === 'han') {
      // 填充
      const fillGrad = ctx.createLinearGradient(0, 280, 0, 480);
      fillGrad.addColorStop(0, `rgba(192,57,43,${0.08 * pulse})`);
      fillGrad.addColorStop(1, `rgba(192,57,43,${0.04 * pulse})`);
      ctx.fillStyle = fillGrad;
      ctx.fillRect(60, 280, 420, 200);
      // 虚线边框
      ctx.strokeStyle = `rgba(231,76,60,${0.35 * pulse})`;
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 5]);
      ctx.strokeRect(60, 280, 420, 200);
      ctx.setLineDash([]);
      // 角落标记
      ctx.strokeStyle = 'rgba(231,76,60,0.6)';
      ctx.lineWidth = 2.5;
      [[60,280],[480,280],[60,480],[480,480]].forEach(([cx, cy]) => {
        const sx = cx === 60 ? 1 : -1, sy = cy === 280 ? 1 : -1;
        ctx.beginPath();
        ctx.moveTo(cx + 12 * sx, cy);
        ctx.lineTo(cx, cy);
        ctx.lineTo(cx, cy + 12 * sy);
        ctx.stroke();
      });
      // 标签
      ctx.fillStyle = `rgba(231,76,60,0.8)`;
      ctx.font = 'bold 14px "Noto Serif SC","PingFang SC",sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('汉 · 部署区', 270, 298);
    } else {
      const fillGrad = ctx.createLinearGradient(0, 280, 0, 480);
      fillGrad.addColorStop(0, `rgba(46,134,193,${0.08 * pulse})`);
      fillGrad.addColorStop(1, `rgba(46,134,193,${0.04 * pulse})`);
      ctx.fillStyle = fillGrad;
      ctx.fillRect(500, 280, 320, 200);
      ctx.strokeStyle = `rgba(93,173,226,${0.35 * pulse})`;
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 5]);
      ctx.strokeRect(500, 280, 320, 200);
      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(93,173,226,0.6)';
      ctx.lineWidth = 2.5;
      [[500,280],[820,280],[500,480],[820,480]].forEach(([cx, cy]) => {
        const sx = cx === 500 ? 1 : -1, sy = cy === 280 ? 1 : -1;
        ctx.beginPath();
        ctx.moveTo(cx + 12 * sx, cy);
        ctx.lineTo(cx, cy);
        ctx.lineTo(cx, cy + 12 * sy);
        ctx.stroke();
      });
      ctx.fillStyle = 'rgba(93,173,226,0.8)';
      ctx.font = 'bold 14px "Noto Serif SC","PingFang SC",sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('金 · 部署区', 660, 298);
    }
  }

  _drawDeployPreview() {
    if (!this.selectedType || this.state !== State.DEPLOYMENT) return;
    const def = TROOP_DEFS[this.selectedType];
    if (this.deployPoints < def.cost) return;

    const inZone = this._isInDeployZone(this.mouseX, this.mouseY);
    // 半透明占位圈
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = inZone ? '#2ECC71' : '#E74C3C';
    ctx.beginPath();
    ctx.arc(this.mouseX, this.mouseY, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // 预览头像
    const previewUnit = { name: '新兵', type: this.selectedType, side: this.playerSide };
    const previewSprite = Assets.getOrGenerate(previewUnit.side, previewUnit.type);
    if (previewSprite) {
      if (previewUnit.side === 'jin') {
        ctx.save();
        ctx.translate(this.mouseX, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(previewSprite, -24, this.mouseY - 28, 48, 56);
        ctx.restore();
      } else {
        ctx.drawImage(previewSprite, this.mouseX - 24, this.mouseY - 28, 48, 56);
      }
    }

    // 兵种名称
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px "Noto Sans SC","PingFang SC",sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(def.name, this.mouseX, this.mouseY + 30);
  }

  _drawTerrain() {
    for (const t of this._terrain) {
      if (t.hp <= 0) continue;

      if (t.type === 'rock') {
        // 岩石阴影
        const rsGrad = ctx.createRadialGradient(t.x + t.w/2, t.y + t.h, t.w/4, t.x + t.w/2, t.y + t.h, t.w/2 + 2);
        rsGrad.addColorStop(0, 'rgba(0,0,0,0.35)');
        rsGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = rsGrad;
        ctx.beginPath();
        ctx.ellipse(t.x + t.w/2, t.y + t.h, t.w/2 + 2, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        // 岩石主体 — 使用纹理
        const rTex = Assets.get('texture_rock');
        const cx = t.x + t.w/2, cy = t.y + t.h/2;
        ctx.save();
        ctx.beginPath();
        for (let a = 0; a < Math.PI * 2; a += 0.3) {
          const r = (t.w/2) - 3 + Math.sin(a * 3 + t.x) * 4 + Math.cos(a * 5 + t.y) * 3;
          const px = cx + Math.cos(a) * r;
          const py = cy + Math.sin(a) * r;
          if (a === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.clip();
        if (rTex) {
          ctx.fillStyle = ctx.createPattern(rTex, 'repeat');
        } else {
          const rockGrad = ctx.createLinearGradient(t.x, t.y, t.x, t.y + t.h);
          rockGrad.addColorStop(0, '#9E9E9E');
          rockGrad.addColorStop(0.3, '#BDBDBD');
          rockGrad.addColorStop(1, '#757575');
          ctx.fillStyle = rockGrad;
        }
        ctx.fill();
        ctx.restore();
        // HP条
        if (t.hp < t.maxHP) {
          const hpPct = t.hp / t.maxHP;
          ctx.fillStyle = '#333';
          ctx.fillRect(t.x - 5, t.y - 12, t.w + 10, 5);
          ctx.fillStyle = hpPct > 0.5 ? '#2ECC71' : '#E74C3C';
          ctx.fillRect(t.x - 5, t.y - 12, (t.w + 10) * hpPct, 5);
        }
      } else if (t.type === 'barricade') {
        // 使用木材纹理
        const bTex = Assets.get('texture_wood');
        if (bTex) {
          ctx.fillStyle = ctx.createPattern(bTex, 'repeat');
        } else {
          ctx.fillStyle = '#8B6914';
        }
        ctx.fillRect(t.x, t.y, t.w, t.h);
        // 顶部横梁高光
        const btGrad = ctx.createLinearGradient(0, t.y, 0, t.y + 4);
        btGrad.addColorStop(0, 'rgba(255,255,255,0.15)');
        btGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = btGrad;
        ctx.fillRect(t.x, t.y, t.w, 4);
        // 尖刺
        ctx.fillStyle = '#6B4914';
        for (let sx = t.x + 5; sx < t.x + t.w - 5; sx += 12) {
          ctx.beginPath();
          ctx.moveTo(sx, t.y - 7);
          ctx.lineTo(sx + 4, t.y);
          ctx.lineTo(sx - 4, t.y);
          ctx.closePath();
          ctx.fill();
          // Spike tip highlight
          ctx.fillStyle = '#9B7940';
          ctx.beginPath();
          ctx.arc(sx, t.y - 7, 1, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#6B4914';
        }
        // HP条
        if (t.hp < t.maxHP) {
          const hpPct = t.hp / t.maxHP;
          ctx.fillStyle = '#333';
          ctx.fillRect(t.x, t.y - 14, t.w, 4);
          ctx.fillStyle = '#F39C12';
          ctx.fillRect(t.x, t.y - 14, t.w * hpPct, 4);
        }
      } else if (t.type === 'highground') {
        // 高地平台
        const hgGrad = ctx.createLinearGradient(0, t.y, 0, t.y + t.h);
        hgGrad.addColorStop(0, '#A08060');
        hgGrad.addColorStop(0.3, '#8B7355');
        hgGrad.addColorStop(1, '#6B5340');
        ctx.fillStyle = hgGrad;
        ctx.beginPath();
        ctx.roundRect(t.x, t.y, t.w, t.h, 6);
        ctx.fill();
        // 边缘高亮
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 2;
        ctx.stroke();
        // 标记箭头
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('△', t.x + t.w/2, t.y + t.h/2 + 5);
      } else if (t.type === 'tree') {
        // 使用树木精灵图 (Kenney Nature Kit side-view tree 39x154)
        const treeSprite = Assets.get('sprite_tree');
        if (treeSprite) {
          // 检测是否为 PNG 图像（Image vs Canvas）来决定绘制方式
          const isPNG = treeSprite instanceof Image;
          if (isPNG) {
            // Kenney side-view tree: scale to fit terrain footprint
            const tw = 32, th = 60;
            ctx.drawImage(treeSprite, t.x - tw/2 + t.w/2, t.y - th + t.h/2 + 10, tw, th);
          } else {
            // 程序化后备: original canopy-style tree
            ctx.drawImage(treeSprite, t.x - 10, t.y - t.h / 2 - 20, t.w + 20, t.h + 40);
          }
        } else {
          const cx = t.x, cy = t.y, bw = t.w, bh = t.h;
          ctx.fillStyle = '#5D4037';
          ctx.fillRect(cx + bw/2 - 5, cy + bh/2 - 5, 10, bh/2 + 8);
          ctx.fillStyle = '#2E7D32';
          ctx.beginPath();
          ctx.moveTo(cx + bw/2, cy - bh/2 - 8);
          ctx.lineTo(cx - bw/2 - 2, cy + bh/2 - 6);
          ctx.lineTo(cx + bw + 2, cy + bh/2 - 6);
          ctx.fill();
          ctx.fillStyle = '#388E3C';
          ctx.beginPath();
          ctx.moveTo(cx + bw/2, cy - bh/2);
          ctx.lineTo(cx - bw/2 + 4, cy + bh/2 - 4);
          ctx.lineTo(cx + bw - 4, cy + bh/2 - 4);
          ctx.fill();
          ctx.fillStyle = '#43A047';
          ctx.beginPath();
          ctx.moveTo(cx + bw/2, cy - bh/2 + 10);
          ctx.lineTo(cx - bw/2 + 8, cy + bh/2);
          ctx.lineTo(cx + bw - 8, cy + bh/2);
          ctx.fill();
        }
        // HP条
        if (t.hp < t.maxHP) {
          const hpPct = t.hp / t.maxHP;
          const barW = t.w + 10, barH = 5;
          ctx.fillStyle = 'rgba(0,0,0,0.6)';
          ctx.fillRect(t.x - 5, t.y - t.h / 2 - 14, barW, barH);
          const hpg = ctx.createLinearGradient(t.x - 5, 0, t.x - 5 + barW, 0);
          hpg.addColorStop(0, hpPct > 0.5 ? '#2ECC71' : '#E74C3C');
          hpg.addColorStop(1, hpPct > 0.5 ? '#27AE60' : '#C0392B');
          ctx.fillStyle = hpg;
          ctx.fillRect(t.x - 5, t.y - t.h / 2 - 14, barW * Math.max(0.05, hpPct), barH);
        }
      } else if (t.type === 'bush') {
        // 使用灌木精灵图 (Kenney Nature Kit plant_bushLarge 33x22)
        const bushSprite = Assets.get('sprite_bush');
        if (bushSprite) {
          const isPNG = bushSprite instanceof Image;
          if (isPNG) {
            // Kenney bush: draw at natural aspect ratio within terrain footprint
            const bw = t.w + 8, bh = t.h + 12;
            ctx.drawImage(bushSprite, t.x - 4, t.y - 6, bw, bh);
          } else {
            // 程序化后备
            ctx.drawImage(bushSprite, t.x - 5, t.y - 10, t.w + 10, t.h + 14);
          }
        } else {
          const bcx = t.x + t.w/2, bcy = t.y + t.h/2;
          ctx.fillStyle = 'rgba(0,0,0,0.2)';
          ctx.beginPath();
          ctx.ellipse(bcx, bcy + t.h/2 - 2, t.w/2 + 2, 5, 0, 0, Math.PI * 2);
          ctx.fill();
          for (let i = 0; i < 4; i++) {
            const bx = t.x + 8 + i * (t.w / 4);
            const by = t.y + Math.sin(i * 1.2) * 4;
            const br = 8 + Math.sin(i * 2.5) * 3;
            const bushGrad = ctx.createRadialGradient(bx, by - 2, 0, bx, by, br);
            bushGrad.addColorStop(0, '#4CAF50');
            bushGrad.addColorStop(0.7, '#2E7D32');
            bushGrad.addColorStop(1, '#1B5E20');
            ctx.fillStyle = bushGrad;
            ctx.beginPath();
            ctx.arc(bx, by, br, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        if (t.hp < t.maxHP) {
          const hpPct = t.hp / t.maxHP;
          ctx.fillStyle = '#333';
          ctx.fillRect(t.x, t.y - 10, t.w, 3);
          ctx.fillStyle = '#2ECC71';
          ctx.fillRect(t.x, t.y - 10, t.w * hpPct, 3);
        }
      } else if (t.type === 'swamp') {
        // 沼泽
        const swampGrad = ctx.createLinearGradient(0, t.y, 0, t.y + t.h);
        swampGrad.addColorStop(0, 'rgba(60,80,40,0.5)');
        swampGrad.addColorStop(0.5, 'rgba(40,60,30,0.6)');
        swampGrad.addColorStop(1, 'rgba(30,40,20,0.5)');
        ctx.fillStyle = swampGrad;
        ctx.beginPath();
        ctx.roundRect(t.x, t.y, t.w, t.h, 10);
        ctx.fill();
        // 气泡
        ctx.fillStyle = 'rgba(150,180,100,0.3)';
        const now = Date.now() / 1000;
        for (let i = 0; i < 6; i++) {
          const px = t.x + 12 + i * (t.w / 6) + Math.sin(now + i) * 8;
          const py = t.y + t.h/2 + Math.cos(now * 1.3 + i) * 6;
          ctx.beginPath();
          ctx.arc(px, py, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.font = '13px sans-serif';
        ctx.fillStyle = 'rgba(255,255,200,0.3)';
        ctx.textAlign = 'center';
        ctx.font = '13px "Noto Serif SC",serif';
        ctx.fillStyle = 'rgba(255,255,200,0.3)';
        ctx.fillText('险', t.x + t.w/2, t.y + t.h/2 + 5);
      }
    }
  }

  _drawUnits() {
    for (let i = 0; i < this.units.length; i++) {
      const u = this.units[i];
      if (u.hp <= 0) continue;
      const def = TROOP_DEFS[u.type];
      const isSelected = (this.selectedUnitIdxs.includes(i) && u.side === this.playerSide);

      // 阴影（预渲染精灵）
      ctx.drawImage(this._fx.shadow, u.x - 16, u.y + 17, 32, 12);

      // 军旗皮肤：脚下阵营色环
      if (this._skinColors) {
        const ringColor = u.side === 'han' ? this._skinColors.own : this._skinColors.enemy;
        ctx.strokeStyle = ringColor;
        ctx.globalAlpha = 0.3;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(u.x, u.y - 2, 20, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // 选中光环（大金圈 + 脉冲）
      if (isSelected) {
        const pulse = 1 + Math.sin(this.battleElapsed * 6) * 0.15;
        ctx.strokeStyle = '#FFD700';
        ctx.lineWidth = 3;
        ctx.shadowColor = 'rgba(255,215,0,0.7)';
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.arc(u.x, u.y - 2, 26 * pulse, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;

        // 选中标记（三角形指示器）
        ctx.fillStyle = '#FFD700';
        ctx.beginPath();
        ctx.moveTo(u.x, u.y - 34);
        ctx.lineTo(u.x - 5, u.y - 28);
        ctx.lineTo(u.x + 5, u.y - 28);
        ctx.closePath();
        ctx.fill();
      }

      // 鼠标悬停光环
      if (!isSelected && u.side === this.playerSide && this._isCursorNear(u)) {
        ctx.strokeStyle = 'rgba(255,215,0,0.4)';
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        ctx.arc(u.x, u.y - 2, 24, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // 军师/大将军光环
      if (u.type === 'strategist' || u.type === 'general') {
        ctx.strokeStyle = u.type === 'general' ? 'rgba(240,214,138,0.25)' : 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 6]);
        ctx.beginPath();
        ctx.arc(u.x, u.y, TROOP_DEFS[u.type].auraRange, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // ---- 绘制单位精灵图 ----
      const bobY = Math.sin(this.battleElapsed * 2.5 + (u._bobPhase || 0)) * 2;
      const sprite = u._sprite;
      if (!sprite) {
        u._sprite = Assets.get('unit_' + u.side + '_' + u.type);
      }
      const finalSprite = u._sprite || Assets.getOrGenerate(u.side, u.type);
      if (finalSprite) {
        ctx.save();
        ctx.translate(u.x, u.y + bobY);
        let sx = 1, sy = 1;
        if (u._attackFlash > 0) {
          const flashProgress = 1 - u._attackFlash / 0.2;
          const pulse = 1 + Math.sin(flashProgress * Math.PI) * 0.25;
          sx = u.side === 'jin' ? -pulse : pulse;
          sy = pulse;
        } else if (u.side === 'jin') {
          sx = -1;
        }
        ctx.scale(sx, sy);
        const drawW = u.type === 'dragon' ? 72 : u.type === 'elephant' ? 66 : u.type === 'general' ? 54 : 48;
        const drawH = u.type === 'dragon' ? 84 : u.type === 'elephant' ? 76 : u.type === 'general' ? 64 : 56;
        ctx.drawImage(finalSprite, -drawW/2, -drawH/2, drawW, drawH);
        ctx.restore();
      }

      // 受击闪白
      if (u._hitFlash > 0) {
        const flashAlpha = u._hitFlash / 0.12 * 0.5;
        const flashGrad = ctx.createRadialGradient(u.x, u.y - 4, 4, u.x, u.y, 22);
        flashGrad.addColorStop(0, `rgba(255,255,255,${flashAlpha})`);
        flashGrad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = flashGrad;
        ctx.beginPath();
        ctx.arc(u.x, u.y, 22, 0, Math.PI * 2);
        ctx.fill();
      }

      // 名字（皮肤时用阵营色）
      ctx.fillStyle = (u.side === this.playerSide && this._skinColors)
        ? (this.playerSide === 'han' ? this._skinColors.own : this._skinColors.enemy)
        : '#fff';
      ctx.font = 'bold 8px "Noto Sans SC","PingFang SC",sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(u.name, u.x, u.y - 32);

      // 兵种小字标记
      ctx.fillStyle = 'rgba(255,255,255,0.65)';
      ctx.font = '7px "Noto Sans SC","PingFang SC",sans-serif';
      ctx.fillText(def.name, u.x, u.y + 32);

      // 分段式血条
      const hpPct = u.hp / u.maxHP;
      const barW = 34, barH = 5, barX = u.x - 17, barY = u.y + 36;
      const segments = 10;
      const segW = (barW - (segments - 1) * 0.5) / segments;
      const fullSegs = Math.round(hpPct * segments);

      // 背景
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      this._roundRectPath(barX - 1, barY - 1, barW + 2, barH + 2, 2);
      ctx.fill();

      // 分段绘制（纯色填充，避免每格每帧创建线性渐变）
      const segColor = hpPct > 0.5 ? '#2ECC71' : hpPct > 0.25 ? '#F39C12' : '#E74C3C';
      for (let s = 0; s < segments; s++) {
        const sx = barX + s * (segW + 0.5);
        if (s < fullSegs) {
          ctx.fillStyle = segColor;
          this._roundRectPath(sx, barY, segW, barH, 1);
          ctx.fill();
        }
        // 损失血格的闪烁效果
        if (s >= fullSegs && u._lostSegFlash && u._lostSegFlash > 0) {
          ctx.fillStyle = `rgba(255,100,100,${u._lostSegFlash * 0.6})`;
          this._roundRectPath(sx, barY, segW, barH, 1);
          ctx.fill();
        }
      }

      // 血条边框
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 0.5;
      this._roundRectPath(barX, barY, barW, barH, 2);
      ctx.stroke();

      // ---- 状态图标 ----
      const iconY = barY - 7;
      if (this._pickupBuffs && this._pickupBuffs.atk > 0 && u.side === this.playerSide) {
        ctx.fillStyle = '#E74C3C';
        ctx.font = '9px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('▲', u.x, iconY);
      } else if (this._pickupBuffs && this._pickupBuffs.spd > 0 && u.side === this.playerSide) {
        ctx.fillStyle = '#5DADE2';
        ctx.font = '9px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('▶', u.x, iconY);
      }
      if (this._decreeBuff && this._decreeBuff.enemySlow > 0 && u.side !== this.playerSide) {
        ctx.fillStyle = '#E74C3C';
        ctx.font = '9px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('▼', u.x, iconY);
      }
      if (this._nightMode && u.side !== this.playerSide) {
        ctx.fillStyle = '#8B8996';
        ctx.font = '9px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('🌙', u.x, iconY);
      }

      // 指令图标（使用小标记代替emoji）
      if (u.side === this.playerSide && u.cmdType) {
        const iconX = u.x + 18, iconY = u.y - 12;
        ctx.textAlign = 'center';
        if (u.cmdType === 'move') {
          ctx.fillStyle = '#5DADE2';
          ctx.font = '10px "Noto Sans SC",sans-serif';
          ctx.fillText('→', iconX, iconY);
        } else if (u.cmdType === 'attack') {
          ctx.fillStyle = '#E74C3C';
          ctx.font = 'bold 10px "Noto Serif SC",serif';
          ctx.fillText('战', iconX, iconY);
        } else if (u.cmdType === 'attackGate') {
          ctx.fillStyle = '#E74C3C';
          ctx.font = 'bold 10px "Noto Serif SC",serif';
          ctx.fillText('城', iconX, iconY);
        }
      }
    }

    // 绘制移动指令标记
    if (this._cmdMarker && this._cmdMarker.life > 0) {
      const m = this._cmdMarker;
      m.life -= 0.02;
      const alpha = Math.min(1, m.life / 1.5);
      const pulse = 1 + Math.sin(this.battleElapsed * 10) * 0.3;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = '#FFD700';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.arc(m.x, m.y, 8 * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      // X 标记
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(m.x - 5, m.y - 5);
      ctx.lineTo(m.x + 5, m.y + 5);
      ctx.moveTo(m.x + 5, m.y - 5);
      ctx.lineTo(m.x - 5, m.y + 5);
      ctx.stroke();
      ctx.restore();
      if (m.life <= 0) this._cmdMarker = null;
    }

    // 仇恨连线（选中的己方单位 → 攻击目标）
    if (this.selectedUnitIdxs && this.selectedUnitIdxs.length > 0) {
      for (const idx of this.selectedUnitIdxs) {
        const u = this.units[idx];
        if (!u || u.hp <= 0) continue;
        // 查找该单位的攻击目标
        let target = null;
        if (u.cmdType === 'attack' && u.cmdTarget !== undefined && u.cmdTarget >= 0) {
          target = this.units[u.cmdTarget];
        }
        if (target && target.hp > 0) {
          ctx.strokeStyle = 'rgba(255,255,255,0.12)';
          ctx.lineWidth = 1;
          ctx.setLineDash([2, 5]);
          ctx.beginPath();
          ctx.moveTo(u.x, u.y);
          ctx.lineTo(target.x, target.y);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    }
  }

  // ---- 绘制单位头像（程序化生成） ----
  _isCursorNear(u) {
    const dx = u.x - this.mouseX;
    const dy = u.y - this.mouseY;
    return Math.sqrt(dx*dx + dy*dy) < 24;
  }

  // ---- 死亡动画 ----
  _drawDeathAnimations() {
    for (const u of this.units) {
      if (u.hp > 0 || u._deathTime == null) continue;
      const elapsed = this.battleElapsed - u._deathTime;
      if (elapsed > 1.5) continue;

      const def = TROOP_DEFS[u.type];
      const alpha = 1 - elapsed / 1.5;
      const spin = elapsed * 720; // 旋转角度
      const floatY = -elapsed * 30; // 向上飘

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(u.x, u.y + floatY);
      ctx.rotate(spin * Math.PI / 180);

      // 白旗
      ctx.fillStyle = '#fff';
      ctx.fillRect(-8, -30, 12, 8);
      ctx.strokeStyle = '#ccc';
      ctx.lineWidth = 1;
      ctx.strokeRect(-8, -30, 12, 8);
      ctx.beginPath();
      ctx.moveTo(-2, -30);
      ctx.lineTo(-2, -38);
      ctx.stroke();

      // 小圆圈（代替复杂绘制）
      ctx.fillStyle = '#ddd';
      ctx.beginPath();
      ctx.arc(0, 0, 12, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();

      // "我会回来的！"
      if (elapsed < 1.0) {
        ctx.save();
        ctx.globalAlpha = elapsed < 0.5 ? 1 : (1 - (elapsed - 0.5) / 0.5);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 11px "PingFang SC","Microsoft YaHei",sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('我会回来的！', u.x, u.y - 10 + floatY);
        ctx.restore();
      }
    }
  }

  // ---- 粒子绘制 ----
  _drawParticles() {
    for (const p of this.particles) {
      const alpha = Math.min(1, p.life / p.maxLife);
      ctx.save();
      ctx.globalAlpha = alpha;

      switch (p.type) {
        case 'fire': {
          ctx.drawImage(this._fx.fire, p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
          break;
        }
        case 'spark':
          ctx.fillStyle = p.color;
          ctx.shadowColor = p.color;
          ctx.shadowBlur = 4;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
          break;
        case 'rain':
          ctx.strokeStyle = 'rgba(130,180,255,0.8)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - 1, p.y + 10);
          ctx.stroke();
          break;
        case 'snowflake':
          ctx.fillStyle = 'rgba(255,255,255,0.9)';
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
          // 六角星光
          ctx.strokeStyle = 'rgba(255,255,255,0.5)';
          ctx.lineWidth = 0.8;
          for (let k = 0; k < 3; k++) {
            const a = k * Math.PI / 3 + p.life;
            ctx.beginPath();
            ctx.moveTo(p.x - Math.cos(a) * p.size * 2, p.y - Math.sin(a) * p.size * 2);
            ctx.lineTo(p.x + Math.cos(a) * p.size * 2, p.y + Math.sin(a) * p.size * 2);
            ctx.stroke();
          }
          break;
        case 'dust':
          ctx.fillStyle = 'rgba(139,119,90,0.5)';
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'star': {
          const s = p.size * 6.7;
          ctx.drawImage(this._fx.star, p.x - s / 2, p.y - s / 2, s, s);
          break;
        }
        case 'smoke':
          ctx.fillStyle = 'rgba(150,150,150,0.35)';
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'confetti':
          ctx.fillStyle = p.color;
          ctx.fillRect(p.x - 3, p.y - 2, 6, 4);
          break;
        case 'slash': {
          this._drawLightning(ctx, p.data.sx, p.data.sy, p.data.tx, p.data.ty, p.color, p.size * alpha, 6, 5);
          break;
        }
        case 'tracer': {
          this._drawLightning(ctx, p.data.sx, p.data.sy, p.data.tx, p.data.ty, p.color, p.size * alpha, 4, 4);
          break;
        }
        case 'fire_breath': {
          const fsheet = Assets.get('fire_breath');
          if (fsheet) {
            // fire1.png is 1112x1188 spritesheet — use a section as flame frame
            const frameW = 120, frameH = 120;
            const fIdx = p.data ? (p.data.frameIdx || 0) : 0;
            const col = fIdx % 9;
            const row = Math.floor(fIdx / 9);
            ctx.drawImage(fsheet, col * frameW, row * frameH, frameW, frameH,
                          p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
          } else {
            // Fallback: simple radial flame
            const fgrad = ctx.createRadialGradient(p.x, p.y, p.size * 0.1, p.x, p.y, p.size);
            fgrad.addColorStop(0, 'rgba(255,255,50,0.9)');
            fgrad.addColorStop(0.5, 'rgba(255,100,0,0.6)');
            fgrad.addColorStop(1, 'rgba(255,20,0,0)');
            ctx.fillStyle = fgrad;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
          }
          break;
        }
        case 'impact': {
          const s = p.size * 2.1;
          ctx.drawImage(this._fx.impact, p.x - s / 2, p.y - s / 2, s, s);
          break;
        }
        case 'explosion_png': {
          // 使用下载的像素爆炸精灵表（12帧，96x96 每帧）
          const sheet = Assets.get('vfx_explosion');
          if (sheet) {
            const frameW = 96, frameH = 96;
            const totalFrames = 12;
            const frameIdx = Math.min(totalFrames - 1, Math.floor((1 - p.life / p.maxLife) * totalFrames));
            const sx = frameIdx * frameW;
            ctx.drawImage(sheet, sx, 0, frameW, frameH, p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
          }
          break;
        }
        case 'spell_png': {
          // 使用下载的法术效果
          const fx = Assets.get('vfx_spell');
          if (fx) {
            ctx.drawImage(fx, p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
          }
          break;
        }
      }
      ctx.restore();
    }
  }

  // ---- 闪电特效 ----
  _drawLightning(ctx, sx, sy, tx, ty, color, lineWidth, glowSize, baseSegments) {
    const dx = tx - sx;
    const dy = ty - sy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const segments = Math.max(4, Math.min(24, Math.floor(dist / 12)));
    const perpX = -dy / dist;
    const perpY = dx / dist;
    const segLen = dist / segments;

    // 生成锯齿路径点
    const pts = [{ x: sx, y: sy }];
    for (let i = 1; i < segments; i++) {
      const t = i / segments;
      const bx = sx + dx * t;
      const by = sy + dy * t;
      const offsetRange = segLen * 0.6;
      const offset = (Math.random() - 0.5) * offsetRange * 2;
      pts.push({ x: bx + perpX * offset, y: by + perpY * offset });
    }
    pts.push({ x: tx, y: ty });

    // 外层辉光
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = glowSize * 3;
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.4;
    ctx.lineWidth = lineWidth * 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.stroke();

    // 中层白光
    ctx.shadowBlur = glowSize * 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = lineWidth * 1.8;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.stroke();

    // 核心细线
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#fff';
    ctx.globalAlpha = 1;
    ctx.lineWidth = lineWidth * 0.6;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.stroke();

    // 分支
    ctx.shadowColor = color;
    ctx.shadowBlur = glowSize;
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = lineWidth * 0.5;
    for (let i = 1; i < pts.length - 1; i += 2) {
      const bx = pts[i].x + (Math.random() - 0.5) * segLen * 0.5;
      const by = pts[i].y + (Math.random() - 0.5) * segLen * 0.5;
      const bAngle = Math.atan2(ty - sy, tx - sx) + (Math.random() - 0.5) * Math.PI * 0.8;
      const bLen = segLen * (0.3 + Math.random() * 0.4);
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + Math.cos(bAngle) * bLen, by + Math.sin(bAngle) * bLen);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ---- 伤害数字 ----
  _drawDamageNumbers() {
    for (let i = this.damageNumbers.length - 1; i >= 0; i--) {
      const dn = this.damageNumbers[i];
      dn.life -= 0.016;
      if (dn.life <= 0) { this.damageNumbers.splice(i, 1); continue; }
      const progress = 1 - dn.life / dn.maxLife;
      const alpha = Math.min(1, 1 - progress);

      let fontSize, color, text, shadowColor;
      switch (dn.type) {
        case 'crit':
          fontSize = 18; color = '#FFD700'; text = `${dn.value}!`; shadowColor = 'rgba(255,215,0,0.7)'; break;
        case 'block':
          fontSize = 11; color = '#A0AABB'; text = `🛡 ${dn.value}`; shadowColor = null; break;
        case 'burn':
          fontSize = 12; color = '#F39C12'; text = `🔥 ${dn.value}`; shadowColor = null; break;
        case 'heal':
          fontSize = 13; color = '#2ECC71'; text = `+${dn.value}`; shadowColor = null; break;
        case 'kill':
          fontSize = 20; color = '#E74C3C'; text = '击杀'; shadowColor = 'rgba(231,76,60,0.6)'; break;
        default:
          fontSize = 13; color = '#FFFFFF'; text = String(dn.value); shadowColor = null;
      }

      const x = dn.x;
      const y = dn.y - progress * (dn.type === 'heal' ? 40 : dn.type === 'crit' ? 80 : 60)
                + (dn.type === 'burn' ? Math.sin(progress * 12) * 6 : 0);

      ctx.globalAlpha = alpha;
      if (shadowColor) { ctx.shadowColor = shadowColor; ctx.shadowBlur = 6; }
      ctx.fillStyle = color;
      ctx.font = `bold ${fontSize}px "Noto Sans SC","PingFang SC",sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(text, x, y);
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }
  }

  // ============================================================
  // 游戏循环
  // ============================================================

  _updateBattle(dt) {
    // ---- 胜负庆祝（慢动作 + 烟花 + 破门爆炸） ----
    if (this._celebration) {
      this._celebration.t += dt;
      if (this._result === 'win') {
        if (Math.random() < 0.28) this._spawnFirework();
        if (Math.random() < 0.1) {
          this._birds.push({
            x: 950 + Math.random() * 80, y: 120 + Math.random() * 60,
            vx: 60 + Math.random() * 80, vy: -30 - Math.random() * 50,
            life: 1.5, maxLife: 1.5, size: 3 + Math.random() * 3,
          });
        }
      }
      // 破门瞬间大爆炸
      if (this.gateHP <= 0 && !this._gateBoom) {
        this._gateBoom = true;
        this._screenShake = 18;
        this._gateFlash = 0.8;
        for (let i = 0; i < 40; i++) {
          this.particles.push({
            x: 860 + (Math.random() - 0.5) * 60,
            y: 340 + (Math.random() - 0.5) * 80,
            vx: (Math.random() - 0.5) * 160,
            vy: -60 - Math.random() * 120,
            life: 0.6 + Math.random() * 0.9, maxLife: 1.5,
            color: null, size: 4 + Math.random() * 12, type: 'fire',
          });
        }
        for (let i = 0; i < 30; i++) {
          this.particles.push({
            x: 860, y: 340,
            vx: (Math.random() - 0.5) * 200,
            vy: (Math.random() - 0.5) * 200,
            life: 0.4 + Math.random() * 0.5, maxLife: 0.9,
            color: '#D4A84B', size: 2 + Math.random() * 4, type: 'spark',
          });
        }
      }
      this._updateParticles(dt); // 庆祝特效也要动起来
      for (let i = this._killMarks.length - 1; i >= 0; i--) {
        this._killMarks[i].life -= dt;
        if (this._killMarks[i].life <= 0) this._killMarks.splice(i, 1);
      }
      if (this._celebration.t >= this._celebration.dur) {
        this._celebration = null;
        this.state = State.VICTORY;
        if (this._result === 'win') this.sound.victory(); else this.sound.defeat();
        this._showOverlay('victory');
      }
      return;
    }

    // ---- 巨龙始终飞行在空中，并周期性吐火 ----
    for (let i = 0; i < this.units.length; i++) {
      const u = this.units[i];
      if (u.type === 'dragon' && u.hp > 0) {
        u.y = Math.max(200, Math.min(260, u.y));
        // Periodic fire breath bursts
        if (!u._lastFireTime) u._lastFireTime = 1.8; // fire almost immediately on spawn
        u._lastFireTime += dt;
        if (u._lastFireTime > 2.0) {
          u._lastFireTime = 0;
          this._dragonFireBreath(u, u.x + (Math.random()-0.5)*100, u.y + 40 + Math.random()*60);
        }
      }
    }
    // ---- 计时器 ----
    this.battleElapsed += dt;
    const totalSec = Math.floor(this.battleElapsed);
    if (totalSec !== this._lastShownSec) {
      this._lastShownSec = totalSec;
      const min = Math.floor(totalSec / 60);
      const sec = totalSec % 60;
      timerDisplay.textContent = `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    }

    // ---- 连击衰减 ----
    if (this.combo > 0) {
      this._comboDecay += dt;
      if (this._comboDecay > 5) {
        this.combo = 0;
        this._comboDecay = 0;
        comboDisplay.textContent = '';
      }
    }

    // ---- 特效衰减 ----
    if (this._screenShake > 0.1) this._screenShake *= 0.85;
    else this._screenShake = 0;
    if (this._gateFlash > 0) this._gateFlash -= dt;
    if (this._lightningFlash > 0) this._lightningFlash -= dt;

    // ---- 天气更新 ----
    this._weather.timer += dt;
    if (this._weather.timer >= this._weather.nextChange) {
      this._weather.timer = 0;
      this._weather.nextChange = 15 + Math.random() * 25; // 15-40秒
      // 风暴权重降到 2/7（雷雨频繁会让孩子觉得不公平）；雪原图含雪天
      let types;
      if (this.mapType === 'snow') types = ['clear', 'clear', 'wind', 'snow', 'snow', 'snow', 'storm'];
      else types = ['clear', 'clear', 'rain', 'rain', 'wind', 'storm', 'storm'];
      this._weather.type = types[Math.floor(Math.random() * types.length)];
      const wdef = WEATHER_TYPES[this._weather.type];
      weatherIcon.textContent = wdef.name;
      this._showToast(`天气变化：${wdef.name}！${wdef.desc}`);
      this.sound.weather();
    }

    // 天气持续特效
    const wdef = WEATHER_TYPES[this._weather.type];
    if (this._weather.type === 'rain' && Math.random() < 0.5) {
      this.particles.push({
        x: Math.random() * CANVAS_W, y: Math.random() * 280,
        vx: -20 - Math.random() * 20, vy: 100 + Math.random() * 200,
        life: 1.2, maxLife: 1.2, color: null, size: 1, type: 'rain',
      });
      // 雨滴溅射
      if (Math.random() < 0.15) {
        const sx = Math.random() * 1100;
        const sy = 290 + Math.random() * 200;
        for (let i = 0; i < 3; i++) {
          this.particles.push({
            x: sx, y: sy,
            vx: (Math.random() - 0.5) * 30,
            vy: -20 - Math.random() * 30,
            life: 0.3, maxLife: 0.3,
            color: null, size: 1, type: 'rain',
          });
        }
      }
    }
    // 雪天飘雪
    if (this._weather.type === 'snow' && Math.random() < 0.6) {
      this.particles.push({
        x: Math.random() * CANVAS_W, y: -5 - Math.random() * 20,
        vx: -12 - Math.random() * 16, vy: 35 + Math.random() * 35,
        life: 2.5, maxLife: 2.5, color: '#FFFFFF', size: 1.5 + Math.random() * 1.5,
        type: 'snowflake',
      });
    }
    // 风天沙尘
    if (this._weather && this._weather.type === 'wind' && Math.random() < 0.4) {
      this.particles.push({
        x: -10,
        y: 290 + Math.random() * 200,
        vx: 80 + Math.random() * 120,
        vy: (Math.random() - 0.5) * 30,
        life: 1.5 + Math.random() * 1,
        maxLife: 2.5,
        color: 'rgba(180,160,130,0.3)',
        size: 2 + Math.random() * 4,
        type: 'dust',
      });
    }
    if (this._weather.type === 'storm') {
      if (Math.random() < 0.95) {
        this.particles.push({
          x: Math.random() * CANVAS_W, y: Math.random() * 350,
          vx: -30 - Math.random() * 30, vy: 150 + Math.random() * 300,
          life: 0.8, maxLife: 0.8, color: null, size: 1.5, type: 'rain',
        });
      }
      // 雷击：先预警 0.9 秒（红圈提示可躲避），再劈下
      if (!this._lightningStrike && Math.random() < 0.02) {
        this._lightningStrike = {
          x: 120 + Math.random() * 860,
          y: 290 + Math.random() * 170,
          warn: 0.9,
        };
      }
      if (this._lightningStrike) {
        this._lightningStrike.warn -= dt;
        if (this._lightningStrike.warn <= 0) {
          const s = this._lightningStrike;
          this._lightningStrike = null;
          this._lightningFlash = 0.15;
          this._screenShake = Math.max(this._screenShake, 5);
          // 落点火花
          for (let i = 0; i < 14; i++) {
            this.particles.push({
              x: s.x + (Math.random() - 0.5) * 30, y: s.y - 20,
              vx: (Math.random() - 0.5) * 60, vy: -30 - Math.random() * 60,
              life: 0.3, maxLife: 0.3, color: null, size: 2, type: 'spark',
            });
          }
          // 伤害预警圈内的单位（双方都会中招，但可以躲开）
          const dmg = 10 + Math.random() * 10;
          for (const u of this.units) {
            if (u.hp <= 0) continue;
            const dx = u.x - s.x, dy = u.y - s.y;
            if (Math.sqrt(dx * dx + dy * dy) < 48) {
              u.hp -= dmg;
              u._lostSegFlash = 0.3;
              this._addDamageNum(u.x, u.y - 28, Math.round(dmg), true, 'crit');
              if (u.hp <= 0) {
                u.hp = 0;
                u._deathTime = this.battleElapsed;
                this._killMarks.push({ x: u.x, y: u.y + 15, life: 3, maxLife: 3 });
                this._onKill(u, 'storm');
              }
            }
          }
        }
      }
    }

    // ---- 城堡烽火 ----
    const brazierPositions = [
      { x: 845, y: 155 },
      { x: 880, y: 150 },
      { x: 925, y: 155 },
    ];
    for (let i = 0; i < brazierPositions.length; i++) {
      this._brazierTimers[i] += dt;
      const bp = brazierPositions[i];
      while (this._brazierTimers[i] > 0.15) {
        this._brazierTimers[i] -= 0.15;
        // 火焰粒子
        this.particles.push({
          x: bp.x + (Math.random() - 0.5) * 8,
          y: bp.y,
          vx: (Math.random() - 0.5) * 10,
          vy: -30 - Math.random() * 60,
          life: 0.4 + Math.random() * 0.5,
          maxLife: 0.9,
          color: null,
          size: 3 + Math.random() * 4,
          type: 'fire',
        });
        // 黑烟粒子
        this.particles.push({
          x: bp.x + (Math.random() - 0.5) * 6,
          y: bp.y - 10,
          vx: (Math.random() - 0.5) * 5,
          vy: -15 - Math.random() * 20,
          life: 0.5 + Math.random() * 0.8,
          maxLife: 1.3,
          color: 'rgba(50,50,50,0.6)',
          size: 4 + Math.random() * 6,
          type: 'smoke',
        });
      }
    }

    // ---- 宝箱生成 ----
    this._chestSpawnTimer += dt;
    if (this._chests.length < 1 && this._chestSpawnTimer > this._chestSpawnDelay) {
      this._chestSpawnTimer = 0;
      this._chestSpawnDelay = 15 + Math.random() * 10;
      this._spawnChest();
    }

    // ---- 宝箱拾取检测 ----
    for (let ci = this._chests.length - 1; ci >= 0; ci--) {
      const chest = this._chests[ci];
      chest.life -= dt;
      if (chest.life <= 0) { this._chests.splice(ci, 1); continue; }
      for (const u of this.units) {
        if (u.hp <= 0) continue;
        const dx = u.x - chest.x, dy = u.y - chest.y;
        if (Math.sqrt(dx*dx + dy*dy) < 32) {
          this._pickupChest(chest, ci);
          break;
        }
      }
    }

    // ---- 随机中立事件 ----
    this._updateEvents(dt);

    // ---- 拾取增益衰减 ----
    if (this._pickupBuffs.atk > 0) this._pickupBuffs.atk -= dt;
    if (this._pickupBuffs.spd > 0) this._pickupBuffs.spd -= dt;

    // ---- 技能增益衰减 ----
    if (this._messengerBuff > 0) this._messengerBuff -= dt;
    if (this._decreeBuff.atk > 0) this._decreeBuff.atk -= dt;
    if (this._decreeBuff.enemySlow > 0) this._decreeBuff.enemySlow -= dt;

    // ---- 单位更新 ----
    const alive = this.units.filter(u => u.hp > 0);
    // 按 x 排序：攻方从左到右、守方从右到左，前方单位优先
    alive.sort((a, b) => a.side === 'han' ? b.x - a.x : a.x - b.x);

    // 预提取光环单位（军师/大将军）列表，避免 O(n²) 扫描
    const playerAuras = [];
    const enemyAuras = [];
    for (const st of alive) {
      if (st.type !== 'strategist' && st.type !== 'general') continue;
      const ad = TROOP_DEFS[st.type];
      const aura = {
        x: st.x, y: st.y,
        rangeSq: ad.auraRange * ad.auraRange,
        atkBonus: ad.atkAura || 0,
        slows: st.type === 'strategist', // 军师减速敌人，大将军不减
      };
      if (st.side === this.playerSide) playerAuras.push(aura);
      else enemyAuras.push(aura);
    }

    // 预拆分阵营，AI 寻敌只需扫描敌对阵营
    const playerAlive = alive.filter(u => u.side === this.playerSide);
    const enemyAlive = alive.filter(u => u.side !== this.playerSide);

    for (const u of alive) {
      u.atkCooldown = Math.max(0, u.atkCooldown - dt);
      if (u._hitFlash > 0) u._hitFlash -= dt;
      if (u._lostSegFlash > 0) u._lostSegFlash -= dt;
      if (u._attackFlash > 0) u._attackFlash -= dt;

      const def = TROOP_DEFS[u.type];
      const isAttacker = u.side === 'han';

      // 光环（军师/大将军，O(1) 预过滤，平方距离避免 sqrt）
      let auraAtk = 0, hasSpdDebuff = false;
      if (u.type !== 'strategist' && u.type !== 'general') {
        const friendlyAuras = (u.side === this.playerSide) ? playerAuras : enemyAuras;
        const hostileAuras  = (u.side === this.playerSide) ? enemyAuras : playerAuras;
        for (const a of friendlyAuras) {
          const adx = u.x - a.x, ady = u.y - a.y;
          if (adx * adx + ady * ady < a.rangeSq) { auraAtk = Math.max(auraAtk, a.atkBonus); }
        }
        for (const a of hostileAuras) {
          if (!a.slows) continue;
          const adx = u.x - a.x, ady = u.y - a.y;
          if (adx * adx + ady * ady < a.rangeSq) { hasSpdDebuff = true; break; }
        }
      }

      // 玩家单位：执行指令而非自动 AI
      if (u.side === this.playerSide) {
        this._updatePlayerUnit(u, def, alive, auraAtk, hasSpdDebuff, dt);
        continue;
      }

      // ---- 寻找目标 ----
      let target = null;
      let targetGate = false;

      // 撞门器优先攻击城门
      if (isAttacker && u.type === 'ram') {
        const gateDist = Math.abs(u.x - 860);
        if (gateDist < 120) {
          targetGate = true;
        }
      }

      // 寻找最近的敌人（只扫描敌对阵营，O(n/2)）
      if (!targetGate) {
        let nearestDist = Infinity;
        const hostiles = (u.side === this.playerSide) ? enemyAlive : playerAlive;
        // 使用平方距离避免重复 sqrt
        for (const enemy of hostiles) {
          const dx = enemy.x - u.x;
          const dy = enemy.y - u.y;
          const dist = dx * dx + dy * dy;
          if (dist < nearestDist) {
            nearestDist = dist;
            target = enemy;
          }
        }
        // 攻方没有敌人时攻击城门
        if (!target && isAttacker) {
          targetGate = true;
        }
      }

      // ---- 攻击城门 ----
      if (targetGate) {
        const gx = 860, gy = 340;
        const dx = gx - u.x, dy = gy - u.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const atkRange = this._getEffectiveRange(u, true);

        if (dist <= atkRange) {
          if (u.atkCooldown <= 0) {
            this._doGateAttack(u, def, auraAtk);
          }
        } else {
          const spd = this._getEffectiveSpeed(u, hasSpdDebuff);
          this._moveToward(u, dx, dy, dist, spd, dt, true);
        }
        continue;
      }

      // ---- 攻击敌人 ----
      if (target) {
        const dx = target.x - u.x, dy = target.y - u.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const atkRange = this._getEffectiveRange(u, false);

        if (dist <= atkRange) {
          if (u.atkCooldown <= 0) {
            this._doAttack(u, def, target, auraAtk, false);
          }
        } else {
          const spd = this._getEffectiveSpeed(u, hasSpdDebuff);
          this._moveToward(u, dx, dy, dist, spd, dt, true);
        }
      }
    }

    // ---- 更新粒子 ----
    this._updateParticles(dt);

    // 击杀痕迹衰减
    for (let i = this._killMarks.length - 1; i >= 0; i--) {
      this._killMarks[i].life -= dt;
      if (this._killMarks[i].life <= 0) this._killMarks.splice(i, 1);
    }

    // 飞鸟更新
    for (let i = this._birds.length - 1; i >= 0; i--) {
      const bird = this._birds[i];
      bird.x += bird.vx * dt;
      bird.y += bird.vy * dt;
      bird.vy += 40 * dt;
      bird.life -= dt;
      if (bird.life <= 0) this._birds.splice(i, 1);
    }

    // ---- 更新技能冷却和特效 ----
    this._updateSkills(dt);

    // ---- 检查胜负 ----
    this._checkVictory();
  }

  // ---- 添加伤害数字 ----
  _addDamageNum(x, y, value, isCrit, type) {
    this.damageNumbers.push({
      x, y,
      value,
      isCrit: !!isCrit,
      type: type || 'normal',
      life: type === 'heal' ? 1.5 : type === 'crit' ? 1.2 : type === 'kill' ? 1.5 : 1.0,
      maxLife: type === 'heal' ? 1.5 : type === 'crit' ? 1.2 : type === 'kill' ? 1.5 : 1.0,
      vy: type === 'heal' ? -30 : type === 'crit' ? -70 : type === 'kill' ? -50 : -50,
    });
  }

  // ---- 统一粒子更新（战斗与庆祝共用） ----
  _updateParticles(dt) {
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.type === 'fire') { p.size += 8 * dt; p.vy -= 15 * dt; }
      if (p.type === 'spark') { p.vy -= 30 * dt; p.vx *= 0.98; }
      if (p.type === 'rain') { p.vy += 300 * dt; }
      if (p.type === 'dust') { p.vy += 20 * dt; p.size += 2 * dt; }
      if (p.type === 'snowflake') { p.x += Math.sin(p.life * 3 + p.y * 0.05) * 10 * dt; p.vy += 6 * dt; }
      if (p.type === 'star') { p.vy -= 10 * dt; p.size = 2 + Math.sin(p.life * 10) * 1; }
      if (p.type === 'smoke') { p.size += 15 * dt; p.vx *= 0.95; p.vy *= 0.95; }
      if (p.type === 'confetti') { p.vy += 80 * dt; p.vx += Math.sin(p.life * 8) * 30 * dt; }
      if (p.type === 'slash') { /* static, just fades */ }
      if (p.type === 'tracer') { /* static, just fades */ }
      if (p.type === 'impact') { p.size += 60 * dt; p.vy -= 10 * dt; }
    }
    this.particles = this.particles.filter(p => p.life > 0);
    // 粒子数量上限保护：防止特效刷屏导致内存/CPU 失控
    if (this.particles.length > MAX_PARTICLES) {
      this.particles.splice(0, this.particles.length - MAX_PARTICLES);
    }
  }

  // ---- 技能激活 ----
  _activateSkill(key) {
    if (this.state !== State.BATTLE) return;
    const def = SKILL_DEFS[key];
    const sk = this._skills[key];

    if (sk.cd > 0) return;
    if (sk.active) return;
    if (this.gold < def.cost) return;

    this.gold -= def.cost;
    goldDisplay.textContent = `${this.gold}`;

    this._skillsUsed[key] = true;
    sk.active = true;
    sk.timer = def.duration;
    sk.cd = def.cooldown;

    switch (key) {
      case 'fire':
        this._showToast('火攻！烈焰焚烧敌军！');
        this.sound.fire();
        for (let i = 0; i < 30; i++) {
          this.particles.push({
            x: 800 + Math.random() * 120,
            y: 300 + Math.random() * 80,
            vx: (Math.random() - 0.5) * 40,
            vy: -40 - Math.random() * 60,
            life: 1 + Math.random() * 2,
            maxLife: 3,
            color: null,
            size: 5 + Math.random() * 15,
            type: 'fire',
          });
        }
        break;
      case 'night':
        this._showToast('夜战模式！夜幕降临！');
        this.sound.night();
        this._nightMode = true;
        weatherIcon.textContent = '夜';
        for (let i = 0; i < 15; i++) {
          this.particles.push({
            x: Math.random() * CANVAS_W,
            y: Math.random() * 300,
            vx: (Math.random() - 0.5) * 20,
            vy: -10 - Math.random() * 15,
            life: 1 + Math.random() * 2,
            maxLife: 3,
            color: null,
            size: 3 + Math.random() * 5,
            type: 'star',
          });
        }
        break;
      case 'messenger':
        this._showToast('传令兵！援军抵达，全军加速！');
        this.sound.messenger();
        this._spawnReinforcements();
        break;
      case 'decree':
        this._showToast('天子诏令！天威降临，敌军减速，己方攻击提升！');
        this.sound.decree();
        this._screenShake = 15;
        this._executeDecree();
        break;
    }
  }

  _spawnReinforcements() {
    const zone = this.playerSide === 'han'
      ? { xMin: 80, xMax: 300, yMin: 300, yMax: 470 }
      : { xMin: 520, xMax: 800, yMin: 300, yMax: 470 };

    const types = ['sword', 'spear', 'halberd', 'cavalry', 'crossbow', 'shield', 'bomber', 'elephant'];
    const count = 3 + Math.floor(Math.random() * 2); // 3-4 units

    for (let i = 0; i < count; i++) {
      const type = types[Math.floor(Math.random() * types.length)];
      const def = TROOP_DEFS[type];
      for (let attempt = 0; attempt < 30; attempt++) {
        const x = zone.xMin + Math.random() * (zone.xMax - zone.xMin);
        const y = zone.yMin + Math.random() * (zone.yMax - zone.yMin);
        if (!this._isUnitCollision(x, y, 40)) {
          const stats = this._unitStats(type);
          this.units.push(this._createUnit(type, x, y, this.playerSide, {
            hp: stats.hp,
            atkMul: stats.atkMul,
          }));
          // 传令兵抵达的尘土特效
          for (let j = 0; j < 10; j++) {
            this.particles.push({
              x: x + (Math.random() - 0.5) * 30,
              y: y + (Math.random() - 0.5) * 10,
              vx: (Math.random() - 0.5) * 40,
              vy: -20 - Math.random() * 30,
              life: 0.4 + Math.random() * 0.4,
              maxLife: 0.8,
              color: null,
              size: 6 + Math.random() * 8,
              type: 'dust',
            });
          }
          break;
        }
      }
    }

    // 援军抵达，全军士气大振 — 短时间加速
    this._messengerBuff = 3.5;
  }

  _executeDecree() {
    const enemies = this.units.filter(u => u.side !== this.playerSide && u.hp > 0);
    for (const enemy of enemies) {
      const dmg = Math.max(35, Math.round(enemy.maxHP * 0.3));
      enemy.hp -= dmg;
      enemy._lostSegFlash = 0.3;
      this._addDamageNum(enemy.x, enemy.y - 28, Math.round(dmg), true, 'crit');

      // 每个敌人周围产生星星粒子
      this._burst(enemy.x, enemy.y, null, 15, 0, 50, 'star', {
        up: 50, life: 0.8, lifeR: 1.2, maxLife: 2, size: 2, sizeR: 5, jitter: { x: 80, y: 40 },
      });

      if (enemy.hp <= 0) {
        enemy.hp = 0;
        enemy._deathTime = this.battleElapsed;
        this._onKill(enemy, 'decree');
      }
    }

    // 诏令附加效果：敌军减速3秒，己方攻击提升5秒
    this._decreeBuff.enemySlow = 3;
    this._decreeBuff.atk = 5;

    // 飞鸟惊起
    for (let i = 0; i < 6; i++) {
      this._birds.push({
        x: 950 + Math.random() * 80,
        y: 140 + Math.random() * 50,
        vx: 60 + Math.random() * 80,
        vy: -30 - Math.random() * 50,
        life: 1.5,
        maxLife: 1.5,
        size: 3 + Math.random() * 3,
      });
    }
  }

  // ---- 宝箱 ----
  _spawnChest() {
    const x = 150 + Math.random() * 750; // 在地面区域
    const y = 310 + Math.random() * 150;

    const roll = Math.random();
    let reward, rewardLabel;
    if (roll < 0.5) {
      reward = { type: 'gold', amount: 20 + Math.floor(Math.random() * 30) };
      rewardLabel = `黄金 +${reward.amount}`;
    } else if (roll < 0.75) {
      reward = { type: 'heal', amount: 10 + Math.floor(Math.random() * 15) };
      rewardLabel = `生命 +${reward.amount} HP`;
    } else if (roll < 0.90) {
      reward = { type: 'atk', amount: 10 };
      rewardLabel = '攻击力UP';
    } else {
      reward = { type: 'spd', amount: 10 };
      rewardLabel = '速度UP';
    }

    this._chests.push({ x, y, reward, rewardLabel, life: 20 });
  }

  _pickupChest(chest, idx) {
    // 移除宝箱
    this._chests.splice(idx, 1);

    // 应用奖励
    switch (chest.reward.type) {
      case 'gold':
        this.gold += chest.reward.amount;
        goldDisplay.textContent = `${this.gold}`;
        break;
      case 'heal':
        for (const u of this.units) {
          if (u.side === this.playerSide && u.hp > 0) {
            u.hp = Math.min(u.maxHP, u.hp + chest.reward.amount);
            this._addDamageNum(u.x, u.y - 28, chest.reward.amount, false, 'heal');
          }
        }
        break;
      case 'atk':
        this._pickupBuffs.atk = chest.reward.amount;
        break;
      case 'spd':
        this._pickupBuffs.spd = chest.reward.amount;
        break;
    }

    this._showToast(`拾取宝箱！${chest.rewardLabel}`);
    this.sound.chest();

    // 拾取粒子
    this._burst(chest.x, chest.y, ['#FFD700', '#FF6B00', '#FF4500', '#FFA500', '#FFEC8B'], 20, 0, 50, 'confetti', {
      up: 50, life: 0.6, lifeR: 0.6, maxLife: 1.2, size: 3, sizeR: 4,
    });
    // 闪光
    for (let i = 0; i < 8; i++) {
      this.particles.push({
        x: chest.x, y: chest.y,
        vx: (Math.random() - 0.5) * 60,
        vy: -20 - Math.random() * 40,
        life: 0.4 + Math.random() * 0.3,
        maxLife: 0.7,
        color: '#FFD700',
        size: 2 + Math.random() * 4,
        type: 'star',
      });
    }
  }

  _drawChests() {
    const chestSprite = Assets.get('sprite_chest');
    for (const chest of this._chests) {
      const pulse = 1 + Math.sin(this.battleElapsed * 5) * 0.08;
      const alpha = chest.life < 5 ? Math.max(0, (chest.life / 5)) : 1;

      ctx.save();
      ctx.globalAlpha = alpha;

      if (chestSprite) {
        // 宝箱光辉
        const glowGrad = ctx.createRadialGradient(chest.x, chest.y, 3, chest.x, chest.y, 28 * pulse);
        glowGrad.addColorStop(0, 'rgba(255,215,0,0.5)');
        glowGrad.addColorStop(0.4, 'rgba(255,215,0,0.15)');
        glowGrad.addColorStop(1, 'rgba(255,215,0,0)');
        ctx.fillStyle = glowGrad;
        ctx.beginPath();
        ctx.arc(chest.x, chest.y, 28 * pulse, 0, Math.PI * 2);
        ctx.fill();

        // 宝箱精灵图
        ctx.drawImage(chestSprite, chest.x - 20, chest.y - 20, 40 * pulse, 32 * pulse);

        // 飘浮火花粒子
        if (chest.life > 8 && Math.random() < 0.3) {
          const sx = chest.x + (Math.random() - 0.5) * 16;
          const sy = chest.y - 8 + Math.random() * 4;
          this.particles.push({
            x: sx, y: sy,
            vx: (Math.random() - 0.5) * 15,
            vy: -8 - Math.random() * 15,
            life: 0.6 + Math.random() * 0.5,
            maxLife: 1.1,
            color: '#FFD700',
            size: 1 + Math.random() * 2,
            type: 'spark',
          });
        }
      } else {
        // Fallback
        const glowGrad = ctx.createRadialGradient(chest.x, chest.y, 2, chest.x, chest.y, 26 * pulse);
        glowGrad.addColorStop(0, 'rgba(255,215,0,0.6)');
        glowGrad.addColorStop(1, 'rgba(255,215,0,0)');
        ctx.fillStyle = glowGrad;
        ctx.beginPath();
        ctx.arc(chest.x, chest.y, 26 * pulse, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#8B4513';
        ctx.fillRect(chest.x - 14, chest.y - 6, 28, 18);
        ctx.fillStyle = '#A0522D';
        ctx.fillRect(chest.x - 15, chest.y - 12, 30, 8);
        ctx.strokeStyle = '#FFD700';
        ctx.lineWidth = 2;
        ctx.strokeRect(chest.x - 14, chest.y - 6, 28, 18);
        ctx.strokeRect(chest.x - 15, chest.y - 12, 30, 8);
        ctx.fillStyle = '#FFD700';
        ctx.beginPath();
        ctx.arc(chest.x, chest.y, 4, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }
  }

  // ---- 随机中立事件（商人 / 山崩 / 狼群） ----
  _updateEvents(dt) {
    if (this.state !== State.BATTLE) return;

    // 事件计时
    this._eventTimer += dt;
    if (this._eventTimer > this._eventDelay) {
      this._eventTimer = 0;
      this._eventDelay = 25 + Math.random() * 15;
      const roll = Math.random();
      if (roll < 0.4 && !this._events.merchant) {
        this._spawnMerchant();
      } else if (roll < 0.72) {
        this._triggerLandslide();
      } else {
        this._spawnWolves();
      }
    }

    // 商人消失计时
    if (this._events.merchant) {
      this._events.merchant.life -= dt;
      if (this._events.merchant.life <= 0) {
        this._events.merchant = null;
        this._showToast('货郎等不到买家，挑着担子走了');
      }
    }

    // 狼群移动与撕咬
    for (let i = this._events.wolves.length - 1; i >= 0; i--) {
      const w = this._events.wolves[i];
      w.x += w.vx * dt;
      w.y += Math.sin((w.x + w.phase) * 0.05) * 20 * dt; // 奔跑起伏
      w.life -= dt;
      if (w.life <= 0 || w.x < -60 || w.x > 1160) { this._events.wolves.splice(i, 1); continue; }
      // 咬最近的单位
      if (!w._biteCd) w._biteCd = 0;
      w._biteCd -= dt;
      if (w._biteCd <= 0) {
        let best = null, bestD = 30 * 30;
        for (const u of this.units) {
          if (u.hp <= 0) continue;
          const dx = u.x - w.x, dy = u.y - w.y;
          const d = dx * dx + dy * dy;
          if (d < bestD) { bestD = d; best = u; }
        }
        if (best) {
          w._biteCd = 0.8;
          best.hp -= 10;
          best._hitFlash = 0.12;
          best._lostSegFlash = 0.3;
          this._addDamageNum(best.x, best.y - 28, 10, false, 'normal');
          this.sound.hit();
          if (best.hp <= 0) {
            best.hp = 0;
            best._deathTime = this.battleElapsed;
            this._onKill(best, 'wolf');
          }
        }
      }
    }
  }

  _spawnMerchant() {
    const x = 300 + Math.random() * 500;
    const y = 310 + Math.random() * 120;
    this._events.merchant = { x, y, life: 15 };
    this._showToast('🧺 货郎来了！点击他花 ◆20 买「全军鼓舞」');
  }

  _merchantClick() {
    const m = this._events.merchant;
    if (!m) return;
    if (this.gold < 20) {
      this._showToast('金币不够…（需要 ◆20）');
      return;
    }
    this.gold -= 20;
    goldDisplay.textContent = `${this.gold}`;
    this._events.merchant = null;
    // 全军鼓舞：回复 20% 生命 + 10 秒攻击加成
    for (const u of this.units) {
      if (u.side === this.playerSide && u.hp > 0) {
        u.hp = Math.min(u.maxHP, u.hp + u.maxHP * 0.2);
        this._addDamageNum(u.x, u.y - 28, Math.round(u.maxHP * 0.2), false, 'heal');
      }
    }
    this._pickupBuffs.atk = 10;
    this.sound.buy();
    this._showToast('战鼓齐鸣！全军鼓舞！');
    for (let i = 0; i < 24; i++) {
      this.particles.push({
        x: m.x, y: m.y,
        vx: (Math.random() - 0.5) * 120,
        vy: -40 - Math.random() * 80,
        life: 0.6 + Math.random() * 0.6, maxLife: 1.2,
        color: ['#FFD700', '#FF6B00', '#F0D68A'][Math.floor(Math.random() * 3)],
        size: 3 + Math.random() * 4, type: 'confetti',
      });
    }
  }

  _triggerLandslide() {
    this._screenShake = Math.max(this._screenShake, 10);
    this._showToast('山崩！滚石封路！');
    const spots = [
      { x: 380, y: 430 }, { x: 560, y: 420 }, { x: 700, y: 440 },
    ];
    for (const s of spots) {
      if (Math.random() < 0.8) {
        const w = 30 + Math.random() * 16;
        const h = 26 + Math.random() * 12;
        this._terrain.push({ type: 'rock', x: s.x, y: s.y, w, h, hp: 120, maxHP: 120 });
      }
    }
    // 滚石尘土
    for (let i = 0; i < 40; i++) {
      this.particles.push({
        x: 300 + Math.random() * 500,
        y: 350 + Math.random() * 120,
        vx: (Math.random() - 0.5) * 60,
        vy: -30 - Math.random() * 50,
        life: 0.5 + Math.random() * 0.7, maxLife: 1.2,
        color: 'rgba(139,119,90,0.6)',
        size: 5 + Math.random() * 8, type: 'dust',
      });
    }
  }

  _spawnWolves() {
    this._showToast('🐺 狼群出没！小心它们咬人！');
    for (let i = 0; i < 3; i++) {
      this._events.wolves.push({
        x: -40 - Math.random() * 60,
        y: 300 + Math.random() * 140,
        vx: 90 + Math.random() * 40,
        life: 9, phase: Math.random() * Math.PI * 2,
      });
    }
    for (let i = 0; i < 2; i++) {
      this._events.wolves.push({
        x: 1140 + Math.random() * 60,
        y: 300 + Math.random() * 140,
        vx: -(90 + Math.random() * 40),
        life: 9, phase: Math.random() * Math.PI * 2,
      });
    }
  }

  _drawEvents() {
    // 商人
    if (this._events.merchant) {
      const m = this._events.merchant;
      const pulse = 1 + Math.sin(this.battleElapsed * 5) * 0.1;
      const glow = ctx.createRadialGradient(m.x, m.y, 3, m.x, m.y, 30 * pulse);
      glow.addColorStop(0, 'rgba(255,215,0,0.55)');
      glow.addColorStop(0.4, 'rgba(255,215,0,0.15)');
      glow.addColorStop(1, 'rgba(255,215,0,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(m.x, m.y, 30 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#8B5A2B';
      ctx.beginPath();
      ctx.arc(m.x, m.y, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = '16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🧺', m.x, m.y + 6);
      ctx.fillStyle = '#F0D68A';
      ctx.font = 'bold 10px sans-serif';
      ctx.fillText('◆20', m.x, m.y - 20);
      // 剩余时间条
      const pct = Math.max(0, m.life / 15);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(m.x - 16, m.y + 18, 32, 4);
      ctx.fillStyle = '#F0D68A';
      ctx.fillRect(m.x - 16, m.y + 18, 32 * pct, 4);
    }
    // 狼群
    for (const w of this._events.wolves) {
      const dir = w.vx > 0 ? 1 : -1;
      ctx.save();
      ctx.translate(w.x, w.y);
      ctx.scale(dir, 1);
      // 身体
      ctx.fillStyle = '#7A7A7A';
      ctx.beginPath();
      ctx.ellipse(0, 0, 12, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      // 头
      ctx.beginPath();
      ctx.arc(11, -4, 6, 0, Math.PI * 2);
      ctx.fill();
      // 耳朵
      ctx.fillStyle = '#5A5A5A';
      ctx.beginPath();
      ctx.moveTo(8, -9); ctx.lineTo(11, -14); ctx.lineTo(14, -9);
      ctx.closePath(); ctx.fill();
      // 眼睛
      ctx.fillStyle = '#FFD700';
      ctx.beginPath();
      ctx.arc(13, -5, 1.5, 0, Math.PI * 2);
      ctx.fill();
      // 尾巴
      ctx.strokeStyle = '#7A7A7A';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-10, -2);
      ctx.quadraticCurveTo(-16, -8, -14, -14);
      ctx.stroke();
      ctx.restore();
    }
  }

  // ---- 技能更新（每帧调用） ----
  _updateSkills(dt) {
    // 更新技能冷却和持续时间
    for (const [key, sk] of Object.entries(this._skills)) {
      if (sk.cd > 0) sk.cd = Math.max(0, sk.cd - dt);
      if (sk.active) {
        if (sk.timer > 0) {
          sk.timer -= dt;
          if (sk.timer <= 0) {
            sk.active = false;
            sk.timer = 0;
            if (key === 'night') {
              this._nightMode = false;
              // 恢复当前天气图标（夜战期间天气可能已变化）
              weatherIcon.textContent = WEATHER_TYPES[this._weather.type].name;
              this._showToast('天亮了！');
            }
          }
        } else {
          // 瞬时技能（duration=0），立刻结束 active
          sk.active = false;
        }
      }
    }

    // 火攻持续效果
    if (this._skills.fire.active) {
      // 每0.5秒对城门附近敌军造成灼烧伤害
      this._skills.fire._burnTick = (this._skills.fire._burnTick || 0) + dt;
      if (this._skills.fire._burnTick > 0.5) {
        this._skills.fire._burnTick -= 0.5;
        const gateX = 860, gateY = 340;
        const inRange = this.units.filter(u =>
          u.side !== this.playerSide && u.hp > 0 &&
          Math.sqrt((u.x - gateX) ** 2 + (u.y - gateY) ** 2) < 180
        );
        for (const u of inRange) {
          const burnDmg = 5 + Math.random() * 5;
          u.hp -= burnDmg;
          this._addDamageNum(u.x, u.y - 28, Math.round(burnDmg), false, 'burn');
          if (u.hp <= 0) {
            u.hp = 0;
            u._deathTime = this.battleElapsed;
            this._onKill(u, 'fire');
          }
        }
        // 持续生成火焰粒子
        for (let i = 0; i < 6; i++) {
          this.particles.push({
            x: 800 + Math.random() * 120,
            y: 280 + Math.random() * 80,
            vx: (Math.random() - 0.5) * 30,
            vy: -20 - Math.random() * 40,
            life: 0.6 + Math.random() * 0.8,
            maxLife: 1.4,
            color: null,
            size: 5 + Math.random() * 10,
            type: 'fire',
          });
        }
      }
    }

    // 夜战持续效果 — 偶尔生成星星
    if (this._skills.night.active && Math.random() < 0.3) {
      this.particles.push({
        x: Math.random() * CANVAS_W,
        y: Math.random() * 280,
        vx: (Math.random() - 0.5) * 10,
        vy: -5 - Math.random() * 8,
        life: 1 + Math.random() * 2,
        maxLife: 3,
        color: null,
        size: 1 + Math.random() * 3,
        type: 'star',
      });
    }

    // 更新技能按钮 UI（节流：每 0.1s 刷新一次，避免每帧 DOM 读写）
    this._skillUIAccum += dt;
    if (this._skillUIAccum >= 0.1) {
      this._skillUIAccum = 0;
      for (const [key, sk] of Object.entries(this._skills)) {
        const ui = this._skillBtns[key];
        if (!ui) continue;
        const def = SKILL_DEFS[key];
        const canUse = this.gold >= def.cost && sk.cd <= 0 && !sk.active;
        ui.btn.disabled = !canUse;
        ui.btn.classList.toggle('ready', canUse); // 就绪时金色呼吸发光

        if (sk.active) {
          if (ui.name) ui.name.textContent = `${def.name} [激活]`;
          if (ui.cost) ui.cost.textContent = '';
        } else if (sk.cd > 0) {
          if (ui.name) ui.name.textContent = `${def.name} (${Math.ceil(sk.cd)}s)`;
          if (ui.cost) ui.cost.textContent = '';
        } else {
          if (ui.name) ui.name.textContent = def.name;
          if (ui.cost) ui.cost.textContent = `◆${def.cost}`;
        }

        // 更新 CD 进度条和状态文字
        if (ui.cdFill && ui.cdText) {
          const cdPct = def.cooldown > 0 ? sk.cd / def.cooldown : 0;
          ui.cdFill.style.width = `${(1 - cdPct) * 100}%`;
          if (sk.active && def.duration > 0) {
            ui.cdText.textContent = '生效中';
            ui.cdText.style.color = '#4CAF50';
          } else if (sk.cd > 0) {
            ui.cdText.textContent = `CD ${Math.ceil(sk.cd)}s`;
            ui.cdText.style.color = '#F39C12';
          } else {
            ui.cdText.textContent = '就绪';
            ui.cdText.style.color = '#4CAF50';
          }
        }
      }
    }
  }

  // ---- 击杀处理 ----
  _onKill(target, killerType) {
    this.killCount++;
    this._addDamageNum(target.x, target.y - 28, '击杀', false, 'kill');
    if (killerType === 'catapult') this._catapultKills = (this._catapultKills || 0) + 1;

    // 连击
    this.combo++;
    this._comboDecay = 0;
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;

    // 查找当前连击等级
    let comboLevel = null;
    for (let i = COMBO_LEVELS.length - 1; i >= 0; i--) {
      if (this.combo >= COMBO_LEVELS[i].threshold) {
        comboLevel = COMBO_LEVELS[i];
        break;
      }
    }

    // 连击弹出
    if (this.combo >= 3) {
      this._showComboPopup(this.combo, comboLevel);
      if (this.combo >= 3 && this.combo <= 12) {
        this.sound.comboUp(this.combo);
      }
    }

    this.sound.kill();

    // 连击显示
    if (this.combo >= 3) {
      comboDisplay.textContent = comboLevel ? comboLevel.text : `x${this.combo}`;
      comboDisplay.style.color = comboLevel ? comboLevel.color : '#FFD700';
    } else {
      comboDisplay.textContent = '';
    }

    // 连击金币奖励
    if (this.combo >= 3) {
      const bonus = this.combo >= 12 ? 30 : this.combo >= 8 ? 15 : this.combo >= 5 ? 8 : 5;
      this.gold += bonus;
      goldDisplay.textContent = `${this.gold}`;
    }

    // 连击加成
    let comboBonus = 0;
    if (this.combo >= 12) comboBonus = 30;
    else if (this.combo >= 8) comboBonus = 20;
    else if (this.combo >= 5) comboBonus = 10;

    // 击杀粒子
    this._burst(target.x, target.y, '#FFD700', 8, 0, 40, 'spark', {
      up: 30, life: 0.5, lifeR: 0.4, maxLife: 0.9, size: 2, sizeR: 3,
    });
    for (let i = 0; i < 4; i++) {
      this.particles.push({
        x: target.x + (Math.random() - 0.5) * 20,
        y: target.y + Math.random() * 10,
        vx: (Math.random() - 0.5) * 30,
        vy: -5 - Math.random() * 20,
        life: 0.8 + Math.random() * 0.6,
        maxLife: 1.4,
        color: 'rgba(139,119,90,0.6)',
        size: 8 + Math.random() * 10,
        type: 'dust',
      });
    }

    // 金币
    const baseGold = TROOP_DEFS[target.type].cost * 10;
    const bonusGold = comboBonus;
    this.gold += baseGold + bonusGold;
    goldDisplay.textContent = `${this.gold}`;

    // 击杀地面痕迹
    this._killMarks.push({
      x: target.x,
      y: target.y + 20,
      life: 4,
      maxLife: 4,
    });
  }

  // ---- 胜负判定 ----
  _checkVictory() {
    if (this.state !== State.BATTLE) return;
    if (this._celebration) return; // 庆祝中不再重复判定

    const hanAlive = this.units.filter(u => u.side === 'han' && u.hp > 0);
    const jinAlive = this.units.filter(u => u.side === 'jin' && u.hp > 0);

    // 城门被毁 → 攻方（汉）胜利
    if (this.gateHP <= 0) {
      this._endBattle(this.playerSide === 'han' ? 'win' : 'lose');
      return;
    }

    // 攻方全军覆没 → 守方（金）胜利
    if (hanAlive.length === 0) {
      this._endBattle(this.playerSide === 'jin' ? 'win' : 'lose');
      return;
    }

    // 守方全军覆没 + 城门还在 → 攻方仍需破门（不结束）
    // （守方全灭后攻方会自动转火城门）
  }

  // ---- 战斗结束 ----
  _endBattle(result) {
    if (this._celebration) return; // 防止同帧重复触发
    const won = result === 'win';

    // 先播放庆祝特效（慢动作 + 烟花），结束后再显示战报
    this._result = result;
    this._lastResult = result;
    this._celebration = { t: 0, dur: won ? 2.6 : 1.6 };
    this._paused = false;
    this._tutHide();

    // ---- 战功殿入账与战役进度 ----
    if (won) {
      this._meta.wins++;
      if (this.campaign.active && this.campaign.level >= CAMPAIGN_DEFS.length - 1) {
        this._meta.campaignDone = true;
        this._showToast('🏆 战役通关！称号晋升：护国大将军！');
      }
    } else {
      this._meta.losses++;
      this.campaign.active = false; // 战役失败即结束
    }
    const earn = won ? this.gold : Math.floor(this.gold * 0.5);
    if (earn > 0) {
      this._meta.gold += earn;
      this._saveMeta();
      this._showToast(`战功金币 +${earn} ◆（战功殿可升级兵种）`);
    }
    const replayBtn = $('btn-replay');
    if (replayBtn) {
      replayBtn.textContent = (this.campaign.active && won && this.campaign.level < CAMPAIGN_DEFS.length - 1)
        ? '下一关'
        : '再 战';
    }

    const totalSec = Math.floor(this.battleElapsed);
    const playerAlive = this.units.filter(u => u.side === this.playerSide && u.hp > 0).length;

    // 成就检测
    if (won) this._unlockAchievement('first_win');
    if (this.maxCombo >= 8) this._unlockAchievement('combo_8');
    if (won && totalSec <= 120) this._unlockAchievement('speed_120');
    if (won && this.gateHP >= GATE_MAX_HP * 0.8) this._unlockAchievement('gate_80');
    if (won && this._skillsUsed.fire && this._skillsUsed.night && this._skillsUsed.messenger && this._skillsUsed.decree) this._unlockAchievement('all_skills');
    if ((this._catapultKills || 0) >= 5) this._unlockAchievement('catapult_5');
    if (won && this._skillsUsed.decree) this._unlockAchievement('decree_win');

    // 全成就检测
    const allKeys = ['first_win','combo_8','speed_120','gate_80','all_skills','catapult_5','decree_win'];
    if (allKeys.every(k => this.unlockedAchievements[k])) this._unlockAchievement('all_done');

    // 显示胜利画面 — 战报奏章
    const victorySubtitle = document.getElementById('victory-subtitle');
    const seal = document.getElementById('victory-seal');
    const sealText = document.getElementById('seal-text');

    if (won) {
      victoryTitle.textContent = '大 捷';
      victorySubtitle.textContent = this.playerSide === 'han' ? '汉军破城 · 金军溃散' : '金军坚守 · 汉军退却';
      seal.style.borderColor = this.playerSide === 'han' ? '#C0392B' : '#2E86C1';
      sealText.textContent = this.playerSide === 'han' ? '胜' : '固';
      sealText.style.color = this.playerSide === 'han' ? '#C0392B' : '#2E86C1';
    } else {
      victoryTitle.textContent = '败 北';
      victorySubtitle.textContent = '重整旗鼓 · 再战沙场';
      seal.style.borderColor = '#5D6D7E';
      sealText.textContent = '败';
      sealText.style.color = '#5D6D7E';
    }

    // 统计
    document.getElementById('stat-time').textContent = `${Math.floor(this.battleElapsed / 60)}分${Math.floor(this.battleElapsed % 60)}秒`;
    document.getElementById('stat-kills').textContent = `${this.killCount} 人`;
    document.getElementById('stat-gate').textContent = this.gateHP <= 0 ? '已破' : `剩餘 ${Math.ceil(this.gateHP)}`;
    document.getElementById('stat-combo').textContent = `x${this.maxCombo}`;
    document.getElementById('stat-gold').textContent = `◆ ${this.gold}`;

    // 成就
    victoryAchs.innerHTML = '';
    const badgeDefs = [
      { key:'first_win', name:'初出茅庐' },{ key:'combo_8', name:'连击大师' },
      { key:'speed_120', name:'闪电战' },{ key:'gate_80', name:'铜墙铁壁' },
      { key:'all_skills', name:'火力全开' },{ key:'catapult_5', name:'弹无虚发' },
      { key:'decree_win', name:'诏令之主' },{ key:'all_done', name:'全成就' }
    ];
    for (const bd of badgeDefs) {
      if (this.unlockedAchievements[bd.key]) {
        const badge = document.createElement('span');
        badge.className = 'victory-ach-badge';
        badge.textContent = bd.name;
        victoryAchs.appendChild(badge);
      }
    }

    // 失败建议（军师献策）— 针对败因给出儿童能懂的建议
    const advice = document.getElementById('defeat-advice');
    if (!won) {
      let msg = '再试一次！试试调整兵种搭配，军师的光环能大幅提升战力。';
      if (this.killCount === 0) {
        msg = '士兵没有出击！点顶部 ⚑「全军出击」，让部队主动冲向敌人。';
      } else if (this.playerSide === 'han' && this.gateHP > GATE_MAX_HP * 0.6) {
        msg = '破城太慢！多带撞门器（对城门3倍伤害）和投石车远程轰炸。';
      } else if (playerAlive === 0) {
        msg = '全军覆没！别让士兵落单，选中部队一起进攻，记得用技能支援。';
      } else if (!this._skillsUsed.fire && !this._skillsUsed.decree) {
        msg = '忘了用技能！攒够金币放「火攻」或「诏令」，能瞬间扭转战局。';
      }
      advice.textContent = '⚑ 军师献策：' + msg;
      advice.style.display = 'block';
    } else {
      advice.style.display = 'none';
    }

    // 战报在庆祝特效结束后由 _updateBattle 显示
  }

  _drawKillMarks() {
    for (const mark of this._killMarks) {
      const alpha = mark.life / mark.maxLife;
      const grad = ctx.createRadialGradient(mark.x, mark.y, 2, mark.x, mark.y, 12);
      grad.addColorStop(0, `rgba(60,15,5,${alpha * 0.7})`);
      grad.addColorStop(0.5, `rgba(80,20,10,${alpha * 0.4})`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(mark.x, mark.y, 14, 5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawBirds() {
    ctx.fillStyle = '#2C1810';
    for (const bird of this._birds) {
      const alpha = Math.min(1, bird.life / 0.5);
      ctx.globalAlpha = alpha;
      // Left wing
      ctx.beginPath();
      ctx.moveTo(bird.x, bird.y);
      ctx.lineTo(bird.x - bird.size * 2, bird.y - bird.size * 0.3);
      ctx.lineTo(bird.x - bird.size * 2, bird.y + bird.size * 0.3);
      ctx.closePath();
      ctx.fill();
      // Right wing
      ctx.beginPath();
      ctx.moveTo(bird.x, bird.y);
      ctx.lineTo(bird.x + bird.size * 2, bird.y - bird.size * 0.3);
      ctx.lineTo(bird.x + bird.size * 2, bird.y + bird.size * 0.3);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

// ============================================================
// 启动
// ============================================================

Assets.init().then(function() {
  window._game = new Game();
  function resize() {
    const container = document.getElementById('game-container');
    const scaleX = window.innerWidth / 1120;
    const scaleY = window.innerHeight / 790;
    const scale = Math.min(scaleX, scaleY, 1.15);
    container.style.transform = `scale(${scale})`;
    container.style.marginTop = '0px';
  }
  window.addEventListener('resize', resize);
  resize();
}).catch(function(e) {
  console.error('Failed to initialize assets:', e);
});
