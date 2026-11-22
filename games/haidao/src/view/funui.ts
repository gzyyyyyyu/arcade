/**
 * 每局不一样（DESIGN 15）和误放撤回的画面：漂流宝箱、中途援军的预告旗、撤回小钮、第一次遇到的提示。
 * 只读规则核心的状态和事件（s.chests、canRecall、chest/ally/recall 事件），不自己算规则。
 * 状态按场景记在 WeakMap 里（BattleScene.ts 不加字段）；场景重开时按战斗状态对象换了就重置。
 * 本地存储：haidao.hint.defense（JSON 数组）记看过哪些防御的提示；haidao.hint.chest、haidao.hint.ally 各记"提示过了"，只提示一次。
 */
import type Phaser from 'phaser';
import { BUILDINGS, CAMPAIGN, TROOPS } from '../content/index.ts';
import { UNIT, TICKS_PER_SEC, type BChest, type BattleEvent, type ChestReward } from '../core/types.ts';
import { canRecall } from '../core/index.ts';
import { bTex, iconA, shipA } from './art.ts';
import { halfLostHint } from './battlescout.ts';
import { DEFENSE_KEY, hintAllowed, hintText, newDefenses } from './battlehint.ts';
import { hintCard, takeNew } from './hintcard.ts';
import { floatText } from './fx.ts';
import { put } from './ground.ts';
import { depthOf } from './iso.ts';
import { DEPTH } from './depth.ts';
import { sfx } from './audio/sfx.ts';
import { el, img, toast } from './ui.ts';
import type { BattleScene } from './BattleScene.ts';

const HINT_KEYS = { chest: 'haidao.hint.chest', ally: 'haidao.hint.ally' } as const;

/** 每个提示只出一次：记在本地存储里，存储不可用就当这次进程内出过 */
const seen = new Set<string>();
function hintOnce(key: string, text: string): void {
  if (seen.has(key)) return;
  seen.add(key);
  try {
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, '1');
  } catch {
    // 存储不可用：本次进程内只提示一次
  }
  toast(text);
}

interface FunView {
  st: object;
  chests: Map<number, Phaser.GameObjects.Graphics>;
  flag?: { g: Phaser.GameObjects.Graphics; t: Phaser.GameObjects.Text; at: number };
  recall: HTMLElement;
  buttons: Map<number, HTMLButtonElement>;
}
const views = new WeakMap<BattleScene, FunView>();

let styled = false;
function style(): void {
  if (styled) return;
  styled = true;
  const st = el('style');
  st.textContent = `
.hd-ui .hd-recall { position:absolute; right:8px; bottom:calc(100% + 40px); display:flex; gap:8px; z-index:32; }
.hd-ui .hd-recall button { position:relative; overflow:hidden; min-height:44px; padding:6px 14px; border-radius:12px; border:2px solid #2b1a15; background:#ffe885; color:#2b1a15; font-weight:900; font-size:14px; box-shadow:0 2px 0 #2b1a15; }
.hd-ui .hd-recall button i { position:absolute; left:0; bottom:0; height:4px; width:100%; background:#d4572f; transform-origin:left; animation:hd-recall-bar .5s linear forwards; }
@keyframes hd-recall-bar { from { transform:scaleX(1); } to { transform:scaleX(0); } }
`;
  document.head.appendChild(st);
}

function viewOf(bs: BattleScene): FunView {
  let v = views.get(bs);
  if (v && v.st === bs.st) return v;
  style();
  v?.recall.remove();
  v = { st: bs.st, chests: new Map(), recall: el('div', 'hd-recall', undefined, bs.cardsEl), buttons: new Map() };
  views.set(bs, v);
  return v;
}

/** 木箱 + 金边 + 呼吸的光圈；画在原点，调用方 setPosition */
function drawChest(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(0xffe885, 0.35).fillEllipse(0, 2, 56, 26);
  g.fillStyle(0x000000, 0.25).fillEllipse(0, 6, 34, 12);
  g.fillStyle(0x8a5a2b, 1).fillRoundedRect(-15, -16, 30, 20, 3);
  g.fillStyle(0xb57a3a, 1).fillRoundedRect(-15, -22, 30, 10, 4);
  g.lineStyle(2, 0x2b1a15, 1).strokeRoundedRect(-15, -22, 30, 26, 4);
  g.fillStyle(0xffd23f, 1).fillRect(-3, -14, 6, 8).fillRect(-15, -13, 30, 3);
}

const REWARD_ICON: Record<ChestReward, 'energy' | 'medkit' | 'shieldOn'> = { energy: 'energy', heal: 'medkit', shield: 'shieldOn' };
const REWARD_TEXT: Record<ChestReward, (n: number) => string> = {
  energy: (n) => `+${n}`,
  heal: (n) => `+${n}%`,
  shield: (n) => `${Math.round(n / TICKS_PER_SEC)}秒`,
};

const hinted = new WeakSet<BattleScene>();
/** 部署阶段开始时，这局第一次见到的防御（最多 2 种）弹一张不挡操作的小卡：点一下或 4 秒后收起；每种只提示一次 */
function defenseHint(bs: BattleScene): void {
  hinted.add(bs);
  if (!hintAllowed(bs.d, !!CAMPAIGN.find((l) => l.id === bs.d.levelId)?.boss)) return;
  const fresh = takeNew(DEFENSE_KEY, (seen) => newDefenses(bs.d.setup.layout.map((p) => p.kind), seen));
  hintCard(bs, bs.ui, fresh.map((k) => ({ icon: img(bTex(k, 1), 40), name: BUILDINGS[k].name, text: hintText(k) })));
}

const halfDone = new WeakSet<object>();
/** 兵团血量第一次掉过一半、还有船没出：轻提示一次（toast，不挡操作）；每局最多一次，回放 / 机器人代打不弹 */
function halfHint(bs: BattleScene): void {
  if (halfDone.has(bs.st) || bs.d.pvp?.replay || bs.d.auto || bs.st.over) return;
  const t = halfLostHint(bs.st.units, bs.st.landed, bs.d.setup.army);
  if (t === null) return;
  halfDone.add(bs.st);
  toast(t);
}

/** 每几拍调一次（挂在 updateHud 上）：补画宝箱、摆撤回钮、更新援军倒计时 */
export function funHud(bs: BattleScene): void {
  const s = bs.st;
  if (!hinted.has(bs)) defenseHint(bs);
  halfHint(bs);
  const chests: BChest[] = s.chests ?? [];
  const army = bs.d.setup.army;
  const v = viewOf(bs);
  for (const c of chests) {
    if (c.taken || v.chests.has(c.id)) continue;
    const w = bs.W(c.x, c.y);
    const g = bs.add.graphics().setPosition(w.x, w.y).setScale(1 / bs.r).setDepth(depthOf(c.x / UNIT, c.y / UNIT) + 0.3);
    drawChest(g);
    bs.tweens.add({ targets: g, scale: { from: 1 / bs.r, to: 1.12 / bs.r }, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    v.chests.set(c.id, g);
  }
  // 开场俯瞰（侦察提示）还盖着时先不说：同一时间只一条提示，俯瞰期间时钟停着，收起后 tick 还在 40 以内
  if (chests.length > 0 && s.tick < 40 && !bs.paused) hintOnce(HINT_KEYS.chest, '漂来宝箱，派兵去捡');
  if (v.flag) v.flag.t.setText(String(Math.max(0, Math.ceil((v.flag.at - s.tick) / TICKS_PER_SEC))));
  // 撤回钮：规则说能撤的船才出，到点（或兵出手了）就收
  for (let i = 0; i < army.boats.length; i++) {
    const can = !bs.d.pvp?.replay && canRecall(s, i);
    const b = v.buttons.get(i);
    if (can && !b) {
      const btn = el('button', '', `↩ 撤回 ${TROOPS[army.boats[i]!.troop].name}`, v.recall);
      btn.type = 'button';
      el('i', '', undefined, btn);
      btn.addEventListener('click', () => {
        bs.pending.push({ t: s.tick, type: 'recall', boat: i });
        btn.remove();
        v.buttons.delete(i);
      });
      v.buttons.set(i, btn);
    } else if (!can && b) {
      b.remove();
      v.buttons.delete(i);
    }
  }
}

/** battleevents.ts 的新分支：chest、ally、recall。返回 true = 处理了 */
export function funEvent(bs: BattleScene, e: BattleEvent): boolean {
  if (e.type === 'chest') {
    const v = viewOf(bs);
    const w = bs.W(e.x, e.y);
    const g = v.chests.get(e.id);
    v.chests.delete(e.id);
    if (g) {
      bs.tweens.killTweensOf(g);
      bs.tweens.add({ targets: g, scale: g.scaleX * 1.6, alpha: 0, duration: 260, ease: 'Quad.easeOut', onComplete: () => g.destroy() });
    }
    // 光圈 + 图标上浮 + 数字：三种奖励各一个图标
    bs.pt.emit('ring', w.x, w.y, { life: 520, s0: 0.3, s1: 1.8, a0: 1, tint: 0xffe885, depth: DEPTH.groundRing });
    const ic = put(bs, bs.r, iconA(REWARD_ICON[e.reward]), w.x, w.y - 18).setDepth(DEPTH.impactFx);
    bs.tweens.add({ targets: ic, y: ic.y - 40, alpha: 0, scale: ic.scale * 1.6, duration: 900, ease: 'Cubic.easeOut', onComplete: () => ic.destroy() });
    floatText(bs, bs.r, bs.cc.z, w.x, w.y - 36, REWARD_TEXT[e.reward](e.amount), '#ffe885', 22);
    sfx('star');
    return true;
  }
  if (e.type === 'ally') {
    const v = viewOf(bs);
    const w = bs.W(e.x, e.y);
    if (e.phase === 'warn') {
      const g = bs.add.graphics().setPosition(w.x, w.y).setScale(1 / bs.r).setDepth(DEPTH.impactFx);
      g.fillStyle(0xffe885, 0.4).fillEllipse(0, 0, 90, 44).lineStyle(3, 0xffe885, 1).strokeEllipse(0, 0, 90, 44);
      g.lineStyle(3, 0x2b1a15, 1).lineBetween(0, 0, 0, -44);
      g.fillStyle(0x2f9bd8, 1).fillTriangle(0, -44, 26, -36, 0, -26);
      const t = bs.add.text(w.x, w.y - 62 / bs.r, '3', { fontFamily: 'system-ui,sans-serif', fontStyle: '900', fontSize: `${26 * bs.r}px`, color: '#ffffff', stroke: '#2b1a15', strokeThickness: 5 * bs.r }).setOrigin(0.5).setScale(1 / bs.r).setDepth(DEPTH.impactFx);
      bs.tweens.add({ targets: g, alpha: { from: 1, to: 0.45 }, duration: 380, yoyo: true, repeat: -1 });
      v.flag = { g, t, at: e.at };
      hintOnce(HINT_KEYS.ally, '援军 3 秒后靠岸');
      return true;
    }
    v.flag?.g.destroy();
    v.flag?.t.destroy();
    v.flag = undefined;
    // 友军船靠岸：和登陆同一套滑进来的画法，反方向（从海那一侧来）
    const dx = e.x - (UNIT * 11);
    const dy = e.y - (UNIT * 11);
    const l = Math.max(1, Math.hypot(dx, dy));
    const o = bs.W((dx / l) * 380, (dy / l) * 380);
    const ship = put(bs, bs.r, shipA('raft'), w.x + o.x, w.y + o.y).setDepth(depthOf(e.x / UNIT, e.y / UNIT) + 0.2).setFlipX(o.x > 0).setAlpha(0);
    bs.tweens.add({ targets: ship, alpha: 1, x: w.x, y: w.y, duration: 380, ease: 'Cubic.easeOut' });
    bs.tweens.add({ targets: ship, alpha: 0, duration: 400, delay: 700, onComplete: () => ship.destroy() });
    bs.pt.emit('ring', w.x, w.y + 4, { life: 520, s0: 0.3, s1: 1.4, a0: 0.9, tint: 0xffe885, depth: DEPTH.groundRing });
    floatText(bs, bs.r, bs.cc.z, w.x, w.y - 30, `援军 ×${e.units.length}`, '#8fe3ff', 22);
    sfx('land');
    return true;
  }
  if (e.type === 'recall') {
    // 兵回船：这批兵的骨架放回对象池，原地冒一圈白光
    for (const id of e.units) {
      const sp = bs.usp.get(id);
      if (!sp) continue;
      bs.usp.delete(id);
      bs.ubyId.delete(id);
      const w = bs.W(sp.cx, sp.cy);
      bs.pt.emit('ring', w.x, w.y, { life: 300, s0: 0.2, s1: 0.8, a0: 0.8, depth: DEPTH.groundRing });
      bs.pool.put(sp.rig);
    }
    sfx('splash');
    return true;
  }
  return false;
}
