/** 斗地主的出牌动画、炸弹特效、春天封印、明牌、座位戴帽和电脑说话（从 DdzScene.ts 拆出，只搬家；函数接收场景实例）。 */
import type Phaser from 'phaser';
import { isBombish, sortDdz, type DdzEvent, type DdzPlay } from '../../variants/doudizhu/index.ts';
import { audio } from '../common/audio.ts';
import { dur, wait } from '../common/anim.ts';
import { PACE } from '../common/pace.ts';
import { DDZ_ME } from './session.ts';
import { ddzPlayLabel } from './view.ts';
import { seatName, seatPerson } from '../common/labels.ts';
import { lineFor, type Situation } from '../personas.ts';
import { COLOR, TYPE } from '../common/theme.ts';
import { CardView } from '../table/card.ts';
import { banner, bigWord, bombClash, bombStrike, burst, flash, rays, shake, springBloom } from '../table/fx.ts';
import { text, worldW } from '../ui/kit.ts';
import type { DdzScene } from '../scenes/DdzScene.ts';
import { BOMB_RAYS_Y, BOMB_SMOKE, DDZ_BOMB_TAIL_MS, DEAL_ORIGIN_Y, KING_BOMB, LANDLORD_HAT, OPEN_HAND, SPRING_SEAL } from '../table/layout.ts';

export async function playEvent(sc: DdzScene, e: DdzEvent): Promise<void> {
  const W = worldW(sc);
  switch (e.type) {
    case 'deal': {
      sc.cancelBot();
      if (e.dealNo === 1 && e.redeal === 0) sc.lastSettleSeen = false;
      await sc.trick.clearAll();
      sc.trick.forget();
      sc.placeHat(-1);
      sc.drawOpenHands();
      for (const s of sc.seats) s.setCount(17, false);
      sc.hand.setHand([], 0, { animate: false });
      sc.buildTopBar(W);
      audio.sfx('deal');
      const v = sc.ses.view();
      await bigWord(sc, e.redeal > 0 ? '重新发牌' : `第 ${e.dealNo} 副`, { sub: `共 ${v.deals} 副 · ${seatName(e.firstBidder)} 先叫`, size: TYPE.huge, hold: PACE.dealTitle });
      sc.hand.setHand(v.hand, 0, { animate: false });
      sc.dealToOthers(W / 2, DEAL_ORIGIN_Y);
      await sc.hand.dealIn(W / 2, DEAL_ORIGIN_Y);
      if (sc.wantsTutorial()) await sc.startTutorial();
      break;
    }
    case 'bid': {
      sc.fxLog.push(`叫${e.bid}`);
      audio.sfx(e.bid === 0 ? 'pass' : 'click');
      sc.seats[e.seat]!.say(e.bid === 0 ? '不叫' : `${e.bid} 分`, 1400, e.bid === 3 ? 'spicy' : 'plain');
      if (e.bid === 3) sc.talk(e.seat, 'grab', true);
      else if (e.bid === 0) sc.talk(e.seat, 'noBid');
      sc.buildTopBar(W);
      await wait(sc, PACE.ddz.bid);
      break;
    }
    case 'redeal':
      sc.fxLog.push('重发');
      await banner(sc, '都不叫，重新发牌');
      break;
    case 'landlord': {
      sc.fxLog.push(`地主${e.seat}`);
      audio.sfx('gong');
      sc.placeHat(e.seat);
      sc.buildTopBar(W);
      sc.seats[e.seat]!.setCount(20, false);
      sc.talk(e.seat, 'landlord', true);
      await banner(sc, sc.isMe(e.seat) ? `你当地主 · ${e.bid} 分` : `${seatName(e.seat)} 当地主 · ${e.bid} 分`);
      if (sc.isMe(e.seat)) {
        // 底牌从顶栏飞进我的手牌
        const v = sc.ses.view();
        sc.hand.setHand(v.hand, 0, { animate: true, from: { x: W / 2, y: 28 } });
        sc.hand.setSelected(e.bottom);
        await wait(sc, PACE.ddz.bottom);
        sc.hand.setSelected([]);
      }
      break;
    }
    case 'show': {
      sc.fxLog.push(e.open ? '明牌' : '不明牌');
      if (!e.open) {
        sc.seats[e.seat]!.say('不明牌', 1200, 'plain');
        await wait(sc, PACE.ddz.bid);
        break;
      }
      audio.sfx('gong');
      sc.buildTopBar(W);
      sc.drawOpenHands();
      sc.talk(e.seat, 'grab', true);
      await bigWord(sc, '明牌', { sub: sc.isMe(e.seat) ? '你的牌亮给两家看了 · 这副 ×2' : `${seatName(e.seat)} 亮牌 · 这副 ×2`, size: TYPE.huge, hold: PACE.dealTitle });
      break;
    }
    case 'play':
      await sc.animatePlay(e.seat, e.play, e.left);
      break;
    case 'pass':
      audio.sfx('pass');
      sc.trick.showPass(e.seat);
          if (Math.random() < 0.25) sc.talk(e.seat, 'pass');
      await wait(sc, PACE.pass);
      break;
    case 'newTrick':
      await wait(sc, PACE.trick.hold);
      audio.sfx('collect');
      await sc.trick.clearAll();
      break;
    case 'dealEnd': {
      const r = e.result;
      sc.showUnlocked();
      if (r.spring && !sc.puzzle) {
        sc.fxLog.push(r.spring === 'spring' ? '春天' : '反春');
        audio.sfx('spring');
        await springBloom(sc, r.spring === 'anti');
      }
      const winners = [0, 1, 2].filter((s) => r.delta[s]! > 0);
      for (const s of winners) sc.talk(s, r.spring ? 'spring' : 'win', !!r.spring);
      for (const s of [0, 1, 2].filter((x) => r.delta[x]! < 0)) sc.talk(s, 'lose');
      await wait(sc, PACE.dealEnd);
      break;
    }
    case 'gameOver':
      sc.showUnlocked();
      break;
  }
}

export async function animatePlay(sc: DdzScene, seat: number, play: DdzPlay, left: number): Promise<void> {
  const from = sc.seats[seat]!.center;
  const views = sc.isMe(seat) ? sc.hand.take(play.cards) : null;
  sc.drawOpenHands();
  const bomb = isBombish(play);
  const big = !bomb && play.cards.length >= 5;
  const p = sc.trick.showPlay(seat, play, views, from);
  audio.sfx(bomb ? (play.type === 'rocket' ? 'jokerBomb' : 'bomb') : big ? 'playBig' : 'play', { pitch: bomb ? 0 : (Math.random() - 0.5) * 2.4 });
  sc.seats[seat]!.setCount(left, false);
  await p;
  if (bomb) await sc.bombFx(seat, play);
  else if (seat !== DDZ_ME && !sc.net && Math.random() < 0.3) sc.talk(seat, sc.ses.view().trick.length > 1 ? 'beat' : 'lead');
  // 报牌：剩 2 张、1 张时（斗地主的"报双""报单"）
  if (left > 0 && left <= 2) {
    sc.seats[seat]!.callCount(left);
    audio.sfx('call', { pitch: left === 1 ? 4 : 0 });
    if (seat !== DDZ_ME) sc.talk(seat, 'fewCards', true);
    audio.music('tense');
  }
  sc.refreshTopBar();
}

export async function bombFx(sc: DdzScene, seat: number, play: DdzPlay): Promise<void> {
  const W = worldW(sc);
  const a = sc.seats[seat]!.a;
  const rocket = play.type === 'rocket';
  sc.fxLog.push(ddzPlayLabel(play));
  sc.seats[seat]!.setMood('smug', 2600);
  sc.talk(seat, rocket ? 'jokerBomb' : 'bomb', true);
  // 大字期间桌上不留"不要"气泡；牌落桌的撞击和大字同时播，不加总时长
  sc.trick.quietPasses(true);
  const tgt = sc.trick.strikeTarget(seat);
  const strike = bombStrike(sc, tgt, tgt.cards, rocket ? 4 : 2);
  // 炸弹压炸弹（不洗牌里常见）：落桌点补一下对撞，大字下面写一行
  const over = sc.trick.beaten();
  const clash = over !== null && isBombish(over);
  if (clash) bombClash(sc, tgt);
  const sub = clash ? (rocket ? '王炸压炸弹！' : '炸弹压炸弹！') : undefined;
  try {
    if (rocket) {
      flash(sc, 0xffe7a0, KING_BOMB.flashAlpha);
      rays(sc, W / 2, BOMB_RAYS_Y);
      shake(sc, KING_BOMB.shakeMs, KING_BOMB.shakeAmp);
      burst(sc, a.px, a.py, 'spark', KING_BOMB.sparks, { speed: KING_BOMB.sparkSpeed, life: KING_BOMB.sparkLifeMs });
      await Promise.all([strike, bigWord(sc, '王炸！', { size: KING_BOMB.wordSize, color: COLOR.goldLight, stroke: COLOR.redDark, hold: PACE.ddz.rocket, depth: 190, sub })]);
    } else {
      flash(sc, 0xffffff, 0.45);
      shake(sc, 380, 0.012);
      burst(sc, a.px, a.py, 'spark', 40, { speed: [160, 540] });
      burst(sc, a.px, a.py, 'smoke', BOMB_SMOKE.count, { speed: BOMB_SMOKE.speed, life: BOMB_SMOKE.lifeMs, gravity: BOMB_SMOKE.gravity, scale: BOMB_SMOKE.scale });
      await Promise.all([strike, bigWord(sc, '炸弹', { size: 76, color: 0xfff0c8, stroke: COLOR.red, hold: PACE.ddz.bomb, depth: 190, sub })]);
    }
  } finally {
    sc.trick.quietPasses(false);
  }
  await wait(sc, DDZ_BOMB_TAIL_MS);
  // 倍数翻了：顶栏马上跟着变
  sc.refreshTopBar();
}

/** 结算面板右上角的"春天 / 反春"印章：红框圆章盖下来（春天朱红，反春靛蓝），和一行字区分开 */
export function springSeal(sc: DdzScene, body: Phaser.GameObjects.Container, anti: boolean): void {
  const col = anti ? COLOR.teamThem : COLOR.red;
  const seal = sc.add.container(SPRING_SEAL.x, SPRING_SEAL.y);
  const g = sc.add.graphics();
  g.fillStyle(0xfff3d6, 0.96).fillCircle(0, 0, SPRING_SEAL.r);
  g.lineStyle(5, col, 1).strokeCircle(0, 0, SPRING_SEAL.ringR);
  g.lineStyle(2, col, 0.85).strokeCircle(0, 0, SPRING_SEAL.innerR);
  const t = text(sc, 0, 0, anti ? '反春' : '春天', { size: SPRING_SEAL.size, bold: true, font: 'title', color: col });
  seal.add([g, t]).setAngle(-12);
  body.add(seal);
  if (dur(1) === 0) return;
  seal.setScale(SPRING_SEAL.startScale).setAlpha(0);
  audio.sfx('stamp');
  sc.tweens.add({ targets: seal, scale: 1, alpha: 1, duration: dur(SPRING_SEAL.ms), delay: dur(SPRING_SEAL.delayMs), ease: 'Back.easeIn' });
}

/** 好友房刚轮到我：后台时标题闪，前台时手机振一下；不轮到我了就停闪 */
export function talk(sc: DdzScene, seat: number, sit: Situation, force = false): void {
  // 联机时电脑的嘴在房间里（互动），不在本地随机冒话
  if (seat === DDZ_ME || sc.net || sc.puzzle) return;
  if (!force && Math.random() > 0.45) return;
  const line = lineFor(seatPerson(seat), sit);
  if (line) sc.seats[seat]!.say(line);
}

/** 地主帽：一块红底金字的"地主"挂在地主头像上沿 */
export function placeHat(sc: DdzScene, seat: number): void {
  sc.hat?.destroy();
  sc.hat = null;
  if (seat < 0) return;
  const a = sc.seats[seat]!.a;
  const c = sc.add.container(a.ax, a.ay - a.size / 2 - LANDLORD_HAT.gap).setDepth(LANDLORD_HAT.depth);
  const t = text(sc, 0, 0, '地主', { size: TYPE.small, bold: true, color: COLOR.goldLight, font: 'title' });
  const g = sc.add.graphics();
  g.fillStyle(COLOR.redDark, 0.95).fillRoundedRect(-t.width / 2 - LANDLORD_HAT.padX / 2, -LANDLORD_HAT.halfH, t.width + LANDLORD_HAT.padX, LANDLORD_HAT.h, LANDLORD_HAT.halfH);
  g.lineStyle(2, COLOR.gold, 1).strokeRoundedRect(-t.width / 2 - LANDLORD_HAT.padX / 2, -LANDLORD_HAT.halfH, t.width + LANDLORD_HAT.padX, LANDLORD_HAT.h, LANDLORD_HAT.halfH);
  c.add([g, t]);
  sc.hat = c;
}

/** 摊开的手牌：残局里两家农民（座位 1 在右、2 在左），明牌局里明了牌的地主。每次出牌、刷新时重画 */
export function drawOpenHands(sc: DdzScene): void {
  const pz = sc.puzzle;
  const open = new Map<number, readonly number[]>();
  if (pz) for (const seat of [1, 2]) open.set(seat, pz.hand(seat));
  else {
    const v = sc.ses.view();
    if (v.mingHand && v.landlord >= 0 && !sc.isMe(v.landlord)) open.set(v.landlord, v.mingHand);
  }
  for (const seat of [1, 2]) {
    sc.openHands[seat]?.destroy();
    sc.openHands[seat] = null;
    const hand = open.get(seat);
    if (!hand) continue;
    const a = sc.seats[seat]!.a;
    const cards = sortDdz([...hand]);
    const cw = OPEN_HAND.cardW;
    // 一排摊开，最长 400（地主明牌最多 20 张时挤一点，角标仍露得出）；排两排会压到这家出的牌和名牌
    const step = cards.length > 1 ? Math.min(OPEN_HAND.stepMax, (OPEN_HAND.lenMax - cw) / (cards.length - 1)) : OPEN_HAND.stepMax;
    const len = cw + Math.max(0, cards.length - 1) * step;
    // 右家的牌排右端对齐头像外沿，左家左端对齐头像外沿
    // 左家的牌排不往左伸到我的头像和"地主"牌子上（那一块 x 到 110 左右，y 从 339 起）；有"互动"按钮时（残局没有）再让开它
    const fun = pz ? null : sc.funBox();
    const leftMin = fun ? Math.max(OPEN_HAND.leftMin, fun.left + fun.bw + 8) : OPEN_HAND.leftMin;
    const left = seat === 1 ? a.ax + a.size / 2 - len : Math.max(a.ax - a.size / 2, leftMin);
    const c = sc.add.container(0, 0).setDepth(OPEN_HAND.depth);
    cards.forEach((card, i) => c.add(new CardView(sc, left + cw / 2 + i * step, a.ay + OPEN_HAND.dy, card, 0, cw)));
    sc.openHands[seat] = c;
  }
}
