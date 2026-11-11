/**
 * 管理页一屏放下用的两个小件（docs/ui.md 第 9、11 节）：
 * - <AdminTabs>：宽屏几栏并排、窄屏顶上一排页签。和 Fit.tsx 的 <PageTabs> 的区别：没选中的栏只是藏起来、不卸载，
 *   所以切页签不会丢掉没保存的表单、也不会重新请求；
 * - <AdminTable>：表格按剩下的高度翻页（行用网格排，数字右对齐；手机上一行一张带标签的卡片）。
 */
import { useState, type CSSProperties, type ReactNode } from 'react';
import { Paged, useMedia } from '../../features/fit/Fit.tsx';

/** 左边有 180px 的分区导航，内容区够两栏才并排 */
export const ADMIN_WIDE = '(min-width: 1100px) and (min-height: 600px)';
export const useAdminWide = () => useMedia(ADMIN_WIDE);

export function AdminTabs({ tabs, label = '切换' }: { tabs: readonly { id: string; name: string; body: ReactNode }[]; label?: string }) {
  const wide = useAdminWide();
  const [on, setOn] = useState(tabs[0]?.id ?? '');
  const cur = tabs.some((t) => t.id === on) ? on : tabs[0]?.id;
  return (
    <div className={`ptabs atabs${wide ? ' ptabs--wide' : ''}`}>
      {!wide && (
        <div className="seg ptabs__bar" role="tablist" aria-label={label}>
          {tabs.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={t.id === cur} className={t.id === cur ? 'seg__on' : undefined} onClick={() => setOn(t.id)} data-testid={`ptab-${t.id}`}>
              {t.name}
            </button>
          ))}
        </div>
      )}
      <div className="ptabs__panes">
        {tabs.map((t) => (
          <div key={t.id} className="ptabs__pane" role={wide ? undefined : 'tabpanel'} hidden={!wide && t.id !== cur}>
            {t.body}
          </div>
        ))}
      </div>
    </div>
  );
}

export interface Col<T> {
  key: string;
  label: string;
  cell: (row: T) => ReactNode;
  /** 数字列：右对齐、等宽数字 */
  num?: boolean;
  /** 正绿负红之类的类名 */
  tone?: (row: T) => string | undefined;
  /** 这一列前面画一道竖线（分组） */
  sep?: boolean;
  /** 独占行尾一整行（列表里的"各游戏"），表头不列 */
  full?: boolean;
  /** 网格列宽，默认平分 */
  w?: string;
}

export function AdminTable<T>({ cols, rows, keyOf, testId, label }: { cols: readonly Col<T>[]; rows: readonly T[]; keyOf: (row: T) => string; testId?: string; label: string }) {
  const head = cols.filter((c) => !c.full);
  const style = { '--cols': head.map((c) => c.w ?? 'minmax(0, 1fr)').join(' ') } as CSSProperties;
  const cls = (c: Col<T>) => `atable__cell${c.num ? ' atable__cell--num' : ''}${c.sep ? ' atable__cell--sep' : ''}${c.full ? ' atable__cell--full' : ''}`;
  return (
    // biome-ignore lint/a11y/useSemanticElements: 保持现有布局，语义靠 role（原生元素自带样式会撑破一屏）
    <div className="atable" role="table" aria-label={label} data-testid={testId} style={style}>
      {/* biome-ignore lint/a11y/useSemanticElements: 保持现有布局，语义靠 role（原生元素自带样式会撑破一屏） */}
      {/* biome-ignore lint/a11y/useFocusableInteractive: 表格行不是可操作控件，不需要焦点 */}
      <div className="atable__head" role="row">
        {head.map((c) => (
          // biome-ignore lint/a11y/useSemanticElements: 保持现有布局，语义靠 role（原生元素自带样式会撑破一屏）
          // biome-ignore lint/a11y/useFocusableInteractive: 列头不是可操作控件，不需要焦点
          <div key={c.key} role="columnheader" className={cls(c)}>
            {c.label}
          </div>
        ))}
      </div>
      <Paged
        items={rows}
        keyOf={keyOf}
        label={`${label}翻页`}
        testId={testId ? `${testId}-pages` : undefined}
        render={(r) => (
          // biome-ignore lint/a11y/useSemanticElements: 保持现有布局，语义靠 role（原生元素自带样式会撑破一屏）
          // biome-ignore lint/a11y/useFocusableInteractive: 表格行不是可操作控件，不需要焦点
          <div className="atable__row" role="row">
            {cols.map((c) => (
              // biome-ignore lint/a11y/useSemanticElements: 保持现有布局，语义靠 role（原生元素自带样式会撑破一屏）
              <div key={c.key} role="cell" data-label={c.label} className={`${cls(c)}${c.tone?.(r) ? ` ${c.tone(r)}` : ''}`}>
                {c.cell(r)}
              </div>
            ))}
          </div>
        )}
      />
    </div>
  );
}
