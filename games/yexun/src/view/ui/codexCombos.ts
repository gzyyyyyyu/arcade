/**
 * 图鉴「搭配」页（2.0）：合成 / 双修的配方、效果和有没有合过，由图鉴共用的翻页（pager.ts）按可用高度切页，每行是它的一块。
 * 两个视图都按一个角色看（默认当前出战的）：搭配表先列他凑得出的，再压暗列凑不出的和原因（content/combos.ts，和规则核心同一个口径）；
 * 角色池列他的法器池和主修流派（content/pools.ts）。codex.ts 只把点击和渲染转到这里。
 */
import { CHARACTERS, PICK_CHAR_IDS } from '../../content/meta.ts';
import { SCHOOLS, SCHOOL_IDS, type SchoolId } from '../../content/guide.ts';
import { CHARACTER_POOLS, mainSchools, POOL_CHARACTER_IDS, type PoolCharacterId } from '../../content/pools.ts';
import { mergeReach, mergeWho, reachWhy, SHOWN_MERGES } from '../../content/combos.ts';
import { PASSIVES, SCHOOL_SETS, WEAPONS, type MergeDef } from '../../content/weapons.ts';
import type { Records } from '../../meta/records.ts';

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** 怎么合（规则 57 起四个新搭配也一样）：合成两件都进化；双修一件进化、另一件满级；都是之后开宝箱 */
export const mergeHow = (m: { dual?: boolean }): string => (m.dual ? '一件进化、另一件满级，开宝箱' : '两件都进化，开宝箱');

/** 新 4 个角色的名字（角色表那一路还没合进来时用） */
const NEW_NAMES: Record<string, string> = { zhijiang: '纸匠', baidu: '摆渡人', huolang: '货郎', yinyang: '阴阳先生' };
export const poolCharName = (id: PoolCharacterId): string => (id in CHARACTERS ? CHARACTERS[id as keyof typeof CHARACTERS].name : (NEW_NAMES[id] ?? id));

/** 选角能选的角色（摆渡人已收起，不列进角色池） */
const PICKABLE = POOL_CHARACTER_IDS.filter((id) => (PICK_CHAR_IDS as readonly string[]).includes(id));
export interface CombosState {
  view: 'merge' | 'pool';
  char: PoolCharacterId;
}
export const newCombosState = (): CombosState => ({ view: 'merge', char: 'xiaodao' });

/** 打开图鉴时跟上当前出战的角色（收起的角色不在选角里，按小道士） */
export function combosFor(st: CombosState, c: string): void {
  st.char = (PICKABLE as readonly string[]).includes(c) ? (c as PoolCharacterId) : 'xiaodao';
}

/** 谁能合：能选的角色全都凑得出写「人人能合」，否则列名字（专属也是这样列出来的） */
export function whoText(m: MergeDef): string {
  const who = mergeWho(m);
  return who.length === PICKABLE.length ? '人人能合' : `${who.map(poolCharName).join('、')}能合`;
}

/** 点击：data-a 是 cview / cchar；返回要不要重画 */
export function combosClick(st: CombosState, a: string | undefined, v: string | undefined): boolean {
  if (a === 'cview') st.view = v === 'pool' ? 'pool' : 'merge';
  else if (a === 'cchar' && v && (PICKABLE as readonly string[]).includes(v)) st.char = v as PoolCharacterId;
  else return false;
  return true;
}

export function renderCombos(st: CombosState, icons: (k: string) => string, rec: Records): string {
  const views = (['merge', 'pool'] as const)
    .map((v) => `<button type="button" class="yx-cc-chip${st.view === v ? ' on' : ''}" data-a="cview" data-v="${v}">${v === 'merge' ? '搭配表' : '角色池'}</button>`)
    .join('');
  const chars = PICKABLE.map((id) => `<button type="button" class="yx-cc-chip${st.char === id ? ' on' : ''}" data-a="cchar" data-v="${id}">${esc(poolCharName(id))}</button>`).join('');
  return `<div class="yx-cc"><div class="yx-cc-views">${views}</div><div class="yx-cc-chars">${chars}</div>${st.view === 'merge' ? merges(st, icons, rec) : pool(st, icons)}</div>`;
}

/** 搭配表：这个角色凑得出的在前（正常色），凑不出的在后（压暗，写原因）；收起角色的专属搭配不列 */
function merges(st: CombosState, icons: (k: string) => string, rec: Records): string {
  const row = (m: MergeDef): string => {
    const done = rec.merges.includes(m.id);
    const ok = mergeReach(m, st.char) === 'ok';
    const tag = ok ? whoText(m) : `${esc(poolCharName(st.char))}凑不出：${reachWhy(m, st.char)}`;
    return (
      `<div class="yx-cc-row${done ? ' done' : ''}${ok ? '' : ' no'}" style="--mc:${m.color}"><img alt="" src="${icons(done ? m.icon : WEAPONS[m.a].icon)}">` +
      `<div><b>${esc(m.name)}</b><span>${m.dual ? '双修' : '合成'} · ${esc(tag)}${done ? ' · 合成过' : ''}</span>` +
      `<p>${esc(WEAPONS[m.a].name)} + ${esc(WEAPONS[m.b].name)}：${esc(m.desc)}</p><p class="how">怎么合：${mergeHow(m)}</p></div></div>`
    );
  };
  const yes = SHOWN_MERGES.filter((m) => mergeReach(m, st.char) === 'ok');
  const no = SHOWN_MERGES.filter((m) => mergeReach(m, st.char) !== 'ok');
  return (
    `<p class="yx-cc-line">${esc(poolCharName(st.char))}凑得出 ${yes.length} 个（共 ${SHOWN_MERGES.length} 个，合成过 ${SHOWN_MERGES.filter((m) => rec.merges.includes(m.id)).length}）</p><div class="yx-cc-list">${yes.map(row).join('')}</div>` +
    (no.length ? `<p class="yx-cc-line">凑不出的 ${no.length} 个</p><div class="yx-cc-list">${no.map(row).join('')}</div>` : '')
  );
}

function pool(st: CombosState, icons: (k: string) => string): string {
  const p = CHARACTER_POOLS[st.char];
  const schools = p.schools.map((s) => `<b>${esc(SCHOOLS[s].name)}</b>`).join('、');
  const sets = p.schools.filter((s) => s in SCHOOL_SETS).map((s) => `${SCHOOLS[s].name}套件：${SCHOOL_SETS[s as keyof typeof SCHOOL_SETS].join('；')}`);
  // 每格写清所属流派和一句作用：角色池页原先只有图标加名字，下面空四成；信息放进格子里，由共用翻页按高度切页
  const schoolsOf = (w: string): string => {
    const hit = SCHOOL_IDS.filter((s) => SCHOOLS[s].weapons.includes(w as never)).map((s) => SCHOOLS[s].name);
    return hit.length ? hit.join('·') : '散件';
  };
  const grid = p.weapons
    .map((id) => `<div class="yx-cc-w${p.schools.some((s) => SCHOOLS[s].weapons.includes(id)) ? ' main' : ''}"><img alt="" src="${icons(WEAPONS[id].icon)}"><div><b>${esc(WEAPONS[id].name)}</b><i>${esc(schoolsOf(id))}</i><p>${esc(WEAPONS[id].desc)}</p></div></div>`)
    .join('');
  const passives = p.passives.map((id) => esc(PASSIVES[id].name)).join('、');
  return (
    `<p class="yx-cc-line">主修流派：${schools}；能抽到 ${p.weapons.length} 件法器（带边的是主修成套件）</p>` +
    `<div class="yx-cc-grid">${grid}</div><p class="yx-cc-line">被动：${passives}</p>` +
    (sets.length ? `<p class="yx-cc-line">${esc(sets.join(' ／ '))}</p>` : '')
  );
}

/**
 * 玩法说明「例子」里一个流派推荐的搭配（最多两个）：两件料都在流派单子上，或者是双修、有一件是单子的前三件；
 * 只推荐主修这个流派的角色里有人凑得出的（不然推荐的东西没人合得出来）
 */
export function schoolMerges(id: SchoolId): MergeDef[] {
  const s = SCHOOLS[id];
  const core = s.weapons.slice(0, 3);
  const mains = PICKABLE.filter((c) => mainSchools(c).includes(id));
  return SHOWN_MERGES.filter(
    (m) => ((s.weapons.includes(m.a) && s.weapons.includes(m.b)) || (m.dual && (core.includes(m.a) || core.includes(m.b)))) && mains.some((c) => mergeReach(m, c) === 'ok'),
  ).slice(0, 2);
}
