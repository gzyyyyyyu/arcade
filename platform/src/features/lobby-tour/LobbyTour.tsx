import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import './lobby-tour.css';
import { useSession } from '../../session.tsx';
import { nextStep, placeBubble, shouldShow, TOUR_STEPS, tourKey, type Placement } from './tour-logic.ts';

/**
 * 新人第一次进大厅的三步引导：进入游戏、筹码、好友。每个账号只出一次（localStorage `arcade.tour.<用户 id>` = done，
 * 看完或跳过都记），只给 7 天内注册的新账号看；没登录的访客不渲染，也不发任何请求。
 * 自动化浏览器（navigator.webdriver）默认不弹，免得冒烟里新建的账号被它挡住；`arcade.tour.test` = 1 时照常弹，给引导自己的冒烟用。
 */

const find = (target: string): HTMLElement | null => document.querySelector<HTMLElement>(`[data-tour="${target}"]`);
const present = (target: string): boolean => {
  const el = find(target);
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
};

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function automated(): boolean {
  return navigator.webdriver === true && read('arcade.tour.test') !== '1';
}

interface Spot {
  rect: { left: number; top: number; width: number; height: number };
  place: Placement;
}

export function LobbyTour() {
  const { user } = useSession();
  const [step, setStep] = useState(-1);
  const [spot, setSpot] = useState<Spot | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const height = useRef(170);
  const uid = user?.id;

  // biome-ignore lint/correctness/useExhaustiveDependencies: 只按账号 id 判断一次要不要弹引导：user 对象每次渲染都可能是新的，看完记下后不会再弹
  useEffect(() => {
    if (!user || automated() || !shouldShow(user, Date.now(), read(tourKey(user.id)))) return;
    setStep(nextStep(TOUR_STEPS, -1, present));
    // 只在换账号时判断一次：看完记下以后不会再弹
  }, [uid]);

  const finish = useCallback(() => {
    if (uid) {
      try {
        localStorage.setItem(tourKey(uid), 'done');
      } catch {
        /* 存不了就算了，下次再弹一次 */
      }
    }
    setStep(-1);
    setSpot(null);
  }, [uid]);

  const advance = useCallback(() => {
    const n = nextStep(TOUR_STEPS, step, present);
    if (n < 0) finish();
    else setStep(n);
  }, [step, finish]);

  const measure = useCallback(() => {
    const el = step >= 0 ? find(TOUR_STEPS[step]!.target) : null;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const cs = root.current ? getComputedStyle(root.current) : null;
    const px = (v: string | undefined) => Number.parseFloat(v ?? '') || 0;
    const place = placeBubble(
      r,
      {
        w: document.documentElement.clientWidth,
        h: window.innerHeight,
        inset: { top: px(cs?.paddingTop), right: px(cs?.paddingRight), bottom: px(cs?.paddingBottom), left: px(cs?.paddingLeft) },
      },
      { w: 320, h: height.current },
    );
    setSpot({ rect: { left: r.left, top: r.top, width: r.width, height: r.height }, place });
  }, [step]);

  // 气泡要量完位置才画出来：画出来以后再把焦点放上去（每换一步一次）
  const placed = spot !== null;
  useEffect(() => {
    if (step >= 0 && placed) bubble.current?.focus({ preventScroll: true });
  }, [step, placed]);

  // 换一步：先把目标滚进视野，再量位置；窗口缩放、滚动时重算
  useLayoutEffect(() => {
    if (step < 0) return;
    find(TOUR_STEPS[step]!.target)?.scrollIntoView({ block: 'center', inline: 'nearest' });
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, { capture: true, passive: true });
    window.visualViewport?.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, { capture: true });
      window.visualViewport?.removeEventListener('resize', measure);
    };
  }, [step, measure]);

  // 气泡高度要渲染后才知道：量到和上次不一样就再算一次（相同不再算，不会死循环）
  // biome-ignore lint/correctness/useExhaustiveDependencies: spot 变化要重新量气泡高度，所以故意把 spot 作为触发依赖
  useLayoutEffect(() => {
    const h = bubble.current?.offsetHeight;
    if (h && h !== height.current) {
      height.current = h;
      measure();
    }
  }, [spot, measure]);

  useEffect(() => {
    if (step < 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [step, finish]);

  if (step < 0) return null;
  const last = nextStep(TOUR_STEPS, step, present) < 0;
  const shown = TOUR_STEPS.filter((s) => present(s.target));
  const no = shown.findIndex((s) => s.target === TOUR_STEPS[step]!.target) + 1;
  return (
    <div className="lobby-tour" ref={root} data-testid="lobby-tour">
      <div className="lobby-tour__mask" />
      {spot && (
        <>
          <div
            className="lobby-tour__ring"
            style={{ left: spot.rect.left - 6, top: spot.rect.top - 6, width: spot.rect.width + 12, height: spot.rect.height + 12 }}
          />
          <div
            ref={bubble}
            className={`lobby-tour__bubble lobby-tour__bubble--${spot.place.side}`}
            style={{ left: spot.place.x, top: spot.place.y, width: spot.place.width, ['--ax' as string]: `${spot.place.arrowX}px` }}
            role="dialog"
            aria-modal="false"
            aria-label="新手引导"
            tabIndex={-1}
            data-testid="tour-bubble"
          >
            <p className="lobby-tour__step">
              {no} / {shown.length}
            </p>
            <p className="lobby-tour__text" aria-live="polite">
              {TOUR_STEPS[step]!.text}
            </p>
            <div className="lobby-tour__actions">
              <button type="button" className="btn lobby-tour__skip" onClick={finish} data-testid="tour-skip">
                跳过
              </button>
              <button type="button" className="btn btn--primary" onClick={advance} data-testid="tour-next">
                {last ? '知道了' : '下一步'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
