// ============================================================
// 汉金之战 — 古代攻城网页游戏
// ============================================================

// ---- DOM 元素 ----
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

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
    this.deployPoints = DEPLOY_POINTS;
    this.selectedType = null;   // 当前选中的兵种 key
    this.selectedUnitIdxs = []; // 多选己方单位索引
    this._dragSelect = null;    // 拖拽框选 { sx, sy, ex, ey }
    this.units = [];            // 已部署的所有单位
    this.gateHP = GATE_MAX_HP;

    // 玩家控制系统
    this.selectedUnitIdxs = []; this.selectedUnitIdx = -1;  // 当前选中的己方单位索引
    this._cmdMarker = null;     // { x, y, life } 移动指令标记
    this._playerControl = true; // 是否启用玩家操控

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
    this._screenShake = 0;
    this._gateFlash = 0;

    // 鼠标/触摸状态
    this.mouseX = 0;
    this.mouseY = 0;
    this.hoveredUnitIdx = -1;

    this._bindEvents();
    this._showOverlay('start');
    this._startGameLoop();
  }

  _startGameLoop() {
    const self = this;
    const loop = (timestamp) => {
      if (this.state === State.BATTLE || this.state === State.NIGHT_BATTLE) {
        if (!this._lastBattleTime) this._lastBattleTime = timestamp;
        const dt = Math.min((timestamp - this._lastBattleTime) / 1000, 0.05);
        this._lastBattleTime = timestamp;
        this._updateBattle(dt);
      }
      // Dragon fire breath visual — runs in ALL states
      this._updateDragonFire(timestamp);
      this._render();
      this._loopId = requestAnimationFrame(loop);
    };
    this._loopId = requestAnimationFrame(loop);
  }

  // Dragon fire breath visual effect (independent of battle state)
  _updateDragonFire(timestamp) {
    if (!this.units) return;
    const now = timestamp / 1000;
    if (!this._lastDragonFire) this._lastDragonFire = 0;
    if (now - this._lastDragonFire < 0.5) return; // every 0.5s
    this._lastDragonFire = now;
    for (let i = 0; i < this.units.length; i++) {
      const u = this.units[i];
      if (u.type === 'dragon' && u.hp > 0) {
        this._dragonFireBreath(u, u.x + (Math.random()-0.5)*80, u.y + 50 + Math.random()*30);
      }
    }
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

  // ---- 覆盖层控制 ----
  _showOverlay(name) {
    overlayStart.classList.toggle('hidden', name !== 'start');
    overlaySetup.classList.toggle('hidden', name !== 'setup');
    overlayVictory.classList.toggle('hidden', name !== 'victory');
    troopBar.classList.toggle('visible', name === 'deployment');
    skillBar.classList.toggle('visible', name === 'battle');

    // 确保部署模式下按钮可见
    if (name === 'deployment') {
      btnStartBattle.style.display = '';
    }

    // 战斗模式下显示操控提示
    const hint = document.getElementById('control-hint');
    if (hint) hint.classList.toggle('visible', name === 'battle');

    if (name === 'start') { this._renderAchievements(); }
  }

  // ---- 事件绑定 ----
  _bindEvents() {
    // 开始游戏 → 进入阵营+战场选择合并画面
    $('btn-start-game').addEventListener('click', () => {
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

    // 确认选择 → 直接进入部署
    $('btn-confirm-setup').addEventListener('click', () => this._confirmSetup());

    // 兵种选择（点击令牌）
    document.querySelectorAll('.troop-token').forEach(el => {
      el.addEventListener('click', () => {
        const type = el.dataset.type;
        const cost = parseInt(el.dataset.cost);
        if (this.deployPoints >= cost) {
          this.selectedType = type;
          this._updateTroopBarUI();
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

    // 触摸事件
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this._updateMouseFromEvent(e.touches[0]);
      if (this.state === State.DEPLOYMENT) {
        this._deployAtCursor();
      } else if (this.state === State.BATTLE) {
        this._handleBattleClick(e);
      }
    });
    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      this._updateMouseFromEvent(e.touches[0]);
    });

    // 自动部署
    $('btn-auto-deploy').addEventListener('click', () => this._autoDeploy());

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

    // 再来一局
    $('btn-replay').addEventListener('click', () => this._resetGame());
  }

  _updateMouseFromEvent(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = CANVAS_W / rect.width;
    const scaleY = CANVAS_H / rect.height;
    this.mouseX = (e.clientX - rect.left) * scaleX;
    this.mouseY = (e.clientY - rect.top) * scaleY;
  }

  _onCanvasClick(e) {
    this._updateMouseFromEvent(e);

    if (this.state === State.DEPLOYMENT) {
      this._deployAtCursor();
    } else if (this.state === State.BATTLE) {
      this._handleBattleClick(e);
    }
  }

  _onCanvasMouseDown(e) {
    this._updateMouseFromEvent(e);
    if (this.state !== State.BATTLE) return;

    // 检测是否点击在己方单位上
    let clickedOwn = false;
    for (const u of this.units) {
      if (u.hp <= 0 || u.side !== this.playerSide) continue;
      const dx = u.x - this.mouseX, dy = u.y - this.mouseY;
      if (Math.sqrt(dx*dx + dy*dy) < 22) { clickedOwn = true; break; }
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
        if (Math.sqrt(dx*dx + dy*dy) < 22) { overOwn = true; break; }
      }
      canvas.style.cursor = overOwn ? 'pointer' : 'crosshair';
    } else if (this.state === State.DEPLOYMENT) {
      canvas.style.cursor = 'crosshair';
    }
  }

  _onCanvasRightClick(e) {
    e.preventDefault();
    this._updateMouseFromEvent(e);
    if (this.state === State.BATTLE) {
      this.selectedUnitIdxs = [];
      this.selectedUnitIdx = -1;
    }
  }

  _handleBattleClick(e) {
    // 查找点击位置的己方单位
    let clickedOwn = -1;
    let clickedEnemy = -1;
    let clickedGate = false;

    // 检测城门
    const gx = 860, gy = 340;
    if (Math.sqrt((this.mouseX - gx) ** 2 + (this.mouseY - gy) ** 2) < 40) {
      clickedGate = true;
    }

    // 检测单位
    for (let i = 0; i < this.units.length; i++) {
      const u = this.units[i];
      if (u.hp <= 0) continue;
      const dx = u.x - this.mouseX;
      const dy = u.y - this.mouseY;
      if (Math.sqrt(dx * dx + dy * dy) < 22) {
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
    } else if (this._getSelectedUnits().length > 0) {
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
    ['canyon','forest'].forEach(m => {
      const btn = $('btn-' + m);
      btn.classList.toggle('selected', this._pendingMap === m);
    });
    // 两项都选好才启用确认按钮
    $('btn-confirm-setup').disabled = !(this._pendingSide && this._pendingMap);
  }

  _confirmSetup() {
    if (!this._pendingSide || !this._pendingMap) return;

    this.playerSide = this._pendingSide;
    this.aiSide = this._pendingSide === 'han' ? 'jin' : 'han';
    const vsHan = vsBadge.querySelector('.vs-han');
    const vsJin = vsBadge.querySelector('.vs-jin');
    if (this._pendingSide === 'han') {
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

    this.mapType = this._pendingMap;
    this._forestSeed = 12345;
    this.state = State.DEPLOYMENT;
    this.deployPoints = DEPLOY_POINTS;
    this.units = [];
    this.selectedType = null;
    this.gateHP = GATE_MAX_HP;

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
      el.classList.toggle('selected', type === this.selectedType);
      el.classList.toggle('disabled', this.deployPoints < cost);
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
    const tooClose = this.units.some(u => {
      const dx = u.x - this.mouseX;
      const dy = u.y - this.mouseY;
      return Math.sqrt(dx*dx + dy*dy) < 40;
    });
    if (tooClose) return;

    this.units.push({
      type: this.selectedType,
      name: SOLDIER_NAMES[Math.floor(Math.random() * SOLDIER_NAMES.length)],
      x: this.mouseX,
      y: this.selectedType === 'dragon' ? Math.max(200, Math.min(260, this.mouseY)) : this.mouseY,
      hp: def.hp,
      maxHP: def.hp,
      side: this.playerSide,
      state: 'idle',
      targetX: null,
      targetY: null,
      atkCooldown: 0,
      _sprite: Assets.get('unit_' + this.playerSide + '_' + this.selectedType),
      _bobPhase: Math.random() * Math.PI * 2,
      _attackFlash: 0,
    });

    this.deployPoints -= def.cost;
    if (this.deployPoints < def.cost) this.selectedType = null;

    pointsNum.textContent = this.deployPoints;
    this._updateTroopBarUI();
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
    if (this._weather.type === 'wind' && (u.type === 'catapult' || u.type === 'spear')) {
      range *= 1.5;
    }
    if (this._isOnHighGround(u.x, u.y)) range *= 1.2;
    return range;
  }

  // 计算基础伤害（暴击/格挡前）
  _calcDamage(u, target, hasAtkAura, isGate) {
    const def = TROOP_DEFS[u.type];
    let dmg = def.atk;
    const isPlayer = u.side === this.playerSide;

    if (isGate) {
      if (u.type === 'ram') dmg *= 3;
    } else if (target) {
      if (u.type === 'spear' && target.type === 'cavalry') dmg *= 2;
    }

    if (isPlayer && this._pickupBuffs.atk > 0) dmg *= 1.5;
    if (isPlayer && this._decreeBuff.atk > 0) dmg *= 1.15;
    if (hasAtkAura) dmg *= (1 + TROOP_DEFS.strategist.atkAura);
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
  _doGateAttack(u, def, hasAtkAura) {
    const gx = 860, gy = 340;
    let dmg = this._calcDamage(u, null, hasAtkAura, true);
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

  // ---- 玩家单位更新（每帧调用） ----
  _updatePlayerUnit(u, def, alive, hasAtkAura, hasSpdDebuff, dt) {
    // 清除失效指令
    if (u.cmdType === 'attack' && u.cmdTarget != null) {
      const t = this.units[u.cmdTarget];
      if (!t || t.hp <= 0) { u.cmdType = null; u.cmdTarget = null; }
    }
    if (u.cmdType === 'move') {
      const dx = u.x - u.cmdX, dy = u.y - u.cmdY;
      if (Math.sqrt(dx*dx + dy*dy) < 8) { u.cmdType = null; }
    }

    // 无指令时自动反击范围内的敌人
    if (!u.cmdType) {
      let nearestEnemy = null, nearestDist = Infinity;
      for (const enemy of alive) {
        if (enemy.side === u.side) continue;
        const dx = enemy.x - u.x, dy = enemy.y - u.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < def.range + 15 && dist < nearestDist) {
          nearestDist = dist;
          nearestEnemy = enemy;
        }
      }
      if (nearestEnemy) {
        this._doAttack(u, def, nearestEnemy, hasAtkAura, false);
      }
      return;
    }

    // 执行移动指令
    if (u.cmdType === 'move') {
      const dx = u.cmdX - u.x, dy = u.cmdY - u.y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      if (dist < 5) { u.cmdType = null; return; }

      // 移动途中遇到敌人自动攻击
      let nearestEnemy = null, nearestDist = Infinity;
      for (const enemy of alive) {
        if (enemy.side === u.side) continue;
        const edx = enemy.x - u.x, edy = enemy.y - u.y;
        const edist = Math.sqrt(edx*edx + edy*edy);
        if (edist < def.range && edist < nearestDist) {
          nearestDist = edist;
          nearestEnemy = enemy;
        }
      }
      if (nearestEnemy && u.atkCooldown <= 0) {
        this._doAttack(u, def, nearestEnemy, hasAtkAura, false);
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
          this._doAttack(u, def, t, hasAtkAura, false);
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
          this._doGateAttack(u, def, hasAtkAura);
        }
      } else {
        const spd = this._getEffectiveSpeed(u, hasSpdDebuff);
        this._moveToward(u, dx, dy, dist, spd, dt, false);
      }
      return;
    }
  }

  // 执行一次攻击（复用攻击逻辑）
  _doAttack(u, def, target, hasAtkAura, isGate) {
    // Dragon breathes fire at target
    if (u.type === 'dragon' && !isGate) {
      this._dragonFireBreath(u, target.x, target.y);
    }
    let dmg = this._calcDamage(u, target, hasAtkAura, false);
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
  _spawnAttackFX(u, tx, ty, isCrit, isGate) {
    const sideColor = u.side === 'han' ? '#E74C3C' : '#3498DB';
    const meleeTypes = ['sword', 'spear', 'halberd', 'cavalry', 'shield', 'ram'];
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
    const sparkCount = isCrit ? 8 : 4;
    for (let i = 0; i < sparkCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 50 + Math.random() * 120;
      this.particles.push({
        x: tx, y: ty,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.2 + Math.random() * 0.3,
        maxLife: 0.5,
        color: isCrit ? '#FFD700' : sideColor,
        size: 1.5 + Math.random() * 2.5,
        type: 'spark',
      });
    }

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

    if (this.playerSide === 'han') {
      this._executeDeployPlan([
        'catapult','dragon','crossbow','crossbow','crossbow',
        'ram','ram','cavalry','cavalry','cavalry',
        'strategist','shield','shield','halberd','halberd',
        'spear','spear','spear','sword','sword','sword','sword',
      ]);
    } else {
      this._executeDeployPlan([
        'catapult','dragon','crossbow','crossbow','crossbow',
        'strategist','shield','shield','shield','halberd',
        'halberd','cavalry','cavalry','cavalry','spear',
        'spear','spear','sword','sword','sword','sword',
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
        const tooClose = this.units.some(u => {
          const dx = u.x - x;
          const dy = u.y - y;
          return Math.sqrt(dx*dx + dy*dy) < 45;
        });
        if (!tooClose) {
          this.units.push({
            type, name: SOLDIER_NAMES[Math.floor(Math.random() * SOLDIER_NAMES.length)],
            x, y, hp: def.hp, maxHP: def.hp,
            side: this.playerSide, state: 'idle',
            targetX: null, targetY: null, atkCooldown: 0,
            _sprite: Assets.get('unit_' + this.playerSide + '_' + type),
            _bobPhase: Math.random() * Math.PI * 2,
            _attackFlash: 0,
          });
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
  _startBattle() {
    if (this.units.length === 0) {
      this._showToast('请先部署士兵！');
      return;
    }
    this.state = State.BATTLE;
    this.battleElapsed = 0;
    this._lastBattleTime = 0;
    this.combo = 0;
    this._comboDecay = 0;
    this.gold = 0;
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
    this._skills = {
      fire:      { cd: 0, active: false, timer: 0 },
      night:     { cd: 0, active: false, timer: 0 },
      messenger: { cd: 0, active: false, timer: 0 },
      decree:    { cd: 0, active: false, timer: 0 },
    };
    this._nightMode = false;
    this._weather = { type: 'clear', timer: 0, nextChange: 40 };
    this._terrain = [];
    this._chests = [];
    this._chestSpawnTimer = 0;
    this._chestSpawnDelay = 20;
    this._pickupBuffs = { atk: 0, spd: 0 };
    this._messengerBuff = 0;
    this._decreeBuff = { atk: 0, enemySlow: 0 };
    this.selectedUnitIdxs = [];
    this.selectedUnitIdx = -1;
    this._cmdMarker = null;
    comboDisplay.textContent = '';
    goldDisplay.textContent = `${this.gold}`;
    timerDisplay.textContent = '00:00';

    // 生成地形
    this._generateTerrain();

    // 生成 AI 单位
    this._spawnAIUnits();

    this._showOverlay('battle');
    btnStartBattle.style.display = 'none';
  }

  _spawnAIUnits() {
    const playerCount = this.units.filter(u => u.side === this.playerSide).length;
    const zone = this.aiSide === 'han'
      ? { xMin: 80, xMax: 460, yMin: 300, yMax: 470 }
      : { xMin: 520, xMax: 800, yMin: 300, yMax: 470 };

    const plan = this._generateAIPlan(playerCount);

    let pts2 = DEPLOY_POINTS;
    for (let ti2 = 0; ti2 < plan.length; ti2++) {
      const type2 = plan[ti2];
      const def2 = TROOP_DEFS[type2];
      if (pts2 < def2.cost) continue;
      const isDragonAI = type2 === 'dragon';
      for (let attempt2 = 0; attempt2 < 50; attempt2++) {
        const x2 = zone.xMin + Math.random() * (zone.xMax - zone.xMin);
        const y2 = isDragonAI ? 200 + Math.random() * 60 : zone.yMin + Math.random() * (zone.yMax - zone.yMin);
        const tooClose2 = this.units.some(function(u2) {
          const dx2 = u2.x - x2;
          const dy2 = u2.y - y2;
          return Math.sqrt(dx2*dx2 + dy2*dy2) < 45;
        });
        if (!tooClose2) {
          this.units.push({
            type: type2, name: SOLDIER_NAMES[Math.floor(Math.random() * SOLDIER_NAMES.length)],
            x: x2, y: y2, hp: def2.hp, maxHP: def2.hp,
            side: this.aiSide, state: 'idle',
            targetX: null, targetY: null, atkCooldown: 0,
            _sprite: Assets.get('unit_' + this.aiSide + '_' + type2),
            _bobPhase: Math.random() * Math.PI * 2,
            _attackFlash: 0,
          });
          pts2 -= def2.cost;
          break;
        }
      }
    }
  }

  _generateAIPlan(targetCount) {
    const plan = [];
    let budget = DEPLOY_POINTS;

    // Always try to include strategist and catapult for tactical variety
    const priorityTypes = ['strategist', 'catapult', 'dragon'];
    for (const type of priorityTypes) {
      if (plan.length < targetCount && TROOP_DEFS[type].cost <= budget) {
        plan.push(type);
        budget -= TROOP_DEFS[type].cost;
      }
    }

    // Fill remaining slots with a balanced mix
    const tier2 = ['crossbow', 'shield', 'cavalry', 'halberd', 'spear', 'ram'];
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

  // ---- 重置游戏 ----
  _resetGame() {
    this.state = State.START_SCREEN;
    this.playerSide = null;
    this.mapType = 'canyon';
    this.aiSide = null;
    this._pendingSide = null;
    this._pendingMap = null;
    this.deployPoints = DEPLOY_POINTS;
    this.selectedType = null;
    this.units = [];
    this.gateHP = GATE_MAX_HP;
    this.combo = 0;
    this._comboDecay = 0;
    this.gold = 0;
    this.killCount = 0;
    this._catapultKills = 0;
    this.maxCombo = 0;
    this.battleElapsed = 0;
    this.damageNumbers = [];
    this.particles = [];
    this._screenShake = 0;
    this._gateFlash = 0;
    this._lastBattleTime = 0;
    this._shownAchievements = { ...this.unlockedAchievements };
    this._skillsUsed = { fire: false, night: false, messenger: false, decree: false };
    this._skills = {
      fire:      { cd: 0, active: false, timer: 0 },
      night:     { cd: 0, active: false, timer: 0 },
      messenger: { cd: 0, active: false, timer: 0 },
      decree:    { cd: 0, active: false, timer: 0 },
    };
    this._nightMode = false;
    this._weather = { type: 'clear', timer: 0, nextChange: 40 };
    this._terrain = [];
    this._chests = [];
    this._chestSpawnTimer = 0;
    this._chestSpawnDelay = 20;
    this._pickupBuffs = { atk: 0, spd: 0 };
    this._messengerBuff = 0;
    this._decreeBuff = { atk: 0, enemySlow: 0 };
    this.selectedUnitIdxs = [];
    this.selectedUnitIdx = -1;
    this._cmdMarker = null;
    this._showOverlay('start');
    btnStartBattle.style.display = '';
    const vsHan2 = vsBadge.querySelector('.vs-han');
    const vsJin2 = vsBadge.querySelector('.vs-jin');
    vsHan2.style.color = '';
    vsHan2.style.textShadow = '';
    vsJin2.style.color = '';
    vsJin2.style.textShadow = '';
    comboDisplay.textContent = '';
    timerDisplay.textContent = '00:00';
    goldDisplay.textContent = '0';
  }

  // ---- Toast 提示 ----
  _showToast(msg) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    document.getElementById('game-container').appendChild(el);
    setTimeout(() => el.remove(), 2200);
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

  _render() {
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    // 每帧重置森林随机种子，消除背景闪烁
    if (this.mapType === 'forest') this._forestSeed = 12345;

    // 屏幕震动
    let shakeX = 0, shakeY = 0;
    if (this._screenShake > 0.1) {
      shakeX = (Math.random() - 0.5) * this._screenShake * 2;
      shakeY = (Math.random() - 0.5) * this._screenShake * 2;
      ctx.save();
      ctx.translate(shakeX, shakeY);
    }

    this._drawSky();
    if (this.mapType === 'forest') {
      this._drawForest();
    } else {
      this._drawCanyon();
    }
    this._drawCastle();
    this._drawBirds();

    if (this.state === State.DEPLOYMENT) {
      this._drawDeployZone();
    }

    this._drawTerrain();
    this._drawKillMarks();
    this._drawUnits();
    this._drawChests();
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

    // 战斗中的顶栏信息
    if (this.state === State.BATTLE && this.combo >= 8) {
      // 高连击时顶栏金光闪烁
      comboDisplay.style.color = this.combo >= 10 ? '#FF4500' : '#FFD700';
      comboDisplay.style.fontSize = this.combo >= 10 ? '22px' : '18px';
    }
  }

  _drawSky() {
    // 雷暴闪白
    if (this._lightningFlash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${this._lightningFlash * 0.3})`;
      ctx.fillRect(0, 0, 1100, 550);
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

        // 萤火虫
        ctx.fillStyle = 'rgba(255,255,150,0.5)';
        for (let i = 0; i < 12; i++) {
          const fx = 50 + i * 90 + Math.sin(Date.now() / 2000 + i) * 30;
          const fy = 40 + Math.cos(Date.now() / 3000 + i) * 30;
          ctx.beginPath();
          ctx.arc(fx, fy, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
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

        // 闪电（使用 Math.random 保持动态）
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
      const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
      grad.addColorStop(0, '#1A1A2E');
      grad.addColorStop(0.3, '#252540');
      grad.addColorStop(0.6, '#303050');
      grad.addColorStop(1, '#3A3A5A');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      // 闪电（多层 + 光晕）
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

      // 地面积水反光（雨天）
      if (this._weather && this._weather.type === 'rain' && this.state === 4) {
        const waterGrad = ctx.createLinearGradient(0, 280, 0, 550);
        waterGrad.addColorStop(0, 'rgba(100,150,200,0.03)');
        waterGrad.addColorStop(1, 'rgba(100,150,200,0.06)');
        ctx.fillStyle = waterGrad;
        ctx.fillRect(0, 280, 1100, 270);
      }
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

      // 热浪波纹 + 光柱（晴天战斗中）
      if (this._weather && this._weather.type === 'clear' && (this.state === 4 || this.state === 5)) {
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
      }
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
    const clouds = [Assets.get('png_cloud1'), Assets.get('png_cloud2'),
                    Assets.get('png_cloud3'), Assets.get('png_cloud4'),
                    Assets.get('png_cloud5')];
    // 基于 x,y 选择固定云朵变体
    const idx = Math.floor((x * 7 + y * 13) % clouds.length);
    const cloudPNG = clouds[idx];
    if (cloudPNG) {
      ctx.save();
      if (color) {
        // 从 rgba() 字符串提取 alpha 值
        const m = color.match(/([\d.]+)\)\s*$/);
        ctx.globalAlpha = m ? parseFloat(m[1]) : 0.9;
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

  _drawCastle() {
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

    // 城门 HP 条
    if (this.state === State.BATTLE) {
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
      ctx.fillText('漢 · 部署区', 270, 298);
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

      // 阴影
      const shadowGrad = ctx.createRadialGradient(u.x, u.y + 23, 2, u.x, u.y + 23, 14);
      shadowGrad.addColorStop(0, 'rgba(0,0,0,0.35)');
      shadowGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = shadowGrad;
      ctx.beginPath();
      ctx.ellipse(u.x, u.y + 23, 16, 4, 0, 0, Math.PI * 2);
      ctx.fill();

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

      // 军师光环
      if (u.type === 'strategist') {
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 6]);
        ctx.beginPath();
        ctx.arc(u.x, u.y, TROOP_DEFS.strategist.auraRange, 0, Math.PI * 2);
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
        const drawW = u.type === 'dragon' ? 72 : 48;
        const drawH = u.type === 'dragon' ? 84 : 56;
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

      // 名字
      ctx.fillStyle = '#fff';
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

      // 分段绘制
      for (let s = 0; s < segments; s++) {
        const sx = barX + s * (segW + 0.5);
        if (s < fullSegs) {
          const segGrad = ctx.createLinearGradient(sx, 0, sx + segW, 0);
          if (hpPct > 0.5) { segGrad.addColorStop(0, '#2ECC71'); segGrad.addColorStop(1, '#27AE60'); }
          else if (hpPct > 0.25) { segGrad.addColorStop(0, '#F39C12'); segGrad.addColorStop(1, '#E67E22'); }
          else { segGrad.addColorStop(0, '#E74C3C'); segGrad.addColorStop(1, '#C0392B'); }
          ctx.fillStyle = segGrad;
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
  _drawPortrait(cx, cy, r, u, def) {
    // 根据名字生成一致的随机种子
    const seed = (u.name || 'a').charCodeAt(0) * 31 + u.type.charCodeAt(0) * 7;
    const rng = (max) => ((seed * 1103515245 + 12345) % 2147483648) / 2147483648 * max;
    const pick = (arr) => arr[Math.floor(rng(arr.length))];

    // 边框光环（阵营色）
    const sideColor = u.side === 'han' ? '#E74C3C' : '#3498DB';
    ctx.fillStyle = sideColor;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 2, 0, Math.PI * 2);
    ctx.fill();

    // 脸型底色
    const skinTones = ['#FDDCB5', '#F5D0A9', '#E8C39E', '#D4A574', '#F0C8A0'];
    const skin = pick(skinTones);
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    // 头盔/帽子（根据兵种类型）
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();

    const helmetColors = {
      sword: '#888', spear: '#777', halberd: '#666', cavalry: '#8B4513',
      ram: '#5D4037', catapult: '#7F8C8D', crossbow: '#556B2F',
      shield: '#4A5568', strategist: '#2C3E50', dragon: '#C0392B',
    };
    const hColor = helmetColors[u.type] || '#888';

    switch (u.type) {
      case 'sword':
        // 锥形铁盔
        ctx.fillStyle = hColor;
        ctx.beginPath();
        ctx.moveTo(cx - r, cy - 2);
        ctx.lineTo(cx, cy - r - 6);
        ctx.lineTo(cx + r, cy - 2);
        ctx.closePath();
        ctx.fill();
        ctx.fillRect(cx - r, cy - 2, r * 2, r * 0.45);
        break;
      case 'spear':
        // 尖顶盔
        ctx.fillStyle = hColor;
        ctx.beginPath();
        ctx.moveTo(cx - r, cy);
        ctx.lineTo(cx - r + 3, cy - r - 4);
        ctx.lineTo(cx, cy - r - 8);
        ctx.lineTo(cx + r - 3, cy - r - 4);
        ctx.lineTo(cx + r, cy);
        ctx.closePath();
        ctx.fill();
        break;
      case 'halberd':
        // 重盔
        ctx.fillStyle = hColor;
        ctx.fillRect(cx - r - 2, cy - r - 3, r * 2 + 4, r * 0.75);
        ctx.fillStyle = '#555';
        ctx.fillRect(cx - 3, cy - r - 5, 6, 4);
        break;
      case 'cavalry':
        // 马鬃盔
        ctx.fillStyle = hColor;
        ctx.beginPath();
        ctx.arc(cx, cy - 1, r + 1, Math.PI, 0);
        ctx.fill();
        ctx.fillStyle = '#C0392B';
        ctx.beginPath();
        ctx.moveTo(cx - 2, cy - r - 2);
        ctx.lineTo(cx + 6, cy - r - 8);
        ctx.lineTo(cx + 2, cy - r);
        ctx.fill();
        break;
      case 'ram':
        // 加固头盔
        ctx.fillStyle = hColor;
        ctx.fillRect(cx - r - 1, cy - r - 1, r * 2 + 2, r * 0.7);
        ctx.strokeStyle = '#3E2723';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx - r, cy - 2);
        ctx.lineTo(cx + r, cy - 2);
        ctx.stroke();
        break;
      case 'catapult':
        // 开面盔
        ctx.fillStyle = hColor;
        ctx.beginPath();
        ctx.arc(cx, cy - 1, r + 1, Math.PI, 0);
        ctx.fill();
        ctx.fillStyle = skin;
        ctx.fillRect(cx - 5, cy - 2, 10, 8);
        break;
      case 'crossbow':
        // 轻皮帽
        ctx.fillStyle = hColor;
        ctx.beginPath();
        ctx.ellipse(cx, cy - r * 0.2, r + 1, r * 0.5, 0, Math.PI, 0);
        ctx.fill();
        break;
      case 'shield':
        // 全罩盔
        ctx.fillStyle = hColor;
        ctx.beginPath();
        ctx.arc(cx, cy, r + 1, Math.PI * 1.1, Math.PI * 1.9);
        ctx.fill();
        ctx.fillStyle = '#333';
        ctx.fillRect(cx - 3, cy - 1, 6, 2);
        break;
      case 'strategist':
        // 文士冠
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(cx - r, cy - r - 1, r * 2, 3);
        ctx.fillRect(cx - 2, cy - r - 6, 4, 6);
        break;
    }
    ctx.restore();

    // 眼睛
    const eyeY = cy - 1;
    // 眼白
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(cx - 5, eyeY, 3.5, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx + 5, eyeY, 3.5, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    // 瞳孔
    ctx.fillStyle = '#1a1a2e';
    ctx.beginPath();
    ctx.arc(cx - 4, eyeY, 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + 6, eyeY, 1.8, 0, Math.PI * 2);
    ctx.fill();
    // 高光
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(cx - 3, eyeY - 1.5, 0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + 7, eyeY - 1.5, 0.7, 0, Math.PI * 2);
    ctx.fill();

    // 眉毛
    ctx.strokeStyle = '#4a3728';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 8, eyeY - 4);
    ctx.lineTo(cx - 2, eyeY - 3);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + 2, eyeY - 3);
    ctx.lineTo(cx + 8, eyeY - 4);
    ctx.stroke();

    // 嘴巴（微笑）
    ctx.strokeStyle = '#C96A4B';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy + 5, 3.5, 0.1 * Math.PI, 0.9 * Math.PI);
    ctx.stroke();

    // 脸颊红晕
    ctx.fillStyle = 'rgba(255,150,150,0.25)';
    ctx.beginPath();
    ctx.ellipse(cx - 8, cy + 2, 3, 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx + 8, cy + 2, 3, 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }

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
          const grad = ctx.createRadialGradient(p.x, p.y, p.size * 0.1, p.x, p.y, p.size);
          grad.addColorStop(0, 'rgba(255,255,200,0.9)');
          grad.addColorStop(0.3, 'rgba(255,150,20,0.7)');
          grad.addColorStop(0.7, 'rgba(255,60,0,0.4)');
          grad.addColorStop(1, 'rgba(255,20,0,0)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
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
        case 'dust':
          ctx.fillStyle = 'rgba(139,119,90,0.5)';
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'star': {
          const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 3);
          grad.addColorStop(0, 'rgba(255,255,255,0.9)');
          grad.addColorStop(0.2, 'rgba(255,215,0,0.7)');
          grad.addColorStop(1, 'rgba(255,215,0,0)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
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
          const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
          grad.addColorStop(0, 'rgba(255,255,255,0.9)');
          grad.addColorStop(0.3, 'rgba(255,200,50,0.6)');
          grad.addColorStop(1, 'rgba(255,100,0,0)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
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
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    timerDisplay.textContent = `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;

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
      const types = ['clear', 'rain', 'wind', 'storm', 'storm', 'storm', 'storm'];
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
      // 雷击随机伤害
      if (Math.random() < 0.025) {
        const allUnits = this.units.filter(u => u.hp > 0);
        if (allUnits.length > 0) {
          const victim = allUnits[Math.floor(Math.random() * allUnits.length)];
          const boltDmg = 8 + Math.random() * 12;
          victim.hp -= boltDmg;
          this._lightningFlash = 0.15;
          this._addDamageNum(victim.x, victim.y - 28, Math.round(boltDmg), true, 'crit');
          this._screenShake = Math.max(this._screenShake, 5);
          // 闪电粒子
          for (let i = 0; i < 5; i++) {
            this.particles.push({
              x: victim.x + (Math.random() - 0.5) * 60, y: victim.y - 40 + Math.random() * 20,
              vx: (Math.random() - 0.5) * 20, vy: -10 - Math.random() * 20,
              life: 0.3, maxLife: 0.3, color: null, size: 2, type: 'spark',
            });
          }
          if (victim.hp <= 0) {
            victim.hp = 0;
            victim._deathTime = this.battleElapsed;
            this._killMarks.push({
              x: victim.x, y: victim.y + 15,
              life: 3, maxLife: 3,
            });
            this._onKill(victim, 'storm');
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

    // 预提取 strategist 列表，避免 O(n²) 扫描
    const auraRangeSq = TROOP_DEFS.strategist.auraRange * TROOP_DEFS.strategist.auraRange;
    const playerStrategists = [];
    const enemyStrategists = [];
    for (const st of alive) {
      if (st.type !== 'strategist') continue;
      if (st.side === this.playerSide) playerStrategists.push(st);
      else enemyStrategists.push(st);
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

      // 军师光环（O(1) 预过滤，平方距离避免 sqrt）
      let hasAtkAura = false, hasSpdDebuff = false;
      if (u.type !== 'strategist') {
        const friendlyStrats = (u.side === this.playerSide) ? playerStrategists : enemyStrategists;
        const hostileStrats  = (u.side === this.playerSide) ? enemyStrategists : playerStrategists;
        for (const st of friendlyStrats) {
          const adx = u.x - st.x, ady = u.y - st.y;
          if (adx * adx + ady * ady < auraRangeSq) { hasAtkAura = true; break; }
        }
        for (const st of hostileStrats) {
          const adx = u.x - st.x, ady = u.y - st.y;
          if (adx * adx + ady * ady < auraRangeSq) { hasSpdDebuff = true; break; }
        }
      }

      // 玩家单位：执行指令而非自动 AI
      if (u.side === this.playerSide) {
        this._updatePlayerUnit(u, def, alive, hasAtkAura, hasSpdDebuff, dt);
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
            this._doGateAttack(u, def, hasAtkAura);
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
            this._doAttack(u, def, target, hasAtkAura, false);
          }
        } else {
          const spd = this._getEffectiveSpeed(u, hasSpdDebuff);
          this._moveToward(u, dx, dy, dist, spd, dt, true);
        }
      }
    }

    // ---- 更新粒子 ----
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.type === 'fire') { p.size += 8 * dt; p.vy -= 15 * dt; }
      if (p.type === 'spark') { p.vy -= 30 * dt; p.vx *= 0.98; }
      if (p.type === 'rain') { p.vy += 300 * dt; }
      if (p.type === 'dust') { p.vy += 20 * dt; p.size += 2 * dt; }
      if (p.type === 'star') { p.vy -= 10 * dt; p.size = 2 + Math.sin(p.life * 10) * 1; }
      if (p.type === 'smoke') { p.size += 15 * dt; p.vx *= 0.95; p.vy *= 0.95; }
      if (p.type === 'confetti') { p.vy += 80 * dt; p.vx += Math.sin(p.life * 8) * 30 * dt; }
      if (p.type === 'slash') { /* static, just fades */ }
      if (p.type === 'tracer') { /* static, just fades */ }
      if (p.type === 'impact') { p.size += 60 * dt; p.vy -= 10 * dt; }
    }
    this.particles = this.particles.filter(p => p.life > 0);

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

  // ---- 技能激活 ----
  _activateSkill(key) {
    if (this.state !== State.BATTLE && this.state !== State.NIGHT_BATTLE) return;
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

    const types = ['sword', 'spear', 'halberd', 'cavalry', 'crossbow', 'shield'];
    const count = 3 + Math.floor(Math.random() * 2); // 3-4 units

    for (let i = 0; i < count; i++) {
      const type = types[Math.floor(Math.random() * types.length)];
      const def = TROOP_DEFS[type];
      for (let attempt = 0; attempt < 30; attempt++) {
        const x = zone.xMin + Math.random() * (zone.xMax - zone.xMin);
        const y = zone.yMin + Math.random() * (zone.yMax - zone.yMin);
        const tooClose = this.units.some(u => {
          if (u.hp <= 0) return false;
          const dx = u.x - x;
          const dy = u.y - y;
          return Math.sqrt(dx*dx + dy*dy) < 40;
        });
        if (!tooClose) {
          this.units.push({
            type, name: SOLDIER_NAMES[Math.floor(Math.random() * SOLDIER_NAMES.length)],
            x, y, hp: def.hp, maxHP: def.hp,
            side: this.playerSide, state: 'idle',
            targetX: null, targetY: null, atkCooldown: 0,
            _sprite: Assets.get('unit_' + this.playerSide + '_' + type),
            _bobPhase: Math.random() * Math.PI * 2,
            _attackFlash: 0,
          });
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
      for (let i = 0; i < 15; i++) {
        this.particles.push({
          x: enemy.x + (Math.random() - 0.5) * 80,
          y: enemy.y + (Math.random() - 0.5) * 40,
          vx: (Math.random() - 0.5) * 100,
          vy: -50 - Math.random() * 80,
          life: 0.8 + Math.random() * 1.2,
          maxLife: 2,
          color: null,
          size: 2 + Math.random() * 5,
          type: 'star',
        });
      }

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
    for (let i = 0; i < 20; i++) {
      const colors = ['#FFD700', '#FF6B00', '#FF4500', '#FFA500', '#FFEC8B'];
      this.particles.push({
        x: chest.x, y: chest.y,
        vx: (Math.random() - 0.5) * 100,
        vy: -50 - Math.random() * 80,
        life: 0.6 + Math.random() * 0.6,
        maxLife: 1.2,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 3 + Math.random() * 4,
        type: 'confetti',
      });
    }
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
              weatherIcon.textContent = '';
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

    // 更新技能按钮 UI
    for (const [key, sk] of Object.entries(this._skills)) {
      const btn = $(`btn-${key}`);
      if (!btn) continue;
      const def = SKILL_DEFS[key];
      const canUse = this.gold >= def.cost && sk.cd <= 0 && !sk.active;
      btn.disabled = !canUse;

      const labelEl = btn.querySelector('.skill-name');
      const costEl = btn.querySelector('.skill-cost');
      if (sk.active) {
        if (labelEl) labelEl.textContent = `${def.name} [激活]`;
        if (costEl) costEl.textContent = '';
      } else if (sk.cd > 0) {
        if (labelEl) labelEl.textContent = `${def.name} (${Math.ceil(sk.cd)}s)`;
        if (costEl) costEl.textContent = '';
      } else {
        if (labelEl) labelEl.textContent = def.name;
        if (costEl) costEl.textContent = `◆${def.cost}`;
      }

      // 更新 CD 进度条和状态文字
      const cdFill = btn.querySelector('.skill-cd-fill');
      const cdText = btn.querySelector('.skill-cd-text');
      if (cdFill && cdText) {
        const cdPct = def.cooldown > 0 ? sk.cd / def.cooldown : 0;
        cdFill.style.width = `${(1 - cdPct) * 100}%`;
        if (sk.active && def.duration > 0) {
          cdText.textContent = '生效中';
          cdText.style.color = '#4CAF50';
        } else if (sk.cd > 0) {
          cdText.textContent = `CD ${Math.ceil(sk.cd)}s`;
          cdText.style.color = '#F39C12';
        } else {
          cdText.textContent = '就绪';
          cdText.style.color = '#4CAF50';
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
    for (let i = 0; i < 8; i++) {
      this.particles.push({
        x: target.x, y: target.y,
        vx: (Math.random() - 0.5) * 80,
        vy: -30 - Math.random() * 60,
        life: 0.5 + Math.random() * 0.4,
        maxLife: 0.9,
        color: '#FFD700',
        size: 2 + Math.random() * 3,
        type: 'spark',
      });
    }
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
    this.state = State.VICTORY;

    const won = result === 'win';
    if (won) this.sound.victory(); else this.sound.defeat();
    const totalSec = Math.floor(this.battleElapsed);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    const timeStr = `${min}:${String(sec).padStart(2, '0')}`;
    const hanAlive = this.units.filter(u => u.side === 'han' && u.hp > 0).length;
    const jinAlive = this.units.filter(u => u.side === 'jin' && u.hp > 0).length;
    const playerAlive = this.units.filter(u => u.side === this.playerSide && u.hp > 0).length;

    // 星级评价
    let stars = 0;
    if (won) stars = 1;
    if (won && playerAlive >= 3) stars = 2;
    if (won && playerAlive >= 5 && this.maxCombo >= 5) stars = 3;

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
      victorySubtitle.textContent = this.playerSide === 'han' ? '漢軍破城 · 金軍潰散' : '金軍堅守 · 漢軍退卻';
      seal.style.borderColor = this.playerSide === 'han' ? '#C0392B' : '#2E86C1';
      sealText.textContent = this.playerSide === 'han' ? '勝' : '固';
      sealText.style.color = this.playerSide === 'han' ? '#C0392B' : '#2E86C1';
    } else {
      victoryTitle.textContent = '敗 北';
      victorySubtitle.textContent = '重整旗鼓 · 再戰沙場';
      seal.style.borderColor = '#5D6D7E';
      sealText.textContent = '敗';
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

    this._showOverlay('victory');
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
