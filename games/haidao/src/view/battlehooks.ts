/** 测试钩子：把 __haidao（app.api）上登陆战用的探针、取点、跳转挂出来；冒烟和录像脚本靠它们找按钮和单位，改名要同步 tools/ */
import { BUILDINGS } from '../content/index.ts';
import { UNIT, type BUnit } from '../core/types.ts';
import { slowUntil } from '../core/battle.ts';
import { app, pagePoint } from './app.ts';
import { countObjects } from './rigsprite.ts';
import { turretStats } from './turret.ts';
import { iso } from './iso.ts';
import { artBox } from './textures.ts';
import { BEACH_PTS } from './battleadvice.ts';
import type { BattleScene } from './BattleScene.ts';

export function installHooks(bs: BattleScene): void {
  app.api.battleInfo = () => ({ tick: bs.st.tick, energy: bs.st.energy, over: bs.st.over, landed: bs.st.landed.map(Boolean), units: bs.st.units.length, ruined: bs.ruined.length, objects: countObjects(bs) });
  app.api.where = (kind) => {
    const b = bs.st.buildings.find((x) => x.kind === kind);
    const sp = b && bs.bsp.get(b.id);
    if (!sp) return null;
    const im = sp.img;
    const bx = artBox(im.texture.key) ?? { l: 0, t: 0, r: im.width, b: im.height };
    const ox = im.x - im.originX * im.displayWidth;
    const oy = im.y - im.originY * im.displayHeight;
    return pagePoint(bs.cc.toScreen(ox + ((bx.l + bx.r) / 2) * im.scaleX, oy + ((bx.t + bx.b) / 2) * im.scaleY));
  };
  app.api.home = () => bs.fit.back();
  app.api.snipeLive = () => bs.snipe.live;
  app.api.devShieldDir = (gx, gy) => {
    bs.devDir = gx === undefined || gy === undefined ? null : { gx, gy };
  };
  app.api.snipeAt = () => bs.snipe.mid;
  app.api.probe = (what, idOrKind) => {
    let u: BUnit | undefined;
    if (what === 'building') {
      const b = bs.st.buildings.find((x) => x.kind === idOrKind && !x.destroyed);
      const sp = b && bs.bsp.get(b.id);
      if (!b || !sp) return null;
      return { id: b.id, ...pagePoint(bs.cc.toScreen(sp.img.x, sp.img.y - 20)) };
    }
    if (typeof idOrKind === 'number') u = bs.ubyId.get(idOrKind);
    else u = [...bs.ubyId.values()].find((q) => q.mode === 'attack') ?? [...bs.ubyId.values()].find((q) => q.mode === 'move');
    const sp = u && bs.usp.get(u.id);
    return u && sp ? { id: u.id, ...pagePoint(bs.cc.toScreen(sp.rig.x, sp.rig.y - 24)) } : null;
  };
  // front：站在目标建筑靠屏幕下方那一角附近（x + y 比占地中心大出半个边长以上），录像挑这种，不被房子挡住
  app.api.units = () =>
    bs.st.units.map((u) => {
      const b = bs.st.buildings.find((x) => x.id === u.target);
      const front = !!b && u.x + u.y >= (b.x + b.y + b.size * 1.5) * 100;
      return { id: u.id, kind: u.kind, mode: u.mode, hp: u.hp, maxHp: u.maxHp, front, gx: u.gx, gy: u.gy, slow: bs.st.tick < slowUntil(bs.st, u.id) };
    });
  app.api.towers = () =>
    bs.st.buildings
      .filter((b) => !b.destroyed && ['cannon', 'gunTower', 'mortar', 'flame', 'harpoon', 'rocket', 'shock', 'sniper'].includes(b.kind))
      .map((b) => {
        const sp = bs.bsp.get(b.id);
        const R = (BUILDINGS[b.kind].levels[b.level - 1]?.range ?? 0) * UNIT * 1.5;
        const cx = (b.x + b.size / 2) * UNIT;
        const cy = (b.y + b.size / 2) * UNIT;
        const u = bs.st.units.find((q) => q.mode !== 'dead' && Math.hypot(q.x - cx, q.y - cy) <= R);
        const w = u ? bs.W(u.x, u.y) : { x: 0, y: 0 };
        return { id: b.id, kind: b.kind, level: b.level, slot: -1, aim: b.aim >= 0, near: !!u, x: sp?.baseX ?? 0, y: sp?.baseY ?? 0, tx: w.x, ty: w.y };
      });
  app.api.lookAt = (x, y, z) => {
    bs.followT = { id: -1, z, x, y };
  };
  app.api.turretStats = () => ({ ...turretStats });
  app.api.occluded = () => bs.occ?.frames ?? 0;
  app.api.follow = (id, z = 3) => {
    bs.followT = id === null ? null : { id, z, x: 0, y: 0 };
  };
  app.api.poke = (kind, frac) => {
    for (const b of bs.st.buildings) if (b.kind === kind && !b.destroyed) b.hp = Math.max(1, Math.round(b.maxHp * frac));
  };
  // 第 0 个在左边沙滩、第 1 个在下边沙滩（避开顶部的引导横幅），其余轮流
  app.api.beach = (i) => {
    const [gx, gy] = BEACH_PTS[((i % 4) + 4) % 4]!;
    const w = iso(gx, gy);
    // 竖屏下左右的沙滩可能在屏外：先平移过去（和玩家单指拖到那一侧一样），再给坐标
    const sc = bs.cc.toScreen(w.x, w.y);
    const cw = bs.scale.width / bs.r;
    if (sc.x < 24 || sc.x > cw - 24) {
      bs.cc.setView(w.x, bs.cc.cy, bs.cc.z);
      return pagePoint(bs.cc.toScreen(w.x, w.y));
    }
    return pagePoint(sc);
  };
}
