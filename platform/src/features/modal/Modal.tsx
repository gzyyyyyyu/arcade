/**
 * 全站统一的弹窗（docs/ui.md 第 5 节）：所有弹窗都经过它，不各处手拼遮罩。
 * 进场 160ms 淡入上移，退场 120ms；Esc、点遮罩、右上角 ✕ 都能关；打开时焦点进弹窗、Tab 不跑出去、
 * 关掉后焦点回到触发处；同一时间只开一个（新的打开时旧的先关）。
 * 用法：<Modal open={open} title="标题" onClose={...}>内容</Modal>。open 变 false 后会先播完退场再卸载内容。
 * 必须做决定的弹窗传 dismissible={false}：不能点遮罩、不能 Esc 关，调用方自己放按钮。
 */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { closeInStack, isTop, nextFocusIndex, openInStack } from './modal-logic.ts';
import './modal.css';

const ENTER_MS = 160;
const EXIT_MS = 120;
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

let stack: string[] = [];
const closers = new Map<string, () => void>();

function noMotion(): boolean {
  return document.documentElement.classList.contains('no-motion') || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function Modal({
  open,
  title,
  onClose,
  children,
  testId,
  className,
  dismissible = true,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  testId?: string;
  /** 加在弹窗框上，用来改宽度 */
  className?: string;
  dismissible?: boolean;
}) {
  const id = useId();
  const titleId = `${id}-title`;
  const box = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const dismissRef = useRef(dismissible);
  dismissRef.current = dismissible;

  // 打开：挂上、进栈；关闭：播退场再卸载
  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
      return;
    }
    if (!mounted) return;
    if (noMotion()) {
      setMounted(false);
      return;
    }
    setClosing(true);
    const t = setTimeout(() => {
      setMounted(false);
      setClosing(false);
    }, EXIT_MS);
    return () => clearTimeout(t);
  }, [open, mounted]);

  // 开着期间：登记到栈（挤掉别的弹窗）、管焦点和键盘
  useEffect(() => {
    if (!open || !mounted) return;
    const next = openInStack(stack, id);
    stack = next.stack;
    for (const other of next.toClose) closers.get(other)?.();
    closers.set(id, () => closeRef.current());

    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const el = box.current;
    if (el && !el.contains(document.activeElement)) {
      (el.querySelector<HTMLElement>('[data-autofocus]') ?? el.querySelector<HTMLElement>(FOCUSABLE) ?? el).focus({ preventScroll: true });
    }

    // 捕获阶段拦 Esc：弹窗开着时它只关弹窗，不再往下传给大厅的"Esc 回首页"等
    const onKey = (e: KeyboardEvent) => {
      if (!isTop(stack, id) || !box.current) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        if (dismissRef.current) closeRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const list = [...box.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => n.offsetParent !== null);
      const to = nextFocusIndex(list.length, list.indexOf(document.activeElement as HTMLElement), e.shiftKey);
      e.preventDefault();
      (to === null ? box.current : list[to]!).focus();
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      stack = closeInStack(stack, id);
      closers.delete(id);
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, [open, mounted, id]);

  if (!mounted) return null;
  const state = closing || !open ? 'closing' : 'open';
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: 点遮罩关闭只是鼠标/触屏的便利，键盘用 Esc（上面已监听），遮罩不需要可聚焦
    // biome-ignore lint/a11y/useKeyWithClickEvents: 同上，键盘关闭走 Esc
    <div
      className="modal"
      data-state={state}
      style={{ ['--modal-in' as string]: `${ENTER_MS}ms`, ['--modal-out' as string]: `${EXIT_MS}ms` }}
      onClick={(e) => e.target === e.currentTarget && dismissible && onClose()}
    >
      <div className={`modal__box${className ? ` ${className}` : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} ref={box} data-testid={testId}>
        <div className="modal__head">
          <h2 id={titleId}>{title}</h2>
          <button className="modal__close" type="button" aria-label="关闭" onClick={onClose}>
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
