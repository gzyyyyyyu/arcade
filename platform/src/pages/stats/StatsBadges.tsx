/** 战绩页总览里的徽章墙：按高度翻页（Fit.tsx 的 Paged 网格），点一枚在下面一行看怎么拿 */
import { useEffect, useRef, useState } from 'react';
import { newlyEarned, readSeen, writeSeen } from '../../features/badges/badge-seen.ts';
import type { StatsResponse } from '../../api.ts';
import { GAMES } from '../../../shared/games.ts';
import { Paged } from '../../features/fit/Fit.tsx';
import { playSuccess } from '../../lib/sound.ts';
import { badgesOf, TIER_NAMES, type Badge } from '../../features/badges/badges.ts';
import { BadgeGlyph } from '../../icons.tsx';
import '../../features/badges/badges.css';

/** 离下一档走了多远（0 到 1）；满档或没有数可比是 null，只写字 */
function ratio(b: Badge): number | null {
  const next = b.tiers[b.tier];
  if (next === undefined || !Number.isFinite(b.value)) return null;
  const from = b.tier > 0 ? b.tiers[b.tier - 1]! : 0;
  return next > from ? Math.min(1, Math.max(0, (b.value - from) / (next - from))) : null;
}

const label = (b: Badge) => (b.tier > 0 ? `${TIER_NAMES[b.tier - 1]}牌` : b.progress);

/** 街机厅徽章（从战绩现算，不存）：拿到的带铜银金环，没拿到的灰着写还差多少；点一个看怎么拿 */
export function BadgeWall({ games, selfId }: { games: StatsResponse['games']; selfId?: string }) {
  const badges = badgesOf(games, GAMES);
  const [open, setOpen] = useState<string | null>(null);
  const [fx, setFx] = useState<string[]>([]);
  const grid = useRef<HTMLDivElement>(null);
  const sig = badges.map((b) => `${b.id}:${b.tier}`).join(',');
  // 只在自己的战绩页演：新拿到/升档的奖章亮相一次。第一次打开（没记录）只记不演，免得老用户一进来全翻一遍。
  // 动画关着（系统减弱动效或站内 no-motion）时连声音震动一起省，但记录照写，免得之后关掉动画又补演。
  // 等第一枚新徽章真的出现在屏幕上再演、演了才记，不然动画在屏幕外播完，人什么也没看到；
  // 它翻到后面一页（翻页后不在 DOM 里）就直接演，不让人白等
  // biome-ignore lint/correctness/useExhaustiveDependencies: sig 已涵盖 badges 的变化（徽章 id 与档位），badges 每次渲染都是新数组
  useEffect(() => {
    if (!selfId) return;
    const now = Object.fromEntries(badges.map((b) => [b.id, b.tier]));
    const prev = readSeen(selfId);
    const fresh = prev ? newlyEarned(prev, now) : [];
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('no-motion');
    if (!fresh.length || still) {
      writeSeen(selfId, now);
      return;
    }
    const play = () => {
      writeSeen(selfId, now);
      setFx(fresh);
      playSuccess();
      navigator.vibrate?.(30);
    };
    const first = grid.current?.querySelector(`[data-testid="badge-${fresh[0]}"]`);
    if (!first || typeof IntersectionObserver !== 'function') return play();
    const io = new IntersectionObserver((es) => {
      if (!es.some((e) => e.isIntersecting)) return;
      io.disconnect();
      play();
    }, { threshold: 0.8 });
    io.observe(first);
    return () => io.disconnect();
  }, [selfId, sig]);
  const cur = badges.find((b) => b.id === open) ?? null;
  return (
    <div className="badges stats-badges" data-testid="badges">
      <div className="stats-badges__grid" ref={grid}>
        <Paged
          grid
          uneven
          items={badges}
          keyOf={(b) => b.id}
          label="徽章翻页"
          testId="badges-paged"
          render={(b) => (
            <button
              type="button"
              className={`badge${b.tier > 0 ? '' : ' badge--locked'}${fx.includes(b.id) ? ' badge--fx' : ''}`}
              data-testid={`badge-${b.id}`}
              data-tier={b.tier}
              aria-pressed={open === b.id}
              title={b.how}
              onClick={() => setOpen(open === b.id ? null : b.id)}
            >
              <span className="badge__disc">
                <BadgeGlyph name={b.glyph} />
              </span>
              <span className="badge__name">{b.name}</span>
              <span className="badge__tier">{b.tier > 0 && b.tier < b.max ? `${label(b)} · ${b.progress}` : label(b)}</span>
              {ratio(b) !== null && (
                <span className="badge__bar" role="progressbar" aria-label="离下一档" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(ratio(b)! * 100)}>
                  <span className="badge__fill" style={{ width: `${Math.round(ratio(b)! * 100)}%` }} />
                </span>
              )}
            </button>
          )}
        />
      </div>
      <p className="badges__tip" aria-live="polite" data-testid="badge-tip">
        {cur ? (
          <>
            <strong>{cur.name}</strong>
            {cur.how}
          </>
        ) : (
          '点一枚徽章，看怎么拿。'
        )}
      </p>
    </div>
  );
}
