/**
 * 选桌页（docs/economy.md 第 1 节，各游戏一个样子）：从主页的模式卡进来（0.17.2 起只摆这个模式的东西，docs/art.md）——
 * 娱乐：三个难度 + 单机开打；实盘：四档 + 单机开打；好友房：娱乐三个难度和实盘四档都能选（房间按这个开）+ 开房间、输房间号进房。
 * 娱乐、实盘的单机开打旁边是快速匹配（0.21.0，和陌生人按这一档排）。规则设置全部平铺、不折叠（docs/ui.md 第 9 节）；开打的按钮贴在底部。钱包连不上时实盘不可选。单独部署（没有平台）时只有娱乐，好友房上面多一个昵称框。
 */
import { LEVELS, type Level } from '../ai/venues.ts';
import { STAKES, type StakesId, type TierId } from '../game/stakes.ts';
import type { WalletView } from '../net/wallet.ts';
import { homeScene, stakeIcon } from './art.ts';
import { dailyEntry } from './daily.ts';
import type { DailyVariant } from '../game/daily.ts';
import type { AnyOpts, RulesStore } from './variants/page.ts';
import { allPages, pageOf } from './variants/pages.ts';
import { busy, button, el } from './dom.ts';
import { GAME_NAME, LEVEL_FOR, LEVEL_NAME, num, STAKES_NAME, STARS, wan } from './text.ts';

export interface LobbyProps {
  wallet: WalletView | null;
  /** 钱包连不上的原因（显示一句话） */
  walletNote: string | null;
  stakes: StakesId;
  /** 娱乐的难度（第一次玩是新手） */
  level: Level;
  /** 偏好里存着的各玩法的规则设置（选桌页上改的只在这一页有效，开打时才交出去） */
  rules: RulesStore;
  /** "玩法"选项（立直入口开着时才有，单机和好友房都有）：current 是选着的玩法 */
  variants?: { current: string; onPick(id: string): void };
  canResume: boolean;
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
  // 选着的玩法管自己的规则设置（局数、封顶、长度……）和开桌用的规则，选桌页只负责摆
  const page = pageOf(p.variants?.current);
  const rules = page.newLobbyRules(p.rules);
  if (p.onBack) button('pill back', box, '‹ 主页', p.onBack);
  // 竖屏选档页上面那块空白放主页同一张茶馆的画（只占剩下的高度，规则设置展开后自己缩没）；横屏没空，CSS 藏掉
  el('div', 'lobby-art', box).innerHTML = homeScene();
  el('div', 'ver', box, `v${__MAHJONG_VERSION__}`);
  // 一屏放下（docs/ui.md 第 9、11 节）：横屏左右两栏等高，左边标题、玩法、档位，右边规则设置和开打；竖屏两栏 display: contents，照旧一列
  const left = el('div', 'lobby-l', box);
  const right = el('div', 'lobby-r', box);
  const head = el('div', 'lobby-head', left);
  el('h1', '', head, MODE_TITLE[p.mode]);
  el('div', 'variant', head, `${GAME_NAME} ${page.name()}`);
  // 玩法：血战到底 / 立直（记住上次选的）。放在最上面，选了以后整页重画，档位卡和规则设置跟着换
  if (p.variants) {
    const row = el('div', 'lobby-variants', left);
    el('span', 'label', row, '玩法');
    for (const pg of allPages()) {
      const on = pg.id === p.variants.current;
      const b = button(`chip${on ? ' on' : ''}`, row, pg.lobbyChip, () => !on && p.variants!.onPick(pg.id));
      b.setAttribute('aria-pressed', String(on));
    }
  }
  if (p.canResume && p.mode !== 'room') button('act go big resume', left, '接着打上一场', p.onResume);

  if (p.mode === 'fun' && p.onDaily) {
    const onDaily = p.onDaily;
    const v: DailyVariant = page.daily.variant;
    dailyEntry(left, v, () => onDaily(v));
  }

  // 每档一张卡（docs/balance.md 第 5 节，四个游戏一样）：电脑多强（星）、一场约多久、一场最多赢 / 最多输。娱乐三个难度一排，实盘四档一排
  const pick = el('div', 'stakes-box', left);
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
    // 一场多久每张卡都一样，写在每排的小标题上，卡上不重复（0.17.2）；只打一局的约 3 分钟，不按 5 分钟凑整（各玩法自己估，在 page.newLobbyRules）
    const mins = `一场约 ${rules.minutes()} 分钟`;
    // 实盘一局一结（2026-10-30）：不管下面规则设置选了几局，实盘都只打一局，开打时由 app/solo-flow.ts 改（startSolo）
    const realMins = '一局一结 · 约 3 分钟';
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
      const off = !p.wallet || p.wallet.balance <= 0;
      card(real, s.id === stakes, off, s.id, `${STAKES_NAME[s.id]}档`, STARS[s.id as TierId], [`最多赢 ${wan(s.share * 3)}`, `最多输 ${wan(s.share)}`], () => (stakes = s.id));
    }
  };
  paint();
  const note = el('div', 'wallet-note', left);
  if (p.mode === 'fun') note.remove();
  else if (p.wallet) note.textContent = `钱包 ${num(p.wallet.balance)} 筹码（无任何现金价值）。实盘最多输掉带进去的，一场最多赢 3 份。`;
  // 钱包读不到：原因只写头一句，加上"实盘先不能选"，一行放下（docs/ui.md 第 11 节）
  else if (p.walletNote) note.textContent = `${p.walletNote.split(/[，。]/)[0]}，实盘先不能选`;
  else if (p.standalone) note.textContent = '这是单独部署的雀馆：没有账号和钱包，单机、好友房都按娱乐打。';

  // 规则设置不折叠（docs/ui.md 第 11 节：开局选项一屏直接看得到、点得到）
  const more = el('div', 'rules-opts', right);
  const title = el('div', 'rules-title', more);
  el('span', '', title, '规则设置');
  // "规则和番型表"放在规则设置的标题行右边，不单占一行
  button('link', title, page.rulesLink, p.onRules);
  rules.render(more, paint);

  const go = el('div', 'go-row', right);
  if (p.mode !== 'room') {
    const solo = button('act go big', go, '单机开打', () => void busy(solo, () => p.onSolo(stakes, rules.opts(stakes), level, page.id)));
    // 快速匹配排的是这一档，开桌用默认规则（上面的规则设置只管单机）；排不到人就转这一档的单机。立直也排自己的实盘档（rc-<档位>）
    if (p.onMatch) button('act soft big match', go, '快速匹配', () => p.onMatch!(stakes, rules.opts(stakes), level, page.id));
    return;
  }
  const room = p.onRoom ? button('act go big', go, '开房间叫朋友', () => void busy(room!, () => p.onRoom!(stakes, rules.opts(stakes), page.id))) : null;
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
