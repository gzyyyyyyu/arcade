/** 牌桌上的按钮、互动、顶栏和记牌器（从 TableScene.ts 拆出，只搬家；函数接收场景实例）。 */
import type Phaser from 'phaser';
import { canPass, timeoutAction, type PlayerView } from '../../variants/guandan/core/index.ts';
import { audio } from '../common/audio.ts';
import { dur } from '../common/anim.ts';
import { seatIdentity, seatName } from '../common/labels.ts';
import { levelName } from './labels.ts';
import { ME } from './session.ts';
import { stopFlash } from '../common/attention.ts';
import { countLeft } from './counter.ts';
import { getSettings, updateSettings } from '../store.ts';
import { LOW_MEMORY } from '../common/device.ts';
import { COLOR, TYPE, minDrawH, minHit, phoneType, GAME_HEIGHT } from '../common/theme.ts';
import { Button, bakeInto, iconButton, setHit, setTopHit, signedLine, text, worldW } from '../ui/kit.ts';
import { stakeLabelParts } from './overlays.ts';
import { ACTION_ROW, BUTTON_Y, COUNTER, FUN_UI, ME_AVATAR, PULSE, STAKE_STRIP, STATUS_PILL, TOPBAR, TOPBAR_H } from '../table/layout.ts';
import { Nudges } from '../table/nudge.ts';
import { TableFun, funItem, type FunSeat } from 'arcade-kit/table-fun';
import { localChat } from 'arcade-kit/chat';
import { MOOD_LINES, PHRASES } from '../../net/fun-text.ts';
import { TEMPER, type dealMoment } from '../../variants/guandan/net/fun-moments.ts';
import { taunt } from '../../net/emotes.ts';
import { hasLayer } from '../ui/focus.ts';
import { lobbyName } from '../common/platform.ts';
import { openInvitePanel } from '../common/social.ts';
import type { TableScene } from '../scenes/TableScene.ts';

/** 记牌器的纸签（art-v3）：米黄纸、深褐字 */
const PAPER = 0xf3e4c4;
const PAPER_INK = 0x3a2414;

export function buildButtons(sc: TableScene, W: number): void {
  const cx = W / 2;
  // 一屏只有一个红色主按钮（出牌）：提示是次要的木色，不要、理牌、重选、上一墩是弱按钮；手机上画出来的高度不低于 36 CSS 像素（minDrawH）
  const rh = Math.max(ACTION_ROW.mainH, minDrawH());
  const sh = Math.max(ACTION_ROW.subH, minDrawH());
  sc.btnPass = new Button(sc, cx - ACTION_ROW.dx, BUTTON_Y, ACTION_ROW.mainW, rh, '不要', 'quiet', () => sc.onPass(), 'pass');
  sc.btnHint = new Button(sc, cx, BUTTON_Y, ACTION_ROW.mainW, rh, '提示', 'wood', () => sc.onHint(), 'hint');
  sc.btnPlay = new Button(sc, cx + ACTION_ROW.dx, BUTTON_Y, ACTION_ROW.mainW, rh, '出牌', 'red', () => sc.onPlay(), 'play');
  // 16:9 的小手机上往右让一点：左边要放下我的头像和"互动"按钮，两个都要 minHit() 宽（buildFun 按"理牌"的左边排互动按钮）
  const mh = minHit();
  const sortX = Math.max(cx - ACTION_ROW.sideDx, ME_AVATAR.x + Math.max(ME_AVATAR.size, mh) / 2 + Math.max(FUN_UI.iconMinW, mh) + Math.max(ACTION_ROW.sortW, mh) / 2);
  sc.btnSort = new Button(sc, sortX, BUTTON_Y + ACTION_ROW.subDy, ACTION_ROW.sortW, sh, '理牌', 'quiet', () => sc.onSort(), 'sort');
  sc.btnClear = new Button(sc, cx + ACTION_ROW.sideDx, BUTTON_Y + ACTION_ROW.subDy, ACTION_ROW.clearW, sh, '重选', 'quiet', () => sc.onClear(), 'undo');
  sc.btnPrev = new Button(sc, cx + ACTION_ROW.prevDx, BUTTON_Y + ACTION_ROW.subDy, ACTION_ROW.prevW, sh,'上一墩', 'quiet', () => sc.showPrevTrick());
  for (const b of [sc.btnPass, sc.btnHint, sc.btnPlay, sc.btnSort, sc.btnClear, sc.btnPrev]) b.setDepth(400);
  // 连着两手没自己出，房间每手几秒就替我出：点一下恢复 30 秒；自己出一手也一样
  const net = sc.net;
  sc.btnBack = net
    ? new Button(sc, cx, BUTTON_Y - ACTION_ROW.backDy, ACTION_ROW.wideW, ACTION_ROW.wideH, '我回来了', 'green', () => {
        net.back();
        sc.btnBack?.setVisible(false);
      }).setDepth(401).setVisible(false)
    : undefined;
  // 旁观（docs/social.md 1.4）：有能坐的座位时出"坐下"，坐下后会话换座位、牌桌整个重画
  sc.btnSit = net
    ? new Button(sc, cx, BUTTON_Y, ACTION_ROW.wideW, ACTION_ROW.wideH, '坐下', 'red', () => {
        const seat = net.freeSeat();
        if (seat !== null) net.sit(seat);
      }).setDepth(401).setVisible(false)
    : undefined;
  sc.statusBg = sc.add.graphics().setDepth(399);
  sc.status = text(sc, cx, BUTTON_Y - rh / 2 - STATUS_PILL.halfH - STATUS_PILL.gap, '', { size: TYPE.label, color: 0xfff3d6, bold: true }).setDepth(400);
}

/**
 * 牌桌互动接 arcade-kit/table-fun（docs/table-fun.md 第 0 节）：菜单、面板、提示、冷却、电脑反应都在 kit 的 DOM 层里，
 * 这里只给头像的屏幕矩形、名字、谁是电脑、性格、不能盖的地方（操作按钮和手牌）和发送通道。
 * 好友房经房间转发（电脑在房间里按同一份 botReact 反应）；单机在本地播，电脑由 kit 按性格反应
 */
export function buildFun(sc: TableScene): void {
  const net = sc.net;
  const W = worldW(sc);
  const mh = minHit();
  // "互动"按钮夹在我的头像（中心 x 60）和"理牌"之间
  const left = ME_AVATAR.x + Math.max(ME_AVATAR.size, mh) / 2;
  const lp = Math.max(FUN_UI.iconMinW, mh);
  const bw = Math.max(FUN_UI.boxMinW, Math.min(Math.max(FUN_UI.iconMinW, mh), sc.btnSort.x - sc.btnSort.width / 2 - left));
  const bh = Math.max(FUN_UI.boxMinH, mh);
  const free = (): boolean => sc.overlay === null && !hasLayer(sc);
  const seated = (): boolean => !net || net.mySeat !== null;
  const send = (id: number, to?: number): void => {
    if (net) net.emote(id, to);
    else sc.funIn(ME, id, to);
  };
  sc.fun = new TableFun({
    storageKey: 'guandan',
    phrases: PHRASES,
    named: [taunt('就这？'), taunt('等着瞧'), taunt('等得花都谢了')],
    seats: () => sc.seats.map((sv, v): FunSeat => {
      const id = net ? seatIdentity[v] : null;
      const persona = net ? id?.persona : sc.ses.botStyle(v)?.persona;
      const p = sv.plateBox();
      return {
        rect: sc.screenRect(sv.a),
        ...(p ? { plate: sc.worldRect(p.x, p.y, p.w, p.h) } : {}),
        name: seatName(v),
        me: sc.isMe(v),
        bot: net ? !!id && !id.human : v !== ME,
        temper: persona ? TEMPER[persona] : 'normal',
      };
    }),
    avoid: () => [sc.worldRect(0, BUTTON_Y - FUN_UI.avoidPad, W, GAME_HEIGHT - BUTTON_Y + FUN_UI.avoidPad)],
    // 桌上各家出的牌：弹幕不横穿、气泡不压（kit 0.19.0）
    center: () => sc.trick.boxes().map((b) => sc.worldRect(b.x, b.y, b.w, b.h)),
    button: () => (seated() ? sc.worldRect(left, FUN_UI.btnCy - bh / 2, bw, bh) : null),
    // 按钮框按世界坐标跟着画面放大，kit 的字和图标是固定像素：1920 宽上成了大框小字，按画面的缩放放大（手机上 ≤ 1 就是原样）
    buttonStyle: () => ({ scale: sc.worldRect(0, 0, 100, 100).width / 100 }),
    // 手机上的"聊天"按钮放顶栏左边（"大厅"和邀请后面的空处）：牌桌左下已经挤着我的头像、"互动"和"理牌"，
    // kit 默认挨着"互动"放会把我自己的气泡挤到按钮底下（kit 0.19.0 截图）
    // 点按区从屏幕上沿往下 minHit()（44 CSS 像素，和别的顶栏图标一样）；手机上画出来的圆钮在顶栏高度内（chatTopStyle）
    chatButton: () => {
      if (!seated()) return null;
      sc.chatTopStyle();
      const ph = phoneType();
      return sc.worldRect(TOPBAR.lobbyRight + (sc.inviteBtn ? lp + FUN_UI.chatGap : 0) + FUN_UI.chatPad, ph ? 0 : FUN_UI.chatTopY, lp, ph ? mh : Math.max(FUN_UI.chatMinH, mh));
    },
    // 电脑版聊天默认收成"聊天"小按钮，同一个位置（顶栏"大厅"和邀请的右边）：kit 自己挑角时会放到"大厅"底下压着它（1280×800 上量过）
    chatDock: () => (seated() ? sc.worldRect(TOPBAR.lobbyRight + (sc.inviteBtn ? lp + FUN_UI.chatGap : 0) + FUN_UI.chatPad, FUN_UI.chatTopY, FUN_UI.dockW, Math.max(FUN_UI.chatMinH, mh)) : null),
    chatFolded: () => true,
    // 弹幕只在左右两家之间、对家名牌下沿到"轮到你"那行提示（BUTTON_Y - 50）上面飘：手机横屏上下都挤，横穿整屏一定会压到左右两家的名牌
    danmakuArea: () => {
      const [l, r, t] = [sc.seats[3]!, sc.seats[1]!, sc.seats[2]!];
      const pb = t.plateBox();
      const x0 = l.a.ax + l.a.size / 2 + FUN_UI.danmakuSide;
      const x1 = r.a.ax - r.a.size / 2 - FUN_UI.danmakuSide;
      const y0 = pb ? pb.y + pb.h + FUN_UI.danmakuGap : t.a.ay + t.a.size / 2 + FUN_UI.danmakuSide;
      return sc.worldRect(x0, y0, x1 - x0, BUTTON_Y - FUN_UI.danmakuBottom - y0);
    },
    lite: () => LOW_MEMORY > 0,
    send,
    canSend: () => seated() && free(),
    // 首次提示"点头像扔道具"冒在右家或左家头像旁，气泡朝桌心伸，那家刚出的牌还在就会被盖住：等它的出牌区空了再冒
    hintSeat: () => [1, 3].find((v) => !sc.isMe(v) && !sc.trick.occupied(v)) ?? null,
    enabled: () => getSettings().taunts,
    // 聊天：好友房走房间；单机（单机也能聊）用 kit 的 localChat，同一套过滤和限速，只在自己头像旁冒、不发不存，电脑不读
    chat: net
      ? (t: string) => net.chat(t)
      : localChat((t, masked) => {
        audio.sfx('taunt');
        sc.fun?.chat(ME, t, masked);
      }),
    // 陌生人桌（快速匹配）设置"聊天"选了"不和陌生人"的：这条连接没带 chat=1，收不到也发不了，聊天页整个不给
    chatEnabled: () => getSettings().chat && (net?.chatOn ?? true),
    scope: () => net?.code ?? 'solo',
    localBots: !net,
    moodLines: MOOD_LINES,
    sound: (p, phase) => audio.fun(p, phase),
    onHit: (seat) => sc.seats[seat]?.hit(),
    log: (line) => sc.fxLog.push(line),
  });
  sc.nudges = new Nudges({
    scene: sc,
    seats: sc.seats,
    canSend: () => seated() && free(),
    send,
    botThrow: (from, id, to) => sc.funIn(from, id, to),
    tipAt: { x: left + bw + FUN_UI.tipDx, y: FUN_UI.tipY },
  });
  // 单机：我想太久，爱闹的电脑扔个催促炸弹（nudge.ts，每手最多一次）
  if (!net) sc.time.addEvent({ delay: FUN_UI.urgeTickMs, loop: true, callback: () => sc.tickSoloUrge() });
  // 弹窗（结算、设置、确认框……）开着时互动层整个藏起来：DOM 层在画布上面，不藏会挡住弹窗上的按钮
  sc.time.addEvent({ delay: FUN_UI.shownTickMs, loop: true, callback: () => sc.syncFunShown() });
  if (net) {
    net.chatSink = (seat, t, masked) => {
      if (seat === ME || (getSettings().chat && !sc.fun?.isBlocked(seat))) audio.sfx('taunt');
      sc.fun?.chat(seat, t, masked);
    };
    net.chatErrorSink = (code) => sc.fun?.chatError(code);
  }
  sc.events.once('shutdown', () => {
    if (net) net.chatSink = net.chatErrorSink = null;
    sc.fun?.destroy();
    sc.fun = null;
    stopFlash();
  });
}

export function syncFunShown(sc: TableScene): void {
  const want = sc.overlay === null && !hasLayer(sc);
  if (want === sc.funShown || !sc.fun) return;
  sc.funShown = want;
  if (want) sc.fun.show();
  else sc.fun.hide();
}

/** 收到的（房间转发的、单机自己的）交给 kit 播；短语、表情配上掼蛋自己的提示音 */
export function funIn(sc: TableScene, from: number, id: number, to?: number): void {
  const it = funItem(id, PHRASES.length);
  if (it && it.kind !== 'prop' && (from === ME || (getSettings().taunts && !sc.fun?.isBlocked(from)))) audio.sfx(it.kind === 'sticker' ? 'sticker' : 'taunt');
  sc.fun?.receive(from, id, to);
}

/** 名场面交给 kit：单机里电脑按性格起哄（好友房的在房间里算） */
export function funMoment(sc: TableScene, m: ReturnType<typeof dealMoment>): void {
  if (m) sc.fun?.moment(m);
}

export function tickSoloUrge(sc: TableScene): void {
  const v = sc.ses.view();
  const bots = [1, 2, 3].flatMap((s) => {
    const p = sc.ses.botStyle(s)?.persona;
    return p ? [{ seat: s, temper: TEMPER[p] }] : [];
  });
  sc.nudges?.tickSolo(sc.mySoloTurn() ? `${v.dealNo}:${v.step}` : null, bots);
}

export function mySoloTurn(sc: TableScene): boolean {
  if (sc.net || sc.ses.autoplay) return false;
  const v = sc.ses.view();
  return v.phase === 'play' && v.turn === ME;
}

/** 按钮跳两下，指给玩家看"该点这个"。 */
export function pulse(sc: TableScene, b: Button): void {
  sc.tweens.killTweensOf(b);
  b.setScale(1);
  sc.tweens.add({ targets: b, scale: PULSE.scale, duration: dur(PULSE.ms), yoyo: true, repeat: 1, ease: 'Sine.easeInOut', onComplete: () => b.setScale(1) });
}

export function buildTopBar(sc: TableScene, W: number): void {
  const c = sc.beginTopBar(W);
  sc.counterAt = null;
  const v = sc.ses.view();
  // 三组（art-v3）：左"大厅"（好友房加邀请）；中 我方的级 · 本副打几 · 第几副 · 对方的级；右 图标。名次不另摆，头像上盖着印章
  const phone = phoneType();
  const team = (x: number, label: string, lv: number, color: number, active: boolean, fails: number): void => {
    const tg = sc.add.image(0, 0, '__DEFAULT');
    const pad = TOPBAR.teamLine;
    bakeInto(tg, `gdTeam:${x}:${color}:${active ? 1 : 0}`, { x: x - pad, y: TOPBAR.teamY - pad, w: TOPBAR.teamW + 2 * pad, h: TOPBAR.teamH + 2 * pad }, (g) => {
      g.fillStyle(color, active ? 1 : 0.55).fillRoundedRect(x, TOPBAR.teamY, TOPBAR.teamW, TOPBAR.teamH, TOPBAR.teamR);
      if (active) g.lineStyle(TOPBAR.teamLine, COLOR.goldLight, 1).strokeRoundedRect(x, TOPBAR.teamY, TOPBAR.teamW, TOPBAR.teamH, TOPBAR.teamR);
    });
    c.add(tg);
    c.add(text(sc, x + TOPBAR.teamLabelDx, TOPBAR.midY, label, { size: TYPE.label, color: 0xffffff, bold: true, ox: 0 }));
    c.add(text(sc, x + TOPBAR.teamLevelDx, TOPBAR.midY, levelName(lv), { size: TYPE.title, color: COLOR.goldLight, bold: true, font: 'num', stroke: 0x2b1d14, strokeWidth: 3 }));
    // 手机上字托底到 12 像素以后角标会压着级数，删掉（结算页照样说哪队打 A 没过）
    if (fails > 0 && !phone) c.add(text(sc, x + TOPBAR.teamW, TOPBAR.teamFailsDy, `A×${fails}`, { size: 14, color: 0xffd0c0, bold: true, ox: 1, oy: 0 }));
  };
  // 最左：回大厅（平台首页），所有游戏统一放左上角；单独部署叫"首页"、回游戏首页（platform.ts）
  sc.lobbyBtn = new Button(sc, TOPBAR.lobbyX, TOPBAR.midY, TOPBAR.lobbyW, TOPBAR.lobbyH, lobbyName(), 'wood', () => sc.onLobby(), 'home');
  // 顶栏贴着屏幕上沿，点按区域从上沿往下 minHit()（手机上 44 CSS 像素），不伸出屏幕
  const deep = Math.max(TOPBAR.hitDeep, minHit());
  setTopHit(sc.lobbyBtn, TOPBAR.lobbyW, deep);
  c.add(sc.lobbyBtn);
  // 好友房开打以后也能叫朋友：紧挨"大厅"，中途进来的人接管电脑的座位
  const net = sc.net;
  const lp = Math.max(FUN_UI.iconMinW, minHit());
  // 快速匹配的桌只给排到的人进，不摆邀请
  sc.inviteBtn = net && !net.match ? iconButton(sc, TOPBAR.lobbyRight + lp / 2 + TOPBAR.inviteGap, TOPBAR.midY, 'invite', () => void openInvitePanel(net.code), TOPBAR.inviteSize, '邀请') : null;
  if (sc.inviteBtn) {
    setTopHit(sc.inviteBtn, lp, deep);
    c.add(sc.inviteBtn);
  }

  // 中：两队的级夹着"本副打几"（级牌放大成一张小牌），坐庄的一队描金边
  const mx = W / 2;
  // 手机上"第N副 打"的字放大了，会贴上我方胶囊：胶囊按字的实际宽度往左让，留 dealNoPhoneGap
  const dealTag = phone ? text(sc, mx - TOPBAR.dealNoPhoneDx, TOPBAR.midY, `第${v.dealNo}副 打`, { size: TYPE.small, color: 0xd8c6a6, ox: 1 }) : null;
  const usX = dealTag ? Math.min(mx - TOPBAR.usDx, dealTag.x - dealTag.width - TOPBAR.dealNoPhoneGap - TOPBAR.teamW) : mx - TOPBAR.usDx;
  team(usX, sc.side(0), v.levels[0], COLOR.teamUs, v.declarer === 0, v.aFails[0]);
  team(mx + TOPBAR.themDx, sc.side(1), v.levels[1], COLOR.teamThem, v.declarer === 1, v.aFails[1]);
  // 手机上两队的胶囊和级牌之间只剩 70 多，放不下"本副打"和"第 N 副"两段：删掉"本副打"（级牌本身就是），"第N副"挪到左边
  if (!phone) c.add(text(sc, mx - TOPBAR.playLabelDx, TOPBAR.midY, '本副打', { size: TYPE.label, color: 0xf0dfc0, ox: 1 }));
  const badge = sc.add.image(0, 0, '__DEFAULT');
  const bp = TOPBAR.badgeLine;
  bakeInto(badge, `gdBadge:${mx}`, { x: mx - TOPBAR.badgeX - bp, y: TOPBAR.badgeY - bp, w: TOPBAR.badgeW + 2 * bp, h: TOPBAR.badgeH + 2 * bp }, (g) => {
    g.fillStyle(COLOR.ivory, 1).fillRoundedRect(mx - TOPBAR.badgeX, TOPBAR.badgeY, TOPBAR.badgeW, TOPBAR.badgeH, TOPBAR.badgeR);
    g.lineStyle(TOPBAR.badgeLine, COLOR.gold, 1).strokeRoundedRect(mx - TOPBAR.badgeX, TOPBAR.badgeY, TOPBAR.badgeW, TOPBAR.badgeH, TOPBAR.badgeR);
  });
  c.add(badge);
  c.add(text(sc, mx, TOPBAR.badgeTextY, levelName(v.level), { size: TYPE.big - 4, color: COLOR.red, bold: true, font: 'num' }));
  // 手机上"本副打"放不下：副数后面跟个"打"，连着级牌读成"第2副 打 5"
  if (dealTag) c.add(dealTag);
  else c.add(text(sc, mx + TOPBAR.dealNoDx, TOPBAR.midY, `第 ${v.dealNo} 副`, { size: TYPE.small, color: 0xd8c6a6, ox: 0 }));

  // 右：回首页、设置、规则，加云存档（它的红点提示没同步上，收进设置就看不见了，所以留在顶栏）；图标和顺序在 TableSceneBase.buildTopIcons，两个玩法一样。
  // 最左一个的点按区域不越过中间那组（右边 mx + 238）
  const { items, left } = sc.buildTopIcons(c, W, { leftLimit: mx + TOPBAR.usDx });
  sc.topIcons = items.filter(([name]) => name !== 'cloud').map(([, b]) => b);
  sc.iconsLeft = left;

  // 实盘：顶栏下面靠右一条（左边是搭档的头像），本场到目前的分和筹码一直显示着
  const st = sc.stake;
  const ns = sc.netStake;
  const label = stakeLabelParts(sc);
  if (label.tpl) {
    // 本场的分和筹码红绿（深色条子上用亮一档的），其余字照旧金色
    const t = signedLine(sc, W - STAKE_STRIP.textRight, TOPBAR_H + STAKE_STRIP.cy, label.tpl, label.nums, { size: TYPE.small, bold: true, color: COLOR.goldLight, ox: 1, dark: true });
    const pg = sc.add.graphics();
    pg.fillStyle(0x1a0e07, 0.7).fillRoundedRect(W - t.width - STAKE_STRIP.boxLeft, TOPBAR_H + STAKE_STRIP.boxTop, t.width + STAKE_STRIP.boxPadW, STAKE_STRIP.boxH, STAKE_STRIP.boxR);
    pg.lineStyle(STAKE_STRIP.boxLine, COLOR.gold, 0.7).strokeRoundedRect(W - t.width - STAKE_STRIP.boxLeft, TOPBAR_H + STAKE_STRIP.boxTop, t.width + STAKE_STRIP.boxPadW, STAKE_STRIP.boxH, STAKE_STRIP.boxR);
    c.add([pg, t]);
    // 单机实盘：条子能点，弹和"大厅"一样的结算确认框；右边加个"结算"小字，让人知道能点（原来找不到中途结算的入口）
    if (st && !st.over) {
      const tag = text(sc, W - t.width - STAKE_STRIP.tagGap, TOPBAR_H + STAKE_STRIP.cy, '带回 ›', { size: TYPE.small, bold: true, color: 0xffe08a, ox: 1 });
      const tg = sc.add.graphics();
      tg.fillStyle(0x8a1a20, 0.92).fillRoundedRect(tag.x - tag.width - STAKE_STRIP.tagBgGap, TOPBAR_H + STAKE_STRIP.tagTop, tag.width + STAKE_STRIP.tagPadW, STAKE_STRIP.tagH, STAKE_STRIP.tagR);
      c.add([tg, tag]);
      // 点按区域和别的控件不相交：底边停在记牌器上沿（counterY，下面设），往上够 minHit()；
      // 手机上这么高会伸进顶栏图标往下伸的那块，那就横向让开图标那几列，只留左头"结回"小签到图标之间这段
      const zx = tag.x - tag.width - STAKE_STRIP.zoneGap;
      const zb = TOPBAR_H + STAKE_STRIP.bottom;
      const zt = zb - Math.max(STAKE_STRIP.hitMin, minHit());
      const zr = zt < Math.max(TOPBAR.hitDeep, minHit()) ? Math.min(W - STAKE_STRIP.edge, sc.iconsLeft) : W - STAKE_STRIP.edge;
      const z = sc.add.zone(zx, zt, zr - zx, zb - zt).setOrigin(0, 0).setInteractive({ useHandCursor: true });
      z.on('pointerup', () => sc.stakeStripTap());
      c.addAt(z, 0);
      sc.stakeStrip = { x: zx + STAKE_STRIP.stripDx, y: TOPBAR_H + STAKE_STRIP.cy };
    } else sc.stakeStrip = null;
    // 好友房带入被拒（或者走了又回来、再带入被拒）：条子左边一个"重新带入"
    const me = ns?.seats[0];
    if (ns && me && !ns.over && (me.paid === 'refused' || me.paid === 'left') && ns.why !== 'need_two') {
      sc.rebuyBtn = new Button(sc, W - t.width - STAKE_STRIP.rebuyGap, TOPBAR_H + STAKE_STRIP.cy, STAKE_STRIP.rebuyW, STAKE_STRIP.rebuyH, '重新带入', 'gold',() => sc.net?.rebuy(), 'restart');
      c.add(sc.rebuyBtn);
    } else sc.rebuyBtn = undefined;
  }
  sc.topKey = sc.topBarKey(W);
  sc.counterBox = sc.add.container(0, 0);
  c.add(sc.counterBox);
  sc.counterY = label ? TOPBAR_H + STAKE_STRIP.bottom : TOPBAR_H + STAKE_STRIP.counterNoStrip;
  sc.buildCounter(sc.counterBox, W, v, sc.counterY);
}

/**
 * 顶栏里除了记牌器以外的东西都由这些决定：没变就不重建。记牌器每出一手都变，单独放在 counterBox 里重画。
 * 按下和抬起必须落在同一个按钮上：每帧重建顶栏的话，"大厅""邀请""设置"会点了没反应。
 */
export function topBarKey(sc: TableScene, W: number): string {
  const v = sc.ses.view();
  const st = sc.stake;
  const ns = sc.netStake;
  return JSON.stringify([W, phoneType(), sc.watching, !!sc.net, v.levels, v.declarer, v.aFails, v.level, v.dealNo, sc.stakeLabel(), st?.over, ns?.over, ns?.why, ns?.seats[0]?.paid]);
}

/** 牌局每一步之后刷新顶栏：内容没变只重画记牌器 */
export function refreshTopBar(sc: TableScene): void {
  const W = worldW(sc);
  if (!sc.top?.active || !sc.counterBox?.active || sc.topBarKey(W) !== sc.topKey) return sc.buildTopBar(W);
  sc.counterBox.removeAll(true);
  sc.counterAt = null;
  sc.buildCounter(sc.counterBox, W, sc.ses.view(), sc.counterY);
}

/**
 * 记牌器：顶栏下面一排，大王、小王、A……2 每种还有几张没露面（级牌标红，出完的变淡）。
 * 放在搭档头像右边，实盘时让到实盘条下面。点一下收起成小签，再点展开（记进设置）。
 */
export function buildCounter(sc: TableScene, c: Phaser.GameObjects.Container, W: number, v: PlayerView, y0: number): void {
  if (v.phase !== 'play' && v.phase !== 'tribute' && v.phase !== 'return') return;
  // 横向：在对家剩余张数（头像中心右边约 95）之后。纵向：和顶栏图标的点按区域（往下伸到 minHit()）横向重叠时，挪到它下面
  const pa = sc.seats[2]!.a;
  const x0 = Math.max(W / 2 - COUNTER.centerDx, pa.ax + COUNTER.avatarDx);
  const cells = countLeft(v.hand, v.history);
  // 手机上点数、张数托底到 12、14 像素，格子跟着放宽加高，不然"10""9"挤成一串
  const phone = phoneType();
  const cw = phone ? COUNTER.cellWPhone : COUNTER.cellW;
  const h = phone ? COUNTER.hPhone : COUNTER.h;
  if (x0 + cells.length * cw + COUNTER.padW > sc.iconsLeft) y0 = Math.max(y0, minHit() + COUNTER.clearIcons);
  // 点按区域只往下扩到够 44 CSS 像素：往上会压着顶栏
  const hitDown = (z: Phaser.GameObjects.Zone, w: number, h: number): void => {
    setHit(z, w, Math.max(h, minHit()));
    z.setPosition(x0, y0);
  };
  const toggle = (): void => {
    updateSettings({ counter: !getSettings().counter });
    sc.buildTopBar(worldW(sc));
  };
  if (!getSettings().counter) {
    const t = text(sc, x0 + COUNTER.foldTextDx, y0 + COUNTER.foldTextDy, '记牌', { size: TYPE.small, bold: true, color: PAPER_INK, ox: 0 });
    const g = sc.add.graphics();
    g.fillStyle(0x000000, 0.3).fillRoundedRect(x0 + COUNTER.foldShadowDx, y0 + COUNTER.foldShadowDy, t.width + COUNTER.foldPadW, COUNTER.foldH, COUNTER.r);
    g.fillStyle(PAPER, 0.96).fillRoundedRect(x0, y0 + COUNTER.foldPaperDy, t.width + COUNTER.foldPadW, COUNTER.foldH, COUNTER.r);
    g.lineStyle(1.5, COLOR.goldDark, 0.8).strokeRoundedRect(x0, y0 + COUNTER.foldPaperDy, t.width + COUNTER.foldPadW, COUNTER.foldH, COUNTER.r);
    const z = sc.add.zone(x0, y0, t.width + COUNTER.foldPadW, COUNTER.foldHitH).setOrigin(0, 0).setInteractive({ useHandCursor: true });
    hitDown(z, Math.max(t.width + COUNTER.foldPadW, minHit()), COUNTER.foldHitH);
    z.on('pointerdown', toggle);
    c.add([g, t, z]);
    sc.counterAt = { x: x0 + (t.width + COUNTER.foldPadW) / 2, y: y0 + COUNTER.foldTextDy };
    return;
  }
  const w = cells.length * cw + COUNTER.padW;
  // 纸签（art-v3）：米黄纸、深褐字，压在绒布上带一点投影；级牌那一格衬一层淡红。每出一手都重画，纸签本身烘成图（同样的位置、级牌格共用）
  const lvAt = cells.findIndex((cell) => cell.rank === v.level);
  const paper = sc.add.image(0, 0, '__DEFAULT');
  const sd = Math.max(COUNTER.shadowDx, COUNTER.shadowDy, 0) + 2;
  bakeInto(paper, `gdCounter:${x0}:${y0}:${w}:${h}:${cw}:${lvAt}`, { x: x0 - 2, y: y0 - 2, w: w + sd + 2, h: h + sd + 2 }, (g) => {
    g.fillStyle(0x000000, 0.3).fillRoundedRect(x0 + COUNTER.shadowDx, y0 + COUNTER.shadowDy, w, h, COUNTER.r);
    g.fillStyle(PAPER, 0.96).fillRoundedRect(x0, y0, w, h, COUNTER.r);
    g.lineStyle(1.5, COLOR.goldDark, 0.8).strokeRoundedRect(x0, y0, w, h, COUNTER.r);
    if (lvAt >= 0) {
      const x = x0 + COUNTER.padL + cw * lvAt;
      g.fillStyle(COLOR.red, 0.16).fillRoundedRect(x + COUNTER.hiliteInset, y0 + COUNTER.hiliteTop, cw - 2 * COUNTER.hiliteInset, h - 2 * COUNTER.hiliteTop, COUNTER.hiliteR);
    }
  });
  c.add(paper);
  cells.forEach((cell, i) => {
    const x = x0 + COUNTER.padL + cw * i + cw / 2;
    const lv = cell.rank === v.level;
    const name = cell.rank === 17 ? '大' : cell.rank === 16 ? '小' : levelName(cell.rank);
    const a = cell.left === 0 ? 0.3 : 1;
    // 点数 16、张数 19：iPad 横屏（缩到 ×0.92）都到 14 CSS 像素；手机上更小的由手机字号档管
    c.add(text(sc, x, y0 + (phone ? COUNTER.rankYPhone : COUNTER.rankY), name, { size: 16, bold: true, color: lv || cell.rank >= 16 ? COLOR.red : 0x6a4a2a }).setAlpha(a));
    c.add(text(sc, x, y0 + (phone ? COUNTER.leftYPhone : COUNTER.leftY), String(cell.left), { size: 19, bold: true, font: 'num', color: lv ? COLOR.red : PAPER_INK }).setAlpha(a));
  });
  const z = sc.add.zone(x0, y0, w, h).setOrigin(0, 0).setInteractive({ useHandCursor: true });
  hitDown(z, w, h);
  z.on('pointerdown', toggle);
  c.add(z);
  sc.counterAt = { x: x0 + w / 2, y: y0 + h / 2 };
}

/** 按钮状态和一句话原因。 */
export function refreshButtons(sc: TableScene): void {
  if (!sc.alive) return;
  const v = sc.ses.view();
  const mine = sc.myTurn(v);
  const sel = sc.hand.selected();
  sc.hand.enabled = mine;
  const showMain = v.phase === 'play' || v.phase === 'tribute' || v.phase === 'return';
  for (const b of [sc.btnPass, sc.btnHint, sc.btnPlay, sc.btnSort, sc.btnClear]) b.setVisible(showMain);
  sc.btnClear.setEnabled(sel.length > 0);
  sc.btnPrev.setVisible(v.phase === 'play').setEnabled(sc.trick.prev.length > 0 && sc.overlay === null);
  sc.btnSort.setText(sc.hand.mode === 'rank' ? '按牌型' : '按点数');
  sc.btnBack?.setVisible(!!sc.net?.afk && sc.overlay === null);
  if (sc.net) {
    // 旁观：没有手牌、不能出手；顶上那条写"旁观中"，有能坐的座位出"坐下"
    const watch = sc.watching;
    const sit = watch ? sc.net.freeSeat() : null;
    sc.btnSit?.setVisible(watch && sit !== null && sc.overlay === null);
    if (watch) {
      for (const b of [sc.btnPass, sc.btnHint, sc.btnPlay, sc.btnSort, sc.btnClear]) b.setVisible(false);
      sc.hand.enabled = false;
      sc.setStatus(sit === null ? '旁观中 · 看不到任何人的手牌' : '旁观中 · 看不到任何人的手牌，点"坐下"一起打');
      return;
    }
  }

  if (v.myTribute && mine) {
    // 进贡 / 还贡
    const t = v.myTribute;
    sc.hand.setAllowed(t.allowed);
    sc.btnPass.setVisible(false);
    sc.btnHint.setVisible(false);
    const verb = t.kind === 'tribute' ? '进贡' : '还贡';
    // 先替新手挑好一张（和超时代出同一张：进贡挑最大的、还贡挑最小的），点一下就行，想换再点别的；
    // 每一步只挑一次，玩家点掉了不再塞回去。新手不知道级牌比 A 大，以前就卡在这里不会点
    const pick = sc.tributeStep !== v.step && sel.length === 0 ? timeoutAction(v) : null;
    sc.tributeStep = v.step;
    if (pick && (pick.type === 'tribute' || pick.type === 'return')) {
      sc.hand.setSelected([pick.card]);
      sel.push(pick.card);
    }
    sc.btnPlay.setText(verb).setEnabled(sel.length === 1);
    const to = t.to >= 0 ? seatName(t.to) : '头游（上副第一个出完的）';
    const what = t.kind === 'tribute' ? '最大的一张' : '一张 10 以下的';
    sc.setStatus(sel.length === 1 ? `已挑好${what}，点「${verb}」给 ${to}` : `选${what} ${verb}给 ${to}`);
    return;
  }
  sc.hand.setAllowed(null);
  sc.btnPlay.setText('出牌');
  sc.btnHint.setVisible(showMain && v.phase === 'play');
  sc.btnPass.setVisible(showMain && v.phase === 'play');
  if (!mine) {
    sc.btnPlay.setEnabled(false);
    sc.btnPass.setEnabled(false);
    sc.btnHint.setEnabled(false);
    if (v.phase === 'play' && v.turn >= 0 && v.turn !== ME) sc.setStatus(`等 ${seatName(v.turn)} 出牌`);
    // 发牌、"要进贡"横幅这些动画放完之前不提进贡的事，免得牌还没发完就先看到提示
    else if (sc.busy && (v.phase === 'tribute' || v.phase === 'return')) sc.setStatus('');
    else if ((v.phase === 'tribute' || v.phase === 'return') && !v.toAct.includes(ME)) sc.setStatus(v.phase === 'tribute' ? '等对方进贡' : '等对方还贡');
    else if (sc.ses.autoplay) sc.setStatus('托管中');
    else sc.setStatus('');
    return;
  }
  if (v.phase !== 'play') return;
  const pass = canPass(v);
  sc.btnPass.setEnabled(pass);
  sc.btnHint.setEnabled(true);
  const r = sc.judge(v, sel);
  sc.btnPlay.setEnabled(r.ok);
  if (sel.length === 0) {
    const hints = sc.ensureHints(v);
    if (hints.length === 0) sc.setStatus('要不起，点 不要', true, true);
    else if (guideHint(sc, v)) sc.setStatus('不会出？点「提示」，再点「出牌」');
    else sc.setStatus(v.trick.last ? '轮到你：压过它，或者不要' : '轮到你出牌');
  } else sc.setStatus(r.ok ? r.label : r.reason, !r.ok);
}

/** 引导翻完接着带几步：小白卡在"第一手出什么"，指给他「提示」比再讲一遍规则管用 */
const HINT_GUIDE_TURNS = 3;

export function startHintGuide(sc: TableScene): void {
  sc.hintGuide = { left: HINT_GUIDE_TURNS, at: null };
}

/**
 * 第一副前几次轮到我：「提示」跳两下、状态行说怎么用。只加不拦，不挡别的按钮；
 * 过了第一副、托管时不指。返回这一步要不要说那句话。
 */
function guideHint(sc: TableScene, v: ReturnType<TableScene['ses']['view']>): boolean {
  const g = sc.hintGuide;
  if (!g || sc.ses.autoplay || sc.overlay !== null) return false;
  if (v.dealNo > 1 || g.left <= 0) {
    sc.hintGuide = null;
    return false;
  }
  const key = `${v.dealNo}:${v.step}`;
  if (g.at !== key) {
    g.at = key;
    g.left--;
    sc.pulse(sc.btnHint);
  }
  return true;
}
