import { WEAPONS, type WeaponId } from '../content/weapons.ts';
import { RUSH } from '../content/rush.ts';
import { rushSkipToFinal } from '../core/foes/index.ts';
import { rushEnterMap, step, type World } from '../core/index.ts';
import { grantWeapon, openEliteChestNow } from '../core/debug.ts';
import { TREASURES_BY_TIER } from '../content/treasures.ts';
import type { Raid } from '../explore/raid.ts';
import type { RunTally } from '../meta/records.ts';

export type Autopilot = (w: World) => { dir: number; choice: number };

/**
 * 开发服务器里的调试开局参数（截图、机器人代打用，线上构建整段被摘掉）：
 * ?give 换开局法器、?auto 机器人代打、?warp 快进到某一拍、?at 挪主角、夜探 ?loot / ?chest、连战 ?rushfinal 直接打夜漏君。返回代打函数（没开 auto 就是 undefined）
 */
export async function applyDebugStart(q: URLSearchParams, w: World, tally: RunTally, seed: number): Promise<Autopilot | undefined> {
  let autopilot: Autopilot | undefined;
  if (import.meta.env.DEV && q.has('rushfinal') && w.rush) {
    // ?rush&rushfinal：选第 1 条路、离开驿站，换到终局图直接上夜漏君（截终局画面用）
    step(w, 0, 500);
    if (w.phase === 'choose') step(w, 0, 700);
    rushEnterMap(w, w.rush.finalMap);
    rushSkipToFinal(w, RUSH.stages);
  }
  if (import.meta.env.DEV && q.has('give')) {
    // ?give=mirror:8,gourd:8e：开局换成这几件法器（等级后面带 e 是直接进化），再加 &merge 当场开宝箱合成
    w.weapons.length = 0;
    w.wstats.length = 0;
    for (const part of q.get('give')!.split(',')) {
      const [id, lv = '1'] = part.split(':');
      if (id && id in WEAPONS) grantWeapon(w, id as WeaponId, parseInt(lv, 10), lv.endsWith('e'));
    }
    // &merge=late：第 28 拍才开宝箱（带合成演出，截图看横幅用；late:90 指定第几拍）；平时 &merge 开局就合成
    // 走捡到宝箱的那条路（规则 63 的初成、大成只在这条路上结）
    if (q.has('merge') && !q.get('merge')?.startsWith('late')) openEliteChestNow(w, 0);
  }
  if (import.meta.env.DEV && (q.has('auto') || q.has('warp'))) {
    const { Bot } = await import('../../tools/bots.ts');
    const bot = new Bot('normal', 'sword', seed);
    if (q.has('auto')) autopilot = (x) => bot.act(x);
    // ?warp=拍数：开局前让机器人在后台先打到这一拍（截中后期的画面）；不带 auto 就从那里交给玩家，
    // 再加 &choose 停在之后第一次升级的选卡上（截卡片）
    const warp = Number(q.get('warp') ?? 0);
    const stopAtCards = q.has('choose');
    while (w.phase !== 'over') {
      if (w.tick >= warp && (!stopAtCards || w.phase === 'choose')) break;
      const a = bot.act(w);
      step(w, a.dir, w.phase === 'choose' ? a.choice : -1);
      tally.feed(w);
    }
    // &at=x,y：把主角挪到这个位置（截河边、冰边、竹林用）
    const at = q.get('at')?.split(',').map(Number);
    if (at && at.length === 2 && at.every(Number.isFinite)) {
      w.x = w.px = at[0]!;
      w.y = w.py = at[1]!;
    }
  }
  // 夜探截图用：&loot=3 往背包塞几件绝品（看宝气光圈和横幅），&chest 再给一次宝箱升级（看「宝箱 · 挑一件」）
  if (import.meta.env.DEV && w.raid && (q.has('loot') || q.has('chest'))) {
    const raid = w.raid as unknown as Raid;
    for (let i = Number(q.get('loot') ?? 0); i > 0; i--) raid.addLoot(TREASURES_BY_TIER.jue[0]!);
    if (q.has('chest')) raid.upgrades++;
  }
  return autopilot;
}

/** &merge=late[:拍数]：到那一拍当场开宝箱合成（默认第 28 拍），每拍之后调 */
export function lateMerge(q: URLSearchParams, w: World): void {
  if (q.get('merge')?.startsWith('late') && w.tick === (Number(q.get('merge')!.slice(5)) || 28)) openEliteChestNow(w, 0);
}
