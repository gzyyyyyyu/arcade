/** 特效事件分发：规则核心每拍给出的事件（登陆、开火、命中、爆炸、倒塌、阵亡、技能、英雄……）到音效、粒子、震屏、顿帧的映射，按事件数组的顺序处理 */
import { SKILLS } from '../content/index.ts';
import { BEACH, UNIT, type BattleEvent } from '../core/types.ts';
import { fxA } from './art.ts';
import { BAR_SIZE } from './bars.ts';
import { EASE, STAGE_LOOK, collapseScale } from './motion.ts';
import { bigEvent, flash, shake } from './fx.ts';
import { buildingDownEvent, isBigBlast, isKeyHit, vibrate, HEAVY_HIT } from './feel.ts';
import { put, ringOf } from './ground.ts';
import { isHeavyDmg, trackOf } from './dmgkind.ts';
import { sfx } from './audio/sfx.ts';
import { crumbleSound, hitSound, isBigBuilding, projectileFire, towerFire } from './audio/pick.ts';
import { artTop } from './textures.ts';

import type { BattleScene } from './BattleScene.ts';
import { collapse, slam } from './battlebuildings.ts';
import { fade, recoil, tallyDeath } from './battleunits.ts';
import { isTarTrap, tarGroundOf } from './tarfx.ts';
import { DEPTH } from './depth.ts';
import { startLanding } from './landfx.ts';
import { funEvent } from './funui.ts';
import { STEP_MS } from './motion.ts';

export function onEvent(bs: BattleScene, e: BattleEvent): void {
  switch (e.type) {
    case 'land': {
      sfx('land');
      sfx('shout');
      bs.landPts.push({ x: e.x, y: e.y });
      // 木筏滑到浅水、兵一个个跳下涉水上岸（landfx.ts）
      startLanding(bs, e);
      break;
    }
    case 'shoot': {
      const pr = bs.st.projectiles.find((q) => q.id === e.projectile);
      if (e.from === 'building') {
        const bb = bs.st.buildings.find((q) => q.id === e.id);
        if (bb?.kind === 'kraken') slam(bs, pr ? bs.W(pr.x1, pr.y1) : bs.W((bb.x + bb.size / 2) * UNIT, (bb.y + bb.size / 2) * UNIT));
      }
      const tu = e.from === 'building' ? bs.tur.get(e.id) : undefined;
      if (e.from === 'building' && !tu) recoil(bs, e.id, pr);
      if (pr) {
        if (e.from === 'building') trackOf(bs).noteShoot(pr.kind, pr.x1, pr.y1, pr.t1);
        // 按开火的东西选声音：火枪、臼炮、火箭、鱼叉、喷火、大炮各不一样
        const bb = e.from === 'building' ? bs.st.buildings.find((q) => q.id === e.id) : undefined;
        const bk = bb?.kind;
        sfx(bk ? towerFire(bk) : projectileFire(pr.kind));
        if (bk === 'sniper') bs.snipe.stop(e.id);
        const w = bs.W(pr.x0, pr.y0);
        if (tu) {
          // 炮台：转到位（还差就这一帧补完）、预备-后坐-回位、火光和烟（turret.ts）；炮口位置交给弹道当起点
          const t = bs.W(pr.x1, pr.y1);
          const reload = bb ? Math.max(1, bb.cd - bs.st.tick + 1) * STEP_MS : 1000;
          const m = tu.fire(bs.nowT, reload, t.x, t.y, { x: 0, y: 0, gx: 0, gy: 0, z: 0 });
          bs.shotFrom.set(pr.id, { m, t: tu, kind: tu.kind });
        } else if (e.from === 'building' && bk !== 'kraken') {
          // 炮口火光和一缕烟走对象池（塔开火很密，不新建图像）
          bs.pt.muzzle(w.x, w.y - 16);
          bs.pt.emit('puff', w.x, w.y - 18, { vx: 6, vy: -22, life: 620, s0: 0.35, s1: 0.95, a0: 0.55, tint: 0xb9bcc4, depth: DEPTH.smokePuff });
        } else bs.frames.play('muzzle', w.x, w.y - 14, 1, bs.nowT);
      }
      break;
    }
    case 'hit': {
      // 普通命中只给局部反馈：闪白、压扁回弹、几粒火花或木屑；不震屏、不顿帧（大事件见 feel.ts 的 BIG_EVENT）
      {
        const hb = e.target === 'building' ? bs.st.buildings.find((q) => q.id === e.id) : undefined;
        sfx(hitSound(e.target, hb?.kind ?? bs.ubyId.get(e.id)?.kind, hb?.level));
        // 兵挨打偶尔哼一声：同名最小间隔压住，不是每下都叫
        if (e.target === 'unit') sfx('cry');
      }
      const w = bs.W(e.x, e.y);
      const heavy = e.dmg >= HEAVY_HIT;
      // 序列帧的命中火花只给重击（分量够才配得上），普通命中走粒子池里的小火花
      if (heavy) bs.frames.play('hit', w.x, w.y - 10, 1, bs.nowT);
      else bs.pt.sparks(w.x, w.y - 10, 2);
      if (isWater(bs.st.ext, e.x, e.y)) bs.pt.splash(w.x, w.y, 0.8);
      if (e.target === 'building') {
        const b = bs.bsp.get(e.id);
        const bb = bs.st.buildings.find((q) => q.id === e.id);
        if (b && !b.down) {
          flash(bs, b.img);
          shake(bs, b.img, b.baseX);
          // 压扁回弹按当前受损阶段的缩放回去（半塌的建筑本来就矮一截）
          bs.squash.hit(b.img, bs.nowT, () => [1 / bs.r, STAGE_LOOK[b.stage].sy / bs.r]);
          if (bb) {
            // 数字从血条上面起飘（原来按占地估高度，落在血条上被条压住看不清）
            const z = bs.followT ? bs.followT.z : bs.cc.z;
            bs.dn.add(`b${e.id}`, e.dmg, b.img.x, artTop(b.img) - (BAR_SIZE.building[1] + 14) / z, false, heavy);
            debris(bs, b.img.x, b.img.y, bb.kind, bb.level, heavy ? 3 : 1);
          }
        }
        if (bb && isKeyHit(bb.kind, e.dmg, HEAVY_HIT)) bigEvent(bs, bs.hs, 'keyHit');
      } else if (e.target === 'hero') {
        if (bs.heroImg) {
          bs.heroImg.hit(bs.nowT);
          bs.dn.add('hero', e.dmg, bs.heroImg.x, bs.heroImg.y - 40, false, heavy);
        }
      } else {
        const u = bs.usp.get(e.id);
        if (u && !u.fading) {
          // 闪白 + 后仰回正（rig.ts 的 HIT，叠在当前动作上）
          trackOf(bs).classify(e.id, e.x, e.y, bs.st.tick);
          const rh = isHeavyDmg(e.dmg, u.maxHp);
          u.rig.hit(bs.nowT, rh);
          if (rh) bs.pt.sparks(w.x, w.y - 16, 5);
          u.lastDmg = e.dmg;
          bs.dn.add(`u${e.id}`, e.dmg, u.rig.x, u.rig.y - 28, true, heavy);
        }
      }
      break;
    }
    case 'aim': {
      // 狙击塔锁定了一个目标：从现在到 fireAt 画红色瞄准线和目标脚下的准星（snipefx.ts），炮管同时慢慢摆过去
      bs.snipe.start(e.id, e.tid, e.target === 'hero', e.fireAt);
      break;
    }
    case 'guard': {
      // 盾兵用盾挡下一发直射：盾晃一下、盾上火星、一声“当”；溅射打到不会推这个事件
      const sp = bs.usp.get(e.id);
      if (sp && !sp.fading) {
        sp.rig.guard(bs.nowT);
        bs.pt.guardSparks(sp.rig.shX, sp.rig.shY, sp.rig.c.depth);
      }
      sfx('guard');
      break;
    }
    case 'stun': {
      // 震荡炮震住一个兵：一声嗡、头顶一圈光；晃动和转星在每帧的兵循环里按 stunUntil 画
      sfx('stun');
      const w = e.target === 'hero' ? (bs.heroImg ? { x: bs.heroImg.x, y: bs.heroImg.y - 40 } : null) : bs.usp.get(e.id) ? { x: bs.usp.get(e.id)!.rig.x, y: bs.usp.get(e.id)!.rig.topY + 6 } : null;
      if (w) {
        bs.pt.ringBurst(w.x, w.y, 0.5);
        bs.pt.bloom.flash(w.x, w.y, 14, 0xbff0ff, 160, 0.5);
      }
      break;
    }
    case 'explode': {
      const w = bs.W(e.x, e.y);
      const cells = e.r > 10 ? e.r / UNIT : e.r;
      trackOf(bs).noteExplode(e.x, e.y, e.r > 10 ? e.r : e.r * UNIT, bs.st.tick);
      // 焦油陷阱被踩：不是爆炸，是一摊黑油溅开（地上留痕迹几秒）
      if (isTarTrap(bs, e.x, e.y)) {
        sfx('splash');
        bs.pt.tarSplat(w.x, w.y, cells);
        tarGroundOf(bs).splat(w.x, w.y, cells, bs.nowT);
        break;
      }
      sfx('boom');
      boom(bs, w.x, w.y, Math.max(0.5, cells * 0.9));
      if (isWater(bs.st.ext, e.x, e.y)) bs.pt.splash(w.x, w.y, Math.max(1, cells * 0.7));
      if (isBigBlast(cells)) bigEvent(bs, bs.hs, 'bigBlast');
      break;
    }
    case 'destroy': {
      const b = bs.st.buildings.find((q) => q.id === e.id);
      // 焦油陷阱踩完就没了：不炸不塌，图藏起来（溅开的黑油在 explode 里放了），不留瓦砾
      if (b?.kind === 'tar') {
        const tp = bs.bsp.get(e.id);
        if (tp) {
          tp.down = true;
          tp.img.setVisible(false);
        }
        break;
      }
      sfx('boom');
      sfx(crumbleSound(b ? isBigBuilding(b.kind, b.size) : false));
      const sp = bs.bsp.get(e.id);
      if (sp && b) {
        sp.down = true;
        bs.occ.remove(e.id);
        const tu = bs.tur.get(e.id);
        if (tu) {
          tu.down();
          bs.tur.delete(e.id);
        }
        const im = sp.img;
        bs.squash.forget(im);
        bs.env.undress(im);
        bs.tweens.killTweensOf(im);
        im.clearTint();
        im.x = sp.baseX;
        const x = im.x;
        const y = im.y;
        boom(bs, x, y, b.size * 0.8);
        const down = buildingDownEvent(b.kind);
        if (down) {
          bigEvent(bs, bs.hs, down);
          vibrate('collapse');
        }
        bs.ruined.push(e.id);
        collapse(bs, x, y, b.size);
        bs.pt.dust(x, y, b.size);
        debris(bs, x, y, b.kind, b.level, 8 + b.size * 2);
        // 不是瞬间消失：先塌下去（压扁、下沉、发暗，220 毫秒），再换成瓦砾并弹一下
        const sx = 1 / bs.r;
        const sy = 1 / bs.r;
        const lean = (e.id % 2 ? 1 : -1) * 0.05;
        const cs = collapseScale(1);
        im.setRotation(0);
        bs.tweens.add({
          targets: im, scaleY: sy * cs.sy, scaleX: sx * cs.sx, y: y + cs.dy, rotation: lean, duration: 240, ease: EASE.fall,
          onUpdate: () => im.setTint(0x9a8f86),
          onComplete: () => {
            const rp = fxA('rubble');
            im.clearTint();
            im.setRotation(0).setTexture(rp.key).setOrigin(rp.ax / rp.w, rp.ay / rp.h).setAlpha(1).setPosition(x, y).setScale(0.7 / bs.r);
            bs.pt.dust(x, y, b.size * 0.6);
            bs.tweens.add({ targets: im, scale: 1 / bs.r, duration: 280, ease: EASE.land });
          },
        });
      }
      break;
    }
    case 'die': {
      sfx('die');
      const u = bs.usp.get(e.id);
      if (u) tallyDeath(bs, u.cx, u.cy);
      if (u && !u.fading) fade(bs, u, e.id);
      break;
    }
    case 'skill': {
      sfx(e.skill === 'medkit' ? 'heal' : e.skill === 'flare' ? 'flare' : 'barrage');
      bs.skillUsed = true;
      bs.casts++;
      vibrate('skill');
      const w = bs.W(e.x, e.y);
      const def = SKILLS[e.skill];
      const lv = bs.d.setup.army.skills.find((k) => k.kind === e.skill)?.level ?? 1;
      const rad0 = def.levels[lv - 1]?.radius ?? 2;
      const R = rad0 > 30 ? rad0 / UNIT : rad0;
      const col = e.skill === 'medkit' ? 0x3fae52 : e.skill === 'flare' ? 0xffd23f : 0xff6a1f;
      const g = bs.add.graphics().setDepth(DEPTH.marker);
      g.lineStyle(4, col, 1).fillStyle(col, 0.18).fillEllipse(w.x, w.y, R * 90, R * 45).strokeEllipse(w.x, w.y, R * 90, R * 45);
      // 落点圈：从大一圈收到落点大小（ease-out，300 毫秒）当预警，再停一会儿淡掉；炮击收得更狠、更红
      const k0 = e.skill === 'barrage' ? 1.5 : 1.25;
      g.setScale(k0).setAlpha(0.3);
      g.setPosition(w.x * (1 - k0), w.y * (1 - k0));
      bs.tweens.add({ targets: g, scaleX: 1, scaleY: 1, alpha: 1, duration: 300, ease: 'Cubic.easeOut', onUpdate: () => g.setPosition(w.x * (1 - g.scaleX), w.y * (1 - g.scaleY)) });
      bs.tweens.add({ targets: g, alpha: 0, duration: 700, delay: 600, ease: 'Quad.easeIn', onComplete: () => g.destroy() });
      if (e.skill === 'flare') {
        // 信号弹：一道亮光从下面蹿上来，在落点炸开（ease-out 280 毫秒）
        const sp = fxA('spark');
        const st = put(bs, bs.r, sp, w.x, w.y + 90).setDepth(DEPTH.markerTop).setScale(1.4 / bs.r);
        bs.tweens.add({ targets: st, y: w.y - 40, alpha: { from: 1, to: 0.2 }, duration: 280, ease: 'Quad.easeOut', onComplete: () => st.destroy() });
        bs.pt.ringBurst(w.x, w.y - 30, 1.2);
      }
      if (e.skill !== 'barrage') {
        const p = fxA(e.skill === 'flare' ? 'flare' : 'heal');
        const im = put(bs, bs.r, p, w.x, w.y).setDepth(DEPTH.markerMid);
        bs.tweens.add({ targets: im, y: w.y - 30, alpha: 0, duration: e.skill === 'flare' ? 2400 : 900, onComplete: () => im.destroy() });
      }
      break;
    }
    case 'hero': {
      const w = bs.W(e.x, e.y);
      if (e.what === 'keg') {
        sfx('keg');
      } else if (e.what === 'rally') {
        sfx('rally');
        const g = bs.add.graphics().setDepth(DEPTH.marker);
        g.lineStyle(4, 0xffe885, 1).fillStyle(0xffe885, 0.15).fillEllipse(w.x, w.y, 90, 45).strokeEllipse(w.x, w.y, 90, 45);
        bs.tweens.add({ targets: g, scaleX: 4, scaleY: 4, alpha: 0, duration: 800, onUpdate: () => g.setPosition(w.x * (1 - g.scaleX), w.y * (1 - g.scaleY)), onComplete: () => g.destroy() });
      } else {
        sfx('die');
        boom(bs, w.x, w.y, 0.8);
      }
      break;
    }
    case 'end':
      break;
    case 'chest':
    case 'ally':
    case 'recall':
      funEvent(bs, e);
      break;
    case 'heal': {
      const u = bs.usp.get(e.id);
      if (u && !u.fading) {
        const p = fxA('heal');
        const g = put(bs, bs.r, p, u.rig.x, u.rig.y - 10).setDepth(DEPTH.impactFx).setAlpha(0.9);
        bs.tweens.add({ targets: g, y: g.y - 22, alpha: 0, scale: g.scale * 1.5, duration: 650, onComplete: () => g.destroy() });
        u.rig.heal(bs.nowT);
      }
      break;
    }
  }
}

export function boom(bs: BattleScene, x: number, y: number, size: number): void {
  bs.frames.play('boom', x, y - 6, Math.max(0.8, size), bs.nowT, DEPTH.hitFx);
}

/** 画面上的位置是否在海里（超出沙滩），只用来决定要不要溅水花；ext 是这一局的岛扩了几圈 */
export function isWater(ext: number, x: number, y: number): boolean {
  return ringOf(ext, Math.floor(x / UNIT), Math.floor(y / UNIT)) > BEACH;
}

/** 木屑 / 石屑：木头的（低级和伐木类）飞木屑，石头的飞石屑 */

export function debris(bs: BattleScene, x: number, y: number, kind: string, level: number, n: number): void {
  if (kind === 'palm' || kind === 'rock') return;
  const wood = level <= 2 || kind === 'sawmill' || kind === 'woodyard' || kind === 'barrel';
  if (wood) bs.pt.splinters(x, y, n);
  else bs.pt.chips(x, y, n);
}
