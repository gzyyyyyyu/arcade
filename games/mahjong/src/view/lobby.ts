/**
 * 选桌页（docs/economy.md 第 1 节，各游戏一个样子）：从主页的模式卡进来（0.17.2 起只摆这个模式的东西，docs/art.md）——
 * 娱乐：三个难度 + 单机开打；实盘：四档 + 单机开打；好友房：娱乐三个难度和实盘四档都能选（房间按这个开）+ 开房间、输房间号进房。
 * 娱乐、实盘的单机开打旁边是快速匹配（0.21.0，和陌生人按这一档排）。钱包连不上时实盘不可选。单独部署（没有平台）时只有娱乐，好友房上面多一个昵称框。
 * 版面（0.41.0）：和主页一样左边茶馆的画、右边一块木框面板（竖屏画在上、面板在下）；面板里玩法、档位卡是主角，开打贴底。
 * 玩法行（0.45.0）：主页快速一局底下同一组切换项（血战到底、血流成河、三人两房、立直，各玩法的 homeChoices），娱乐、实盘、好友房三页一样，选着的和主页同一份记忆。
 * 规则细节默认收起，只露一行摘要和「改规则」（所有者 11-20：选项看不懂、默认选好就行），点开是一个弹窗，照玩法的规则表画（game/rule-spec.ts）；
 * 档位、难度、玩法这些主选项照旧一屏摆开。
 */
import { LEVELS, type Level } from '../ai/venues.ts';
import { summary } from '../game/rule-spec.ts';
import { STAKES, type StakesId, type TierId } from '../game/stakes.ts';
import type { WalletView } from '../net/wallet.ts';
import { homeScene, stakeIcon } from './art.ts';
import { dailyEntry } from './daily.ts';
import type { DailyVariant } from '../game/daily.ts';
import type { AnyOpts, RulesStore } from './variants/page.ts';
import { homeChoiceOf } from './variants/pages.ts';
import { closeDialog, dialog } from './dialog.ts';
import { busy, button, el } from './dom.ts';
import { renderRules } from './rule-row.ts';
import { GAME_NAME, LEVEL_FOR, LEVEL_NAME, num, STAKES_NAME, STARS, wan } from './text.ts';

interface LobbyProps {
  wallet: WalletView | null;
  /** 钱包连不上的原因（显示一句话） */
  walletNote: string | null;
  stakes: StakesId;
  /** 娱乐的难度（第一次玩是新手） */
  level: Level;
  /** 偏好里存着的各玩法的规则设置（「改规则」里改的只在这一页有效，开打时才交出去） */
  rules: RulesStore;
  /** "玩法"选项：ids 是主页同一组切换项（各玩法的 homeChoices），current 是选着的那一项 */
  variants?: { ids: string[]; current: string; onPick(id: string): void };
  /** 这一页（娱乐 / 实盘）有没打完的一场时「接着打」按钮的字（带存档的玩法），没有就是 null */
  resume: string | null;
  /** 开单机、开房间要先问钱包和服务器：按钮转圈直到回来；opts 是选着的玩法的规则设置 */
  onSolo(stakes: StakesId, opts: AnyOpts, level: Level, variant: string): Promise<void>;
  onResume(): void;
  /** 每日挑战（只在娱乐、血战到底的选桌页摆） */
  onDaily?(variant: DailyVariant): void;
  onRules(): void;
  /** 好友房：没有时不显示 */
  onRoom?(stakes: StakesId, opts: AnyOpts, variant: string): Promise<void>;
  onJoin?(code: string): void;
  /** 快速匹配（0.21.0）：按选中的档位和玩法排队，和陌生人打（这个玩法的默认规则；立直只有娱乐）；没有时不显示 */
  onMatch?(stakes: StakesId, opts: AnyOpts, level: Level, variant: string): void;
  /** 从平台大厅的"好友房"按钮进来（?online=1，和德州、掼蛋同一个约定）：开房、进房那一块滚到看得见、亮一下 */
  friends?: boolean;
  /** 单独部署：没有钱包和实盘；好友房里别人看到的昵称自己填 */
  standalone?: { nick: string; onNick(name: string): void };
  /** 回游戏主页（0.17.0 起选桌页是主页点模式卡进来的第二层） */
  onBack?(): void;
  /** 从哪张模式卡进来的（单独部署没有实盘） */
  mode: 'fun' | 'real' | 'room';
}

const MODE_TITLE = { fun: '娱乐', real: '实盘', room: '好友房' } as const;

export function renderLobby(box: HTMLElement, p: LobbyProps): void {
  box.replaceChildren();
  let stakes = p.stakes;
  let level = p.level;
  // 选着的玩法给规则表（game/rule-spec.ts），这一页改的是一份拷贝，开打时才交出去
  const page = homeChoiceOf(p.variants?.current ?? '').page;
  let opts = { ...page.rulesOf(p.rules) } as AnyOpts;
  // 单机实盘一局一结（app/solo-flow.ts 套 realOpts），局数、长度不给选；好友房实盘照开房时选的打
  const real = p.mode === 'real';
  if (p.onBack) button('pill back', box, '‹ 主页', p.onBack);
  // 主视觉：主页同一张茶馆的画（横屏左栏、竖屏顶上一条，放不下时自己藏掉）
  el('div', 'lobby-art', box).innerHTML = homeScene();
  el('div', 'ver', box, `v${__MAHJONG_VERSION__}`);
  // 一屏放下（docs/ui.md 第 11 节）：面板从上往下是标题和玩法、档位卡、钱包说明、规则摘要、开打
  // 好友房七张档位卡，面板要排紧一点（lobby.css 的 .lobby-panel.room）
  const panel = el('div', `lobby-panel ${p.mode}`, box);
  const head = el('div', 'lobby-head', panel);
  el('h1', '', head, MODE_TITLE[p.mode]);
  el('div', 'variant', head, `${GAME_NAME} ${page.name(opts as { flow?: boolean; three?: boolean })}`);
  // 有没打完的一场：标题右边一个小钮，不单占一排（0.47.1：单占一排时 1280×800 把「单机开打」挤出屏幕）
  if (p.resume && p.mode !== 'room') button('act go resume', head, p.resume, p.onResume);
  // 玩法：血战到底 / 血流成河 / 三人两房 / 立直（和主页快速一局同一份记忆）。选了以后整页重画，档位卡和规则摘要跟着换
  if (p.variants) {
    const { ids, current, onPick } = p.variants;
    const row = el('div', 'lobby-variants', panel);
    el('span', 'label', row, '玩法');
    for (const id of ids) {
      const on = id === current;
      const b = button(`chip${on ? ' on' : ''}`, row, homeChoiceOf(id).choice.chip, () => !on && onPick(id));
      b.setAttribute('aria-pressed', String(on));
    }
  }

  if (p.mode === 'fun' && p.onDaily) {
    const onDaily = p.onDaily;
    const v: DailyVariant = page.daily.variant;
    dailyEntry(panel, v, () => onDaily(v));
  }

  // 每档一张卡（docs/balance.md 第 5 节，四个游戏一样）：电脑多强（星）、一场约多久、一场最多赢 / 最多输。娱乐三个难度一排，实盘四档一排
  const pick = el('div', 'stakes-box', panel);
  const card = (row: HTMLElement, on: boolean, off: boolean, icon: StakesId, name: string, stars: number, lines: string[], choose: () => void): void => {
    const b = button(`stake${on ? ' on' : ''}${off ? ' off' : ''}`, row, '', () => {
      if (off) return;
      choose();
      paint();
    });
    b.insertAdjacentHTML('afterbegin', stakeIcon(icon));
    el('b', '', b, name);
    const star = el('span', 'stars', b, '★'.repeat(stars) + '☆'.repeat(4 - stars));
    star.setAttribute('aria-label', `电脑 ${stars} 星`);
    for (const l of lines) el('small', '', b, l);
  };
  const paint = (): void => {
    pick.replaceChildren();
    // 一场多久每张卡都一样，写在每排的小标题上，卡上不重复（0.17.2）；只打一局的约 3 分钟，不按 5 分钟凑整（各玩法的规则表自己估）
    const mins = `一场约 ${page.rules.minutes(opts)} 分钟`;
    // 实盘一局一结（2026-10-30）：不管下面规则设置选了几局，实盘都只打一局，开打时由 app/solo-flow.ts 改（startSolo）
    // 好友房实盘照开房时选的局数打，只有单机实盘一局一结
    const realMins = p.mode === 'room' ? mins : '一局一结 · 约 3 分钟';
    if (p.mode !== 'real') {
      el('div', 'stakes-label', pick, `娱乐 · 不算筹码 · ${mins}`);
      const fun = el('div', 'stakes', pick);
      for (const l of LEVELS) {
        card(fun, stakes === 'fun' && level === l, false, 'fun', LEVEL_NAME[l], STARS[l], [LEVEL_FOR[l]], () => {
          stakes = 'fun';
          level = l;
        });
      }
    }
    const tiers = p.standalone || p.mode === 'fun' ? [] : STAKES.filter((x) => x.wallet);
    if (!tiers.length) return;
    el('div', 'stakes-label', pick, `实盘 · 用钱包里的筹码 · ${realMins}`);
    const real = el('div', 'stakes', pick);
    for (const s of tiers) {
      // 余额不够带进一份的档直接灰掉、写明（以前能选，点开打才报筹码不够，0.47.1 走查）
      const off = !p.wallet || p.wallet.balance < s.share;
      const lines = p.wallet && off ? [`要 ${wan(s.share)}`, '筹码不够'] : [`最多赢 ${wan(s.share * 3)}`, `最多输 ${wan(s.share)}`];
      card(real, s.id === stakes, off, s.id, `${STAKES_NAME[s.id]}档`, STARS[s.id as TierId], lines, () => (stakes = s.id));
    }
  };
  paint();
  const note = el('div', 'wallet-note', panel);
  if (p.mode === 'fun') note.remove();
  else if (p.wallet) note.textContent = `钱包 ${num(p.wallet.balance)} 筹码（无任何现金价值）· 最多输掉带进去的一份，最多赢 3 份`;
  // 钱包读不到：原因只写头一句，加上"实盘先不能选"，一行放下（docs/ui.md 第 11 节）
  else if (p.walletNote) note.textContent = `${p.walletNote.split(/[，。]/)[0]}，实盘先不能选`;
  else if (p.standalone) note.textContent = '这是单独部署的雀馆：没有账号和钱包，单机、好友房都按娱乐打。';

  // 规则细节收成一行摘要（「4 局 · 4 番封顶 · 自摸加底 · 换三张」）+「改规则」；改完摘要和档位卡上的「约几分钟」跟着变
  const line = el('div', 'rules-line', panel);
  const sum = el('span', 'rules-sum', line);
  const paintSum = (): void => {
    // 每一项一个不断行的小段，分隔点贴在前一项后面：折行时行首不会落单个「·」
    sum.replaceChildren();
    const parts = summary(page.rules, opts, real);
    parts.forEach((t, i) => {
      el('span', 'part', sum, i < parts.length - 1 ? `${t} ·` : t);
      if (i < parts.length - 1) sum.append(' ');
    });
  };
  paintSum();
  button('act soft edit-rules', line, '改规则', () =>
    dialog(
      box.parentElement ?? box,
      'rules-sheet',
      (d) => {
        el('h2', '', d, '规则设置');
        // 每改一项马上重画摘要和档位卡：在面板里点「规则和番型表」会直接换成那个弹窗，不走关闭回调
        renderRules(el('div', 'rules-opts', d), page.rules, real, () => opts, (o) => {
          opts = o;
          paintSum();
          paint();
        });
        const foot = el('div', 'rules-foot', d);
        button('link', foot, page.rulesLink, p.onRules);
        button('act go', foot, '好了', closeDialog);
      },
    ),
  );

  const go = el('div', 'go-row', panel);
  if (p.mode !== 'room') {
    const solo = button('act go big', go, '单机开打', () => void busy(solo, () => p.onSolo(stakes, opts, level, page.id)));
    // 快速匹配排的是这一档，开桌用默认规则（上面的规则设置只管单机）；排不到人就转这一档的单机。立直也排自己的实盘档（rc-<档位>）
    if (p.onMatch) button('act soft big match', go, '快速匹配', () => p.onMatch!(stakes, opts, level, page.id));
    return;
  }
  const room = p.onRoom ? button('act go big', go, '开房间叫朋友', () => void busy(room!, () => p.onRoom!(stakes, opts, page.id))) : null;
  if (p.standalone) {
    const row = el('label', 'nick', go);
    el('span', '', row, '好友房里的昵称');
    const input = el('input', '', row) as HTMLInputElement;
    input.maxLength = 12;
    input.placeholder = '不填就叫“游客”';
    input.value = p.standalone.nick;
    input.addEventListener('change', () => p.standalone!.onNick(input.value.trim()));
  }
  if (p.onJoin) {
    const join = el('form', 'join', go);
    const input = el('input', '', join) as HTMLInputElement;
    input.inputMode = 'numeric';
    input.maxLength = 6;
    input.placeholder = '房间号';
    button('act', join, '进房', () => p.onJoin!(input.value.trim()));
    join.addEventListener('submit', (e) => {
      e.preventDefault();
      p.onJoin!(input.value.trim());
    });
    if (p.friends) {
      for (const x of [room, join]) x?.classList.add('spot');
      // 有鼠标的直接把光标放进房间号；触屏不放，免得一进来就弹键盘盖住半屏
      if (matchMedia('(pointer: fine)').matches) input.focus({ preventScroll: true });
    }
  }
}
