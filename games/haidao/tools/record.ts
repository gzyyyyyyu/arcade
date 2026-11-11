/**
 * 录屏（shot.ts --record 用）：CDP 屏幕广播收帧，按帧时间戳用 ffmpeg 拼成 webm，再抽帧拼一张缩略图。
 *
 * - 镜头由页面里的测试钩子 `__haidao.follow(id, zoom)` 对准某个兵 / 敌人，所以裁剪区固定在画面正中；
 * - 帧率跟着页面实际出帧走（没有 GPU 时偏低），拼片时每帧按它真实的停留时间放，播放速度和实际一致；
 * - 需要系统里有 ffmpeg（带 libvpx-vp9）。临时帧写在输出目录下的 .frames-<名字>/，拼完删掉。
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CDPSession, Page } from 'playwright-core';

export interface Crop {
  /** 裁剪区占画面宽、高的比例（以画面中心为中心）；向上偏移占画面高的比例 */
  w: number;
  h: number;
  up?: number;
}

interface Frame {
  data: Buffer;
  t: number;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** 从现在起录 ms 毫秒（或 until() 为真时提前结束，最少 minMs），写成 <dir>/<name>.webm 和 <dir>/<name>.png（抽帧拼图）；返回帧数 */
export async function recordClip(page: Page, cdp: CDPSession, dir: string, name: string, ms: number, crop: Crop, until?: () => Promise<boolean>, minMs = 0): Promise<number> {
  const frames: Frame[] = [];
  const onFrame = (f: { data: string; sessionId: number; metadata: { timestamp?: number } }): void => {
    frames.push({ data: Buffer.from(f.data, 'base64'), t: f.metadata.timestamp ?? Date.now() / 1000 });
    void cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => undefined);
  };
  cdp.on('Page.screencastFrame', onFrame);
  const vp = page.viewportSize()!;
  const dpr = await page.evaluate(() => window.devicePixelRatio);
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, everyNthFrame: 1, maxWidth: Math.round(vp.width * dpr), maxHeight: Math.round(vp.height * dpr) });
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    await sleep(100);
    if (until && Date.now() - t0 >= minMs && (await until())) break;
  }
  await cdp.send('Page.stopScreencast');
  cdp.off('Page.screencastFrame', onFrame);
  if (frames.length < 2) return frames.length;
  const tmp = join(dir, `.frames-${name}`);
  mkdirSync(tmp, { recursive: true });
  let list = 'ffconcat version 1.0\n';
  frames.forEach((f, i) => {
    const fn = `f${String(i).padStart(5, '0')}.jpg`;
    writeFileSync(join(tmp, fn), f.data);
    const next = frames[i + 1];
    const d = next ? Math.max(0.005, next.t - f.t) : 0.04;
    list += `file '${fn}'\nduration ${d.toFixed(4)}\n`;
  });
  // concat 分离器要求最后一帧再写一遍，否则它的时长不生效
  list += `file 'f${String(frames.length - 1).padStart(5, '0')}.jpg'\n`;
  writeFileSync(join(tmp, 'list.txt'), list);
  const up = crop.up ?? 0;
  const vf = `crop=w=trunc(iw*${crop.w}/2)*2:h=trunc(ih*${crop.h}/2)*2:x=(iw-ow)/2:y=(ih-oh)/2-ih*${up},scale=640:-2:flags=lanczos,fps=30,format=yuv420p`;
  const webm = join(dir, `${name}.webm`);
  const r1 = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', join(tmp, 'list.txt'), '-vf', vf, '-c:v', 'libvpx-vp9', '-crf', '32', '-b:v', '0', '-row-mt', '1', '-an', webm], { encoding: 'utf8' });
  if (r1.status !== 0) throw new Error(`ffmpeg 拼片失败：${r1.stderr}`);
  // 抽帧拼图：均匀取 12 帧排成 6×2，肉眼看动作有没有预备、余势
  const secs = frames[frames.length - 1]!.t - frames[0]!.t;
  const fps = Math.max(0.5, 12 / Math.max(0.5, secs));
  const r2 = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', webm, '-vf', `fps=${fps.toFixed(3)},scale=240:-2,tile=6x2:padding=4:color=0x10202c`, '-frames:v', '1', join(dir, `${name}.png`)], { encoding: 'utf8' });
  if (r2.status !== 0) throw new Error(`ffmpeg 抽帧失败：${r2.stderr}`);
  rmSync(tmp, { recursive: true, force: true });
  return frames.length;
}

/**
 * 60 帧录制：页面的帧循环停下，每次手动推一帧（16.67ms，钩子 __haidao.frameStep）再截一张画面正中的图，
 * 按 60 帧 / 秒拼成 webm——没有 GPU 的机器实际只出十几帧，这样录出来的才是"按 60 帧设计"的样子，逐帧可查有没有停顿或瞬移。
 * until 每 6 帧问一次，为真后再录 tail 帧就结束（按画面帧数算，不按墙钟：逐帧截图比实际慢得多）。返回帧数。
 */
export async function recordFixed(page: Page, dir: string, name: string, frames: number, crop: Crop, until?: () => Promise<boolean>, tail = 100, fps = 60): Promise<number> {
  const vp = page.viewportSize()!;
  const w = Math.round(vp.width * crop.w);
  const h = Math.round(vp.height * crop.h);
  const clip = { x: Math.round((vp.width - w) / 2), y: Math.round((vp.height - h) / 2 - vp.height * (crop.up ?? 0)), width: w, height: h };
  const tmp = join(dir, `.frames-${name}`);
  mkdirSync(tmp, { recursive: true });
  let n = 0;
  let end = frames;
  try {
    for (; n < end; n++) {
      await page.evaluate((ms) => (window as unknown as { __haidao: { frameStep?(n: number, ms: number): void } }).__haidao.frameStep?.(1, ms), 1000 / fps);
      writeFileSync(join(tmp, `f${String(n).padStart(5, '0')}.jpg`), await page.screenshot({ clip, type: 'jpeg', quality: 92 }));
      if (until && end === frames && n % 6 === 5 && (await until())) end = Math.min(frames, n + tail);
    }
  } finally {
    await page.evaluate(() => (window as unknown as { __haidao: { frameEnd?(): void } }).__haidao.frameEnd?.());
  }
  const webm = join(dir, `${name}.webm`);
  const r1 = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', join(tmp, 'f%05d.jpg'), '-vf', 'scale=640:-2:flags=lanczos,format=yuv420p', '-c:v', 'libvpx-vp9', '-crf', '32', '-b:v', '0', '-row-mt', '1', '-an', webm], { encoding: 'utf8' });
  if (r1.status !== 0) throw new Error(`ffmpeg 拼片失败：${r1.stderr}`);
  // 联系表：均匀取 12 帧排成 6×2
  const every = Math.max(1, Math.floor(n / 12));
  const r2 = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', webm, '-vf', `select='not(mod(n,${every}))',scale=240:-2,tile=6x2:padding=4:color=0x10202c`, '-frames:v', '1', '-fps_mode', 'passthrough', join(dir, `${name}.png`)], { encoding: 'utf8' });
  if (r2.status !== 0) throw new Error(`ffmpeg 抽帧失败：${r2.stderr}`);
  rmSync(tmp, { recursive: true, force: true });
  return n;
}

/** 把一段 webm 按固定帧率抽成一张拼图（cols 列），看连续动作用 */
export function strip(webm: string, png: string, fps: number, cols: number, rows: number, from = 0): void {
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(from), '-i', webm, '-vf', `fps=${fps},scale=200:-2,tile=${cols}x${rows}:padding=3:color=0x10202c`, '-frames:v', '1', png], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffmpeg 抽帧失败：${r.stderr}`);
}
