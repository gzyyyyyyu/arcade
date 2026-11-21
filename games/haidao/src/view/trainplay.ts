/**
 * 训练营打起来以后（DESIGN 16）：一步一条提示（Tutorial 的横幅 + 高亮框，能「跳过提示」），开局贴一张介绍卡片，打完记过关、出结算。
 * 兵种关的话全从介绍卡片来（troopCard 的定位、寻敌，content/intel.ts 的相克），这里只拼「下一步做什么」。
 */
import { BUILDINGS, TROOPS, TROOP_INTEL } from '../content/index.ts';
import { TRAIN_BY_ID, TRAIN_TROOP_LEVEL, type TrainLesson } from '../content/training.ts';
import { TICKS_PER_SEC, type BattleResult, type BuildingKind, type TroopKind } from '../core/types.ts';
import { nextLesson, trainFinish, TRAIN_TD_OPENER } from '../core/training.ts';
import { app, fmt } from './app.ts';
import { iconA } from './art.ts';
import type { BattleScene } from './BattleScene.ts';
import { defenseCard, troopCard } from './intel.ts';
import { pinIntel } from './intelcard.ts';
import { dropStars, towerName } from './td-ui.ts';
import type { TdScene } from './TdScene.ts';
import { Tutorial, rectOf } from './tutorial.ts';
import { button, el, img, openModal } from './ui.ts';

interface Run {
  tut: Tutorial;
  pin: ReturnType<typeof pinIntel> | null;
  off: boolean;
  /** 每种兵第一次上岸的拍 */
  landAt: Partial<Record<TroopKind, number>>;
  /** 前排后排：火枪手比壮汉先上了 */
  wrong: boolean;
}
const runs = new WeakMap<object, Run>();

const names = (ks: readonly BuildingKind[]): string => ks.map((k) => BUILDINGS[k].name).join('、');

function start(scene: Phaser.Scene, root: HTMLElement, card: ReturnType<typeof troopCard> | null): Run {
  const r: Run = { tut: null as unknown as Tutorial, pin: null, off: false, landAt: {}, wrong: false };
  r.tut = new Tutorial(root, {
    label: '跳过提示',
    onSkip: () => {
      r.off = true;
      r.pin?.close();
    },
  });
  if (card) {
    r.pin = pinIntel(() => (r.pin = null));
    r.pin.update(card);
  }
  scene.events.once('shutdown', () => {
    r.tut.destroy();
    r.pin?.close();
  });
  return r;
}

// ---------------------------------------------------------------- 登陆战

/** 进场时调：训练营局才建提示和卡片 */
export function trainBattleInit(bs: BattleScene): void {
  const l = bs.d.train && TRAIN_BY_ID.get(bs.d.train.lesson);
  if (!l) return;
  const card = l.troop ? troopCard(l.troop, TRAIN_TROOP_LEVEL) : l.kind === 'counter' ? defenseCard('mortar', 2) : troopCard('brute', TRAIN_TROOP_LEVEL);
  runs.set(bs, start(bs, bs.ui, card));
}

/** 这种兵的船卡（船卡按兵种分组） */
const cardOf = (bs: BattleScene, t: TroopKind) => () => rectOf(bs.boatsEl.children[bs.groups.findIndex((g) => g.troop === t)] ?? null, bs.ui);
const landed = (bs: BattleScene, t: TroopKind): boolean => bs.d.setup.army.boats.some((b, i) => b.troop === t && bs.st.landed[i]);
const allLanded = (bs: BattleScene): boolean => bs.st.landed.every(Boolean);
const selTroop = (bs: BattleScene): TroopKind | null => bs.groups[bs.selBoat]?.troop ?? null;
const nextCard = (bs: BattleScene) => () => rectOf(bs.boatsEl.querySelector('.hd-boat:not(.done)'), bs.ui);

/** 每次刷新 HUD 调：按局面挑这一步的提示 */
export function trainBattleRefresh(bs: BattleScene): void {
  const r = runs.get(bs);
  const l = bs.d.train && TRAIN_BY_ID.get(bs.d.train.lesson);
  if (!r || !l) return;
  if (r.off || bs.ended || bs.paused) return r.tut.hide();
  const tick = bs.st.tick;
  for (const b of bs.d.setup.army.boats) if (r.landAt[b.troop] === undefined && landed(bs, b.troop)) r.landAt[b.troop] = tick;
  // 第一船上岸后收起卡片，让出画面（想再看长按船卡）
  if (r.pin && bs.st.landed.some(Boolean)) {
    r.pin.close();
    r.pin = null;
  }
  const step = l.kind === 'front' ? frontStep(bs, r) : l.kind === 'counter' ? counterStep(bs) : troopStep(bs, r, l);
  if (step) r.tut.show(step.key, step.text, step.target ?? null);
  else r.tut.hide();
}

type Step = { key: string; text: string; target?: (() => ReturnType<typeof rectOf>) | null } | null;

function troopStep(bs: BattleScene, r: Run, l: TrainLesson): Step {
  const t = l.troop!;
  const nm = TROOPS[t].name;
  const it = TROOP_INTEL[t];
  const at = r.landAt[t];
  if (at === undefined) {
    if (selTroop(bs) === t) return { key: 'beach', text: `点亮着的沙滩放${nm}。它好打${names(it.beats)}，从那边上岸最好` };
    return { key: 'card', text: `${nm}：${it.role}`, target: cardOf(bs, t) };
  }
  if (bs.st.tick - at < 6 * TICKS_PER_SEC) return { key: 'aim', text: `看它怎么找目标：${troopCard(t, TRAIN_TROOP_LEVEL).aims[0]?.text ?? ''}` };
  if (!allLanded(bs)) return { key: 'rest', text: '其余的船也放上去', target: nextCard(bs) };
  return { key: 'fear', text: `${nm}怕${names(it.fears)}：碰上了让别的兵先顶。拆到 1 星就过关` };
}

function frontStep(bs: BattleScene, r: Run): Step {
  const brute = r.landAt.brute;
  const gun = r.landAt.gunner;
  if (gun !== undefined && (brute === undefined || gun < brute)) r.wrong = true;
  if (r.wrong) return { key: 'wrong', text: '火枪手先上，炮全打在它身上。下次先放壮汉，拆光能拿三星', target: allLanded(bs) ? null : nextCard(bs) };
  if (brute === undefined) {
    if (selTroop(bs) === 'brute') return { key: 'beach', text: '点左边的沙滩，壮汉先上去顶炮' };
    if (selTroop(bs) === 'gunner') return { key: 'sel', text: '先别放火枪手：点壮汉，让前排先上', target: cardOf(bs, 'brute') };
    return { key: 'card', text: '壮汉是前排：血厚、专找防御塔打。先点壮汉的船', target: cardOf(bs, 'brute') };
  }
  if (gun === undefined) {
    if (bs.st.tick - brute < 2.5 * TICKS_PER_SEC) return { key: 'wait', text: '等壮汉走到炮前……' };
    if (selTroop(bs) === 'gunner') return { key: 'beach2', text: '放在壮汉身后的沙滩，火枪手站在 4 格外放枪' };
    return { key: 'gun', text: '炮在打壮汉了，现在放火枪手（后排）', target: cardOf(bs, 'gunner') };
  }
  if (!allLanded(bs)) return { key: 'rest', text: '另一船火枪手也跟上', target: nextCard(bs) };
  return { key: 'end', text: '前排吸炮火、后排在后面输出。拆到 1 星就过关' };
}

function counterStep(bs: BattleScene): Step {
  const brute = landed(bs, 'brute');
  const gun = landed(bs, 'gunner');
  if (!brute && !gun) {
    if (selTroop(bs) === 'brute') return { key: 'b-beach', text: '点右上方的沙滩：壮汉去拆臼炮' };
    if (selTroop(bs) === 'gunner') return { key: 'g-early', text: '火枪手怕臼炮（一砸一片）。先点壮汉，让它去拆臼炮', target: cardOf(bs, 'brute') };
    return { key: 'card', text: `右上是${BUILDINGS.mortar.name}（砸一片），左边是两门${BUILDINGS.cannon.name}（一次打一个）。壮汉专拆防御、不怕臼炮：先点壮汉`, target: cardOf(bs, 'brute') };
  }
  if (!gun) {
    if (selTroop(bs) === 'gunner') return { key: 'g-beach', text: '点左边的沙滩：火枪手人多，大炮一次只打一个' };
    return { key: 'gun', text: '火枪手好打大炮：放到左边去', target: cardOf(bs, 'gunner') };
  }
  if (!allLanded(bs)) return { key: 'rest', text: '另一船火枪手也放到左边', target: nextCard(bs) };
  return { key: 'end', text: '派对的兵打对的塔：看介绍卡片的「好打」「怕」' };
}

// ---------------------------------------------------------------- 守岛

export function trainTdInit(bs: TdScene): void {
  if (!bs.d.train) return;
  runs.set(bs, start(bs, bs.ui, null));
}

export function trainTdRefresh(bs: TdScene): void {
  const r = runs.get(bs);
  if (!r) return;
  if (r.off || bs.ended) return r.tut.hide();
  const s = bs.s;
  const built = (slot: number): boolean => (s.slots[slot]?.tower ?? -1) >= 0;
  const [a, b] = TRAIN_TD_OPENER;
  if (a && !built(a.slot)) return r.tut.show('pad1', `写着「${towerName(a.kind)}」的木台挨着拐弯：敌人绕弯时一直在射程里。点它，造${towerName(a.kind)}`, null);
  if (b && !built(b.slot)) return r.tut.show('pad2', `再点写着「${towerName(b.kind)}」的木台：它在路对面，两边夹着打`, null);
  if (s.wave < 1) return r.tut.show('wait', '塔造好了。海盗上岸后看塔打到谁：路过拐弯时挨打最久', null);
  r.tut.show('hold', `守住 ${s.level.waves.length} 波就过关。金币够了点塔升级`, null);
}

// ---------------------------------------------------------------- 打完

const LESSON_LINE: Record<Exclude<TrainLesson['kind'], 'troop'>, string> = {
  front: '前排吸炮火，后排在后面输出',
  counter: '派对的兵打对的塔',
  td: '塔放在拐弯旁、路两边夹着打',
};
function takeaway(l: TrainLesson): string {
  if (l.kind !== 'troop') return LESSON_LINE[l.kind];
  const it = TROOP_INTEL[l.troop!];
  return `${TROOPS[l.troop!].name}：好打${names(it.beats)}，怕${names(it.fears)}`;
}

/** 登陆战关 ≥1 星、守岛关守住算过；记账、出结算 */
export function trainEnd(lessonId: string, passed: boolean, stars: number, parent: HTMLElement): void {
  const l = TRAIN_BY_ID.get(lessonId);
  if (!l) return;
  const r = trainFinish(app.profile, lessonId, passed);
  if (!r.ok) return;
  const was = app.profile.train?.done.includes(lessonId) ?? false;
  if (r.value.reward) app.commit(r.value.profile);
  app.api.scene = 'result';
  let main: HTMLButtonElement | undefined;
  const mask = openModal({ cls: 'hd-train-mask', closable: false, onEsc: () => main?.click(), parent });
  const box = el('div', `hd-dialog hd-train-end${passed ? '' : ' hd-lose'}`, undefined, mask);
  el('small', 'hd-sub', `训练营 · ${l.name}`, box);
  el('h2', '', passed ? '过关！' : '差一点', box);
  if (l.kind !== 'td') dropStars(box, stars, 40);
  el('p', 'hd-train-take', takeaway(l), box);
  const rw = r.value.reward;
  if (rw) {
    const row = el('div', 'hd-train-rw', undefined, box);
    row.appendChild(img(iconA('gold'), 24));
    el('b', 'hd-n', `+${fmt(rw.gold)}`, row);
    row.appendChild(img(iconA('wood'), 24));
    el('b', 'hd-n', `+${fmt(rw.wood)}`, row);
    el('span', '', '回岛点「一键收取」', row);
  } else if (passed && was) el('p', 'hd-sub', '这关的奖励领过了', box);
  else if (!passed) el('p', 'hd-sub', l.kind === 'td' ? '守住就过关，再来一次' : '拆到 1 星就过关，照提示再来一次', box);
  const btns = el('div', 'hd-train-btns', undefined, box);
  button('回训练营', 'hd-btn-plain', () => {
    app.trainOnBase = true;
    app.goBase();
  }, btns);
  const nx = nextLesson(app.profile);
  const again = button('再来一次', passed && nx ? 'hd-btn-plain' : 'hd-btn-gold', () => app.startTrain(lessonId), btns);
  main = again;
  if (passed && nx) main = button(`下一关：${nx.name}`, 'hd-btn-gold', () => app.startTrain(nx.id), btns);
}

/** 登陆战关的结果（finish 里调） */
export function trainBattleEnd(bs: BattleScene, res: BattleResult): void {
  if (bs.ui.isConnected && bs.d.train) trainEnd(bs.d.train.lesson, res.stars > 0, res.stars, bs.ui);
}
