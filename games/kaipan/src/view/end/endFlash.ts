import { dailyBoardId, flashScore, formatMoney, formatPoints, weeklyBoardId, weeklyInfo, type GameState, type RunSummary } from '../../core/index.ts';
import { BoardPanel } from '../meta/boardPanel.ts';
import { onBoardChange, retryRun, runBoard } from '../dailyBoard.ts';
import { attachDomProxy } from '../ui/domProxy.ts';
import { goLobby, lobbyLabel } from '../lobby.ts';
import { loadProfile } from '../../platform/profile.ts';
import type { Glyph } from '../assets.ts';
import { confetti, fireworks, rainCloud, sparkles } from '../fx/particles.ts';
import { FLASH_DAYS, boardLine, flashTag, weeklyTag } from '../labels.ts';
import { sound } from '../sound.ts';
import { COLOR, FS, GAME_WIDTH, TYPE, signColor } from '../theme.ts';
import { addGlyph } from '../ui/art.ts';
import { tipOnButton } from '../meta/bits.ts';
import { Button } from '../ui/button.ts';
import { addText, fitWidth } from '../ui/text.ts';
import type Phaser from 'phaser';
import { viewOf } from '../viewport.ts';
import { standalone } from '../../platform/mode.ts';
import type { EndScene } from '../scenes/EndScene.ts';
import type { Geo } from './endGeo.ts';

/** 闪电盘 / 本周盘的结束页：搭画面和进场演出（拿场景引用 s，状态都留在场景）。 */
export class EndFlash {
  readonly s: EndScene;

  constructor(s: EndScene) {
    this.s = s;
  }

  /**
   * 闪电盘的结束页（高光演出）：最终资产从开局本钱一下一下滚上去（countUp 滴答声，收盘落定音、烟花或下雨），
   * 比开局多 / 少多少淡入，然后是今日名次（交完分读到名次时盖章、弹出；前三名放烟花）。
   * 下面「再挑战」「排行榜」（单独部署没有榜时换成「新一局」）「主菜单」，右上「分享」。
   * 闪电盘不进档案，所以没有成就、解锁、最好成绩这些；电脑一列居中，手机横屏分左右两栏（左：资产，右：名次）。
   */
  buildFlash(sum: RunSummary, s: GameState, G: Geo, ph: boolean): void {
    const weekly = sum.weekly !== null;
    const date = (sum.weekly ?? sum.flash) as string;
    const rule = weekly ? weeklyInfo(date) : null;
    const { x, y, w: W, h: H } = G;
    const final = flashScore(s);
    const start = sum.startAccount;
    const gain = final - start;
    const L = x + G.pad;
    // 竖屏一栏（0.33.0）：「大厅」「分享」占着标题行，两枚标签挪到下面一行；资产和排名上下排、居中，像电脑上一样
    const one = !!G.single;
    const hx = one ? 0 : ph ? 104 : 0;
    const hy = y + (one ? 80 : G.headY);
    this.s.tag(L + hx, hy - 10, weekly ? weeklyTag(date) : flashTag(date), weekly ? COLOR.accent : COLOR.accent, weekly ? 150 : 128);
    const who = `${sum.personaName} · Lv${sum.difficulty}`;
    this.s.tag(L + hx + (weekly ? 160 : 138), hy - 10, who, COLOR.info, Math.max(92, Array.from(who).length * 14 + 24));
    // 版面：电脑一列居中；手机左右两栏
    const two = ph && !one;
    const lx = two ? x + W * 0.27 : x + W / 2;
    const rx = two ? x + W * 0.73 : x + W / 2;
    const ky = y + (one ? 136 : ph ? 74 : 94);
    const ny = y + (one ? 192 : ph ? 128 : 170);
    const dy = y + (one ? 244 : ph ? 176 : 232);
    const rky = two ? ky : y + (one ? 340 : 322);
    const rny = two ? ny : y + (one ? 396 : 376);
    const rly = two ? dy : y + (one ? 448 : 428);
    const kick = (cx: number, cy: number, text: string): void => {
      addText(this.s, cx, cy, text, { size: TYPE.label + 2, bold: true, color: COLOR.muted, originX: 0.5, originY: 0.5 });
    };
    kick(lx, ky, rule ? `本周「${rule.name}」· ${FLASH_DAYS} 天后的资产` : `${FLASH_DAYS} 天后的资产`);
    // 最终资产：先写开局本钱（演出时滚上去），不演出（动画关、重建画面）直接写终值
    this.s.flashRoll = this.s.lively && this.s.session.takeReveal(sum.runId);
    const long = Math.max(this.yuanText(start).length, this.yuanText(final).length);
    const numSize = Math.round((ph ? 46 : 84) * Math.min(1, 9 / long));
    this.s.flashNum = addText(this.s, lx, ny, this.yuanText(this.s.flashRoll ? start : final), { size: numSize, bold: true, num: true, color: COLOR.ink, originX: 0.5, originY: 0.5, stroke: COLOR.paper, strokeWidth: 6 });
    const pct = start > 0 ? (final / start - 1) * 100 : 0;
    this.s.flashDelta = addText(this.s, lx, dy, `比开局 ${formatMoney(gain, { sign: true })}（${formatPoints(pct, 1)}）`, { size: TYPE.title + (ph ? 0 : 4), bold: true, color: signColor(gain), originX: 0.5, originY: 0.5 }).setAlpha(this.s.flashRoll ? 0 : 1);
    // 最赚的一笔（只写真赚了的）：放在资产下面一行
    const best = sum.bestTrade;
    if (best && best.ret > 0) {
      const by = dy + (ph ? 30 : 36);
      const line = addText(this.s, lx + 12, by, `最赚的一笔：${best.name} ${formatPoints(best.ret, 1)}`, { size: TYPE.label, color: COLOR.muted, originX: 0.5, originY: 0.5 });
      fitWidth(line, two ? W * 0.46 : W - (one ? 64 : 120));
      addGlyph(this.s, line.x - line.width / 2 - 14, by, 'star', 18);
    }
    // 名次：先写「…」，榜上的状态变了就重画（交完分、读到名次、连不上）
    kick(rx, rky, weekly ? '本周排名' : '今日排名');
    if (!two) this.s.add.rectangle(x + (one ? 24 : 60), rky - 24, W - (one ? 48 : 120), 2, COLOR.edge, 0.6).setOrigin(0, 0);
    const box = this.s.add.container(0, 0);
    let shownRank: number | null | undefined;
    const draw = (): void => {
      box.removeAll(true);
      delete this.s.buttons['board:retry'];
      const b = runBoard(sum.runId);
      const line = boardLine(b, weekly ? 'weekly' : 'flash');
      const rank = b.state === 'done' && b.result.kind === 'ok' ? b.rank : undefined;
      const big = rank ? `第 ${rank} 名` : rank === null ? '1 万名以后' : b.state === 'done' && b.result.kind === 'ok' ? '已上榜' : b.state === 'sending' || b.state === 'later' ? '…' : '—';
      const t = addText(this.s, rx, rny, big, { size: rank ? (ph ? 44 : 64) : ph ? 32 : 44, bold: true, num: true, color: rank ? COLOR.accentDark : COLOR.muted, originX: 0.5, originY: 0.5, stroke: COLOR.paper, strokeWidth: 6 });
      fitWidth(t, two ? W * 0.42 : W - (one ? 48 : 160));
      box.add(t);
      if (rank && shownRank !== rank) {
        shownRank = rank;
        this.flashRankIn(t, rx, rny, rank);
      }
      const text = line?.text ?? (b.state === 'none' ? '这局不上榜' : '');
      const lt = addText(this.s, rx, rly, text, { size: TYPE.label, bold: !!line?.good, color: line?.good ? COLOR.accentDark : COLOR.muted, originX: 0.5, originY: 0.5, wrap: two ? W * 0.42 : W - (one ? 48 : 200), align: 'center' });
      box.add(lt);
      if (line?.retry) {
        const retry = new Button(this.s, rx - 32, rly + 18, { width: 64, height: 34, label: '重试', fontSize: FS.sm });
        retry.setHandler(() => retryRun(sum.runId));
        box.add(retry);
        this.s.buttons['board:retry'] = retry;
      }
    };
    draw();
    const off = onBoardChange(() => box.active && draw());
    box.once('destroy', off);

    // 按钮：再挑战、排行榜（没有平台时「新一局」）、主菜单；「大厅」「分享」在两个上角
    const by = y + H - G.btnBottom + (ph ? 4 : 0);
    const bw = one ? [100, 132, 92] : ph ? [120, 170, 110] : [140, 190, 130];
    const total = bw[0]! + bw[1]! + bw[2]! + 32;
    const bx = ph ? x + (W - total) / 2 : x + (W - total) / 2;
    const mk = (key: string, label: string, ax: number, w: number, variant: 'primary' | 'default', fn: () => void, hotkey?: string, icon?: Glyph): Button => {
      const b = new Button(this.s, ax, by, { width: w, height: G.btnH, label, variant, fontSize: FS.md, hotkey, ...(icon ? { icon } : {}), onClick: fn });
      this.s.buttons[key] = b;
      return b;
    };
    const retry = mk('retry', '再挑战', bx, bw[0]!, 'default', () => this.s.session.newRun(s.seed, s.setup), 'R');
    tipOnButton(retry, () => ({ x: bx, y: by, w: bw[0]!, h: G.btnH }), () => ({ title: '再挑战一次', body: `同一局再来，榜上留你最好的一次。\n这一局的编号：${s.seed}` }));
    if (standalone()) mk('new', '新一局', bx + bw[0]! + 16, bw[1]!, 'primary', () => this.s.newRun(sum, loadProfile().profile), '空格');
    else {
      mk('board', '排行榜', bx + bw[0]! + 16, bw[1]!, 'primary', () => {
        const b = runBoard(sum.runId);
        if (!this.s.dialogOpen) this.s.trackDialog(new BoardPanel(this.s, date, 'boardId' in b ? b.boardId : weekly ? weeklyBoardId(date) : dailyBoardId(date, 'flash'), undefined, weekly ? 'weekly' : 'flash'));
      }, '空格', 'trophy');
    }
    mk('menu', '主菜单', bx + bw[0]! + bw[1]! + 32, bw[2]!, 'default', () => this.s.session.toTitle(), 'Esc');
    // 竖屏一栏：按钮那一排占满宽，局号挪到按钮上面
    addText(this.s, x + G.pad, one ? by - 14 : y + H - (ph ? 17 : 26), `#${s.seed}`, { size: FS.xs, color: COLOR.dim, originY: 0.5 });
    const lobbyAt = ph ? { x: x + 10, y: y + 12 } : { x: 14, y: 10 };
    this.s.buttons.lobby = new Button(this.s, lobbyAt.x, lobbyAt.y, { width: ph ? 96 : 104, height: 42, label: lobbyLabel(), icon: 'house', fontSize: FS.md, onClick: () => goLobby() });
    attachDomProxy(this.s, this.s.buttons.lobby, standalone() ? '回首页' : '回大厅');
    this.s.shareButton(ph ? { x: x + W - 10 - 100, y: y + 12, w: 100, h: 42 } : { x: GAME_WIDTH - 14 - 132, y: 10, w: 132, h: 42 }, sum);
  }

  yuanText(v: number): string {
    return `¥${Math.round(v).toLocaleString('en-US')}`;
  }

  /** 名次出来：大字弹出 + 盖章声；前三名再放烟花、响金卡音 */
  flashRankIn(t: Phaser.GameObjects.Text, cx: number, cy: number, rank: number): void {
    if (this.s.anim.instant || !this.s.lively) return;
    sound.cue({ type: 'stamp', paid: true, credit: false });
    if (rank <= 3) sound.cue({ type: 'rareCard' });
    t.setScale(0.3);
    this.s.tweens.add({ targets: t, scale: 1, duration: 420, ease: 'Back.Out' });
    if (rank <= 3) fireworks(this.s, this.s.anim, cx, cy - 20, true);
    else sparkles(this.s, this.s.anim, cx, cy, 14);
  }

  /** 进场演出：资产滚上去 → 落定（烟花 / 下雨）→ 比开局一行淡入 */
  async flashReveal(sum: RunSummary): Promise<void> {
    const num = this.s.flashNum;
    const delta = this.s.flashDelta;
    if (!num || !delta) return;
    const final = flashScore(this.s.session.state);
    const start = sum.startAccount;
    const a = this.s.anim;
    if (!this.s.flashRoll || a.instant) {
      num.setText(this.yuanText(final));
      delta.setAlpha(1);
      return;
    }
    a.begin();
    await a.wait(300);
    let last = -1;
    await a.count(start, final, 1900, (v) => {
      if (!num.active) return;
      num.setText(this.yuanText(v));
      const p = Math.abs(final - start) < 1e-9 ? 1 : (v - start) / (final - start);
      const step = Math.floor(p * 16);
      if (step !== last) {
        last = step;
        sound.cue({ type: 'countUp', progress: Math.max(0, Math.min(1, p)) });
        num.setScale(1.04);
        this.s.tweens.add({ targets: num, scale: 1, duration: 80 });
      }
    });
    if (!num.active) return;
    num.setText(this.yuanText(final));
    const up = final > start;
    sound.cue({ type: 'settle', ret: up ? 5 : -3 });
    const V = viewOf(this.s);
    if (up) {
      confetti(this.s, a);
      fireworks(this.s, a, num.x, num.y - 30, true);
    } else rainCloud(this.s, a, num.x, V.h * 0.25);
    a.fx({ targets: num, scale: { from: 1.18, to: 1 }, duration: 380, ease: 'Back.Out' }, () => num.setScale(1));
    a.fx({ targets: delta, alpha: 1, duration: 360 }, () => delta.setAlpha(1));
    await a.wait(400);
  }
}
