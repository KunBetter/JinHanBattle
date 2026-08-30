// ============================================================
// 汉金之战 — 音效系统（Web Audio API 程序化生成）
// ============================================================

class SoundManager {
  constructor() {
    this.enabled = true;
    this.ctx = null;
    // ---- 背景音乐（程序化五声音阶 + 战鼓） ----
    this.musicTimer = null;
    this.musicGain = null;
    this.musicVolume = 0.6;
    this._nextNoteTime = 0;
    this._musicBeat = 0;
  }

  _ensureCtx() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  toggle() {
    this.enabled = !this.enabled;
    if (this.enabled) {
      this.startMusic();
    } else {
      this.stopMusic();
    }
    return this.enabled;
  }

  // ---- 背景音乐：C 大调五声音阶，2 音符/秒旋律 + 每 4 拍战鼓 ----
  startMusic() {
    if (!this.enabled) return;
    try {
      const ctx = this._ensureCtx();
      if (this.musicTimer) return; // 已在播放
      this.musicGain = ctx.createGain();
      this.musicGain.gain.value = this.musicVolume;
      this.musicGain.connect(ctx.destination);
      this._nextNoteTime = ctx.currentTime + 0.15;
      this._musicBeat = 0;
      this.musicTimer = setInterval(() => this._scheduleMusic(), 250);
    } catch {}
  }

  stopMusic() {
    if (this.musicTimer) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
    if (this.musicGain) {
      try { this.musicGain.disconnect(); } catch {}
      this.musicGain = null;
    }
  }

  setMusicVolume(v) {
    this.musicVolume = Math.max(0, Math.min(1, v));
    if (this.musicGain && this.ctx) {
      try { this.musicGain.gain.setTargetAtTime(this.musicVolume, this.ctx.currentTime, 0.05); } catch {}
    }
  }

  _scheduleMusic() {
    if (!this.ctx || !this.musicGain) return;
    try {
      // 前瞻调度：提前 0.8s 排好音符，保证节奏不抖动
      while (this._nextNoteTime < this.ctx.currentTime + 0.8) {
        this._playMusicStep(this._nextNoteTime);
        this._nextNoteTime += 0.5;
      }
    } catch {}
  }

  _playMusicStep(t) {
    if (!this.ctx || !this.musicGain) return;
    const ctx = this.ctx;
    const g = this.musicGain;

    // 旋律：五声音阶随机音（C D E G A），三角波，轻柔
    const scale = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25];
    const freq = scale[Math.floor(Math.random() * scale.length)];
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.04, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    osc.connect(og).connect(g);
    osc.start(t); osc.stop(t + 0.5);

    // 战鼓：每 4 拍一下低音鼓点
    if (this._musicBeat % 4 === 0) {
      const bass = ctx.createOscillator();
      bass.type = 'sine';
      bass.frequency.setValueAtTime(98, t);
      bass.frequency.exponentialRampToValueAtTime(49, t + 0.2);
      const bg = ctx.createGain();
      bg.gain.setValueAtTime(0.12, t);
      bg.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      bass.connect(bg).connect(g);
      bass.start(t); bass.stop(t + 0.3);
    }

    // 每 16 拍一次高音铃点缀
    if (this._musicBeat === 8) {
      const bell = ctx.createOscillator();
      bell.type = 'sine';
      bell.frequency.value = 1046.5; // C6
      const bg2 = ctx.createGain();
      bg2.gain.setValueAtTime(0.05, t);
      bg2.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
      bell.connect(bg2).connect(g);
      bell.start(t); bell.stop(t + 0.9);
    }

    this._musicBeat = (this._musicBeat + 1) % 16;
  }

  _play(fn) {
    if (!this.enabled) return;
    try { fn(this._ensureCtx()); } catch {}
  }

  // 按钮点击
  click() {
    this._play(ctx => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.05);
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
      osc.connect(gain).connect(ctx.destination);
      osc.start(); osc.stop(ctx.currentTime + 0.07);
    });
  }

  // 部署单位
  deploy() {
    this._play(ctx => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(500, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(780, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      osc.connect(gain).connect(ctx.destination);
      osc.start(); osc.stop(ctx.currentTime + 0.13);
    });
  }

  // 撤回单位
  undo() {
    this._play(ctx => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(700, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(420, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.07, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      osc.connect(gain).connect(ctx.destination);
      osc.start(); osc.stop(ctx.currentTime + 0.13);
    });
  }

  // 购买/金币入账
  buy() {
    this._play(ctx => {
      [880, 1174.66].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        const t = ctx.currentTime + i * 0.07;
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0.09, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t); osc.stop(t + 0.16);
      });
    });
  }

  // 攻击命中
  hit() {
    this._play(ctx => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(300, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.06);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
      osc.connect(gain).connect(ctx.destination);
      osc.start(); osc.stop(ctx.currentTime + 0.08);
    });
  }

  // 暴击
  crit() {
    this._play(ctx => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(600, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      osc.connect(gain).connect(ctx.destination);
      osc.start(); osc.stop(ctx.currentTime + 0.12);
    });
  }

  // 击杀
  kill() {
    this._play(ctx => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(500, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(150, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      osc.connect(gain).connect(ctx.destination);
      osc.start(); osc.stop(ctx.currentTime + 0.2);
    });
  }

  // 城门受击
  gateHit() {
    this._play(ctx => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(120, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.connect(gain).connect(ctx.destination);
      osc.start(); osc.stop(ctx.currentTime + 0.25);

      // 低频震动
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(35, ctx.currentTime);
      gain2.gain.setValueAtTime(0.25, ctx.currentTime);
      gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc2.connect(gain2).connect(ctx.destination);
      osc2.start(); osc2.stop(ctx.currentTime + 0.3);
    });
  }

  // 连击音
  combo() {
    this._play(ctx => {
      for (let i = 0; i < 3; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        const t = ctx.currentTime + i * 0.06;
        osc.frequency.setValueAtTime(400 + i * 150, t);
        gain.gain.setValueAtTime(0.08, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t); osc.stop(t + 0.08);
      }
    });
  }

  // 技能 — 火攻
  fire() {
    this._play(ctx => {
      const bufferSize = ctx.sampleRate * 0.8;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize) * 0.3;
      }
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
      source.connect(gain).connect(ctx.destination);
      source.start();
    });
  }

  // 技能 — 夜战
  night() {
    this._play(ctx => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(200, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 1.0);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);
      osc.connect(gain).connect(ctx.destination);
      osc.start(); osc.stop(ctx.currentTime + 1.2);
    });
  }

  // 技能 — 传令
  messenger() {
    this._play(ctx => {
      [523, 659, 784].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        const t = ctx.currentTime + i * 0.12;
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0.1, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t); osc.stop(t + 0.2);
      });
    });
  }

  // 技能 — 诏令
  decree() {
    this._play(ctx => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(80, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.3);
      osc.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 1.0);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.setValueAtTime(0.12, ctx.currentTime + 0.3);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);
      osc.connect(gain).connect(ctx.destination);
      osc.start(); osc.stop(ctx.currentTime + 1.2);
    });
  }

  // 天气变化
  weather() {
    this._play(ctx => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(250, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(350, ctx.currentTime + 0.3);
      gain.gain.setValueAtTime(0.06, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.connect(gain).connect(ctx.destination);
      osc.start(); osc.stop(ctx.currentTime + 0.4);
    });
  }

  // 宝箱拾取
  chest() {
    this._play(ctx => {
      [523, 659, 784, 1047].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        const t = ctx.currentTime + i * 0.08;
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0.1, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t); osc.stop(t + 0.15);
      });
    });
  }

  // 胜利（号角 + 战鼓 + 锣）
  victory() {
    this._play(ctx => {
      // 号角 arpeggio
      [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        const t = ctx.currentTime + i * 0.15;
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0.13, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t); osc.stop(t + 0.32);
      });
      // 低音战鼓
      [0, 0.6].forEach((off, i) => {
        const t = ctx.currentTime + off;
        const drum = ctx.createOscillator();
        const dg = ctx.createGain();
        drum.type = 'sine';
        drum.frequency.setValueAtTime(80, t);
        drum.frequency.exponentialRampToValueAtTime(40, t + 0.25);
        dg.gain.setValueAtTime(0.18, t);
        dg.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        drum.connect(dg).connect(ctx.destination);
        drum.start(t); drum.stop(t + 0.32);
      });
      // 结尾锣声
      const gong = ctx.createOscillator();
      const gg = ctx.createGain();
      gong.type = 'sine';
      gong.frequency.setValueAtTime(196, ctx.currentTime + 0.9);
      gong.frequency.exponentialRampToValueAtTime(98, ctx.currentTime + 1.6);
      gg.gain.setValueAtTime(0.12, ctx.currentTime + 0.9);
      gg.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.9);
      gong.connect(gg).connect(ctx.destination);
      gong.start(ctx.currentTime + 0.9); gong.stop(ctx.currentTime + 2.0);
    });
  }

  // 战败（下行低音 + 丧锣）
  defeat() {
    this._play(ctx => {
      [400, 350, 300, 200].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        const t = ctx.currentTime + i * 0.2;
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0.12, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t); osc.stop(t + 0.3);
      });
      const gong = ctx.createOscillator();
      const gg = ctx.createGain();
      gong.type = 'sine';
      gong.frequency.setValueAtTime(110, ctx.currentTime + 0.8);
      gong.frequency.exponentialRampToValueAtTime(55, ctx.currentTime + 1.5);
      gg.gain.setValueAtTime(0.12, ctx.currentTime + 0.8);
      gg.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.7);
      gong.connect(gg).connect(ctx.destination);
      gong.start(ctx.currentTime + 0.8); gong.stop(ctx.currentTime + 1.8);
    });
  }

  // 连击升级音
  comboUp(level) {
    this._play(ctx => {
      const notes = [261.63, 329.63, 392.00, 523.25];
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
}
