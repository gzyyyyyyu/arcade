import { attachIntel } from './intelcard.ts';
import { troopCard } from './intel.ts';
import type { BaseScene } from './BaseScene.ts';
import { TROOPS } from '../content/index.ts';
import { hqLevel, boatSlots, setBoat, armyFor, armyCost, startCampaign, researchLevel, upgrade } from '../core/index.ts';
import type { TroopKind, BuildingKind } from '../core/types.ts';
import { liveEntryReady, openTdLive } from './live.ts';
import { app } from './app.ts';
import { startBounty } from './meta.ts';
import { artBox } from './textures.ts';
import { tArt } from './art.ts';
import { lackText, trimText } from './basefeel.ts';
import { openSeaMap } from './seamap.ts';
import { openTdSelect } from './td-ui.ts';
import { TUT_DONE, TUT_SAILED, tutAdv, tutStep, type Rect, rectOf } from './tutorial.ts';
import { el, button, img, toast, costRow, modalOpen } from './ui.ts';
import { openSheet, short, closeSheet } from './basepanel.ts';
import { ghostRect } from './baseplace.ts';

// ---- 船队
export function openFleet(bs: BaseScene): void {
  const p = app.profile;
  const hq = hqLevel(p);
  const { boats, cap: boatCap } = boatSlots(p);
  const { body } = openSheet(bs, '船队');
  tutAdv(3);
  el('p', 'hd-desc', '每条船只装一种兵，装满为止。出海时一次性花木材，没攒够就少带几个兵。', body);
  // 先点哪条船（顶上一排船标签，带这条船现在装的兵），再在下面选兵：这条船的选项全部摆出来
  const i = Math.min(bs.fleetBoat, boats - 1);
  const tabs = el('div', 'hd-boattabs', undefined, body);
  for (let j = 0; j < boats; j++) {
    const t = button('', `hd-boattab ${j === i ? 'hd-btn-gold' : 'hd-btn-plain'}`, () => {
      bs.fleetBoat = j;
      openFleet(bs);
    }, tabs);
    t.title = `第 ${j + 1} 条船`;
    t.appendChild(img(tArt(p.boats[j]?.troop ?? 'sailor', 'idle'), 26));
    el('b', 'hd-n', String(j + 1), t);
  }
  const cur: TroopKind = p.boats[i]?.troop ?? 'sailor';
  el('div', 'hd-boatname', `第 ${i + 1} 条船`, body);
  const row = el('div', 'hd-grid hd-fleetgrid', undefined, body);
  // 按开放的主寨等级从低到高排（内容表里后加的兵种排在最后，没解锁的会倒着排）
  const kinds = (Object.keys(TROOPS) as TroopKind[]).sort((a, b) => TROOPS[a].unlockHq - TROOPS[b].unlockHq);
  for (const k of kinds) {
    const t = TROOPS[k];
    const locked = t.unlockHq > hq;
    // 人数和木材都用规则核心算：假设这条船换成这种兵，读 armyFor / armyCost 的结果
    const hyp = k === cur ? { ok: true as const, value: p } : setBoat(p, i, k);
    const count = hyp.ok ? (armyFor(hyp.value).boats[i]?.count ?? 0) : 0;
    const c = el('button', `hd-card${locked ? ' off' : ''}${k === cur ? ' cur' : ''}`, undefined, row);
    c.type = 'button';
    c.appendChild(img(tArt(k, 'idle'), 36));
    const nm = el('span', 'hd-nm', t.name, c);
    // 「×14」整体不拆开：窄卡上折行只在名字和人数之间折
    if (hyp.ok) el('span', 'hd-cnt', `×${count}`, nm).before(' ');
    if (locked) el('span', 'hd-sub', `主寨 ${t.unlockHq} 级开放`, c);
    else if (!hyp.ok) el('span', 'hd-sub', '一场只能带一个船长', c);
    else {
      // 每个多少木材（图标 + 数字，一行放得下）；装不满才标红写空几格（容量和人口来自内容表，人数来自核心）
      const spare = Math.max(0, boatCap - count * t.housing);
      const each = t.levels[(app.profile.research[k] ?? 1) - 1]?.cost ?? t.levels[0]?.cost ?? 0;
      const per = el('span', 'hd-sub hd-per', undefined, c);
      per.appendChild(costRow({ gold: 0, wood: each }));
      per.append('/个');
      per.title = `每个 ${each} 木材`;
      if (spare > 0) el('span', 'hd-sub hd-short', `空 ${spare} 格`, c);
    }
    attachIntel(c, () => troopCard(k, researchLevel(app.profile, k)));
    c.addEventListener('click', () => {
      if (locked) return toast(`主寨 ${t.unlockHq} 级才能带${t.name}`);
      const r = setBoat(app.profile, i, k);
      if (!r.ok) return toast(short(bs, r.error));
      app.commit(r.value);
      openFleet(bs);
    });
  }
  const w = armyCost(app.profile).wood;
  const foot = el('div', 'hd-chips', undefined, body);
  const ch = el('span', 'hd-chip', '出海一次共需 ', foot);
  ch.appendChild(costRow({ gold: 0, wood: w }, app.profile.res));
}

// ---- 守岛：选关页，点"出发"进守岛场景
export function openTd(bs: BaseScene): void {
  closeSheet(bs);
  app.api.scene = 'map';
  bs.bottom.style.display = 'none';
  bs.stopMap = openTdSelect(
    (levelId) => {
      bs.stopMap?.();
      bs.stopMap = null;
      app.startTdLevel(levelId);
    },
    () => {
      bs.stopMap = null;
      app.api.scene = 'base';
      bs.bottom.style.display = '';
    },
    liveEntryReady()
      ? () => {
          bs.stopMap?.();
          bs.stopMap = null;
          openTdLive(() => {
            app.api.scene = 'base';
            bs.bottom.style.display = '';
          });
        }
      : undefined,
    () => {
      bs.stopMap?.();
      bs.stopMap = null;
      app.startTdTide();
    },
  );
}

// ---- 出海
export function openMap(bs: BaseScene): void {
  closeSheet(bs);
  app.api.scene = 'map';
  bs.bottom.style.display = 'none';
  bs.stopMap = openSeaMap(
    (levelId, bounty) => {
      if (bounty) {
        const sb = startBounty(app.profile);
        if (!sb.ok) return toast(sb.error === 'no_wood' ? `${lackText(armyCost(app.profile), app.profile.res) || '还差一些木材'}，先去伐木场收一收` : sb.error === 'done' ? '今天的悬赏已经完成，明天再来' : '今天没有悬赏');
        app.commit(sb.profile);
        bs.stopMap?.();
        bs.stopMap = null;
        app.startBattle(sb.levelId, false, sb.setup, { bounty: true });
        return;
      }
      const before = app.profile;
      const r = startCampaign(before, levelId, (Date.now() & 0x3fffffff) | 1);
      if (!r.ok) return toast(r.error === 'no_wood' ? `木材连一个兵都带不起，先去伐木场收一收` : '这座岛还没解锁');
      app.commit(r.value.profile);
      tutAdv(4);
      bs.stopMap?.();
      bs.stopMap = null;
      app.startBattle(levelId, false, r.value.setup, { bounty });
      if (r.value.trimmed) toast(trimText(r.value.trimmed, armyCost(before), before.res));
    },
    () => {
      bs.stopMap = null;
      app.api.scene = 'base';
      bs.bottom.style.display = '';
    },
  );
}

/** 一座建筑在屏幕上的框（引导框它）：框住图里真正不透明的部分，不是整张图（图四周有空白） */
function buildingRect(bs: BaseScene, id: number): () => Rect | null {
  return () => {
    const n = bs.nodes.get(id);
    if (!n) return null;
    const im = n.img;
    const bx = artBox(n.key) ?? { l: 0, t: 0, r: im.width, b: im.height };
    const x0 = im.x - (im.originX * im.displayWidth) + bx.l * im.scaleX;
    const y0 = im.y - (im.originY * im.displayHeight) + bx.t * im.scaleY;
    const a = bs.cc.toScreen(x0, y0);
    const b = bs.cc.toScreen(im.x - (im.originX * im.displayWidth) + (bx.r + 1) * im.scaleX, im.y - (im.originY * im.displayHeight) + (bx.b + 1) * im.scaleY);
    return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
  };
}

const VAULT_HINT_KEY = 'haidao.hint.vault';

/**
 * 上一场仓库满了（结算写「仓库满了，少拿 N」）：回岛先指一次「升金库」（木材截得多就指木料仓），排在训练营那步前面。
 * 新号 3 场就到主寨 3 级、金库还是 1 级，连着两场白丢四成掠夺。只出一次（haidao.hint.vault），
 * 「先不了」、升了那座、离开基地都收。新手引导前几步（还没出过海）不插队。返回 true = 这一帧金库引导占着横幅
 */
function vaultGuide(bs: BaseScene, st: number): boolean {
  const on = vaultStep(bs, st);
  if (on !== 'show') bs.vaultTut.hide();
  return on !== 'off';
}

/** show = 横幅指着金库；yield = 还在引导，但面板等开着先让开；off = 没有金库引导 */
function vaultStep(bs: BaseScene, st: number): 'show' | 'yield' | 'off' {
  const cut = app.storageCut;
  if (!cut || st < TUT_SAILED) return 'off';
  const kind: BuildingKind = cut.gold > 0 ? 'vault' : 'woodyard';
  const b = app.profile.base.buildings.find((q) => q.kind === kind);
  if (!bs.vaultAt) {
    let seen = false;
    try {
      seen = localStorage.getItem(VAULT_HINT_KEY) !== null;
      if (!seen) localStorage.setItem(VAULT_HINT_KEY, '1');
    } catch {
      // 存储不可用：本次照样引导一次
    }
    if (seen || !b) {
      app.storageCut = null;
      return 'off';
    }
    bs.vaultAt = { id: b.id, level: b.level };
  }
  if (!b || b.id !== bs.vaultAt.id || b.level > bs.vaultAt.level) {
    app.storageCut = null;
    bs.vaultAt = null;
    return 'off';
  }
  // 面板、摆放、海图、弹窗开着时让开（升级面板就是从这座金库点出来的，开着说明玩家已经在升了）
  if (bs.sheet || bs.place || bs.stopMap || modalOpen()) return 'yield';
  const lost = [cut.gold ? `${cut.gold.toLocaleString('en-US')} 金` : '', cut.wood ? `${cut.wood.toLocaleString('en-US')} 木` : ''].filter(Boolean).join('、');
  const name = kind === 'vault' ? '金库' : '木料仓';
  bs.vaultTut.show(`vault:${kind}`, `仓库满了，上一场少拿 ${lost}。点黄框里的${name}，升一级多装些`, buildingRect(bs, b.id));
  return 'show';
}

/** 新手引导：按进度和当前界面状态，决定指哪里 */
export function tutRefresh(bs: BaseScene): void {
  const st = tutStep();
  const t = bs.tut;
  if (vaultGuide(bs, st)) return t.hide();
  if (st >= TUT_DONE) return t.hide();
  const root = bs.ui;
  const world = (id: number): (() => Rect | null) => buildingRect(bs, id);
  const bld = (kind: BuildingKind): number | undefined => app.profile.base.buildings.find((b) => b.kind === kind)?.id;
  if (st === TUT_SAILED) {
    // 最后一步：指一下训练营（开过面板就算看过）；有面板、海图开着时先不指。
    // 电脑和平板顶栏有训练营钮；手机竖屏顶栏没有（layout.ts），先指主寨，操作环开了再指环上的「训练营」
    if (bs.sheet || bs.place || bs.stopMap || modalOpen()) return t.hide();
    const btn = bs.trainBtn;
    if (btn?.getClientRects().length) return t.show('train', '训练营：每种兵一关短教学，过关有奖励。点黄框里的「训练营」看看', () => rectOf(btn, root));
    const hq = bld('hq');
    const ring = hq !== undefined && bs.ring.isOpen && bs.ring.owner === hq ? bs.ring.button('train') : null;
    if (ring) return t.show('train-ring', '点「训练营」：每种兵一关短教学，过关有奖励', () => rectOf(ring, root));
    return t.show('train-hq', '训练营在主寨里：点中间的主寨，再点「训练营」', hq !== undefined ? world(hq) : null);
  }
  if (bs.stopMap) {
    const go = document.querySelector('.hd-map .hd-sheet .hd-btn-gold');
    if (st >= 4) {
      if (go) t.show('go', '点“出发”，开船！', () => rectOf(go, root));
      else t.show('island', '点第一座岛看看', () => rectOf(document.querySelector('.hd-map .hd-node'), root));
    } else t.hide();
    return;
  }
  if (bs.place) {
    if (st === 1) {
      if (bs.touch) t.show('place', '把虚影拖到空地上，绿色就点 ✓', () => rectOf(bs.place?.ok ?? null, root));
      else t.show('place-mouse', '移动鼠标挑块空地，变绿就点左键放下', () => ghostRect(bs));
    }
    else t.hide();
    return;
  }
  if (bs.sheet) {
    if (st === 1) {
      // 新号已经有一座伐木场、名额满了，所以引导去造金库（新号金币上限只有 1,500，正好用得上）
      const c = bs.buildCards.get('vault');
      if (c?.offsetParent) t.show('card', '点“金库”，金币能存得更多', () => rectOf(c, root));
      else t.hide();
    } else t.hide();
    return;
  }
  switch (st) {
    case 0: {
      const gm = bld('goldmine');
      const has = gm !== undefined && !!bs.nodes.get(gm)?.bubble;
      const tx = has ? '欢迎来到海岛！点金矿头上的气泡，收金币' : '欢迎来到海岛！金矿会自己攒金币，冒出气泡就点一下收';
      const n = gm !== undefined ? bs.nodes.get(gm) : undefined;
      if (has && gm !== undefined && n?.bubble) {
        const bub = n.bubble;
        const body = world(gm);
        // 框住气泡和金矿一起，气泡说明文字就不会压到金矿
        t.show('collect', tx, () => {
          const c = bs.cc.toScreen(bub.x, bub.y);
          const b = body();
          const x0 = Math.min(c.x - 24, b?.x ?? c.x);
          const y0 = c.y - 24;
          const x1 = Math.max(c.x + 24, b ? b.x + b.w : c.x);
          const y1 = Math.max(c.y + 24, b ? b.y + b.h : c.y);
          return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
        });
      } else t.show('wait', tx, gm !== undefined ? world(gm) : null);
      break;
    }
    case 1:
      t.show('build', '点“建造”，造一座金库', () => rectOf(bs.buildBtn, root));
      break;
    case 2: {
      const hq = bld('hq');
      const inf = hq !== undefined && bs.ring.isOpen && bs.ring.owner === hq ? bs.ring.button('info') : null;
      if (inf) t.show('hqinfo', '点“信息”，看看怎么升级', () => rectOf(inf, root));
      else if (!bs.touch) t.show('hq-mouse', '点一下中间的主寨，看看怎么升级', hq !== undefined ? world(hq) : null);
      else t.show('hq', '点中间的主寨，再点“信息”看怎么升级', hq !== undefined ? world(hq) : null);
      break;
    }
    case 3:
      t.show('fleet', '点“船队”，看看带什么兵出海', () => rectOf(bs.fleetBtn, root));
      break;
    case 4:
    case 5:
      t.show('sail', '点“出海”，去打第一座岛', () => rectOf(bs.mapBtn, root));
      break;
    default: {
      // 主寨 1 级时别的建筑都升不了（等级不能超过主寨），所以直接指主寨；星或资源不够就叫他再出海
      const hq = bld('hq');
      if (hq === undefined || !upgrade(app.profile, hq).ok) {
        t.show('home-sail', '打赢了！再打几座岛攒星，星够了就能升主寨', () => rectOf(bs.mapBtn, root));
        break;
      }
      const up = bs.ring.isOpen && bs.ring.owner === hq ? bs.ring.button('upgrade') : null;
      if (up) t.show('hq-up', '点“升级”，主寨升到 2 级，开放新建筑', () => rectOf(up, root));
      else t.show('home', bs.touch ? '打赢了！星够了：点中间的主寨，再点“升级”' : '打赢了！星够了：点一下主寨，再点“升级”', world(hq));
    }
  }
}
