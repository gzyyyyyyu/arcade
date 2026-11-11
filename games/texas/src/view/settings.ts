/**
 * 设置面板：顶栏齿轮是唯一入口（docs/ui.md 第 8 节）。声音、画面、玩法和互动、账号四组，最下面"恢复默认"。
 * 改了立刻生效、立刻存，没有保存按钮。这里只管画和收集点击，怎么生效、存哪儿由 app/shell.ts 接（SettingsHooks）。
 * 面板自己管 Esc / 遮罩 / ✕ 三种关法和焦点（Tab 不出面板、关掉后焦点还给齿轮）；
 * 里面点止盈会再开一个 dialog() 叠在上面，Esc 先关上面那个。
 */
import type { Prefs } from '../store.ts';
import { el } from './dom.ts';

export type ChatShown = 'on' | 'friends' | 'off';

/** 每次重画现取的状态（面板自己不存） */
export interface SettingsView {
  prefs: Prefs;
  /** 互动开着（不是"不看"） */
  fun: boolean;
  /** 聊天：不在牌桌上时是 null，不画这一行 */
  chat: ChatShown | null;
  /** 止盈那一行右边的字，null 是这时没有止盈（锦标赛） */
  takeProfit: string | null;
  /** 战绩的说明和是不是要登录；null 是单独部署，没有战绩 */
  record: { text: string; login: boolean } | null;
  /** 钱包那一行的字；null 是单独部署或娱乐里没有钱包 */
  wallet: string | null;
}

export interface SettingsHooks {
  view(): SettingsView;
  /** 改音效、音量、动画快慢 */
  prefs(patch: Partial<Prefs>): void;
  flipFun(): void;
  nextChat(): void;
  pickTakeProfit(): Promise<void>;
  login(): void;
  reset(): void;
}

const CHAT_TEXT: Record<ChatShown, string> = { on: '开', friends: '不和陌生人', off: '不看' };

let current: { root: HTMLElement; close: () => void } | null = null;

export function closeSettings(): void {
  current?.close();
}

export function openSettings(stage: HTMLElement, h: SettingsHooks): void {
  closeSettings();
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const root = el('div', 'mask settings', stage);
  const box = el('div', 'dialog st-box', root);
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', '设置');
  const head = el('div', 'st-head', box);
  el('div', 'd-title', head, '设置');
  const x = el('button', 'st-x', head);
  x.type = 'button';
  x.setAttribute('aria-label', '关闭设置');
  x.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';
  const body = el('div', 'st-body', box);

  const close = (): void => {
    if (current?.root !== root) return;
    current = null;
    document.removeEventListener('keydown', onKey, true);
    root.remove();
    // 别的 dialog 还开着就留着收起（dialog.ts 自己管这个类）
    document.body.classList.toggle('texas-dialog', stage.querySelector('.mask') !== null);
    opener?.focus();
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      // 上面还叠着别的框（止盈）：让它先关
      if (stage.querySelector('.mask:not(.settings)')) return;
      e.preventDefault();
      e.stopPropagation();
      close();
      return;
    }
    if (e.key !== 'Tab' || stage.querySelector('.mask:not(.settings)')) return;
    const items = [...box.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)')].filter((n) => n.getClientRects().length > 0);
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    if (!box.contains(document.activeElement)) {
      e.preventDefault();
      first.focus();
    } else if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  current = { root, close };
  document.addEventListener('keydown', onKey, true);
  x.addEventListener('click', close);
  root.addEventListener('click', (e) => {
    if (e.target === root) close();
  });

  const row = (parent: HTMLElement, label: string, hint = ''): HTMLElement => {
    const r = el('div', 'st-row', parent);
    const l = el('div', 'st-label', r);
    el('span', 'st-name', l, label);
    if (hint) el('span', 'st-hint', l, hint);
    return el('div', 'st-ctl', r);
  };
  const button = (parent: HTMLElement, key: string, text: string, on: () => void, sel = false): HTMLButtonElement => {
    const b = el('button', sel ? 'pill sel' : 'pill', parent, text);
    b.type = 'button';
    b.dataset.key = key;
    b.addEventListener('click', on);
    return b;
  };
  /** 开 / 关 两个并排的选项，当前的亮着：比一个会变字的开关更看得出现在是什么 */
  const onOff = (parent: HTMLElement, key: string, on: boolean, set: () => void): void => {
    const g = el('div', 'st-seg', parent);
    g.setAttribute('role', 'group');
    for (const v of [true, false]) {
      const b = button(g, `${key}-${v ? 'on' : 'off'}`, v ? '开' : '关', () => (on === v ? undefined : set()), on === v);
      b.setAttribute('aria-pressed', String(on === v));
    }
  };

  let dragging = false;
  let tab = 0;
  const draw = (): void => {
    const focusKey = document.activeElement instanceof HTMLElement && box.contains(document.activeElement) ? document.activeElement.dataset.key : undefined;
    body.textContent = '';
    // 横屏（电脑、手机横着）三栏：声音 / 玩法互动 / 画面和账号，每栏两三行、等高；竖屏一栏，按页签分开（settings.css 的 .stage.tall），三个页签：声音画面 / 玩法互动 / 账号
    const cols = el('div', 'st-cols', body);
    const left = el('div', 'st-col', cols);
    const mid = el('div', 'st-col', cols);
    const right = el('div', 'st-col', cols);
    // 好友房的道具、互动按钮挂在 body 上、压在牌桌上面：面板开着时收起，同 dialog()；叠在上面的 dialog 关掉时会清掉这个类，每次重画补回
    document.body.classList.add('texas-dialog');
    const v = h.view();

    const sound = el('section', 'st-group', left);
    sound.dataset.tab = '0';
    el('h3', '', sound, '声音');
    onOff(row(sound, '音效', '发牌、筹码、轮到你的提示'), 'sfx', v.prefs.sound, () => h.prefs({ sound: !v.prefs.sound }));
    const vol = row(sound, '音量');
    // 滑条加百分比比开 / 关宽，这一格不按统一宽度
    vol.classList.add('wide');
    const slider = el('input', 'slider st-vol', vol);
    slider.type = 'range';
    slider.min = '0';
    slider.max = '100';
    slider.step = '5';
    slider.value = String(Math.round(v.prefs.volume * 100));
    slider.disabled = !v.prefs.sound;
    slider.dataset.key = 'volume';
    slider.setAttribute('aria-label', '音量');
    const pct = el('span', 'st-pct', vol, `${slider.value}%`);
    slider.addEventListener('input', () => {
      pct.textContent = `${slider.value}%`;
      h.prefs({ volume: Number(slider.value) / 100 });
    });
    // 拖的时候只改声音不重画（重画会丢掉手指）；松手再画
    slider.addEventListener('pointerdown', () => (dragging = true));
    slider.addEventListener('change', () => {
      dragging = false;
      draw();
    });
    slider.addEventListener('pointercancel', () => (dragging = false));

    const look = el('section', 'st-group', right);
    look.dataset.tab = '0';
    el('h3', '', look, '画面');
    const speed = el('div', 'st-seg', row(look, '动画', '快速：发牌、下注更快'));
    speed.setAttribute('role', 'group');
    for (const fast of [true, false]) {
      const b = button(speed, fast ? 'speed-fast' : 'speed-normal', fast ? '快速' : '正常', () => (v.prefs.fast === fast ? undefined : h.prefs({ fast })), v.prefs.fast === fast);
      b.setAttribute('aria-pressed', String(v.prefs.fast === fast));
    }

    const play = el('section', 'st-group', mid);
    play.dataset.tab = '1';
    el('h3', '', play, '玩法和互动');
    onOff(row(play, '互动', '别人的道具、表情和电脑说话'), 'fun', v.fun, h.flipFun);
    if (v.chat) button(row(play, '聊天', '点一下换下一档'), 'chat', CHAT_TEXT[v.chat], h.nextChat, v.chat !== 'off');
    if (v.takeProfit !== null) {
      button(
        row(play, '止盈', '赢到目标就起身'),
        'tp',
        v.takeProfit,
        () => void h.pickTakeProfit().then(draw),
        v.takeProfit !== '关',
      );
    }

    if (v.record || v.wallet !== null) {
      const acc = el('section', 'st-group', right);
      acc.dataset.tab = '2';
      el('h3', '', acc, '账号');
      if (v.record) {
        const c = row(acc, '战绩', v.record.text);
        if (v.record.login) button(c, 'login', '登录', h.login);
      }
      if (v.wallet !== null) el('span', 'st-wallet', row(acc, '钱包'), v.wallet);
    }

    const hasAcc = !!(v.record || v.wallet !== null);
    if (tab === 2 && !hasAcc) tab = 0;
    cols.dataset.tab = String(tab);
    const nav = el('div', 'st-tabs', body);
    nav.setAttribute('role', 'group');
    [['声音画面', 0], ['玩法互动', 1], ...(hasAcc ? [['账号', 2]] : [])].forEach(([text, i]) => {
      const t = button(nav, `tab-${i}`, String(text), () => {
        tab = Number(i);
        draw();
      }, tab === i);
      t.setAttribute('aria-pressed', String(tab === i));
    });
    body.insertBefore(nav, cols);

    const foot = el('div', 'st-foot', body);
    button(foot, 'reset', '恢复默认', h.reset);

    if (focusKey) body.querySelector<HTMLElement>(`[data-key="${focusKey}"]`)?.focus();
  };
  // 外面改了东西（点了开关、恢复默认）要重画：shell 在每次改完调 refreshSettings
  current.root.addEventListener('settings:refresh', () => {
    if (!dragging) draw();
  });
  draw();
  x.focus();
}

/** 外面的状态变了（比如恢复默认、止盈选完），开着的面板跟着重画 */
export function refreshSettings(): void {
  current?.root.dispatchEvent(new Event('settings:refresh'));
}
