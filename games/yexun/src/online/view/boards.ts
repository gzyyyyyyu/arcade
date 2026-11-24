/**
 * 排行榜界面（DOM）：总榜（守夜 / 夜探 / 无尽）、今天的每日榜（守夜 / 夜探 / 连战）和本周夜事榜，全部 / 好友两个范围。
 * 别人的昵称都用 textContent 放进去，不拼 HTML。可点的 ≥ 44×44。
 * 主代理接进菜单：`const boards = new BoardsPanel(root, { deps, today: () => beijingDate(Date.now()), onClose })`，菜单上"排行"按钮调 `boards.show()`。
 */
import { readBoard, type BoardDeps, type BoardResult, type Scope } from '../api.ts';
import { netDown } from '../../platform/messages.ts';
import { dailyBoardId } from '../daily.ts';
import { rushBoardId } from '../rush.ts';
import { formatScore, type BoardKind } from '../score.ts';
import { weeklyBoardId } from '../weekly.ts';
import { closeModal, modalChrome, openModal } from '../../view/ui/modal.ts';
import { PAGER_CTL, Pager } from '../../view/ui/pager.ts';
import './boards.css';

interface Tab {
  key: string;
  name: string;
  kind: BoardKind;
  boardId: (today: string) => string;
}

export const TABS: readonly Tab[] = [
  { key: 'vigil', name: '守夜', kind: 'vigil', boardId: () => 'vigil' },
  { key: 'raid', name: '夜探', kind: 'raid', boardId: () => 'raid' },
  { key: 'endless', name: '无尽', kind: 'endless', boardId: () => 'endless' },
  { key: 'dvigil', name: '每日守夜', kind: 'daily-vigil', boardId: (d) => dailyBoardId(d, 'vigil') },
  { key: 'draid', name: '每日夜探', kind: 'daily-raid', boardId: (d) => dailyBoardId(d, 'raid') },
  { key: 'drush', name: '每日连战', kind: 'daily-rush', boardId: (d) => rushBoardId(d) },
  { key: 'wvigil', name: '本周夜事', kind: 'weekly-vigil', boardId: (d) => weeklyBoardId(d) },
];

export interface BoardsOptions {
  deps: BoardDeps;
  today(): string;
  onClose(): void;
}

const NOTE: Record<Exclude<BoardResult['kind'], 'ok'>, string> = {
  busy: '榜单有点忙，稍后再看',
  offline: netDown('点一下标签重试'),
  out: '登录后才能看排行',
  bug: '榜单这会儿读不出来，稍后再试',
};

export class BoardsPanel {
  private readonly root: HTMLDivElement;
  private tab = 'vigil';
  private scope: Scope = 'all';
  /** 切得快时丢掉过期的回答 */
  private seq = 0;
  /** 榜单一屏放不下就翻页（每页几行按可用高度算） */
  private pager: Pager | null = null;

  private readonly opts: BoardsOptions;

  constructor(parent: HTMLElement, opts: BoardsOptions) {
    this.opts = opts;
    this.root = document.createElement('div');
    this.root.className = 'yx-screen yx-boards-layer';
    this.root.style.display = 'none';
    parent.appendChild(this.root);
  }

  show(): void {
    this.root.style.display = '';
    this.render();
    openModal(this.root, () => this.close(), () => this.hide());
    void this.load();
  }

  hide(): void {
    this.root.style.display = 'none';
    this.pager?.destroy();
    this.pager = null;
    this.seq++;
    closeModal(this.root);
  }

  /** 返回按钮、✕、点遮罩、Esc 共用 */
  private close(): void {
    this.hide();
    this.opts.onClose();
  }

  private render(): void {
    this.pager?.destroy();
    const panel = document.createElement('div');
    panel.className = 'yx-panel yx-boards';
    const head = document.createElement('div');
    head.className = 'yx-panel-head';
    const title = document.createElement('b');
    title.className = 'yx-brush';
    title.textContent = '排行';
    const scopeBtn = document.createElement('button');
    scopeBtn.type = 'button';
    scopeBtn.className = 'yx-tab';
    // 按钮写现在看的范围、点了换另一个（试玩 11-23：只写「全部」看不出是范围开关）
    scopeBtn.textContent = this.scope === 'all' ? '看全部玩家' : '只看好友';
    scopeBtn.title = this.scope === 'all' ? '点一下只看好友' : '点一下看全部玩家';
    scopeBtn.onclick = () => {
      this.scope = this.scope === 'all' ? 'friends' : 'all';
      this.render();
      void this.load();
    };
    head.append(title, scopeBtn);
    const tabs = document.createElement('div');
    tabs.className = 'yx-tabs';
    for (const t of TABS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `yx-tab${t.key === this.tab ? ' on' : ''}`;
      b.textContent = t.name;
      b.onclick = () => {
        this.tab = t.key;
        this.render();
        void this.load();
      };
      tabs.appendChild(b);
    }
    const note = document.createElement('div');
    note.className = 'yx-bnote';
    note.textContent = '读榜中…';
    const list = document.createElement('ol');
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'yx-big ghost';
    close.textContent = '返回';
    close.onclick = () => this.close();
    const foot = document.createElement('div');
    foot.className = 'yx-row3 yx-pgfoot';
    foot.insertAdjacentHTML('afterbegin', PAGER_CTL);
    foot.appendChild(close);
    panel.append(head, tabs, note, list, foot);
    this.root.replaceChildren(panel);
    this.pager = new Pager({ body: list, ctl: foot.querySelector<HTMLElement>('.yx-pager')!, leaves: 'li' });
    modalChrome(this.root);
  }

  private async load(): Promise<void> {
    const my = ++this.seq;
    const t = TABS.find((x) => x.key === this.tab)!;
    const r = await readBoard(this.opts.deps, t.boardId(this.opts.today()), this.scope);
    if (my !== this.seq) return;
    const note = this.root.querySelector<HTMLElement>('.yx-bnote');
    const list = this.root.querySelector<HTMLElement>('ol');
    if (!note || !list) return;
    list.replaceChildren();
    if (r.kind !== 'ok') {
      note.textContent = NOTE[r.kind];
      this.pager?.refresh();
      return;
    }
    note.textContent = r.entries.length === 0 ? '还没有人上榜，你来第一个' : r.me ? `你：${r.me.rank === null ? '榜外' : `第 ${r.me.rank} 名`} · ${formatScore(t.kind, r.me.score)}` : '你还没上榜';
    for (const e of r.entries) {
      const li = document.createElement('li');
      if (e.isMe) li.className = 'me';
      const rank = document.createElement('b');
      rank.textContent = String(e.rank);
      const name = document.createElement('span');
      name.textContent = e.displayName;
      const score = document.createElement('em');
      score.textContent = formatScore(t.kind, e.score);
      li.append(rank, name, score);
      list.appendChild(li);
    }
    this.pager?.go(0);
    this.pager?.refresh();
  }
}
