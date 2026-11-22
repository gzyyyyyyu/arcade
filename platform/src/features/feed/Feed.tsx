/**
 * 好友动态（docs/platform-backend.md 15.17）：动态页 /feed（全部，一屏放下按高度翻页，说明长的点"展开"在弹窗里看），顶栏的"动态"按钮点开一个浮层（最新 8 条，放不下的翻页，加"看全部"，有新的带红点），
 * 浮层和动态页都能赞、扔道具。电脑上浮层挂在按钮下面，手机上是从底下弹出的半屏面板（样式见 styles.css 的 .feedpop）。
 * 接口只给编号和数字，文字在这里拼，拆成"谁、在哪、结果标签"三段排版：
 * - 实盘结回的：平台的模板"老王在掼蛋小档赢了 1.6 份，称号：双下王"，称号名读游戏的 titles.json（读不到写"神秘称号"）；
 * - 游戏报的名场面：模板在游戏的 /games/<id>/moments.json（{"<编号>": {"text": "…"}}），只认 {name} {n} {n2} {n3} 四个占位符，
 *   别的花括号、超过 40 字、缺数字的模板一律当不合格，那条不显示。拼出来的是纯文本，React 按文字渲染，不当 HTML。
 * "看过"记在本机 localStorage 的 arcade.feedSeen（最新看过的那条的时间）：红点只是提醒，换设备不同步没关系。
 */
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from 'react';
import { api, errorText, type FeedItem } from '../../api.ts';
import { gameName, num } from '../../lib/format.ts';
import { GAMES } from '../../../shared/games.ts';
import { loadGameFile } from '../../lib/gamefile.ts';
import { Paged, useMedia } from '../fit/Fit.tsx';
import { FeedIcon } from '../../icons.tsx';
import { Modal } from '../modal/Modal.tsx';
import { Link, useLocation } from '../../router.tsx';
import { useVisible } from '../../session.tsx';
import { Empty, LoadError, Skeleton } from '../../ui.tsx';
import { loadTitles, type TitleCatalog } from '../../lib/titles.ts';
import './feed.css';

const TIERS: Record<string, string> = { small: '小档', mid: '中档', big: '大档', lux: '豪华档' };
/** 赞和 table-fun 的道具，按钮上的字 */
export const REACTIONS: readonly (readonly [string, string])[] = [
  ['like', '赞'],
  ['rose', '玫瑰'],
  ['cheers', '干杯'],
  ['tomato', '番茄'],
  ['egg', '鸡蛋'],
  ['stinkyEgg', '臭鸡蛋'],
  ['slipper', '拖鞋'],
  ['bomb', '炸弹'],
];
const REACTION_NAME = new Map(REACTIONS);
const SEEN_KEY = 'arcade.feedSeen';
const TEMPLATE_RE = /^(?:[^{}]|\{(?:name|n|n2|n3)\})*$/;

/** 游戏的名场面模板：合格的才留 */
async function loadMoments(game: string): Promise<Record<string, string>> {
  const raw = (await loadGameFile(game, 'moments.json')) ?? {};
  const out: Record<string, string> = {};
  for (const [id, v] of Object.entries(raw)) {
    const text = (v as { text?: unknown } | null)?.text;
    if (typeof text === 'string' && text && [...text].length <= 40 && TEMPLATE_RE.test(text)) out[id] = text;
  }
  return out;
}

/** 结果标签：赢了几份（金色）、称号（紫色）、名场面（橙色） */
interface Tag {
  kind: 'win' | 'title' | 'moment';
  text: string;
}
/** 一条动态排版要的三段：谁、在哪（游戏和档位）、结果标签 */
interface Line {
  who: string;
  where: string;
  tags: Tag[];
  /** 动态页里标签下面的一行说明：拿到的称号是怎么来的（titles.json 的 desc）；没有就不写 */
  note?: string;
}
type Shown = FeedItem & Line;

/** 拆成三段；不合格（模板没有、缺数字）回 null，那条不显示 */
function lineOf(item: FeedItem, moments: Record<string, string>, titles: TitleCatalog): Line | null {
  const who = item.user.displayName;
  const game = gameName(item.game);
  if (item.kind === 'settle') {
    const { tier = '', units = 0, titles: got = [] } = item.data;
    const names = got.map((t) => titles[t]?.name ?? '神秘称号');
    const tags: Tag[] = [];
    if (units >= 5) tags.push({ kind: 'win', text: `赢了 ${(units / 10).toFixed(1).replace(/\.0$/, '')} 份` });
    if (names.length) tags.push({ kind: 'title', text: `${units >= 5 ? '称号' : '拿到称号'}：${names.join('、')}` });
    const note = got.flatMap((t) => (titles[t]?.desc ? [`${titles[t]!.name}：${titles[t]!.desc}`] : [])).join('；');
    return { who, where: `${game}${TIERS[tier] ?? ''}`, tags, ...(note ? { note } : {}) };
  }
  const tpl = item.data.m ? moments[item.data.m] : undefined;
  if (!tpl) return null;
  const n = item.data.n ?? [];
  let missing = false;
  // 模板多半是"{name}一副牌扔了 {n} 个炸弹"：名字已经单独写在前面，标签里就不重复
  const text = tpl.replace(/^\{name\}/, '').replace(/\{(name|n|n2|n3)\}/g, (_, k: string) => {
    if (k === 'name') return who;
    const v = n[k === 'n' ? 0 : Number(k.slice(1)) - 1];
    if (v === undefined) missing = true;
    return v === undefined ? '' : num(v);
  });
  return missing || !text.trim() ? null : { who, where: game, tags: [{ kind: 'moment', text: text.trim() }] };
}

/** 读动态，顺带把要用的模板和称号名读齐；拼不出来的那条去掉 */
async function fetchFeed(): Promise<Shown[]> {
  const { items: raw } = await api.feed();
  const games = [...new Set(raw.map((i) => i.game))];
  const [moments, titles] = await Promise.all([Promise.all(games.map((g) => loadMoments(g))), Promise.all(games.map((g) => loadTitles(g)))]);
  return raw.flatMap((i) => {
    const k = games.indexOf(i.game);
    const line = lineOf(i, moments[k]!, titles[k]!);
    return line ? [{ ...i, ...line }] : [];
  });
}

/** 顶栏按钮、好友页的入口、动态页同一屏里各要一份：30 秒内共用一次请求；赞了、扔了道具以后重新读 */
let shared: { at: number; p: Promise<Shown[]> } | null = null;
function loadFeed(fresh: boolean): Promise<Shown[]> {
  if (!fresh && shared && Date.now() - shared.at < 30_000) return shared.p;
  const p = fetchFeed();
  shared = { at: Date.now(), p };
  p.catch(() => {
    if (shared?.p === p) shared = null;
  });
  return p;
}

const NONE: Shown[] = [];
const gameOfItem = (i: Shown) => i.game;

function useFeed(): { items: Shown[] | null; error: string; reload: () => void } {
  const [items, setItems] = useState<Shown[] | null>(null);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    loadFeed(tick > 0).then(
      (out) => {
        if (!alive) return;
        setError('');
        setItems(out);
      },
      (e: unknown) => {
        if (!alive) return;
        setError(errorText(e));
        setItems([]);
      },
    );
    return () => {
      alive = false;
    };
  }, [tick]);
  // 隐藏了的游戏的动态不出现（session.tsx）
  const shown = useVisible(items ?? NONE, gameOfItem);
  return { items: items && shown, error, reload: () => setTick((t) => t + 1) };
}

/** "看过"到哪条（本机）：顶栏红点、好友页入口、动态页共用，一处看过别处跟着变 */
const seenSubs = new Set<() => void>();
const readSeen = () => Number(localStorage.getItem(SEEN_KEY) ?? 0);
function markSeen(items: readonly Shown[] | null): void {
  const at = items?.[0]?.at;
  if (!at || at <= readSeen()) return;
  localStorage.setItem(SEEN_KEY, String(at));
  for (const f of seenSubs) f();
}
function useSeen(): number {
  return useSyncExternalStore((cb) => {
    seenSubs.add(cb);
    return () => seenSubs.delete(cb);
  }, readSeen);
}
const freshCount = (items: readonly Shown[] | null, seen: number, me: string) => (items ?? []).filter((i) => i.at > seen && i.user.userId !== me).length;

function ago(at: number): string {
  const m = Math.floor((Date.now() - at) / 60_000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h} 小时前` : `${Math.floor(h / 24)} 天前`;
}

function summary(r: Record<string, number>): string {
  return REACTIONS.filter(([k]) => r[k]).map(([k, name]) => `${name} ${r[k]}`).join(' · ');
}

/**
 * 一条动态。放在 <Paged> 里按高度翻页，所以行高不能自己变：说明默认最多两行，超出了给"展开"，全文在弹窗里看；
 * "扔个道具"也在弹窗里选，不在行里往下展开。
 */
function Row({ item, me, onReacted }: { item: Shown; me: string; onReacted?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [long, setLong] = useState(false);
  const [more, setMore] = useState(false);
  const noteRef = useRef<HTMLSpanElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: note 变了要重新量是否被截断，故意把 item.note 作为触发依赖
  useLayoutEffect(() => {
    const el = noteRef.current;
    if (el) setLong(el.scrollHeight > el.clientHeight + 1);
  }, [item.note]);
  const [picking, setPicking] = useState(false);
  // 点了先显示"你赞了"，不等整份动态重新读回来；失败就撤掉
  const [sent, setSent] = useState<string | null>(null);
  const send = async (kind: string) => {
    setBusy(true);
    setPicking(false);
    setSent(kind);
    try {
      await api.react(item.id, kind);
      onReacted?.();
    } catch {
      // 过期了、对方删了好友：刷新一下列表就好，不另外提示
      setSent(null);
      onReacted?.();
    } finally {
      setBusy(false);
    }
  };
  const mine = item.user.userId === me;
  const counts = summary(item.reactions);
  const cover = GAMES.find((g) => g.id === item.game)?.cover;
  return (
    // biome-ignore lint/a11y/useSemanticElements: 保持现有布局，语义靠 role 给读屏器（外层是 Paged 的 div，换成 li 会不合法）
    <div className="feed__item" role="listitem" data-testid="feed-item">
      <span className="feed__avatar" aria-hidden="true">
        {Array.from(item.who)[0]}
      </span>
      {/* 名字太长只省略名字；数字都在标签里，标签折行不截 */}
      <span className="feed__head">
        <b className="feed__name">{item.who}</b>
        <span className="feed__game">
          {cover && <img className="feed__thumb" src={cover} alt="" width={20} height={20} loading="lazy" decoding="async" />}
          {item.where}
        </span>
        <span className="feed__time">{ago(item.at)}</span>
      </span>
      {item.tags.length > 0 && (
        <span className="feed__tags">
          {item.tags.map((t) => (
            <span key={t.kind} className={`feed__tag feed__tag--${t.kind}`}>
              {t.text}
            </span>
          ))}
        </span>
      )}
      {item.note && (
        <span className="feed__notewrap">
          <span className="feed__note feed__note--fold" ref={noteRef}>
            {item.note}
          </span>
          {long && (
            <button className="btn btn--small feed__more" type="button" onClick={() => setMore(true)}>
              展开
            </button>
          )}
        </span>
      )}
      {(counts || (onReacted && !mine)) && (
        <span className="feed__foot">
          {counts && <span className="feed__meta">{counts}</span>}
          {onReacted && !mine && (
            <span className="row feed__actions">
              {(item.mine ?? sent) ? (
                <span className="note">你{(item.mine ?? sent) === 'like' ? '赞了' : `扔了${REACTION_NAME.get((item.mine ?? sent)!) ?? ''}`}</span>
              ) : (
                <>
                  <button className="btn btn--small" type="button" disabled={busy} onClick={() => void send('like')}>
                    赞
                  </button>
                  <button className="btn btn--small" type="button" disabled={busy} aria-expanded={picking} onClick={() => setPicking(true)}>
                    扔个道具
                  </button>
                </>
              )}
            </span>
          )}
        </span>
      )}
      <Modal open={more} title={`${item.who} · ${item.where}`} onClose={() => setMore(false)} className="modal__box--narrow" testId="feed-note-modal">
        <p className="feed__full">{item.note}</p>
      </Modal>
      <Modal open={picking} title="扔个道具" onClose={() => setPicking(false)} className="modal__box--narrow" testId="feed-props-modal">
        <div className="feed__props">
          {REACTIONS.filter(([k]) => k !== 'like').map(([k, name]) => (
            <button key={k} className="btn" type="button" disabled={busy} onClick={() => void send(k)}>
              {name}
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
}

/** 动态不超过这个数、屏幕又够高时按内容高排；矮屏照旧撑满、按高度翻页（矮屏一次画完会放不下） */
const FEW_ITEMS = 2;
const ROOMY = '(min-height: 700px)';

/**
 * 没有动态时：有好友就叫人去玩一局（打出东西好友才看得到），一个好友都没有就指去加好友（玩再多这里也是空的）。
 * 好友数只在动态为空时问一次 /api/friends；问到之前不放按钮，问不到按有好友处理。
 */
function FeedEmpty({ testId, long = false }: { testId: string; long?: boolean }) {
  const [alone, setAlone] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    api.friends().then(
      (r) => alive && setAlone(r.friends.length === 0),
      () => alive && setAlone(false),
    );
    return () => {
      alive = false;
    };
  }, []);
  const action =
    alone === null ? undefined : alone ? (
      <Link className="btn btn--small btn--primary" href="/friends">
        去加好友
      </Link>
    ) : (
      <Link className="btn btn--small btn--primary" href="/">
        去玩一局
      </Link>
    );
  return (
    <Empty testId={testId} action={action}>
      {alone
        ? `还没有好友，这里就一直是空的。${long ? '加了好友，你们实盘赢了、拿到新称号、打出名场面，都会出现在这里。' : ''}`
        : `最近 7 天你和好友还没有动态。${long ? '实盘赢了、拿到新称号，或者在游戏里打出名场面，好友就能看到。' : ''}`}
    </Empty>
  );
}

/** 动态页的列表：按剩下的高度分页（<Paged>），一页放不下的翻页，不滚；打开就算看过。能赞、扔道具 */
export function FeedList({ me }: { me: string }) {
  const { items, error, reload } = useFeed();
  const roomy = useMedia(ROOMY);
  useEffect(() => markSeen(items), [items]);
  if (!items) return <Skeleton rows={3} />;
  if (error) return <LoadError onRetry={reload}>{error}</LoadError>;
  if (!items.length) return <FeedEmpty testId="feed-empty" long />;
  // 条数很少（一页肯定放得下）时不量高度、全部画出，外框按内容高；多了才按剩下的高度翻页
  const few = roomy && items.length <= FEW_ITEMS;
  return <Paged items={items} keyOf={(i) => i.id} render={(i) => <Row item={i} me={me} onReacted={reload} />} grid fixed={few ? Number.POSITIVE_INFINITY : undefined} className={`feedlist${few ? ' feedlist--few' : ''}`} label="动态翻页" testId="feed" />;
}

/** 有没有没看过的好友动态（顶栏"动态"的红点；和顶栏同一份缓存，不多发请求） */
function useFeedFresh(me: string): boolean {
  const { items } = useFeed();
  return freshCount(items, useSeen(), me) > 0;
}

/**
 * 顶栏的"动态"：有好友的新动态时带红点，点开就算看过。电脑上是挂在按钮下面的浮层（点外面、按 Esc 收起），
 * 手机上是底部半屏面板（点遮罩、把顶上的小横条往下拉收起）。换页也收起。
 */
export function FeedButton({ me }: { me: string }) {
  const { items, reload } = useFeed();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const drag = useRef<number | null>(null);
  const path = useLocation().pathname;
  const fresh = useFeedFresh(me);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 路径变化时收起弹层，path 只是触发条件
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (open) markSeen(items);
  }, [open, items]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onDown = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open]);
  // 往下拉：跟着手指走，拉过 80 就收起，不够就弹回去
  const grab = (e: ReactPointerEvent<HTMLDivElement>) => {
    drag.current = e.clientY;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const pull = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (drag.current === null || !panel.current) return;
    panel.current.style.transform = `translateY(${Math.max(0, e.clientY - drag.current)}px)`;
  };
  const letGo = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (drag.current === null) return;
    const dy = e.clientY - drag.current;
    drag.current = null;
    if (panel.current) panel.current.style.transform = '';
    if (dy > 80) setOpen(false);
  };
  return (
    <span className="feedpop" ref={root}>
      {/* 在动态页时和顶栏别的项一样标成当前页（暖色底） */}
      <button className="account feedpop__btn" type="button" aria-expanded={open} aria-controls="feedpop" aria-current={path === '/feed' ? 'page' : undefined} data-testid="feed-button" onClick={() => setOpen(!open)}>
        <FeedIcon />
        <span className="feedpop__label">动态</span>
        {fresh && <span className="dot" role="img" aria-label="有新动态" data-testid="feed-dot" />}
      </button>
      {open && (
        <>
          <div className="feedpop__mask" aria-hidden="true" onClick={() => setOpen(false)} />
          <div className="feedpop__panel" id="feedpop" role="dialog" aria-label="好友动态" data-testid="feed-pop" ref={panel}>
            <div className="feedpop__grab" aria-hidden="true" onPointerDown={grab} onPointerMove={pull} onPointerUp={letGo} onPointerCancel={letGo} />
            <h2 className="feedpop__title">好友动态</h2>
            <div className="feedpop__list">
              {!items ? (
                <Skeleton rows={3} />
              ) : items.length ? (
                <Paged items={items.slice(0, 8)} keyOf={(i) => i.id} render={(i) => <Row item={i} me={me} onReacted={reload} />} className="feedlist" label="动态翻页" />
              ) : (
                <FeedEmpty testId="feed-pop-empty" />
              )}
            </div>
            <Link className="feedpop__all" href="/feed">
              看全部
            </Link>
          </div>
        </>
      )}
    </span>
  );
}
