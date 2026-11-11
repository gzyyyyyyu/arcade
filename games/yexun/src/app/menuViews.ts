import { CHARACTERS, PICK_CHAR_IDS, type CharacterId } from '../content/meta.ts';
import { LIVE_OPEN } from '../content/live.ts';
import { MAP_IDS, type MapId } from '../content/maps.ts';
import { SCHOOLS } from '../content/guide.ts';
import { altStart, mainSchools } from '../content/pools.ts';
import { WEAPONS } from '../content/weapons.ts';
import { TREASURES } from '../content/treasures.ts';
import { vaultProgress } from '../explore/vault.ts';
import { CHAR_PRICE, charOpen, charProgress, coins, dangerOpen, mapOpen, type loadSave } from '../platform/save.ts';
import { hasLoginHint } from '../platform/cloud.ts';
import type { createLive } from '../platform/live.ts';
import { heroKey } from '../view/art/heroes.ts';
import type { PrepState } from '../view/ui/prep.ts';

/** 角色页和主页要的状态：都是存档（和实盘能不能开）算出来的快照，每次打开现算 */
export function createMenuViews(save: ReturnType<typeof loadSave>, live: ReturnType<typeof createLive>, icon: (key: string, px?: number) => string) {
  const prepState = (): PrepState => ({
    coins: coins(save),
    character: save.character,
    chars: Object.fromEntries(PICK_CHAR_IDS.map((c) => [c, { open: charOpen(save, c), price: CHAR_PRICE[c], progress: charProgress(save, c) }])) as PrepState['chars'],
    curses: save.curses,
    cursesOpen: save.cleared >= 0,
    perks: save.perks,
  });
  /** 当前角色能选的起手和心法（起手：原起手 / 第二件；心法：不带 / 两个主修流派） */
  const loadoutView = (c: CharacterId) => {
    const l = save.loadout[c];
    const w = (id: keyof typeof WEAPONS) => ({ icon: icon(WEAPONS[id].icon, 40), name: WEAPONS[id].name });
    return { alt: !!l?.alt, starts: [w(CHARACTERS[c].start), w(altStart(c))], xinfa: l?.xinfa ?? null, schools: mainSchools(c).map((id) => ({ id, name: SCHOOLS[id].name })) };
  };
  const menuState = () => ({
    raidFirst: !save.raidDone,
    vault: { got: vaultProgress(save.vault).got, total: TREASURES.length },
    danger: save.danger,
    dangerOpen: dangerOpen(save),
    best: save.bestD,
    map: save.map,
    maps: Object.fromEntries(MAP_IDS.map((m) => [m, mapOpen(save, m)])) as Record<MapId, boolean>,
    coins: coins(save),
    character: charOpen(save, save.character) ? save.character : ('xiaodao' as CharacterId),
    charFace: icon(heroKey(charOpen(save, save.character) ? save.character : 'xiaodao'), 64),
    loadout: loadoutView(charOpen(save, save.character) ? save.character : 'xiaodao'),
    curses: save.cleared >= 0 ? save.curses : [],
    cursesOpen: save.cleared >= 0,
    lastMode: save.lastMode,
    raidTpl: save.raidTpl,
    mobIcon: icon,
    // 有平台登录、收到过 501（单独部署）就藏起来
    live: {
      available: LIVE_OPEN && hasLoginHint() && !live.unavailable,
      on: save.liveOn,
      tier: save.liveTier,
      offWhy: !LIVE_OPEN ? '实盘暂停开放' : !hasLoginHint() ? '没登录' : live.unavailable ? '这里没有钱包' : undefined,
    },
  });
  return { prepState, menuState };
}
