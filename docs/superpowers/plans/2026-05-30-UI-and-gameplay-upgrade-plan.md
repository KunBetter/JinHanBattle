# UI/视觉/战斗体验升级 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将汉金之战的 UI、战场氛围、单位表现和战斗反馈从基础状态升级为"古卷画轴风"沉浸式体验

**Architecture:** 保持现有零依赖架构——所有改动集中在 index.html (HTML结构)、style.css (样式)、game.js (逻辑+Canvas渲染)、assets.js (精灵图生成) 四个文件中。每个阶段独立可验证，阶段间无代码冲突。

**Tech Stack:** HTML5 Canvas 2D, CSS3, ES6 JavaScript, Web Audio API

**Estimated total tasks:** 10 个, 每任务 5-20 步骤

---

## 阶段 1: UI 界面重设计

### Task 1: 顶栏 → 指挥卷轴

**Files:**
- Modify: `index.html` (顶栏 HTML 结构)
- Modify: `style.css` (新增卷轴样式)

- [ ] **Step 1: 重构顶栏 HTML 结构**

将 `index.html` 中 `#top-bar` 的内容替换为三段式卷轴结构：

```html
<div id="top-bar">
  <!-- 左端轴杆 -->
  <div id="axle-left"></div>
  <!-- 卷面主体 -->
  <div id="scroll-body">
    <!-- 左侧：标题组 -->
    <div id="title-group">
      <span class="title-ornament left"></span>
      <span id="title-text">漢金之戰</span>
      <span class="title-ornament right"></span>
      <span class="title-sep"></span>
    </div>
    <!-- 中央：阵营 VS 徽章 -->
    <div id="vs-badge">
      <span class="vs-han">漢</span>
      <span class="vs-icon">⚔</span>
      <span class="vs-jin">金</span>
    </div>
    <!-- 右侧：战场信息 -->
    <div id="battle-info">
      <div class="info-item" id="weather-info">
        <span class="info-label">天氣</span>
        <span id="weather-icon" class="info-value">☀️</span>
      </div>
      <div class="info-item" id="combo-info">
        <span class="info-label">連擊</span>
        <span id="combo-display" class="info-value"></span>
      </div>
      <div class="info-item" id="time-info">
        <span class="info-label">時辰</span>
        <span id="timer-display" class="info-value timer-value">00:00</span>
      </div>
      <div id="gold-badge">
        <span class="gold-icon">◆</span>
        <span id="gold-display"><span class="gold-value">0</span></span>
      </div>
      <button id="btn-mute" title="音效"><i class="icon-sound"></i></button>
    </div>
  </div>
  <!-- 右端轴杆 -->
  <div id="axle-right"></div>
</div>
```

**注意**：移除原有的 `#vs-display`（合并到 `#vs-badge`），保留 `#top-bar::after` 底线装饰。

- [ ] **Step 2: 移除 style.css 中旧的顶栏样式**

在 `style.css` 中删除或注释以下旧规则：
- `#vs-display` 样式块（不再使用）
- `#weather-icon` 旧样式（`min-width:28px; text-align:center;` 等）
- `#combo-display` 旧样式（`min-width:70px;` 等）
- `#timer-display` 旧样式（`min-width:80px;`）
- `#gold-display` 旧样式（`min-width:80px;`）

- [ ] **Step 3: 添加卷轴顶栏 CSS 样式**

在 `style.css` 的顶栏区域（`#top-bar` 之后）添加：

```css
/* ---- 卷轴轴杆 ---- */
#axle-left, #axle-right {
  width: 10px;
  height: 46px;
  flex-shrink: 0;
  border-radius: 3px;
}
#axle-left {
  background: linear-gradient(90deg, #6B3A2A, #8B5A3A, #A0704A, #8B5A3A, #6B3A2A);
  margin-right: -1px;
}
#axle-right {
  background: linear-gradient(90deg, #8B5A3A, #A0704A, #8B5A3A, #6B3A2A);
  margin-left: -1px;
}

/* ---- 卷面主体 ---- */
#scroll-body {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  height: 46px;
  background: linear-gradient(180deg,
    rgba(245,235,200,0.18) 0%,
    rgba(220,210,170,0.12) 50%,
    rgba(200,185,150,0.08) 100%);
  gap: 12px;
}

/* ---- 标题分隔线 ---- */
.title-sep {
  width: 1px;
  height: 20px;
  background: linear-gradient(180deg, transparent, rgba(240,214,138,0.4), transparent);
  margin-left: 10px;
}

/* ---- VS 徽章 ---- */
#vs-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(0,0,0,0.3);
  border-radius: 12px;
  padding: 3px 16px;
  border: 1px solid rgba(240,214,138,0.2);
}
.vs-han { color: #E74C3C; font-weight: 700; font-size: 14px; }
.vs-jin { color: #5DADE2; font-weight: 700; font-size: 14px; }
.vs-icon { color: #F0D68A; font-size: 12px; font-weight: 900; }

/* ---- 战场信息区 ---- */
#battle-info {
  display: flex;
  align-items: center;
  gap: 16px;
}
.info-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 42px;
}
.info-label {
  font-size: 10px;
  color: #8B8996;
  line-height: 1.2;
}
.info-value {
  font-size: 14px;
  color: #E8E6E0;
  font-weight: 600;
}

/* ---- 金币徽章 ---- */
#gold-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  background: rgba(240,214,138,0.1);
  border: 1px solid rgba(240,214,138,0.25);
  border-radius: 8px;
  padding: 3px 10px;
}
.gold-icon { color: #F0D68A; font-size: 10px; }
#gold-display { color: #F0D68A; font-size: 16px; font-weight: 700; }
```

- [ ] **Step 4: 验证顶栏**

启动服务器，打开浏览器检查：
1. 顶栏显示两端轴杆 + 卷面背景
2. VS 徽章显示"漢⚔金"且颜色正确
3. 天气/连击/时辰/金币显示在右侧信息区
4. 金币有独立金框容器

Run: `python3 -m http.server 8765` 然后打开 `http://localhost:8765`

---

### Task 2: 技能栏 → 竖排兵符令牌

**Files:**
- Modify: `index.html` (skill-bar HTML 结构)
- Modify: `style.css` (兵符令牌样式)
- Modify: `game.js` (CD 进度条动态更新)

- [ ] **Step 1: 重构技能栏 HTML**

将 `index.html` 中 `#skill-bar` 的内容替换为兵符令牌结构：

```html
<div id="skill-bar">
  <button class="skill-token han-skill" id="btn-fire" disabled>
    <span class="skill-icon">🔥</span>
    <span class="skill-name">火攻</span>
    <span class="skill-cost">◆50</span>
    <div class="skill-cd-bar"><div class="skill-cd-fill fire-fill"></div></div>
    <span class="skill-cd-text">就绪</span>
  </button>
  <button class="skill-token" id="btn-night" disabled>
    <span class="skill-icon">🌙</span>
    <span class="skill-name">夜战</span>
    <span class="skill-cost">◆40</span>
    <div class="skill-cd-bar"><div class="skill-cd-fill night-fill"></div></div>
    <span class="skill-cd-text">就绪</span>
  </button>
  <button class="skill-token" id="btn-messenger" disabled>
    <span class="skill-icon">📯</span>
    <span class="skill-name">传令</span>
    <span class="skill-cost">◆50</span>
    <div class="skill-cd-bar"><div class="skill-cd-fill msg-fill"></div></div>
    <span class="skill-cd-text">就绪</span>
  </button>
  <button class="skill-token ultimate" id="btn-decree" disabled>
    <span class="skill-icon">👑</span>
    <span class="skill-name">诏令</span>
    <span class="skill-cost">◆100</span>
    <div class="skill-cd-bar"><div class="skill-cd-fill decree-fill"></div></div>
    <span class="skill-cd-text">就绪</span>
  </button>
</div>
```

- [ ] **Step 2: 替换技能栏 CSS**

在 `style.css` 中，将 `#skill-bar` 和 `.skill-btn` 相关样式替换为：

```css
#skill-bar {
  display: none;
  justify-content: center;
  align-items: flex-end;
  gap: 12px;
  padding: 12px 20px;
  background: linear-gradient(180deg, rgba(42,26,5,0.95) 0%, #1A1408 100%);
  border-radius: 0 0 var(--radius-lg) var(--radius-lg);
  border: 1px solid var(--border-panel);
  border-top: 1px solid rgba(212,168,75,0.12);
  position: relative;
  z-index: var(--z-skillbar);
}
#skill-bar.visible { display: flex; }

.skill-token {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 10px 14px;
  font-family: "Noto Sans SC", sans-serif;
  border: 2px solid transparent;
  border-radius: var(--radius-md);
  background: linear-gradient(180deg, var(--bg-surface) 0%, var(--bg-panel) 100%);
  color: var(--text);
  cursor: pointer;
  transition: all var(--dur-normal) var(--ease-out);
  width: 72px;
  min-height: 100px;
  position: relative;
}
.skill-token .skill-icon { font-size: 22px; }
.skill-token .skill-name { font-size: 12px; font-weight: 700; }
.skill-token .skill-cost { font-size: 10px; color: var(--gold); font-weight: 500; }

/* CD 进度条 */
.skill-cd-bar {
  width: 100%;
  height: 3px;
  background: rgba(255,255,255,0.1);
  border-radius: 2px;
  margin-top: 2px;
}
.skill-cd-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.3s ease;
}
.fire-fill    { background: linear-gradient(90deg, #E74C3C, #F39C12); }
.night-fill   { background: linear-gradient(90deg, #2E86C1, #5DADE2); }
.msg-fill     { background: linear-gradient(90deg, #2ECC71, #27AE60); }
.decree-fill  { background: linear-gradient(90deg, #F0D68A, #D4A84B); }

.skill-cd-text {
  font-size: 9px;
  color: #8B8996;
}

/* 诏令大一号 */
.skill-token.ultimate {
  width: 88px;
  padding: 14px 16px;
  border-color: rgba(212,168,75,0.4);
  background: linear-gradient(180deg, #2A2010 0%, #1A0E02 100%);
  box-shadow: 0 0 20px rgba(212,168,75,0.15);
}
.skill-token.ultimate .skill-icon { font-size: 26px; }
.skill-token.ultimate .skill-name { font-size: 14px; color: var(--gold-light); text-shadow: 0 0 8px rgba(240,214,138,0.4); }

/* 火攻红色边框 */
.skill-token.han-skill:not(:disabled) { border-color: rgba(192,57,43,0.4); }
.skill-token.han-skill:not(:disabled):hover { border-color: var(--han); box-shadow: 0 0 20px var(--han-glow); }

/* Hover 效果 */
.skill-token:hover:not(:disabled) {
  transform: translateY(-3px);
  border-color: var(--border-active);
  box-shadow: var(--shadow-md), 0 0 16px rgba(212,168,75,0.15);
}
.skill-token:disabled {
  opacity: 0.35;
  cursor: not-allowed;
  filter: grayscale(0.5);
}
.skill-token.ultimate:not(:disabled):hover {
  border-color: var(--gold);
  box-shadow: var(--shadow-md), var(--shadow-gold);
}
```

- [ ] **Step 3: 更新 game.js 中技能按钮 DOM 引用**

在 `game.js` 中，更新技能按钮的事件绑定（`_bindEvents` 中 line ~513-516）以适配新的 HTML id。

当前代码已经使用 `$('btn-fire')` 等 id 引用，HTML id 未改变，所以事件绑定**无需修改**。

在 `_updateSkills()` 方法中（约 line 3830 附近），添加 CD 进度条宽度更新：

在 `_updateSkills(dt)` 方法的技能循环末尾、按钮 disabled 设置之后，添加：

```javascript
// 更新 CD 进度条
const cdBar = document.querySelector(`#btn-${key} .skill-cd-fill`);
const cdText = document.querySelector(`#btn-${key} .skill-cd-text`);
if (cdBar && cdText) {
  const cdPct = Math.max(0, Math.min(1, skill.cd / SKILL_DEFS[key].cooldown));
  cdBar.style.width = `${(1 - cdPct) * 100}%`;
  cdText.textContent = skill.cd > 0
    ? `CD ${Math.ceil(skill.cd)}s`
    : skill.active ? '生效中' : '就绪';
  cdText.style.color = skill.cd > 0
    ? '#F39C12'
    : skill.active ? '#4CAF50' : '#4CAF50';
}
```

注意：需要确认 `_updateSkills` 中的循环变量和 key 的对应关系。当前代码遍历 `this._skills` 对象的 keys，key 对应技能名（fire/night/messenger/decree）。

- [ ] **Step 4: 验证技能栏**

启动服务器，进行完整游戏流程：
1. 选择阵营 → 部署 → 开始战斗
2. 检查技能栏显示为竖排兵符令牌
3. 诏令比其他技能大一号
4. 点击技能后检查 CD 进度条是否从左到右变化
5. 检查 CD 文字状态变化（就绪 → CD 30s → CD 29s ...）

---

### Task 3: 部署栏 → 令牌阵

**Files:**
- Modify: `index.html` (troop-bar HTML 结构)
- Modify: `style.css` (令牌卡片样式)

- [ ] **Step 1: 重构部署栏 HTML**

将 `index.html` 中 `#troop-bar` 的内容替换为：

```html
<div id="troop-bar">
  <div id="token-grid">
    <div class="troop-token" data-type="sword" data-cost="1">
      <span class="token-icon">⚔️</span>
      <span class="token-name">剑兵</span>
      <span class="token-cost">◆1</span>
      <span class="token-mark">▲ 选中</span>
    </div>
    <div class="troop-token" data-type="spear" data-cost="2">
      <span class="token-icon">🔱</span>
      <span class="token-name">矛兵</span>
      <span class="token-cost">◆2</span>
      <span class="token-mark">▲ 选中</span>
    </div>
    <div class="troop-token" data-type="halberd" data-cost="2">
      <span class="token-icon">🗡️</span>
      <span class="token-name">戟兵</span>
      <span class="token-cost">◆2</span>
      <span class="token-mark">▲ 选中</span>
    </div>
    <div class="troop-token" data-type="cavalry" data-cost="3">
      <span class="token-icon">🐴</span>
      <span class="token-name">骑兵</span>
      <span class="token-cost">◆3</span>
      <span class="token-mark">▲ 选中</span>
    </div>
    <div class="troop-token" data-type="ram" data-cost="3">
      <span class="token-icon">🐏</span>
      <span class="token-name">冲车</span>
      <span class="token-cost">◆3</span>
      <span class="token-mark">▲ 选中</span>
    </div>
    <div class="troop-token" data-type="catapult" data-cost="3">
      <span class="token-icon">💣</span>
      <span class="token-name">投石</span>
      <span class="token-cost">◆3</span>
      <span class="token-mark">▲ 选中</span>
    </div>
    <div class="troop-token" data-type="crossbow" data-cost="2">
      <span class="token-icon">🏹</span>
      <span class="token-name">弩兵</span>
      <span class="token-cost">◆2</span>
      <span class="token-mark">▲ 选中</span>
    </div>
    <div class="troop-token" data-type="shield" data-cost="2">
      <span class="token-icon">🛡️</span>
      <span class="token-name">盾兵</span>
      <span class="token-cost">◆2</span>
      <span class="token-mark">▲ 选中</span>
    </div>
    <div class="troop-token" data-type="strategist" data-cost="3">
      <span class="token-icon">📜</span>
      <span class="token-name">军师</span>
      <span class="token-cost">◆3</span>
      <span class="token-mark">▲ 选中</span>
    </div>
  </div>
  <div id="deploy-actions">
    <div id="points-display">
      <span class="points-label">兵符</span>
      <span id="points-num">60</span>
      <span class="points-total">/ 60</span>
    </div>
    <button id="btn-auto-deploy" class="aux-btn">自动布阵</button>
    <button id="btn-start-battle" class="action-btn">出 战</button>
  </div>
</div>
```

- [ ] **Step 2: 替换部署栏 CSS**

在 `style.css` 中，将 `#troop-bar` 和 `.troop-option` 相关样式替换为：

```css
#troop-bar {
  display: none;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 14px;
  background: linear-gradient(180deg, rgba(42,26,5,0.95) 0%, #1A1408 100%);
  border-radius: 0 0 var(--radius-lg) var(--radius-lg);
  border: 1px solid var(--border-panel);
  border-top: 1px solid rgba(212,168,75,0.12);
  flex-wrap: wrap;
  min-height: 90px;
}
#troop-bar.visible { display: flex; }

#token-grid {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
}

.troop-token {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 6px 8px;
  background: linear-gradient(180deg, #1A1408, #0D0A04);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: var(--radius-md);
  min-width: 54px;
  min-height: 68px;
  cursor: pointer;
  user-select: none;
  transition: all var(--dur-normal) var(--ease-out);
  color: var(--text);
  position: relative;
}
.troop-token:hover {
  border-color: var(--gold-dark);
  transform: translateY(-2px);
  box-shadow: var(--shadow-md), 0 0 12px rgba(212,168,75,0.12);
}

.troop-token .token-icon { font-size: 20px; }
.troop-token .token-name { font-size: 11px; font-weight: 500; }
.troop-token .token-cost { font-size: 10px; color: var(--gold); font-weight: 500; }
.troop-token .token-mark {
  display: none;
  font-size: 8px;
  color: var(--gold-light);
  position: absolute;
  bottom: 2px;
}

/* 选中 = 翻起 + 金框 + 光晕 */
.troop-token.selected {
  border-color: var(--gold);
  background: linear-gradient(180deg, #2A2010, #1A1408);
  box-shadow: 0 0 16px rgba(212,168,75,0.3);
  transform: translateY(-3px);
}
.troop-token.selected .token-icon,
.troop-token.selected .token-name { color: var(--gold-light); }
.troop-token.selected .token-mark { display: block; }

/* 不可用（点数不足） */
.troop-token.disabled {
  opacity: 0.3;
  cursor: not-allowed;
  pointer-events: none;
  filter: grayscale(0.6);
}

/* 部署操作区 */
#deploy-actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  margin-left: 8px;
}
#points-display {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 6px 12px;
  background: rgba(0,0,0,0.3);
  border: 1px solid rgba(240,214,138,0.2);
  border-radius: 8px;
}
.points-label { font-size: 10px; color: #8B8996; }
.points-total { font-size: 10px; color: #8B8996; }
#points-num {
  color: var(--gold-light);
  font-size: 24px;
  font-weight: 900;
  font-family: "Noto Serif SC", serif;
}
```

- [ ] **Step 3: 更新 game.js 中 troop-bar 事件绑定**

在 `_bindEvents()` 中，将 troops 选择的事件绑定从 `.troop-option` 改为 `.troop-token`：

```javascript
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
```

在 `_updateTroopBarUI()` 中，将选择器从 `.troop-option` 改为 `.troop-token`：

```javascript
_updateTroopBarUI() {
  document.querySelectorAll('.troop-token').forEach(el => {
    const cost = parseInt(el.dataset.cost);
    const type = el.dataset.type;
    el.classList.toggle('selected', type === this.selectedType);
    el.classList.toggle('disabled', this.deployPoints < cost);
  });
  pointsNum.textContent = this.deployPoints;
}
```

- [ ] **Step 4: 验证部署栏**

启动服务器，进入部署阶段：
1. 检查 9 个兵符令牌排列为 2 行
2. 点击兵符，检查选中状态（翻起 + 金框 + "▲ 选中"）
3. 部署单位后点数减少，点数不足的兵符变灰
4. "自动布阵"和"出 战"按钮在右侧

---

### Task 4: 胜利画面 → 战报奏章

**Files:**
- Modify: `index.html` (overlay-victory HTML 结构)
- Modify: `style.css` (奏章样式 + 动画)
- Modify: `game.js` (_onBattleEnd 中胜利画面更新逻辑)

- [ ] **Step 1: 重构胜利画面 HTML**

将 `index.html` 中 `#overlay-victory` 的内容替换为：

```html
<div id="overlay-victory" class="overlay hidden">
  <div class="overlay-bg-pattern"></div>
  <div class="overlay-content">
    <!-- 奏章容器 -->
    <div id="scroll-report">
      <div class="report-border top"></div>
      <h1 id="victory-title"></h1>
      <p id="victory-subtitle" class="report-subtitle"></p>
      <!-- 印章 -->
      <div id="victory-seal"><span id="seal-text">勝</span></div>
      <!-- 统计面板 -->
      <div id="report-stats">
        <div class="stat-row"><span>用時</span><span id="stat-time"></span></div>
        <div class="stat-row"><span>殲敵</span><span id="stat-kills"></span></div>
        <div class="stat-row"><span>城門</span><span id="stat-gate"></span></div>
        <div class="stat-row"><span>最高連擊</span><span id="stat-combo"></span></div>
        <div class="stat-sep"></div>
        <div class="stat-row gold-row"><span>賞金</span><span id="stat-gold"></span></div>
      </div>
      <!-- 成就 -->
      <div id="victory-achievements"></div>
      <!-- 再战按钮 -->
      <button id="btn-replay" class="big-btn">再 戰</button>
      <div class="report-border bottom"></div>
    </div>
  </div>
</div>
```

- [ ] **Step 2: 添加奏章 CSS 样式**

在 `style.css` 胜利画面区域之后添加：

```css
/* ---- 战报奏章 ---- */
#scroll-report {
  background: linear-gradient(180deg, #F5ECD7 0%, #E8DCC8 3%, #F0E5D0 50%, #E0D4BC 97%, #C8B898 100%);
  border-radius: 2px;
  padding: 36px 44px;
  max-width: 400px;
  text-align: center;
  position: relative;
  box-shadow:
    0 8px 40px rgba(0,0,0,0.5),
    0 0 0 8px #8B6914,
    0 0 0 10px #A0782C,
    0 0 0 13px #6B4E0A;
  font-family: "Noto Serif SC", serif;
  animation: scrollUnfold 0.6s ease-out;
}

@keyframes scrollUnfold {
  from { transform: scaleY(0); opacity: 0; }
  to   { transform: scaleY(1); opacity: 1; }
}

.report-border {
  border-top: 1px solid #8B6914;
  border-bottom: 1px solid #8B6914;
  padding: 2px 0;
  opacity: 0.5;
  margin-bottom: 16px;
}
.report-border.bottom { margin-top: 16px; margin-bottom: 0; }

#victory-title {
  font-family: "Noto Serif SC", serif;
  font-size: 36px;
  font-weight: 900;
  color: #5D2E0C;
  letter-spacing: 0.3em;
  margin: 0 0 4px 0;
}
.report-subtitle {
  color: #8B6914;
  font-size: 14px;
  letter-spacing: 0.2em;
  margin: 0 0 20px 0;
}

/* 印章 */
#victory-seal {
  width: 60px;
  height: 60px;
  border: 3px solid #C0392B;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 20px;
  transform: rotate(-15deg);
  opacity: 0.85;
  animation: sealStamp 0.4s ease-out 0.6s both;
}
@keyframes sealStamp {
  from { transform: rotate(-15deg) scale(0); opacity: 0; }
  60%  { transform: rotate(-15deg) scale(1.3); opacity: 1; }
  to   { transform: rotate(-15deg) scale(1); opacity: 0.85; }
}
#seal-text {
  color: #C0392B;
  font-size: 20px;
  font-weight: 900;
}

/* 统计面板 */
#report-stats {
  border: 1px solid rgba(139,105,20,0.3);
  border-radius: 4px;
  padding: 14px 18px;
  margin-bottom: 14px;
  background: rgba(139,105,20,0.06);
  text-align: left;
}
.stat-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 6px;
  opacity: 0;
  animation: statReveal 0.3s ease-out forwards;
}
.stat-row:nth-child(1) { animation-delay: 1.0s; }
.stat-row:nth-child(2) { animation-delay: 1.15s; }
.stat-row:nth-child(3) { animation-delay: 1.3s; }
.stat-row:nth-child(4) { animation-delay: 1.45s; }
.stat-row:nth-child(6) { animation-delay: 1.6s; }
@keyframes statReveal {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
.stat-row span:first-child { color: #5D2E0C; font-size: 14px; }
.stat-row span:last-child  { color: #3D1A00; font-size: 14px; font-weight: 700; }
.stat-sep {
  border-top: 1px dashed rgba(139,105,20,0.3);
  margin: 8px 0;
}
.gold-row span:last-child { color: #A0782C; font-size: 18px; font-weight: 900; }

/* 成就标签 */
#victory-achievements {
  display: flex;
  gap: 8px;
  justify-content: center;
  flex-wrap: wrap;
  margin-bottom: 18px;
}
.victory-ach-badge {
  background: #F0D68A;
  color: #5D2E0C;
  padding: 4px 10px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 700;
}
```

- [ ] **Step 3: 更新 game.js 胜利画面逻辑**

在 `_onBattleEnd(result)` 方法中（约 line 4100 附近），更新胜利画面内容填充逻辑。

找到设置 `victoryTitle.textContent = ...` 的位置，替换为新的填充逻辑：

```javascript
// 标题和副标题
const victoryTitle = document.getElementById('victory-title');
const victorySubtitle = document.getElementById('victory-subtitle');
const sealText = document.getElementById('seal-text');
const seal = document.getElementById('victory-seal');

if (result === 'win') {
  victoryTitle.textContent = '大 捷';
  if (this.playerSide === 'han') {
    victorySubtitle.textContent = '漢軍破城 · 金軍潰散';
  } else {
    victorySubtitle.textContent = '金軍堅守 · 漢軍退卻';
  }
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
const achContainer = document.getElementById('victory-achievements');
achContainer.innerHTML = '';
for (const [key, ach] of Object.entries(ACHIEVEMENTS)) {
  if (this.unlockedAchievements[key]) {
    const badge = document.createElement('span');
    badge.className = 'victory-ach-badge';
    badge.textContent = `🏆 ${ach.name}`;
    achContainer.appendChild(badge);
  }
}
```

- [ ] **Step 4: 移除旧胜利画面 CSS**

删除 `style.css` 中 `#victory-stats`、`#victory-title` 的旧样式规则（已被新样式替代）。

- [ ] **Step 5: 验证胜利画面**

完成一局游戏，检查：
1. 胜利时奏章从中央展开（0.6s 动画）
2. 印章旋转弹入（0.4s 动画，0.6s 延迟）
3. 统计数据逐行浮现
4. 汉胜=红色"勝"印，金胜=蓝色"固"印，失败=灰色"敗"印
5. 成就徽章正确显示

---

## 阶段 2: 单位表现力提升

### Task 5: 单位头顶 UI 增强

**Files:**
- Modify: `game.js` (`_drawUnits` 方法, 约 line 2703-2865)

- [ ] **Step 1: 添加状态图标绘制**

在 `_drawUnits()` 中，血条绘制（约 line 2799-2816）之后，命令图标绘制（约 line 2818）之前，插入状态图标绘制代码：

```javascript
// ---- 状态图标 ----
const iconY = barY - 7;
if (this._pickupBuffs.atk > 0 && u.side === this.playerSide) {
  ctx.fillStyle = '#E74C3C';
  ctx.font = '9px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('▲', u.x, iconY);
} else if (this._pickupBuffs.spd > 0 && u.side === this.playerSide) {
  ctx.fillStyle = '#5DADE2';
  ctx.font = '9px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('▶', u.x, iconY);
}
if (this._decreeBuff.enemySlow > 0 && u.side !== this.playerSide) {
  ctx.fillStyle = '#E74C3C';
  ctx.font = '9px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('▼', u.x, iconY);
}
if (this._nightMode && u.side !== this.playerSide) {
  ctx.fillStyle = '#8B8996';
  ctx.font = '9px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('🌙', u.x, u.side === this.playerSide ? iconY : iconY);
}
```

- [ ] **Step 2: 改为分段式血条**

将 `_drawUnits()` 中血条绘制代码（约 line 2799-2816）替换为 10 段式：

```javascript
// 分段式血条
const hpPct = u.hp / u.maxHP;
const barW = 34, barH = 5, barX = u.x - 17, barY = u.y + 36;
const segments = 10;
const segW = (barW - (segments - 1) * 0.5) / segments;
const fullSegs = Math.round(hpPct * segments);

ctx.fillStyle = 'rgba(0,0,0,0.6)';
this._roundRectPath(barX - 1, barY - 1, barW + 2, barH + 2, 2);
ctx.fill();

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
  // 损失的血格闪烁后变暗
  if (s >= fullSegs && u._lostSegFlash && u._lostSegFlash > 0) {
    ctx.fillStyle = `rgba(255,100,100,${u._lostSegFlash * 0.6})`;
    this._roundRectPath(sx, barY, segW, barH, 1);
    ctx.fill();
  }
}
```

在 `_updateBattle(dt)` 中单位受击时，设置 `target._lostSegFlash = 0.3`：

在伤害处理代码处（约 line 3551 `target.hp -= dmg` 之后）添加：
```javascript
target._lostSegFlash = 0.3;
```

在单位更新循环中（约 line 3417-3418 处，`_hitFlash` 衰减之后）添加：
```javascript
if (u._lostSegFlash > 0) u._lostSegFlash -= dt;
```

- [ ] **Step 3: 添加仇恨连线**

在 `_drawUnits()` 中，绘制选中单位的仇恨连线。在循环外、所有单位绘制之后添加：

```javascript
// 仇恨连线（选中的己方单位 → 攻击目标）
if (this.selectedUnitIdxs.length > 0) {
  for (const idx of this.selectedUnitIdxs) {
    const u = this.units[idx];
    if (!u || u.hp <= 0) continue;
    // 查找该单位的攻击目标
    let target = null;
    if (u.cmdType === 'attack' && u.cmdTarget && u.cmdTarget >= 0) {
      target = this.units[u.cmdTarget];
    } else if (u._attackTarget !== undefined && this.units[u._attackTarget]) {
      target = this.units[u._attackTarget];
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
```

- [ ] **Step 4: 添加军师光环可视化**

在 `_drawUnits()` 循环中，在 sprite 绘制之前（约 line 2750 之后、2752 之前），添加军师光环绘制：

```javascript
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
```

- [ ] **Step 5: 验证单位 UI 增强**

启动服务器，进入战斗：
1. 选中单位，检查军师周围淡色虚线光环
2. 单位受击后检查分段血条
3. 增益 buff 期间检查头顶 ▲/▶ 标记
4. 夜战期间检查敌方单位 🌙 标记

---

### Task 6: 兵种剪影差异化

**Files:**
- Modify: `assets.js` (5 个兵种的绘制函数)

- [ ] **Step 1: 增强骑兵 — 添加马匹**

在 `_drawLegs()` 的 `cavalry` 分支（约 line 84-87）中，替换为完整马匹绘制：

```javascript
if (type === 'cavalry') {
  // 马身
  const horseColor = fc === '#C0392B' ? '#5D3A1A' : '#8B8B8B';
  ctx.fillStyle = horseColor;
  ctx.beginPath();
  ctx.ellipse(cx, by - 6, 16, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  // 马颈
  ctx.fillStyle = horseColor;
  ctx.fillRect(cx + 6, by - 18, 6, 14);
  // 马头
  ctx.beginPath();
  ctx.ellipse(cx + 12, by - 20, 5, 4, -0.3, 0, Math.PI * 2);
  ctx.fill();
  // 马尾
  ctx.strokeStyle = '#3D2E1E';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx - 14, by - 4);
  ctx.quadraticCurveTo(cx - 20, by - 10, cx - 16, by + 2);
  ctx.stroke();
  // 马腿
  ctx.fillStyle = '#3D2E1E';
  ctx.fillRect(cx - 6, by - 2, 2, 8);
  ctx.fillRect(cx + 2, by - 2, 2, 8);
  // 骑手腿
  ctx.fillStyle = lg;
  ctx.fillRect(cx - 3, by - 14, 3, 6);
  ctx.fillRect(cx + 2, by - 14, 3, 6);
}
```

- [ ] **Step 2: 增强冲车 — 添加撞锤结构**

在 `_drawArmsAndWeapon()` 的 `ram` 分支（约 line 365 附近）中，替换为撞锤绘制：

```javascript
case 'ram':
  // 木制横梁
  ctx.fillStyle = '#5D4037';
  ctx.fillRect(cx - 16, by - 8, 28, 6);
  // 金属撞头
  const ramGrad = ctx.createLinearGradient(cx + 12, 0, cx + 22, 0);
  ramGrad.addColorStop(0, '#A0A0A0');
  ramGrad.addColorStop(0.5, '#D0D0D0');
  ramGrad.addColorStop(1, '#808080');
  ctx.fillStyle = ramGrad;
  ctx.beginPath();
  ctx.arc(cx + 14, by - 5, 8, 0, Math.PI * 2);
  ctx.fill();
  // 尖刺
  ctx.fillStyle = '#E0E0E0';
  ctx.beginPath();
  ctx.moveTo(cx + 22, by - 8);
  ctx.lineTo(cx + 26, by - 5);
  ctx.lineTo(cx + 22, by - 2);
  ctx.closePath();
  ctx.fill();
  // 推车人手臂
  ctx.fillStyle = armGrad;
  ctx.fillRect(cx - 10, by - 4, 2, 6);
  ctx.fillRect(cx + 2, by - 4, 2, 6);
  break;
```

- [ ] **Step 3: 增强投石车 — 添加木架和投臂**

在 `_drawArmsAndWeapon()` 中添加投石车的绘制分支（在现有 `catapult` 分支处替换）：

```javascript
case 'catapult':
  // A字形支架
  ctx.strokeStyle = '#5D4037';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - 12, by + 4);
  ctx.lineTo(cx, by - 16);
  ctx.lineTo(cx + 12, by + 4);
  ctx.stroke();
  // 横梁
  ctx.fillStyle = '#4E342E';
  ctx.fillRect(cx - 4, by - 16, 8, 3);
  // 投臂
  ctx.strokeStyle = '#6D4C41';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx + 2, by - 14);
  ctx.lineTo(cx - 10, by - 4);
  ctx.stroke();
  // 石弹
  ctx.fillStyle = '#808080';
  ctx.beginPath();
  ctx.arc(cx - 10, by - 4, 4, 0, Math.PI * 2);
  ctx.fill();
  // 操作兵手臂
  ctx.fillStyle = armGrad;
  ctx.fillRect(cx + 6, by - 2, 2, 6);
  break;
```

- [ ] **Step 4: 增强盾兵 — 扩大塔盾**

在 `_drawArmsAndWeapon()` 的 `shield` 分支中，修改盾牌尺寸（现有代码约 line 382-411）：

```javascript
case 'shield':
  // 左手握盾柄
  ctx.fillStyle = armGrad;
  ctx.fillRect(cx - 4, by - 4, 2, 8);
  // 大型塔盾（覆盖肩到膝）
  const shGrad = ctx.createLinearGradient(0, by - 22, 0, by + 4);
  shGrad.addColorStop(0, fc);
  shGrad.addColorStop(0.3, fl);
  shGrad.addColorStop(0.7, fc);
  shGrad.addColorStop(1, fd);
  ctx.fillStyle = shGrad;
  _roundRect(ctx, cx - 16, by - 22, 22, 28, 4);
  ctx.fill();
  ctx.strokeStyle = fd;
  ctx.lineWidth = 1;
  ctx.stroke();
  // 盾心（金属浮雕）
  ctx.fillStyle = '#D0D4C8';
  ctx.beginPath();
  ctx.arc(cx - 5, by - 8, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#9098A0';
  ctx.lineWidth = 0.5;
  ctx.stroke();
  // 阵营徽记
  ctx.fillStyle = '#F0D68A';
  ctx.font = 'bold 7px "Noto Serif SC", serif';
  ctx.textAlign = 'center';
  ctx.fillText(faction === 'han' ? '漢' : '金', cx - 5, by - 5);
  break;
```

- [ ] **Step 5: 增强军师 — 添加羽扇和长袍**

在 `_drawBody()` 的 `strategist` 分支（约 line 175+）中，扩展长袍：

```javascript
if (type === 'strategist') {
  // 扩展长袍
  const rg = ctx.createLinearGradient(0, by - 18, 0, by + 6);
  rg.addColorStop(0, '#4A5568');
  rg.addColorStop(0.5, '#718096');
  rg.addColorStop(1, '#2D3748');
  ctx.fillStyle = rg;
  ctx.beginPath();
  ctx.moveTo(cx - 9, by - 14);
  ctx.lineTo(cx + 9, by - 14);
  ctx.lineTo(cx + 14, by + 4);
  ctx.lineTo(cx - 14, by + 4);
  ctx.closePath();
  ctx.fill();
  // 腰带
  ctx.strokeStyle = fc;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx - 9, by - 6);
  ctx.lineTo(cx + 9, by - 6);
  ctx.stroke();
}
```

在 `_drawArmsAndWeapon()` 的 `strategist` 分支中添加羽扇：

```javascript
case 'strategist':
  // 持扇手
  ctx.fillStyle = armGrad;
  ctx.fillRect(cx - 4, by - 4, 2, 6);
  // 羽扇
  const fanGrad = ctx.createLinearGradient(cx + 4, by - 10, cx + 14, 0);
  fanGrad.addColorStop(0, '#F5ECD7');
  fanGrad.addColorStop(1, '#D4C8A0');
  ctx.fillStyle = fanGrad;
  ctx.beginPath();
  ctx.ellipse(cx + 10, by - 8, 8, 5, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#A08860';
  ctx.lineWidth = 0.5;
  ctx.stroke();
  break;
```

- [ ] **Step 6: 验证剪影差异化**

重新生成 sprite 后进入游戏，检查：
1. 骑兵有明显马匹轮廓（汉=棕色马，金=灰白马）
2. 冲车有横梁+金属撞头+尖刺
3. 投石车有 A 字支架+投臂+石弹
4. 盾兵塔盾更大（覆盖肩到膝）
5. 军师有羽扇+扩展长袍

---

## 阶段 3: 战场氛围提升

### Task 7: 战场氛围层

**Files:**
- Modify: `game.js` (新增氛围绘制方法 + 初始化氛围粒子)

- [ ] **Step 1: 初始化氛围粒子数组**

在 `_startBattle()` 中（约 line 1340 之后），添加新数组初始化：

```javascript
this._braziers = [];     // 烽火台火焰粒子
this._killMarks = [];    // 击杀痕迹
this._birds = [];        // 飞鸟
this._battlefieldDust = []; // 行军尘土
```

- [ ] **Step 2: 添加城堡烽火更新逻辑**

在 `_updateBattle(dt)` 的天气更新之后（约 line 3376 之后），添加烽火更新：

```javascript
// ---- 城堡烽火 ----
// 初始化烽火台位置（每局一次）
if (this._braziers.length === 0) {
  this._brazierPositions = [
    { x: 845, y: 152 },
    { x: 880, y: 148 },
    { x: 925, y: 155 },
  ];
}
for (const bp of this._brazierPositions) {
  // 每 0.15s 生成火焰和烟雾粒子
  if (Math.random() < dt * 6) {
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
```

- [ ] **Step 3: 添加行军尘土逻辑**

在 `_updateBattle(dt)` 的单位更新循环中（约 line 3415 之后，单位移动代码处），添加尘土生成：

在单位移动时（`u.x = nx; u.y = ny;` 之后），添加：

```javascript
// 行军尘土
const speed = def.speed * WEATHER_TYPES[this._weather.type].speedMul;
if (speed > 0.5 && Math.random() < 0.3) {
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
```

- [ ] **Step 4: 添加击杀痕迹逻辑**

在 `_onKill()` 方法中（约 line 3660+），添加击杀痕迹：

```javascript
// 击杀地面痕迹
this._killMarks.push({
  x: victim.x,
  y: victim.y + 20,
  life: 4,
  maxLife: 4,
  color: 'rgba(80,20,10,0.6)',
});
```

在 `_updateBattle(dt)` 末尾添加痕迹衰减：

```javascript
// 击杀痕迹衰减
for (let i = this._killMarks.length - 1; i >= 0; i--) {
  this._killMarks[i].life -= dt;
  if (this._killMarks[i].life <= 0) this._killMarks.splice(i, 1);
}
```

在 `_render()` 中 `_drawTerrain()` 之后、`_drawUnits()` 之前添加：

```javascript
this._drawKillMarks();
```

新增方法：

```javascript
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
```

- [ ] **Step 5: 添加飞鸟惊起逻辑**

在 `_executeDecree()` 方法中（约 line 3690+），添加飞鸟生成：

```javascript
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
```

在 `_updateBattle(dt)` 中添加飞鸟更新：

```javascript
// 飞鸟更新
for (let i = this._birds.length - 1; i >= 0; i--) {
  const bird = this._birds[i];
  bird.x += bird.vx * dt;
  bird.y += bird.vy * dt;
  bird.vy += 40 * dt; // 重力
  bird.life -= dt;
  if (bird.life <= 0) this._birds.splice(i, 1);
}
```

在 `_render()` 中 `_drawCastle()` 之后添加：

```javascript
this._drawBirds();
```

新增方法：

```javascript
_drawBirds() {
  ctx.fillStyle = '#2C1810';
  for (const bird of this._birds) {
    const alpha = Math.min(1, bird.life / 0.5);
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.moveTo(bird.x, bird.y);
    ctx.lineTo(bird.x - bird.size * 2, bird.y - bird.size * 0.3);
    ctx.lineTo(bird.x - bird.size * 2, bird.y + bird.size * 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(bird.x, bird.y);
    ctx.lineTo(bird.x + bird.size * 2, bird.y - bird.size * 0.3);
    ctx.lineTo(bird.x + bird.size * 2, bird.y + bird.size * 0.3);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}
```

- [ ] **Step 6: 验证战场氛围层**

启动服务器进入战斗：
1. 城堡顶部 3 处烽火持续燃烧
2. 单位移动时身后有尘土粒子
3. 击杀单位后地面有暗色痕迹（3-5 秒淡出）
4. 释放诏令后城堡后方惊起飞鸟

---

### Task 8: 天气可视化强化

**Files:**
- Modify: `game.js` (`_drawSky`, `_updateBattle`)

- [ ] **Step 1: 晴天 — 热浪波纹 + 光柱**

在 `_drawSky()` 中，在晴天绘制天空之后添加：

```javascript
// 热浪波纹（晴天）
if (this._weather.type === 'clear' && this.state === State.BATTLE) {
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
  // 光柱（god rays）
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
```

- [ ] **Step 2: 雨天 — 溅射 + 积水 + 暗云**

在 `_drawSky()` 中雨天绘制之后：

```javascript
// 地面积水反光（雨天）
if (this._weather.type === 'rain' && this.state === State.BATTLE) {
  const waterGrad = ctx.createLinearGradient(0, 280, 0, 550);
  waterGrad.addColorStop(0, 'rgba(100,150,200,0.03)');
  waterGrad.addColorStop(1, 'rgba(100,150,200,0.06)');
  ctx.fillStyle = waterGrad;
  ctx.fillRect(0, 280, CANVAS_W, CANVAS_H - 280);
}
```

在 `_updateBattle(dt)` 中雨天粒子生成处（约 line 3337-3343），增加溅射粒子：

```javascript
if (this._weather.type === 'rain' && Math.random() < 0.5) {
  // 现有雨滴粒子...
  // 溅射（击中地面时）
  if (Math.random() < 0.15) {
    const sx = Math.random() * CANVAS_W;
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
```

- [ ] **Step 3: 风天 — 沙尘 + 旗帜摆动**

在 `_updateBattle(dt)` 中，风天时持续生成沙尘：

```javascript
if (this._weather.type === 'wind' && Math.random() < 0.4) {
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
```

- [ ] **Step 4: 雷暴 — 闪电 + 焦痕 + 暴雨加倍**

在 `_drawSky()` 中雷暴天空绘制处，添加视觉闪电效果：

```javascript
// 雷暴闪电（在绘制天空之后）
if (this._weather.type === 'storm' && this._lightningFlash > 0) {
  ctx.fillStyle = `rgba(255,255,255,${this._lightningFlash * 0.3})`;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
}
```

在雷击发生时（`_updateBattle` 约 line 3353），添加闪白：

```javascript
this._lightningFlash = 0.15;
```

在 `_updateBattle(dt)` 天气更新处添加闪白衰减：

```javascript
if (this._lightningFlash > 0) this._lightningFlash -= dt;
```

并增加雷击时的地面焦痕（复用 `_killMarks` 或新增）：

```javascript
// 在雷击伤害代码处
this._killMarks.push({
  x: victim.x,
  y: victim.y + 15,
  life: 3,
  maxLife: 3,
  color: 'rgba(20,20,20,0.7)',
});
```

雷暴时雨滴密度加倍：将现有 `Math.random() < 0.7` 改为 `Math.random() < 0.95`。

- [ ] **Step 5: 验证天气效果**

启动游戏，等待天气切换：
1. 晴天：检查热浪波纹和 god rays
2. 雨天：地面蓝色反光 + 雨滴溅射
3. 风天：横向沙尘飘过
4. 雷暴：闪电闪白 + 地面焦痕 + 暴雨加倍

---

## 阶段 4: 战斗反馈强化

### Task 9: 伤害数字风格化

**Files:**
- Modify: `game.js` (`_addDamageNum` 方法 + `_drawDamageNumbers` 方法)

- [ ] **Step 1: 扩展 _addDamageNum 签名**

找到当前的 `_addDamageNum()` 方法（约 line 3800+），修改签名为：

```javascript
_addDamageNum(x, y, value, isCrit, type) {
  this.damageNumbers.push({
    x, y,
    value,
    isCrit: !!isCrit,
    type: type || 'normal', // 'normal'|'crit'|'block'|'burn'|'heal'|'kill'
    life: 1.2,
    maxLife: type === 'heal' ? 1.5 : type === 'crit' ? 1.2 : type === 'kill' ? 1.5 : 1.0,
    vy: type === 'heal' ? -30 : type === 'crit' ? -70 : type === 'kill' ? -50 : -50,
  });
}
```

- [ ] **Step 2: 更新所有调用点**

在 `_updateBattle` 中所有调用 `_addDamageNum` 的地方添加 type 参数：

- 普通攻击：`this._addDamageNum(target.x, target.y - 28, Math.round(dmg), isCrit, blocked ? 'block' : (isCrit ? 'crit' : 'normal'));`
- 火攻灼烧：`this._addDamageNum(enemy.x, enemy.y - 28, dmg, false, 'burn');`
- 诏令伤害：`this._addDamageNum(target.x, target.y - 28, Math.round(dmg), false, 'normal');`
- 宝箱回血：`this._addDamageNum(u.x, u.y - 28, healAmt, false, 'heal');`
- 击杀时：保留 `_onKill` 中原有逻辑，在 `_onKill` 末尾添加 `this._addDamageNum(victim.x, victim.y - 28, '击杀', false, 'kill');`

- [ ] **Step 3: 更新 _drawDamageNumbers 样式**

在 `_drawDamageNumbers()` 循环中（约 line 3950+），按 type 绘制不同样式：

```javascript
_drawDamageNumbers() {
  for (let i = this.damageNumbers.length - 1; i >= 0; i--) {
    const dn = this.damageNumbers[i];
    dn.life -= 0.016;
    if (dn.life <= 0) { this.damageNumbers.splice(i, 1); continue; }
    const progress = 1 - dn.life / dn.maxLife;
    const alpha = 1 - progress;
    
    let fontSize, color, text, shadowColor;
    switch (dn.type) {
      case 'crit':
        fontSize = 18;
        color = '#FFD700';
        text = `${dn.value}!`;
        shadowColor = 'rgba(255,215,0,0.7)';
        break;
      case 'block':
        fontSize = 11;
        color = '#A0AABB';
        text = `🛡 ${dn.value}`;
        shadowColor = null;
        break;
      case 'burn':
        fontSize = 12;
        color = '#F39C12';
        text = `🔥 ${dn.value}`;
        shadowColor = null;
        break;
      case 'heal':
        fontSize = 13;
        color = '#2ECC71';
        text = `+${dn.value}`;
        shadowColor = null;
        break;
      case 'kill':
        fontSize = 20;
        color = '#E74C3C';
        text = '击杀';
        shadowColor = 'rgba(231,76,60,0.6)';
        break;
      default:
        fontSize = 13;
        color = '#FFFFFF';
        text = String(dn.value);
        shadowColor = null;
    }
    
    const x = dn.x;
    const y = dn.y - progress * (dn.type === 'heal' ? 40 : dn.type === 'crit' ? 80 : 60)
              + (dn.type === 'burn' ? Math.sin(progress * 12) * 6 : 0);
    
    ctx.globalAlpha = alpha;
    if (shadowColor) {
      ctx.shadowColor = shadowColor;
      ctx.shadowBlur = 6;
    }
    ctx.fillStyle = color;
    ctx.font = `bold ${fontSize}px "Noto Sans SC","PingFang SC",sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(text, x, y);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }
}
```

- [ ] **Step 4: 验证伤害数字**

进入战斗，检查：
1. 暴击显示金色大字 "48!" 带光晕
2. 格挡显示灰色 "🛡 12" 小字
3. 灼烧显示橙色 "🔥 8" 波浪上飘
4. 治疗显示绿色 "+15"
5. 击杀显示红色大字 "击杀"

---

### Task 10: 连击系统升级

**Files:**
- Modify: `game.js` (combo 显示 + SoundManager)

- [ ] **Step 1: 添加连击等级文字映射**

在 `game.js` 顶部常量区（`SKILL_DEFS` 之后）添加：

```javascript
const COMBO_LEVELS = [
  { threshold: 3,  text: '勢如破竹', color: '#FFFFFF', fontSize: 26 },
  { threshold: 5,  text: '所向披靡', color: '#FFD700', fontSize: 32 },
  { threshold: 8,  text: '萬夫莫敵', color: '#F39C12', fontSize: 38 },
  { threshold: 12, text: '天下無雙', color: '#E74C3C', fontSize: 46 },
];
```

- [ ] **Step 2: 更新连击触发逻辑**

在 `_onKill()` 方法中连击递增处（约 line 3650+），替换 combo 显示逻辑：

```javascript
// 连击递增
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

// 显示连击弹出
const comboEl = document.getElementById('combo-display');
if (this.combo >= 3) {
  comboEl.textContent = comboLevel ? comboLevel.text : `x${this.combo}`;
  comboEl.style.color = comboLevel ? comboLevel.color : '#FFD700';
  // 在 Canvas 上绘制连击弹出
  this._showComboPopup(this.combo, comboLevel);
  
  // 连击音效
  if (this.combo >= 3 && this.combo <= 12) {
    this.sound.comboUp(this.combo);
  }
}

// 连击金币奖励
if (this.combo >= 3) {
  const bonus = this.combo >= 12 ? 30 : this.combo >= 8 ? 15 : this.combo >= 5 ? 8 : 5;
  this.gold += bonus;
  goldDisplay.textContent = `${this.gold}`;
}
```

- [ ] **Step 3: 添加连击弹出方法**

新增方法：

```javascript
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
    // 5+ 连击短暂震动
    this._screenShake = Math.max(this._screenShake, count >= 8 ? 8 : 4);
  }
  container.appendChild(el);
  setTimeout(() => el.remove(), 1500);
}
```

- [ ] **Step 4: 添加连击进度环**

在 `_render()` 的 `_drawUnits()` 之后（Combat UI 区域），添加连击进度环

在 `_render()` 末尾（约 line 1647 之后），添加：

```javascript
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
```

- [ ] **Step 5: 扩展 SoundManager — comboUp 方法**

在 `game.js` 的 `SoundManager` 类中添加 `comboUp` 方法：

```javascript
comboUp(level) {
  this._play(ctx => {
    const notes = [261.63, 329.63, 392.00, 523.25]; // C4, E4, G4, C5
    const noteIdx = Math.min(Math.floor((level - 3) / 3), 3);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = notes[noteIdx];
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  });
}
```

- [ ] **Step 6: 验证连击升级**

进入战斗，积累连击：
1. 3 连击时弹出白色"勢如破竹"
2. 5 连击时弹出金色"所向披靡" + 轻微震动
3. 8 连击时弹出橙色"萬夫莫敵" + 中等震动
4. 12 连击时弹出红色"天下無雙" + 强烈震动
5. 连击期间顶栏显示进度环
6. 连击音效逐级升高

---

## 验证清单

完成所有 10 个 task 后，进行全流程测试：

- [ ] 开始画面 → 阵营选择 → 地图选择 → 部署（检查令牌阵）
- [ ] 自动布阵 → 手动添加士兵 → 出战
- [ ] 战斗中：顶栏卷轴 + 技能兵符 + 烽火 + 天气效果
- [ ] 单位：剪影差异化 + 分段血条 + buff 图标 + 军师光环
- [ ] 战斗：伤害数字风格化 + 连击弹出 + 进度环
- [ ] 胜利：奏章展开动画 + 印章 + 统计逐行浮现
- [ ] 无 console 错误
- [ ] 帧率保持流畅（60fps）
