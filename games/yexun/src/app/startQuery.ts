import { CHARACTER_IDS, CHARACTERS, type CharacterId } from '../content/meta.ts';
import { MAP_IDS, type MapId } from '../content/maps.ts';
import type { Danger } from '../content/waves.ts';
import type { loadSave } from '../platform/save.ts';

/**
 * 启动时的查询参数（冒烟截图、机器人代打用）：?danger 难度、?map 地图；
 * 开发服务器里 ?char 还会把存档在内存里改成"都解锁、出战这个角色"。返回的难度、地图没带就是 null
 */
export function readStartQuery(q: URLSearchParams, save: ReturnType<typeof loadSave>): { danger: Danger | null; map: MapId | null } {
  // 调试参数直接开局（冒烟截图、机器人代打）：?danger=0–8 指定危险档
  const dq = q.get('danger');
  const danger: Danger | null = dq && /^[0-8]$/.test(dq) ? (Number(dq) as Danger) : null;
  // ?map=yizhuang 指定地图（冒烟截图用）
  const map: MapId | null = q.has('map') ? ((MAP_IDS as readonly string[]).includes(q.get('map') ?? '') ? (q.get('map') as MapId) : 'snow') : null;
  // ?char=pang 出战指定角色（只在开发服务器里有，截图用；会在内存里当作都解锁了）；?prep 直接打开角色页
  const qc = q.get('char');
  if (import.meta.env.DEV && qc && qc in CHARACTERS) {
    save.character = qc as CharacterId;
    save.bought = [...CHARACTER_IDS];
    save.maxSeconds = Math.max(save.maxSeconds, 9999);
    save.extracts = Math.max(save.extracts, 1);
    save.marketBuys = Math.max(save.marketBuys, 99);
  }
  return { danger, map };
}
