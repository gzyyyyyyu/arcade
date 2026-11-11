/**
 * 图鉴「搭配」页（2.0）：24 个合成 / 双修的配方、效果和有没有合过，由图鉴共用的翻页（pager.ts）按可用高度切页，每行是它的一块；
 * 另一个视图按角色看法器池和主修流派（content/pools.ts）。codex.ts 只把点击和渲染转到这里。
 */
import { CHARACTERS, PICK_CHAR_IDS } from '../../content/meta.ts';
import { SCHOOLS, SCHOOL_IDS } from '../../content/guide.ts';
import { CHARACTER_POOLS, POOL_CHARACTER_IDS, type PoolCharacterId } from '../../content/pools.ts';
import { MERGES, PASSIVES, SCHOOL_SETS, WEAPONS } from '../../content/weapons.ts';
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
  const tally = st.view === 'merge' ? `<em>共 ${MERGES.length} 个，合成过 ${rec.merges.length}</em>` : '';
  return `<div class="yx-cc"><div class="yx-cc-views">${views}${tally}</div>${st.view === 'merge' ? merges(icons, rec) : pool(st, icons)}</div>`;
}

function merges(icons: (k: string) => string, rec: Records): string {
  const rows = MERGES.map((m) => {
    const done = rec.merges.includes(m.id);
    const who = m.only ? `${m.only.split(',').map((c) => poolCharName(c as PoolCharacterId)).join('、')}专属` : '人人能合';
    return (
      `<div class="yx-cc-row${done ? ' done' : ''}" style="--mc:${m.color}"><img alt="" src="${icons(done ? m.icon : WEAPONS[m.a].icon)}">` +
      `<div><b>${esc(m.name)}</b><span>${m.dual ? '双修' : '合成'} · ${who}${done ? ' · 合成过' : ''}</span>` +
      `<p>${esc(WEAPONS[m.a].name)} + ${esc(WEAPONS[m.b].name)}：${esc(m.desc)}</p><p class="how">怎么合：${mergeHow(m)}</p></div></div>`
    );
  }).join('');
  return `<div class="yx-cc-list">${rows}</div>`;
}

function pool(st: CombosState, icons: (k: string) => string): string {
  const chars = PICKABLE.map((id) => `<button type="button" class="yx-cc-chip${st.char === id ? ' on' : ''}" data-a="cchar" data-v="${id}">${esc(poolCharName(id))}</button>`).join('');
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
    `<div class="yx-cc-chars">${chars}</div>` +
    `<p class="yx-cc-line">主修流派：${schools}；能抽到 ${p.weapons.length} 件法器（带边的是主修成套件）</p>` +
    `<div class="yx-cc-grid">${grid}</div><p class="yx-cc-line">被动：${passives}</p>` +
    (sets.length ? `<p class="yx-cc-line">${esc(sets.join(' ／ '))}</p>` : '')
  );
}

/** 选角卡上的一行："主修 剑修·五雷 · 能抽到 13 件法器"（prep.ts 只调这个函数） */
export function poolSummary(id: PoolCharacterId): string {
  const p = CHARACTER_POOLS[id];
  return `主修 ${p.schools.map((s) => SCHOOLS[s].name).join('·')} · 能抽到 ${p.weapons.length} 件法器`;
}
