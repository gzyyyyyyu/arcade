/**
 * 结算收尾演出（画面侧，不碰结算数字和存档）：弹窗出现之前在战场上演一小段。
 * 登陆战赢：活着的兵原地举武器跳一下（各兵错开），镜头缓推到主寨；输：炮台照常转，屏边轻轻压暗。
 * 守岛赢：炮台齐射礼花；输：海盗冲上岸的定格（镜头推向他们、红圈一闪、屏边压暗）。
 * 时间全走游戏时钟（场景的 postupdate，和 frameStep 一致），不用 setTimeout；点一下 / 滚轮跳过；
 * 减弱动态（feelOn 为假）时不演，调用方直接弹窗。
 */
import Phaser from 'phaser';
import { feelOn } from './feel.ts';
import { footCenter, iso } from './iso.ts';
import { EASE_FN } from './motion.ts';
import { LOD_MARGIN, SKEL, STYLE, type RigKind } from './rig.ts';
import { lodOf, type Rig, type RigIn } from './rigsprite.ts';
import { sfx } from './audio/sfx.ts';
import { DEPTH } from './depth.ts';
import type { BattleScene } from './BattleScene.ts';
import type { TdScene } from './TdScene.ts';

/** 刚开始这么久点的不算跳过（玩家正在连点沙滩时刚好打完，别一下被吞掉） */
const SKIP_GRACE_MS = 250;

// ---------------------------------------------------------------- 纯函数（时间线）

/** 欢呼一个循环（毫秒） */
const CHEER_MS = 820;
/** 欢呼前的一段（主寨倒塌的余韵），欢呼从这之后才开始 */
const CHEER_LEAD_MS = 400;

interface Cheer {
  /** 向上的位移（像素，负数往上） */
  oy: number;
  /** 落地压扁 */
  sq: number;
  /** 举武器的程度 0..1（攻击动作的预备段走到哪） */
  up: number;
}

const smooth = (k: number): number => k * k * (3 - 2 * k);
const clamp01 = (k: number): number => Math.min(1, Math.max(0, k));

/**
 * 一个兵在欢呼第 t 毫秒的姿势。预备（蹲一下举起武器）→ 出手（起跳到最高）→ 余势（落地压扁、武器放下）。
 * seed 错开各兵的相位；ramp 是 0..1 的整体淡入（开头几十毫秒从原姿势平滑过渡）。
 */
function cheerAt(t: number, seed: number, ramp: number): Cheer {
  const ph = ((((t + seed * 137) % CHEER_MS) + CHEER_MS) % CHEER_MS) / CHEER_MS;
  const air = clamp01(ph / 0.68);
  const jump = Math.sin(Math.PI * air) ** 0.8;
  const land = ph > 0.68 ? Math.sin(((ph - 0.68) / 0.32) * Math.PI) : 0;
  // 蹲：起跳前 0.12 的一小段先往下沉一点
  const crouch = ph < 0.12 ? Math.sin((ph / 0.12) * Math.PI) * 0.6 : 0;
  const up = ph < 0.3 ? smooth(ph / 0.3) : ph < 0.78 ? 1 : 1 - smooth((ph - 0.78) / 0.22);
  return { oy: (-jump * 13 + crouch) * ramp, sq: (land * 0.12 + crouch * 0.05) * ramp, up: up * ramp };
}

/** 镜头推近：缩放按比例插值，中心向目标靠近 blend（不一下居中，免得整座岛跑出屏） */
function pushView(from: { cx: number; cy: number; z: number }, to: { cx: number; cy: number; zMul: number; blend: number }, k: number, out: { cx: number; cy: number; z: number }): void {
  const e = EASE_FN.recover(clamp01(k));
  out.z = from.z * (1 + (to.zMul - 1) * e);
  out.cx = from.cx + (to.cx - from.cx) * to.blend * e;
  out.cy = from.cy + (to.cy - from.cy) * to.blend * e;
}

// ---------------------------------------------------------------- 驱动

interface Run {
  /** 已演毫秒 */
  t: number;
  ms: number;
  step: (t: number, dt: number, time: number) => void;
  cleanup: () => void;
}

/**
 * 在场景的 postupdate 里推进（排在场景自己的 update 之后，所以能改写本帧已经算好的骨架姿势），
 * 到时间或被跳过时清理并调 onDone，只调一次；场景关了就清理、不调。
 */
function drive(scene: Phaser.Scene, ui: HTMLElement, ms: number, step: Run['step'], cleanup: () => void, onDone: () => void): void {
  const run: Run = { t: 0, ms, step, cleanup };
  let over = false;
  const end = (call: boolean): void => {
    if (over) return;
    over = true;
    scene.events.off(Phaser.Scenes.Events.POST_UPDATE, tick);
    scene.events.off(Phaser.Scenes.Events.SHUTDOWN, down);
    ui.removeEventListener('pointerdown', skip, true);
    ui.removeEventListener('wheel', skip, true);
    scene.input?.off('pointerdown', skip);
    scene.input?.off('wheel', skip);
    run.cleanup();
    if (call) onDone();
  };
  const skip = (): void => {
    if (run.t >= SKIP_GRACE_MS) end(true);
  };
  const tick = (time: number, dt: number): void => {
    run.t += Math.min(dt, 100);
    run.step(Math.min(run.t, run.ms), dt, time);
    if (run.t >= run.ms) end(true);
  };
  const down = (): void => end(false);
  scene.events.on(Phaser.Scenes.Events.POST_UPDATE, tick);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, down);
  ui.addEventListener('pointerdown', skip, true);
  ui.addEventListener('wheel', skip, true);
  scene.input?.on('pointerdown', skip);
  scene.input?.on('wheel', skip);
}

/** 屏边压暗：盖在画布上、不挡操作的径向渐变，不透明度由演出推（颜色按胜负） */
function vignette(ui: HTMLElement, rgb: string): HTMLElement {
  const v = document.createElement('div');
  v.className = 'hd-endvig';
  v.style.cssText = `position:absolute;inset:0;pointer-events:none;z-index:12;opacity:0;background:radial-gradient(ellipse at center,rgba(0,0,0,0) 52%,rgba(${rgb},.5) 100%)`;
  ui.appendChild(v);
  return v;
}

// ---------------------------------------------------------------- 登陆战

/**
 * 登陆战打完、弹窗之前的收尾，共 ms 毫秒（游戏时钟），播完调 onDone。返回 false = 不演（调用方走原来的延迟）。
 * 赢：活着的兵和英雄举武器跳，镜头缓推主寨。输：压暗屏边，炮台继续转（场景本来就在逐帧画）。
 */
export function battleEnd(bs: BattleScene, win: boolean, ms: number, onDone: () => void): boolean {
  if (ms <= 0 || !feelOn() || !bs.ui.isConnected) return false;
  const cc = bs.cc;
  const from = { cx: cc.cx, cy: cc.cy, z: cc.z };
  const cur = { cx: cc.cx, cy: cc.cy, z: cc.z };
  const vig = vignette(bs.ui, '8,12,30');
  const hq = bs.st.buildings.find((b) => b.kind === 'hq');
  const hp = hq ? footCenter(hq.x, hq.y, hq.size) : null;
  const hw = hp ? iso(hp.gx, hp.gy) : null;
  const to = { cx: hw ? hw.x : cc.cx, cy: hw ? hw.y : cc.cy, zMul: 1.16, blend: 0.8 };
  if (to.zMul * cc.z > cc.maxZ) to.zMul = Math.max(1, cc.maxZ / cc.z);
  if (win) {
    let any = false;
    for (const u of bs.st.units) if (u.mode !== 'dead') any = true;
    if (!any && !bs.st.hero) {
      vig.remove();
      return false;
    }
    sfx('shout');
  }
  const cam = bs.cameras.main;
  const ri: RigIn = { x: 0, y: 0, depth: 0, face: 1, mode: 'attack', dist: 0, atk: 0, oy: 0, sq: 0, alpha: 1, lod: 0, full: true };
  const cheerRig = (rig: Rig, kind: RigKind, face: number, dist: number, t: number, seed: number, ramp: number, time: number, gx?: number, gy?: number): void => {
    const sk = SKEL[kind];
    const lod = lodOf(cam, bs.r, rig.c.x, rig.c.y, -sk.top * sk.s, LOD_MARGIN);
    if (lod !== 0) return;
    const ck = cheerAt(t, seed, ramp);
    const hit = STYLE[kind].attack.hit ?? 0.42;
    ri.x = rig.c.x;
    ri.y = rig.c.y;
    ri.depth = rig.c.depth;
    ri.face = face;
    ri.dist = dist;
    // 攻击动作的预备段（臂和武器举过头）当作举手欢呼，停在最高的那个姿势附近
    ri.atk = ck.up * hit * 0.62;
    ri.oy = ck.oy;
    ri.sq = ck.sq;
    ri.lod = lod;
    ri.gx = gx;
    ri.gy = gy;
    rig.update(ri, time);
  };
  drive(
    bs,
    bs.ui,
    ms,
    (t, _dt, time) => {
      const k = t / ms;
      vig.style.opacity = String((win ? 0 : 1) * EASE_FN.recover(clamp01(k / 0.7)));
      if (!win) return;
      pushView(from, to, k, cur);
      cc.setView(cur.cx, cur.cy, cur.z);
      const ct = t - CHEER_LEAD_MS;
      if (ct < 0) return;
      const ramp = clamp01(ct / 160);
      for (const [id, sp] of bs.usp) {
        if (sp.fading || !bs.ubyId.get(id) || bs.ubyId.get(id)?.mode === 'dead' || !sp.rig.kind) continue;
        const u = bs.ubyId.get(id)!;
        cheerRig(sp.rig, sp.rig.kind, sp.face, sp.dist, ct, id, ramp, time, u.gx, u.gy);
      }
      const h = bs.st.hero;
      if (h && h.mode !== 'dead' && bs.heroImg?.kind) cheerRig(bs.heroImg, bs.heroImg.kind, bs.heroTurn * 1.1, bs.heroDist, ct, 7, ramp, time);
    },
    () => (win ? vig.remove() : vig.style.setProperty('opacity', '1')),
    onDone,
  );
  return true;
}

// ---------------------------------------------------------------- 守岛

interface Salvo {
  at: number;
  x: number;
  y: number;
  dx: number;
  dot: Phaser.GameObjects.Arc | null;
  burst: boolean;
}

/**
 * 守岛打完、结算框之前的收尾（普通战役关），共 ms 毫秒，播完调 onDone。返回 false = 不演。
 * 赢：最多 5 座炮台错开齐射，弹丸蹿上去在高处炸开礼花（彩带粒子池）。
 * 输：镜头推向还在岛上的海盗（找不到推向宝藏箱），那里一圈红环扩开，屏边压暗；兵不动（核心已经停了），就是一个定格。
 */
export function tdEnd(bs: TdScene, win: boolean, ms: number, onDone: () => void): boolean {
  if (ms <= 0 || !feelOn() || !bs.ui.isConnected) return false;
  if (win) {
    const salvos: Salvo[] = [];
    for (const t of bs.s.towers) {
      const sp = bs.tsp.get(t.id);
      if (!sp || salvos.length >= 5) continue;
      salvos.push({ at: 60 + salvos.length * 130, x: sp.img.x, y: sp.img.y - 24, dx: (salvos.length - 2) * 26, dot: null, burst: false });
    }
    if (!salvos.length) return false;
    const RISE = 300;
    drive(
      bs,
      bs.ui,
      ms,
      (t) => {
        for (const sv of salvos) {
          if (t >= sv.at && !sv.dot) {
            sv.dot = bs.add.circle(sv.x, sv.y, 3.5, 0xfff2a0).setDepth(DEPTH.coinBurst);
            bs.pt.muzzle(sv.x, sv.y);
            sfx('cannon', { pitch: 1.1 });
          }
          if (!sv.dot || sv.burst) continue;
          const k = (t - sv.at) / RISE;
          if (k >= 1) {
            sv.burst = true;
            bs.pt.confetti(sv.x + sv.dx, sv.y - 84, false);
            sv.dot.destroy();
            sv.dot = null;
            continue;
          }
          const e = EASE_FN.strike(clamp01(k));
          sv.dot.setPosition(sv.x + sv.dx * e, sv.y - 84 * e);
        }
      },
      () => {
        for (const sv of salvos) sv.dot?.destroy();
      },
      onDone,
    );
    return true;
  }
  // 输：定格在海盗冲上岸的地方
  const cc = bs.cc;
  const from = { cx: cc.cx, cy: cc.cy, z: cc.z };
  const cur = { cx: cc.cx, cy: cc.cy, z: cc.z };
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (const e of bs.esp.values()) {
    if (e.rig.c.visible && e.rig.c.alpha > 0.5) {
      sx += e.rig.c.x;
      sy += e.rig.c.y;
      n++;
    }
  }
  const chest = bs.chests[0];
  if (n) {
    sx /= n;
    sy /= n;
  } else if (chest) {
    sx = chest.x;
    sy = chest.y;
    n = 1;
  }
  const vig = vignette(bs.ui, '60,10,10');
  const ring = n ? bs.add.ellipse(sx, sy, 40, 20).setStrokeStyle(4, 0xff5a4a, 1).setFillStyle(0xff5a4a, 0.12).setDepth(DEPTH.slowMark).setAlpha(0) : null;
  const to = { cx: sx, cy: sy, zMul: Math.min(1.12, cc.maxZ / cc.z), blend: n ? 0.6 : 0 };
  drive(
    bs,
    bs.ui,
    ms,
    (t) => {
      const k = t / ms;
      vig.style.opacity = String(EASE_FN.recover(clamp01(k / 0.7)));
      pushView(from, to, k, cur);
      cc.setView(cur.cx, cur.cy, cur.z);
      if (ring) {
        const rk = clamp01(k / 0.8);
        ring.setScale(1 + EASE_FN.strike(rk) * 3).setAlpha((1 - rk) * 0.9);
      }
    },
    () => {
      ring?.destroy();
      vig.style.setProperty('opacity', '1');
    },
    onDone,
  );
  return true;
}
