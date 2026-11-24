import { achievementHints, canChallenge, difficultyView, formatMoney, runMonths, formatPoints, storyView, runSummary, stocksOf, stockCard, type GameState, type RunSummary } from '../../core/index.ts';
import { RevealPanel } from '../meta/revealPanel.ts';
import { onBoardChange, runBoard } from '../dailyBoard.ts';
import { attachDomProxy } from '../ui/domProxy.ts';
import { goLobby, lobbyLabel } from '../lobby.ts';
import { live, onLiveChange } from '../live.ts';
import { chips, liveEndText, liveLedger } from '../liveText.ts';
import { markCut, setColor } from '../ui/text.ts';
import { bestKey, isDifficultyUnlocked, isPersonaUnlocked, loadProfile, type Profile, type RecordResult } from '../../platform/profile.ts';
import { ensureMetaArt, hasArt, queueLazy, stockKey, type Glyph } from '../assets.ts';
import { addBackdrop, flashBox } from '../fx/effects.ts';
import { confetti, fireworks, rainCloud, } from '../fx/particles.ts';
import { bestText, bestTradeLabel, dailyTag, dailyText, endSubtitle, ipoLine, ledgerRows, levelLabel, summaryRows, swanLine, tradeWord } from '../labels.ts';
import { funSetup, loadLastSetup, saveLastSetup } from '../meta/prefs.ts';
import { playUnlocks } from '../meta/unlockDialog.ts';
import { unlocksOf, type Unlock } from '../meta/unlocks.ts';
import { randomSeed, type Session } from '../session.ts';
import { sound } from '../sound.ts';
import { COLOR, FS, GAME_WIDTH, PHONE, TYPE, arrowOf, mixColor, signColor } from '../theme.ts';
import { addGlyph, addPaper, addPill } from '../ui/art.ts';
import { bindTooltip, } from '../ui/tooltip.ts';
import { statTile, tipOnButton } from '../meta/bits.ts';
import { addBadge, addPortrait } from '../meta/setupPanel.ts';
import { Button } from '../ui/button.ts';
import { moneyShort } from '../ui/dialog.ts';
import { StockGuy } from '../ui/stockGuy.ts';
import { addText, clauseWrap } from '../ui/text.ts';
import type Phaser from 'phaser';
import { Room } from '../trade/room.ts';
import { END_CUTSCENE_MS } from '../trade/billTiming.ts';
import { coverOf, phoneLayout, viewOf } from '../viewport.ts';
import { gameLink, shareArt, shareData } from '../shareCard.ts';
import { runChallenge, } from '../challenge.ts';
import { cloudUserId } from '../cloudSync.ts';
import { standalone } from '../../platform/mode.ts';
import { prepareShare, type PreparedShare } from 'arcade-kit/share';
import { myName } from '../../platform/mode.ts';
import { BaseScene } from './BaseScene.ts';
import { DESK_GEO, phoneGeo } from '../end/endGeo.ts';
import { EndFlash } from '../end/endFlash.ts';
import { EndRows } from '../end/endRows.ts';


/**
 * 结束页：称号与最终账户、本局小结、这个人设 × 难度（或今天的每日挑战）的最好成绩（刷新时标「新纪录」）、
 * 本局新达成的成就和解锁；进场后依次弹出成就、新人设、新难度。按钮：同种子再来、新局、主菜单。
 */
export class EndScene extends BaseScene {
  protected override readonly phoneReady = PHONE;
  buttons: Record<string, Button> = {};
  private room: Room | null = null;
  private summary: RunSummary | null = null;
  result: RecordResult | null = null;
  /** 实盘局：结算的大字和说明（带回的回话晚到时就地改字，不重建场景） */
  private liveHead: Phaser.GameObjects.Text | null = null;
  /** 左栏「最后剩多少钱」的大字 */
  private moneyText: Phaser.GameObjects.Text | null = null;
  private liveBody: Phaser.GameObjects.Text | null = null;
  private liveBodyW = 0;
  private readonly flash = new EndFlash(this);
  private readonly rows = new EndRows(this);

  constructor(session: Session) {
    super('end', session);
  }

  /** 直接从存档打开结束页（没进过对局）时，补上小屋延伸出来的那圈和雨天图层。 */
  preload(): void {
    queueLazy(this.load, this.textures);
  }

  protected override build(): void {
    this.buttons = {};
    this.liveHead = null;
    this.liveBody = null;
    this.liveBodyW = 0;
    this.flashNum = null;
    this.flashDelta = null;
    const s = this.session.state;
    const sum = runSummary(s);
    const lv0 = sum.live;
    // 格数 = 这局打几个月（完整一年 12、短局 5、新手课 2、实盘按档位）
    const months = runMonths(s);
    this.summary = sum;
    this.result = this.session.recordEnd();
    const profile: Profile = this.result?.profile ?? loadProfile().profile;
    this.room = new Room(this, sum.won ? 'bull' : 'bear', { ambient: this.lively });
    // 通关是傍晚的暖光，出局是夜里
    this.room.setTime(sum.won ? 'dusk' : 'night', null);
    addBackdrop(this, 0.35).disableInteractive();
    const G = phoneLayout(this) ? phoneGeo(viewOf(this)) : DESK_GEO;
    const ph = G !== DESK_GEO;
    const { x, y } = G;
    const W = G.w;
    const H = G.h;
    addPaper(this, x, y, W, H);
    if (sum.flash || sum.weekly) {
      this.flash.buildFlash(sum, s, G, ph);
      return;
    }

    // ---- 左：谁 × 哪一级、通关/出局、称号、最终账户、最赚的一笔
    const lv = difficultyView(sum.difficulty);
    const setup = `${sum.personaName} · ${levelLabel(lv.level, sum.difficultyName)}`;
    const L = x + G.pad;
    const hy = y + G.headY;
    // 手机上「大厅」回到左上角（和别的画面一样），头像那一行往右让出它的位置
    const hx = ph ? 112 : 0;
    // 手机窄屏上一行放不下「大厅 + 头像 + 级别 + 通关 + 每日挑战/实盘」：有第二枚标签时不放头像和级别（悬停里有）
    const second = sum.daily || lv0;
    const faces = !(ph && second && hx + 84 + 74 + 120 > G.leftW);
    if (faces) {
      addPortrait(this, L + hx + 22, hy, { id: sum.persona, name: sum.personaName }, false, G.portrait);
      addBadge(this, L + hx + 22 + G.badge + 8, hy, lv.level, G.badge);
    }
    const pillX = L + hx + (!faces ? 0 : ph ? 84 : 96);
    const who = this.add.rectangle(L + hx, hy - 28, faces ? 90 : 64, 56, 0xffffff, 0.001).setOrigin(0, 0);
    bindTooltip(who, () => ({ x: L + hx, y: hy - 28, w: faces ? 90 : 64, h: 56 }), () => ({ title: '这一局', body: setup }));
    this.tag(pillX, hy - 10, sum.lesson ? (sum.won ? '过关' : '没过') : sum.won ? '通关' : '出局', sum.won ? COLOR.accent : COLOR.danger, 64);
    if (sum.lesson) this.tag(pillX + 74, hy - 10, '新手课', COLOR.info, 90);
    if (sum.daily) this.tag(pillX + 74, hy - 10, dailyTag(sum.daily), COLOR.info, 120);
    if (lv0) this.tag(pillX + 74, hy - 10, `实盘 · ${chips(lv0.stake)}`, COLOR.accentDark, 120);
    const title = addText(this, L, y + G.titleY, sum.title, { size: G.titleSize, bold: true, color: COLOR.ink, wrap: G.leftW });
    title.setInteractive();
    bindTooltip(title, () => ({ x: L, y: y + G.titleY, w: title.width, h: title.height }), () => ({ title: sum.title, body: endSubtitle(sum) }));
    // 副标题放回卡面（撑到几月 / 带多少钱上岸）；实盘局这里是"带回多少"，放在最显眼的位置
    const subT = lv0
      ? (this.liveHead = addText(this, L, y + G.titleY + 6 + title.height, '', { size: TYPE.title + 2, bold: true, num: true, color: COLOR.accentDark, wrap: G.leftW }))
      : clauseWrap(addText(this, L, y + G.titleY + 6 + title.height, endSubtitle(sum), { size: TYPE.label + 1, color: COLOR.muted }), G.leftW);
    // 按打法的评语：称号右边一枚标签，副标题下面一句话
    const st = sum.style;
    this.tag(L + title.width + 14, y + G.titleY + title.height / 2 - 11, st.tag, COLOR.info, Math.max(84, Array.from(st.tag).length * 15 + 22));
    const styleT = clauseWrap(addText(this, L, subT.y + subT.height + 4, st.line, { size: TYPE.label, color: COLOR.accentDark }), G.leftW);
    // 黑天鹅 Boss 日：最后一天的结果，躲过绿、中招红
    const swanTxt = swanLine(sum);
    const swanT = swanTxt
      ? addText(this, L, styleT.y + styleT.height + 4, swanTxt, { size: TYPE.label, bold: true, color: sum.swan && sum.swan.money < 0 ? COLOR.danger : 0x2e8b57, wrap: G.leftW })
      : null;
    // 打新：申购过才有这一行，赚了红（和涨跌同色）、亏了绿
    const ipoTxt = ipoLine(s.stats.ipo);
    const ipoAbove = swanT ?? styleT;
    const ipoT = ipoTxt
      ? addText(this, L, ipoAbove.y + ipoAbove.height + 4, ipoTxt, { size: TYPE.label, bold: true, color: (s.stats.ipo?.money ?? 0) < 0 ? COLOR.down : COLOR.up, wrap: G.leftW })
      : null;
    const ay = y + G.titleY + 18 + title.height + subT.height + styleT.height + (swanT ? swanT.height + 4 : 0) + (ipoT ? ipoT.height + 4 : 0) + (ph ? 18 : 24);
    addGlyph(this, L + 22, ay, 'wallet', G.wallet);
    // 有动画时从开局本金起步，过场收起后滚到终值（enter 里的 rollMoney）
    this.moneyText = addText(this, L + 52, ay, formatMoney(this.lively && !this.anim.instant ? sum.startAccount : sum.account), { size: G.moneySize, bold: true, num: true, color: COLOR.ink, originY: 0.5 });
    // 「最赚的一笔」收进一块浅底卡：左边大小人，右边一列（标题、名字、涨幅、这段日子）在卡里上下居中，
    // 三样各自摆在固定坐标上的话，和小人对不齐、底下空一大截
    const boxY = ay + (ph ? 28 : 36);
    // 竖屏：卡里没有「这段日子」按钮（合成行情）时矮一截，给下面的几行让地方
    const boxH = G.single ? (s.real ? G.single.boxH : G.single.boxH - 30) : y + H - G.boxBottom - boxY;
    const boxW = G.boxW;
    this.add.rectangle(L, boxY, boxW, boxH, 0xffffff, 0.55).setOrigin(0, 0).setRounded(18).setStrokeStyle(2, COLOR.edge, 1);
    // 小人 + 右边一列当成一组，在卡里左右、上下都居中（右列按最宽的 170 估）
    // 手机窄屏框只有 290 宽：小人按右边一列（约 170）让出来的宽度缩，不出框
    const guySize = Math.min(G.guyMax, boxH - (ph ? 24 : 40), boxW - 20 - 170 - 16);
    const groupW = guySize + 20 + 170;
    const guyX = L + (boxW - groupW) / 2 + guySize / 2;
    const guyFeet = boxY + (boxH + guySize) / 2 + 4;
    const colX = guyX + guySize / 2 + 20;
    const stack: { h: number; draw: (yy: number) => void }[] = [];
    if (sum.bestTrade) {
      const card = stockCard(s, sum.bestTrade.stockId);
      new StockGuy(this, guyX, guyFeet, card.id, sum.bestTrade.ret >= 0 ? 'limitup' : 'worried', guySize, { idle: this.lively });
      const ret = sum.bestTrade.ret;
      // 每一笔都亏的局，不说「最赚」
      stack.push({ h: 22, draw: (yy) => addText(this, colX, yy + 11, bestTradeLabel(ret, sum.buys), { size: TYPE.label, color: COLOR.muted, originY: 0.5 }) });
      stack.push({
        h: 34,
        draw: (yy) => {
          addGlyph(this, colX + 12, yy + 17, 'trophy', 26);
          addText(this, colX + 30, yy + 17, card.name, { size: TYPE.title, bold: true, originY: 0.5 });
        },
      });
      stack.push({ h: ph ? 40 : 46, draw: (yy) => addText(this, colX, yy + (ph ? 20 : 23), `${arrowOf(ret)}${formatPoints(Math.abs(ret), 1, false)}`, { size: ph ? TYPE.big : TYPE.big + 6, bold: true, num: true, color: signColor(ret), originY: 0.5 }) });
      // 电脑上框里地方大：再写一行最亏的一笔
      const worst = s.stats.trades.reduce<(typeof s.stats.trades)[number] | null>((w, t) => (!w || t.ret < w.ret ? t : w), null);
      if (!ph && worst && worst.ret < -5 && worst.stockId !== sum.bestTrade.stockId) {
        const wn = stockCard(s, worst.stockId).name;
        stack.push({ h: 30, draw: (yy) => addText(this, colX, yy + 15, `最亏：${wn} ${arrowOf(worst.ret)}${formatPoints(Math.abs(worst.ret), 1, false)}`, { size: TYPE.label, bold: true, color: signColor(worst.ret), originY: 0.5 }) });
      }
    } else {
      // 没有交易：让本局第一个题材的龙头哭一下
      const id = s.themeIds.map((t) => stocksOf(t)[0]?.id).find((v) => v && hasArt(this.textures, stockKey(v, 'limitdown')));
      if (id) new StockGuy(this, guyX, guyFeet, id, 'limitdown', guySize, { idle: this.lively });
      stack.push({ h: 22, draw: (yy) => addText(this, colX, yy + 11, '这局没交易', { size: TYPE.label, color: COLOR.muted, originY: 0.5 }) });
      stack.push({ h: ph ? 40 : 46, draw: (yy) => addText(this, colX, yy + (ph ? 20 : 23), '0 笔', { size: ph ? TYPE.big : TYPE.big + 6, bold: true, num: true, color: COLOR.muted, originY: 0.5 }) });
    }
    // 重做：真实行情局可以随时再看一遍"这段日子"的小故事
    if (s.real) stack.push({ h: ph ? 52 : 56, draw: (yy) => (this.buttons.reveal = new Button(this, colX, yy + (ph ? 8 : 12), { width: 150, height: 44, label: '这段日子', variant: 'default', fontSize: 15, hotkey: 'V', onClick: () => this.openReveal() })) });
    const stackH = stack.reduce((n, it) => n + it.h, 0);
    let sy = boxY + Math.max(ph ? 6 : 12, (boxH - stackH) / 2);
    for (const it of stack) {
      it.draw(sy);
      sy += it.h;
    }

    // ---- 右：战绩图标格（2 × 3），完整说法在悬停
    const mx = x + G.mx;
    const tw = G.tw;
    const th = G.stacked ? 54 : G.tileIcon + 16;
    const rowGap = ph ? 8 : 10;
    const cols = G.tileCols;
    const tgx = G.tileGap;
    // 竖屏一栏：战绩接在「最赚的一笔」卡下面
    const ty0 = G.single ? boxY + boxH + 14 : y + (ph ? 16 : 28);
    // 竖排的窄格里金额写短的（「¥5479.9万」），全数在悬停
    const money = (v: number, sign = false): string => (G.stacked ? moneyShort(v, sign) : formatMoney(v, sign ? { sign: true } : undefined));
    const tiles: [Glyph, string, string, number | undefined, boolean][] = [
      ['calendar', `${sum.billsPaid}/${months}`, '还上月数', sum.won ? COLOR.accentDark : undefined, false],
      ['wallet', money(sum.peakAccount), '最高账户', undefined, false],
      ['bolt', `${sum.limitUpDays}天`, '涨停天数', undefined, sum.limitUpDays === 0],
      ['arrow_up', sum.maxBoards > 1 ? `${sum.maxBoards}天` : '–', '最长连涨停', undefined, sum.maxBoards <= 1],
      ['horn', `${sum.chains}次`, '大哥带小弟', undefined, sum.chains === 0],
    ];
    tiles.forEach(([g, v, label, color, muted], i) => {
      const tx = mx + (i % cols) * (tw + tgx);
      const ty = ty0 + Math.floor(i / cols) * (th + rowGap);
      statTile(this, tx, ty, g, v, label, { w: tw, icon: G.tileIcon, size: G.tileSize, color, tint: g === 'arrow_up' ? COLOR.up : undefined, stacked: G.stacked, muted });
      if (g === 'horn') {
        const hit = this.add.rectangle(tx, ty, tw, th, 0xffffff, 0.001).setOrigin(0, 0);
        bindTooltip(hit, () => ({ x: tx, y: ty, w: tw, h: th }), () => ({ title: '大哥带小弟', body: '带头大哥涨停时，同一个风口的小弟会额外多涨一点。这局一共发生了几次。' }));
      }
    });
    // 第 6 格：炒股本身净赚多少（不写"最好 0/12"：没计入档案时看不懂；最好成绩在下面那一行）
    {
      const tx = mx + ((tiles.length) % cols) * (tw + tgx);
      const ty = ty0 + Math.floor(tiles.length / cols) * (th + rowGap);
      const tm = sum.tradeMoney;
      // 亏了写「炒股净亏 ¥325万」（写「炒股净赚 −¥325万」会和副标题对不上）
      const word = tradeWord(tm);
      const v = tm < 0 ? money(-tm) : money(tm, true);
      statTile(this, tx, ty, tm < 0 ? 'arrow_down' : 'arrow_up', v, word, { w: tw, icon: G.tileIcon, size: G.tileSize, color: signColor(tm), tint: signColor(tm), stacked: G.stacked });
      const hit = this.add.rectangle(tx, ty, tw, th, 0xffffff, 0.001).setOrigin(0, 0);
      bindTooltip(hit, () => ({ x: tx, y: ty, w: tw, h: th }), () => ({
        title: word,
        body: `每天收盘股票带来的赚亏，加上买入的手续费和持股分红（不算账单、利息和奖励）。\n${ledgerRows(sum).map(([k, v]) => `${k} ${v}`).join('\n')}\n称号按炒股净赚是本钱的几倍来定。`,
      }));
    }
    const rowsN = Math.ceil((tiles.length + 1) / cols);
    const gw = tw * cols + tgx * (cols - 1);
    const gridHit = this.add.rectangle(mx, ty0, gw, rowsN * th + (rowsN - 1) * rowGap, 0xffffff, 0.001).setOrigin(0, 0).setDepth(-1);
    bindTooltip(gridHit, () => ({ x: mx, y: ty0, w: gw, h: rowsN * (th + rowGap) }), () => ({ title: '这一局', body: summaryRows(sum).map(([k, v]) => `${k}：${v}`).join('\n') }));

    // ---- 收获：图标 + 数字（名字在悬停）；手机上「收获」两个字和图标并在一行
    const gy = ty0 + rowsN * (th + rowGap) + (ph ? 4 : 16);
    const gl = addText(this, mx, ph ? gy + 22 : gy, '收获', { size: TYPE.title, bold: true, originY: ph ? 0.5 : 0 });
    const gx = ph ? mx + gl.width + 10 : mx;
    this.rows.gains(gx, ph ? gy : gy + 34, sum, G.chipIcon, mx + G.rightW - gx);

    // ---- 账单轨道：每月一格，还上的绿格、没还上的红格、没走到的灰格
    // 屏幕材质（art-v3：数字在跳的地方用夜蓝小屏）：整条放在一块小屏上，每格上面一根这个月账户涨跌的小柱
    const ky = gy + G.dy.track;
    // 这局的经历（借钱、押跌……）：最多两条，整段在「收获」的包里；每日挑战第二条的位置给排行榜
    const board = sum.daily ? sum.daily : null;
    // 好友挑战那一行占同一个位置（挑战局不会是每日挑战）：挑战局交成绩；能发起的局（娱乐局、计入了档案、登录了）放「挑战好友」
    const chal = !board && (runChallenge(s.seed) !== null || (canChallenge(s) && !!this.result && !this.result.ignored && cloudUserId() !== null && !standalone()));
    const row = !!board || chal;
    // 竖屏一栏（矮屏）上轨道下面这几行可能挤到按钮：排行 / 挑战那一行要能点，先保它（贴着按钮上面放），最好成绩、经历放不下的就不放。
    // 横屏和电脑的位置是排好的，照常都放
    const bottom = y + H - G.btnBottom - 6;
    const rowY = row && G.single ? Math.min(ky + G.dy.row, bottom - 44) : ky + G.dy.row;
    const fits = (yy: number): boolean => !G.single || yy + 20 <= (row ? Math.min(bottom, rowY - 4) : bottom);
    const P = G.trackPitch;
    const trackW = 34 + months * P + 6;
    const barH = ph ? 8 : 14;
    const rets = s.stats.monthRets;
    const maxRet = Math.max(1, ...rets.map((r) => Math.abs(r)));
    this.add.rectangle(mx - 4, ky - barH - 8, trackW, barH + 8 + 34, COLOR.screen).setOrigin(0, 0).setRounded(10).setStrokeStyle(2, COLOR.ink, 1);
    addGlyph(this, mx + 14, ky + 14, 'house', 22);
    const bars = this.add.graphics();
    for (let m = 0; m < months; m++) {
      const px = mx + 34 + m * P;
      const paid = m < sum.billsPaid;
      const failed = !sum.won && m === sum.billsPaid;
      const fill = paid ? 0x1f6f4a : failed ? 0x6a2430 : 0x2e3d4f;
      const edge = paid ? 0x45d68f : failed ? 0xff6b6b : 0x3e5066;
      const box = this.add.rectangle(px, ky, P - 4, 28, fill).setOrigin(0, 0).setRounded(7).setStrokeStyle(1.5, edge, 1);
      addText(this, px + (P - 4) / 2, ky + 14, `${m + 1}`, { size: paid || failed ? 13 : 11, bold: true, num: true, color: paid ? 0xc8ffe0 : failed ? 0xffd2cc : 0x8a9bb0, originX: 0.5, originY: 0.5 });
      const r = rets[m];
      if (r !== undefined && Math.abs(r) >= 0.5) {
        const h = Math.max(2, (Math.abs(r) / maxRet) * barH);
        bars.fillStyle(mixColor(signColor(r), 0xffffff, 0.25), 1).fillRoundedRect(px + (P - 4) / 2 - 5, ky - 3 - h, 10, h, 2);
      }
      if (this.lively && (paid || failed)) {
        box.setScale(0.2);
        this.tweens.add({ targets: box, scale: 1, duration: 200, delay: 40 * m, ease: 'Back.easeOut' });
      }
    }
    const trackHit = this.add.rectangle(mx - 4, ky - barH - 8, trackW, barH + 42, 0xffffff, 0.001).setOrigin(0, 0);
    bindTooltip(trackHit, () => ({ x: mx - 4, y: ky - barH - 8, w: trackW, h: barH + 42 }), () => ({
      title: '每个月',
      body: `格子：这个月的账单还上了（绿）、没还上（红）、没走到（灰）。\n小柱：这个月炒股让账户涨了还是跌了，越高越多。\n${rets.map((r, i) => `${i + 1}月 ${formatPoints(r, 1)}`).join('　')}`,
    }));
    // 实盘：最好成绩、经历两行的位置换成结算的说明（实盘局不进最好成绩）
    if (lv0) {
      // 不按字折行：updateLive 里按分句断（金额不会被折成两半）
      this.liveBody = addText(this, mx + 12, ky + G.dy.best, '', { size: TYPE.label, color: COLOR.ink, lineSpacing: 3 });
      this.liveBodyW = ph ? G.rightW - 24 : 392;
      this.updateLive();
      const off = onLiveChange(() => this.updateLive());
      this.events.once('shutdown', off);
    } else {
      // 最好成绩 / 今日挑战一句
      const best = profile.best[bestKey(sum.persona, sum.difficulty, sum.short)];
      // 新手课不进最好成绩：这里说过没过、心法去哪看
      const line = sum.lesson
        ? sum.won
          ? '新手课过了！六张心法都亮了，图鉴「心法」页能翻看'
          : '没过。跟着老师傅的建议走，照做就不亏'
        : sum.daily ? `今日挑战：${dailyText(profile.daily[sum.daily])}` : `${sum.personaName}·${sum.difficulty}级${sum.short ? '短局' : ''}最好：${bestText(best)}`;
      if (fits(ky + G.dy.best)) {
        addGlyph(this, mx + 12, ky + G.dy.best + 8, sum.lesson ? 'star' : 'trophy', 22);
        const lw = ph ? G.rightW - 100 : 380;
        const lt = clauseWrap(addText(this, mx + 30, ky + G.dy.best, line, { size: TYPE.label, color: COLOR.ink, lineSpacing: 2 }), lw);
        if (sum.daily ? this.result?.newDaily : this.result?.newBest) this.newTag(Math.min(mx + 30 + lt.width + 8, mx + lw + 20), ky + G.dy.best - 8);
      }
    }
    sum.recap.slice(0, lv0 ? 0 : row ? 1 : 2).forEach((l, i) => {
      if (!fits(ky + G.dy.recap + i * 22)) return;
      const t = addText(this, mx + 30, ky + G.dy.recap + i * 22, l, { size: TYPE.label - 1, color: COLOR.muted });
      let cut = Array.from(t.text);
      const rw = ph ? G.rightW - 40 : 380;
      while (t.width > rw && cut.length > 6) {
        cut = cut.slice(0, -2);
        t.setText(`${cut.join('')}…`);
        markCut(t);
      }
      addGlyph(this, mx + 12, ky + G.dy.recap + 8 + i * 22, 'bag', 16);
    });

    const rowFits = !G.single || rowY + 44 <= bottom;
    if (board && rowFits) this.rows.boardRow(mx, rowY, ph ? G.rightW : 404, sum.runId, board);
    else if (chal && rowFits) this.rows.challengeRow(mx, rowY, ph ? G.rightW : 404, sum);

    // 下次可以试试：离得最近的一两个成就和这局的进度。只在娱乐局放（实盘局不在筹码局里推"再来"，economy.md 第 0 节），
    // 只说成就进度，不提输赢和筹码；放不下（手机上经历多了）就不放
    if (!lv0) {
      const hy = row ? ky + G.dy.hint : ky + G.dy.recap + Math.min(sum.recap.length, 2) * 22;
      const hints = achievementHints(s, Object.keys(profile.achievements));
      if (hints.length > 0 && hy + 20 <= y + H - G.btnBottom - 6) this.rows.hintRow(mx, hy, ph ? G.rightW - 40 : 380, hints);
    }

    const by = y + H - G.btnBottom;
    const mk = (key: string, label: string, bx: number, w: number, variant: 'primary' | 'default', fn: () => void, hotkey?: string): void => {
      this.buttons[key] = new Button(this, bx, by, { width: w, height: G.btnH, label, variant, fontSize: FS.md, hotkey, onClick: fn });
    };
    // 手机：三个按钮加「分享」撑满右栏（350–500 宽），手指好点；中间的「新一局」宽一点
    const shareW = ph ? (G.stacked ? 76 : 102) : 132;
    const rest = G.rightW - shareW - 36;
    const bw = ph ? [Math.floor(rest * 0.3), rest - 2 * Math.floor(rest * 0.3), Math.floor(rest * 0.3)] : [120, 150, 110];
    const liveW = ph ? Math.min(180, G.rightW - 12 - 140) : bw[1]!;
    // 实盘局只有一个「回开始菜单」：不在结束页推"再开一局"（设计稿第 5 节），同种子重玩也会开出一局没带入的实盘
    if (lv0) mk('menu', '回开始菜单', mx + (ph ? 0 : bw[0]! + 12), liveW, 'primary', () => this.session.toTitle(), 'Esc');
    else {
      mk('retry', sum.lesson ? '再上一次' : sum.daily ? '再挑战' : '重玩', mx, bw[0]!, 'default', () => this.session.newRun(s.seed, s.setup), 'R');
      mk('new', sum.lesson ? '正式一局' : '新一局', mx + bw[0]! + 12, bw[1]!, 'primary', () => this.newRun(sum, profile), '空格');
      mk('menu', '主菜单', mx + bw[0]! + bw[1]! + 24, bw[2]!, 'default', () => this.session.toTitle(), 'Esc');
    }
    const retry = this.buttons.retry;
    if (retry) tipOnButton(retry, () => ({ x: mx, y: by, w: bw[0]!, h: G.btnH }), () => ({ title: sum.lesson ? '再上一次新手课' : sum.daily ? '再挑战一次' : '同一局再来', body: `这一局的编号：${s.seed}\n输入同一个编号能重玩同一局` }));
    // 回大厅：和开始菜单一样在左上角；这局已经结束、记进档案了，点了直接走。
    // 手机横屏纸卡几乎铺满：放在纸卡的左上角
    const lobbyAt = ph ? { x: x + 10, y: y + 12 } : { x: 14, y: 10 };
    this.buttons.lobby = new Button(this, lobbyAt.x, lobbyAt.y, { width: ph ? 96 : 104, height: 42, label: lobbyLabel(), icon: 'house', fontSize: FS.md, onClick: () => goLobby() });
    attachDomProxy(this, this.buttons.lobby, standalone() ? '回首页' : '回大厅');
    // 分享（共用包的分享卡）：电脑上放在右上角（和「大厅」对称），手机上放在按钮那一排的最右边
    const shareAt = ph ? { x: mx + (lv0 ? liveW + 12 : bw[0]! + bw[1]! + bw[2]! + 36), y: by, w: lv0 ? 140 : shareW, h: G.btnH } : { x: GAME_WIDTH - 14 - 132, y: 10, w: 132, h: 42 };
    this.shareButton(shareAt, sum);
  }


  /** 闪电盘演出用：资产大字、比开局的一行，要不要演出（进场滚数字） */
  flashNum: Phaser.GameObjects.Text | null = null;
  flashDelta: Phaser.GameObjects.Text | null = null;
  flashRoll = false;



  /**
   * 「分享」（docs/platform-integration.md 第 4 节）：数据交给共用包画卡、分享；手机能带图片就调系统分享，不能就出预览（存图、复制链接）。
   * 结束页一出来就先画好（共用包 prepareShare）：iOS 只许在点的那一下里调系统分享，点了再画就过期了、只能出预览。
   * 所以点击里直接调 share()，前面不能有 await。每日挑战读到名次后再画一张带名次的，画好了才换上，之前点分享的是手上那张。
   */
  shareButton(at: { x: number; y: number; w: number; h: number }, sum: RunSummary): void {
    const label = '分享';
    const prepare = (rank: number | null): PreparedShare => {
      const { artKey, text, ...card } = shareData(sum, rank);
      const name = myName();
      const art = shareArt(this.textures, artKey);
      return prepareShare(
        { ...card, ...(art && { art }), ...(name && { player: { name, badge: sum.title } }) },
        { url: gameLink(location.href), text, fileName: `kaipan-${sum.seed}.png` },
      );
    };
    const ranked = !!(sum.daily || sum.flash || sum.weekly);
    const rankNow = (): number | null => {
      const r = ranked ? runBoard(sum.runId) : null;
      return r?.state === 'done' && r.rank ? r.rank : null;
    };
    let shown = rankNow();
    let prepared = prepare(shown);
    const b = new Button(this, at.x, at.y, { width: at.w, height: at.h, label, icon: 'star', fontSize: FS.md, onClick: () => {
      void prepared.share().then((res) => b.scene && res !== 'cancelled' && sound.ui('select'), () => b.scene && sound.ui('denied'));
    } });
    // 画好之前转圈（一般几百毫秒）；画不出来也放开，点了由共用包出预览或报错
    b.setLoading(true, '画卡片');
    void prepared.ready.then(() => b.scene && b.setLoading(false, label));
    this.buttons.share = b;
    if (!ranked) return;
    const update = (): void => {
      const rank = rankNow();
      if (!rank || rank === shown || !b.scene) return;
      shown = rank;
      const next = prepare(rank);
      void next.ready.then(() => {
        if (shown === rank) prepared = next;
      });
    };
    const off = onBoardChange(update);
    this.events.once('shutdown', off);
  }


  /** "这段日子"小故事（真实行情局）：点成绩页上的按钮（或按 V）才打开，不再进场自动弹。 */
  private openReveal(): void {
    const v = storyView(this.session.state);
    if (!v || this.dialogOpen) return;
    const d = new RevealPanel(this, v, () => this.session.notify());
    this.trackDialog(d);
    this.session.notify();
  }

  /** 新局：沿用这局的人设和难度（每日挑战、调试局之后用上次自己选的）；都要按档案校验解锁，没解锁的退回新手 + 第 1 级。 */
  newRun(sum: RunSummary, profile: Profile): void {
    const want = sum.daily || !sum.ranked || this.result?.ignored ? loadLastSetup() : { persona: sum.persona, difficulty: sum.difficulty, short: sum.short };
    const setup = {
      persona: isPersonaUnlocked(profile, want.persona) ? want.persona : 'newbie',
      difficulty: isDifficultyUnlocked(profile, want.difficulty) ? want.difficulty : 1,
      short: want.short,
    } as const;
    saveLastSetup(setup);
    this.session.newRun(randomSeed(), funSetup(setup, profile.runs));
  }


  tag(x: number, y: number, text: string, fill: number, w: number): void {
    addPill(this, x, y - 2, w, 26, fill);
    addText(this, x + w / 2, y + 11, text, { size: TYPE.label, bold: true, color: COLOR.white, originX: 0.5, originY: 0.5 });
  }

  private newTag(x: number, y: number): void {
    const pill = addPill(this, x, y - 1, 56, 20, COLOR.up);
    const t = addText(this, pill.x + 28, y + 9, '新纪录', { size: FS.xs, bold: true, color: COLOR.white, originX: 0.5, originY: 0.5 });
    if (this.lively) this.tweens.add({ targets: [pill, t], alpha: { from: 1, to: 0.55 }, ease: 'Sine.easeInOut', duration: 600, yoyo: true, repeat: 3 });
  }

  protected override render(s: GameState): void {
    sound.mood(s.phase === 'won' ? 'victory' : 'defeat');
  }

  /** 实盘带回 ≥ 3 倍：屏幕正中一行大字弹出来，两秒后收起（点哪儿都不挡） */
  private celebrate(bp: number, gear: number): void {
    sound.cue({ type: 'settle', ret: 5 });
    confetti(this, this.anim);
    const V = viewOf(this);
    const t = addText(this, V.w / 2, V.h / 2, `杠杆 ×${gear}　带回 ${(bp / 10_000).toFixed(1)} 倍！`, {
      size: PHONE ? 40 : 52,
      bold: true,
      color: COLOR.accentDark,
      originX: 0.5,
      originY: 0.5,
      stroke: 0xfff6e6,
      strokeWidth: 10,
    }).setDepth(500);
    t.setName('end:celebrate');
    if (this.anim.instant) {
      this.time.delayedCall(2200, () => t.destroy());
      return;
    }
    t.setScale(0.3);
    this.tweens.add({ targets: t, scale: 1, duration: 420, ease: 'Back.Out' });
    this.tweens.add({ targets: t, alpha: 0, delay: 2200, ease: 'Sine.easeIn', duration: 500, onComplete: () => t.destroy() });
  }

  /** 实盘结算的字：按本机的实盘记录（待结、结完、作废、出错）；说过一次就记下，开始菜单不再弹 */
  private updateLive(): void {
    const head = this.liveHead;
    const body = this.liveBody;
    const sum = this.summary;
    if (!head?.active || !body?.active || !sum?.live) return;
    const r = live.record;
    const t = r && r.seed === this.session.state.seed ? liveEndText(r, sum.won, sum.live ? { x: sum.live.gear, margin: sum.live.margin } : undefined) : { head: '这局不算筹码', body: '这局没有带入筹码（或者本金已经原样退回），只是打着玩。' };
    head.setText(t.head);
    // 带回了（或正在结）：先写一行账本，讲清炒股赚的钱被生活费吃掉多少、按几倍算进筹码
    const ledger = r && r.seed === this.session.state.seed && r.kind !== 'refund' && (r.step === 'done' || r.step === 'settling') ? liveLedger(sum) : null;
    // 每段各自按分句断行再拼起来（clauseWrap 只认一段）
    body.setText(ledger ? `${ledger}\n${t.body}` : t.body);
    const paras = body.text.split('\n').map((p) => clauseWrap(body.setText(p), this.liveBodyW).text);
    body.setText(paras.join('\n'));
    setColor(head, r?.step === 'error' || r?.step === 'void' ? COLOR.danger : COLOR.accentDark);
    if (r && r.seed === this.session.state.seed && this.session.liveOk) live.markTold();
  }

  /** 进场：音效、彩带，然后依次弹出新成就、新人设、新难度（弹窗的素材在 meta 图集，先等它就绪）。 */
  override async enter(): Promise<void> {
    if (!this.summary) return;
    // 闪电盘：自己的高光演出（滚数字、落定、名次），不放通关过场、不弹"这段日子"和成就
    if (this.summary.flash || this.summary.weekly) {
      sound.mood('victory');
      await this.flash.flashReveal(this.summary);
      return;
    }
    sound.cue({ type: this.summary.won ? 'runWon' : 'runLost' });
    await this.cutscene(this.summary.won);
    await this.rollMoney(this.summary);
    if (this.summary.won) confetti(this, this.anim);
    // 实盘带回 ≥ 3 倍：大字庆祝、再放一次彩带和大赚的音效
    const lv = this.summary.live;
    if (lv && lv.bp >= 30_000) this.celebrate(lv.bp, lv.gear);
    const list = this.session.takeUnlocks(this.summary.runId, unlocksOf(this.result));
    const won = this.summary.won;
    // 不阻塞会话队列：玩家这时点「新局」也能马上走
    const unlocks = (): void => {
      if (list.length > 0) void this.showUnlocks(list, won);
    };
    // 真实行情局：「这段日子」不再自动弹出挡住成绩；每局第一次进结束页，成绩页上的按钮闪两下提醒，点了才打开
    if (this.session.state.real && this.session.takeReveal(this.summary.runId)) this.nudgeReveal();
    unlocks();
  }

  /** 最后剩的钱从开局本金滚到终值，滚动时一档一响，落定跳一下；关动画、减少动态效果、自动化下直接是终值。 */
  private async rollMoney(sum: RunSummary): Promise<void> {
    const num = this.moneyText;
    const a = this.anim;
    if (!num?.active) return;
    const start = sum.startAccount;
    const final = sum.account;
    if (a.instant || !this.lively) {
      num.setText(formatMoney(final));
      return;
    }
    a.begin();
    let last = -1;
    await a.count(start, final, 1400, (v) => {
      if (!num.active) return;
      num.setText(formatMoney(v));
      const p = final === start ? 1 : (v - start) / (final - start);
      const step = Math.floor(p * 12);
      if (step !== last) {
        last = step;
        sound.cue({ type: 'countUp', progress: Math.max(0, Math.min(1, p)) });
      }
    });
    if (!num.active) return;
    num.setText(formatMoney(final));
    sound.cue({ type: 'settle', ret: final >= start ? 5 : -3 });
    a.fx({ targets: num, scale: { from: 1.14, to: 1 }, duration: 360, ease: 'Back.Out' }, () => num.setScale(1));
  }

  /** 「这段日子」按钮闪两下金边（只有这一局第一次进结束页）；减少动态效果、关动画时不闪。 */
  private nudgeReveal(): void {
    const b = this.buttons.reveal;
    if (!b || this.anim.calm) return;
    const flash = (): void => {
      if (!this.sys.isActive() || !b.active) return;
      const r = b.rect();
      flashBox(this, this.anim, r.x - 3, r.y - 3, r.w + 6, r.h + 6, COLOR.gold, 330);
    };
    flash();
    this.time.delayedCall(700, flash);
  }

  /**
   * 结束页出场前的过场（art-v3 第 5 节）：通关放烟花、出局下雨，一行大字，1.2 秒后收起；点一下跳过。
   * 一局只有一次；关掉动画、「减少动态效果」时不放。过场时盖一层挡板，免得误点到下面的按钮。
   */
  private async cutscene(won: boolean): Promise<void> {
    const a = this.anim;
    if (a.instant || !this.lively) return;
    a.begin();
    const V = viewOf(this);
    const cv = coverOf(this);
    // 通关是半透明的暖幕，出局是更深的灰幕；字后面压一条横幅，烟花彩带再亮也看得清
    const block = this.add.rectangle(cv.x, cv.y, cv.w, cv.h, won ? COLOR.ink : 0x2a2630, won ? 0.25 : 0.55).setOrigin(0, 0).setDepth(390).setInteractive();
    const band = this.add.rectangle(cv.x, V.h / 2 - 92, cv.w, 184, COLOR.ink, 0.5).setOrigin(0, 0).setDepth(392);
    const big = addText(this, V.w / 2, V.h / 2 - 24, won ? '通关！' : '出局', {
      size: PHONE ? 60 : 76,
      bold: true,
      color: won ? COLOR.accent : 0xe2d8e6,
      originX: 0.5,
      originY: 0.5,
      stroke: COLOR.ink,
      strokeWidth: 10,
    }).setDepth(395);
    const sub = addText(this, V.w / 2, V.h / 2 + 40, won ? '带着钱上岸了' : '这一局到这儿了', { size: TYPE.title + 4, bold: true, color: COLOR.white, originX: 0.5, originY: 0.5, stroke: COLOR.ink, strokeWidth: 6 }).setDepth(395);
    a.fx({ targets: [big, sub], scale: { from: 0.4, to: 1 }, duration: 360, ease: 'Back.Out' }, () => [big, sub].forEach((t) => t.setScale(1)));
    if (won) [[0.25, 0.3], [0.75, 0.28], [0.5, 0.18]].forEach(([fx, fy], i) => this.time.delayedCall(i * 220, () => this.sys.isActive() && fireworks(this, a, V.w * fx!, V.h * fy!, true)));
    else [0.3, 0.55, 0.78].forEach((fx, i) => rainCloud(this, a, V.w * fx, V.h * (0.22 + (i % 2) * 0.06)));
    await a.wait(END_CUTSCENE_MS);
    const parts = [block, band, big, sub];
    a.fx({ targets: parts, alpha: 0, duration: 200 }, () => parts.forEach((p) => p.destroy()));
    if (a.instant) parts.forEach((p) => p.active && p.destroy());
  }

  private async showUnlocks(list: Unlock[], won: boolean): Promise<void> {
    await ensureMetaArt(this.textures);
    if (!this.sys.isActive()) return;
    await this.anim.wait(won ? 700 : 300);
    if (!this.sys.isActive() || this.dialogOpen) return;
    playUnlocks(this, this.anim, list, (d) => this.trackDialog(d), () => this.session.notify());
  }

  protected override teardown(): void {
    this.room?.destroy();
  }

  protected override onKey(e: KeyboardEvent): boolean {
    if (e.code === 'Space' || e.code === 'Enter') return (this.buttons.new ?? this.buttons.board)?.press() ?? false;
    if (e.code === 'KeyR') return this.buttons.retry?.press() ?? false;
    if (e.code === 'KeyV') return this.buttons.reveal?.press() ?? false;
    if (e.code === 'Escape') return this.buttons.menu?.press() ?? false;
    return false;
  }

  override controls(): Record<string, { x: number; y: number }> {
    const out: Record<string, { x: number; y: number }> = {};
    for (const [k, b] of Object.entries(this.buttons)) out[k] = b.center();
    return out;
  }
}

