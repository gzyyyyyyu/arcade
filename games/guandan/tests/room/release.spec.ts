/**
 * 开房名额什么时候还（每人同时 1 个房间，0.38.0）：好友房打完一整场、停着等"再来一场"的那 3 分钟里，开房的人的名额已经还了，
 * 这时回大厅开新房、点"再来一场"开新房间都不会被 has_room 挡回旧房间。看的是真的计量（RoomMeter）里这个人那一行。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { runInDurableObject } from 'cloudflare:test';
import { freezeClock } from './helpers.ts';
import { Table } from './table.ts';

/** 计量里这个人还占着的房间码（到点作废的不算） */
function liveRooms(userId: string): Promise<string[]> {
  const ns = env.METER as DurableObjectNamespace;
  return runInDurableObject(ns.get(ns.idFromName('kit-meter')), async (_m, state) => {
    const raw = state.storage.sql.exec<{ v: string }>('SELECT v FROM kit_user WHERE id = ?', userId).toArray()[0];
    if (!raw) return [];
    const row = JSON.parse(raw.v) as { live: { code: string; until: number }[] };
    return row.live.filter((r) => r.until > Date.now()).map((r) => r.code);
  });
}

let table: Table | null = null;
afterEach(() => table?.close());

describe('开房名额', () => {
  it.each([1, 4] as const)('%i 个真人的好友房：打完停着等再来一场时，房主的名额已经还了', async (humans) => {
    freezeClock();
    table = new Table({ humans, tag: `rel${humans}`, again: true });
    await table.open();
    expect(await liveRooms(table.user(0))).toEqual([table.code]);
    // 打到整场结束、停着等"再来一场"（again: true 的 Table 走到这里点再来一场，这里先停）
    while (table.t?.row?.status === 'playing' && table.t.row.game?.g.phase !== 'gameOver') if (!(await table.step())) break;
    expect(table.problems).toEqual([]);
    expect(table.t?.row?.game?.g.phase).toBe('gameOver');
    expect(table.t?.row?.status).toBe('playing');
    expect(await liveRooms(table.user(0))).toEqual([]);
    // 房间还开着：点"再来一场"照样收下、新房间码发给每个人
    await table.step();
    expect(table.problems).toEqual([]);
    expect(table.t?.row?.status).toBe('over');
    expect(await liveRooms(table.user(0))).toEqual([]);
  });
});
