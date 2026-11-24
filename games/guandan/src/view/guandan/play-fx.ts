/** 出牌动画和特效、进贡飞牌、上一轮回看、电脑说话（从 TableScene.ts 拆出，只搬家；函数接收场景实例）。 */
import { endLevelOf, isBomb, partnerOf, teamOf, type Card, type GameEvent, type Play } from '../../variants/guandan/core/index.ts';
import type { Mood } from '../art/index.ts';
import { app } from '../app.ts';
import { audio } from '../common/audio.ts';
import { dur, tweenP, wait } from '../common/anim.ts';
import { PACE } from '../common/pace.ts';
import { PLACE_NAMES, seatIdentity, seatName, seatPerson } from '../common/labels.ts';
import { levelName, playLabel } from './labels.ts';
import { lineFor, talkChance, type Situation } from '../personas.ts';
import { ME } from './session.ts';
import { stopFlash, vibrate } from '../common/attention.ts';
import { suggestFor } from './suggest.ts';
import { emptyMatchLog } from '../../variants/guandan/stake/titles.ts';
import { tutorialDone } from '../store.ts';
import { COLOR, TYPE } from '../common/theme.ts';
import { Button, modal, text, worldW } from '../ui/kit.ts';
import { toast } from '../ui/bubble.ts';
import { CardView } from '../table/card.ts';
import { banner, bigWord, bombClash, bombStrike, burst, flash, rays, shake } from '../table/fx.ts';
import { dealMoment, momentOf } from '../../variants/guandan/net/fun-moments.ts';
import { bombDrama, bombOnBomb } from './highlights.ts';
import { BOMB_ON_BOMB_TOAST_Y, BOMB_RAYS_Y, BOMB_SMOKE, DEAL_ORIGIN_Y, KING_BOMB, PREV_TRICK, TRIBUTE_FLY } from '../table/layout.ts';
import { startHintGuide } from './table-ui.ts';
import type { TableScene } from '../scenes/TableScene.ts';

export async function playEvent(sc: TableScene, e: GameEvent): Promise<void> {
  const W = worldW(sc);
  switch (e.type) {
    case 'dealStart': {
      sc.cancelBot();
      sc.dealJiefeng = 0;
      if (e.dealNo === 1) {
        sc.matchLog = emptyMatchLog();
        sc.loggedDeal = 0;
        sc.feedPosted = [];
      }
      await sc.trick.clearAll();
      sc.trick.forget();
      for (const s of sc.seats) {
        void s.setPlace(null, false);
        s.setCount(27, false);
      }
      sc.hand.setHand([], e.level, { animate: false });
      sc.buildTopBar(W);
      audio.sfx('deal');
      const end = endLevelOf(sc.ses.view());
      const goal = end < 14 ? ` · 短局，升到 ${levelName(end)} 就赢` : e.level === 14 ? ' · 过 A 就赢' : '';
      await bigWord(sc, `第 ${e.dealNo} 副`, { sub: `打 ${levelName(e.level)}${goal}`, size: TYPE.huge, hold: PACE.dealTitle });
      const v = sc.ses.view();
      sc.hand.setHand(v.hand, v.level, { animate: false });
      sc.dealToOthers(W / 2, DEAL_ORIGIN_Y);
      await sc.hand.dealIn(W / 2, DEAL_ORIGIN_Y);
      sc.dealTalk(e.dealNo);
      if (!tutorialDone() && !sc.dailyRun && !sc.ses.autoplay && !sc.ses.online && app.params?.seed === null) {
        // 第一次玩：发完牌后出新手引导（URL 调试开局不弹）
        await sc.startTutorialAsync();
        startHintGuide(sc);
      }
      break;
    }
    case 'antiTribute': {
      audio.sfx('jokerBomb');
      sc.fxLog.push('抗贡');
      // 下面那行说明正好落在"等谁出牌"的提示条上：大字播完前先把提示条藏起来
      sc.status.setAlpha(0);
      sc.statusBg.setAlpha(0);
      await bigWord(sc, '抗贡！', { sub: `${e.seats.map(seatName).join('、')} 有两张大王，不用进贡`, color: COLOR.goldLight });
      sc.status.setAlpha(1);
      sc.statusBg.setAlpha(1);
      e.seats.forEach((s) => sc.mood(s, 'smug'));
      break;
    }
    case 'tributeAsked': {
      sc.fxLog.push('进贡');
      await banner(sc, e.payers.length === 2 ? '双下！两人都要进贡' : `${seatName(e.payers[0]!)} 要进贡`);
      e.payers.forEach((s) => sc.mood(s, 'sad', 3000));
      break;
    }
    case 'tribute':
      await sc.flyTribute(e.from, e.to, e.card, '进贡');
      sc.talk(e.from, 'tribute');
      sc.talk(e.to, 'getTribute');
      break;
    case 'returnCard':
      await sc.flyTribute(e.from, e.to, e.card, '还贡');
      break;
    case 'lead':
      break;
    case 'turn':
      for (let s = 0; s < 4; s++) sc.seats[s]!.setTurn(s === e.seat);
      if (sc.isMe(e.seat) && !sc.ses.autoplay) {
        audio.sfx('turn');
        // 单机也振一下（好友房在收到房间消息时就振了，见 noticeNetTurn）
        if (!sc.net) vibrate();
      }
      if (e.seat !== ME && !sc.net) stopFlash();
      break;
    case 'play': {
      const victim = sc.trick.topSeat();
      // 名场面：炸上炸（出牌记录里这一手已经在最后了）
      const hist = sc.ses.view().history;
      const bob = bombOnBomb(hist.slice(0, -1), e.seat, e.play);
      await sc.animatePlay(e.seat, e.play, e.left);
      if (bob) {
        sc.fxLog.push('名场面 炸上炸');
        toast(sc, `名场面！${seatName(e.seat)} 炸上炸`, worldW(sc) / 2, BOMB_ON_BOMB_TOAST_Y, COLOR.goldLight);
      }
      sc.nudges?.suggest(suggestFor(e, victim));
      sc.funMoment(momentOf(e, victim, sc.ses.view().dealNo));
      break;
    }
    case 'pass':
      sc.trick.showPass(e.seat);
      audio.sfx('pass');
      sc.talk(e.seat, 'pass');
      await wait(sc, PACE.pass);
      break;
    case 'trickWon': {
      // 一墩打完：停一下让人看清是谁的牌收了这一墩，再清桌（每墩都要等的：0.25.0 从 950 缩到 650，0.31.0 再到 350）
      await wait(sc, PACE.trick.hold);
      audio.sfx('collect');
      await sc.trick.clearAll();
      if (e.jiefeng) {
        sc.dealJiefeng++;
        audio.sfx('jiefeng');
        sc.fxLog.push('接风');
        const a = sc.seats[e.leader]!.a;
        sc.talk(e.leader, 'jiefeng', true);
        await bigWord(sc, '接风', { size: TYPE.huge - 8, y: a.ay, color: COLOR.goldLight, hold: PACE.jiefeng });
      }
      break;
    }
    case 'finish': {
      sc.fxLog.push(PLACE_NAMES[e.place - 1]!);
      sc.seats[e.seat]!.setCount(0, true);
      // 头游：座位上的印章放大后落下（≤ 1 秒，不用横幅挡桌心）；我头游再加桌心的大字，两件事同时播
      const words: Promise<void>[] = [];
      if (e.place === 1) {
        const a = sc.seats[e.seat]!.a;
        burst(sc, a.ax, a.ay, 'star', 26, { gravity: 120 });
        sc.mood(e.seat, 'happy', 4000);
        sc.talk(e.seat, 'first', true);
        if (sc.isMe(e.seat)) words.push(bigWord(sc, '头游！', { color: COLOR.goldLight, hold: PACE.first }));
        else sc.talk(partnerOf(e.seat), 'partnerFirst');
      }
      // 末游的电脑嘟囔一句（双下时两个人都说也不奇怪）
      if (e.place === 4) sc.talk(e.seat, 'last');
      await Promise.all([...words, sc.seats[e.seat]!.setPlace(e.place, true)]);
      sc.nudges?.suggest(suggestFor(e, -1));
      sc.funMoment(momentOf(e, -1, sc.ses.view().dealNo));
      break;
    }
    case 'dealEnd':
      sc.showUnlocked(true);
      sc.funMoment(dealMoment(e.result));
      sc.feedDeal(e.result);
      // 最后一手和名次章留在桌上看清楚，再弹结算（1500 → 1100 → 0.31.0 的 500）
      await wait(sc, PACE.dealEnd);
      break;
    case 'gameOver':
      sc.showUnlocked(true);
      break;
  }
}

export async function animatePlay(sc: TableScene, seat: number, play: Play, left: number): Promise<void> {
  const from = sc.seats[seat]!.center;
  const views = sc.isMe(seat) ? sc.hand.take(play.cards) : null;
  const bomb = isBomb(play);
  const big = !bomb && (play.type === 'plate' || play.type === 'tube' || play.cards.length >= 5);
  const p = sc.trick.showPlay(seat, play, views, from);
  // 出牌声每手音高略浮动，四家连着出不会像同一个声音敲四下；同花顺比普通炸弹高一点
  audio.sfx(bomb ? (play.type === 'jokerBomb' ? 'jokerBomb' : 'bomb') : big ? 'playBig' : 'play', {
    pitch: play.type === 'straightFlush' ? 3 : bomb ? 0 : (Math.random() - 0.5) * 2.4,
  });
  sc.seats[seat]!.setCount(left, left === 0);
  await p;
  if (bomb) await sc.bombFx(seat, play);
  else if (!sc.isMe(seat)) {
    const last = sc.ses.view().history;
    // 压过别人时才说"压一手"之类；领出时偶尔说一句
    const prev = last.length >= 2 ? last[last.length - 2] : null;
    sc.talk(seat, prev?.play ? 'beat' : 'lead');
  }
  // 报牌：别家的张数刚跨过 10 张、3 张时弹一下
  const before = left + play.cards.length;
  if (!sc.isMe(seat) && left > 0 && ((before > 10 && left <= 10) || (before > 3 && left <= 3))) {
    sc.seats[seat]!.callCount(left);
    audio.sfx('call', { pitch: left <= 3 ? 4 : 0 });
  }
  if (left > 0 && left <= 6 && !sc.isMe(seat)) {
    if (left <= 3) sc.talk(seat, 'fewCards');
    audio.music('tense');
  }
}

export async function bombFx(sc: TableScene, seat: number, play: Play): Promise<void> {
  const W = worldW(sc);
  const a = sc.seats[seat]!.a;
  const king = play.type === 'jokerBomb';
  const label = playLabel(play);
  sc.fxLog.push(label);
  // 老张炸得开心，别人炸得得意
  sc.mood(seat, seatPerson(seat) === 'laozhang' ? 'happy' : 'smug', 2600);
  // 被炸的人（上一手的主人）郁闷一下
  const hist = sc.ses.view().history;
  for (let i = hist.length - 2; i >= 0; i--) {
    const h = hist[i]!;
    if (h.play) {
      if (teamOf(h.seat) !== teamOf(seat)) {
        sc.mood(h.seat, 'sad', 2400);
        sc.talk(h.seat, 'bombed');
      }
      break;
    }
  }
  sc.talk(seat, king ? 'jokerBomb' : 'bomb', seatPerson(seat) === 'laozhang' || king);
  // 大字期间桌上不留"不要"气泡（深度比大字高，会压在字中间）；牌落桌的撞击和大字同时播，不加总时长
  sc.trick.quietPasses(true);
  const tier = king ? 4 : bombDrama(play);
  const tgt = sc.trick.strikeTarget(seat);
  const strike = bombStrike(sc, tgt, tgt.cards, tier);
  // 炸弹压炸弹：落桌点补一下对撞，大字下面写一行
  const over = sc.trick.beaten();
  const clash = over !== null && isBomb(over);
  if (clash) bombClash(sc, tgt);
  const sub = clash ? (king ? '天王炸压炸弹！' : '炸弹压炸弹！') : undefined;
  try {
    if (king) {
      flash(sc, 0xffe7a0, KING_BOMB.flashAlpha);
      rays(sc, W / 2, BOMB_RAYS_Y);
      shake(sc, KING_BOMB.shakeMs, KING_BOMB.shakeAmp);
      burst(sc, a.px, a.py, 'spark', KING_BOMB.sparks, { speed: KING_BOMB.sparkSpeed, life: KING_BOMB.sparkLifeMs });
      burst(sc, W / 2, BOMB_RAYS_Y, 'coin', 30, { speed: [200, 520], life: 1400, gravity: 500 });
      await Promise.all([strike, bigWord(sc, '天王炸！', { size: KING_BOMB.wordSize, color: COLOR.goldLight, stroke: COLOR.redDark, hold: PACE.jokerBomb, depth: 190, sub })]);
    } else {
      // 三档（bombDrama）：四炸、五六炸、同花顺和七炸以上；越大闪得越亮、震得越久，三档加光圈和纸屑
      flash(sc, 0xffffff, [0.35, 0.5, 0.65][tier - 1]!);
      shake(sc, [300, 420, 560][tier - 1]!, [0.008, 0.013, 0.018][tier - 1]!);
      burst(sc, a.px, a.py, 'spark', [28, 44, 64][tier - 1]!, { speed: [160, 480 + tier * 60] });
      burst(sc, a.px, a.py, 'smoke', BOMB_SMOKE.count, { speed: BOMB_SMOKE.speed, life: BOMB_SMOKE.lifeMs, gravity: BOMB_SMOKE.gravity, scale: BOMB_SMOKE.scale });
      if (tier === 3) {
        rays(sc, a.px, a.py, 0xffb040);
        burst(sc, a.px, a.py, 'confetti', 36, { speed: [220, 560], life: 1400, gravity: 420 });
      }
      // 垫在出牌下面（出牌区 depth 200+）：大字一闪，刚炸出来的牌不被挡住
      await Promise.all([strike, bigWord(sc, label, { size: [68, 80, 92][tier - 1]!, color: 0xfff0c8, stroke: COLOR.red, hold: PACE.bomb(tier), depth: 190, sub })]);
    }
  } finally {
    sc.trick.quietPasses(false);
  }
}

/** 贡牌飞过去（别人之间的还贡只看到牌背）。 */
export async function flyTribute(sc: TableScene, from: number, to: number, card: Card | null, label: string): Promise<void> {
  audio.sfx('tribute');
  sc.fxLog.push(label);
  const a = sc.seats[from]!.center;
  const b = sc.seats[to]!.center;
  let v: CardView;
  if (sc.isMe(from) && card !== null) {
    v = sc.hand.take([card])[0] ?? new CardView(sc, a.x, a.y, card, sc.ses.view().level);
  } else {
    v = new CardView(sc, a.x, a.y, card ?? 0, sc.ses.view().level, TRIBUTE_FLY.backW, card !== null);
    v.setScale(TRIBUTE_FLY.backScale);
  }
  v.setDepth(TRIBUTE_FLY.depth);
  const mid = { x: worldW(sc) / 2, y: TRIBUTE_FLY.midY };
  // 字下垫一块深色半透明底：桌布花纹深浅不一，光靠描边在淡入时看不清（docs/ui.md 第 4 节）
  const word = text(sc, 0, 0, `${seatName(from)} ${label}给 ${seatName(to)}`, { size: TYPE.body, bold: true, color: COLOR.goldLight, stroke: 0x2b1d14, strokeWidth: 4 });
  const pw = word.width + TRIBUTE_FLY.tagPadX * 2;
  const ph = word.height + TRIBUTE_FLY.tagPadY * 2;
  const plate = sc.add.graphics().fillStyle(0x1a0c06, TRIBUTE_FLY.tagBgAlpha).fillRoundedRect(-pw / 2, -ph / 2, pw, ph, ph / 2);
  const tag = sc.add.container(mid.x, mid.y - TRIBUTE_FLY.tagDy, [plate, word]).setDepth(TRIBUTE_FLY.depth + 1).setAlpha(0);
  // 字和牌一起出来：等牌落定再淡入的话，慢机器上牌停在桌心时字还是半透明的（慢机器的截图上截到过这一下）
  sc.tweens.add({ targets: tag, alpha: 1, duration: dur(TRIBUTE_FLY.tagInMs) });
  await tweenP(sc, { targets: v, x: mid.x, y: mid.y, scale: TRIBUTE_FLY.midScale, angle: 0, duration: PACE.tribute.in, ease: 'Cubic.easeOut' });
  // 贡的是哪张、谁给谁：在桌子中间停够一秒多看清
  await wait(sc, PACE.tribute.hold);
  sc.tweens.add({ targets: tag, alpha: 0, duration: dur(TRIBUTE_FLY.tagOutMs), onComplete: () => tag.destroy() });
  await tweenP(sc, { targets: v, x: b.x, y: b.y, scale: TRIBUTE_FLY.endScale, alpha: TRIBUTE_FLY.endAlpha, duration: PACE.tribute.out, ease: 'Cubic.easeIn' });
  v.destroy();
  if (sc.isMe(to)) {
    const view = sc.ses.view();
    sc.hand.setHand(view.hand, view.level, { animate: true, from: b });
  }
}

/** 回看上一墩：按出牌顺序一行一个人（记牌、想想对面还剩什么，是"在博弈"的一部分）。电脑等看完再出。 */
export function showPrevTrick(sc: TableScene): void {
  const list = sc.trick.prev;
  if (list.length === 0 || sc.overlay !== null) return;
  const rowH = Math.min(PREV_TRICK.rowMax, Math.floor(PREV_TRICK.rowsMaxH / list.length));
  const cw = Math.min(PREV_TRICK.cardMaxW, Math.floor((rowH - PREV_TRICK.rowPad) / PREV_TRICK.cardAspect));
  const h = PREV_TRICK.chromeH + rowH * list.length;
  const m = modal(sc, PREV_TRICK.modalW, h, '上一轮', { onClose: () => sc.closeOverlay() });
  const ok = new Button(sc, 0, h / 2 - PREV_TRICK.okDy, PREV_TRICK.okW, PREV_TRICK.okH, '看好了', 'red', () => m.close());
  m.body.add(ok);
  m.body.setData('ok', ok);
  const level = sc.ses.view().level;
  list.forEach((r, i) => {
    const y = -h / 2 + PREV_TRICK.firstRowDy + rowH * i + rowH / 2;
    m.body.add(text(sc, PREV_TRICK.nameX, y, seatName(r.seat), { size: TYPE.body, bold: true, ox: 0, color: teamOf(r.seat) === 0 ? COLOR.teamUs : COLOR.teamThem }));
    if (!r.play) {
      m.body.add(text(sc, PREV_TRICK.cardX, y, '不要', { size: TYPE.body, bold: true, ox: 0, color: COLOR.muted }));
      return;
    }
    r.play.cards.forEach((card, j) => m.body.add(new CardView(sc, PREV_TRICK.cardX + cw / 2 + j * Math.round(cw * PREV_TRICK.overlap), y, card, level, cw)));
    const last = i === list.length - 1 || list.slice(i + 1).every((x) => !x.play);
    const bomb = isBomb(r.play);
    m.body.add(text(sc, PREV_TRICK.labelX, y, last ? `${playLabel(r.play)} · 收了` : playLabel(r.play), { size: TYPE.small, bold: true, ox: 1, color: bomb ? COLOR.red : last ? COLOR.redDark : COLOR.ink }));
  });
  sc.openOverlay('menu', m);
}

export function restoreTrick(sc: TableScene): void {
  const v = sc.ses.view();
  v.finished.forEach((s, i) => void sc.seats[s]!.setPlace(i + 1, false));
  if (v.phase !== 'play') return;
  const last = v.trick.last;
  if (last) sc.trick.restore(last.seat, last.play);
  v.trick.passed.forEach((p, s) => {
    if (p) sc.trick.restore(s, null);
  });
}

export function talk(sc: TableScene, seat: number, sit: Situation, force = false): void {
  // 联机的真人自己说话，不替他编台词
  if (seat === ME || seatIdentity[seat]?.human) return;
  const id = seatPerson(seat);
  const style = sc.ses.botStyle(seat);
  if (!force && Math.random() > talkChance(id, style?.form ?? 0, style?.tilt ?? 0)) return;
  const line = lineFor(id, sit);
  if (line) sc.seats[seat]!.say(line);
}

/** 一副开始时电脑说的话：第一副看状态（手热、手冷），之后看局面（上一副输了上头、级数差得多） */
export function dealTalk(sc: TableScene, dealNo: number): void {
  for (let s = 1; s < 4; s++) {
    const style = sc.ses.botStyle(s);
    if (dealNo === 1) {
      sc.talk(s, style && style.form > 0.25 ? 'hot' : style && style.form < -0.25 ? 'cold' : 'start');
      continue;
    }
    if (!style) continue;
    const v = sc.ses.view();
    const mine = teamOf(s);
    const lead = v.levels[mine]! - v.levels[1 - mine]!;
    if (style.tilt >= 0.5) sc.talk(s, 'tilt');
    else if (lead <= -3) sc.talk(s, 'behind');
    else if (lead >= 3) sc.talk(s, 'ahead');
  }
}

export function mood(sc: TableScene, seat: number, m: Mood, ms = 2200): void {
  sc.seats[seat]?.setMood(m, ms);
}
