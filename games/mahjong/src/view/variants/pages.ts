/**
 * 玩法页面钩子的登记表（DESIGN.md 3.6）：玩法 id → VariantPage。页面和流程代码都从这里取，不直接 import 某个玩法的 page.ts。
 * 加新玩法：写 view/variants/<id>/page.ts，在下面加一行。
 */
import { DEFAULT_VARIANT } from '../../core/variants/index.ts';
import type { LadderMode } from '../../game/ladder.ts';
import type { HomeChoice, VariantPage } from './page.ts';
import { riichiPage } from './riichi/page.ts';
import { xuezhanPage } from './sichuan-xuezhan/page.ts';

/** 顺序就是选择项的顺序；第一个必须是默认玩法 */
const PAGES: readonly VariantPage[] = [xuezhanPage, riichiPage];

export const allPages = (): readonly VariantPage[] => PAGES;

export const findPage = (id: unknown): VariantPage | undefined => PAGES.find((p) => p.id === id);

/** 按玩法 id 取；认不得的（存档里以后删了的玩法）按默认玩法 */
export const pageOf = (id: string | undefined): VariantPage => findPage(id) ?? defaultPage();

const defaultPage = (): VariantPage => findPage(DEFAULT_VARIANT)!;

/** 主页切换项 id（含川麻的"血流成河"）→ 它属于哪个玩法、长什么样；认不得的按默认玩法的第一项 */
/** 茶馆擂台的一种打法对应哪个玩法、哪个主页切换项 */
export function ladderChoiceOf(mode: LadderMode): { page: VariantPage; choice: HomeChoice & { ladder: NonNullable<HomeChoice['ladder']> } } {
  for (const page of PAGES) {
    const choice = page.homeChoices.find((c) => c.ladder?.mode === mode);
    if (choice?.ladder) return { page, choice: { ...choice, ladder: choice.ladder } };
  }
  throw new Error(`no ladder mode ${mode}`);
}

export function homeChoiceOf(id: string): { page: VariantPage; choice: HomeChoice } {
  for (const page of PAGES) {
    const choice = page.homeChoices.find((c) => c.id === id);
    if (choice) return { page, choice };
  }
  const page = defaultPage();
  return { page, choice: page.homeChoices[0]! };
}
