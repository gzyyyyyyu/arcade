import { DmgClusters } from './tddmg.ts';
import type { TdScene } from './TdScene.ts';
import { type TdEvent, TD2_ENEMIES, TD2_HERO_SKILL, TD2_HERO } from '../core/index.ts';
import { TD2_BATTERY } from '../content/td2units.ts';
import { isoRing } from './tdfx.ts';
import { stunned } from '../core/combat.ts';
import { UNIT, TICKS_PER_SEC } from '../core/types.ts';
import { fxA } from './art.ts';
import { EASE } from './motion.ts';
import { deathStyleFor } from './rig.ts';
import { trackOf, isHeavyDmg } from './dmgkind.ts';
import { bigEvent } from './fx.ts';
import { vibrate, isBigBlast, HEAVY_HIT } from './feel.ts';
import { shotTracks } from './tdfx.ts';
import { put } from './ground.ts';
import { footCenter, iso } from './iso.ts';
import { callBonusText, laneName } from './td-ui.ts';
import type { LandKind, ShotFx } from './shots.ts';
import { arcHeight } from './aim.ts';
import { sfx } from './audio/sfx.ts';
import { towerFire, projectileFire, hitSound } from './audio/pick.ts';
import { DEPTH } from './depth.ts';
import { banner, ftx, stolenNote } from './tdhud.ts';
import { closeSheet, renderSheet } from './tdsheet.ts';
import { W, PROJ, SHOCK_RING } from './tdcommon.ts';
import { matAt } from './tdsync.ts';
import { boom } from './tdoverlay.ts';
import { addCrate, refreshWalls, removeCrate } from './tdworld.ts';
import { throwKeg } from './tdinput.ts';
import { STEP_MS } from './motion.ts';

/** 每个场景一份扎堆合并记录（不往 TdScene 里加字段） */
const CLUSTERS = new WeakMap<object, DmgClusters>();
function dmgKeyOf(bs: object): DmgClusters {
  let c = CLUSTERS.get(bs);
  if (!c) CLUSTERS.set(bs, (c = new DmgClusters()));
  return c;
}

export function onEvent(bs: TdScene, e: TdEvent): void {
  const s = bs.s;
  recordReason(bs, e);
  bs.esc?.onEvent(e);
  switch (e.type) {
    case 'wave': {
      const w = s.level.waves[e.wave];
      sfx('land');
      sfx('shout');
      const early = e.early ? callBonusText(e.bonus, e.cdCut ?? 0) : '';
      banner(bs, w?.boss ? '首领来袭！' : `第 ${e.wave + 1} 波`, early ? `提前开打 ${early}` : (w?.note ?? ''), w?.boss === true);
      if (w?.boss) bigEvent(bs, bs.hs, 'bossEnter');
      if (e.early && e.bonus > 0) bs.hud.gold.parentElement?.classList.add('bump');
      break;
    }
    case 'sell': {
      sfx('coin');
      const sl = s.slots[e.slot];
      if (sl) {
        const f = footCenter(sl.x, sl.y, 2);
        const w = iso(f.gx, f.gy);
        ftx(bs, w.x, w.y - 30, `+${e.refund}`, '#ffe885', 18);
      }
      closeSheet(bs);
      break;
    }
    case 'cleared': {
      const sl = s.slots[e.slot];
      const im = bs.blocks.get(e.id);
      if (im) {
        bs.pt.splinters(im.x, im.y - 6, 10);
        bs.tweens.add({ targets: im, alpha: 0, scaleY: 0.2 / bs.r, duration: 260, ease: EASE.fall, onComplete: () => im.destroy() });
        bs.blocks.delete(e.id);
        if (e.gold > 0) ftx(bs, im.x, im.y - 20, `+${e.gold}`, '#ffe885', 15);
      }
      sfx(e.paid ? 'coin' : 'crumble');
      if (sl && bs.openSlot === e.slot) renderSheet(bs);
      break;
    }
    case 'barricade': {
      sfx('build');
      vibrate('skill');
      const w = iso(e.x + 0.5, e.y + 0.5);
      bs.pt.ringBurst(w.x, w.y, 1.4);
      bs.pt.splinters(w.x, w.y - 8, 6);
      break;
    }
    case 'barricadeBreak': {
      sfx('crumble');
      break;
    }
    case 'roll': {
      // 地上的宝藏没人捡，自己滚回箱子：几枚金币沿地面滚过去
      const from = W(e.x, e.y);
      const c = chestNear(bs, e.x, e.y);
      for (let i = 0; i < Math.min(4, e.n + 1); i++) {
        const im = put(bs, bs.r, fxA('coins'), from.x, from.y).setDepth(DEPTH.jam).setScale(0.7 / bs.r);
        bs.tweens.add({ targets: im, x: c.x, y: c.y - 8, angle: 720, duration: 650 + i * 90, delay: i * 70, ease: EASE.recover, onComplete: () => im.destroy() });
      }
      ftx(bs, c.x, c.y - 30, `+${e.n}`, '#7dff9a', 18);
      break;
    }
    case 'rearm':
      break;
    case 'shoot': {
      if (e.id < 0) {
        // 英雄开枪：攻击动作（走动中也播）、枪口火光、追踪弹（落点每帧跟着目标精灵）
        bs.heroShotAt = bs.time.now;
        if (e.target !== undefined && e.target >= 0) bs.flash.add(e.target, bs.time.now);
        const to = W(e.x1, e.y1);
        const from = W(e.x0, e.y0);
        const dir = to.x < from.x ? -1 : 1;
        const mx = bs.hero.x + dir * 14;
        const my = bs.hero.y - 28;
        bs.pt.muzzle(mx, my);
        bs.shots.start({
          fx: 'bullet', sx: mx, sy: my, gx: bs.hero.x, gy: bs.hero.y, tx: to.x, ty: to.y, e1: 10, t0: s.tick - 1, t1: e.t1,
          arc: 0, aimed: true, land: 'bullet', mat: matAt(bs, e.x1, e.y1), tid: e.target ?? -1,
        });
        break;
      }
      const t = s.towers.find((q) => q.id === e.id);
      const pj = t ? PROJ[t.kind] : undefined;
      if (!t || !pj) break;
      sfx(towerFire(t.kind));
      trackOf(bs).noteShoot(pj[0], e.x1, e.y1, e.t1);
      const sp = bs.tsp.get(t.id);
      const ma = W(e.x0, e.y0);
      const mb = W(e.x1, e.y1);
      const dl = Math.hypot(mb.x - ma.x, mb.y - ma.y) || 1;
      let m = { x: ma.x + ((mb.x - ma.x) / dl) * 14, y: ma.y - 16 + ((mb.y - ma.y) / dl) * 7, gx: ma.x, gy: ma.y, z: 16 };
      if (sp?.tu) {
        // 炮台：转到位（还差就这一帧补完）、预备-后坐-回位、火光和烟（turret.ts）；炮口位置交给弹道当起点
        m = sp.tu.fire(bs.time.now, Math.max(1, t.cd - s.tick + 1) * STEP_MS, mb.x, mb.y, m);
      } else {
        if (sp) {
          // 后坐：朝反方向顶 3 像素再 ease-out 回位，同时微微鼓一下
          bs.tweens.killTweensOf(sp.img);
          sp.img.setScale(1.06 / bs.r).setPosition(sp.baseX - ((mb.x - ma.x) / dl) * 3, sp.baseY - ((mb.y - ma.y) / dl) * 1.5);
          bs.tweens.add({ targets: sp.img, scale: 1 / bs.r, x: sp.baseX, y: sp.baseY, duration: 200, ease: EASE.recoil });
        }
        // 炮口火光：对象池里的一团亮黄放大淡出（150ms）加两粒火星，塔普通开火不震屏
        bs.pt.muzzle(m.x, m.y);
        bs.pt.emit('puff', m.x + ((mb.x - ma.x) / dl) * 2, m.y - 2, { vx: 6, vy: -22, life: 620, s0: 0.35, s1: 0.95, a0: 0.55, tint: 0xb9bcc4, depth: DEPTH.smokePuff });
      }
      const tu = sp?.tu ?? null;
      if (e.target !== undefined && e.target >= 0) bs.flash.add(e.target, bs.time.now);
      const tst = (s.internal as { stats?: Map<number, { splash: number; line: boolean }> }).stats?.get(t.id);
      const tid = e.target !== undefined && tst && shotTracks(tst.splash, tst.line) ? e.target : -1;
      const land: LandKind = t.kind === 'cannon' ? 'ball' : t.kind === 'mortar' ? 'shell' : t.kind === 'gunTower' ? 'bullet' : t.kind === 'harpoon' ? 'harpoon' : t.kind === 'rocket' ? 'rocket' : t.kind === 'shock' ? 'shock' : t.kind === 'sniper' ? 'snipe' : 'none';
      if (t.kind === 'sniper') bs.snipe.stop(t.id);
      bs.shots.start({
        fx: pj[0] as ShotFx, sx: m.x, sy: m.y, gx: m.gx, gy: m.gy, tx: mb.x, ty: mb.y, e1: 10, t0: s.tick - 1, t1: e.t1,
        arc: arcHeight(t.kind === 'mortar' ? 'mortar' : pj[0], Math.hypot(mb.x - m.gx, mb.y - m.gy)), aimed: pj[2], land, mat: matAt(bs, e.x1, e.y1),
        rope: t.kind === 'harpoon' && tu?.split ? tu : null, hidden: t.kind === 'flame' && !!tu?.split, tid,
        ring: t.kind === 'shock' ? (SHOCK_RING * ((tst as { splash?: number } | undefined)?.splash || UNIT)) / UNIT : 0,
      });
      break;
    }
    case 'aim': {
      // 狙击塔锁定了一个敌人：从现在到 fireAt 画红色瞄准线和脚下的准星（snipefx.ts），炮管同时慢慢摆过去
      bs.snipe.start(e.id, e.target, false, e.fireAt);
      break;
    }
    case 'guard': {
      // 盾兵用盾挡下一发直射：盾晃一下、盾上火星、一声“当”；溅射打到不会推这个事件
      const sp = bs.esp.get(e.id);
      if (sp) {
        sp.rig.guard(bs.time.now);
        bs.pt.guardSparks(sp.rig.shX, sp.rig.shY, sp.rig.c.depth);
      }
      sfx('guard');
      break;
    }
    case 'stun': {
      // 被震住：一声嗡、头顶一圈光；晃动和转星在每帧的敌人循环里按 stunUntil 画
      sfx('stun');
      const sp = bs.esp.get(e.id);
      if (sp) {
        bs.pt.ringBurst(sp.rig.x, sp.rig.topY + 6, 0.5);
        bs.pt.bloom.flash(sp.rig.x, sp.rig.topY + 6, 14, 0xbff0ff, 160, 0.5);
      }
      break;
    }
    case 'lob': {
      // 掷弹兵的手雷：从手里抛出去（高抛物线、落地前地上有影子和范围圈、落地爆点）
      sfx(projectileFire('grenade'));
      const a = W(e.x0, e.y0);
      const b = W(e.x1, e.y1);
      bs.shots.start({
        fx: 'grenade', sx: a.x, sy: a.y - 26, gx: a.x, gy: a.y, tx: b.x, ty: b.y, e1: 0, t0: s.tick - 1, t1: e.t1,
        arc: arcHeight('grenade', Math.hypot(b.x - a.x, b.y - a.y)), aimed: false, land: 'grenade', mat: matAt(bs, e.x1, e.y1),
        ring: (SHOCK_RING * e.r) / UNIT,
      });
      break;
    }
    case 'hit': {
      const en = s.enemies.find((q) => q.id === e.id);
      sfx(hitSound('unit', en?.kind));
      const sp = bs.esp.get(e.id);
      if (!sp) break;
      // 普通命中只给局部反馈：闪白、后仰回正、小火花；不震屏、不顿帧。伤害占血量一大块算重击：后仰更大、踉跄退一步、火花更多
      if (en) trackOf(bs).classify(e.id, en.x, en.y, s.tick);
      const rh = isHeavyDmg(e.dmg, en?.maxHp ?? TD2_ENEMIES[sp.kind].hp);
      sp.rig.hit(bs.time.now, rh);
      if (rh) bs.pt.sparks(sp.rig.x, sp.rig.y - 24, 5);
      sp.lastDmg = e.dmg;
      const heavy = e.dmg >= HEAVY_HIT;
      bs.dn.add(dmgKeyOf(bs).keyFor(e.id, sp.rig.x, sp.rig.y, bs.time.now), e.dmg, sp.rig.x, sp.rig.y - 40, true, heavy);
      bs.pt.sparks(sp.rig.x, sp.rig.y - 20, heavy ? 3 : 2);
      break;
    }
    case 'die': {
      sfx('die');
      const sp = bs.esp.get(e.id);
      if (sp) {
        bs.esp.delete(e.id);
        sp.carry?.destroy();
        // 倒下：被打飞或跪倒（按最后一下的伤害），帽子飞出去，淡出后放回对象池
        const dead = s.enemies.find((q) => q.id === e.id);
        const style = deathStyleFor(trackOf(bs).take(e.id), sp.lastDmg, TD2_ENEMIES[e.kind].hp, e.kind === 'sapper', !!dead && stunned(dead, s.tick));
        bs.dying.addRig(sp.rig, sp.face, style, (r) => bs.pool.put(r), bs.pt);
        ftx(bs, sp.rig.x, sp.rig.y - 34, `+${TD2_ENEMIES[e.kind].gold}`, '#ffe885', 14);
        if (e.kind === 'captain' || e.kind === 'king') bigEvent(bs, bs.hs, 'bossDown');
        // 大副倒下：原地一圈尘土，散出来的水手从这里冲出去（spawn 事件照常建人）；字飘得比伤害数字高，不被盖住
        if (e.kind === 'mate') {
          bs.pt.ringBurst(sp.rig.x, sp.rig.y, 1.2);
          ftx(bs, sp.rig.x, sp.rig.y - 80, '散开了！', '#ffd0c8', 16);
        }
      }
      break;
    }
    case 'jam': {
      const t = s.towers.find((q) => q.id === e.id);
      if (!t) break;
      const f = footCenter(t.x, t.y, 2);
      const w = iso(f.gx, f.gy);
      bs.pt.sparks(w.x, w.y - 20, 3);
      ftx(bs, w.x, w.y - 60, '哑火！', '#ffd0c8', 15);
      break;
    }
    case 'skill': {
      const w = W(e.x, e.y);
      sfx('boom');
      boom(bs, w.x, w.y, 2.2);
      bigEvent(bs, bs.hs, 'bossSkill');
      banner(bs, '船长发怒了！', '召来一批海盗，附近的塔被炸哑', true);
      break;
    }
    case 'explode': {
      sfx('boom');
      trackOf(bs).noteExplode(e.x, e.y, e.r, s.tick);
      const w = W(e.x, e.y);
      const cells = e.r / UNIT;
      boom(bs, w.x, w.y, Math.max(0.6, cells * 0.9));
      // 只有英雄的火药桶（刚扔出去、半径和桶一样）和老炮（半径独一份）算大事件；塔的炮弹、地雷的爆炸是日常，不震屏
      if (isBigBlast(cells) && ((e.r === TD2_HERO_SKILL.bomb.r && bs.s.tick - bs.kegAt <= 12) || e.r === TD2_BATTERY.r)) bigEvent(bs, bs.hs, 'bigBlast');
      break;
    }
    case 'crate': {
      // 补给箱：漂来时箱子落到浪边、飘一句「补给箱」；英雄捡到时飘金币数和「技能好了」；没人捡就滑回海里
      const w = W(e.x, e.y);
      if (e.what === 'drift') {
        sfx('land');
        addCrate(bs, e.id, e.x, e.y);
        ftx(bs, w.x, w.y - 50, '补给箱漂来了', '#ffe885', 16);
      } else if (e.what === 'pick') {
        sfx('coin');
        removeCrate(bs, e.id, true);
        ftx(bs, w.x, w.y - 40, `+${e.gold}`, '#ffe885', 22);
        ftx(bs, w.x, w.y - 64, '技能好了', '#7dff9a', 16);
        bs.hud.gold.parentElement?.classList.add('bump');
      } else removeCrate(bs, e.id, false);
      break;
    }
    case 'battery': {
      // 老炮：炮口一团火光和烟、震一下，炮弹沿高弧线飞到落点，落点先画一圈红色预警（爆炸本身是 1 秒后的 explode 事件）
      sfx('cannon');
      vibrate('skill');
      const from = W(e.x0, e.y0);
      const muzzle = { x: from.x - 40, y: from.y - 44 };
      const to = W(e.x1, e.y1);
      const dur = Math.max(160, ((e.t1 - s.tick) * STEP_MS) / bs.speed);
      bs.pt.ringBurst(muzzle.x, muzzle.y, 1);
      const R = isoRing(TD2_BATTERY.r / UNIT);
      const warn = bs.add.ellipse(to.x, to.y, R.w, R.h, 0xff4a3a, 0.14).setStrokeStyle(4, 0xff4a3a, 0.95).setDepth(DEPTH.marker);
      bs.tweens.add({ targets: warn, alpha: 0.4, duration: dur / 3, yoyo: true, repeat: 1, onComplete: () => warn.destroy() });
      shipShot(bs, muzzle, from, to, s.tick, e.t1, Math.min(220, 80 + Math.hypot(to.x - muzzle.x, to.y - muzzle.y) * 0.35), 0, 'none');
      break;
    }
    case 'shell': {
      // 炮艇开炮：船头一团火光，炮弹沿低弧线飞到那座塔（塔哑火的画面是同一拍的 jam 事件）
      sfx('cannon');
      // 起点按船的显示位置（停泊的船画在海上，见 crowd.ts 的 moorOffsets）
      const boat = bs.esp.get(e.id);
      const from = boat ? { x: boat.rig.x, y: boat.rig.y } : W(e.x0, e.y0);
      const muzzle = { x: from.x + 30, y: from.y - 34 };
      const to = W(e.x1, e.y1);
      bs.pt.ringBurst(muzzle.x, muzzle.y, 0.7);
      // 规则里同一拍就炸哑了塔（jam 事件），炮弹只是表演：按 SHELL_FLY 拍飞过去，砸在塔身上
      shipShot(bs, muzzle, from, to, s.tick, s.tick + SHELL_FLY, Math.min(140, 50 + Math.hypot(to.x - muzzle.x, to.y - muzzle.y) * 0.25), 20, 'shell');
      break;
    }
    case 'fleet': {
      // 友军船：来的时候船边飘一句，开炮时舷侧一团火光、炮弹沿低弧线飞到落点（爆炸是落地那一拍的 explode 事件）
      const at = W(e.x, e.y);
      if (e.what === 'come') {
        sfx('confirm');
        ftx(bs, at.x, at.y - 90, '友军船来了！', '#7dd8ff', 18);
      } else if (e.what === 'shot') {
        sfx('cannon');
        const muzzle = { x: at.x, y: at.y - 40 };
        const to = W(e.x1, e.y1);
        bs.pt.ringBurst(muzzle.x, muzzle.y, 0.7);
        shipShot(bs, muzzle, at, to, s.tick, e.t1, Math.min(120, 40 + Math.hypot(to.x - muzzle.x, to.y - muzzle.y) * 0.25), 0, 'none');
      } else ftx(bs, at.x, at.y - 90, '友军船回航', '#d8f1ff', 15);
      break;
    }
    case 'king': {
      // 海盗王放人上岸、叫护航：旗舰头上飘一句；护航算大事件（和首领发怒同一档）
      const sp = bs.esp.get(e.id);
      const at = sp ? { x: sp.rig.x, y: sp.rig.y } : W(e.x, e.y);
      if (e.what === 'drop') ftx(bs, at.x, at.y - 120, '放下一船人！', '#ffb4a8', 16);
      else {
        sfx('boom');
        bigEvent(bs, bs.hs, 'bossSkill');
        banner(bs, '海盗王叫来护航！', '两艘炮艇停在它旁边，远程塔先打哪个自己挑', true);
      }
      break;
    }
    case 'heal': {
      // 军医回血：脚下一圈绿光，飘一个绿色的「+」
      const sp = bs.esp.get(e.id);
      if (sp) ftx(bs, sp.rig.x, sp.rig.y - 52, '+', '#7dff9a', 20);
      break;
    }
    case 'sail': {
      // 炮艇停够了开走：飘一句「炮艇开走了」（精灵按局面里的 mode 收掉）
      const sp = bs.esp.get(e.id);
      if (sp) ftx(bs, sp.rig.x, sp.rig.y - 60, `${TD2_ENEMIES[sp.kind].name}开走了`, '#d8f1ff', 15);
      break;
    }
    case 'grab': {
      // 摸到宝藏箱抢走：红闪、箱子抖、飘"-N"
      sfx('error');
      const sp = bs.esp.get(e.id);
      const src = chestNear(bs, sp ? sp.px : 0, sp ? sp.py : 0);
      ftx(bs, src.x, src.y - 28, `-${e.n}`, '#ff5a4a', 26);
      bs.hud.flash.classList.remove('on');
      void bs.hud.flash.offsetWidth;
      bs.hud.flash.classList.add('on');
      bs.hud.tpill.classList.remove('hurt');
      void bs.hud.tpill.offsetWidth;
      bs.hud.tpill.classList.add('hurt');
      bigEvent(bs, bs.hs, 'chestGrab');
      vibrate('collapse');
      for (const c of bs.chests) {
        bs.tweens.add({ targets: c, x: c.x + 3, duration: 40, yoyo: true, repeat: 3 });
      }
      break;
    }
    case 'drop': {
      const w = W(e.x, e.y);
      ftx(bs, w.x, w.y - 24, `掉了 ${e.n}`, '#ffe885', 15);
      break;
    }
    case 'pickup': {
      // 捡回的宝藏飞回箱子
      sfx('coin');
      const c = chestNear(bs, bs.s.hero.x, bs.s.hero.y);
      for (let i = 0; i < Math.min(5, e.n + 2); i++) {
        const im = put(bs, bs.r, fxA('coins'), bs.hero.x, bs.hero.y - 24).setDepth(DEPTH.jam).setScale(0.8 / bs.r);
        bs.tweens.add({ targets: im, x: c.x, y: c.y - 14, duration: 420 + i * 70, delay: i * 50, ease: 'Sine.easeIn', onComplete: () => im.destroy() });
      }
      ftx(bs, c.x, c.y - 30, `+${e.n}`, '#7dff9a', 22);
      bs.hud.tpill.classList.remove('bump');
      void bs.hud.tpill.offsetWidth;
      bs.hud.tpill.classList.add('bump');
      break;
    }
    case 'escape': {
      const sp = bs.esp.get(e.id);
      // 被带走的不在战场上飘（多个口子同时发生会叠成一团、贴边被切），合并成一条挂在顶栏下面正中
      void sp;
      stolenNote(bs, e.n);
      bs.hud.flash.classList.remove('on');
      void bs.hud.flash.offsetWidth;
      bs.hud.flash.classList.add('on');
      bs.hud.tpill.classList.remove('hurt');
      void bs.hud.tpill.offsetWidth;
      bs.hud.tpill.classList.add('hurt');
      break;
    }
    case 'wall': {
      refreshWalls(bs);
      const wl = s.walls.find((q) => q.id === e.id);
      const sp = bs.walls.get(e.id);
      if (sp && wl && e.destroyed) {
        sfx('crumble');
        boom(bs, sp.img.x, sp.img.y, 1);
        bs.pt.chips(sp.img.x, sp.img.y, 6);
        vibrate('collapse');
      }
      break;
    }
    case 'block':
      break;
    case 'hero': {
      if (e.what === 'keg') {
        sfx('keg');
        bs.kegAt = bs.s.tick;
        vibrate('skill');
        if (bs.kegAim) throwKeg(bs, bs.kegAim);
        bs.kegAim = null;
      } else if (e.what === 'barricade' || e.what === 'rally') {
        // 拒马的画面在 Td2Event 'barricade' 里；号令在规则版本 7 里是被动的，不再有这个事件
      } else if (e.what === 'down') {
        sfx('die');
        banner(bs, '英雄倒下了', `${Math.round(TD2_HERO.respawnTicks / TICKS_PER_SEC)} 秒后在宝藏箱旁复活`, true);
      } else {
        sfx('heal');
        bs.pt.ringBurst(bs.hero.x, bs.hero.y, 1.5);
      }
      break;
    }
    case 'end':
      break;
    default:
      break;
  }
  if (e.type === 'hero' && e.what === 'keg') {
    // 火药桶被扔出去：画一个弧线飞过去的桶（落点由核心 10 拍后爆炸）
    const h = bs.s.hero;
    void h;
  }
}

/** 结算的「原因」要用的局内记录：敌人信息趁它还在时缓存，宝藏真丢了（escape）才记一笔，护航每口咬船记一笔，英雄倒下记次数 */
/** 炮艇的炮弹飞几拍（规则里没有飞行时间，同一拍就炸哑了塔；0.4 秒，和以前的表演一样长） */
const SHELL_FLY = 8;

/**
 * 船和岸防老炮的炮弹：走弹道对象池（shots.ts，不在开火时新建对象），按规则拍插值（暂停、加速都跟着），带地面阴影。
 * ground 是炮口正下方的地面点，e1 是命中时离地多高（砸在塔身上 ≈ 20），land 是落地效果（爆炸另有 explode 事件的就不画）
 */
function shipShot(bs: TdScene, muzzle: { x: number; y: number }, ground: { x: number; y: number }, to: { x: number; y: number }, t0: number, t1: number, arc: number, e1: number, land: LandKind): void {
  bs.shots.start({
    fx: 'ball', sx: muzzle.x, sy: muzzle.y, gx: ground.x, gy: ground.y, tx: to.x, ty: to.y, e1, t0, t1: Math.max(t0 + 1, t1),
    arc, aimed: false, land, mat: 'stone',
  });
}

function recordReason(bs: TdScene, e: TdEvent): void {
  const log = bs.reasonLog;
  if (e.type === 'bite') {
    const m = log.meta.get(e.id);
    if (m) log.bites.push({ ...m, id: e.id, dmg: e.dmg });
  } else if (e.type === 'spawn' || e.type === 'grab' || e.type === 'escape') {
    if (!log.meta.has(e.id)) {
      const en = bs.s.enemies.find((q) => q.id === e.id);
      if (en) log.meta.set(e.id, { kind: en.kind, wave: en.wave + 1, lane: laneName({ x: en.hx / UNIT, y: en.hy / UNIT }) });
    }
    if (e.type === 'escape') {
      const m = log.meta.get(e.id);
      if (m) log.losses.push({ ...m, n: e.n, tick: bs.s.tick });
    }
  } else if (e.type === 'hero' && e.what === 'down') log.heroDown++;
}

export function chestNear(bs: TdScene, ux: number, uy: number): { x: number; y: number } {
  let best = bs.s.treasures[0];
  let bd = 1e18;
  for (const t of bs.s.treasures) {
    const d = (t.x * UNIT + 50 - ux) ** 2 + (t.y * UNIT + 50 - uy) ** 2;
    if (d < bd) {
      bd = d;
      best = t;
    }
  }
  const w = best ? iso(best.x + 0.5, best.y + 0.5) : { x: 0, y: 0 };
  return w;
}
