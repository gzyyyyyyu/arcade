/** 斗地主牌桌上的按钮、顶栏、残局条、记牌器、互动和按钮刷新（从 DdzScene.ts 拆出，只搬家；函数接收场景实例）。 */
import type Phaser from 'phaser';
import { TableFun, funItem, type FunSeat } from 'arcade-kit/table-fun';
import { personById } from 'arcade-kit/personas';
import { localChat } from 'arcade-kit/chat';
import { currentMult, decideDdz, sortDdz } from '../../variants/doudizhu/index.ts';
import { MOOD_LINES, PHRASES } from '../../net/fun-text.ts';
import { taunt } from '../../net/emotes.ts';
import { audio } from '../common/audio.ts';
import { DDZ_ME, type DdzTableSession } from './session.ts';
import { DailyPuzzleSession } from './puzzle.ts';
import { clockText } from '../common/share-card.ts';
import { DDZ_PUZZLES } from '../../variants/doudizhu/puzzles/puzzles.ts';
import { DdzStakeSession } from './stake.ts';
import { ROOM_STAKE_TEXT, TIER_NAME, roomWhy } from '../common/stake-text.ts';
import { pointValue as ddzPointValue } from '../../variants/doudizhu/stake/index.ts';
import { tableRules } from '../../variants/doudizhu/net/stake.ts';
import { LOW_MEMORY } from '../common/device.ts';
import { seatIdentity, seatName, seatPerson } from '../common/labels.ts';
import { lobbyName } from '../common/platform.ts';
import { getSettings, updateSettings } from '../store.ts';
import { COLOR, TYPE, minDrawH, minHit, phoneType, GAME_HEIGHT } from '../common/theme.ts';
import { rankName } from '../../core/cards.ts';
import { countLeftDdz } from './counter.ts';
import { CardView } from '../table/card.ts';
import { BUTTON_Y as TABLE_BUTTON_Y, DDZ_BUTTON_DROP, DDZ_BUTTONS, DDZ_COUNTER, DDZ_FUN, DDZ_FUN_POLL_MS, DDZ_PUZZLE_TIP, DDZ_STAKE_BAR, DDZ_TOPBAR, DDZ_TOPMID, FUN_UI, ME_AVATAR, STATUS_PILL, TOPBAR, TOPBAR_H } from '../table/layout.ts';
import { hasLayer } from '../ui/focus.ts';
import { Button, fitWidth, iconButton, setHit, setTopHit, signedLine, text, worldW } from '../ui/kit.ts';
import { openInvitePanel } from '../common/social.ts';
import type { DdzScene } from '../scenes/DdzScene.ts';

/** 斗地主手牌横排一行，比掼蛋的分列矮一截：操作按钮那排跟着往下挪，贴近手牌（掼蛋不变） */
export const BUTTON_Y = TABLE_BUTTON_Y + DDZ_BUTTON_DROP;

/** 纸签（和掼蛋的记牌器同色） */
const PAPER = 0xf3e4c4;
const PAPER_INK = 0x3a2414;
/** 叫分按钮：0 = 不叫 */
const BIDS = [0, 1, 2, 3] as const;


export function buildButtons(sc: DdzScene, W: number): void {
  const cx = W / 2;
  // 一屏只有一个红色主按钮（出牌；叫分时是"3 分"，明牌时是"明牌 ×2"）：提示是次要的木色，不要、理牌、重选是弱按钮；手机上画出来的高度不低于 36 CSS 像素（minDrawH）
  const rh = Math.max(DDZ_BUTTONS.mainH, minDrawH());
  const sh = Math.max(DDZ_BUTTONS.weakH, minDrawH());
  sc.btnPass = new Button(sc, cx - DDZ_BUTTONS.mainDx, BUTTON_Y, DDZ_BUTTONS.mainW, rh, '不要', 'quiet', () => sc.onPass(), 'pass');
  sc.btnHint = new Button(sc, cx, BUTTON_Y, DDZ_BUTTONS.mainW, rh, '提示', 'wood', () => sc.onHint(), 'hint');
  sc.btnPlay = new Button(sc, cx + DDZ_BUTTONS.mainDx, BUTTON_Y, DDZ_BUTTONS.mainW, rh, '出牌', 'red', () => sc.onPlay(), 'play');
  const mh = minHit();
  const sortX = Math.max(cx - DDZ_BUTTONS.weakDx, ME_AVATAR.x + Math.max(ME_AVATAR.size, mh) / 2 + Math.max(DDZ_BUTTONS.funMinW, mh) + Math.max(DDZ_BUTTONS.weakW, mh) / 2);
  sc.btnSort = new Button(sc, sortX, BUTTON_Y + DDZ_BUTTONS.weakDy, DDZ_BUTTONS.weakW, sh, '理牌', 'quiet', () => sc.onSort(), 'sort');
  sc.btnClear = new Button(sc, cx + DDZ_BUTTONS.weakDx, BUTTON_Y + DDZ_BUTTONS.weakDy, DDZ_BUTTONS.weakW, sh,'重选', 'quiet', () => sc.onClear(), 'undo');
  // 叫分：四个按钮一排，比当前分低的灰掉；叫分时也能理牌，整排让开"理牌"
  const bid0 = Math.max(cx - 1.5 * DDZ_BUTTONS.bidStep, sortX + DDZ_BUTTONS.weakW / 2 + DDZ_BUTTONS.bidGap + DDZ_BUTTONS.bidW / 2);
  BIDS.forEach((b, i) => {
    const btn = new Button(sc, bid0 + i * DDZ_BUTTONS.bidStep, BUTTON_Y, DDZ_BUTTONS.bidW, rh,b === 0 ? '不叫' : `${b} 分`, b === 0 ? 'wood' : b === 3 ? 'red' : 'gold', () => sc.act({ type: 'bid', seat: DDZ_ME, bid: b }));
    sc.bidBtns.push(btn);
    sc.reg(`bid:${b}`, btn);
  });
  // 明牌：地主拿到底牌后选一次，亮牌输赢翻倍
  sc.showBtns = [
    new Button(sc, cx - DDZ_BUTTONS.showDx, BUTTON_Y, DDZ_BUTTONS.showW, rh, '不明牌', 'quiet', () => sc.act({ type: 'show', seat: DDZ_ME, open: false })),
    new Button(sc, cx + DDZ_BUTTONS.showDx, BUTTON_Y, DDZ_BUTTONS.showW, rh,'明牌 ×2', 'red', () => sc.act({ type: 'show', seat: DDZ_ME, open: true }), 'play'),
  ];
  sc.reg('show:0', sc.showBtns[0]!);
  sc.reg('show:1', sc.showBtns[1]!);
  for (const b of [sc.btnPass, sc.btnHint, sc.btnPlay, sc.btnSort, sc.btnClear, ...sc.bidBtns, ...sc.showBtns]) b.setDepth(400);
  sc.reg('pass', sc.btnPass);
  sc.reg('hint', sc.btnHint);
  sc.reg('play', sc.btnPlay);
  sc.reg('sort', sc.btnSort);
  sc.reg('clear', sc.btnClear);
  // 连着两手没自己出，房间每手几秒就替我出：点一下恢复；旁观的有座位可坐时出"坐下"（坐下后会话换座位、牌桌整个重画）
  const net = sc.net;
  if (net) {
    sc.btnBack = new Button(sc, cx, BUTTON_Y - DDZ_BUTTONS.backDy, DDZ_BUTTONS.backW, DDZ_BUTTONS.backH, '我回来了', 'green', () => {
      net.back();
      sc.btnBack?.setVisible(false);
    }).setDepth(401).setVisible(false);
    sc.btnSit = new Button(sc, cx, BUTTON_Y, DDZ_BUTTONS.backW, DDZ_BUTTONS.backH, '坐下', 'red', () => {
      const seat = net.freeSeat();
      if (seat !== null) net.sit(seat);
    }).setDepth(401).setVisible(false);
    sc.reg('back', sc.btnBack);
    sc.reg('sit', sc.btnSit);
  }
  sc.statusBg = sc.add.graphics().setDepth(399);
  sc.status = text(sc, cx, BUTTON_Y - rh / 2 - STATUS_PILL.halfH - STATUS_PILL.gap, '', { size: TYPE.label, color: 0xfff3d6, bold: true }).setDepth(400);
}

/** 好友房（不是匹配桌）"大厅"右边摆"叫朋友来"，聊天按钮往右让一格；和掼蛋同一组数（TOPBAR、FUN_UI） */
function inviteShift(sc: DdzScene): number {
  return sc.net && !sc.net.match ? Math.max(FUN_UI.iconMinW, minHit()) + FUN_UI.chatGap : 0;
}

export function buildTopBar(sc: DdzScene, W: number): void {
  const c = sc.beginTopBar(W);
  sc.stakeLeft = null;
  sc.counterBottom = 0;
  const deep = Math.max(DDZ_TOPBAR.lobbyHitMinH, minHit());
  const lobby = new Button(sc, DDZ_TOPBAR.lobbyX, DDZ_TOPBAR.midY, DDZ_TOPBAR.lobbyW, DDZ_TOPBAR.lobbyH, lobbyName(), 'wood', () => sc.onLobby(), 'home');
  setTopHit(lobby, DDZ_TOPBAR.lobbyW, deep);
  c.add(lobby);
  sc.reg('lobby', lobby);
  // 好友房开打以后也能叫朋友（0.40.2，掼蛋 0.6.1 就有）：中途进来的人接管电脑的座位
  const net = sc.net;
  if (net && !net.match) {
    const lp = Math.max(FUN_UI.iconMinW, minHit());
    const inv = iconButton(sc, TOPBAR.lobbyRight + lp / 2 + TOPBAR.inviteGap, DDZ_TOPBAR.midY, 'invite', () => void openInvitePanel(net.code, '斗地主'), TOPBAR.inviteSize, '邀请');
    setTopHit(inv, lp, deep);
    c.add(inv);
    sc.reg('invite', inv);
  }
  // 中间：底分 × 倍数，和底牌（叫完才翻开）；残局写"残局 第 n 关 · 关名"
  const v = sc.ses.view();
  const mx = W / 2;
  const pz = sc.puzzle;
  if (pz instanceof DailyPuzzleSession) {
    // 今日残局：题名 + 用时（第一手出牌起走表，出完停）
    const t = fitWidth(text(sc, mx, DDZ_TOPBAR.midY, sc.dailyTopText(pz), { size: TYPE.label, bold: true, color: COLOR.goldLight }), Math.max(DDZ_TOPBAR.midMinW, W - 2 * DDZ_TOPBAR.midSide));
    c.add(t);
    sc.dailyClock = t;
    // 顶栏重建时换掉旧的走表，不然每重建一次多一个每秒的回调
    sc.dailyTimer?.remove();
    sc.dailyTimer = sc.time.addEvent({ delay: DDZ_TOPBAR.clockTickMs, loop: true, callback: () => sc.tickDailyClock(pz) });
  } else if (pz) {
    const n = DDZ_PUZZLES.findIndex((x) => x.id === pz.puzzle.id) + 1;
    c.add(fitWidth(text(sc, mx, DDZ_TOPBAR.midY, `残局 第 ${n} 关 · ${pz.puzzle.name}`, { size: TYPE.label, bold: true, color: COLOR.goldLight }), Math.max(DDZ_TOPBAR.midMinW, W - 2 * DDZ_TOPBAR.midSide)));
  } else sc.buildTopMid(c, v, mx);
  // 右边：回首页、设置、规则，加云存档；图标和顺序在 TableSceneBase.buildTopIcons，和掼蛋一样（残局多一个"重来"，不摆云存档）
  const { items } = sc.buildTopIcons(c, W, {
    leftLimit: mx + DDZ_TOPBAR.iconsLeftDx,
    extra: pz ? [{ icon: 'restart', name: 'puzzle:restart', tip: '重来', fn: () => sc.restartPuzzle(pz.puzzle) }] : [],
  });
  for (const [name, b] of items) sc.reg(name, b);
  sc.topKey = sc.topBarKey(W);
  sc.counterBox = null;
  if (pz) return;
  sc.buildNetStake(c, W);
  sc.counterBox = sc.add.container(0, 0);
  c.add(sc.counterBox);
  sc.buildCounter(sc.counterBox, W, v);
}

/**
 * 顶栏里除了记牌器以外的东西都由这些决定：没变就不重建。记牌器每出一手都变，单独放在 counterBox 里重画——
 * 以前每出一手都整个重建顶栏，按下时还是旧按钮、抬起时已经换成新按钮，"大厅""设置"等偶尔点了没反应（和掼蛋同一个毛病）。
 */
export function topBarKey(sc: DdzScene, W: number): string {
  const v = sc.ses.view();
  const ns = sc.netStake;
  const me = ns?.seats[DDZ_ME];
  const pz = sc.puzzle;
  return JSON.stringify([
    W, phoneType(), sc.watching, pz?.puzzle.id ?? null, pz instanceof DailyPuzzleSession,
    sc.shownMult(v), v.landlord, v.bid, v.bids, v.bottom, getSettings().back, v.dealNo, v.deals, v.noShuffle,
    ns ? [ns.tier, ns.deals, ns.over, ns.why, me?.paid, me?.points] : null,
  ]);
}

/** 牌局每一步之后刷新顶栏：内容没变只重画记牌器 */
export function refreshTopBar(sc: DdzScene): void {
  const W = worldW(sc);
  if (!sc.top?.active || sc.topBarKey(W) !== sc.topKey) return sc.buildTopBar(W);
  // 残局没有记牌器
  if (sc.puzzle) return;
  if (!sc.counterBox?.active) return sc.buildTopBar(W);
  sc.counterBox.removeAll(true);
  sc.counterBottom = 0;
  sc.buildCounter(sc.counterBox, W, sc.ses.view());
}

export function dailyTopText(sc: DdzScene, pz: DailyPuzzleSession): string {
  return `今日残局 · ${pz.puzzle.name} · 用时 ${clockText(pz.elapsedMs())}`;
}

export function tickDailyClock(sc: DdzScene, pz: DailyPuzzleSession): void {
  const t = sc.dailyClock;
  if (t?.active) t.setText(sc.dailyTopText(pz));
}

/** 顶栏的倍数：一副刚打完时用结算的倍数（春天、反春的 ×2 打完才知道，currentMult 算不到），不等结算页才翻 */
export function shownMult(sc: DdzScene, v: ReturnType<DdzTableSession['view']>): number {
  const last = v.results[v.results.length - 1];
  return (v.phase === 'dealEnd' || v.phase === 'gameOver') && last ? last.mult : currentMult(v);
}

/** 顶栏中间：底分 × 倍数、底牌、第几副 */
export function buildTopMid(sc: DdzScene, c: Phaser.GameObjects.Container, v: ReturnType<DdzTableSession['view']>, mx: number): void {
  const mult = sc.shownMult(v);
  const bid = v.landlord >= 0 ? v.bid : Math.max(0, ...v.bids.map((b) => b ?? 0));
  const label = bid > 0 ? `${bid} 分 × ${mult} 倍` : mult > 1 ? `× ${mult} 倍` : '叫分中';
  c.add(text(sc, mx - DDZ_TOPMID.labelDx, DDZ_TOPBAR.midY, label, { size: TYPE.label, bold: true, color: COLOR.goldLight, ox: 1 }));
  const bottom = v.bottom.length ? sortDdz(v.bottom) : [-1, -1, -1];
  bottom.forEach((card, i) => {
    const x = mx + DDZ_TOPMID.bottomX0 + i * DDZ_TOPMID.bottomStep;
    if (card >= 0) c.add(new CardView(sc, x, DDZ_TOPBAR.midY, card, 0, DDZ_TOPMID.cardH));
    else c.add(sc.add.image(x, DDZ_TOPBAR.midY, `back:${getSettings().back}`).setDisplaySize(DDZ_TOPMID.backW, DDZ_TOPMID.backH));
  });
  c.add(text(sc, mx + DDZ_TOPMID.dealDx, DDZ_TOPBAR.midY, `${sc.ses instanceof DdzStakeSession ? `实盘 · ${TIER_NAME[sc.ses.tier]} · ` : sc.ses.daily ? '每日 · ' : v.noShuffle ? '不洗牌 · ' : ''}第 ${v.dealNo}/${v.deals} 副`, { size: TYPE.small, color: 0xd8c6a6, ox: 0 }));
}

/**
 * 残局的画面：顶上一条关卡提示；两家农民的手牌摊开成一排小牌，在各自头像下面、名牌之下（右家靠右、左家靠左，各自对齐头像外沿）。
 * 位置躲开：头像和名牌到 ay+77 为止，牌排中心在 ay+118（上沿 ay+87）；"提示 / 出牌"那排按钮上沿是 BUTTON_Y-30，牌排下沿（ay+149）比它高约 76；
 * 出牌区在头像朝桌心的一侧（py = ay），中间我的出牌区在 x 居中，三者互不相交。
 */
export function buildPuzzle(sc: DdzScene, W: number): void {
  const p = sc.puzzle!.puzzle;
  const t = fitWidth(text(sc, 0, 0, p.tip, { size: TYPE.label, color: COLOR.goldLight }), W - DDZ_PUZZLE_TIP.widthCut);
  const bw = t.width + DDZ_PUZZLE_TIP.padX;
  const c = sc.add.container(W / 2, TOPBAR_H + DDZ_PUZZLE_TIP.dy).setDepth(450);
  const g = sc.add.graphics();
  g.fillStyle(0x1a0e07, 0.78).fillRoundedRect(-bw / 2, -DDZ_PUZZLE_TIP.h / 2, bw, DDZ_PUZZLE_TIP.h, DDZ_PUZZLE_TIP.h / 2);
  g.lineStyle(1.5, COLOR.gold, 0.7).strokeRoundedRect(-bw / 2, -DDZ_PUZZLE_TIP.h / 2, bw, DDZ_PUZZLE_TIP.h, DDZ_PUZZLE_TIP.h / 2);
  c.add([g, t]);
  sc.drawOpenHands();
}

/** 好友房实盘：顶栏下面靠右一条，我这个座位的本场分和筹码；带入被拒（或走了又回来）旁边有"重新带入" */
export function buildNetStake(sc: DdzScene, c: Phaser.GameObjects.Container, W: number): void {
  const ns = sc.netStake;
  if (!ns) return;
  const me = ns.seats[DDZ_ME]!;
  const r = tableRules(ns);
  const paid = !sc.watching && me.paid === 'yes';
  const tail = sc.watching ? '旁观' : paid ? '本场 {0} 分（{1}）' : me.paid === 'pending' ? ROOM_STAKE_TEXT.pending : roomWhy(ns.why ?? '');
  // 本场的分和筹码红绿（深色条子上用亮一档的），其余字照旧金色
  const t = signedLine(sc, W - DDZ_STAKE_BAR.right, TOPBAR_H + DDZ_STAKE_BAR.textDy, `实盘 · ${TIER_NAME[ns.tier]} · 打完 ${ns.deals}/${r.roomDeals} 副 · ${tail}`, paid ? [me.points, me.points * ddzPointValue(ns.tier, r)] : [], { size: TYPE.small, bold: true, color: COLOR.goldLight, ox: 1, dark: true });
  const pg = sc.add.graphics();
  pg.fillStyle(0x1a0e07, 0.7).fillRoundedRect(W - t.width - DDZ_STAKE_BAR.pillLeft, TOPBAR_H + DDZ_STAKE_BAR.pillDy, t.width + DDZ_STAKE_BAR.pillPadW, DDZ_STAKE_BAR.pillH, DDZ_STAKE_BAR.pillH / 2);
  pg.lineStyle(1.5, COLOR.gold, 0.7).strokeRoundedRect(W - t.width - DDZ_STAKE_BAR.pillLeft, TOPBAR_H + DDZ_STAKE_BAR.pillDy, t.width + DDZ_STAKE_BAR.pillPadW, DDZ_STAKE_BAR.pillH, DDZ_STAKE_BAR.pillH / 2);
  c.add([pg, t]);
  sc.stakeLeft = W - t.width - DDZ_STAKE_BAR.pillLeft;
  if (!sc.watching && !ns.over && (me.paid === 'refused' || me.paid === 'left') && ns.why !== 'need_two') {
    const btn = new Button(sc, W - t.width - DDZ_STAKE_BAR.rebuyDx, TOPBAR_H + DDZ_STAKE_BAR.textDy, DDZ_STAKE_BAR.rebuyW, DDZ_STAKE_BAR.rebuyH, '重新带入', 'gold',() => sc.net?.rebuy(), 'restart');
    c.add(btn);
    sc.reg('rebuy', btn);
    sc.stakeLeft = W - t.width - DDZ_STAKE_BAR.rebuyLeftDx;
  }
}

/**
 * 记牌器（和掼蛋同一个设置开关）：顶栏下面居中一排，大王、小王、2、A……3 每种还有几张没露面，出完的变淡，剩 4 张（炸弹级）标红。
 * 叫分时不画。位置在顶栏和左右两家座位之间的空档；好友房的实盘条在右边，就整条往左让。点一下收成小签，再点展开。
 */
export function buildCounter(sc: DdzScene, c: Phaser.GameObjects.Container, W: number, v: ReturnType<DdzTableSession['view']>): void {
  if (v.phase !== 'play') return;
  const phone = phoneType();
  const cells = countLeftDdz(v);
  const cw = DDZ_COUNTER.cellW[phone ? 1 : 0];
  const h = DDZ_COUNTER.barH[phone ? 1 : 0];
  const y0 = TOPBAR_H + DDZ_COUNTER.dy;
  const w = cells.length * cw + DDZ_COUNTER.padW;
  const place = (bw: number): number => Math.max(DDZ_COUNTER.pad, Math.min(W / 2 - bw / 2, (sc.stakeLeft ?? W) - DDZ_COUNTER.pad - bw));
  const toggle = (): void => {
    updateSettings({ counter: !getSettings().counter });
    sc.buildTopBar(worldW(sc));
  };
  const g = sc.add.graphics();
  c.add(g);
  if (!getSettings().counter) {
    const t = text(sc, 0, y0 + DDZ_COUNTER.tabTextDy, '记牌', { size: TYPE.small, bold: true, color: PAPER_INK, ox: 0 });
    const bw = t.width + DDZ_COUNTER.tabPad;
    const x0 = place(bw);
    t.setX(x0 + 14);
    g.fillStyle(0x000000, 0.3).fillRoundedRect(x0 + 2, y0 + 3, bw, DDZ_COUNTER.tabH, 6);
    g.fillStyle(PAPER, 0.96).fillRoundedRect(x0, y0, bw, DDZ_COUNTER.tabH, 6);
    g.lineStyle(1.5, COLOR.goldDark, 0.8).strokeRoundedRect(x0, y0, bw, DDZ_COUNTER.tabH, 6);
    const z = sc.add.zone(x0, y0, bw, DDZ_COUNTER.tabHitH).setOrigin(0, 0).setInteractive({ useHandCursor: true });
    // 点按区只往下扩到够 44 CSS 像素，往上会压着顶栏
    setHit(z, Math.max(bw, minHit()), Math.max(DDZ_COUNTER.tabHitH, minHit()));
    z.setPosition(x0, y0);
    z.on('pointerdown', toggle);
    c.add([t, z]);
    sc.counterBottom = y0 + DDZ_COUNTER.tabHitH;
    return;
  }
  const x0 = place(w);
  g.fillStyle(0x000000, 0.3).fillRoundedRect(x0 + 3, y0 + 4, w, h, 6);
  g.fillStyle(PAPER, 0.96).fillRoundedRect(x0, y0, w, h, 6);
  g.lineStyle(1.5, COLOR.goldDark, 0.8).strokeRoundedRect(x0, y0, w, h, 6);
  cells.forEach((cell, i) => {
    const x = x0 + DDZ_COUNTER.pad + cw * i + cw / 2;
    const bomb = cell.left === 4;
    if (bomb) g.fillStyle(COLOR.red, 0.16).fillRoundedRect(x - cw / 2 + 2, y0 + 3, cw - 4, h - 6, 5);
    const name = cell.rank === 17 ? '大' : cell.rank === 16 ? '小' : rankName(cell.rank === 15 ? 2 : cell.rank);
    const a = cell.left === 0 ? 0.3 : 1;
    c.add(text(sc, x, y0 + DDZ_COUNTER.nameDy[phone ? 1 : 0], name, { size: 16, bold: true, color: bomb || cell.rank >= 16 ? COLOR.red : 0x6a4a2a }).setAlpha(a));
    c.add(text(sc, x, y0 + DDZ_COUNTER.leftDy[phone ? 1 : 0], String(cell.left), { size: 19, bold: true, font: 'num', color: bomb ? COLOR.red : PAPER_INK }).setAlpha(a));
  });
  const z = sc.add.zone(x0, y0, w, h).setOrigin(0, 0).setInteractive({ useHandCursor: true });
  setHit(z, w, Math.max(h, minHit()));
  z.setPosition(x0, y0);
  z.on('pointerdown', toggle);
  c.add(z);
  sc.counterBottom = y0 + h;
}

/** 牌桌互动（kit 的 table-fun）：和掼蛋同一套，三个座位；单机在本地播，电脑按性格反应 */
/** "互动"按钮的位置（世界坐标，中心 y 390）：我的头像和"理牌"之间；明牌摊开的手牌也要让开它 */
export function funBox(sc: DdzScene): { left: number; bw: number; bh: number } {
  const mh = minHit();
  const left = ME_AVATAR.x + Math.max(ME_AVATAR.size, mh) / 2;
  const bw = Math.max(48, Math.min(Math.max(DDZ_BUTTONS.funMinW, mh), sc.btnSort.x - sc.btnSort.width / 2 - left));
  return { left, bw, bh: Math.max(64, mh) };
}

export function buildFun(sc: DdzScene, W: number): void {
  const net = sc.net;
  const mh = minHit();
  const { left, bw, bh } = sc.funBox();
  const free = (): boolean => sc.overlay === null && !hasLayer(sc);
  sc.fun = new TableFun({
    storageKey: 'guandan',
    phrases: PHRASES,
    named: [taunt('就这？'), taunt('等着瞧'), taunt('等得花都谢了')],
    seats: () =>
      sc.seats.map((sv, s): FunSeat => {
        const p = sv.plateBox();
        const who = seatPerson(s);
        return {
          rect: sc.screenRect(sv.a),
          ...(p ? { plate: sc.worldRect(p.x, p.y, p.w, p.h) } : {}),
          name: seatName(s),
          me: sc.isMe(s),
          bot: net ? !!seatIdentity[s] && !seatIdentity[s]!.human : s !== DDZ_ME,
          temper: who === 'me' ? 'normal' : personById(who).fun,
        };
      }),
    avoid: () => [sc.worldRect(0, BUTTON_Y - DDZ_FUN.avoidAbove, W, GAME_HEIGHT - BUTTON_Y + DDZ_FUN.avoidAbove)],
    center: () => sc.trick.boxes().map((b) => sc.worldRect(b.x, b.y, b.w, b.h)),
    button: () => sc.worldRect(left, DDZ_FUN.y - bh / 2, bw, bh),
    buttonStyle: () => ({ scale: sc.worldRect(0, 0, 100, 100).width / 100 }),
    // 手机上点按区从屏幕上沿往下 minHit()，画出来的圆钮在顶栏高度内（chatTopStyle）；和掼蛋一样
    chatButton: () => {
      sc.chatTopStyle();
      const ph = phoneType();
      return sc.worldRect(DDZ_FUN.chatX + inviteShift(sc), ph ? 0 : 4, Math.max(DDZ_BUTTONS.funMinW, mh), ph ? mh : Math.max(48, mh));
    },
    // 电脑版聊天默认收成"聊天"小按钮，同一个位置（顶栏"大厅"右边）：kit 自己挑角时会放到"大厅"底下压着它（1280×800 上量过）
    chatDock: () => sc.worldRect(DDZ_FUN.chatX + inviteShift(sc), 4, DDZ_FUN.chatDockW, Math.max(48, mh)),
    chatFolded: () => true,
    // 弹幕在左右两家之间、顶栏下沿到"轮到你"那行上面
    danmakuArea: () => {
      const [l, r] = [sc.seats[2]!, sc.seats[1]!];
      const x0 = l.a.ax + l.a.size / 2 + DDZ_FUN.danmakuGap;
      const x1 = r.a.ax - r.a.size / 2 - DDZ_FUN.danmakuGap;
      const y0 = Math.max(TOPBAR_H + DDZ_FUN.danmakuTop, sc.counterBottom + 4);
      return sc.worldRect(x0, y0, x1 - x0, BUTTON_Y - DDZ_FUN.danmakuBottom - y0);
    },
    lite: () => LOW_MEMORY > 0,
    send: (id, to) => (net ? net.emote(id, to) : sc.funIn(DDZ_ME, id, to)),
    canSend: () => free() && (!net || net.mySeat !== null),
    hintSeat: () => [1, 2].find((s) => !sc.trick.occupied(s)) ?? null,
    enabled: () => getSettings().taunts,
    // 好友房聊天走房间；单机用 kit 的 localChat，只在自己头像旁冒、不发不存
    chat: net
      ? (t: string) => net.chat(t)
      : localChat((t, masked) => {
        audio.sfx('taunt');
        sc.fun?.chat(DDZ_ME, t, masked);
      }),
    // 陌生人桌（快速匹配）设置"聊天"选了"不和陌生人"的：这条连接没带 chat=1，聊天页整个不给
    chatEnabled: () => getSettings().chat && (net?.chatOn ?? true),
    scope: () => net?.code ?? 'ddz-solo',
    localBots: !net,
    moodLines: MOOD_LINES,
    sound: (p, phase) => audio.fun(p, phase),
    onHit: (seat) => sc.seats[seat]?.hit(),
    log: (line) => sc.fxLog.push(line),
  });
  if (net) {
    net.chatSink = (seat, t, masked) => {
      if (sc.isMe(seat) || (getSettings().chat && !sc.fun?.isBlocked(seat))) audio.sfx('taunt');
      sc.fun?.chat(seat, t, masked);
    };
    net.chatErrorSink = (code) => sc.fun?.chatError(code);
  }
  sc.time.addEvent({
    delay: DDZ_FUN_POLL_MS,
    loop: true,
    callback: () => {
      const want = sc.overlay === null && !hasLayer(sc);
      if (want === sc.funShown || !sc.fun) return;
      sc.funShown = want;
      if (want) sc.fun.show();
      else sc.fun.hide();
    },
  });
}

export function funIn(sc: DdzScene, from: number, id: number, to?: number): void {
  const it = funItem(id, PHRASES.length);
  if (it && it.kind !== 'prop' && (sc.isMe(from) || (getSettings().taunts && !sc.fun?.isBlocked(from)))) audio.sfx(it.kind === 'sticker' ? 'sticker' : 'taunt');
  sc.fun?.receive(from, id, to);
}

export function refreshButtons(sc: DdzScene): void {
  if (!sc.alive) return;
  const v = sc.ses.view();
  const mine = sc.myTurn(v);
  const sel = sc.hand.selected();
  const bidding = v.phase === 'bid';
  const playing = v.phase === 'play';
  const showing = v.phase === 'show';
  sc.hand.enabled = mine && playing;
  for (const b of [sc.btnPass, sc.btnHint, sc.btnPlay, sc.btnSort, sc.btnClear]) b.setVisible(playing);
  sc.btnSort.setVisible(playing || bidding || showing);
  for (const b of sc.showBtns) b.setVisible(showing && mine);
  const net = sc.net;
  sc.btnBack?.setVisible(!!net?.afk && sc.overlay === null);
  if (net && sc.watching) {
    // 旁观：没有手牌、不能出手；有能坐的座位出"坐下"
    const sit = net.freeSeat();
    sc.btnSit?.setVisible(sit !== null && sc.overlay === null);
    for (const b of [sc.btnPass, sc.btnHint, sc.btnPlay, sc.btnSort, sc.btnClear, ...sc.bidBtns, ...sc.showBtns]) b.setVisible(false);
    sc.hand.enabled = false;
    sc.setStatus(sit === null ? '旁观中 · 看不到任何人的手牌' : '旁观中 · 看不到任何人的手牌，点"坐下"一起打');
    return;
  }
  sc.btnSit?.setVisible(false);
  sc.btnSort.setText(sc.hand.mode === 'rank' ? '按牌型' : '按点数');
  sc.btnClear.setEnabled(sel.length > 0);
  const top = Math.max(0, ...v.bids.map((b) => b ?? 0));
  BIDS.forEach((b, i) => {
    sc.bidBtns[i]!.setVisible(bidding && mine).setEnabled(b === 0 || b > top);
  });
  if (!mine) {
    for (const b of [sc.btnPass, sc.btnHint, sc.btnPlay]) b.setEnabled(false);
    if (sc.ses.autoplay) sc.setStatus('托管中');
    else if (bidding && v.turn >= 0 && !sc.busy) sc.setStatus(`等 ${seatName(v.turn)} 叫分`);
    else if (showing && v.turn >= 0 && !sc.busy) sc.setStatus(`${seatName(v.turn)} 在想要不要明牌`);
    else if (playing && v.turn >= 0 && v.turn !== DDZ_ME && !sc.busy) sc.setStatus(`等 ${seatName(v.turn)} 出牌`);
    else sc.setStatus('');
    return;
  }
  if (bidding) {
    // 新手不知道这手牌该叫几分：照电脑「普通」档的叫法给一句建议（和出牌的「提示」一样只是建议，按钮照常都能点）
    const adv = decideDdz(v, 'normal', 0);
    const want = adv?.type === 'bid' ? adv.bid : 0;
    const say = want === 0 ? '不叫' : `叫 ${want} 分`;
    sc.setStatus(top > 0 ? `现在 ${top} 分 · 这手牌建议${say}` : `这手牌建议${say}（分越高，输赢越大）`);
    return;
  }
  if (showing) {
    sc.setStatus('明牌：手牌亮给两家看，这副输赢翻倍');
    return;
  }
  const lead = !v.target || v.target.seat === DDZ_ME;
  sc.btnPass.setEnabled(!lead);
  sc.btnHint.setEnabled(true);
  const r = sc.judge(v, sel);
  sc.btnPlay.setEnabled(r.ok);
  if (sel.length === 0) {
    const hints = sc.ensureHints(v);
    if (!lead && hints.length === 0) sc.setStatus('要不起，点 不要', true);
    else sc.setStatus(lead ? (v.landlord === DDZ_ME && v.trick.length === 0 ? '你是地主，先出牌' : '轮到你出牌') : '轮到你：压过它，或者不要');
  } else sc.setStatus(r.ok ? r.label : r.reason, !r.ok);
}
