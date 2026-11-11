/**
 * 玩法登记表（DESIGN.md 3.4）：id → 玩法。房间和单机按开房选项里的 variant 选；加日麻就在这里加一行。
 */
import { riichi } from './riichi/index.ts';
import { sichuanXuezhan } from './sichuan-xuezhan/index.ts';
import type { Variant, VariantAi } from './types.ts';

/** 登记表的类型：加玩法只改这里和下面的 VARIANTS，状态、动作、视图、选项的联合类型都从它推出来 */
export interface VariantMap {
  'sichuan-xuezhan': typeof sichuanXuezhan;
  riichi: typeof riichi;
}
export type VariantId = keyof VariantMap;

/** 逐个玩法拆出类型（V 是裸类型参数，所以对联合会分发） */
type StateIn<V> = V extends Variant<infer S, infer _A, infer _V, infer _O> ? S : never;
type ActionIn<V> = V extends Variant<infer _S, infer A, infer _V, infer _O> ? A : never;
type ViewIn<V> = V extends Variant<infer _S, infer _A, infer W, infer _O> ? W : never;
type OptsIn<V> = V extends Variant<infer _S, infer _A, infer _V, infer O> ? O : never;

/** 某个玩法（不给就是所有玩法的联合）的状态、动作、视图、规则设置 */
export type StateOf<K extends VariantId = VariantId> = StateIn<VariantMap[K]>;
export type ActionOf<K extends VariantId = VariantId> = ActionIn<VariantMap[K]>;
export type ViewOf<K extends VariantId = VariantId> = ViewIn<VariantMap[K]>;
export type OptsOf<K extends VariantId = VariantId> = OptsIn<VariantMap[K]>;

/**
 * 按运行时的 id 取玩法时用的类型：状态、动作、视图、设置都是各玩法的联合。
 * Variant 的方法用方法写法（参数双变），所以每个具体玩法都能赋给它；
 * 代价是编译器不再核对"这个状态配这个玩法"，由状态里的 variant 字段保证（拿到先看它）。
 * 在具体玩法已知的地方（测试、玩法自己的文件）用 VARIANTS['id'] 拿精确类型
 */
export type AnyVariant = Variant<StateOf, ActionOf, ViewOf, OptsOf> & { id: VariantId };

/** 同上，电脑：按运行时的 id 取（AIS 的各项）时用。decide 的参数双变，各玩法的电脑都能赋给它 */
export type AnyAi = VariantAi<ViewOf, ActionOf>;

export const VARIANTS: Readonly<VariantMap> = {
  'sichuan-xuezhan': sichuanXuezhan,
  riichi,
};

export const DEFAULT_VARIANT: VariantId = 'sichuan-xuezhan';

export function isVariantId(id: unknown): id is VariantId {
  return typeof id === 'string' && Object.hasOwn(VARIANTS, id);
}

export function variantOf(id: unknown): AnyVariant | null {
  return isVariantId(id) ? VARIANTS[id] : null;
}
