import { useEffect, useRef, useState } from 'react';
import { actionFor, HOTKEY_HELP } from './hotkeys.ts';
import { Modal } from '../modal/Modal.tsx';
import './hotkeys.css';

/** 只有鼠标加键盘的设备才启用；触屏手机没有实体键盘，装了也是白占监听 */
const FINE_POINTER = '(hover: hover) and (pointer: fine)';

interface UseHotkeysOptions {
  /** 大厅里可玩游戏的地址，按显示顺序；按键时才取，保证拿到最新列表 */
  gameUrls: () => string[];
  navigate: (path: string) => void;
  /** Escape 时的额外处理（帮助面板自己会先关） */
  onEscape: () => void;
  enabled: boolean;
}

/** 在 document 上挂快捷键；返回帮助面板的开关状态，交给 <HotkeyHelp> 用 */
export function useHotkeys(opts: UseHotkeysOptions): { helpOpen: boolean; closeHelp: () => void } {
  const [helpOpen, setHelpOpen] = useState(false);
  // 回调放进 ref，监听器只挂一次，不用每次渲染重挂
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const helpRef = useRef(helpOpen);
  helpRef.current = helpOpen;
  const { enabled } = opts;

  useEffect(() => {
    if (!enabled || !window.matchMedia(FINE_POINTER).matches) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target instanceof HTMLElement ? e.target : null;
      const action = actionFor(e, { tag: el?.tagName ?? '', editable: !!el?.isContentEditable });
      if (!action) return;
      const o = optsRef.current;
      switch (action.kind) {
        case 'game': {
          const url = o.gameUrls()[action.index];
          if (url) location.assign(url);
          break;
        }
        case 'go':
          o.navigate(action.path);
          break;
        case 'help':
          setHelpOpen((v) => !v);
          break;
        case 'escape':
          if (helpRef.current) setHelpOpen(false);
          else o.onEscape();
          break;
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [enabled]);

  return { helpOpen, closeHelp: () => setHelpOpen(false) };
}

/** 快捷键说明小弹窗：遮罩、Esc、✕、焦点都由 Modal 管 */
export function HotkeyHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} title="快捷键" onClose={onClose} className="modal__box--narrow">
      <dl className="hotkeys-list">
        {HOTKEY_HELP.map((h) => (
          <div key={h.keys} style={{ display: 'contents' }}>
            <dt>{h.keys}</dt>
            <dd>{h.what}</dd>
          </div>
        ))}
      </dl>
    </Modal>
  );
}
