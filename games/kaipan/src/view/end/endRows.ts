import { achievementView, challengeScore, dailyBoardId, difficultyView, personaView, type AchievementHint, type RunSummary } from '../../core/index.ts';
import { BoardPanel } from '../meta/boardPanel.ts';
import { onBoardChange, retryRun, runBoard } from '../dailyBoard.ts';
import type { Glyph } from '../assets.ts';
import { boardLine, boardScoreText, levelLabel } from '../labels.ts';
import { COLOR, FS, TYPE } from '../theme.ts';
import { addGlyph } from '../ui/art.ts';
import { bindTooltip, type TipContent } from '../ui/tooltip.ts';
import { addBadge, addPortrait } from '../meta/setupPanel.ts';
import { Button } from '../ui/button.ts';
import { addText, fitWidth } from '../ui/text.ts';
import { onChallengeChange, readChallenge, retryChallengeEnd, runChallenge, startChallenge } from '../challenge.ts';
import { ChallengeLinkDialog, ChallengePanel } from '../meta/challengePanel.ts';
import type { ChallengeFail } from '../../platform/challenge.ts';
import type { EndScene } from '../scenes/EndScene.ts';

/** 结束页右栏的几行和「收获」一排：好友挑战、排行榜、下次试试、本局收获。 */
export class EndRows {
  readonly s: EndScene;

  constructor(s: EndScene) {
    this.s = s;
  }

  /** 「下次可以试试」一行：星星 + 成就名 + 这局的进度，悬停看每个成就怎么拿 */
  hintRow(mx: number, hy: number, width: number, hints: readonly AchievementHint[]): void {
    addGlyph(this.s, mx + 12, hy + 8, 'star', 16);
    const t = addText(this.s, mx + 30, hy, `下次可以试试：${hints.map((h) => `${h.name} ${h.have}/${h.need}`).join(' · ')}`, { size: TYPE.label - 1, color: COLOR.info });
    let cut = Array.from(t.text);
    while (t.width > width && cut.length > 8) {
      cut = cut.slice(0, -2);
      t.setText(`${cut.join('')}…`);
    }
    t.setInteractive();
    bindTooltip(t, () => ({ x: mx + 30, y: hy, w: t.width, h: t.height }), () => ({ title: '下次可以试试', body: hints.map((h) => `${h.name}：${h.desc}（这局 ${h.have}/${h.need}）`).join('\n') }));
  }

  /**
   * 每日挑战的排行榜一行（0.5.10）：交分的状态（交上了排第几、今天交太多了、连不上……）+「排行榜」；连不上时多一个「重试」。
   * 交分是异步的，状态变了只重画这一行。
   */
  boardRow(x: number, y: number, w: number, runId: string, date: string): void {
    const box = this.s.add.container(0, 0);
    const draw = (): void => {
      box.removeAll(true);
      delete this.s.buttons.board;
      delete this.s.buttons['board:retry'];
      const b = runBoard(runId);
      const line = boardLine(b);
      const open = new Button(this.s, x + w - 100, y - 4, { width: 100, height: 34, label: '排行榜', icon: 'trophy', fontSize: FS.sm });
      open.setHandler(() => {
        if (!this.s.dialogOpen) this.s.trackDialog(new BoardPanel(this.s, date, 'boardId' in b ? b.boardId : dailyBoardId(date)));
      });
      box.add(open);
      this.s.buttons.board = open;
      let right = x + w - 100 - 8;
      if (line?.retry) {
        const retry = new Button(this.s, right - 64, y - 4, { width: 64, height: 34, label: '重试', fontSize: FS.sm });
        retry.setHandler(() => retryRun(runId));
        box.add(retry);
        this.s.buttons['board:retry'] = retry;
        right -= 64 + 8;
      }
      box.add(addGlyph(this.s, x + 12, y + 13, 'star', 18));
      // 不计入档案（调试局等）：不交分，只留「排行榜」入口，星号后面写上是哪天的榜（这局的日期不一定是今天）
      const t = addText(this.s, x + 30, y + 13, line?.text ?? `每日排行 ${date.slice(5).replace('-', '/')}`, { size: TYPE.label - 1, bold: !!line?.good, color: line?.good ? COLOR.accentDark : COLOR.muted, originY: 0.5 });
      let cut = Array.from(t.text);
      while (t.width > right - x - 34 && cut.length > 4) {
        cut = cut.slice(0, -2);
        t.setText(`${cut.join('')}…`);
      }
      box.add(t);
    };
    draw();
    const off = onBoardChange(() => box.active && draw());
    box.once('destroy', off);
  }

  /**
   * 0.13.0 好友挑战的一行：挑战局写交成绩的状态和「看成绩」；别的娱乐局写一句邀请和「挑战好友」（点了交给平台、拿链接）。
   * 交成绩是异步的，状态变了只重画这一行。
   */
  challengeRow(x: number, y: number, w: number, sum: RunSummary): void {
    const s = this.s.session.state;
    const box = this.s.add.container(0, 0);
    const keys = ['challenge', 'challenge:results', 'challenge:retry'];
    const line = (text: string, good = false): void => {
      const t = addText(this.s, x + 30, y + 13, text, { size: TYPE.label - 1, bold: good, color: good ? COLOR.accentDark : COLOR.muted, originY: 0.5 });
      fitWidth(t, w - 30 - 108 - (this.s.buttons['challenge:retry'] ? 72 : 0));
      box.add([addGlyph(this.s, x + 12, y + 13, 'trophy', 18), t]);
    };
    const button = (key: string, label: string, bx: number, bw: number, fn: () => void): Button => {
      const b = new Button(this.s, bx, y - 4, { width: bw, height: 34, label, fontSize: FS.sm });
      b.setHandler(fn);
      box.add(b);
      this.s.buttons[key] = b;
      return b;
    };
    const draw = (): void => {
      box.removeAll(true);
      for (const k of keys) delete this.s.buttons[k];
      const r = runChallenge(s.seed);
      if (!r) {
        line('发给好友，同一局比一比');
        const b = button('challenge', '挑战好友', x + w - 100, 100, () => {
          b.setLoading(true, '建挑战');
          void startChallenge(s, sum).then((c) => {
            if (!b.scene) return;
            b.setLoading(false, c.ok ? '挑战好友' : CHALLENGE_SEND_FAIL[c.why]);
            if (c.ok && !this.s.dialogOpen) this.s.trackDialog(new ChallengeLinkDialog(this.s, c.url, `开盘挑战：我${boardScoreText(challengeScore(sum))}，同一局你来试试`));
          });
        });
        return;
      }
      const open = button('challenge:results', '看成绩', x + w - 100, 100, () => {
        open.setLoading(true, '读成绩');
        void readChallenge(r.id).then((v) => {
          if (!open.scene) return;
          open.setLoading(false, v.ok ? '看成绩' : '没读到');
          if (v.ok && !this.s.dialogOpen) this.s.trackDialog(new ChallengePanel(this.s, v.view));
        });
      });
      open.setEnabled(r.state === 'done');
      if (r.state === 'error' && r.why !== 'gone' && r.why !== 'full') button('challenge:retry', '重试', x + w - 100 - 72, 64, () => retryChallengeEnd(s, sum));
      if (r.state === 'sending') line(`正在把成绩交给 ${r.owner} 的挑战……`);
      else if (r.state === 'error') line(CHALLENGE_END_FAIL[r.why]);
      else {
        const me = r.view?.me;
        const where = me ? `挑战里第 ${me.rank ?? '—'} 名 · 共 ${r.view?.count ?? 1} 人` : '成绩交上了';
        line(r.already ? `之前交过，只算第一次：${where}` : where, !r.already);
      }
    };
    draw();
    const off = onChallengeChange(() => box.active && draw());
    box.once('destroy', off);
  }

  /** 本局新达成的成就、新解锁的人设和难度、点亮的图鉴：一排图标 + 数字，名字在悬停；没计入档案时一行短话（原因在悬停）。 */
  gains(x: number, y: number, sum: RunSummary, icon = 34, room = Infinity): void {
    const r = this.s.result;
    const why: string | null = !r
      ? '这次不写档案'
      : r.ignored === 'debug'
        ? '调试局（URL 开局参数或调试模式），不计入档案和成就'
        : r.ignored === 'locked'
          ? '这个人设或难度还没解锁，这局不计入档案'
          : r.ignored === 'future'
            ? '每日挑战的日期还没到，这局不计入档案'
            : r.ignored === 'duplicate'
              ? '这局已经记进档案了'
              : r.ignored === 'unfinished'
                ? '这局还没结束'
                : null;
    if (why || !r) {
      const t = addText(this.s, x, y + 20, '不计入档案', { size: TYPE.label, color: COLOR.muted, originY: 0.5 }).setInteractive();
      bindTooltip(t, () => ({ x, y, w: t.width, h: 40 }), () => ({ title: '不计入档案', body: why ?? '' }));
      return;
    }
    const chips: { g?: Glyph; art?: (cx: number, cy: number) => void; v: string; tip: TipContent }[] = [];
    if (r.newAchievements.length > 0) chips.push({ g: 'star', v: `×${r.newAchievements.length}`, tip: { title: '新成就', body: r.newAchievements.map((id) => achievementView(id).name).join('、') } });
    for (const id of r.newPersonas) {
      const p = personaView(id);
      chips.push({ art: (cx, cy) => addPortrait(this.s, cx, cy, p, false, 34), v: '新', tip: { title: '解锁人设', body: p.name } });
    }
    if (r.newDifficulty !== null) {
      const d = difficultyView(r.newDifficulty);
      chips.push({ art: (cx, cy) => addBadge(this.s, cx, cy, d.level, 38), v: '新', tip: { title: '解锁难度', body: levelLabel(d.level, d.name) } });
    }
    const seen = r.newSeen.stocks.length + r.newSeen.friends.length + r.newSeen.items.length + r.newSeen.events.length;
    if (seen > 0) chips.push({ g: 'book', v: `+${seen}`, tip: { title: '图鉴', body: `图鉴里新点亮了 ${seen} 条` } });
    if (r.newKnowledge.length > 0) chips.push({ g: 'gift', v: `+${r.newKnowledge.length}`, tip: { title: '小知识', body: `点亮小知识 ${r.newKnowledge.length} 张` } });
    if (sum.recap.length > 0) chips.push({ g: 'bag', v: `${sum.recap.length}`, tip: { title: '这局的经历', body: sum.recap.map((l) => `· ${l}`).join('\n') } });
    if (chips.length === 0) {
      addText(this.s, x, y + 20, '这次空手', { size: TYPE.label, color: COLOR.muted, originY: 0.5 });
      return;
    }
    let cx = x;
    // icon 小于 34（手机）时整枚收窄：图标格 = icon + 14
    const lead = icon + 14;
    const list = chips.slice(0, 6);
    for (const [i, c] of list.entries()) {
      const t = addText(this.s, 0, 0, c.v, { size: TYPE.title, bold: true, num: true, color: COLOR.accentDark, originY: 0.5 });
      const w = lead + t.width + (icon < 34 ? 8 : 10);
      // 手机窄屏放不下的几枚收成一个「+N」，悬停里逐条写
      const left = list.slice(i);
      if (left.length > 1 && cx + w + 8 + 52 > x + room) {
        t.destroy();
        this.moreChip(cx, y, left.map((m) => m.tip));
        return;
      }
      this.s.add.rectangle(cx, y, w, 44, COLOR.paperHi, 0.9).setOrigin(0, 0).setRounded(12).setStrokeStyle(2, COLOR.edge, 1);
      if (c.g) addGlyph(this.s, cx + lead / 2, y + 22, c.g, icon);
      else c.art?.(cx + lead / 2, y + 22);
      t.setPosition(cx + lead - 2, y + 22).setDepth(1);
      const hit = this.s.add.rectangle(cx, y, w, 44, 0xffffff, 0.001).setOrigin(0, 0).setDepth(2);
      const hx = cx;
      bindTooltip(hit, () => ({ x: hx, y, w, h: 44 }), () => c.tip);
      cx += w + 8;
    }
  }

  moreChip(x: number, y: number, tips: readonly TipContent[]): void {
    const t = addText(this.s, x + 10, y + 22, `+${tips.length}`, { size: TYPE.title, bold: true, num: true, color: COLOR.accentDark, originY: 0.5 }).setDepth(1);
    const w = Math.max(52, t.width + 20);
    this.s.add.rectangle(x, y, w, 44, COLOR.paperHi, 0.9).setOrigin(0, 0).setRounded(12).setStrokeStyle(2, COLOR.edge, 1);
    const hit = this.s.add.rectangle(x, y, w, 44, 0xffffff, 0.001).setOrigin(0, 0).setDepth(2);
    bindTooltip(hit, () => ({ x, y, w, h: 44 }), () => ({ title: '还有', body: tips.map((tp) => `${tp.title}：${tp.body}`).join('\n') }));
  }
}

/** 发起没成：按钮上写一句（下一次点照样能发） */
const CHALLENGE_SEND_FAIL: Record<ChallengeFail, string> = {
  out: '先登录',
  gone: '发不了',
  full: '发不了',
  limit: '今天发够了',
  busy: '服务器忙',
  offline: '没连上',
  bug: '发不了',
};

/** 挑战局交成绩没成：那一行写什么 */
const CHALLENGE_END_FAIL: Record<ChallengeFail, string> = {
  out: '登录后才能交挑战的成绩',
  gone: '这个挑战已经打不开了（过期了），成绩没交上',
  full: '这个挑战已经满 100 人了，成绩没交上',
  limit: '服务器今天有点忙，挑战的成绩没交上',
  busy: '服务器今天有点忙，挑战的成绩没交上',
  offline: '没连上，挑战的成绩没交上',
  bug: '挑战的成绩没交上',
};
