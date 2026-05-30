/* ==============================================
   汉金之战 — Sprite & Texture Generator
   "Ink & Iron" Art Direction (墨铁风)
   All assets generated procedurally at load time.
   ============================================== */

const Assets = (() => {
  const cache = {};
  const FACTION = { han: '#C0392B', jin: '#2E86C1' };
  const FACTION_LIGHT = { han: '#E74C3C', jin: '#5DADE2' };
  const FACTION_DARK = { han: '#7B1A1A', jin: '#153E6B' };

  // Unit dimensions
  const U_W = 48, U_H = 56;

  /* ================================================================
     Helpers
     ================================================================ */

  function _makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  function _ctx(c) { return c.getContext('2d'); }

  function _roundRect(ctx, x, y, w, h, r) {
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

  /* ================================================================
     Unit Sprite Generator
     Draws a detailed soldier at 48x56 onto a canvas.
     ================================================================ */
  function _drawUnitSprite(faction, typeDef) {
    const c = _makeCanvas(U_W, U_H);
    const ctx = _ctx(c);
    const fc = FACTION[faction];
    const fl = FACTION_LIGHT[faction];
    const fd = FACTION_DARK[faction];

    const cx = U_W / 2, by = U_H - 8; // body center, base y

    // ---- Shadow (oval on ground) ----
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(cx, by + 2, 14, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // ---- Legs / Lower Body ----
    const type = typeDef.type;
    _drawLegs(ctx, type, cx, by, fc, fd);

    // ---- Body / Torso ----
    _drawBody(ctx, type, cx, by - 18, fc, fl, fd);

    // ---- Arms & Weapon ----
    _drawArmsAndWeapon(ctx, type, cx, by - 18, fc, fl, fd, faction);

    // ---- Head & Helmet ----
    _drawHead(ctx, type, cx, by - 34, fc, fl, fd);

    return c;
  }

  function _drawLegs(ctx, type, cx, by, fc, fd) {
    const lg = ctx.createLinearGradient(cx - 6, 0, cx + 6, 0);
    lg.addColorStop(0, '#3D2E1E');
    lg.addColorStop(0.5, '#5A4530');
    lg.addColorStop(1, '#3D2E1E');

    ctx.fillStyle = lg;
    if (type === 'cavalry') {
      // 马身颜色：汉=深棕马，金=灰白马
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
      // 马腿 x4
      ctx.fillStyle = '#3D2E1E';
      ctx.fillRect(cx - 8, by - 2, 2, 8);
      ctx.fillRect(cx - 2, by - 2, 2, 8);
      ctx.fillRect(cx + 4, by - 2, 2, 8);
      ctx.fillRect(cx + 10, by - 2, 2, 8);
      // 骑手腿
      ctx.fillStyle = '#4A3520';
      ctx.fillRect(cx - 3, by - 14, 3, 6);
      ctx.fillRect(cx + 2, by - 14, 3, 6);
    } else if (type === 'strategist') {
      // Long robe
      const rg = ctx.createLinearGradient(0, by - 24, 0, by);
      rg.addColorStop(0, '#4A5568');
      rg.addColorStop(0.5, '#718096');
      rg.addColorStop(1, '#4A5568');
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.moveTo(cx - 8, by - 20);
      ctx.lineTo(cx + 8, by - 20);
      ctx.lineTo(cx + 12, by);
      ctx.lineTo(cx - 12, by);
      ctx.closePath();
      ctx.fill();
      // Sash
      ctx.strokeStyle = fc;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx - 7, by - 14);
      ctx.lineTo(cx + 7, by - 14);
      ctx.stroke();
    } else {
      // Standard pants + boots
      ctx.fillRect(cx - 6, by - 16, 5, 14);
      ctx.fillRect(cx + 1, by - 16, 5, 14);
      // Boots
      ctx.fillStyle = '#2C1E0E';
      ctx.fillRect(cx - 7, by - 3, 7, 5);
      ctx.fillRect(cx, by - 3, 7, 5);
    }
  }

  function _drawBody(ctx, type, cx, by, fc, fl, fd) {
    const typeStyles = {
      sword:    { armor: '#5D4E37', detail: '#8B7355', heavy: false },
      spear:    { armor: '#5D4E37', detail: '#8B7355', heavy: false },
      halberd:  { armor: '#4A4A4A', detail: '#6E6E6E', heavy: true },
      cavalry:  { armor: '#5D4E37', detail: '#8B7355', heavy: false },
      ram:      { armor: '#5D5037', detail: '#8B7E55', heavy: true },
      catapult: { armor: '#5D4E37', detail: '#8B7355', heavy: false },
      crossbow: { armor: '#6B5B4A', detail: '#9B8B7A', heavy: false },
      shield:   { armor: '#4A4A4A', detail: '#6E6E6E', heavy: true },
      strategist:{ armor: '#4A5568', detail: '#718096', heavy: false },
    };
    const s = typeStyles[type] || typeStyles.sword;

    // Torso
    const tg = ctx.createLinearGradient(0, by - 14, 0, by);
    tg.addColorStop(0, s.detail);
    tg.addColorStop(0.5, s.armor);
    tg.addColorStop(1, s.detail);
    ctx.fillStyle = tg;

    if (s.heavy) {
      // Heavy armor — wider, bulkier
      ctx.beginPath();
      ctx.moveTo(cx - 9, by - 14);
      ctx.lineTo(cx + 9, by - 14);
      ctx.lineTo(cx + 10, by);
      ctx.lineTo(cx - 10, by);
      ctx.closePath();
      ctx.fill();
      // Shoulder pauldrons
      ctx.fillStyle = s.detail;
      ctx.beginPath();
      ctx.ellipse(cx - 7, by - 12, 4, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx + 7, by - 12, 4, 3, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (type === 'strategist') {
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
    } else {
      // Light/medium armor
      ctx.beginPath();
      ctx.moveTo(cx - 7, by - 14);
      ctx.lineTo(cx + 7, by - 14);
      ctx.lineTo(cx + 8, by);
      ctx.lineTo(cx - 8, by);
      ctx.closePath();
      ctx.fill();
      // Leather strips / lamellar lines
      ctx.strokeStyle = s.armor;
      ctx.lineWidth = 0.5;
      for (let i = 1; i < 5; i++) {
        const yy = by - 14 + i * 3;
        ctx.beginPath();
        ctx.moveTo(cx - 6, yy);
        ctx.lineTo(cx + 6, yy);
        ctx.stroke();
      }
    }

    // Faction sash/belt
    ctx.fillStyle = fc;
    ctx.fillRect(cx - 7, by - 2, 14, 2);
    ctx.strokeStyle = fc;
    ctx.lineWidth = 1;
    ctx.strokeRect(cx - 7, by - 2, 14, 2);
  }

  function _drawArmsAndWeapon(ctx, type, cx, by, fc, fl, fd, faction) {
    // Arm color
    const armGrad = ctx.createLinearGradient(0, 0, 0, by + 4);
    armGrad.addColorStop(0, '#8B7355');
    armGrad.addColorStop(1, '#5D4E37');

    switch (type) {
      case 'sword':
        // Right arm holding sword up
        ctx.fillStyle = armGrad;
        ctx.fillRect(cx + 4, by - 6, 3, 10);
        // Sword blade
        const sg = ctx.createLinearGradient(0, by - 24, 0, by - 4);
        sg.addColorStop(0, '#E0E8F0');
        sg.addColorStop(0.3, '#FFFFFF');
        sg.addColorStop(0.5, '#C0C8D0');
        sg.addColorStop(1, '#9098A0');
        ctx.fillStyle = sg;
        ctx.beginPath();
        ctx.moveTo(cx + 7, by - 24);
        ctx.lineTo(cx + 9, by - 22);
        ctx.lineTo(cx + 7, by - 4);
        ctx.lineTo(cx + 5, by - 4);
        ctx.closePath();
        ctx.fill();
        // Guard
        ctx.fillStyle = fc;
        ctx.fillRect(cx + 3, by - 8, 6, 2);
        // Hilt
        ctx.fillStyle = '#8B4513';
        ctx.fillRect(cx + 5, by - 4, 2, 4);
        break;

      case 'spear':
        // Both arms forward holding spear
        ctx.fillStyle = armGrad;
        ctx.fillRect(cx - 2, by - 6, 3, 8);
        ctx.fillRect(cx + 4, by - 4, 3, 8);
        // Spear shaft
        ctx.strokeStyle = '#8B6914';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx - 12, by - 8);
        ctx.lineTo(cx + 2, by - 30);
        ctx.stroke();
        // Spear head
        ctx.fillStyle = '#E0E8F0';
        ctx.beginPath();
        ctx.moveTo(cx + 2, by - 32);
        ctx.lineTo(cx + 4, by - 28);
        ctx.lineTo(cx + 2, by - 26);
        ctx.lineTo(cx, by - 28);
        ctx.closePath();
        ctx.fill();
        // Red tassel
        ctx.fillStyle = fc;
        ctx.beginPath();
        ctx.arc(cx + 2, by - 26, 3, 0, Math.PI);
        ctx.fill();
        break;

      case 'halberd':
        // Heavy swing pose
        ctx.fillStyle = armGrad;
        ctx.fillRect(cx - 3, by - 6, 4, 10);
        ctx.fillRect(cx + 2, by - 8, 3, 8);
        // Shaft
        ctx.strokeStyle = '#6B4914';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx - 10, by - 2);
        ctx.lineTo(cx + 8, by - 28);
        ctx.stroke();
        // Blade
        const hg = ctx.createLinearGradient(0, 0, 5, 0);
        hg.addColorStop(0, '#F0F4F8');
        hg.addColorStop(0.5, '#D0D8E0');
        hg.addColorStop(1, '#A0A8B0');
        ctx.fillStyle = hg;
        ctx.beginPath();
        ctx.moveTo(cx + 6, by - 30);
        ctx.lineTo(cx + 14, by - 24);
        ctx.lineTo(cx + 8, by - 18);
        ctx.closePath();
        ctx.fill();
        break;

      case 'cavalry':
        // Saber, mounted pose
        ctx.fillStyle = armGrad;
        ctx.fillRect(cx + 2, by - 4, 3, 6);
        // Curved saber
        ctx.strokeStyle = '#E8ECF4';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(cx + 6, by - 20);
        ctx.quadraticCurveTo(cx + 16, by - 14, cx + 12, by - 2);
        ctx.stroke();
        // Guard
        ctx.fillStyle = fc;
        ctx.fillRect(cx + 3, by - 5, 5, 1.5);
        break;

      case 'ram':
        // 木制横梁
        ctx.fillStyle = '#5D4037';
        ctx.fillRect(cx - 16, by - 8, 28, 6);
        // 金属撞头（圆形+尖刺）
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
        ctx.fillStyle = '#5D3A1A';
        ctx.fillRect(cx - 10, by - 4, 2, 6);
        ctx.fillRect(cx + 2, by - 4, 2, 6);
        break;

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
        // 投臂（斜向上）
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
        ctx.fillStyle = '#5D3A1A';
        ctx.fillRect(cx + 6, by - 2, 2, 6);
        break;

      case 'crossbow':
        // Holding crossbow forward
        ctx.fillStyle = armGrad;
        ctx.fillRect(cx - 2, by - 4, 3, 8);
        ctx.fillRect(cx + 4, by - 4, 3, 6);
        // Crossbow stock
        ctx.fillStyle = '#6B4520';
        ctx.fillRect(cx - 4, by - 10, 16, 3);
        // Bow limbs
        ctx.strokeStyle = '#8B6914';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx, by - 7);
        ctx.quadraticCurveTo(cx - 8, by - 18, cx - 10, by - 12);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx + 4, by - 7);
        ctx.quadraticCurveTo(cx + 12, by - 18, cx + 14, by - 12);
        ctx.stroke();
        // String
        ctx.strokeStyle = '#C0B090';
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(cx - 10, by - 12);
        ctx.lineTo(cx + 14, by - 12);
        ctx.stroke();
        // Bolt
        ctx.strokeStyle = '#9098A0';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(cx + 4, by - 9);
        ctx.lineTo(cx + 18, by - 14);
        ctx.stroke();
        break;

      case 'shield':
        // 左手握盾
        ctx.fillStyle = '#5D3A1A';
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

      case 'strategist':
        // 持扇手
        ctx.fillStyle = '#5D3A1A';
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
    }
  }

  function _drawHead(ctx, type, cx, by, fc, fl, fd) {
    // Skin
    const skinGrad = ctx.createRadialGradient(cx - 1, by - 3, 1, cx, by, 6);
    skinGrad.addColorStop(0, '#FDEBD3');
    skinGrad.addColorStop(0.7, '#E8C9A0');
    skinGrad.addColorStop(1, '#D4A574');
    ctx.fillStyle = skinGrad;
    ctx.beginPath();
    ctx.arc(cx, by, 6, 0, Math.PI * 2);
    ctx.fill();

    // Eyes
    ctx.fillStyle = '#FFF';
    ctx.beginPath();
    ctx.ellipse(cx - 2.5, by - 1, 2.2, 1.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx + 2.5, by - 1, 2.2, 1.8, 0, 0, Math.PI * 2);
    ctx.fill();
    // Pupils
    ctx.fillStyle = '#1A0A00';
    ctx.beginPath();
    ctx.arc(cx - 2.5, by - 1, 1.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + 2.5, by - 1, 1.2, 0, Math.PI * 2);
    ctx.fill();
    // Eye highlights
    ctx.fillStyle = '#FFF';
    ctx.beginPath();
    ctx.arc(cx - 3, by - 1.5, 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + 2, by - 1.5, 0.5, 0, Math.PI * 2);
    ctx.fill();
    // Eyebrows
    ctx.strokeStyle = '#3A2010';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(cx - 4.5, by - 4);
    ctx.lineTo(cx - 1, by - 3.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + 4.5, by - 4);
    ctx.lineTo(cx + 1, by - 3.5);
    ctx.stroke();
    // Mouth
    ctx.strokeStyle = '#C08560';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.arc(cx, by + 2, 2, 0.1, Math.PI - 0.1);
    ctx.stroke();

    // ---- Helmet (type-specific) ----
    switch (type) {
      case 'sword':
        _drawConicalHelmet(ctx, cx, by, fc, fl, fd);
        break;
      case 'spear':
        _drawPointedHelmet(ctx, cx, by, fc, fl, fd);
        break;
      case 'halberd':
        _drawHeavyHelm(ctx, cx, by, fc, fl, fd);
        break;
      case 'cavalry':
        _drawCavalryHelmet(ctx, cx, by, fc, fl, fd);
        break;
      case 'ram':
        _drawReinforcedHelmet(ctx, cx, by, fc, fl, fd);
        break;
      case 'catapult':
        _drawOpenHelm(ctx, cx, by, fc, fl, fd);
        break;
      case 'crossbow':
        _drawLeatherCap(ctx, cx, by, fc, fl, fd);
        break;
      case 'shield':
        _drawFullHelm(ctx, cx, by, fc, fl, fd);
        break;
      case 'strategist':
        _drawScholarCap(ctx, cx, by, fc, fl, fd);
        break;
    }
  }

  // Helmet variants
  function _helmetBase(ctx, cx, by, color, highlight) {
    const hg = ctx.createLinearGradient(0, by - 10, 0, by - 2);
    hg.addColorStop(0, highlight);
    hg.addColorStop(0.4, color);
    hg.addColorStop(1, '#3A3A3A');
    ctx.fillStyle = hg;
  }

  function _drawConicalHelmet(ctx, cx, by, fc, fl, fd) {
    // Cone top
    _helmetBase(ctx, cx, by, '#5A5A5A', '#808080');
    ctx.beginPath();
    ctx.moveTo(cx - 6, by - 3);
    ctx.lineTo(cx - 5, by - 10);
    ctx.lineTo(cx, by - 13);
    ctx.lineTo(cx + 5, by - 10);
    ctx.lineTo(cx + 6, by - 3);
    ctx.closePath();
    ctx.fill();
    // Brim
    ctx.fillStyle = '#4A4A4A';
    ctx.fillRect(cx - 7, by - 4, 14, 3);
    // Faction band
    ctx.fillStyle = fc;
    ctx.fillRect(cx - 6, by - 6, 12, 1.2);
    // Top spike
    ctx.fillStyle = '#D0D0D0';
    ctx.fillRect(cx - 0.5, by - 14, 1, 3);
  }

  function _drawPointedHelmet(ctx, cx, by, fc, fl, fd) {
    _helmetBase(ctx, cx, by, '#4A4A5A', '#6A6A7A');
    ctx.beginPath();
    ctx.moveTo(cx - 6, by - 3);
    ctx.quadraticCurveTo(cx - 2, by - 8, cx, by - 14);
    ctx.quadraticCurveTo(cx + 2, by - 8, cx + 6, by - 3);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#3A3A4A';
    ctx.fillRect(cx - 7, by - 4, 14, 3);
    ctx.fillStyle = fc;
    ctx.fillRect(cx - 5, by - 6, 10, 1);
  }

  function _drawHeavyHelm(ctx, cx, by, fc, fl, fd) {
    _helmetBase(ctx, cx, by, '#3A3A3A', '#5A5A5A');
    ctx.beginPath();
    ctx.arc(cx, by - 5, 7, Math.PI, 0);
    ctx.fill();
    // Top spike
    ctx.fillStyle = '#808080';
    ctx.fillRect(cx - 1, by - 13, 2, 5);
    ctx.fillStyle = '#D0D0D0';
    ctx.beginPath();
    ctx.arc(cx, by - 14, 1.5, 0, Math.PI * 2);
    ctx.fill();
    // Face guard
    ctx.fillStyle = '#4A4A4A';
    ctx.fillRect(cx - 6, by - 4, 12, 5);
    // Eye slit
    ctx.fillStyle = '#1A1A2E';
    ctx.fillRect(cx - 4, by - 4, 8, 1.2);
    // Faction crest
    ctx.fillStyle = fc;
    ctx.fillRect(cx - 3, by - 9, 6, 1.5);
  }

  function _drawCavalryHelmet(ctx, cx, by, fc, fl, fd) {
    _helmetBase(ctx, cx, by, '#5A5A5A', '#808080');
    ctx.beginPath();
    ctx.arc(cx, by - 4, 6.5, Math.PI, 0);
    ctx.fill();
    // Brim
    ctx.fillStyle = '#4A4A4A';
    ctx.fillRect(cx - 7, by - 2, 14, 2.5);
    // Horsehair crest
    ctx.fillStyle = '#8B0000';
    ctx.beginPath();
    ctx.moveTo(cx - 1.5, by - 9);
    ctx.quadraticCurveTo(cx - 0.5, by - 20, cx + 4, by - 18);
    ctx.lineTo(cx + 2, by - 9);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#6B0000';
    ctx.lineWidth = 0.5;
    ctx.stroke();
    // Faction band
    ctx.fillStyle = fc;
    ctx.fillRect(cx - 5, by - 8, 10, 1.2);
  }

  function _drawReinforcedHelmet(ctx, cx, by, fc, fl, fd) {
    _helmetBase(ctx, cx, by, '#4A4A44', '#6A6A64');
    ctx.beginPath();
    ctx.arc(cx, by - 3, 7, Math.PI, 0);
    ctx.fill();
    // Reinforcement bands
    ctx.strokeStyle = '#808070';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, by - 10);
    ctx.lineTo(cx, by + 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 7, by - 5);
    ctx.lineTo(cx + 7, by - 5);
    ctx.stroke();
    // Brim
    ctx.fillStyle = '#4A4A44';
    ctx.fillRect(cx - 7, by - 2, 14, 3);
    ctx.fillStyle = fc;
    ctx.fillRect(cx - 4, by - 7, 8, 1);
  }

  function _drawOpenHelm(ctx, cx, by, fc, fl, fd) {
    _helmetBase(ctx, cx, by, '#5A5040', '#7A7060');
    ctx.beginPath();
    ctx.arc(cx, by - 6, 7, Math.PI * 0.15, Math.PI * 0.85);
    ctx.fill();
    // Headband
    ctx.fillStyle = fc;
    ctx.fillRect(cx - 6, by - 7, 12, 1.5);
    ctx.strokeStyle = '#4A4030';
    ctx.lineWidth = 0.6;
    ctx.strokeRect(cx - 6, by - 7, 12, 1.5);
    // Neck guard
    ctx.fillStyle = '#5A5040';
    ctx.fillRect(cx - 5, by - 2, 10, 4);
    ctx.strokeStyle = '#4A4030';
    ctx.lineWidth = 0.5;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(cx - 4, by - 1 + i * 1.5);
      ctx.lineTo(cx + 4, by - 1 + i * 1.5);
      ctx.stroke();
    }
  }

  function _drawLeatherCap(ctx, cx, by, fc, fl, fd) {
    const lg = ctx.createLinearGradient(0, by - 8, 0, by);
    lg.addColorStop(0, '#8B6914');
    lg.addColorStop(0.5, '#6B4914');
    lg.addColorStop(1, '#4A3010');
    ctx.fillStyle = lg;
    ctx.beginPath();
    ctx.arc(cx, by - 5, 6.5, Math.PI, 0);
    ctx.fill();
    // Stitching
    ctx.strokeStyle = '#A08830';
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    ctx.moveTo(cx, by - 11);
    ctx.lineTo(cx, by - 1);
    ctx.stroke();
    // Ear flaps
    ctx.fillStyle = '#6B4914';
    ctx.fillRect(cx - 7, by - 4, 3, 6);
    ctx.fillRect(cx + 4, by - 4, 3, 6);
    // Faction badge
    ctx.fillStyle = fc;
    ctx.beginPath();
    ctx.arc(cx, by - 7, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  function _drawFullHelm(ctx, cx, by, fc, fl, fd) {
    _helmetBase(ctx, cx, by, '#3A3A3A', '#5A5A5A');
    // Full dome
    ctx.beginPath();
    ctx.arc(cx, by - 4, 7, Math.PI, 0);
    ctx.fill();
    // Face plate
    ctx.fillStyle = '#4A4A4A';
    ctx.fillRect(cx - 6, by - 4, 12, 7);
    // Narrow eye slit
    ctx.fillStyle = '#111';
    ctx.fillRect(cx - 4.5, by - 3, 9, 1);
    // Breathing holes
    ctx.fillStyle = '#111';
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(cx - 2 + i * 2, by + 1, 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Top crest
    ctx.fillStyle = fc;
    ctx.fillRect(cx - 2, by - 11, 4, 3);
    ctx.fillStyle = fl;
    ctx.fillRect(cx - 1.5, by - 12, 3, 2);
    // Cheek guards
    ctx.fillStyle = '#4A4A4A';
    ctx.fillRect(cx - 7, by, 2, 5);
    ctx.fillRect(cx + 5, by, 2, 5);
  }

  function _drawScholarCap(ctx, cx, by, fc, fl, fd) {
    // Scholar cap (巾幘 / 纶巾)
    ctx.fillStyle = '#2C3E50';
    ctx.fillRect(cx - 7, by - 8, 14, 5);
    ctx.fillStyle = '#34495E';
    ctx.fillRect(cx - 5, by - 10, 10, 3);
    // Side wings
    ctx.fillStyle = '#2C3E50';
    ctx.beginPath();
    ctx.moveTo(cx - 7, by - 6);
    ctx.lineTo(cx - 14, by - 3);
    ctx.lineTo(cx - 6, by - 1);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + 7, by - 6);
    ctx.lineTo(cx + 14, by - 3);
    ctx.lineTo(cx + 6, by - 1);
    ctx.closePath();
    ctx.fill();
    // Hair bun
    ctx.fillStyle = '#1A0A00';
    ctx.beginPath();
    ctx.arc(cx, by - 9, 2.5, 0, Math.PI * 2);
    ctx.fill();
    // Hairpin
    ctx.strokeStyle = '#D0D0D0';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(cx - 3, by - 9);
    ctx.lineTo(cx + 3, by - 9);
    ctx.stroke();
  }

  /* ================================================================
     Texture Generators
     ================================================================ */

  // Stone wall texture (tileable 64x64)
  function _makeStoneTexture() {
    const c = _makeCanvas(64, 64);
    const ctx = _ctx(c);

    // Base fill with slight variation
    ctx.fillStyle = '#8A8A82';
    ctx.fillRect(0, 0, 64, 64);

    // Mortar lines
    ctx.fillStyle = '#7A7A72';
    ctx.fillRect(0, 0, 64, 1);
    ctx.fillRect(0, 21, 64, 1);
    ctx.fillRect(0, 43, 64, 1);
    ctx.fillRect(0, 20, 1, 23);
    ctx.fillRect(21, 0, 1, 21);
    ctx.fillRect(43, 0, 1, 21);
    ctx.fillRect(15, 21, 1, 23);
    ctx.fillRect(38, 21, 1, 23);
    ctx.fillRect(25, 43, 1, 21);
    ctx.fillRect(52, 43, 1, 21);

    // Stone face variations
    for (let i = 0; i < 20; i++) {
      const sx = 1 + Math.random() * 62;
      const sy = 1 + Math.random() * 62;
      const sr = 1 + Math.random() * 3;
      const shade = 130 + Math.random() * 20 - 10;
      ctx.fillStyle = `rgb(${shade},${shade},${shade - 5})`;
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fill();
    }

    // Cracks
    ctx.strokeStyle = 'rgba(0,0,0,0.1)';
    ctx.lineWidth = 0.4;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      let x = Math.random() * 64, y = Math.random() * 64;
      ctx.moveTo(x, y);
      for (let j = 0; j < 4; j++) {
        x += (Math.random() - 0.5) * 16;
        y += (Math.random() - 0.5) * 16;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    return c;
  }

  // Wood grain texture (tileable 64x64)
  function _makeWoodTexture() {
    const c = _makeCanvas(64, 64);
    const ctx = _ctx(c);

    const bgGrad = ctx.createLinearGradient(0, 0, 0, 64);
    bgGrad.addColorStop(0, '#8B6914');
    bgGrad.addColorStop(0.3, '#7B5910');
    bgGrad.addColorStop(0.6, '#8B6914');
    bgGrad.addColorStop(1, '#6B4910');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, 64, 64);

    // Grain lines
    for (let i = 0; i < 12; i++) {
      const y = 4 + i * 5 + (Math.random() - 0.5) * 2;
      const alpha = 0.05 + Math.random() * 0.1;
      ctx.strokeStyle = `rgba(0,0,0,${alpha})`;
      ctx.lineWidth = 0.5 + Math.random() * 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x < 64; x += 8) {
        ctx.lineTo(x + 8, y + (Math.random() - 0.5) * 3);
      }
      ctx.stroke();
    }

    // Knot
    const kx = 32, ky = 32;
    for (let r = 2; r < 10; r += 1.5) {
      ctx.strokeStyle = `rgba(0,0,0,${0.04 + r * 0.01})`;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.ellipse(kx, ky, r, r * 0.6, 0.3, 0, Math.PI * 2);
      ctx.stroke();
    }

    return c;
  }

  // Ground / earth texture (tileable 64x64)
  function _makeGroundTexture() {
    const c = _makeCanvas(64, 64);
    const ctx = _ctx(c);

    const gg = ctx.createLinearGradient(0, 0, 0, 64);
    gg.addColorStop(0, '#8B7D5E');
    gg.addColorStop(0.3, '#7D6E50');
    gg.addColorStop(0.7, '#6B5D40');
    gg.addColorStop(1, '#5D4F35');
    ctx.fillStyle = gg;
    ctx.fillRect(0, 0, 64, 64);

    // Pebbles and dots
    for (let i = 0; i < 40; i++) {
      const px = Math.random() * 64, py = Math.random() * 64;
      const shade = 100 + Math.random() * 40;
      ctx.fillStyle = `rgba(${shade},${shade - 10},${shade - 20},0.3)`;
      ctx.beginPath();
      ctx.arc(px, py, 0.5 + Math.random() * 1.5, 0, Math.PI * 2);
      ctx.fill();
    }

    return c;
  }

  // Grass patch texture (tileable 64x64)
  function _makeGrassTexture() {
    const c = _makeCanvas(64, 64);
    const ctx = _ctx(c);

    // Base earth
    ctx.fillStyle = '#6B7D3A';
    ctx.fillRect(0, 0, 64, 64);

    // Grass blades - dense layered strokes
    for (let layer = 0; layer < 3; layer++) {
      const count = 60 - layer * 15;
      const alpha = 0.15 + layer * 0.1;
      for (let i = 0; i < count; i++) {
        const gx = Math.random() * 64;
        const gy = Math.random() * 64;
        const gh = 2 + Math.random() * 6;
        const gw = 0.5 + Math.random() * 0.8;
        const shade = 50 + layer * 20 + Math.random() * 40;
        ctx.strokeStyle = `rgba(${shade},${shade + 40},${shade - 10},${alpha})`;
        ctx.lineWidth = gw;
        ctx.beginPath();
        ctx.moveTo(gx, gy);
        ctx.quadraticCurveTo(gx + (Math.random() - 0.5) * 3, gy - gh * 0.5, gx + (Math.random() - 0.5) * 2, gy - gh);
        ctx.stroke();
      }
    }

    return c;
  }

  // Leaf texture for forest canopy
  function _makeLeafTexture() {
    const c = _makeCanvas(64, 64);
    const ctx = _ctx(c);

    const lg = ctx.createRadialGradient(32, 32, 4, 32, 32, 45);
    lg.addColorStop(0, 'rgba(46,125,50,0.9)');
    lg.addColorStop(0.5, 'rgba(27,94,32,0.7)');
    lg.addColorStop(1, 'rgba(10,50,15,0)');
    ctx.fillStyle = lg;
    ctx.fillRect(0, 0, 64, 64);

    // Leaf clusters
    for (let i = 0; i < 30; i++) {
      const lx = 8 + Math.random() * 48;
      const ly = 8 + Math.random() * 48;
      const shade = 20 + Math.random() * 50;
      ctx.fillStyle = `rgba(${shade},${shade + 40},${shade},0.5)`;
      ctx.beginPath();
      ctx.ellipse(lx, ly, 3 + Math.random() * 5, 2 + Math.random() * 3, Math.random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }

    return c;
  }

  // Dirt path texture
  function _makePathTexture() {
    const c = _makeCanvas(64, 64);
    const ctx = _ctx(c);

    ctx.fillStyle = '#9B8B6E';
    ctx.fillRect(0, 0, 64, 64);

    // Sandy/dirt variations
    for (let i = 0; i < 50; i++) {
      const px = Math.random() * 64;
      const py = Math.random() * 64;
      const shade = 140 + Math.random() * 30;
      ctx.fillStyle = `rgba(${shade},${shade - 15},${shade - 35},0.4)`;
      ctx.beginPath();
      ctx.arc(px, py, 0.5 + Math.random() * 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Cart ruts
    ctx.strokeStyle = 'rgba(80,65,45,0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 28);
    ctx.quadraticCurveTo(16, 26, 32, 30);
    ctx.quadraticCurveTo(48, 34, 64, 30);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, 36);
    ctx.quadraticCurveTo(16, 34, 32, 38);
    ctx.quadraticCurveTo(48, 42, 64, 38);
    ctx.stroke();

    return c;
  }

  // Rock surface texture
  function _makeRockTexture() {
    const c = _makeCanvas(64, 64);
    const ctx = _ctx(c);

    const rg = ctx.createLinearGradient(0, 0, 64, 64);
    rg.addColorStop(0, '#9E9E9E');
    rg.addColorStop(0.3, '#8E8E8E');
    rg.addColorStop(0.6, '#757575');
    rg.addColorStop(1, '#6E6E6E');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, 64, 64);

    // Fracture lines
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 0.6;
    for (let i = 0; i < 8; i++) {
      ctx.beginPath();
      let x = Math.random() * 64, y = Math.random() * 64;
      ctx.moveTo(x, y);
      for (let j = 0; j < 3; j++) {
        x += (Math.random() - 0.5) * 20;
        y += (Math.random() - 0.5) * 20;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Mineral specks
    for (let i = 0; i < 25; i++) {
      const shade = 180 + Math.random() * 75;
      ctx.fillStyle = `rgba(${shade},${shade},${shade},0.5)`;
      ctx.beginPath();
      ctx.arc(Math.random() * 64, Math.random() * 64, 0.5 + Math.random() * 1.2, 0, Math.PI * 2);
      ctx.fill();
    }

    return c;
  }

  // Bark texture for tree trunks
  function _makeBarkTexture() {
    const c = _makeCanvas(64, 64);
    const ctx = _ctx(c);

    const bg = ctx.createLinearGradient(0, 0, 64, 0);
    bg.addColorStop(0, '#4A3420');
    bg.addColorStop(0.3, '#5D3E28');
    bg.addColorStop(0.5, '#6B4530');
    bg.addColorStop(0.7, '#5D3E28');
    bg.addColorStop(1, '#4A3420');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 64, 64);

    // Vertical bark lines
    for (let i = 0; i < 15; i++) {
      const x = 3 + i * 4 + (Math.random() - 0.5) * 2;
      ctx.strokeStyle = `rgba(0,0,0,${0.08 + Math.random() * 0.12})`;
      ctx.lineWidth = 0.4 + Math.random() * 0.6;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + (Math.random() - 0.5) * 1.5, 64);
      ctx.stroke();
    }

    // Horizontal roughness
    for (let i = 0; i < 8; i++) {
      const y = 4 + i * 8;
      ctx.strokeStyle = 'rgba(0,0,0,0.03)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(64, y + (Math.random() - 0.5) * 4);
      ctx.stroke();
    }

    // Moss patches at bottom
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = `rgba(60,120,40,${0.1 + Math.random() * 0.15})`;
      ctx.beginPath();
      ctx.arc(16 + Math.random() * 32, 52 + Math.random() * 12, 2 + Math.random() * 5, 0, Math.PI * 2);
      ctx.fill();
    }

    return c;
  }

  /* ================================================================
     Environment Sprites
     ================================================================ */

  // Tree sprite (forest map) - 64x100
  function _makeTreeSprite() {
    const c = _makeCanvas(64, 100);
    const ctx = _ctx(c);

    // Trunk
    const tg = ctx.createLinearGradient(0, 0, 14, 0);
    tg.addColorStop(0, '#4A3420');
    tg.addColorStop(0.5, '#6B4530');
    tg.addColorStop(1, '#3A2410');
    ctx.fillStyle = tg;
    ctx.fillRect(25, 50, 14, 50);

    // Canopy layers (bottom to top, dark to light)
    const layers = [
      { y: 35, w: 48, h: 30, color: '#1B5E20' },
      { y: 22, w: 40, h: 28, color: '#2E7D32' },
      { y: 8, w: 32, h: 26, color: '#388E3C' },
      { y: 0, w: 22, h: 20, color: '#43A047' },
    ];

    for (const l of layers) {
      const lg = ctx.createRadialGradient(32, l.y + l.h / 2, 2, 32, l.y + l.h / 2, l.w / 2);
      lg.addColorStop(0, l.color);
      lg.addColorStop(0.7, l.color);
      lg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = lg;
      ctx.beginPath();
      ctx.ellipse(32, l.y + l.h / 2, l.w / 2, l.h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Highlight spots on canopy
    for (let i = 0; i < 12; i++) {
      ctx.fillStyle = 'rgba(180,220,150,0.2)';
      ctx.beginPath();
      ctx.arc(18 + Math.random() * 28, 5 + Math.random() * 30, 2 + Math.random() * 4, 0, Math.PI * 2);
      ctx.fill();
    }

    return c;
  }

  // Bush sprite - 40x30
  function _makeBushSprite() {
    const c = _makeCanvas(40, 30);
    const ctx = _ctx(c);

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(20, 26, 16, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Bush body - overlapping lobes
    const lobes = [
      { x: 12, y: 16, rx: 10, ry: 9 },
      { x: 22, y: 14, rx: 11, ry: 10 },
      { x: 17, y: 10, rx: 9, ry: 8 },
      { x: 28, y: 18, rx: 8, ry: 8 },
      { x: 9, y: 20, rx: 7, ry: 6 },
    ];

    for (const l of lobes) {
      const lg = ctx.createRadialGradient(l.x, l.y, 1, l.x, l.y, l.rx);
      lg.addColorStop(0, '#4CAF50');
      lg.addColorStop(0.6, '#2E7D32');
      lg.addColorStop(1, '#1B5E20');
      ctx.fillStyle = lg;
      ctx.beginPath();
      ctx.ellipse(l.x, l.y, l.rx, l.ry, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Highlight leaves
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = 'rgba(180,230,160,0.25)';
      ctx.beginPath();
      ctx.arc(8 + Math.random() * 24, 6 + Math.random() * 16, 1.5 + Math.random() * 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    return c;
  }

  // Flag sprite - Han faction, 48x60
  function _makeFlagSprite(faction) {
    const c = _makeCanvas(48, 60);
    const ctx = _ctx(c);
    const fc = FACTION[faction];
    const fd = FACTION_DARK[faction];

    // Pole
    const pg = ctx.createLinearGradient(0, 0, 4, 0);
    pg.addColorStop(0, '#8B6914');
    pg.addColorStop(0.3, '#C0A060');
    pg.addColorStop(0.6, '#8B6914');
    pg.addColorStop(1, '#5D3A10');
    ctx.fillStyle = pg;
    ctx.fillRect(20, 4, 4, 56);

    // Pole top ornament
    ctx.fillStyle = '#F0D68A';
    ctx.beginPath();
    ctx.arc(22, 4, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#A0782C';
    ctx.lineWidth = 0.5;
    ctx.stroke();

    // Flag cloth
    const fg = ctx.createLinearGradient(0, 0, 28, 0);
    fg.addColorStop(0, fd);
    fg.addColorStop(0.3, fc);
    fg.addColorStop(0.6, fc);
    fg.addColorStop(1, fd);
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.moveTo(24, 8);
    ctx.quadraticCurveTo(38, 10, 42, 18);
    ctx.quadraticCurveTo(44, 26, 38, 32);
    ctx.quadraticCurveTo(34, 36, 24, 36);
    ctx.closePath();
    ctx.fill();

    // Flag border
    ctx.strokeStyle = '#F0D68A';
    ctx.lineWidth = 0.8;
    ctx.stroke();

    // Character on flag
    ctx.fillStyle = '#F0D68A';
    ctx.font = 'bold 12px "Noto Serif SC", serif';
    ctx.textAlign = 'center';
    ctx.fillText(faction === 'han' ? '漢' : '金', 33, 25);

    return c;
  }

  // Chest sprite - 40x32
  function _makeChestSprite() {
    const c = _makeCanvas(40, 32);
    const ctx = _ctx(c);

    // Glow
    const glow = ctx.createRadialGradient(20, 20, 4, 20, 20, 24);
    glow.addColorStop(0, 'rgba(255,215,0,0.3)');
    glow.addColorStop(1, 'rgba(255,215,0,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(20, 20, 24, 0, Math.PI * 2);
    ctx.fill();

    // Body
    const bg = ctx.createLinearGradient(0, 0, 0, 32);
    bg.addColorStop(0, '#A0522D');
    bg.addColorStop(0.5, '#8B4513');
    bg.addColorStop(1, '#6B3410');
    ctx.fillStyle = bg;
    _roundRect(ctx, 4, 14, 32, 16, 3);
    ctx.fill();

    // Gold trim
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 1;
    _roundRect(ctx, 4, 14, 32, 16, 3);
    ctx.stroke();

    // Lid
    const lg = ctx.createLinearGradient(0, 10, 0, 18);
    lg.addColorStop(0, '#C07040');
    lg.addColorStop(0.5, '#A0522D');
    lg.addColorStop(1, '#8B4513');
    ctx.fillStyle = lg;
    ctx.beginPath();
    ctx.moveTo(2, 14);
    ctx.quadraticCurveTo(4, 4, 20, 2);
    ctx.quadraticCurveTo(36, 4, 38, 14);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Lock
    ctx.fillStyle = '#FFD700';
    ctx.beginPath();
    ctx.arc(20, 16, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#B7950B';
    ctx.lineWidth = 0.5;
    ctx.stroke();
    // Keyhole
    ctx.fillStyle = '#3A1A00';
    ctx.beginPath();
    ctx.arc(20, 16, 1.2, 0, Math.PI * 2);
    ctx.fill();

    // Gold corner ornaments
    const corners = [[6, 16], [34, 16], [6, 27], [34, 27]];
    for (const [cx, cy] of corners) {
      ctx.fillStyle = '#FFD700';
      ctx.beginPath();
      ctx.arc(cx, cy, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }

    return c;
  }

  /* ================================================================
     Batch Generation & Public API
     ================================================================ */

  function generateAll() {
    // Unit sprites
    const unitTypes = ['sword','spear','halberd','cavalry','ram','catapult','crossbow','shield','strategist'];
    for (const type of unitTypes) {
      cache[`unit_han_${type}`] = _drawUnitSprite('han', { type });
      cache[`unit_jin_${type}`] = _drawUnitSprite('jin', { type });
    }

    // 2x upsample: 生成 96x112 高分辨率版本，Canvas 渲染时自动降采样变清晰
    const unitKeys = Object.keys(cache).filter(k => k.startsWith('unit_'));
    for (const key of unitKeys) {
      const orig = cache[key];
      const c2x = _makeCanvas(U_W * 2, U_H * 2);
      const ctx2x = _ctx(c2x);
      ctx2x.imageSmoothingEnabled = false;
      ctx2x.drawImage(orig, 0, 0, U_W, U_H, 0, 0, U_W * 2, U_H * 2);
      cache[key] = c2x;
    }

    // Textures
    cache.texture_stone  = _makeStoneTexture();
    cache.texture_wood   = _makeWoodTexture();
    cache.texture_ground = _makeGroundTexture();
    cache.texture_grass  = _makeGrassTexture();
    cache.texture_leaf   = _makeLeafTexture();
    cache.texture_path   = _makePathTexture();
    cache.texture_rock   = _makeRockTexture();
    cache.texture_bark   = _makeBarkTexture();

    // Environment sprites
    cache.sprite_tree      = _makeTreeSprite();
    cache.sprite_bush      = _makeBushSprite();
    cache.sprite_flag_han  = _makeFlagSprite('han');
    cache.sprite_flag_jin  = _makeFlagSprite('jin');
    cache.sprite_chest     = _makeChestSprite();

    console.log(`[Assets] Generated ${Object.keys(cache).length} sprites & textures.`);
  }

  function get(key) { return cache[key] || null; }

  // On-demand unit sprite — returns cached or generates fresh
  function getOrGenerate(faction, type) {
    const key = 'unit_' + faction + '_' + type;
    if (cache[key]) return cache[key];
    // Generate on the fly, then 2x upsample
    const raw = _drawUnitSprite(faction, { type });
    const c2x = _makeCanvas(U_W * 2, U_H * 2);
    const ctx2x = _ctx(c2x);
    ctx2x.imageSmoothingEnabled = false;
    ctx2x.drawImage(raw, 0, 0, U_W, U_H, 0, 0, U_W * 2, U_H * 2);
    cache[key] = c2x;
    return c2x;
  }

  return { generateAll, get, getOrGenerate };
})();
