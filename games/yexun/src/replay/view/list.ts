/**
 * 录像列表（DOM）：最近的几局和每榜最好的一局，点"回放"进入回放。
 * 主代理接进菜单：`const list = new ReplayList(root, { onPlay: (rec) => startReplay(rec), onClose })`，菜单上"回放"按钮调 `list.show(loadReplays())`。
 */
import { BLOCKED_TEXT, isBlocked, isOutdated, OUTDATED_TEXT, replayResult, replayTitle, showBest } from '../describe.ts';
import type { ReplayRecord } from '../format.ts';
import { closeModal, openModal } from '../../view/ui/modal.ts';
import { PAGER_CTL, Pager } from '../../view/ui/pager.ts';
import './replay.css';

export interface ReplayListOptions {
  onPlay(rec: ReplayRecord): void;
  onClose(): void;
}

export class ReplayList {
  private readonly root: HTMLDivElement;
  private pager: Pager | null = null;

  private readonly opts: ReplayListOptions;

  constructor(parent: HTMLElement, opts: ReplayListOptions) {
    this.opts = opts;
    this.root = document.createElement('div');
    this.root.className = 'yx-screen yx-replays-layer';
    this.root.style.display = 'none';
    parent.appendChild(this.root);
  }

  show(items: readonly ReplayRecord[]): void {
    this.pager?.destroy();
    const panel = document.createElement('div');
    panel.className = 'yx-panel yx-replays';
    const head = document.createElement('div');
    head.className = 'yx-panel-head';
    const title = document.createElement('b');
    title.className = 'yx-brush';
    title.textContent = '回放';
    const sub = document.createElement('em');
    sub.textContent = '只存在这台设备上';
    head.append(title, sub);
    const ul = document.createElement('ul');
    if (items.length === 0) {
      const li = document.createElement('li');
      li.textContent = '还没有录像，打完一局就有了';
      ul.appendChild(li);
    }
    for (const r of items) {
      const li = document.createElement('li');
      const text = document.createElement('div');
      text.textContent = `${replayTitle(r)} · ${replayResult(r)}`;
      const small = document.createElement('small');
      const when = new Date(r.at);
      small.textContent = `${when.getMonth() + 1} 月 ${when.getDate()} 日 ${String(when.getHours()).padStart(2, '0')}:${String(when.getMinutes()).padStart(2, '0')}`;
      if (showBest(r)) {
        const b = document.createElement('span');
        b.className = 'best';
        b.textContent = ' · 最好的一局';
        small.appendChild(b);
      }
      if (isOutdated(r)) {
        const o = document.createElement('span');
        o.className = 'old';
        o.textContent = ` · ${isBlocked(r) ? BLOCKED_TEXT : OUTDATED_TEXT}`;
        small.appendChild(o);
      }
      text.appendChild(small);
      const play = document.createElement('button');
      play.type = 'button';
      play.className = 'yx-tab';
      play.textContent = '回放';
      play.disabled = isBlocked(r);
      play.onclick = () => {
        this.hide();
        this.opts.onPlay(r);
      };
      li.append(text, play);
      ul.appendChild(li);
    }
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'yx-big ghost';
    close.textContent = '返回';
    close.onclick = () => this.close();
    const foot = document.createElement('div');
    foot.className = 'yx-row3 yx-pgfoot';
    foot.insertAdjacentHTML('afterbegin', PAGER_CTL);
    foot.appendChild(close);
    panel.append(head, ul, foot);
    this.root.replaceChildren(panel);
    this.root.style.display = '';
    // 录像一屏放不下就翻页
    this.pager = new Pager({ body: ul, ctl: foot.querySelector<HTMLElement>('.yx-pager')!, leaves: 'li' });
    openModal(this.root, () => this.close(), () => this.hide());
  }

  hide(): void {
    this.root.style.display = 'none';
    this.pager?.destroy();
    this.pager = null;
    closeModal(this.root);
  }

  /** 返回按钮、✕、点遮罩、Esc 共用 */
  private close(): void {
    this.hide();
    this.opts.onClose();
  }
}
