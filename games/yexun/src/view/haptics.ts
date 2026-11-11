// 手机震动反馈：跟着设置里的「震屏」开关，只在触屏设备、页面可见时震。
// iOS Safari 没有 navigator.vibrate，缺 API 时安静跳过；封装成可注入的工厂，节流好单测。

export type Pattern = number | number[];

export interface HapticsEnv {
  /** 没有 vibrate（iOS、桌面部分浏览器）时为 undefined */
  vibrate?: (p: Pattern) => boolean;
  now: () => number;
  /** 触屏设备且页面可见 */
  active: () => boolean;
  /** 设置里的震屏开关 */
  enabled: () => boolean;
}

/** 挨打震得太勤等于一直抖，至少隔这么久才再震 */
export const HURT_GAP_MS = 400;

export interface Haptics {
  hurt(): void;
  alert(): void;
  big(): void;
  down(): void;
}

export function createHaptics(env: HapticsEnv): Haptics {
  let lastHurt = -Infinity;
  const fire = (p: Pattern): void => {
    if (!env.vibrate || !env.enabled() || !env.active()) return;
    try {
      env.vibrate(p);
    } catch {
      /* 个别浏览器会因权限或策略抛错，震动只是锦上添花 */
    }
  };
  return {
    hurt() {
      const t = env.now();
      if (t - lastHurt < HURT_GAP_MS) return;
      lastHurt = t;
      fire(20);
    },
    alert: () => fire([40, 60, 40]),
    big: () => fire(60),
    down: () => fire(120),
  };
}

/** 浏览器里的真实环境；enabled 由调用方给（读设置） */
export function browserHaptics(enabled: () => boolean): Haptics {
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  const touch = (): boolean =>
    typeof window !== 'undefined' && ('ontouchstart' in window || (window.matchMedia?.('(pointer: coarse)').matches ?? false));
  return createHaptics({
    vibrate: nav && typeof nav.vibrate === 'function' ? (p) => nav.vibrate(p) : undefined,
    now: () => performance.now(),
    active: () => touch() && typeof document !== 'undefined' && document.visibilityState === 'visible',
    enabled,
  });
}
