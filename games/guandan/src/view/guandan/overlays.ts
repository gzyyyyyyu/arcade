/** 结算、整局结束、实盘/每日结果弹窗和离场（从 TableScene.ts 拆出，只搬家；函数接收场景实例）。 */
import type Phaser from 'phaser';
import { endLevelOf, teamOf, type DealResult } from '../../variants/guandan/core/index.ts';
import type { Mood } from '../art/index.ts';
import { app } from '../app.ts';
import { audio } from '../common/audio.ts';
import { dur } from '../common/anim.ts';
import { NOTICE_MS } from '../common/pace.ts';
import { backToPicker } from '../table/again.ts';
import { PLACE_NAMES, seatIdentity, seatName, seatPerson } from '../common/labels.ts';
import { bombText, goalWord, levelName } from './labels.ts';
import { dealPoints, payout, pointValue, rulesOf } from '../../variants/guandan/stake/index.ts';
import { ROOM_STAKE_TEXT, STAKE_ERROR, STAKE_TEXT, TIER_NAME, fillSigned, fmtChips, roomWhy, settleNowText, signed, stakeError } from '../common/stake-text.ts';
import { Session } from './session.ts';
import { DailySession, GD_DAILY_DEALS, submitGdDaily } from './daily.ts';
import { dailySubmitText } from '../common/daily.ts';
import { type StakeSession, buyinStake, refundStake, settleStake } from './stake.ts';
import { dealRecap } from './recap.ts';
import { TITLE_INFO, dealTitles, logDeal, matchTitles, type Title } from '../../variants/guandan/stake/titles.ts';
import { AWARD_NAME, matchAwards, winnerOf, type Award } from '../../variants/guandan/net/awards.ts';
import { getStats } from '../store.ts';
import { COLOR, TYPE, phoneType, signColor } from '../common/theme.ts';
import { goLobby } from '../common/lobby.ts';
import { Button, fitWidth, iconButton, modal, signedLine, text, worldH, worldW } from '../ui/kit.ts';
import { toast } from '../ui/bubble.ts';
import { confirm } from '../ui/panels.ts';
import { burst, rain, rays } from '../table/fx.ts';
import { dealHighlights, highlightText, storyPicks } from './highlights.ts';
import { feedPick } from './feed.ts';
import { postFeed } from '../common/social.ts';
import { lobbyName, platformInfo } from '../common/platform.ts';
import { prepareResult } from '../common/share-card.ts';
import { shareCardOf, type ShareKind } from './share-card.ts';
import { texOr } from '../common/textures.ts';
import type { TableScene } from '../scenes/TableScene.ts';

/** 两队的叫法：我方 / 对方；旁观时没有"我"，叫一队（下、上两家）、二队 */
export function side(sc: TableScene, team: number): string {
  if (sc.watching) return team === 0 ? '一队' : '二队';
  return team === 0 ? '我方' : '对方';
}

/**
 * 实盘中途离开（2.2）：第一副还没打完就原样退回；打了几副就给三个选择——现在结算、先存着、接着打，默认先存着，不强迫人结束。
 * 左上"大厅"、实盘条（中途结算的入口）去大厅；右上"←"回标题。结算写明按现在的分带回多少。
 */
export function leaveStake(sc: TableScene, st: StakeSession, to: 'lobby' | 'title'): void {
  const go = (): void => {
    sc.cancelBot();
    if (to === 'lobby') goLobby();
    else sc.scene.start('title');
  };
  if (st.stake.match.deals.length === 0) {
    sc.openOverlay('menu', confirm(sc, STAKE_TEXT.refundAsk, '退出', () => void sc.refundAndLeave(st, to), () => sc.closeOverlay(), true));
    return;
  }
  const where = to === 'lobby' ? `，回${lobbyName()}` : '';
  const m = modal(sc, 680, 380, undefined, { closeBtn: false });
  sc.openOverlay('menu', m);
  // 两行都是一行放得下的短句（28、20 号字，600 宽里一行）：只把分和筹码红绿，不换行
  const pv = pointValue(st.tier, rulesOf(st.stake.match.rules));
  m.body.add(signedLine(sc, 0, -126, `这场实盘打了 ${st.stake.match.deals.length} 副，本场 {0} 分`, [st.points], { size: TYPE.title, bold: true }));
  m.body.add(signedLine(sc, 0, -76, settleNowText(payout(st.tier, st.points, rulesOf(st.stake.match.rules))), [st.points, st.points * pv], { size: TYPE.label, bold: true, color: COLOR.redDark }));
  m.body.add(text(sc, 0, -40, '先存着：24 小时内回来接着打', { size: TYPE.label, color: COLOR.muted, wrap: 600 }));
  const now = new Button(sc, -160, 36, 290, 60, `现在带回${where}`, 'red', () => {
    m.close();
    sc.overlay = null;
    sc.overlayModal = null;
    st.finish();
    sc.showStakeResult(to === 'lobby');
  });
  const keep = new Button(sc, 160, 36, 290, 60, `先存着${where}`, 'wood', () => {
    m.close();
    go();
  });
  const cancel = new Button(sc, 0, 122, 200, 52, '接着打', 'wood', () => {
    m.close();
    sc.closeOverlay();
  });
  m.body.add([now, keep, cancel]);
  m.body.setData('ok', keep);
  m.body.setData('settleNow', now);
  m.body.setData('cancel', cancel);
}

export async function refundAndLeave(sc: TableScene, st: StakeSession, to: 'lobby' | 'title'): Promise<void> {
  sc.cancelBot();
  const r = await refundStake(st.stake);
  if (!sc.alive) return;
  // 去大厅：退成了才走；没退成存档留着（标题页能接着打、到期钱包原样退回），照样走
  if (to === 'lobby') return goLobby();
  sc.scene.start('title');
  if (r.kind === 'later' || r.kind === 'failed') {
    // 没退成：存档留着，标题页还能"接着打"；到期钱包也会原样退回
    const title = sc.scene.get('title');
    title.events.once('create', () => toast(title, r.kind === 'later' ? STAKE_ERROR.unavailable! : stakeError(r.error), worldW(title) / 2, worldH(title) - 60));
  }
}

/** 顶栏下面那条实盘 / 每日的字：模板里 `{0}`、`{1}` 是要红绿的分和筹码（没有就是空串），画用 signedLine */
export function stakeLabelParts(sc: TableScene): { tpl: string; nums: number[] } {
  const st = sc.stake;
  const ns = sc.netStake;
  const dl = sc.dailyRun;
  if (st) {
    const pv = pointValue(st.tier, rulesOf(st.stake.match.rules));
    return { tpl: `实盘 · ${TIER_NAME[st.tier]} · 打完 ${st.stake.match.deals.length}/${rulesOf(st.stake.match.rules).soloDeals} 副 · 本场 {0} 分（{1}）`, nums: [st.points, st.points * pv] };
  }
  if (dl) return { tpl: `每日 · 第 ${Math.min(sc.ses.view().dealNo, GD_DAILY_DEALS)}/${GD_DAILY_DEALS} 副`, nums: [] };
  if (ns) {
    // 好友房：我（视角里总是 0 号）这个座位的账
    const me = ns.seats[0]!;
    const head = `实盘 · ${TIER_NAME[ns.tier]} · 打完 ${ns.deals}/${rulesOf(ns.rules).roomDeals} 副 · `;
    if (sc.watching) return { tpl: `${head}旁观`, nums: [] };
    if (me.paid === 'yes') return { tpl: `${head}本场 {0} 分（{1}）`, nums: [me.points, me.points * pointValue(ns.tier, rulesOf(ns.rules))] };
    return { tpl: head + (me.paid === 'pending' ? ROOM_STAKE_TEXT.pending : roomWhy(ns.why ?? '')), nums: [] };
  }
  return { tpl: '', nums: [] };
}

/** 上面那条拼成整句（topBarKey 拿它判断顶栏要不要重画） */
export function stakeLabel(sc: TableScene): string {
  const { tpl, nums } = stakeLabelParts(sc);
  return fillSigned(tpl, nums);
}

export function showSettle(sc: TableScene, r: DealResult): void {
  const W = worldW(sc);
  void W;
  audio.music('table');
  // 左下的复盘和称号行数不定：弹窗按最后一行往下留出边距，免得最后一行贴着下边被截
  const history = sc.ses.view().history;
  const rc = dealRecap(r, history);
  const recap = [
    `炸弹 ${sc.side(0)} ${rc.bombs[0]} · ${sc.side(1)} ${rc.bombs[1]}${sc.dealJiefeng ? ` · 接风 ${sc.dealJiefeng} 次` : ''}`,
    rc.top ? `最大一炸：${seatName(rc.top.seat)}，${bombText(rc.top.play)}` : `头游 ${seatName(r.order[0]!)} ${rc.firstPlays} 手出完`,
  ];
  // 名场面：最精彩的两条，一条一行（两条挤一行在 1280 上会被截成"…"）。手机上字托底到 12 像素，框里一行只放得下十来个字：名场面、称号各留一条，再长的截断
  const phone = phoneType();
  // 同一个人的同一件事（炸弹次数、双下）名场面和称号各写一遍，先去重再封顶（storyPicks）
  const { hl, titles } = storyPicks(dealHighlights(r, history), dealTitles(r, history), phone);
  for (const h of hl) recap.push(`名场面：${highlightText(h, seatName)}`);
  // 左下分两框（art-v3）：上面是数据（炸弹、最大一炸），下面是故事（名场面、称号），不红黑混排一长串
  // 数据框从名次第四行下面留出一点开始（第四行下沿 96），行距 28
  const dataY = 124;
  const row = phone ? 32 : 28;
  const storyY = dataY + row + 16 + 12 + 16;
  const story = recap.length - 2 + titles.length;
  const lastY = story > 0 ? storyY + (story - 1) * row : dataY + row;
  // 内容从 -280（标题飘带上沿）排到 lastY + 46：故事行多了弹窗往下长，内容整体上移，不在飘带下面空出一大块
  const H = Math.max(560, lastY + 46 + 280);
  const lift = 280 - H / 2;
  const m = modal(sc, 820, H, `第 ${r.dealNo} 副 结束`, { closeBtn: false });
  sc.openOverlay('settle', m);
  const b = m.body;
  const base = b.list.length;
  const mine = r.winnerTeam === 0;
  if (mine) {
    audio.sfx('levelUp');
    burst(sc, W / 2, 180, 'petal', 30, { gravity: 200, speed: [120, 360], life: 1600 });
  } else audio.sfx('pass');
  // 左：名次
  r.order.forEach((seat, i) => {
    const y = -170 + i * 78;
    const g = sc.add.graphics();
    g.fillStyle(teamOf(seat) === 0 ? 0xf8e0d8 : 0xdde8f4, 1).fillRoundedRect(-370, y - 32, 360, 64, 12);
    b.add(g);
    b.add(sc.add.image(-330, y, texOr(sc, `stamp:${PLACE_NAMES[i]}`)).setDisplaySize(56, 56).setAngle(-10));
    b.add(sc.add.image(-262, y, texOr(sc, `avatar:${seatPerson(seat)}:${teamOf(seat) === r.winnerTeam ? 'happy' : 'sad'}`)).setDisplaySize(54, 54));
    b.add(text(sc, -222, y, seatName(seat), { size: TYPE.body, bold: true, ox: 0 }));
    b.add(text(sc, -26, y, sc.side(teamOf(seat)), { size: TYPE.small, color: teamOf(seat) === 0 ? COLOR.teamUs : COLOR.teamThem, bold: true, ox: 1 }));
  });
  // 右：升级
  const rx = 190;
  const before = r.levelsBefore[r.winnerTeam]!;
  const after = r.levelsAfter[r.winnerTeam]!;
  b.add(text(sc, rx, -176, `${sc.side(r.winnerTeam)}赢了这副`, { size: TYPE.title, bold: true, color: mine ? COLOR.red : COLOR.teamThem, font: 'title' }));
  const lvText = text(sc, rx - 70, -86, levelName(before), { size: 66, bold: true, font: 'num', color: COLOR.muted });
  b.add(lvText);
  b.add(text(sc, rx, -86, '→', { size: 46, bold: true, color: COLOR.muted }));
  const lvAfter = text(sc, rx + 76, -86, levelName(before), { size: 66, bold: true, font: 'num', color: mine ? COLOR.red : COLOR.teamThem });
  b.add(lvAfter);
  const upTag = r.up > 0 ? `升 ${r.up} 级` : r.aResetTeam >= 0 ? '' : r.aFailedTeam >= 0 ? '' : '';
  if (upTag) {
    const t = text(sc, rx, -18, upTag, { size: TYPE.title, bold: true, color: 0xffffff });
    const w = t.width + 36;
    const g = sc.add.graphics();
    g.fillStyle(mine ? COLOR.red : COLOR.teamThem, 1).fillRoundedRect(rx - w / 2, -38, w, 40, 20);
    b.add([g, t]);
  }
  // 数字滚动到新级数
  if (after !== before) {
    let cur = before;
    const step = (): void => {
      if (!lvAfter.scene) return;
      cur++;
      lvAfter.setText(levelName(cur));
      lvAfter.setScale(1.3);
      sc.tweens.add({ targets: lvAfter, scale: 1, duration: dur(160) });
      if (cur < after) sc.time.delayedCall(Math.max(60, dur(200)), step);
    };
    sc.time.delayedCall(Math.max(60, dur(250)), step);
  } else lvAfter.setText(levelName(after));
  // 打 A 的情况
  const notes: string[] = [];
  if (r.aFailedTeam >= 0) notes.push(`${sc.side(r.aFailedTeam)}打 A 没过`);
  if (r.aResetTeam >= 0) notes.push(`${sc.side(r.aResetTeam)}退回打 2`);
  if (r.doubleDown) notes.push('双下！');
  b.add(text(sc, rx, 40, notes.join(' · '), { size: TYPE.label, bold: true, color: COLOR.redDark }));
  // 下一副的进贡：核心推演下一副开头（联机时由房间算好随结算下发）
  const next = sc.ses.preview();
  let tribLine = '';
  if (next?.anti) tribLine = '下副：抗贡！不用进贡';
  else if (next && next.payers.length === 2) tribLine = `下副：${next.payers.map(seatName).join('、')} 进贡`;
  else if (next && next.payers.length === 1) tribLine = `下副：${seatName(next.payers[0]!)} 进贡给 ${seatName(next.to)}`;
  const st = sc.stake;
  const ns = sc.netStake;
  // 实盘：这一副的分和本场合计（好友房只在我到账了时写）；一场结束了就不预告下一副的进贡
  const dl = sc.dailyRun;
  const stakeLine = st ? { tier: st.tier, total: st.points, rules: rulesOf(st.stake.match.rules) } : ns?.seats[0]?.paid === 'yes' ? { tier: ns.tier, total: ns.seats[0]!.points, rules: rulesOf(ns.rules) } : null;
  if (stakeLine) {
    const d = dealPoints(r, 0);
    const pv = pointValue(stakeLine.tier, stakeLine.rules);
    // 筹码是实盘最关心的数：大字写这一副赢输多少，分和本场合计放小字
    b.add(text(sc, rx, 114, `这一副 ${signed(d * pv)} 筹码`, { size: TYPE.title, bold: true, color: d > 0 ? COLOR.green : d < 0 ? COLOR.red : COLOR.ink }));
    // 一整行居中（和上面的大字对齐，手机字号托底后也不出右边），只把三个数各按正负红绿
    b.add(signedLine(sc, rx, 146, '{0} 分 · 本场 {1} 分（{2}）', [d, stakeLine.total, stakeLine.total * pv], { size: TYPE.small, bold: true, color: COLOR.muted }));
  }
  if (dl) {
    const d = dealPoints(r, 0);
    b.add(text(sc, rx, 114, `这一副 ${signed(d)} 分`, { size: TYPE.title, bold: true, color: d > 0 ? COLOR.green : d < 0 ? COLOR.red : COLOR.ink }));
    b.add(signedLine(sc, rx, 146, `每日 · 打完 ${dl.match.deals.length}/${GD_DAILY_DEALS} 副 · 本场 {0} 分`, [dl.points], { size: TYPE.small, bold: true, color: COLOR.muted }));
  }
  const matchOver = !!st?.over || !!ns?.over || !!dl?.over;
  if (matchOver) tribLine = '这一场打完了';
  b.add(text(sc, rx, stakeLine || dl ? 78 : 90, tribLine, { size: TYPE.body, bold: true, color: COLOR.ink }));
  const net = sc.net;
  // 左下：这一副的复盘和称号（只看公开的出牌、名次和播过的接风）
  sc.logMatch();
  const boxes = sc.add.graphics();
  boxes.fillStyle(0xf3e6c9, 1).fillRoundedRect(-378, dataY - 16, 368, row + 32, 10);
  if (story > 0) boxes.fillStyle(0xfbe3d8, 1).fillRoundedRect(-378, storyY - 16, 368, (story - 1) * row + 32, 10);
  b.add(boxes);
  recap.slice(0, 2).forEach((line, i) => b.add(fitWidth(text(sc, -366, dataY + i * row, line, { size: TYPE.small, color: COLOR.ink, ox: 0 }), 344)));
  // 手机字大，称号的说明放不下时去掉逗号后的那半句（"憋大招"），只留数（"不要"了 19 次），不截成"…"
  const storyLines: [string, string?][] = [...recap.slice(2).map((l): [string] => [l]), ...titles.map((t): [string, string] => [sc.titleLine(t, true), sc.titleLine({ ...t, why: t.why.split('，')[0]! }, true)])];
  storyLines.forEach(([line, shorter], i) => {
    const t = text(sc, -366, storyY + i * row, line, { size: TYPE.small, bold: true, color: COLOR.redDark, ox: 0 });
    if (shorter && t.width > 344) t.setText(shorter);
    b.add(fitWidth(t, 344));
  });
  // 主按钮右挪，左边放"回大厅"：结算弹窗盖着顶栏的大厅按钮，任何界面两步内要能回大厅（仓库 AGENTS 第 2 节）
  const by = stakeLine || dl ? 200 : 190;
  const lobby = new Button(sc, rx - 126, by, 132, 56, lobbyName(), 'wood', () => sc.lobbyFromSettle(), 'home');
  b.add(lobby);
  b.setData('lobby', lobby);
  const btn = new Button(sc, rx + 70, by, 210, 64, matchOver ? '带回' : net ? '继续' : '下一副', 'red', () => {
    if (matchOver) {
      m.close();
      sc.overlay = null;
      sc.overlayModal = null;
      sc.stakeDealSeen = true;
      if (st) sc.showStakeResult();
      else if (dl) sc.showDailyResult();
      else sc.showNetStakeResult();
      return;
    }
    if (net) {
      // 好友房：点了只是"我准备好了"，结算页留着，等人齐了或到点房间开下一副
      sc.act({ type: 'nextDeal' });
      sc.refreshSettleWait();
      return;
    }
    m.close();
    sc.overlay = null;
    sc.overlayModal = null;
    sc.act({ type: 'nextDeal' });
  }, 'play');
  b.add(btn);
  b.setData('next', btn);
  if (net && !matchOver) {
    sc.settleWait = text(sc, rx, 250, '', { size: TYPE.label, bold: true, color: COLOR.muted });
    b.add(sc.settleWait);
    sc.refreshSettleWait();
  }
  if (lift) for (const o of b.list.slice(base)) (o as unknown as { y: number }).y += lift;
  // 托管（调试代打）时自动进下一副
  if (sc.ses.autoplay) {
    sc.time.delayedCall(Math.max(600, dur(1200)), () => {
      if (sc.ses.autoplay && sc.overlay === 'settle' && sc.overlayModal === m && btn.visible) btn.onClick();
    });
  }
}

export function showGameOver(sc: TableScene): void {
  const v = sc.ses.view();
  const watch = sc.watching;
  const win = v.winner === 0;
  audio.music('off');
  audio.sfx(win || watch ? 'win' : 'lose');
  const W = worldW(sc);
  const stop = win ? rain(sc, 'confetti', 4900) : rain(sc, 'smoke', 4900);
  if (win) {
    rays(sc, W / 2, 200);
    burst(sc, W / 2, 200, 'coin', 40, { speed: [200, 600], life: 1600, gravity: 600 });
  }
  const m = modal(sc, 760, 600, watch ? '整局结束' : win ? '胜利！' : '惜败', { closeBtn: false, depth: 5000 });
  sc.openOverlay('gameOver', m);
  m.root.once('destroy', stop);
  const b = m.body;
  // 好友房一场打完：颁奖代替四个头像那一排和称号那一行；没有记录时照常画头像和称号
  const awards = sc.roomAwards(v.winner);
  if (awards) sc.addAwards(b, -95, awards);
  // 两队四人
  if (!awards) [0, 2, 1, 3].forEach((seat, i) => {
    const x = -255 + i * 170;
    const mood: Mood = teamOf(seat) === v.winner ? 'happy' : 'sad';
    const img = sc.add.image(x, -150, texOr(sc, `avatar:${seatPerson(seat)}:${mood}`)).setDisplaySize(110, 110);
    b.add(img);
    if (teamOf(seat) === v.winner) sc.tweens.add({ targets: img, y: -164, duration: dur(420), yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    b.add(text(sc, x, -78, seatName(seat), { size: TYPE.label, bold: true, color: teamOf(seat) === 0 ? COLOR.teamUs : COLOR.teamThem }));
  });
  const goal = goalWord(endLevelOf(v));
  b.add(text(sc, 0, -14, watch ? `${sc.side(v.winner)}先${goal}，赢下整局` : win ? `我方先${goal}，赢下整局！` : `对方先${goal === '过 A' ? '过了 A' : goal}，下局再来`, { size: TYPE.title, bold: true, color: win ? COLOR.red : COLOR.muted, font: 'title' }));
  // 整局的称号：一行排开，按钮上方
  sc.logMatch();
  const titles = matchTitles(sc.matchLog);
  // 这一局的数：四格一排，数字逐格从 0 滚上去（好友房颁奖那一块占了位置，就不摆）
  if (!awards && sc.matchLog.deals > 0) b.add(matchCells(sc, 58, watch));
  // 分享（art-v3）：按钮行正中带字的"晒战绩"，比角上的小图标好找
  if (!watch) sc.addShare(b, 0, 206, { kind: 'game', win, room: sc.shareRoom(), goal }, awards, 200);
  if (titles.length && !awards) b.add(text(sc, 0, 128, titles.map((t) => sc.titleLine(t, false)).join('    '), { size: TYPE.small, bold: true, color: COLOR.redDark }));
  if (sc.net && watch) {
    // 旁观的人：看完结果回首页（"再来一场"是这一桌的人一起换房间，不带旁观的）
    b.add(new Button(sc, 0, 206, 240, 64, '回首页', 'red', () => sc.leaveRoom(), 'back'));
    return;
  }
  if (sc.net) {
    // 好友房不计战绩。再来一场：开个新房间，这一桌的人自动跟过去、坐回原来的座位
    // 匹配桌也能再来一场：这一桌的人一起换到一个新开的好友房
    const tip = text(sc, 0, 154, `${sc.net.match ? '匹配桌' : '好友房'}不计战绩 · 点"再来一场"，这一桌一起换到新房间`, { size: TYPE.label, color: COLOR.ink });
    b.add(tip);
    b.setData('againTip', tip);
    const home = new Button(sc, -230, 206, 200, 64, '回首页', 'wood', () => sc.leaveRoom(), 'back');
    const again = new Button(sc, 230, 206, 200, 64, '再来一场', 'red', () => void sc.again(again), 'restart');
    b.add([home, again]);
    b.setData('again', again);
    b.setData('home', home);
    // 结束页出来之前已经有人开了新房间：让大家先看一眼结果再走
    const a = sc.net.againInfo;
    if (a) sc.followAgain(a);
    return;
  }
  // 战绩一行只在真有战绩时写（URL 开的局、实盘不计战绩，新账号写"0/0 胜率 0%"没意思）
  const st = getStats();
  if (st.games > 0) {
    const rate = Math.round((st.wins / st.games) * 100);
    b.add(text(sc, 0, 154, `战绩 ${st.wins}/${st.games}  胜率 ${rate}%  连胜 ${st.streak}（最高 ${st.bestStreak}）`, { size: TYPE.label, color: COLOR.ink }));
  }
  b.add(new Button(sc, -230, 206, 200, 64, '回首页', 'wood', () => sc.scene.start('title'), 'back'));
  // 再来一局：直接开同难度、同规则、同局长的新局，不回主页（残局之外的单机娱乐都走这里）
  const again = new Button(sc, 230, 206, 200, 64, '再来一局', 'red', () => sc.newGame(), 'restart');
  b.add(again);
  b.setData('again', again);
}

/** 整局结束页的四格：打了几副、两队各赢几副（左边是我方 / 一队）、我（旁观时一队）拿头游几次、我方（一队）炸弹几个 */
function matchCells(sc: TableScene, y: number, watch: boolean): Phaser.GameObjects.Container {
  const lg = sc.matchLog;
  const who = watch ? seatName(0) : '你';
  const cells: [string, number, number | null][] = [
    ['打了几副', lg.deals, null],
    ['两队赢的副数', lg.wins[0]!, lg.wins[1]!],
    [`${who}拿头游`, lg.firsts[0]!, null],
    [`${sc.side(0)}炸弹`, lg.bombs[0]! + lg.bombs[2]!, null],
  ];
  const c = sc.add.container(0, y);
  const cw = 156;
  const gap = 12;
  const still = dur(1) === 0;
  cells.forEach(([label, n, m], i) => {
    const x = (i - 1.5) * (cw + gap);
    const g = sc.add.graphics();
    g.fillStyle(0xf3e6c9, 1).fillRoundedRect(x - cw / 2, -38, cw, 76, 12);
    g.lineStyle(2, 0xd8c39a, 1).strokeRoundedRect(x - cw / 2, -38, cw, 76, 12);
    c.add(g);
    // t 从 0 走到 1：两个数（两队胜副）一起滚，谁是 0 都不影响另一个
    const fmt = (t: number): string => (m === null ? String(Math.round(t * n)) : `${Math.round(t * n)} : ${Math.round(t * m)}`);
    const num = text(sc, x, -10, fmt(still ? 1 : 0), { size: TYPE.title, bold: true, font: 'num', color: i === 1 ? COLOR.ink : COLOR.redDark });
    c.add(num);
    c.add(fitWidth(text(sc, x, 22, label, { size: TYPE.small, color: COLOR.muted }), cw - 12));
    if (still) return;
    const roll = { t: 0 };
    sc.tweens.add({
      targets: roll, t: 1, duration: dur(520), delay: dur(300 + i * 140), ease: 'Cubic.easeOut',
      onUpdate: () => { if (num.scene) num.setText(fmt(roll.t)); },
      onComplete: () => { if (num.scene) num.setText(fmt(1)); },
    });
  });
  return c;
}

/**
 * 结算页右上角的"分享"（docs/social.md 1.1）：画一张战绩图，手机上调系统分享，不支持的出预览。只用公开的结果，不画手牌
 */
export function addShare(sc: TableScene, b: Phaser.GameObjects.Container, x: number, y: number, k: ShareKind, awards: readonly Award[] | null = null, labelW = 0): void {
  sc.logMatch();
  // 好友房用房间攒的记录（中途进来、刷新过的人本地记的不全），颁奖写进卡里
  const log = (awards && sc.net?.matchLog) || sc.matchLog;
  const card = shareCardOf(k, log, matchTitles(log), sc.myShareName(), awards ? { awards, name: seatName } : undefined);
  // 结算页一出来就先画好卡，点的时候在同一个点击里调系统分享（iOS 要这样）
  const share = prepareResult(card, k.room);
  // labelW > 0：按钮行里带字的"晒战绩"（整局结束页）；否则角上一个图标（实盘结算）
  const btn = labelW > 0 ? new Button(sc, x, y, labelW, 64, '晒战绩', 'gold', share, 'share') : iconButton(sc, x, y, 'share', share, 56);
  b.add(btn);
  b.setData('share', btn);
}

/** 卡上写的名字：好友房用房间里的昵称，单机有平台时用账号的昵称，单独部署不写 */
export function myShareName(sc: TableScene): string | null {
  const me = sc.net ? seatIdentity[0] : null;
  if (me?.human) return me.name;
  const u = platformInfo().platform === true ? (platformInfo() as { user: unknown }).user : null;
  const n = (u as { displayName?: unknown } | null)?.displayName;
  return typeof n === 'string' && n ? n : null;
}

/**
 * 一副打完：挑一条和我有关的名场面报到好友动态（src/view/guandan/feed.ts）。只报娱乐（实盘带回时平台自己会生成），旁观、调试代打不报；
 * 没平台、没登录时 postFeed 什么都不发
 */
export function feedDeal(sc: TableScene, r: DealResult): void {
  if (sc.stake || sc.dailyRun || sc.netStake || sc.watching || sc.ses.autoplay) return;
  const m = feedPick(dealHighlights(r, sc.ses.view().history), sc.feedPosted);
  if (!m) return;
  sc.feedPosted.push(m.moment);
  postFeed(m);
}

/** 把最近一副记进整局的称号统计（同一副只记一次） */
export function logMatch(sc: TableScene): void {
  const v = sc.ses.view();
  const r = v.lastDeal;
  if (!r || r.dealNo <= sc.loggedDeal) return;
  sc.matchLog = logDeal(sc.matchLog, r, v.history);
  sc.loggedDeal = r.dealNo;
  // 单机跟着存档存一份（回大厅再"继续"接着攒）
  if (sc.ses instanceof Session) {
    sc.ses.log = sc.matchLog;
    sc.ses.loggedDeal = r.dealNo;
    sc.ses.save();
  }
}

/** "炸弹狂魔 老张 · 炸了 3 次"；最佳搭档写一队两个人 */
export function titleLine(sc: TableScene, t: Title, why: boolean): string {
  const who = t.pair ? `${seatName(t.seat)}、${seatName((t.seat + 2) % 4)}` : seatName(t.seat);
  return `${TITLE_INFO[t.id].name} ${who}${why ? ` · ${t.why}` : ''}`;
}

/**
 * 好友房这一场的奖（src/net/awards.ts）：按房间下发的公开记录算，画面座位。单机、房间没有记录、一副都没打完时是 null。
 * gameWinner 是过了 A 的队，没人过 A 时是 -1（按赢的副数算）
 */
export function roomAwards(sc: TableScene, gameWinner: number): Award[] | null {
  const log = sc.net?.matchLog;
  if (!log) return null;
  const a = matchAwards(log, winnerOf(log, gameWinner));
  return a.length ? a : null;
}

/** 颁奖那一排：每个奖一张卡（奖名大字、头像和名字、一句话），居中排开 */
export function addAwards(sc: TableScene, b: Phaser.GameObjects.Container, y: number, awards: readonly Award[]): void {
  const w = 220;
  const gap = 16;
  awards.forEach((a, i) => {
    const x = (i - (awards.length - 1) / 2) * (w + gap);
    const g = sc.add.graphics();
    g.fillStyle(COLOR.paper, 1).fillRoundedRect(x - w / 2, y - 74, w, 148, 14);
    g.lineStyle(3, a.id === 'unlucky' ? COLOR.wood : COLOR.gold, 1).strokeRoundedRect(x - w / 2, y - 74, w, 148, 14);
    b.add(g);
    b.add(text(sc, x, y - 46, AWARD_NAME[a.id], { size: TYPE.title, bold: true, color: a.id === 'unlucky' ? COLOR.wood : COLOR.redDark }));
    b.add(sc.add.image(x - 70, y - 2, texOr(sc, `avatar:${seatPerson(a.seat)}:${a.id === 'unlucky' ? 'sad' : 'happy'}`)).setDisplaySize(48, 48));
    b.add(text(sc, x + 20, y - 2, seatName(a.seat), { size: TYPE.label, bold: true, color: teamOf(a.seat) === 0 ? COLOR.teamUs : COLOR.teamThem }));
    b.add(text(sc, x, y + 40, a.line, { size: TYPE.small, color: COLOR.ink, wrap: w - 20 }));
  });
  b.setData('awards', awards);
}

/**
 * 实盘一场的结算（2.1 第 5、6 步）：先显示这一场的分和筹码，同时去带回钱包；带回成功后写钱包还有多少，到顶了另写一句。
 * 两个按钮一样大、一样颜色，不自动开下一场，没有倒计时（第 5 节）。输了不放失败音效。
 */
/** toLobby：中途"现在结算，回大厅"——带回了（或者记进存档等下次结）就去大厅，出错就停在这页让人看清 */
export function showStakeResult(sc: TableScene, toLobby = false): void {
  const st = sc.stake!;
  const save = st.stake;
  const done = save.settle!;
  const rules = rulesOf(save.match.rules);
  const pv = pointValue(save.tier, rules);
  const v = sc.ses.view();
  audio.music('off');
  audio.sfx(done.points > 0 ? 'levelUp' : 'pass');
  const m = modal(sc, 780, 500, undefined, { closeBtn: false, depth: 5000 });
  sc.openOverlay('stake', m);
  const b = m.body;
  const head = done.points === 0 ? '这场打平，0 分' : `这场 ${signed(done.points)} 分，${signed(done.points * pv)}`;
  b.add(text(sc, 0, -170, `实盘 · ${TIER_NAME[save.tier]}`, { size: TYPE.label, bold: true, color: COLOR.muted }));
  sc.addShare(b, 340, -200, { kind: 'stake', tier: save.tier, points: done.points, chips: done.points * pv, deals: done.deals, room: null });
  b.add(text(sc, 0, -122, head, { size: TYPE.big, bold: true, color: done.points > 0 ? COLOR.green : done.points < 0 ? COLOR.red : COLOR.ink }));
  const why =
    v.phase === 'gameOver'
      ? `${v.winner === 0 ? '我方' : '对方'}先过了 A，这一场提前结束`
      : Math.abs(done.points) >= rules.pps
        ? '碰到封顶，这一场提前结束'
        : done.deals < rules.soloDeals
          ? `打了 ${done.deals} 副，按现在的分带回`
          : `打满 ${rules.soloDeals} 副`;
  b.add(text(sc, 0, -66, why, { size: TYPE.label, color: COLOR.ink }));
  const status = text(sc, 0, -14, '正在带回…', { size: TYPE.body, bold: true, color: COLOR.ink, wrap: 700 });
  b.add(status);
  const capLine = text(sc, 0, 32, '', { size: TYPE.label, bold: true, color: COLOR.redDark, wrap: 700 });
  b.add(capLine);
  b.add(text(sc, 0, 210, STAKE_TEXT.noCash, { size: TYPE.small, color: COLOR.muted }));
  const again = new Button(sc, -140, 120, 240, 64, '再来一场', 'wood', () => void sc.stakeAgain(save.tier, status, again), 'restart');
  const home = new Button(sc, 140, 120, 240, 64, '回首页', 'wood', () => sc.scene.start('title'), 'back');
  again.setEnabled(false);
  home.setEnabled(false);
  b.add([again, home]);
  b.setData('again', again);
  b.setData('home', home);
  void settleStake(save).then((r) => {
    sc.stakeOutcome = r;
    if (!sc.alive || !status.scene) return;
    home.setEnabled(true);
    if (r.kind === 'done') {
      status.setText(r.balance === null ? '已经带回钱包' : `已经带回钱包，钱包还有 ${fmtChips(r.balance)}`);
      if (r.capped > 0) capLine.setText(STAKE_TEXT.capped(r.capped));
      again.setEnabled(true);
    } else if (r.kind === 'gone') {
      status.setText(STAKE_TEXT.gone);
      again.setEnabled(true);
    } else if (r.kind === 'expired') {
      status.setText(STAKE_ERROR.expired!);
      again.setEnabled(true);
    } else if (r.kind === 'later') {
      status.setText(STAKE_TEXT.settleLater);
    } else {
      status.setText(stakeError(r.error));
      return;
    }
    if (toLobby) {
      status.setText(`${status.text}，正在回${lobbyName()}…`);
      sc.time.delayedCall(NOTICE_MS, () => goLobby());
    }
  });
}

/** 每日挑战一场的结算页：这一场的分、交分的结果；"再打一次"用同一天同一个种子重开 */
export function showDailyResult(sc: TableScene): void {
  const dl = sc.dailyRun!;
  const score = dl.result!;
  dl.achieve({ kind: 'gd-daily' });
  sc.showUnlocked();
  audio.music('off');
  audio.sfx(score > 0 ? 'levelUp' : 'pass');
  const m = modal(sc, 780, 460, undefined, { closeBtn: false, depth: 5000 });
  sc.openOverlay('gameOver', m);
  const b = m.body;
  b.add(text(sc, 0, -150, `每日挑战 · ${dl.daily}`, { size: TYPE.label, bold: true, color: COLOR.muted }));
  b.add(text(sc, 0, -90, score === 0 ? '这场打平，0 分' : `这场 ${signed(score)} 分`, { size: TYPE.big, bold: true, color: score > 0 ? COLOR.green : score < 0 ? COLOR.red : COLOR.ink }));
  const v = sc.ses.view();
  const n = dl.match.deals.length;
  const why = v.phase === 'gameOver' ? `${v.winner === 0 ? '我方' : '对方'}先过了 A，这一场提前结束` : `打满 ${n} 副`;
  b.add(text(sc, 0, -36, n < GD_DAILY_DEALS && v.phase !== 'gameOver' ? `打了 ${n} 副` : why, { size: TYPE.label, color: COLOR.ink }));
  // 打完交一次分（重建画面再弹一次也不重交），结果写在这一行
  const line = text(sc, 0, 20, '正在交到今天的榜…', { size: TYPE.body, bold: true, color: COLOR.ink, wrap: 700 });
  b.add(line);
  if (!dl.sent) {
    dl.sent = true;
    dl.submit = submitGdDaily(dl.daily, score);
  }
  void dl.submit?.then((r) => {
    if (line.active) line.setText(dailySubmitText(r, score));
  });
  const again = new Button(sc, 140, 120, 240, 64, '再打一次', 'red', () => {
    m.close();
    app.session = DailySession.start(dl.daily);
    sc.scene.restart();
  }, 'restart');
  const home = new Button(sc, -140, 120, 240, 64, '回首页', 'wood', () => sc.scene.start('title'), 'back');
  b.add([again, home]);
  b.setData('again', again);
  b.setData('home', home);
}

/**
 * 好友房实盘一场的结算（3.2）：我的分和筹码、每个人的输赢；带回由房间去钱包办，办完这一行字跟着房间的帧变成"已经带回钱包"。
 * 再打要重新开房（和娱乐房间打完一样）。
 */
export function showNetStakeResult(sc: TableScene): void {
  const ns = sc.netStake!;
  const watch = sc.watching;
  const me = ns.seats[0]!;
  const rules = rulesOf(ns.rules);
  const pv = pointValue(ns.tier, rules);
  const v = sc.ses.view();
  audio.music('off');
  audio.sfx(me.paid === 'yes' && me.points > 0 ? 'levelUp' : 'pass');
  // 颁奖：有奖时弹窗加高，奖那一排插在"为什么结束"和每个人的分之间，下面整体往下挪
  const awards = sc.roomAwards(v.phase === 'gameOver' ? v.winner : -1);
  const dy = awards ? 170 : 0;
  const top = awards ? -80 : 0;
  const m = modal(sc, 780, 520 + dy, undefined, { closeBtn: false, depth: 5000 });
  sc.openOverlay('stake', m);
  const b = m.body;
  if (awards) sc.addAwards(b, -72, awards);
  b.add(text(sc, 0, top - 196, `好友房实盘 · ${TIER_NAME[ns.tier]}`, { size: TYPE.label, bold: true, color: COLOR.muted }));
  // 没带上的人（不计输赢）没有可分享的
  if (!watch && me.paid === 'yes') sc.addShare(b, 340, top - 210, { kind: 'stake', tier: ns.tier, points: me.points, chips: me.points * pv, deals: ns.deals, room: sc.shareRoom() }, awards);
  const head = watch ? '这一场打完了' : me.paid !== 'yes' ? '这一场不计输赢' : me.points === 0 ? '这场打平，0 分' : `这场 ${signed(me.points)} 分，${signed(me.points * pv)}`;
  b.add(text(sc, 0, top - 148, head, { size: TYPE.big, bold: true, color: me.paid !== 'yes' ? COLOR.ink : me.points > 0 ? COLOR.green : me.points < 0 ? COLOR.red : COLOR.ink }));
  const why = v.phase === 'gameOver' ? `${sc.side(v.winner)}先过了 A，这一场提前结束` : ns.deals >= rules.roomDeals ? `打满 ${rules.roomDeals} 副` : '这一场提前结束';
  b.add(text(sc, 0, top - 96, why, { size: TYPE.label, color: COLOR.ink }));
  // 每个人：到账的写分，别的写"不计输赢"（电脑是庄家的）
  [0, 1, 2, 3].forEach((seat, i) => {
    const s = ns.seats[seat]!;
    const x = -270 + i * 180;
    b.add(sc.add.image(x, top + dy - 30, texOr(sc, `avatar:${seatPerson(seat)}:normal`)).setDisplaySize(64, 64));
    b.add(text(sc, x, top + dy + 16, seatName(seat), { size: TYPE.small, bold: true, color: teamOf(seat) === 0 ? COLOR.teamUs : COLOR.teamThem }));
    // 从没带入过的是开局时的电脑座位（庄家的）
    const line = s.paid === 'yes' ? `${signed(s.points)} 分` : s.paid === 'left' ? `${signed(s.points)} 分（中途走了）` : s.paid === 'no' ? '电脑' : '不计输赢';
    b.add(text(sc, x, top + dy + 44, line, { size: TYPE.small, bold: s.paid === 'yes' || s.paid === 'left', color: s.paid === 'yes' || s.paid === 'left' ? signColor(s.points) : COLOR.ink }));
  });
  sc.netStakeStatus = text(sc, 0, top + dy + 96, '', { size: TYPE.body, bold: true, color: COLOR.ink, wrap: 700 });
  b.add(sc.netStakeStatus);
  sc.refreshNetStake();
  b.add(new Button(sc, 0, top + dy + 168, 260, 64, '回首页', 'red', () => sc.leaveRoom(), 'back'));
  b.add(text(sc, 0, top + dy + 228, STAKE_TEXT.noCash, { size: TYPE.small, color: COLOR.muted }));
}

/** 结算页的"再来一场"：还是这一档，重新带入 */
export async function stakeAgain(sc: TableScene, tier: StakeSession['tier'], status: Phaser.GameObjects.Text, btn: Button): Promise<void> {
  btn.setEnabled(false);
  status.setText('正在进场…');
  const r = await buyinStake(tier);
  if (!sc.alive) return;
  if (r.ok) {
    app.session = r.ses;
    sc.scene.restart();
    return;
  }
  // 带入没成（钱不够、已在另一桌、没登录……）：写出原因，稍等一下回选档页，让人换档或去看钱包
  const msg = stakeError(r.error);
  status.setText(msg);
  sc.time.delayedCall(NOTICE_MS, () => sc.alive && backToPicker(sc, 'guandan', msg));
}
