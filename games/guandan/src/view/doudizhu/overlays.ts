/** 斗地主的残局结果、每日通关、结算、整局结束和实盘结果弹窗（从 DdzScene.ts 拆出，只搬家；函数接收场景实例）。 */
import type Phaser from 'phaser';
import type { DdzResult } from '../../variants/doudizhu/index.ts';
import { app } from '../app.ts';
import { audio } from '../common/audio.ts';
import { dur } from '../common/anim.ts';
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
import { seatName } from '../common/labels.ts';
import { COLOR, TYPE, signColor } from '../common/theme.ts';
import { burst } from '../table/fx.ts';
import { Button, modal, signedLine, text, worldW } from '../ui/kit.ts';
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

export function showSettle(sc: DdzScene, r: DdzResult): void {
  if (sc.puzzle) return sc.showPuzzleResult(r);
  const v = sc.ses.view();
  const last = v.phase === 'gameOver';
  const meWon = r.delta[DDZ_ME]! > 0;
  const watch = sc.watching;
  const m = modal(sc, 820, 560, watch ? '这一副结束了' : meWon ? '这副你赢了' : '这副你输了', { closeBtn: false });
  sc.openOverlay('settle', m);
  const b = m.body;
  const side = r.landlordWon ? '地主赢' : '农民赢';
  const extras = [`${r.bid} 分`, r.bombs ? `炸弹 ${r.bombs} 个` : '', r.spring === 'spring' ? '春天' : r.spring === 'anti' ? '反春' : '', r.ming ? '明牌' : '', `× ${r.mult} 倍`].filter(Boolean).join(' · ');
  if (r.spring) sc.springSeal(b, r.spring === 'anti');
  b.add(text(sc, 0, -190, `${side} · ${extras}`, { size: TYPE.title, bold: true, color: r.landlordWon ? COLOR.redDark : COLOR.ink }));
  // 封顶了（不洗牌的每副封顶、实盘的一场封顶）：写明本来多少分，不让人以为算错了
  const capNote = r.capped && r.s < r.bid * r.mult ? `（封顶了，本来 ${r.bid * r.mult} 分）` : '';
  b.add(text(sc, 0, -146, `这副 ${r.s} 分${capNote}：地主${r.landlordWon ? '赢' : '输'} ${2 * r.s} 分，农民各${r.landlordWon ? '输' : '赢'} ${r.s} 分`, { size: TYPE.small, bold: !!capNote, color: capNote ? COLOR.redDark : COLOR.muted }));
  // 数字列右对齐（docs/ui.md 第 9 节）：表头和数字共用同一条右边线；正绿负红、0 用墨色
  const cols = [-300, 40, 190];
  ['', '这副', '累计'].forEach((h, i) => h && b.add(text(sc, cols[i]!, -96, h, { size: TYPE.small, bold: true, color: COLOR.muted, ox: 1 })));
  [0, 1, 2].forEach((s, i) => {
    const y = -46 + i * 62;
    const role = s === r.landlord ? '地主' : '农民';
    b.add(text(sc, cols[0]!, y, `${seatName(s)}（${role}）`, { size: TYPE.body, bold: sc.isMe(s), color: COLOR.ink }));
    const d = r.delta[s]!;
    b.add(text(sc, cols[1]!, y, d > 0 ? `+${d}` : `${d}`, { size: TYPE.title, bold: true, font: 'num', color: signColor(d), ox: 1 }));
    const t = v.scores[s]!;
    b.add(text(sc, cols[2]!, y, t > 0 ? `+${t}` : `${t}`, { size: TYPE.body, font: 'num', color: signColor(t), ox: 1 }));
  });
  // 好友房实盘：这一副的筹码和本场合计（只在我到账了时写）
  const ns = sc.netStake;
  const mine = ns?.seats[DDZ_ME];
  if (ns && mine?.paid === 'yes' && !watch) {
    const pv = ddzPointValue(ns.tier, tableRules(ns));
    const d = r.delta[DDZ_ME]!;
    // 一整句居中，只给数字着色：这一副和本场合计正负可能不同，各按各的符号
    b.add(signedLine(sc, 0, 138, '实盘 · 这一副 {0} 筹码 · 本场 {1} 分（{2}）', [d * pv, mine.points, mine.points * pv], { size: TYPE.label, bold: true }));
  }
  const net = sc.net;
  const next = new Button(sc, 160, 200, 240, 64, last ? '看总分' : net ? '继续' : '下一副', 'red', () => {
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
  const home = new Button(sc, -160, 200, 240, 64, '回首页', 'wood', () => sc.onHome(), 'back');
  b.add([next, home]);
  b.setData('next', next);
  if (net && !last) {
    sc.settleWait = text(sc, 160, 256, '', { size: TYPE.label, color: COLOR.ink });
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
  }
  b.add(text(sc, 0, -180, `打了 ${v.results.length} 副 · 你当了 ${v.results.filter((r) => r.landlord === DDZ_ME).length} 次地主`, { size: TYPE.body, color: COLOR.muted }));
  const order = [0, 1, 2].sort((x, y) => v.scores[y]! - v.scores[x]!);
  order.forEach((s, i) => {
    const y = -110 + i * 70;
    const t = v.scores[s]!;
    b.add(text(sc, -200, y, `${i + 1}. ${seatName(s)}`, { size: TYPE.title, bold: sc.isMe(s), color: COLOR.ink, ox: 0 }));
    b.add(text(sc, 220, y, t > 0 ? `+${t}` : `${t}`, { size: TYPE.title, bold: true, font: 'num', color: t > 0 ? COLOR.green : t < 0 ? COLOR.red : COLOR.ink, ox: 1 }));
  });
  // 每日挑战：打完交一次分（重建画面再弹一次也不重交），结果写在这一行
  const daily = sc.ses.daily;
  if (daily) {
    const line = text(sc, 0, 110, '正在交到今天的榜…', { size: TYPE.body, color: COLOR.muted });
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
    b.add(text(sc, 0, 120, '房间到这里就结束了，想再打就开个新房间', { size: TYPE.small, color: COLOR.muted }));
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
  sc.time.delayedCall(1200, () => sc.alive && backToPicker(sc, 'ddz', msg));
}
