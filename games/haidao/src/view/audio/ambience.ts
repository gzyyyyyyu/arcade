// 环境声：海浪、风、海鸟。循环只建一次，换场景只调音量；切后台时停鸟叫（整个 ctx 由 sfx.ts 暂停）。
import { AMBIENCE_MIX, nextBirdGap, type AmbienceMode } from './mix.ts';

export class Ambience {
  private mode: AmbienceMode = 'off';
  private muted = false;
  private paused = false;
  private built = false;
  private wave!: GainNode;
  private wind!: GainNode;
  private master!: GainNode;
  private birdTimer: ReturnType<typeof setTimeout> | null = null;

  private ctx: AudioContext;
  private out: AudioNode;

  constructor(ctx: AudioContext, out: AudioNode) { this.ctx = ctx; this.out = out; }

  private build(): void {
    if (this.built) return;
    this.built = true;
    const { ctx } = this;
    // 4 秒的循环噪声（比音效用的短噪声长，免得浪声听出重复）；柔化成近似粉红噪声
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = last * 0.97 + (Math.random() * 2 - 1) * 0.12; d[i] = last; }
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(this.out);

    const src = (): AudioBufferSourceNode => {
      const s = ctx.createBufferSource();
      s.buffer = buf; s.loop = true;
      s.start(0, Math.random() * 3);
      return s;
    };
    // 海浪：低通噪声，音量被 0.11Hz 的慢振荡推起又落下
    this.wave = ctx.createGain(); this.wave.gain.value = 0;
    const wf = ctx.createBiquadFilter(); wf.type = 'lowpass'; wf.frequency.value = 650; wf.Q.value = 0.4;
    const swell = ctx.createGain(); swell.gain.value = 0.5; // 浪涌深度：在 0.5±0.5 之间起伏
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.11;
    const lfoOut = ctx.createGain(); lfoOut.gain.value = 0.5;
    lfo.connect(lfoOut); lfoOut.connect(swell.gain);
    src().connect(wf); wf.connect(swell); swell.connect(this.wave);
    lfo.start();
    this.wave.connect(this.master);

    // 风：带通噪声，中心频率缓慢漂移
    this.wind = ctx.createGain(); this.wind.gain.value = 0;
    const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 450; nf.Q.value = 0.9;
    const lfo2 = ctx.createOscillator(); lfo2.frequency.value = 0.07;
    const lfo2Out = ctx.createGain(); lfo2Out.gain.value = 180;
    lfo2.connect(lfo2Out); lfo2Out.connect(nf.frequency);
    src().connect(nf); nf.connect(this.wind); this.wind.connect(this.master);
    lfo2.start();
  }

  /** 切场景：只调音量，不重建节点 */
  setMode(mode: AmbienceMode): void {
    this.mode = mode;
    if (mode !== 'off') this.build();
    this.apply();
  }

  setMuted(b: boolean): void { this.muted = b; this.apply(); }

  /** 切后台 / 回前台 */
  setPaused(b: boolean): void { this.paused = b; this.apply(); }

  getMode(): AmbienceMode { return this.mode; }

  private apply(): void {
    const silent = this.muted || this.paused || this.mode === 'off';
    if (this.built) {
      const m = AMBIENCE_MIX[this.mode];
      const t = this.ctx.currentTime;
      this.wave.gain.setTargetAtTime(m.wave, t, 0.6);
      this.wind.gain.setTargetAtTime(m.wind, t, 0.6);
      this.master.gain.setTargetAtTime(silent ? 0 : 1, t, silent ? 0.05 : 0.6);
    }
    this.scheduleBird(silent);
  }

  private scheduleBird(silent: boolean): void {
    if (this.birdTimer !== null) { clearTimeout(this.birdTimer); this.birdTimer = null; }
    if (silent) return;
    const gap = nextBirdGap(this.mode);
    if (gap === null) return;
    this.birdTimer = setTimeout(() => { this.birdTimer = null; this.chirp(); this.scheduleBird(false); }, gap);
  }

  /** 海鸟：两三声上扬的短鸣，音高每次不同 */
  private chirp(): void {
    if (this.ctx.state !== 'running') return;
    const { ctx } = this;
    const m = AMBIENCE_MIX[this.mode];
    const base = 2200 + Math.random() * 1600;
    const n = 2 + Math.floor(Math.random() * 2);
    const t0 = ctx.currentTime + 0.02;
    for (let i = 0; i < n; i++) {
      const t = t0 + i * (0.13 + Math.random() * 0.05);
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(base * (0.95 + Math.random() * 0.1), t);
      o.frequency.exponentialRampToValueAtTime(base * 1.35, t + 0.09);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(m.bird, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
      o.connect(g); g.connect(this.master);
      o.onended = () => { o.disconnect(); g.disconnect(); };
      o.start(t); o.stop(t + 0.12);
    }
  }
}
