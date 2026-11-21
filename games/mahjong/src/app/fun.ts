/**
 * 牌桌上的互动和提示（kit 的 table-fun，单机、好友房同一套，见 view/fun.ts）：接上牌桌的互动组件、名场面横幅和好友动态、轮到我的提醒。
 */
import { postMoment } from 'arcade-kit/social';
import { createFun } from '../view/fun.ts';
import { dialogHooks } from '../view/dialog.ts';
import { play } from '../view/sound.ts';
import { HIGHLIGHT_NAME } from '../view/text.ts';
import type { AnyTable, AnyView } from '../view/variants/page.ts';
import { pageOf } from '../view/variants/pages.ts';
import { toReport } from '../game/feed.ts';
import type { ChatResultLike, FunSeat, FunTemper, TableFun } from 'arcade-kit/table-fun';
import { readRecord } from './record.ts';
import { GAME_ID } from './report.ts';
import { session } from './session.ts';
import { topbar } from './shell.ts';
import { TIMING } from './timing.ts';

/**
 * 牌桌重画以后让互动组件重新摆头像热区和按钮：攒到下一帧再摆，一帧最多一次。
 * 它要量头像的位置，紧跟在写 DOM 后面量会逼浏览器当场重算样式、排版（以前每一步都这样，对局里主线程最大的一块）
 */
let refreshing = 0;
export function refreshFun(): void {
  if (refreshing) return;
  refreshing = requestAnimationFrame(() => {
    refreshing = 0;
    session.fun?.refresh();
  });
}

/** 轮到我（出现了要我做的事）：提示音、振动，页面在后台时标题闪 */
export function alertTurn(v: { prompt: unknown; phase: string }): void {
  const now = !!v.prompt && v.phase !== 'swap' && v.phase !== 'que';
  if (now && !session.lastPrompt) {
    play('turn');
    navigator.vibrate?.(60);
    if (document.hidden) flashTitle();
  }
  session.lastPrompt = now;
}

let flashing = 0;
function flashTitle(): void {
  if (flashing) return;
  const base = document.title;
  let on = false;
  flashing = window.setInterval(() => {
    on = !on;
    document.title = on ? '【轮到你了】' : base;
  }, TIMING.titleFlashMs);
  const stop = (): void => {
    if (document.hidden) return;
    window.clearInterval(flashing);
    flashing = 0;
    document.title = base;
    document.removeEventListener('visibilitychange', stop);
  };
  document.addEventListener('visibilitychange', stop);
}

/** 名场面横幅等胡牌的牌面放完再挂 */
const funTimers = new Set<number>();

/**
 * 接上牌桌：头像矩形、名字、谁是电脑和互动性格每次现问牌桌；temper 给电脑座位的性格（真人 null）。
 * 自己的弹窗打开时把互动藏起来（菜单、热区盖在弹窗上面会挡点击）
 */
export function newFun(
  t: AnyTable,
  me: () => number | null,
  temper: (seat: number) => FunTemper | null,
  send: (id: number, to?: number) => void,
  scope: string,
  localBots: boolean,
  chat?: (text: string) => ChatResultLike,
): TableFun {
  const f = createFun({
    ...(chat ? { chat } : {}),
    seats: () =>
      Array.from({ length: t.view()?.seats.length ?? 4 }, (_, seat) => seat).map((seat): FunSeat | null => {
        const m = t.seatMeta(seat);
        if (!m || m.empty) return null;
        const tp = temper(seat);
        return { rect: t.avatarRect(seat), plate: t.plateRect(seat), marks: t.marks(seat), name: m.name, me: seat === me(), bot: m.bot, ...(tp ? { temper: tp } : {}) };
      }),
    // 顶栏也不能盖：上面两家的气泡往上冒会压住房间号和"离开"。
    // 自己的手牌再多算两遍：kit 按压住的面积挑位置，竖屏自己名牌四周都有东西，只算一遍时气泡常落在左边几张手牌上（#292 截图），
    // 压手牌的代价翻三倍后挑名牌上面、右边的空处
    avoid: () => {
      const hand = t.handRect();
      return [...t.avoidRects(), ...(hand.width > 0 ? [hand, hand] : []), topbar.getBoundingClientRect()];
    },
    button: () => (me() === null ? null : t.funSlot()),
    center: () => t.centerRects(),
    chatDock: () => t.chatDock(),
    chatFolded: () => t.chatCramped(),
    // 手机上的"聊天"按钮放在右下那家名牌正上方、右边对齐：挨着"互动"放右边会压到这家名牌，摞在"互动"上面又压住操作条（碰杠胡过、换牌）
    chatButton: () => {
      const m = me();
      return m === null ? null : t.chatButtonRect(m);
    },
    // 弹幕在对家那一排下面、中控盘上面飘
    danmakuArea: () => {
      const from = t.topRowBottom() + 6;
      const r = t.root.getBoundingClientRect();
      const bottom = t.centerRects()[0]?.top ?? r.top + r.height * 0.55;
      return bottom - from > 40 ? { left: r.left, top: from, width: r.width, height: bottom - from } : null;
    },
    send,
    canSend: () => me() !== null,
    scope: () => scope,
    localBots,
    // 首次提示冒在对家头像上（离手牌和操作条最远），对家空着就上家（左上）；右下那家贴着碰杠胡过的按钮，不挑。
    // 换三张、定缺、轮到我打、碰杠胡过的按钮在（v.prompt）时先不冒——以前 kit 挑第一个电脑，常是右下那家，
    // 气泡压住"缺条""过"和那家的名字（#249 截图）
    hintSeat: () => {
      const v = t.view();
      const m = me();
      if (!v || m === null || v.phase !== 'turn' || v.turn === m || v.prompt) return null;
      // 单机的头一场只学打牌：道具的提示等打完一场再冒（11-21 新手试玩：第一次轮到打牌就冒，和"点两下打出"抢眼）
      if (session.solo && !readRecord()) return null;
      const n = v.seats.length;
      for (const s of n === 3 ? [(m + 2) % 3, (m + 1) % 3] : [(m + 2) % 4, (m + 3) % 4]) {
        const meta = t.seatMeta(s);
        if (meta && !meta.empty) return s;
      }
      return null;
    },
  });
  dialogHooks({ open: () => f.hide(), close: () => f.show() });
  // 冒烟按 kit 的 controls() 点（开发服务器上才挂）
  if (import.meta.env.DEV) (window as { __fun?: TableFun }).__fun = f;
  return f;
}

export function dropFun(): void {
  for (const t of funTimers) window.clearTimeout(t);
  funTimers.clear();
  dialogHooks({ open() {}, close() {} });
  session.fun?.destroy();
  session.fun = null;
}

/** 两边都有的：有名场面就挂横幅（胡牌的牌面先放完）、记进这一场；单机里再交给 kit 让电脑起哄（好友房的电脑在房间里起哄） */
export function publicMoments(v: AnyView, names: string[], local: boolean): void {
  const m = pageOf(v.variant).moments(v);
  for (const h of m.found) {
    session.fame.push(h);
    const t = window.setTimeout(() => {
      funTimers.delete(t);
      session.fun?.banner(HIGHLIGHT_NAME[h.id], names[h.seat] ?? '');
    }, TIMING.momentBaseMs + m.hus * TIMING.momentPerHuMs);
    funTimers.add(t);
  }
  if (!local || !session.fun) return;
  for (const ev of m.fun()) session.fun.moment(ev);
}

/**
 * 娱乐局里自己胡出名场面：报一条好友动态（docs/platform-backend.md 15.17 第 2 条）。实盘的由平台结回时自己生成，不报；
 * 没平台、没登录（social 没挂上）不报；失败不提示，丢一条动态不影响打牌
 */
export function feed(match: object | string, v: AnyView, me: number): void {
  if (!session.social) return;
  if (session.feedFor !== match) [session.feedFor, session.feedSent] = [match, []];
  const found = pageOf(v.variant).feedMoments(v, me);
  for (const m of toReport(found, session.feedSent)) {
    session.feedSent.push(m.moment);
    void postMoment(GAME_ID, m.moment, m.n);
  }
}

