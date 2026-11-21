/**
 * 标题页（0.18.0 起分两屏，docs/art.md 第 4 节）：左边标题和一手同花顺，右边先是主页——一个"快速开始"（按上次的设置；
 * 有没打完的一桌就是"继续上局"）、三张模式卡（娱乐 / 实盘 / 好友房，docs/economy.md 第 1 节）、钱包和战绩；
 * 点了模式卡才到选桌：档位、人数、带多少，"返回"回主页。一进来就直接选游戏方式显得太满，所以选项不再一进来就摆满。
 * 娱乐不碰钱包、随便玩；实盘从钱包带一份上桌、离桌结回；好友房选档位和人数后开房间、输码进房。
 * 钱包常驻一行"无任何现金价值"（docs/economy.md 5.3）；钱包连不上时实盘不可选，娱乐照常。
 * 单独部署（没有平台，10.1）：藏起钱包和实盘，只有娱乐和好友房；好友房下面多一个昵称框。
 */
import { CATEGORY_NAMES, categoryOf } from '../core/eval.ts';
import { DIFFICULTIES, DIFFICULTY_NAME, difficultyOf, FUN_LEVEL, FUN_STAKES, PF_HANDS, PF_STACK_BB, STAKES, stakesOf, type Difficulty, type StakesId } from '../core/stakes.ts';
import { MAX_SEATS } from '../core/table.ts';
import type { Stake, WalletView } from '../net/wallet.ts';
import { patchSettings, readSettings } from '../store.ts';
import { DEFAULT_FORMAT, FORMATS, type TourFormat } from '../tour/rules.ts';
import { makeCard, setCard } from './art.ts';
import { el, setText, toggle } from './dom.ts';
import { focusKind, lobbyKey, stepPick } from './lobbykeys.ts';
import { ROOM_NAME } from './rooms.ts';
import { chips } from './text.ts';
import { must } from '../must.ts';

export interface LobbyState {
  wallet: WalletView | null;
  /** 钱包连不上、只读时的说明 */
  note: string | null;
  /** 本机有一桌没打完；waiting：那一笔钱包还没回话（买入在路上，或者离桌的结算还没结回去） */
  resume: { stakes: StakesId; size: number; practice: boolean; level?: number | undefined; waiting: boolean; tour?: boolean } | null;
  /** 钱包里有一桌单机，但本机没有（另一台设备上的） */
  orphan: Stake | null;
  busy: boolean;
  /** 回到好友房的横幅（钱包里有那一份，或者刷新前还在房间里）：码和一句说明 */
  room: { code: string; text: string } | null;
  /** 主页的战绩小卡（云存档那一份）：打了几手、赢了几手、最大一池、摊牌最好的牌力值（0 是没有） */
  stats: { hands: number; won: number; biggestPot: number; best: number };
}

export interface LobbyHandlers {
  /** level：娱乐按难度给电脑的强弱档；实盘不给 */
  start(stakes: StakesId, size: number, amount: number, practice: boolean, level?: number): void;
  resume(): void;
  relief(): void;
  /** 快速匹配：这一档排队找真人，一桌 6 人；只有实盘、有钱包时有 */
  /** 快速匹配：fun 是娱乐档（level 是选的难度，没排到人转单机时用） */
  match(stakes: StakesId, fun: boolean, level: number): void;
  /** 单机锦标赛：fun 是娱乐（level 是选的难度）；实盘报名费是这一档的一份 */
  tour(stakes: StakesId, fun: boolean, level: number, format: TourFormat): void;
  /** 快速局 · 全下或弃牌（娱乐，不碰钱包） */
  pushFold(daily: boolean): void;
  /** 今日赛：每天一场极速赛（docs/tournament.md 14.5） */
  dailyTour(): void;
  /** 止盈：点了弹选择框 */
  takeProfit(): void;
  /** 成就墙 */
  achievements(): void;
  /** 今日谜题（docs/features.md 13.11） */
  puzzle(): void;
  /** 怎么玩：把新手指引重置，坐下一张娱乐新手桌从头走一遍（有没打完的单机就回到那一桌） */
  howTo(): void;
  /** 好友房：用现在选的档位和人数开一个；输码进房；回到上次的房间 */
  /** fun：娱乐房间（不碰钱包、一个真人也能开打，空位电脑补）；tour：锦标赛（6 人） */
  openRoom(stakes: StakesId, size: number, fun: boolean, tour?: { fill: boolean }): void;
  joinRoom(code: string): void;
  backToRoom(): void;
  /** 选桌上选中的那一间（主题房）：背景先换成它，让人看到"往上走"；主页、娱乐是 null（小桌那一间） */
  preview(id: StakesId | null): void;
}

type Mode = 'fun' | 'real' | 'room';

export class Lobby {
  readonly root: HTMLDivElement;
  private readonly balance: HTMLSpanElement;
  private readonly reliefBtn: HTMLButtonElement;
  private readonly noteEl: HTMLDivElement;
  private readonly resumeBox: HTMLDivElement;
  private readonly resumeText: HTMLSpanElement;
  private readonly orphanBox: HTMLDivElement;
  private readonly orphanText: HTMLSpanElement;
  private readonly modeBtns = new Map<Mode, HTMLButtonElement>();
  private readonly modeNote: HTMLDivElement;
  private readonly tiles = new Map<StakesId, HTMLButtonElement>();
  private readonly diffTiles = new Map<Difficulty, HTMLButtonElement>();
  private readonly grid: HTMLDivElement;
  private readonly sizes: HTMLButtonElement[] = [];
  private readonly sizeRow: HTMLDivElement;
  /** 好友房开房时选玩法（和"开房间"同一行，不多占一行）：现金桌或锦标赛，锦标赛再选档位（含娱乐）和空位电脑补 */
  private readonly kindBtns: HTMLButtonElement[] = [];
  private readonly fillBtn: HTMLButtonElement;
  private readonly funTile: HTMLButtonElement;
  private roomTour = false;
  private roomFun = false;
  private fill = true;
  private readonly slider: HTMLInputElement;
  private readonly buyAmt: HTMLSpanElement;
  private readonly startBtn: HTMLButtonElement;
  private readonly matchBtn: HTMLButtonElement;
  private readonly tourBtn: HTMLButtonElement;
  private readonly fmtRow: HTMLDivElement;
  private readonly pfRow: HTMLDivElement;
  private readonly pfBtn: HTMLButtonElement;
  private readonly dailyBtn: HTMLButtonElement;
  private readonly dailyTourBtn: HTMLButtonElement;
  private readonly notes = new Map<HTMLButtonElement, { node: HTMLElement; idle: string }>();
  private readonly tourNote: HTMLDivElement;
  /** 单机锦标赛的赛制（记在设置里）：经典 6 人 / 极速赛 / 9 人赛 */
  private readonly fmtBtns = new Map<TourFormat, HTMLButtonElement>();
  private tourFmt: TourFormat = DEFAULT_FORMAT;
  private readonly tpBtn: HTMLButtonElement;
  private readonly openBtn: HTMLButtonElement;
  private readonly codeIn: HTMLInputElement;
  private readonly joinBtn: HTMLButtonElement;
  private readonly roomBox: HTMLDivElement;
  private readonly roomText: HTMLSpanElement;
  private readonly backBtn: HTMLButtonElement;
  private readonly friends: HTMLDivElement;
  private readonly openRow: HTMLDivElement;
  private readonly buyRow: HTMLDivElement;
  private readonly goRow: HTMLDivElement;
  private readonly walletBox: HTMLDivElement;
  private readonly nickRow: HTMLDivElement;
  private readonly nickIn: HTMLInputElement;
  private readonly front: HTMLDivElement;
  private readonly pickPanel: HTMLDivElement;
  private readonly quickBtn: HTMLButtonElement;
  private readonly howBtn: HTMLButtonElement;
  private readonly quickSub: HTMLElement;
  private readonly modeCards = new Map<Mode, HTMLButtonElement>();
  private readonly disclaimer: HTMLDivElement;
  private readonly statsEl: HTMLDivElement;
  private readonly achBtn: HTMLButtonElement;
  private readonly pzBtn: HTMLButtonElement;
  private readonly pickBal: HTMLSpanElement;
  /** 主页还是选桌（回大厅、离桌回来都是主页） */
  private screen: 'front' | 'pick' = 'front';
  private statsHtml = '';
  /** 单独部署：没有钱包，只有娱乐 */
  private alone = false;
  private stakes: StakesId = 'small';
  private diff: Difficulty = 'easy';
  private size = 6;
  /** 第一次来默认娱乐·新手（docs/balance.md 第 3 节）；记过的按记的 */
  private mode: Mode = 'fun';
  private s: LobbyState = { wallet: null, note: null, resume: null, orphan: null, busy: true, room: null, stats: { hands: 0, won: 0, biggestPot: 0, best: 0 } };
  private readonly h: LobbyHandlers;
  /** 最后点的那个要等回话的按钮：忙着的时候它转圈 */
  private pending: HTMLButtonElement | null = null;

  constructor(parent: HTMLElement, h: LobbyHandlers) {
    this.h = h;
    this.root = el('div', 'lobby', parent);
    // 首帧：右栏的数据（钱包、云存档、战绩）要等 boot 里几次请求回来；先画出来是一排空面板，数据到了再整个跳变。
    // 所以右栏先隐藏（只是 opacity，位置照占，不会挪），boot 画完第一版真数据后 ready() 淡入；标题和扇形牌是静态的，一直可见。
    // 邀请链接（?room=）马上要进房间，不等；boot 卡住（钱包不回话）时 1.5 秒后也放出来，不让页面一直空着
    if (!new URLSearchParams(location.search).has('room')) {
      this.root.classList.add('booting');
      window.setTimeout(() => this.ready(), 1500);
    }
    const hero = el('div', 'hero', this.root);
    el('div', 'title', hero, '德州扑克');
    el('div', 'subtitle', hero, '两张底牌、五张公共牌，凑出最大的五张');
    const fan = el('div', 'fan', hero);
    [48, 44, 40, 36, 32].forEach((c, i) => {
      const card = makeCard('fan-card');
      setCard(card, c + 3);
      card.style.setProperty('--k', String(i - 2));
      fan.appendChild(card);
    });
    el('div', 'ver', hero, `v${__TEXAS_VERSION__}`);

    // 右栏：横幅（两屏共用）→ 主页或选桌
    const side = el('div', 'side', this.root);
    this.noteEl = el('div', 'note', side);
    this.resumeBox = el('div', 'banner resume', side);
    this.resumeText = el('span', '', this.resumeBox);
    button(this.resumeBox, 'go', '接着打', () => h.resume());
    // 另一台设备上的那一桌这里不给放弃：看不到那边还剩多少（2026-10-15 定）
    this.orphanBox = el('div', 'banner orphan', side);
    this.orphanText = el('span', '', this.orphanBox);
    // 好友房不自动进：横幅点了才回去
    this.roomBox = el('div', 'banner room', side);
    this.roomText = el('span', '', this.roomBox);
    this.backBtn = button(this.roomBox, 'go', '回到房间', () => h.backToRoom());

    // ---- 主页 ----
    const front = (this.front = el('div', 'front', side));
    this.quickBtn = button(front, 'qstart', '', () => this.wait(this.quickBtn, () => this.quick()));
    el('b', '', this.quickBtn, '快速开始');
    this.quickSub = el('small', '', this.quickBtn);
    const cards = el('div', 'mcards', front);
    for (const [m, name, line] of MODE_CARDS) {
      const c = button(cards, 'mcard', '', () => this.enter(m));
      c.dataset.mode = m;
      c.innerHTML = `${MODE_ICON[m]}<b>${name}</b><span>${line}</span>`;
      this.modeCards.set(m, c);
    }
    // 新手指引的入口：随时再走一遍
    this.howBtn = button(front, 'howto', '', () => this.wait(this.howBtn, () => this.howTo()));
    el('b', '', this.howBtn, '怎么玩');
    el('small', '', this.howBtn, '带你坐一桌，一步一步看懂');
    const wallet = (this.walletBox = el('div', 'wallet', front));
    el('span', 'w-label', wallet, '我的筹码');
    this.balance = el('span', 'w-balance', wallet, '…');
    this.reliefBtn = button(wallet, 'relief', '领今日补给', () => this.wait(this.reliefBtn, () => h.relief()));
    this.disclaimer = el('div', 'disclaimer', front, '筹码无任何现金价值：不能买、不能换钱换物、不能转给别人');
    this.statsEl = el('div', 'mystats', front);
    // 成就和今日谜题并排一行：主页不多占一行
    const extras = el('div', 'extras', front);
    this.pzBtn = button(extras, 'pz-open', '', () => h.puzzle());
    this.achBtn = button(extras, 'ach-open', '', () => h.achievements());

    // ---- 选桌 ----
    const panel = (this.pickPanel = el('div', 'panel', side));
    const head = el('div', 'p-head', panel);
    button(head, 'p-back', '‹ 返回', () => this.show('front'));
    el('b', 'p-title', head, '选桌');
    this.pickBal = el('span', 'p-balance', head);

    const modes = el('div', 'modes', panel);
    for (const [m, name] of [
      ['fun', '娱乐'],
      ['real', '实盘'],
      ['room', '好友房'],
    ] as const) {
      this.modeBtns.set(m, button(modes, 'mode', name, () => this.pickMode(m)));
    }
    this.modeNote = el('div', 'mode-note', modes);

    // 好友房：输码进房紧跟在选项下面（进别人的房不用选档位），手机第一屏就看得见
    const fr = (this.friends = el('div', 'friends join', panel));
    this.codeIn = el('input', 'code-in', fr);
    Object.assign(this.codeIn, { type: 'text', inputMode: 'numeric', maxLength: 6, placeholder: '朋友给的 6 位房间码', autocomplete: 'off' });
    this.codeIn.addEventListener('input', () => {
      this.codeIn.value = this.codeIn.value.replace(/\D/g, '').slice(0, 6);
      this.draw();
    });
    this.codeIn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !this.joinBtn.disabled) this.wait(this.joinBtn, () => h.joinRoom(this.codeIn.value));
    });
    this.joinBtn = button(fr, 'pill', '进房间', () => this.wait(this.joinBtn, () => h.joinRoom(this.codeIn.value)));
    // 单独部署时好友房里别人看到的名字（kit 的 ?name=，服务端清洗，不合格就是"游客1234"）；有平台时用平台的昵称，不显示
    this.nickRow = el('div', 'nick-row hidden', panel);
    el('span', 'label', this.nickRow, '昵称');
    this.nickIn = el('input', 'code-in nick-in', this.nickRow);
    Object.assign(this.nickIn, { type: 'text', maxLength: 12, placeholder: '好友房里显示的名字，可不填', autocomplete: 'nickname' });
    this.nickIn.addEventListener('change', () => patchSettings({ nick: this.nickname() }));

    // 每档一张卡（docs/balance.md 第 5 节）：电脑多强（★）、一场约多久、一场最多输赢；实盘四档、娱乐三个难度
    const grid = (this.grid = el('div', 'stakes', panel));
    for (const st of STAKES) {
      const t = button(grid, 'tile', '', () => this.pick(st.id));
      if (st.id !== 'small') t.dataset.room = st.id;
      t.innerHTML = `<i class="mini"></i><em>${ROOM_NAME[st.id]}</em>` + card(st.name, STARS[st.id], `盲注 ${chips(st.sb)}/${chips(st.bb)}`, [`最多输 ${short(st.max)}`, `赢很少过 ${short(3 * st.max)}`]);
      this.tiles.set(st.id, t);
    }
    for (const d of DIFFICULTIES) {
      const t = button(grid, 'tile diff', '', () => this.pickDiff(d));
      t.innerHTML = card(DIFFICULTY_NAME[d], FUN_STARS[d], FOR_WHOM[d], ['不碰钱包', '筹码不算数']);
      this.diffTiles.set(d, t);
    }
    this.funTile = button(grid, 'tile diff room-fun', '', () => this.pickRoomFun());
    this.funTile.innerHTML = card('娱乐', FUN_STARS.normal, '朋友之间练手', ['不碰钱包', '筹码不算数']);
    // 选桌只留一个主按钮（docs/ui.md 第 2、11 节）：选好档位点"坐下开打"；人数、带多少、止盈和别的玩法入口都直接摆出来（选项不折叠），用次按钮。
    const opts = el('div', 'opts', panel);
    const sizeRow = (this.sizeRow = el('div', 'sizes', opts));
    el('span', 'label', sizeRow, '人数');
    for (let n = 2; n <= MAX_SEATS; n++) {
      const b = button(sizeRow, 'size', String(n), () => this.pickSize(n));
      this.sizes.push(b);
    }
    const buy = (this.buyRow = el('div', 'buyin', opts));
    el('span', 'label', buy, '带上桌');
    this.slider = el('input', 'slider', buy);
    this.slider.type = 'range';
    this.slider.addEventListener('input', () => this.draw());
    this.buyAmt = el('span', 'buy-amt', buy);
    // 止盈：坐下前就能设，和桌上顶栏的开关是同一个设置。挨在带多少后面，不另占一行
    this.tpBtn = button(buy, 'pill tp-pick-btn', '止盈：关', () => h.takeProfit());
    const go = (this.goRow = el('div', 'go-row', panel));
    this.startBtn = button(go, 'start', '坐下开打', () =>
      this.wait(this.startBtn, () => (this.fun() ? this.h.start(FUN_STAKES, this.size, Number(this.slider.value), true, FUN_LEVEL[this.diff]) : this.h.start(this.stakes, this.size, Number(this.slider.value), false))),
    );
    // 鼠标设备上按钮角标写出回车和 ←/→ 能用（牌桌上的按钮也是这个做法）
    el('kbd', 'k-hint', this.startBtn, '回车').setAttribute('aria-hidden', 'true');
    this.startBtn.title = '快捷键：← → 换档位，回车坐下开打';
    // 其他玩法：一排次按钮，都不是金色，主按钮只有"坐下开打"
    const plays = (this.pfRow = el('div', 'plays', panel));
    // 快速匹配（docs/online.md 6.11）：实盘才有；人数按匹配桌的 6 人，带这一档的满买入（和好友房一样）
    this.matchBtn = this.playButton(plays, 'pill match', '快速匹配', '和真人一起打', () => h.match(this.stakes, this.fun(), FUN_LEVEL[this.diff]));

    // 单机锦标赛：和现金桌共用上面选的档位（娱乐按难度，实盘报名费 = 这一档的一份），人数、带多少不用选
    this.tourBtn = this.playButton(plays, 'pill tour-btn', '锦标赛', '打到最后一人', () => this.wait(this.tourBtn, () => h.tour(this.stakes, this.fun(), FUN_LEVEL[this.diff], this.tourFmt)));

    // 快速局 · 全下或弃牌（docs/features.md 13.10）：只有娱乐
    this.pfBtn = this.playButton(plays, 'pill pf-btn', '快速局', '只能全下或弃牌', () => this.wait(this.pfBtn, () => h.pushFold(false)));
    this.dailyBtn = this.playButton(plays, 'pill pf-btn pf-daily', '今日局', '每天同一副牌上榜', () => this.wait(this.dailyBtn, () => h.pushFold(true)));
    this.dailyTourBtn = this.playButton(plays, 'pill pf-btn pf-daily', '今日赛', '每天一场比赛上榜', () => this.wait(this.dailyTourBtn, () => h.dailyTour()));
    // 今日局、今日赛共用 .pf-daily 的样式，冒烟按 data-act 分开点
    this.pfBtn.dataset.act = 'pf';
    this.dailyBtn.dataset.act = 'daily-pf';
    this.dailyTourBtn.dataset.act = 'daily-tour';
    this.dailyTourBtn.title = '每天一场 6 人极速赛，牌堆和对手每天固定；每天第一场记分上榜';
    plays.title = `${PF_HANDS} 手、每人 ${PF_STACK_BB} 个大盲，只点全下或弃牌；今日局每天同一副牌、记一次分上榜`;
    // 锦标赛的赛制：挨着锦标赛的说明
    const fmts = (this.fmtRow = el('div', 'tour-fmts', panel));
    for (const f of FORMATS) this.fmtBtns.set(f, button(fmts, 'size tfmt', FORMAT_LABEL[f], () => this.pickFormat(f)));
    this.tourNote = el('div', 'tour-note', fmts, tourRule(this.tourFmt));

    // 好友房：开房间放在"坐下开打"的位置，用上面选的档位和人数，买入固定是这一档的满买入
    const open = (this.openRow = el('div', 'friends open', panel));
    // 开房的玩法：现金桌不变；锦标赛 6 人固定，档位里多一张娱乐，再选空位要不要电脑补
    for (const [i, name] of ['现金桌', '锦标赛'].entries()) this.kindBtns.push(button(open, 'size kind', name, () => this.pickKind(i === 1)));
    this.fillBtn = button(open, 'size kind fill', '', () => this.pickFill());
    this.openBtn = button(open, 'pill go', '开房间', () => this.wait(this.openBtn, () => h.openRoom(this.roomFun ? FUN_STAKES : this.stakes, this.roomTour ? 6 : this.size, this.roomFun, this.roomTour ? { fill: this.fill } : undefined)));

    // 设置坏了就用默认的（readSettings 坏了给空）
    const saved = readSettings() as { stakes?: StakesId; size?: number; mode?: Mode; diff?: Difficulty; tourFmt?: TourFormat };
    if (saved.stakes && STAKES.some((x) => x.id === saved.stakes)) this.stakes = saved.stakes;
    if (saved.diff && DIFFICULTIES.includes(saved.diff)) this.diff = saved.diff;
    if (saved.size && saved.size >= 2 && saved.size <= MAX_SEATS) this.size = saved.size;
    if (saved.tourFmt && FORMATS.includes(saved.tourFmt)) this.tourFmt = saved.tourFmt;
    if (saved.mode === 'fun' || saved.mode === 'real' || saved.mode === 'room') this.mode = saved.mode;
    if (typeof (saved as { nick?: unknown }).nick === 'string') this.nickIn.value = (saved as { nick: string }).nick;
    window.addEventListener('keydown', (e) => this.onKey(e));
  }

  /** 玩法按钮 + 下面一行小字说明（手机没有悬停，直接摆出来）；灰了的按钮把这行换成原因 */
  private playButton(parent: HTMLElement, cls: string, text: string, note: string, onClick: () => void): HTMLButtonElement {
    const cell = el('div', 'play', parent);
    const b = button(cell, cls, text, onClick);
    this.notes.set(b, { node: el('span', 'play-note', cell, note), idle: note });
    return b;
  }

  private setNote(b: HTMLButtonElement, why: string | null): void {
    const n = must(this.notes.get(b), 'this.notes.get(b)');
    setText(n.node, why ?? n.idle);
    toggle(n.node, 'why', !!why);
  }

  /** 选桌页的键盘：←/→ 换档位，回车坐下开打（规则在 lobbykeys.ts；输入框里、弹窗开着时不处理） */
  private onKey(e: KeyboardEvent): void {
    // 牌桌上、好友房里 .lobby 是 display:none，量不到盒子
    const shown = this.screen === 'pick' && this.root.getClientRects().length > 0;
    const k = lobbyKey(e, { onPick: shown, modal: !!document.querySelector('.mask, .dialog'), focus: focusKind(document.activeElement), room: this.room() });
    if (!k) return;
    if (k === 'start') {
      if (this.startBtn.disabled) return;
      e.preventDefault();
      this.startBtn.click();
      return;
    }
    const dir = k === 'next' ? 1 : -1;
    e.preventDefault();
    if (this.fun()) this.pickDiff(stepPick(DIFFICULTIES, this.diff, dir));
    else this.pick(stepPick(STAKES.map((s) => s.id), this.stakes, dir));
  }

  /** 首帧数据到齐、第一版真数据已画好：右栏淡入（淡入时长在 skin.css，减少动画时直接出现） */
  ready(): void {
    this.root.classList.remove('booting');
  }

  /** 单独部署（开局时问过没有平台）：藏起钱包和实盘，好友房里露出昵称框 */
  standalone(): void {
    this.alone = true;
    for (const e of [this.walletBox, this.disclaimer, this.pickBal, must(this.modeBtns.get('real'), 'this.modeBtns.get(real)'), this.modeCards.get('real')!]) toggle(e, 'hidden', true);
    this.draw();
  }

  /** 回到主页（离桌、离开房间回来时） */
  home(): void {
    this.show('front');
  }

  private show(screen: 'front' | 'pick'): void {
    this.screen = screen;
    this.draw();
  }

  /** 点模式卡：选好这个玩法，到选桌 */
  private enter(m: Mode): void {
    this.pickMode(m);
    this.show('pick');
  }

  /**
   * 快速开始：有没打完的一桌就接着打；不然按上次的设置开一桌单机（上次是实盘、钱包够就实盘满买入，否则娱乐；
   * 上次是好友房也开娱乐——开房要叫人，不算"快速"）。第一次来是娱乐·新手·6 人（docs/balance.md 第 3 节）
   */
  private quick(): void {
    if (this.s.resume) return this.h.resume();
    if (this.quickReal()) {
      const st = stakesOf(this.stakes);
      this.h.start(this.stakes, this.size, topBuyIn(st, this.s.wallet?.balance ?? 0), false);
    } else this.h.start(FUN_STAKES, this.size, stakesOf(FUN_STAKES).max, true, FUN_LEVEL[this.diff]);
  }

  /** 怎么玩：重置指引后进娱乐新手桌；有没打完的一桌就接着打（指引在下一次轮到我时出） */
  private howTo(): void {
    this.h.howTo();
    if (this.s.resume) return this.h.resume();
    this.h.start(FUN_STAKES, 6, stakesOf(FUN_STAKES).max, true, FUN_LEVEL.easy);
  }

  private quickReal(): boolean {
    const bal = this.s.wallet?.balance ?? null;
    return this.mode === 'real' && !this.alone && bal !== null && bal >= stakesOf(this.stakes).min;
  }

  /** 选的是好友房（房间都是实盘，用实盘的档位；单独部署时筹码不记账） */
  private room(): boolean {
    return this.mode === 'room';
  }

  /** 单机是不是娱乐：钱包连不上、单独部署时只有娱乐（记着的是实盘也一样，开桌按这个） */
  private fun(): boolean {
    return !this.room() && (this.mode === 'fun' || !this.s.wallet || this.alone);
  }

  /** 单独部署时的昵称（没填是空的） */
  nickname(): string {
    return this.nickIn.value.trim();
  }

  update(s: LobbyState): void {
    this.s = s;
    this.draw();
  }

  /**
   * 从平台大厅的"好友房"进来（?online=1）：切到好友房，开房、进房那一行滚到看得见、亮一下；
   * 有鼠标的直接把光标放进房间码，触屏不放（免得一进来就弹键盘盖住半屏）
   */
  showFriends(): void {
    this.enter('room');
    this.friends.scrollIntoView({ block: 'nearest' });
    this.friends.classList.remove('spot');
    void this.friends.offsetWidth;
    this.friends.classList.add('spot');
    if (matchMedia('(pointer: fine)').matches) this.codeIn.focus({ preventScroll: true });
  }

  private wait(b: HTMLButtonElement, go: () => void): void {
    this.pending = b;
    go();
  }

  private pick(id: StakesId): void {
    this.stakes = id;
    this.roomFun = false;
    // 换档就按这一档的满买入（draw 里先改了上下限再设值，不然值会被旧的上限截住）
    this.slider.dataset.init = '';
    this.remember();
    this.draw();
  }

  private pickDiff(d: Difficulty): void {
    this.diff = d;
    this.remember();
    this.draw();
  }

  private pickFormat(f: TourFormat): void {
    this.tourFmt = f;
    this.remember();
    this.draw();
  }

  private pickKind(tour: boolean): void {
    this.roomTour = tour;
    this.draw();
  }

  private pickFill(): void {
    this.fill = !this.fill;
    this.draw();
  }

  private pickRoomFun(): void {
    this.roomFun = true;
    this.draw();
  }

  private pickMode(m: Mode): void {
    this.mode = m;
    this.slider.dataset.init = '';
    this.remember();
    this.draw();
  }

  private pickSize(n: number): void {
    this.size = n;
    this.remember();
    this.draw();
  }

  private remember(): void {
    patchSettings({ stakes: this.stakes, size: this.size, mode: this.mode, diff: this.diff, tourFmt: this.tourFmt });
  }

  /** 战绩小卡：没打过就一句话叫他先来一把 */
  private drawStats(): void {
    const { hands, won, biggestPot, best } = this.s.stats;
    const html = hands
      ? `<span class="ms-label">我的战绩</span>` +
        [
          [chips(hands), '手'],
          [chips(won), '赢下'],
          [biggestPot ? chips(biggestPot) : '—', '最大一池'],
          [best ? CATEGORY_NAMES[categoryOf(best)] : '—', '最好的牌'],
        ]
          .map(([v, k]) => `<span class="ms"><b>${v}</b><small>${k}</small></span>`)
          .join('')
      : '<span class="ms-label">还没打过：点"快速开始"先来一把</span>';
    if (this.statsHtml !== html) this.statsEl.innerHTML = this.statsHtml = html;
  }

  /** 今日谜题入口：未开始 / 第几道 / 总分，加连续完成天数 */
  setPuzzle(state: 'new' | 'part' | 'done', text: string, streak: number): void {
    this.pzBtn.dataset.state = state;
    const tag = text;
    const html = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l2.4 6.6L21 9l-5 4.6L17.5 21 12 17.3 6.5 21 8 13.6 3 9l6.6-.4z"/></svg><b>今日谜题</b><span>${tag}${streak >= 2 ? ` · 连 ${streak}` : ''}</span>`;
    if (this.pzBtn.innerHTML !== html) this.pzBtn.innerHTML = html;
  }

  /** 成就入口上的数（拿到几个 / 一共几个） */
  setAch(got: number, total: number): void {
    const html = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h10v5a5 5 0 0 1-10 0zM7 6H3v2a4 4 0 0 0 4 4M17 6h4v2a4 4 0 0 1-4 4M11 14h2v3h3v3H8v-3h3z"/></svg><b>成就</b><span>${got} / ${total}</span><i aria-hidden="true">›</i>`;
    if (this.achBtn.innerHTML !== html) this.achBtn.innerHTML = html;
    // 条上的进度（skin.css 用它铺一层金色），看着是活的、能点的，不是灰条
    this.achBtn.style.setProperty('--ach', String(total ? Math.min(1, got / total) : 0));
  }

  /** 止盈按钮上的字（"止盈：关"、"止盈：赢 50%"……） */
  setTakeProfit(text: string): void {
    this.tpBtn.textContent = text;
  }

  private draw(): void {
    const { wallet, note, resume, orphan, busy } = this.s;
    const bal = wallet?.balance ?? null;
    setText(this.balance, bal === null ? '—' : chips(bal));
    toggle(this.reliefBtn, 'hidden', !wallet?.canRelief);
    setText(this.noteEl, note ?? '');
    toggle(this.noteEl, 'hidden', !note);
    const pick = this.screen === 'pick';
    toggle(this.front, 'hidden', pick);
    // 选桌页上竖屏、手机横屏把标题下的一句话和扇形牌收起，让出高度（CSS 里 .on-pick）
    toggle(this.root, 'on-pick', pick);
    toggle(this.pickPanel, 'hidden', !pick);
    // 主页上"继续上局"就是快速开始那个大按钮，横幅只在选桌时说明为什么开不了新的一桌
    toggle(this.resumeBox, 'hidden', !resume || !pick);
    const rd = resume?.practice ? difficultyOf(resume.level) : null;
    if (resume) setText(this.resumeText, `${resume.tour ? '锦标赛 · ' : ''}${resume.practice ? '娱乐' : '实盘'} · ${rd ? DIFFICULTY_NAME[rd] : stakesOf(resume.stakes).name} · ${resume.size} 人，${resume.waiting ? '等钱包回话' : '上次没打完'}`);
    toggle(this.orphanBox, 'hidden', !orphan || !!resume);
    if (orphan) setText(this.orphanText, `另一台设备上还有一桌没打完（带上桌 ${chips(orphan.amount)}）：回那台设备离桌就能结回；放着不管，24 小时后原样退回钱包`);

    // 钱包连不上：实盘不可选，娱乐、好友房（进别人的房）照常
    const room = this.room();
    const fun = this.fun();
    const now: Mode = room ? 'room' : fun ? 'fun' : 'real';
    for (const [m, b] of this.modeBtns) {
      toggle(b, 'sel', m === now);
      b.disabled = m === 'real' && !wallet;
    }
    must(this.modeCards.get('real'), 'this.modeCards.get(real)').disabled = !wallet;
    setText(this.pickBal, bal === null ? '' : `我的筹码 ${chips(bal)}`);
    toggle(this.pickBal, 'hidden', this.alone || bal === null || room || fun);
    const qr = this.quickReal();
    setText(this.quickBtn.firstChild as HTMLElement, resume ? '继续上局' : '快速开始');
    setText(
      this.quickSub,
      resume
        ? `${resume.tour ? '锦标赛 · ' : ''}${resume.practice ? '娱乐' : '实盘'} · ${rd ? DIFFICULTY_NAME[rd] : stakesOf(resume.stakes).name} · ${resume.size} 人`
        : `${qr ? `实盘 · ${stakesOf(this.stakes).name}` : `娱乐 · ${DIFFICULTY_NAME[this.diff]}`} · ${this.size} 人`,
    );
    this.quickBtn.disabled = busy;
    this.howBtn.disabled = busy;
    this.drawStats();
    setText(
      this.modeNote,
      room ? (this.roomTour ? '锦标赛：6 人、每人 1,500 比赛筹码打到剩一人；实盘每人交一份报名费，奖池只在真人之间按名次分' : '和朋友一桌：开个房间把房间码发给他们，或者输朋友给的码') : this.alone ? '筹码不算数，随便玩' : fun ? '不碰钱包，筹码不算数，随便玩' : '从钱包带筹码上桌，离桌结回；最多输掉带上去的',
    );
    // 好友房：档位、人数照旧选，下面换成开房间、输码进房；单机的带多少、坐下开打收起来
    toggle(this.buyRow, 'hidden', room);
    toggle(this.goRow, 'hidden', room);
    toggle(this.pfRow, 'hidden', room);
    toggle(this.friends, 'hidden', !room);
    toggle(this.openRow, 'hidden', !room);
    toggle(this.nickRow, 'hidden', !(room && this.alone));
    // 好友房锦标赛：固定 6 人；档位里多一张娱乐；空位电脑补的开关
    const rt = room && this.roomTour;
    toggle(this.openRow, 'rt', rt);
    this.kindBtns.forEach((b, i) => toggle(b, 'sel', (i === 1) === this.roomTour));
    toggle(this.fillBtn, 'hidden', !rt);
    toggle(this.fillBtn, 'sel', this.fill);
    setText(this.fillBtn, this.fill ? '空位电脑补：开' : '空位电脑补：关');
    toggle(this.sizeRow, 'hidden', rt);
    // 娱乐卡：好友房的现金桌和锦标赛都有（朋友之间练手，不碰钱包，人不够电脑补）
    toggle(this.funTile, 'hidden', !room);
    toggle(this.funTile, 'sel', room && this.roomFun);
    // 实盘新开一份只要钱包够这次带入（平台 0.10.2）：够这一档的最少买入就能开，不够一整份就少带一点
    for (const st of STAKES) {
      const t = must(this.tiles.get(st.id), 'this.tiles.get(st.id)');
      toggle(t, 'sel', st.id === this.stakes && !(room && this.roomFun));
      const locked = !fun && !this.alone && bal !== null && bal < st.min;
      toggle(t, 'locked', locked);
      // 灰着的档位在卡上写要多少（原来的"最多输"那一行换成它，选中后钱包够了再换回来）
      const need = t.querySelector('small');
      if (need) {
        setText(need, locked ? `要 ${short(st.min)} 筹码` : `最多输 ${short(st.max)}`);
        toggle(need, 'need', locked);
      }
      toggle(t, 'hidden', fun);
    }
    toggle(this.grid, 'fun', fun);
    for (const [d, t] of this.diffTiles) {
      toggle(t, 'sel', d === this.diff);
      toggle(t, 'hidden', !fun);
    }
    this.sizes.forEach((b, i) => toggle(b, 'sel', i + 2 === this.size));
    // 娱乐按小桌的盲注和买入打（难度只管电脑）；好友房照旧用实盘选的档位
    const st = stakesOf(fun ? FUN_STAKES : this.stakes);
    const ok = fun || (bal ?? 0) >= st.min;
    const top = fun ? st.max : topBuyIn(st, bal ?? 0);
    this.slider.min = String(st.min);
    this.slider.max = String(top);
    this.slider.step = String(st.bb);
    if (!this.slider.dataset.init || Number(this.slider.value) > top) {
      this.slider.value = String(top);
      this.slider.dataset.init = '1';
    }
    this.slider.disabled = !ok;
    setText(this.buyAmt, ok ? chips(Number(this.slider.value)) : `钱包要有 ${chips(st.min)}`);
    // 本机一次只摆一桌单机（没打完的先接着打）；钱包里别处还有德州的份不影响（平台 0.9.5 起可以同时有好几份）
    this.startBtn.disabled = busy || !ok || !!resume;
    // 娱乐档不碰钱包，单独部署也有；实盘档没钱包（连不上）不给，钱包够这一档的最少买入才能排（不够一整份的，坐下时少带一点，和好友房一样）
    toggle(must(this.matchBtn.parentElement, 'this.matchBtn.parentElement'), 'hidden', !fun && (this.alone || !wallet));
    this.matchBtn.disabled = busy || !ok;
    this.setNote(this.matchBtn, ok ? null : `要 ${chips(st.min)} 筹码`);
    // 锦标赛：实盘钱包要够一整份报名费（不像现金桌能少带）；单独部署只有娱乐
    const tourOk = fun || (!this.alone && !!wallet && (bal ?? 0) >= st.max);
    setText(this.tourBtn, fun ? '锦标赛 · 免费' : `锦标赛 · ${chips(st.max)}`);
    this.tourBtn.disabled = busy || !!resume || !tourOk;
    // 灰着的按钮在自己下面写原因（按上面 disabled 的条件，一条一条对）
    this.setNote(this.tourBtn, resume ? RESUME_FIRST : tourOk ? null : this.alone ? '只有娱乐' : !wallet ? '钱包连不上' : `要 ${chips(st.max)} 筹码`);
    this.tourBtn.title = tourOk ? `报名费 ${chips(st.max)}（这一档的一份）：${TOUR_FULL[this.tourFmt]}` : `报名要一整份 ${chips(st.max)}`;
    // 灰着的按钮要说为什么（0.25.1 实打：钱包不够一整份时只灰、没说要多少）
    setText(
      this.tourNote,
      !fun && !this.alone && wallet && !tourOk ? `钱包要有 ${chips(st.max)} 才能报名这一档的锦标赛` : tourRule(this.tourFmt),
    );
    for (const [f, b] of this.fmtBtns) toggle(b, 'sel', f === this.tourFmt);
    toggle(this.fmtRow, 'hidden', room);
    toggle(must(this.pfBtn.parentElement, 'this.pfBtn.parentElement'), 'hidden', !fun);
    this.pfBtn.disabled = busy || !!resume;
    this.setNote(this.pfBtn, resume ? RESUME_FIRST : null);
    // 今日局要上平台的榜：单独部署没有平台，不给
    toggle(must(this.dailyBtn.parentElement, 'this.dailyBtn.parentElement'), 'hidden', this.alone || !fun);
    this.dailyBtn.disabled = busy || !!resume;
    this.setNote(this.dailyBtn, resume ? RESUME_FIRST : null);
    toggle(must(this.dailyTourBtn.parentElement, 'this.dailyTourBtn.parentElement'), 'hidden', this.alone || !fun);
    this.dailyTourBtn.disabled = busy || !!resume;
    this.setNote(this.dailyTourBtn, resume ? RESUME_FIRST : null);
    toggle(this.tourNote, 'hidden', room);
    const back = this.s.room;
    // 开房只看钱包够不够这一档的最少买入（坐下就要带；不够一整份的，坐下时少带一点）；单机没打完、别处还有一份都不拦
    // （0.3.0：好友房不设多余的限制）
    // 单独部署没有钱包：好友房的筹码不记账，不看钱包
    // 锦标赛报名要一整份（娱乐不碰钱包）
    const need = rt ? st.max : st.min;
    const free = this.alone || (room && this.roomFun);
    setText(this.openBtn, rt ? '开锦标赛房间' : '开房间');
    this.openBtn.disabled = busy || (!free && (!wallet || (bal ?? 0) < need));
    this.openBtn.title = free ? '' : !wallet ? '钱包连不上，稍后再试' : (bal ?? 0) < need ? (rt ? `报名要一整份 ${chips(st.max)}：去大厅领补给，或者换小一档` : `这一档最少带 ${chips(st.min)}：去大厅领补给，或者换小一档`) : '';
    this.joinBtn.disabled = busy || this.codeIn.value.length !== 6;
    // 选桌上选实盘、好友房的档位时，背景跟着换成那一间
    this.h.preview(pick && !fun && !(room && this.roomFun) ? this.stakes : null);
    for (const b of [this.quickBtn, this.howBtn, this.startBtn, this.pfBtn, this.dailyBtn, this.dailyTourBtn, this.openBtn, this.joinBtn, this.reliefBtn]) toggle(b, 'loading', busy && b === this.pending);
    toggle(this.roomBox, 'hidden', !back);
    if (back) {
      setText(this.roomText, back.text);
      setText(this.backBtn, `回到房间 ${back.code}`);
    }
  }
}

/** 实盘带多少的上限：这一档的满买入，钱包不够就按大盲取整少带，至少这一档的最少买入（平台 0.10.2） */
export function topBuyIn(st: { min: number; max: number; bb: number }, bal: number): number {
  return Math.max(st.min, Math.min(st.max, Math.floor(bal / st.bb) * st.bb));
}

/** 锦标赛入口上的规则 */
/** 选赛制的小按钮字（和说明挤在一行，1280×720 的选桌放不下多一行） */
const FORMAT_LABEL: Record<TourFormat, string> = { sng: '经典', turbo: '极速赛', nine: '9 人赛' };
/** 一行说明（挤在赛制按钮后面）；完整规则在锦标赛按钮的 title 里 */
const TOUR_RULES: Record<TourFormat, string> = {
  sng: '6 人 · 前四名拿 3 / 1.2 / 1 / 0.9 份报名费',
  turbo: '6 人 · 涨盲快一倍 · 前四名拿 3.3 / 1 / 0.9 / 0.9 份',
  nine: '9 人 · 前四名拿 4 / 1.4 / 1.3 / 1.2 份',
};
/** 完整规则（按钮提示用）：每人 1,500 比赛筹码、打到剩一人 */
const TOUR_FULL: Record<TourFormat, string> = {
  sng: '6 人、每人 1,500 比赛筹码、打到剩一人，前四名拿奖 3 / 1.2 / 1 / 0.9 份报名费（一份 = 这一档的报名费）',
  turbo: '极速赛：6 人、每人 1,500 比赛筹码、每 3 手涨一次盲注（经典是 6 手），约一半时间打完，前四名拿奖 3.3 / 1 / 0.9 / 0.9 份报名费',
  nine: '9 人赛：9 人、每人 1,500 比赛筹码、打到剩一人，约经典赛的 1.3 倍时间，前四名拿奖 4 / 1.4 / 1.3 / 1.2 份报名费',
};
const tourRule = (f: TourFormat): string => TOUR_RULES[f];
/** 单机有一桌没打完时，别的单机玩法都灰着 */
const RESUME_FIRST = '先打完上一桌';

/** 主页三张模式卡：名字和一句话（话里别带别的卡的名字，冒烟按名字找卡） */
const MODE_CARDS: readonly (readonly [Mode, string, string])[] = [
  ['fun', '娱乐', '练手，不算筹码'],
  ['real', '实盘', '带筹码上桌'],
  ['room', '好友房', '叫朋友一起打'],
];

/** 模式卡的图标（内联 SVG，24 格）：两张牌、一摞筹码、两个人 */
const MODE_ICON: Readonly<Record<Mode, string>> = {
  fun: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="11" height="15" rx="2" transform="rotate(-12 8.5 12.5)"/><rect x="9" y="4" width="11" height="15" rx="2" transform="rotate(10 14.5 11.5)"/></svg>',
  real: '<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="17" rx="8" ry="3"/><ellipse cx="12" cy="12.5" rx="8" ry="3"/><ellipse cx="12" cy="8" rx="8" ry="3"/></svg>',
  room: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8.5" cy="8" r="3.2"/><circle cx="16" cy="9" r="2.8"/><path d="M2.5 20c0-3.6 2.7-6 6-6s6 2.4 6 6zM14 20c.2-2.4-.6-4.3-2-5.6 1.1-.6 2.4-.9 4-.9 3 0 5.5 2.2 5.5 6.5z"/></svg>',
};

function button(parent: HTMLElement, cls: string, text: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', cls, parent, text);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

/** 格子窄，一万以上写成"4万" */
const short = (n: number): string => (n >= 10_000 && n % 10_000 === 0 ? `${n / 10_000}万` : chips(n));

/** 电脑多强（1–4 颗星，四个游戏一样的画法）：实盘按档位，娱乐按难度（高手和豪华桌是同一档电脑） */
const STARS: Readonly<Record<StakesId, number>> = { small: 1, mid: 2, big: 3, lux: 4 };
const FUN_STARS: Readonly<Record<Difficulty, number>> = { easy: 1, normal: 2, hard: 4 };
const FOR_WHOM: Readonly<Record<Difficulty, string>> = { easy: '刚学会，先赢几把', normal: '会看牌、会弃牌', hard: '想和最强的电脑过招' };

/**
 * 选档卡：名字、星、一句（盲注或适合谁）、最多输赢（娱乐写不碰钱包）。不写"一场多久"：40 手只是配平模拟用的场长，实际打多久由玩家定，写了就成了没兑现的承诺。
 * "赢很少过 3 份"是配平模拟量的（docs/ai.md 4.10：一场赢超过 3 份的不到 1%），规则不封顶，所以不写"最多赢"
 */
function card(name: string, stars: number, line: string, stake: readonly string[]): string {
  return (
    `<b>${name}</b><span class="stars" aria-label="电脑强度 ${stars}/4">${'★'.repeat(stars)}${'☆'.repeat(4 - stars)}</span>` +
    `<span>${line}</span>${stake.map((x) => `<small>${x}</small>`).join('')}`
  );
}
