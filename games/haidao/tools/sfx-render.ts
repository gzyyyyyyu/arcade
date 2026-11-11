/**
 * 把所有音效（每个变体一份）离线渲染成 WAV，并报告时长和峰值。
 * 做法：esbuild 把 src/view/audio/synth.ts 打成浏览器脚本，在无头 chromium 里用 OfflineAudioContext 渲染
 * （链路和线上一致：主增益 0.7 -> 压缩器），把采样取出来写 WAV。
 * 用法：node tools/sfx-render.ts [输出目录]（默认系统临时目录下 haidao-sfx-wav）；峰值 > 0.9 时退出码为 1。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';

const root = new URL('..', import.meta.url).pathname;
const out = resolve(process.argv[2] ?? join(tmpdir(), 'haidao-sfx-wav'));
mkdirSync(out, { recursive: true });

const bundle = await build({
  entryPoints: [join(root, 'src/view/audio/synth.ts')],
  bundle: true, write: false, format: 'iife', globalName: 'Synth', target: 'es2022',
});
const code = bundle.outputFiles[0]!.text;
const mixBundle = await build({
  entryPoints: [join(root, 'src/view/audio/mix.ts')],
  bundle: true, write: false, format: 'iife', globalName: 'Mix', target: 'es2022',
});

const SR = 44100;
const browser = await chromium.launch({ args: ['--no-proxy-server', '--no-zygote', '--in-process-gpu', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
await page.setContent('<html><body></body></html>');
await page.addScriptTag({ content: code });
await page.addScriptTag({ content: mixBundle.outputFiles[0]!.text });

interface Item { name: string; variant: number; dur: number; peak: number; data: number[] }
const items: Item[] = await page.evaluate(async (sr) => {
  const S = (window as unknown as { Synth: { SFX_META: Record<string, { variants: number; dur: number }>; SFX_NAMES: string[]; playSound: (n: string, k: unknown, t: number) => void } }).Synth;
  const M = (window as unknown as { Mix: { VARIANTS: { p: number; l: number; b: number }[] } }).Mix;
  const res: { name: string; variant: number; dur: number; peak: number; data: number[] }[] = [];
  for (const name of S.SFX_NAMES) {
    const meta = S.SFX_META[name]!;
    for (let vi = 0; vi < meta.variants; vi++) {
      const len = Math.ceil(sr * (meta.dur * 1.3 + 0.4));
      const ctx = new OfflineAudioContext(1, len, sr);
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18; comp.knee.value = 12; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.2;
      const master = ctx.createGain(); master.gain.value = 0.7;
      master.connect(comp); comp.connect(ctx.destination);
      const nb = ctx.createBuffer(1, sr * 2, sr);
      const nd = nb.getChannelData(0);
      for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
      const v = meta.variants > 1 ? M.VARIANTS[vi]! : { p: 1, l: 1, b: 1 };
      S.playSound(name, { ctx, out: master, noiseBuf: nb, v }, 0.005);
      const buf = await ctx.startRendering();
      const d = buf.getChannelData(0);
      let peak = 0; let last = 0;
      for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]!); if (a > peak) peak = a; if (a > 0.003) last = i; }
      // 裁掉尾部静音，留 50ms
      const end = Math.min(d.length, last + Math.floor(sr * 0.05));
      res.push({ name, variant: vi, dur: end / sr, peak, data: Array.from(d.subarray(0, end)) });
    }
  }
  return res;
}, SR);
await browser.close();

function wav(data: number[]): Buffer {
  const b = Buffer.alloc(44 + data.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + data.length * 2, 4); b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(data.length * 2, 40);
  data.forEach((x, i) => b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, x)) * 32767), 44 + i * 2));
  return b;
}

let bad = 0;
console.log('名字\t变体\t时长s\t峰值');
for (const it of items) {
  writeFileSync(join(out, `${it.name}-${it.variant}.wav`), wav(it.data));
  const flag = it.peak > 0.9 ? '  <-- 过大' : '';
  if (flag) bad++;
  console.log(`${it.name}\t${it.variant}\t${it.dur.toFixed(2)}\t${it.peak.toFixed(3)}${flag}`);
}
console.log(`共 ${items.length} 个文件，峰值超 0.9 的 ${bad} 个；输出：${out}`);
process.exit(bad ? 1 : 0);
