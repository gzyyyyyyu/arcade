/**
 * 把结算的声音序列按时间轴混成 WAV，给人听节奏：node tools/sfx-result-wav.ts <输出目录>
 * 时间点直接取 src/view/audio/result.ts 的 resultBeats（和画面同一组常量），链路和线上一致
 * （小音效 -> 闪避增益 -> 主增益 0.7 -> 压缩器；大音效绕过闪避、触发闪避）。输出 result-win3.wav、result-win1.wav、result-lose.wav。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';

const root = new URL('..', import.meta.url).pathname;
const out = resolve(process.argv[2] ?? '.');
mkdirSync(out, { recursive: true });
const bundle = async (f: string, name: string): Promise<string> =>
  (await build({ entryPoints: [join(root, f)], bundle: true, write: false, format: 'iife', globalName: name, target: 'es2022' })).outputFiles[0]!.text;

const SR = 44100;
const browser = await chromium.launch({ args: ['--no-proxy-server', '--no-zygote', '--in-process-gpu'] });
const page = await browser.newPage();
await page.setContent('<html><body></body></html>');
for (const [f, n] of [['src/view/audio/synth.ts', 'Synth'], ['src/view/audio/mix.ts', 'Mix'], ['src/view/audio/result.ts', 'Result']] as const) await page.addScriptTag({ content: await bundle(f, n) });

const cases = [
  { name: 'result-win3', kind: 'battle', stars: 3, win: true },
  { name: 'result-win1', kind: 'battle', stars: 1, win: true },
  { name: 'result-lose', kind: 'battle', stars: 0, win: false },
] as const;
const res: Array<{ name: string; data: number[]; beats: string }> = await page.evaluate(async ({ sr, cases }) => {
  // biome-ignore lint/suspicious/noExplicitAny: 页面里挂的是 vite 动态载入的合成器模块，形状只在浏览器里确定
  const w = window as unknown as Record<string, any>;
  const { Synth: S, Mix: M, Result: R } = w;
  const outAll: Array<{ name: string; data: number[]; beats: string }> = [];
  for (const c of cases) {
    const beats = R.resultBeats({ kind: c.kind, stars: c.stars, win: c.win, roll: true }) as Array<{ at: number; name: string; pitch: number }>;
    const total = 7.5;
    const ctx = new OfflineAudioContext(1, Math.ceil(sr * total), sr);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 12; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.2;
    const master = ctx.createGain(); master.gain.value = 0.7; master.connect(comp); comp.connect(ctx.destination);
    const duck = ctx.createGain(); duck.connect(master);
    const nb = ctx.createBuffer(1, sr * 2, sr);
    const nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    duck.gain.setValueAtTime(1, 0);
    let lastVar = -1;
    for (const b of beats) {
      const meta = S.SFX_META[b.name];
      const t = b.at / 1000;
      const idx = M.pickVariant(meta.variants, lastVar, () => 0.5);
      lastVar = idx;
      const v = meta.variants > 1 ? { ...M.VARIANTS[idx] } : { p: 1, l: 1, b: 1 };
      v.p *= b.pitch;
      if (meta.big) {
        const p = M.duckPlan(meta.dur * 1000);
        duck.gain.setValueAtTime(1, t);
        duck.gain.linearRampToValueAtTime(p.depth, t + 0.03);
        duck.gain.setValueAtTime(p.depth, t + 0.03 + p.holdMs / 1000);
        duck.gain.linearRampToValueAtTime(1, t + 0.03 + (p.holdMs + p.releaseMs) / 1000);
      }
      S.playSound(b.name, { ctx, out: meta.big ? master : duck, noiseBuf: nb, v }, t);
    }
    const buf = await ctx.startRendering();
    outAll.push({ name: c.name, data: Array.from(buf.getChannelData(0)), beats: beats.map((b) => `${b.at}ms ${b.name}${b.pitch !== 1 ? ` x${b.pitch.toFixed(2)}` : ''}`).join(' | ') });
  }
  return outAll;
}, { sr: SR, cases });
await browser.close();

for (const r of res) {
  const b = Buffer.alloc(44 + r.data.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + r.data.length * 2, 4); b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(r.data.length * 2, 40);
  let peak = 0;
  r.data.forEach((x, i) => { peak = Math.max(peak, Math.abs(x)); b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, x)) * 32767), 44 + i * 2); });
  writeFileSync(join(out, `${r.name}.wav`), b);
  console.log(`${r.name}.wav 峰值 ${peak.toFixed(3)}\n  ${r.beats}`);
}
