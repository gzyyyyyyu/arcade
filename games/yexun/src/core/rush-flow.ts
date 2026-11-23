/**
 * 首领连战每拍的推进（docs/design-play.md 2.5）：路线图选路 → 驿站 → 上场 → 软限时发狂 → 过关给纸钱、肉包 → 选卡（挑几张、锁、放逐、重抽、跳过）→ 下一列 → 终局。
 * 菜单都在 phase 'choose' 里（w.menu 分 'route' | 'stop' | 'cards'），停拍、录像只记选择码（state.ts Pick）。
 * 要用 step 里的刷怪、升级、结算进化、换图，由 step 传进来（RushApi），这里不 import step。
 * 随机：卡是哪张走 rUp（和守夜三选一同一条），稀有度、符印、商店、事件走 rRush。
 */
import { AFFIX_IDS, EVENT_FX, RELIC_FX, RELIC_IDS, RUSH, RUSH_EVENTS, RUSH_FOES, RUSH_SETS, RUSH_TIER, YELOU, type AffixId, type RelicId, type RushHexId } from '../content/rush.ts';
import { SCHOOLS } from '../content/guide.ts';
import { ENEMY_BY_KIND, type EnemyKind } from '../content/enemies.ts';
import type { MapId } from '../content/maps.ts';
import { MAX_WEAPON_LEVEL, MERGES, type PassiveId, type WeaponId } from '../content/weapons.ts';
import { Ev } from './events.ts';
import { affixInit } from './foes/affix.ts';
import type { RushEventChoice, RushOption } from './rush.ts';
import { Pick, type Choice, type Stats, type World } from './state.ts';

export interface RushApi {
  /** 守夜三选一的卡池（带权重；已经按法器池、封禁、心法、缘分算好） */
  pool(w: World): { c: Choice; weight: number }[];
  /** 在刷怪圈上放一只关底，返回槽位（-1 = 满了） */
  spawn(w: World, kind: EnemyKind): number;
  upgradeWeapon(w: World, id: WeaponId): void;
  upgradePassive(w: World, id: PassiveId): void;
  recompute(w: World): void;
  /** 结一次进化、合成（开挑前、挑完各一次） */
  settle(w: World): void;
  heal(w: World, n: number): void;
  /** 过关掉肉包 */
  buns(w: World): void;
  /** 换图（清场、换地形） */
  enterMap(w: World, map: MapId): void;
  /** 法器换成另一件（老货郎）：槽位不变，这件的子弹清掉 */
  swapWeapon(w: World, slot: number, to: WeaponId): void;
}

export function relicN(w: World, id: RelicId): number {
  let n = 0;
  for (const r of w.rushRelics) if (r === id) n++;
  return n;
}

function hex(w: World, id: RushHexId): boolean {
  return w.setup.rushHexes?.includes(id) ?? false;
}

/** 纸钱进账：纸钱串加、咒「贫」减半 */
function gainCoins(w: World, n: number): void {
  w.rushCoins += Math.round(n * (1 + RELIC_FX.string * relicN(w, 'string')) * (hex(w, 'poor') ? 0.5 : 1));
}

// ───────────────────────── 每拍（play 阶段） ─────────────────────────

/** 上场、喘息结束开选卡、软限时发狂。step 每拍在刷怪的位置调 */
export function rushTick(w: World, api: RushApi): void {
  if (w.rushRest >= 0) {
    if (w.tick >= w.rushRest) {
      w.rushRest = -1;
      openHand(w, api);
    }
    return;
  }
  if (w.rushAt >= 0) {
    if (w.tick >= w.rushAt) startStage(w, api);
    return;
  }
  if (w.rushLeft <= 0 || w.rushStage >= RUSH.stages) return;
  const over = w.tick - w.rushFrom - RUSH.soft;
  if (over < 0) return;
  const e = RUSH.enrage;
  const rage = 1 + Math.floor(over / e.every);
  if (rage <= w.rushRage) return;
  const mul = (r: number, step: number, max: number): number => (r <= 0 ? 1 : Math.min(max, 1 + step * r));
  const dm = mul(rage, e.dmg, e.maxDmg) / mul(w.rushRage, e.dmg, e.maxDmg);
  const sm = mul(rage, e.speed, e.maxSpeed) / mul(w.rushRage, e.speed, e.maxSpeed);
  for (let i = 0; i < w.eRush.length; i++) {
    if (!w.eRush[i] || !w.eAlive[i]) continue;
    w.eDmg[i]! *= dm;
    w.eAtk[i]! *= dm;
    w.eSpeed[i]! *= sm;
  }
  w.rushRage = rage;
  w.ev.push(Ev.Rush, w.x, w.y, 4, rage);
}

/** 这一关的词缀：路上写的 + 咒「凶」+ 事件给的（不重复，从剩下的里抽）；终局不带 */
function stageAffixes(w: World, opt: RushOption | null): AffixId[] {
  if (!opt) return [];
  const out = [...opt.affixes];
  const extra = (hex(w, 'fierce') ? 1 : 0) + w.rushNext.affix;
  for (let k = 0; k < extra; k++) {
    const left = AFFIX_IDS.filter((a) => !out.includes(a));
    if (left.length === 0) break;
    out.push(left[w.rRush.int(left.length)]!);
  }
  return out;
}

/** 当前这一关走的路（终局 null） */
export function rushOption(w: World): RushOption | null {
  const k = w.rushStage;
  if (!w.rush || k >= RUSH.stages) return null;
  return w.rush.layers[k]![w.rushPath[k]!] ?? null;
}

function startStage(w: World, api: RushApi): void {
  const route = w.rush!;
  const k = w.rushStage;
  const final = k >= RUSH.stages;
  const opt = rushOption(w);
  const kinds: readonly EnemyKind[] = final ? [RUSH.finalKind] : RUSH_FOES[route.foes[k]!].kinds;
  const affixes = stageAffixes(w, opt);
  const hpMul = w.rushHpMul * (opt?.elite ? RUSH.eliteHp : 1);
  for (const kind of kinds) {
    const i = api.spawn(w, kind);
    if (i < 0) continue;
    const hp = (final ? YELOU.hp : RUSH.hp[k]! * RUSH_FOES[route.foes[k]!].hpK) * hpMul;
    w.eHp[i] = hp;
    w.eHpMax[i] = hp;
    w.eDmg[i] = final ? YELOU.dmg : RUSH.dmg[k]!;
    // 招式伤害按贴身伤害同比例压（招式读 eAtk 的话）
    w.eAtk[i] = w.eDmg[i]! / ENEMY_BY_KIND[kind].dmg;
    affixInit(w, i, affixes);
    w.eRush[i] = 1;
    w.rushBolt[i] = 10;
    w.rushLeft++;
  }
  w.rushAt = -1;
  w.rushFrom = w.tick;
  w.rushRage = 0;
  w.rushCharm = false;
  w.rushDark = w.rushNext.dark;
  w.rushNext.dark = false;
  w.rushNext.affix = 0;
  const lamp = relicN(w, 'lamp');
  if (lamp > 0) api.heal(w, Math.round(w.stats.hpMax * RELIC_FX.lamp * lamp));
  w.ev.push(Ev.Rush, w.x, w.y, 0, k, kinds.length);
}

/** 一只关底倒了：这一关的都倒了才记一只；一关清完给纸钱、肉包，喘口气后开选卡；终局倒了记下这一拍（step 末尾收工） */
export function rushKilled(w: World, code: number, x: number, y: number, api: RushApi): void {
  w.rushLeft--;
  // 双煞两只都倒了才算打倒这一关的首领（一共 11 只按关数）
  if (w.rushLeft <= 0) w.rushDown++;
  w.ev.push(Ev.Rush, x, y, 1, w.rushDown, code);
  if (w.rushLeft > 0) return;
  const k = w.rushStage;
  const elite = rushOption(w)?.elite ?? false;
  w.rushStage++;
  if (k >= RUSH.stages) {
    w.rushEnd = w.tick;
    w.ev.push(Ev.Rush, w.x, w.y, 2, w.tick);
    return;
  }
  gainCoins(w, (elite ? RUSH.coins.elite : RUSH.coins.normal) + (w.tick - w.rushFrom <= RUSH.coins.fastTicks ? RUSH.coins.fast : 0));
  if (!hex(w, 'noreroll')) w.rerolls += (elite ? 1 : 0) + relicN(w, 'tube');
  w.rushElite = elite;
  api.buns(w);
  w.rushRest = w.tick + RUSH.rest;
}

// ───────────────────────── 菜单 ─────────────────────────

/** 开局：第 1 列的路线图 */
export function openRoute(w: World): void {
  w.menu = 'route';
  w.phase = 'choose';
  w.choices = [];
}

/** 菜单里的选择（step 在 phase 'choose' 时调）：按 w.menu 分 */
export function rushChoose(w: World, choice: number, api: RushApi): void {
  if (choice < 0) return;
  if (w.menu === 'route') return chooseRoute(w, choice, api);
  if (w.menu === 'stop') return chooseStop(w, choice, api);
  chooseCard(w, choice, api);
}

function chooseRoute(w: World, choice: number, api: RushApi): void {
  const col = w.rush!.layers[w.rushStage];
  const p = choice - Pick.Route;
  if (!col || p < 0 || p >= col.length) return;
  w.rushPath.push(p);
  const opt = col[p]!;
  api.enterMap(w, opt.map);
  if (opt.stop) openStop(w, opt, api);
  else fight(w);
}

/** 关上菜单、排上场 */
function fight(w: World): void {
  w.menu = 'cards';
  w.stop = null;
  w.stopEvent = null;
  w.stopGoods = [];
  w.stopChoices = [];
  w.choices = [];
  w.phase = 'play';
  w.rushAt = w.tick + RUSH.first;
}

// ───────────────────────── 卡 ─────────────────────────

/** 这一关的稀有度：第 1 关 RUSH_TIER.first，第 10 关 last，中间线性 */
function rollTier(w: World, stage: number): 1 | 2 | 3 {
  const t = Math.min(1, Math.max(0, stage / (RUSH.stages - 1)));
  const ws = RUSH_TIER.first.map((a, i) => a + (RUSH_TIER.last[i]! - a) * t);
  let r = w.rRush.next() * (ws[0]! + ws[1]! + ws[2]!);
  for (let i = 0; i < 2; i++) {
    r -= ws[i]!;
    if (r < 0) return (i + 1) as 1 | 2;
  }
  return 3;
}

/** 从卡池抽一张不在 except 里的（权重同守夜三选一）；抽空了给铜钱卡 */
function drawCard(w: World, api: RushApi, except: readonly Choice[], tier: 1 | 2 | 3): Choice {
  const pool = api.pool(w).filter((p) => !except.some((c) => c.kind === p.c.kind && c.id === p.c.id));
  if (pool.length === 0) return { kind: 'coins', id: 'coins', tier };
  let total = 0;
  for (const p of pool) total += p.weight;
  let r = w.rUp.next() * total;
  let k = 0;
  for (; k < pool.length - 1; k++) {
    r -= pool[k]!.weight;
    if (r < 0) break;
  }
  return { ...pool[k]!.c, tier };
}

/** 抽一个还没有的符印（满了或抽空了返回 null） */
function drawRelic(w: World, except: readonly Choice[]): RelicId | null {
  if (w.rushRelics.length >= RUSH.maxRelics) return null;
  const left = RELIC_IDS.filter((r) => !w.rushRelics.includes(r) && !except.some((c) => c.kind === 'relic' && c.id === r));
  return left.length ? left[w.rRush.int(left.length)]! : null;
}

/** 选卡这一手：锁住的先放进来，事件给的金框卡，其余照卡池抽；第 2 关起有机会出一张符印 */
function openHand(w: World, api: RushApi): void {
  const stage = w.rushStage - 1;
  api.settle(w);
  const gold = w.rushNext.gold;
  const size = RUSH.hand + relicN(w, 'bowl') + w.rushNext.hand + gold;
  const take = (w.rushElite ? RUSH.take.elite : w.rushStage >= RUSH.stages ? RUSH.take.preFinal : RUSH.take.normal) + w.rushNext.take + gold;
  w.rushNext.hand = 0;
  w.rushNext.take = 0;
  w.rushNext.gold = 0;
  const hand: Choice[] = [...w.rushLocked];
  for (let g = 0; g < gold && hand.length < size; g++) hand.push(drawCard(w, api, hand, 3));
  const relic = stage >= RUSH.relicFrom && w.rRush.chance(RUSH.relicChance) ? drawRelic(w, hand) : null;
  while (hand.length < size - (relic ? 1 : 0)) hand.push(drawCard(w, api, hand, rollTier(w, stage)));
  if (relic) hand.push({ kind: 'relic', id: relic, tier: 3 });
  w.choices = hand;
  w.rushTake = Math.min(take, hand.length);
  w.rushLocks = RUSH.locks + relicN(w, 'lock');
  w.menu = 'cards';
  w.phase = 'choose';
}

/** 拿下一张卡：稀有度几就升几级（新法器直接到这一级），符印进包 */
export function applyRushCard(w: World, c: Choice, api: RushApi): void {
  const n = c.tier ?? 1;
  if (c.kind === 'weapon') for (let k = 0; k < n; k++) api.upgradeWeapon(w, c.id as WeaponId);
  else if (c.kind === 'passive') for (let k = 0; k < n; k++) api.upgradePassive(w, c.id as PassiveId);
  else if (c.kind === 'relic') {
    if (w.rushRelics.length < RUSH.maxRelics) w.rushRelics.push(c.id as RelicId);
    api.recompute(w);
  } else gainCoins(w, RUSH.coins.skip * 2);
}

function isLocked(w: World, c: Choice): number {
  return w.rushLocked.indexOf(c);
}

function chooseCard(w: World, choice: number, api: RushApi): void {
  const hand = w.choices;
  if (choice < hand.length) {
    const c = hand[choice]!;
    const l = isLocked(w, c);
    if (l >= 0) w.rushLocked.splice(l, 1);
    hand.splice(choice, 1);
    applyRushCard(w, c, api);
    w.rushTake--;
    if (w.rushTake <= 0 || hand.length === 0) endHand(w, api);
    return;
  }
  if (choice === Pick.Reroll) {
    if (w.rerolls <= 0 || hex(w, 'noreroll')) return;
    w.rerolls--;
    const stage = w.rushStage - 1;
    const keep = hand.filter((c) => isLocked(w, c) >= 0);
    const next = [...keep];
    while (next.length < hand.length) next.push(drawCard(w, api, [...next, ...hand], rollTier(w, stage)));
    w.choices = next;
    return;
  }
  if (choice >= Pick.Ban && choice < Pick.Ban + hand.length) {
    const k = choice - Pick.Ban;
    const c = hand[k]!;
    if (w.bans <= 0 || (c.kind !== 'weapon' && c.kind !== 'passive')) return;
    w.bans--;
    w.banned.push(c.id as WeaponId | PassiveId);
    const l = isLocked(w, c);
    if (l >= 0) w.rushLocked.splice(l, 1);
    hand[k] = drawCard(w, api, hand, rollTier(w, w.rushStage - 1));
    return;
  }
  if (choice >= Pick.Lock && choice < Pick.Lock + hand.length) {
    const c = hand[choice - Pick.Lock]!;
    const l = isLocked(w, c);
    if (l >= 0) {
      w.rushLocked.splice(l, 1);
      w.rushLocks++;
    } else if (w.rushLocks > 0) {
      w.rushLocked.push(c);
      w.rushLocks--;
    }
    return;
  }
  if (choice === Pick.Skip) {
    // 剩下没挑、没锁的每张换纸钱
    const left = hand.filter((c) => isLocked(w, c) < 0).length;
    gainCoins(w, left * RUSH.coins.skip);
    endHand(w, api);
  }
}

function endHand(w: World, api: RushApi): void {
  w.choices = [];
  w.rushTake = 0;
  api.settle(w);
  if (w.rushStage >= RUSH.stages) {
    // 第 10 关打完：直接进终局
    api.enterMap(w, w.rush!.finalMap);
    fight(w);
    return;
  }
  openRoute(w);
}

// ───────────────────────── 驿站 ─────────────────────────

function openStop(w: World, opt: RushOption, api: RushApi): void {
  w.menu = 'stop';
  w.phase = 'choose';
  w.choices = [];
  w.stop = opt.stop;
  w.stopEvent = opt.event ?? null;
  w.stopGoods = [];
  w.stopChoices = [];
  const stage = w.rushStage;
  if (opt.stop === 'shop') {
    const P = RUSH.prices;
    const cards: Choice[] = [];
    for (let k = 0; k < 2; k++) {
      const c = drawCard(w, api, cards, rollTier(w, stage));
      cards.push(c);
      w.stopGoods.push({ kind: 'card', card: c, price: P.card[(c.tier ?? 1) - 1]!, sold: false });
    }
    const relic = drawRelic(w, []);
    if (relic) w.stopGoods.push({ kind: 'relic', relic, price: P.relic, sold: false });
    w.stopGoods.push({ kind: 'heal', price: P.heal, sold: false });
    if (!hex(w, 'noreroll')) w.stopGoods.push({ kind: 'reroll', price: P.reroll, sold: false });
    w.stopGoods.push({ kind: 'ban', price: P.ban, sold: false });
  } else if (opt.stop === 'event' && opt.event) {
    const ev = opt.event;
    if (ev === 'peddler') {
      for (const t of peddlerOffers(w, api)) w.stopChoices.push({ event: ev, option: -1, trade: t });
      w.stopChoices.push({ event: ev, option: 0 });
    } else {
      const n = RUSH_EVENTS[ev].options.length;
      for (let o = 0; o < n; o++) w.stopChoices.push({ event: ev, option: o });
    }
  }
}

/** 老货郎：手上没进化、没参与合成的法器，换成池里还没有的同级件；最多 EVENT_FX.peddlerOffers 种换法 */
function peddlerOffers(w: World, api: RushApi): { from: WeaponId; to: WeaponId }[] {
  const merged = new Set<string>();
  for (const id of w.merges) {
    const def = MERGES.find((m) => m.id === id);
    if (def) {
      merged.add(def.a);
      merged.add(def.b);
    }
  }
  const from = w.weapons.filter((o) => !o.evolved && !merged.has(o.id)).map((o) => o.id);
  const to = [...new Set(api.pool(w).filter((p) => p.c.kind === 'weapon' && !w.weapons.some((o) => o.id === p.c.id)).map((p) => p.c.id as WeaponId))];
  const out: { from: WeaponId; to: WeaponId }[] = [];
  for (let k = 0; k < EVENT_FX.peddlerOffers && from.length > 0 && to.length > 0; k++) {
    const f = from[w.rRush.int(from.length)]!;
    const t = to.splice(w.rRush.int(to.length), 1)[0]!;
    out.push({ from: f, to: t });
  }
  return out;
}

function chooseStop(w: World, choice: number, api: RushApi): void {
  if (choice === Pick.Leave) return fight(w);
  if (w.stop === 'shop' && choice >= Pick.Buy && choice < Pick.Buy + w.stopGoods.length) return buy(w, w.stopGoods[choice - Pick.Buy]!, api);
  if (w.stop === 'rest' && choice >= Pick.Rest && choice <= Pick.Rest + w.weapons.length) return rest(w, choice - Pick.Rest, api);
  if (w.stop === 'event' && choice >= Pick.Event && choice < Pick.Event + w.stopChoices.length) {
    event(w, w.stopChoices[choice - Pick.Event]!, api);
    fight(w);
  }
}

/** 每样买一次（重抽、放逐也是）；满血不卖回血，免得白花纸钱 */
function buy(w: World, g: (typeof w.stopGoods)[number], api: RushApi): void {
  if (g.sold || w.rushCoins < g.price || (g.kind === 'heal' && w.hp >= w.stats.hpMax)) return;
  w.rushCoins -= g.price;
  if (g.kind === 'card' && g.card) {
    applyRushCard(w, g.card, api);
    api.settle(w);
    g.sold = true;
  } else if (g.kind === 'relic' && g.relic) {
    applyRushCard(w, { kind: 'relic', id: g.relic }, api);
    g.sold = true;
  } else if (g.kind === 'heal') {
    api.heal(w, Math.round(w.stats.hpMax * RUSH.shopHeal));
    g.sold = true;
  } else if (g.kind === 'reroll') {
    w.rerolls++;
    g.sold = true;
  } else {
    w.bans++;
    g.sold = true;
  }
}

/** 休整：0 回血；1 + j = 第 j 件法器升 RUSH.restLevels 级（没满级、没进化的才算） */
function rest(w: World, k: number, api: RushApi): void {
  if (k === 0) api.heal(w, Math.round(w.stats.hpMax * RUSH.restHeal));
  else {
    const o = w.weapons[k - 1];
    if (!o || o.evolved || o.level >= MAX_WEAPON_LEVEL) return;
    for (let n = 0; n < RUSH.restLevels; n++) api.upgradeWeapon(w, o.id);
    api.settle(w);
  }
  fight(w);
}

function event(w: World, c: RushEventChoice, api: RushApi): void {
  const F = EVENT_FX;
  if (c.trade) {
    const slot = w.weapons.findIndex((o) => o.id === c.trade!.from);
    if (slot >= 0) api.swapWeapon(w, slot, c.trade.to);
    return;
  }
  const o = c.option;
  switch (c.event) {
    case 'blood':
      if (o === 0) {
        w.hp = Math.max(1, w.hp - Math.round(w.hp * F.bloodCost));
        w.rushNext.gold++;
      }
      break;
    case 'gamble':
      if (o === 0 && w.rushCoins >= F.gambleBet) w.rushCoins += w.rRush.chance(0.5) ? F.gambleBet : -F.gambleBet;
      break;
    case 'well':
      if (o === 0) api.heal(w, w.stats.hpMax);
      else w.rushNext.hand += F.wellHand;
      break;
    case 'effigy':
      if (o === 0) {
        w.rushNext.affix++;
        w.rushNext.take += F.effigyTake;
      }
      break;
    case 'dark':
      if (o === 0) {
        w.rushNext.dark = true;
        w.rushNext.gold++;
      }
      break;
    case 'incense':
      api.heal(w, Math.round(w.stats.hpMax * F.incenseHeal));
      break;
    case 'stele':
      if (o === 0) w.bans += F.steleBans;
      else w.rushCoins += F.steleCoins;
      break;
    case 'peddler':
      break;
  }
}

// ───────────────────────── 符印和流派套（step 里的挂钩） ─────────────────────────

/** recompute 末尾：符印的血上限、移速 */
export function rushStats(w: World, s: Stats): void {
  s.hpMax += RELIC_FX.gourd * relicN(w, 'gourd');
  s.speed *= 1 + RELIC_FX.boots * relicN(w, 'boots');
}

/** 流派套：这件法器的伤害倍数（同一流派单子上的法器 + 被动拿够 3 / 5 件，本流派法器 +10% / +20%；一件在几个流派里取最高） */
export function rushSetMul(w: World, id: WeaponId): number {
  let best = 0;
  for (const sc of Object.values(SCHOOLS)) {
    if (!sc.weapons.includes(id)) continue;
    let n = 0;
    for (const o of w.weapons) if (sc.weapons.includes(o.id)) n++;
    for (const p of sc.passives) if (w.passives[p] !== undefined) n++;
    for (let k = RUSH_SETS.need.length - 1; k >= 0; k--) {
      if (n >= RUSH_SETS.need[k]!) {
        best = Math.max(best, RUSH_SETS.bonus[k]!);
        break;
      }
    }
  }
  return 1 + best;
}

/** 打首领的伤害倍数（照胆镜） */
export function rushHitMul(w: World, i: number): number {
  return w.eRush[i] ? 1 + RELIC_FX.mirror * relicN(w, 'mirror') : 1;
}

/** 五雷令：这只关底的血每掉一成，落一道雷（血上限的 1%）；返回这一下要加的雷伤 */
export function rushThunder(w: World, i: number): number {
  const n = relicN(w, 'thunder');
  if (n === 0 || !w.eRush[i] || w.eHp[i]! <= 0) return 0;
  const tenth = Math.ceil((w.eHp[i]! / w.eHpMax[i]!) * 10);
  let bolts = 0;
  while (w.rushBolt[i]! > tenth) {
    w.rushBolt[i]!--;
    bolts++;
  }
  return bolts * n * RELIC_FX.thunder * w.eHpMax[i]!;
}

/** 护身符：这一关第一次挨致命伤留 1 血（返回 true = 挡下了） */
export function rushCharm(w: World): boolean {
  if (w.hp > 0 || w.rushCharm || relicN(w, 'charm') === 0) return false;
  w.rushCharm = true;
  w.hp = 1;
  return true;
}

/** 夜行衣：挨打后的无敌拍数倍数 */
export function rushInvulnMul(w: World): number {
  return 1 + RELIC_FX.cloak * relicN(w, 'cloak');
}
