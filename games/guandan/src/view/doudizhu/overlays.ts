/** 斗地主的残局结果、每日通关、结算、整局结束和实盘结果弹窗（从 DdzScene.ts 拆出，只搬家；函数接收场景实例）。 */
import type Phaser from 'phaser';
import { sortDdz, type DdzResult } from '../../variants/doudizhu/index.ts';
import { app } from '../app.ts';
import { audio } from '../common/audio.ts';
import { dur } from '../common/anim.ts';
import { NOTICE_MS } from '../common/pace.ts';
import { backToPicker } from '../table/again.ts';
import { DDZ_ME, DdzSession, ddzFunOpts } from './session.ts';
import { DailyPuzzleSession, puzzleAfter, puzzlesDone } from './puzzle.ts';
import { clockText, dailyPuzzleCard, prepareResult } from '../common/share-card.ts';
import { DDZ_PUZZLES } from '../../variants/doudizhu/puzzles/puzzles.ts';
import { DdzStakeSession, buyinDdzStake, ddzStakeRules, settleDdzStake } from './stake.ts';
import { STAKE_ERROR, STAKE_TEXT, TIER_NAME, fmtChips, signed, stakeError } from '../common/stake-text.ts';
import { pointValue as ddzPointValue } from '../../variants/doudizhu/stake/index.ts';
import { tableRules, type DdzStakeView } from '../../variants/doudizhu/net/stake.ts';
import { dailySubmitText, ddzDailySeed, submitDdzDaily } from './daily.ts';
import { randomSeed } from '../common/seed.ts';
import { seatName, seatPerson } from '../common/labels.ts';
import { cardKey, texOr } from '../common/textures.ts';
import { COLOR, TYPE, signColor } from '../common/theme.ts';
import { burst } from '../table/fx.ts';
import { Button, fitWidth, modal, signedLine, text, worldW } from '../ui/kit.ts';
import type { DdzScene } from '../scenes/DdzScene.ts';

/** 过关 / 失败的弹窗；标题字体字表里没有"关、农、民、跑"，所以大字用正文字体，不开 modal 标题 */
export function showPuzzleResult(sc: DdzScene, r: DdzResult): void {
  const pz = sc.puzzle!;
  const p = pz.puzzle;
  const won = r.landlordWon;
  const after = puzzleAfter(p);
  const n = DDZ_PUZZLES.findIndex((x) => x.id === p.id) + 1;
  if (won && pz instanceof DailyPuzzleSession) return sc.showDailyWin(pz);
  const daily = pz instanceof DailyPuzzleSession;
  const m = modal(sc, 700, 420, undefined, { closeBtn: false });
  sc.openOverlay('settle', m);
  const b = m.body;
  if (won) {
    audio.sfx('win');
    burst(sc, worldW(sc) / 2, 200, 'confetti', 40, { speed: [200, 560], life: 1400, gravity: 420 });
  } else audio.sfx('pass');
  b.add(text(sc, 0, -120, won ? '过关！' : '农民先跑了', { size: TYPE.huge, bold: true, color: won ? COLOR.redDark : COLOR.ink }));
  b.add(text(sc, 0, -52, daily ? `今日残局 · ${p.name}` : `第 ${n} 关 · ${p.name}`, { size: TYPE.body, bold: true, color: COLOR.ink }));
  const left = DDZ_PUZZLES.length - puzzlesDone().size;
  if (!daily) b.add(text(sc, 0, -12, won ? (left === 0 ? `${DDZ_PUZZLES.length} 关全部过完了` : `还剩 ${left} 关`) : '用"提示"看看必胜的出法，再来一次', { size: TYPE.label, color: COLOR.muted, wrap: 600 }));
  const pick = new Button(sc, -160, 120, 240, 64, '选关', 'wood', () => {
    m.close();
    sc.openPicker();
  }, 'cards');
  const primary = won && after
    ? new Button(sc, 160, 120, 240, 64, '下一关', 'red', () => sc.startPuzzleHere(after), 'play')
    : new Button(sc, 160, 120, 240, 64, '重来', 'red', () => sc.restartPuzzle(p), 'restart');
  b.add([pick, primary]);
  sc.reg('puzzle:pick', pick);
  sc.reg(won && after ? 'puzzle:next' : 'puzzle:retry', primary);
}

/**
 * 今日残局过关：“过关！”加用时、分数的数字滚动（用时从 00:00 走到实际，分数从 0 涨到实际），配过关音效和彩带；
 * 交到每日榜（单独部署不交）；“分享”出一张卡。控件：share（分享）、puzzle:pick（选关）、puzzle:retry（再打一次）
 */
export function showDailyWin(sc: DdzScene, pz: DailyPuzzleSession): void {
  const ms = pz.elapsedMs();
  const score = pz.score();
  const m = modal(sc, 700, 510, undefined, { closeBtn: false });
  sc.openOverlay('settle', m);
  const b = m.body;
  audio.sfx('win');
  const cx = worldW(sc) / 2;
  burst(sc, cx, 200, 'confetti', 40, { speed: [200, 560], life: 1400, gravity: 420 });
  burst(sc, cx - 260, 260, 'confetti', 18, { speed: [160, 420], life: 1200, gravity: 420 });
  burst(sc, cx + 260, 260, 'confetti', 18, { speed: [160, 420], life: 1200, gravity: 420 });
  b.add(text(sc, 0, -178, '过关！', { size: TYPE.huge, bold: true, color: COLOR.redDark }));
  b.add(text(sc, 0, -122, `今日残局 · ${pz.puzzle.name}`, { size: TYPE.label, bold: true, color: COLOR.muted }));
  const time = text(sc, 0, -68, '用时 00:00', { size: TYPE.big, bold: true, color: COLOR.ink });
  const pts = text(sc, 0, -6, '0 分', { size: TYPE.big, bold: true, color: COLOR.redDark });
  b.add([time, pts]);
  // 数字滚动：instant（anim=0）时 dur 为 0，直接落在最终值
  const roll = dur(900);
  const show = (k: number): void => {
    if (time.active) time.setText(`用时 ${clockText(ms * k)}`);
    if (pts.active) pts.setText(`${Math.round(score * k)} 分`);
  };
  if (roll <= 0) show(1);
  else sc.tweens.addCounter({ from: 0, to: 1, duration: roll, ease: 'Cubic.easeOut', onUpdate: (tw) => show(tw.getValue() ?? 1), onComplete: () => show(1) });
  b.add(text(sc, 0, 40, `重来 ${pz.tries} 次 · 提示 ${pz.hints} 次`, { size: TYPE.small, color: COLOR.muted }));
  const line = text(sc, 0, 84, '', { size: TYPE.small, bold: true, color: COLOR.ink });
  b.add(line);
  void pz.submit().then((r) => {
    if (line.active) line.setText(dailySubmitText(r, score));
  });
  const card = dailyPuzzleCard({ date: pz.date, name: pz.puzzle.name, ms, score, tries: pz.tries, hints: pz.hints }, null);
  // 卡在结算页一出来就画好；点击里同步调系统分享（iOS 的要求，前面不能有 await）
  const share = new Button(sc, 0, 178, 180, 64, '分享', 'gold', prepareResult(card, null), 'share');
  const pick = new Button(sc, -230, 178, 200, 64, '选关', 'wood', () => {
    m.close();
    sc.openPicker();
  }, 'cards');
  const again = new Button(sc, 230, 178, 200, 64, '再打一次', 'red', () => sc.startDailyHere(), 'restart');
  b.add([pick, share, again]);
  sc.reg('share', share);
  sc.reg('puzzle:pick', pick);
  sc.reg('puzzle:retry', again);
}

/** 头像上沿的一小块身份牌（结算页的地主帽，和牌桌上的地主帽同一个样子） */
function roleTag(sc: DdzScene, x: number, y: number, label: string, bg: number, fg: number): Phaser.GameObjects.Container {
  const t = text(sc, 0, 0, label, { size: TYPE.small, bold: true, color: fg, font: 'title' });
  const w = t.width + 20;
  const g = sc.add.graphics();
  g.fillStyle(bg, 0.95).fillRoundedRect(-w / 2, -14, w, 28, 14);
  g.lineStyle(2, COLOR.gold, 1).strokeRoundedRect(-w / 2, -14, w, 28, 14);
  return sc.add.container(x, y, [g, t]);
}

export function showSettle(sc: DdzScene, r: DdzResult): void {
  if (sc.puzzle) return sc.showPuzzleResult(r);
  const v = sc.ses.view();
  const last = v.phase === 'gameOver';
  const meWon = r.delta[DDZ_ME]! > 0;
  const watch = sc.watching;
  const m = modal(sc, 820, 560, watch ? '这一副结束了' : meWon ? '这副你赢了' : '这副你输了', { closeBtn: false });
  sc.openOverlay('settle', m);
  const b = m.body;
  const W = worldW(sc);
  if (meWon && !watch) {
    audio.sfx('levelUp');
    burst(sc, W / 2, 180, 'petal', 30, { gravity: 200, speed: [120, 360], life: 1600 });
  } else audio.sfx('pass');
  // 左：三家一行一个，和掼蛋结算同一套（底色分边、头像按输赢换表情、地主头像上戴帽），右边这副大字、累计小字
  const order = [r.landlord, ...[0, 1, 2].filter((s) => s !== r.landlord)];
  order.forEach((s, i) => {
    const y = -150 + i * 96;
    const lord = s === r.landlord;
    const d = r.delta[s]!;
    const g = sc.add.graphics();
    g.fillStyle(lord ? 0xf8e0d8 : 0xdde8f4, 1).fillRoundedRect(-378, y - 40, 388, 80, 12);
    if (sc.isMe(s)) g.lineStyle(3, COLOR.gold, 1).strokeRoundedRect(-378, y - 40, 388, 80, 12);
    b.add(g);
    b.add(sc.add.image(-326, y + 4, texOr(sc, `avatar:${seatPerson(s)}:${d > 0 ? 'happy' : 'sad'}`)).setDisplaySize(60, 60));
    if (lord) b.add(roleTag(sc, -326, y - 28, '地主', COLOR.redDark, COLOR.goldLight));
    b.add(text(sc, -284, y - 12, seatName(s), { size: TYPE.body, bold: true, color: COLOR.ink, ox: 0 }));
    b.add(text(sc, -284, y + 20, lord ? '地主' : '农民', { size: TYPE.small, bold: true, color: lord ? COLOR.redDark : COLOR.teamThem, ox: 0 }));
    b.add(text(sc, -6, y - 10, signed(d), { size: TYPE.title, bold: true, font: 'num', color: signColor(d), ox: 1 }));
    b.add(signedLine(sc, -6, y + 22, '累计 {0}', [v.scores[s]!], { size: TYPE.small, color: COLOR.muted, ox: 1 }));
  });
  // 左下：这副的底牌和谁叫的地主（顶栏的底牌会被弹窗盖住，这里再摆一遍）
  if (v.bottom.length) {
    const g = sc.add.graphics();
    g.fillStyle(0xf3e6c9, 1).fillRoundedRect(-378, 112, 388, 76, 10);
    b.add(g);
    b.add(text(sc, -362, 150, '底牌', { size: TYPE.small, bold: true, color: COLOR.muted, ox: 0 }));
    sortDdz(v.bottom).forEach((c, i) => b.add(sc.add.image(-272 + i * 50, 150, cardKey(c)).setDisplaySize(44, 62)));
    b.add(text(sc, -6, 150, `${seatName(r.landlord)}叫 ${r.bid} 分`, { size: TYPE.small, bold: true, color: COLOR.ink, ox: 1 }));
  }
  // 右：哪边赢、我这副的分从 0 滚上去、叫分 × 倍数一颗胶囊、炸弹春天明牌一行
  const rx = 210;
  const sideCol = r.landlordWon ? COLOR.redDark : COLOR.teamThem;
  b.add(text(sc, rx, -184, r.landlordWon ? '地主赢了这副' : '农民赢了这副', { size: TYPE.title, bold: true, color: sideCol }));
  const focus = watch ? r.landlord : DDZ_ME;
  const mineD = r.delta[focus]!;
  b.add(text(sc, rx, -136, watch ? `${seatName(focus)}（地主）这副` : '你这副', { size: TYPE.small, bold: true, color: COLOR.muted }));
  const big = text(sc, rx, -86, signed(dur(1) === 0 ? mineD : 0), { size: 66, bold: true, font: 'num', color: signColor(mineD) });
  b.add(big);
  if (dur(1) > 0 && mineD !== 0) {
    const roll = { n: 0 };
    sc.tweens.add({
      targets: roll, n: mineD, duration: dur(520), delay: dur(200), ease: 'Cubic.easeOut',
      onUpdate: () => { if (big.scene) big.setText(signed(Math.round(roll.n))); },
      onComplete: () => {
        if (!big.scene) return;
        big.setText(signed(mineD)).setScale(1.25);
        sc.tweens.add({ targets: big, scale: 1, duration: dur(180), ease: 'Back.easeOut' });
      },
    });
  }
  const pill = text(sc, rx, -18, `${r.bid} 分 × ${r.mult} 倍`, { size: TYPE.title, bold: true, color: 0xffffff });
  const pw = pill.width + 40;
  const pg = sc.add.graphics();
  pg.fillStyle(sideCol, 1).fillRoundedRect(rx - pw / 2, -40, pw, 44, 22);
  b.add([pg, pill]);
  const extras = [r.bombs ? `炸弹 ${r.bombs} 个` : '', r.spring === 'spring' ? '春天' : r.spring === 'anti' ? '反春' : '', r.ming ? '明牌' : ''].filter(Boolean).join(' · ');
  if (extras) b.add(text(sc, rx, 34, extras, { size: TYPE.label, bold: true, color: COLOR.redDark }));
  if (r.spring) sc.springSeal(b, r.spring === 'anti');
  // 封顶了（不洗牌的每副封顶、实盘的一场封顶）：写明本来多少分，不让人以为算错了
  const capNote = r.capped && r.s < r.bid * r.mult ? `封顶了，本来 ${r.bid * r.mult} 分 · ` : '';
  b.add(fitWidth(text(sc, rx, 74, `${capNote}地主${r.landlordWon ? '赢' : '输'} ${2 * r.s}，农民各${r.landlordWon ? '输' : '赢'} ${r.s}`, { size: TYPE.small, bold: !!capNote, color: capNote ? COLOR.redDark : COLOR.muted }), 360));
  // 好友房实盘：这一副的筹码和本场合计（只在我到账了时写）
  const ns = sc.netStake;
  const mine = ns?.seats[DDZ_ME];
  if (ns && mine?.paid === 'yes' && !watch) {
    const pv = ddzPointValue(ns.tier, tableRules(ns));
    const d = r.delta[DDZ_ME]!;
    // 一整句居中，只给数字着色：这一副和本场合计正负可能不同，各按各的符号
    b.add(signedLine(sc, rx, 118, '实盘 · 这副 {0} 筹码 · 本场 {1} 分（{2}）', [d * pv, mine.points, mine.points * pv], { size: TYPE.label, bold: true }));
  }
  const net = sc.net;
  const next = new Button(sc, rx + 70, 196, 210, 64, last ? '看总分' : net ? '继续' : '下一副', 'red', () => {
    // 联机的"继续"：发出去，弹窗留着等人齐（refreshSettleWait 写在等谁）；房间开了下一副才收起来
    if (net && !last) {
      sc.act({ type: 'next' });
      sc.refreshSettleWait();
      return;
    }
    m.close();
    sc.overlay = null;
    sc.overlayModal = null;
    if (last) {
      sc.lastSettleSeen = true;
      sc.pump();
    } else sc.act({ type: 'next' });
  }, last ? 'crown' : 'play');
  const home = new Button(sc, rx - 126, 196, 132, 56, '首页', 'wood', () => sc.onHome(), 'back');
  b.add([next, home]);
  b.setData('next', next);
  if (net && !last) {
    sc.settleWait = text(sc, rx, 250, '', { size: TYPE.label, color: COLOR.ink });
    b.add(sc.settleWait);
    sc.refreshSettleWait();
  }
  sc.reg('settle:next', next);
  sc.reg('settle:home', home);
  // 托管（调试代打）时自动进下一副，和掼蛋一样
  if (sc.ses.autoplay) {
    sc.time.delayedCall(Math.max(600, dur(1200)), () => {
      if (sc.ses.autoplay && sc.overlay === 'settle' && sc.overlayModal === m && next.visible) next.onClick();
    });
  }
}

export function showGameOver(sc: DdzScene): void {
  if (sc.ses instanceof DdzStakeSession) return sc.showStakeResult(sc.ses);
  if (sc.netStake) return sc.showNetStakeResult(sc.netStake);
  const v = sc.ses.view();
  const me = v.scores[DDZ_ME]!;
  const watch = sc.watching;
  const m = modal(sc, 820, 560, watch ? '这局结束了' : me > 0 ? '这局你赢了！' : me === 0 ? '这局打平' : '这局输了', { closeBtn: false });
  sc.openOverlay('gameOver', m);
  const b = m.body;
  if (me > 0 && !watch) {
    audio.sfx('win');
    burst(sc, worldW(sc) / 2, 200, 'confetti', 40, { speed: [200, 560], life: 1400, gravity: 420 });
  } else if (!watch) audio.sfx('pass');
  const top = Math.max(1, ...v.results.map((r) => r.mult));
  b.add(text(sc, 0, -184, `打了 ${v.results.length} 副${top > 1 ? ` · 最高一副 × ${top} 倍` : ''}`, { size: TYPE.body, color: COLOR.muted }));
  // 三家按总分一行一个（和每副结算同一套）：名次章、头像按输赢换表情、当了几次地主赢了几副，总分从 0 滚上去
  const order = [0, 1, 2].sort((x, y) => v.scores[y]! - v.scores[x]!);
  const still = dur(1) === 0;
  order.forEach((s, i) => {
    const y = -122 + i * 86;
    const t = v.scores[s]!;
    const g = sc.add.graphics();
    g.fillStyle(i === 0 ? 0xf8e0d8 : 0xf3e6c9, 1).fillRoundedRect(-340, y - 36, 680, 72, 12);
    if (sc.isMe(s)) g.lineStyle(3, COLOR.gold, 1).strokeRoundedRect(-340, y - 36, 680, 72, 12);
    g.fillStyle(i === 0 ? COLOR.gold : COLOR.muted, 1).fillCircle(-298, y, 22);
    b.add(g);
    b.add(i === 0 ? sc.add.image(-298, y, texOr(sc, 'icon:crown')).setDisplaySize(30, 30) : text(sc, -298, y, String(i + 1), { size: TYPE.body, bold: true, font: 'num', color: 0xffffff }));
    b.add(sc.add.image(-236, y, texOr(sc, `avatar:${seatPerson(s)}:${t > 0 ? 'happy' : 'sad'}`)).setDisplaySize(56, 56));
    b.add(text(sc, -196, y - 12, seatName(s), { size: TYPE.body, bold: sc.isMe(s), color: COLOR.ink, ox: 0 }));
    const lord = v.results.filter((r) => r.landlord === s).length;
    const won = v.results.filter((r) => r.delta[s]! > 0).length;
    b.add(text(sc, -196, y + 18, `当地主 ${lord} 次 · 赢 ${won} 副`, { size: TYPE.small, color: COLOR.muted, ox: 0 }));
    const num = text(sc, 310, y, signed(still ? t : 0), { size: TYPE.title, bold: true, font: 'num', color: signColor(t), ox: 1 });
    b.add(num);
    if (still || t === 0) return;
    const roll = { n: 0 };
    sc.tweens.add({
      targets: roll, n: t, duration: dur(640), delay: dur(160 + i * 120), ease: 'Cubic.easeOut',
      onUpdate: () => { if (num.scene) num.setText(signed(Math.round(roll.n))); },
      onComplete: () => { if (num.scene) num.setText(signed(t)); },
    });
  });
  // 每日挑战：打完交一次分（重建画面再弹一次也不重交），结果写在这一行
  const daily = sc.ses.daily;
  if (daily) {
    const line = text(sc, 0, 124, '正在交到今天的榜…', { size: TYPE.body, color: COLOR.muted });
    b.add(line);
    if (!sc.ses.dailySent) {
      sc.ses.dailySent = true;
      sc.ses.dailyResult = submitDdzDaily(daily, me);
    }
    void sc.ses.dailyResult?.then((r) => {
      if (line.active) line.setText(dailySubmitText(r, me));
    });
  }
  // 好友房整场打完房间就结束，没有"再来一局"：只有回首页
  const solo = sc.solo;
  if (!solo) {
    b.add(text(sc, 0, 128, '房间到这里就结束了，想再打就开个新房间', { size: TYPE.small, color: COLOR.muted }));
    const home = new Button(sc, 0, 200, 240, 64, '回首页', 'red', () => sc.leaveRoom(), 'back');
    b.add(home);
    sc.reg('over:home', home);
    return;
  }
  const again = new Button(sc, 160, 200, 240, 64, daily ? '再打一次' : '再来一局', 'red', () => {
    m.close();
    if (daily) {
      app.ddz = DdzSession.fresh(ddzDailySeed(daily), solo.level, undefined, false);
      app.ddz.daily = daily;
    } else app.ddz = DdzSession.fresh(randomSeed(), solo.level, ddzFunOpts(v.noShuffle ? 'clump' : 'classic'));
    sc.scene.restart();
  }, 'restart');
  const home = new Button(sc, -160, 200, 240, 64, '回首页', 'wood', () => sc.onHome(), 'back');
  b.add([again, home]);
  sc.reg('over:again', again);
  sc.reg('again', again);
  sc.reg('over:home', home);
}

/**
 * 好友房实盘一场打完（打满副数或有人到 ±一份）：我的分和筹码、每个人的输赢；结回由房间去钱包办，办完这一行字跟着房间的帧变成"已经结回钱包"。
 * 再打要重新开房（和娱乐房间打完一样）。
 */
export function showNetStakeResult(sc: DdzScene, ns: DdzStakeView): void {
  const watch = sc.watching;
  const me = ns.seats[DDZ_ME]!;
  const rules = tableRules(ns);
  const pv = ddzPointValue(ns.tier, rules);
  audio.sfx(me.paid === 'yes' && me.points > 0 ? 'win' : 'pass');
  const m = modal(sc, 780, 520, undefined, { closeBtn: false });
  sc.openOverlay('gameOver', m);
  const b = m.body;
  b.add(text(sc, 0, -200, `斗地主好友房实盘 · ${TIER_NAME[ns.tier]}`, { size: TYPE.label, bold: true, color: COLOR.muted }));
  const head = watch ? '这一场打完了' : me.paid !== 'yes' ? '这一场不计输赢' : me.points === 0 ? '这场打平，0 分' : `这场 ${signed(me.points)} 分，${signed(me.points * pv)}`;
  b.add(text(sc, 0, -152, head, { size: TYPE.big, bold: true, color: me.paid !== 'yes' ? COLOR.ink : me.points > 0 ? COLOR.green : me.points < 0 ? COLOR.red : COLOR.ink }));
  b.add(text(sc, 0, -100, ns.deals >= rules.roomDeals ? `打满 ${rules.roomDeals} 副` : `有人输赢到了一份（${rules.pps} 分），这一场提前结束`, { size: TYPE.label, color: COLOR.ink }));
  // 每个人：到账的写分，别的写"不计输赢"（电脑是庄家的）
  [0, 1, 2].forEach((seat, i) => {
    const s = ns.seats[seat]!;
    const x = -240 + i * 240;
    b.add(text(sc, x, -50, seatName(seat), { size: TYPE.body, bold: sc.isMe(seat), color: COLOR.ink }));
    const line = s.paid === 'yes' ? `${signed(s.points)} 分` : s.paid === 'left' ? `${signed(s.points)} 分（中途走了）` : s.paid === 'no' ? '电脑' : '不计输赢';
    b.add(text(sc, x, -10, line, { size: TYPE.title, bold: true, color: s.paid !== 'yes' ? COLOR.ink : s.points > 0 ? COLOR.green : s.points < 0 ? COLOR.red : COLOR.ink }));
  });
  sc.netStakeStatus = text(sc, 0, 60, '', { size: TYPE.body, bold: true, color: COLOR.ink, wrap: 700 });
  b.add(sc.netStakeStatus);
  sc.refreshNetStake();
  const home = new Button(sc, 0, 150, 260, 64, '回首页', 'red', () => sc.leaveRoom(), 'back');
  b.add(home);
  sc.reg('over:home', home);
  b.add(text(sc, 0, 220, STAKE_TEXT.noCash, { size: TYPE.small, color: COLOR.muted }));
}

/** 单机实盘一场打完（打满副数或有人到 ±一份；数按这一场存档里的规则版本）：我的分和筹码，去钱包结回；结回的重试和存档在 doudizhu/stake.ts */
export function showStakeResult(sc: DdzScene, ses: DdzStakeSession): void {
  const save = ses.stake;
  const done = save.settle ?? { points: ses.points, deals: ses.dealsDone };
  const rules = ddzStakeRules(save);
  const pv = ddzPointValue(save.tier, rules);
  audio.sfx(done.points > 0 ? 'win' : 'pass');
  const m = modal(sc, 780, 500, undefined, { closeBtn: false });
  sc.openOverlay('gameOver', m);
  const b = m.body;
  b.add(text(sc, 0, -170, `斗地主实盘 · ${TIER_NAME[save.tier]}`, { size: TYPE.label, bold: true, color: COLOR.muted }));
  const head = done.points === 0 ? '这场打平，0 分' : `这场 ${signed(done.points)} 分，${signed(done.points * pv)}`;
  b.add(text(sc, 0, -122, head, { size: TYPE.big, bold: true, color: done.points > 0 ? COLOR.green : done.points < 0 ? COLOR.red : COLOR.ink }));
  // 没打满就结束只有一种：有一家的累计到了 ±一份（核心按 cap 截）
  const why = done.deals < rules.soloDeals ? `有人输赢到了一份（${rules.pps} 分），这一场提前结束` : `打满 ${rules.soloDeals} 副`;
  b.add(text(sc, 0, -66, why, { size: TYPE.label, color: COLOR.ink }));
  const status = text(sc, 0, -14, '正在结回…', { size: TYPE.body, bold: true, color: COLOR.ink, wrap: 700 });
  b.add(status);
  const capLine = text(sc, 0, 32, '', { size: TYPE.label, bold: true, color: COLOR.redDark, wrap: 700 });
  b.add(capLine);
  b.add(text(sc, 0, 210, STAKE_TEXT.noCash, { size: TYPE.small, color: COLOR.muted }));
  // 再来一场：同档再带入一份（和掼蛋实盘一样，结回之后才能点），带入没成回选档页
  const again = new Button(sc, -140, 120, 240, 64, '再来一场', 'wood', () => void sc.stakeAgain(save.tier, status, again), 'restart');
  const home = new Button(sc, 140, 120, 240, 64, '回首页', 'wood', () => sc.scene.start('title'), 'back');
  again.setEnabled(false);
  home.setEnabled(false);
  b.add([again, home]);
  sc.reg('again', again);
  sc.reg('over:home', home);
  void settleDdzStake(save).then((r) => {
    if (!sc.alive || !status.scene) return;
    home.setEnabled(true);
    if (r.kind === 'done') {
      status.setText(r.balance === null ? '已经结回钱包' : `已经结回钱包，钱包还有 ${fmtChips(r.balance)}`);
      if (r.capped > 0) capLine.setText(STAKE_TEXT.capped(r.capped));
      again.setEnabled(true);
    } else if (r.kind === 'gone') {
      status.setText(STAKE_TEXT.gone);
      again.setEnabled(true);
    } else if (r.kind === 'expired') {
      status.setText(STAKE_ERROR.expired!);
      again.setEnabled(true);
    } else if (r.kind === 'later') status.setText(STAKE_TEXT.settleLater);
    else status.setText(stakeError(r.error));
  });
}

/** 实盘再来一场：同一档再带入一份新的；带入没成就写出原因、回选档页 */
export async function stakeAgain(sc: DdzScene, tier: DdzStakeSession['stake']['tier'], status: Phaser.GameObjects.Text, btn: Button): Promise<void> {
  btn.setEnabled(false);
  status.setText('正在进场…');
  const r = await buyinDdzStake(tier);
  if (!sc.alive) return;
  if (r.ok) {
    app.ddz = r.ses;
    sc.scene.restart();
    return;
  }
  const msg = stakeError(r.error);
  status.setText(msg);
  sc.time.delayedCall(NOTICE_MS, () => sc.alive && backToPicker(sc, 'ddz', msg));
}
