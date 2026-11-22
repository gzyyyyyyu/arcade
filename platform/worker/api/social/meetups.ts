/**
 * 约局（docs/social.md 1.6；接口见 docs/platform-backend.md 15.22）。写入记在"在线"类。
 *
 * - 在好友页定个时间、选一个能开好友房的游戏，发给全部好友；不收自由文字。到点前 meetupLeadMs 到到点后 meetupGraceMs 算"到点"，
 *   好友那边头像出小点、好友页亮"去"。平台不建房间：主人到点自己开桌、叫人，走已有的房间和邀请（1.3）。
 * - 一人一行（迁移 0015）：再约就覆盖，取消把 at 改成 0；每天（北京时间）最多 meetupsPerDay 次，次数和覆盖写在同一条语句里，超了 429、写 0 行。
 * - 好友那边跟着收邀请的 30 秒轮询一起读（invites.ts 的 listInvites），只读；删了好友、屏蔽之后就看不到。
 */
import { count, gameId } from '../lib/body';
import { ROOM_GAME_IDS } from '../../../shared/games';
import type { Ctx } from '../core/context';
import { DAY } from '../core/context';
import { beijingDate, beijingDayStart } from '../core/time';
import { ApiError, json, noContent, rateLimited } from '../lib/http';

/** 开局时间只收整点、半点（北京时间和 UTC 差整 8 小时，按 UTC 取整一样） */
const SLOT_MS = 1_800_000;

interface MeetupOut {
  host: { id: string; name: string };
  game: string;
  at: number;
}

/** 请求体 → 游戏和时间；不合格 400：不是能开好友房的游戏、不在整点半点、已经过了、比明天还远 */
function parseMeetup(c: Ctx): { game: string; at: number } {
  const game = gameId(c.body.game);
  const at = count(c.body.at);
  const today = beijingDate(c.now);
  const latest = beijingDayStart(today) + 2 * DAY;
  if (!ROOM_GAME_IDS.has(game) || at % SLOT_MS !== 0 || at <= c.now || at >= latest) throw new ApiError(400, 'bad_request');
  return { game, at };
}

/** PUT /api/meetup {game, at} → {meetup: {game, at}}。成功 1 行；今天约满了 429（Retry-After 到北京时间明天 0 点）、0 行。 */
export async function putMeetup(c: Ctx): Promise<Response> {
  const { db, limits, now } = c;
  const { game, at } = parseMeetup(c);
  const me = c.session!.user.id;
  const day = beijingDate(now);
  const meta = await db.run(
    db.stmt(
      `INSERT INTO meetups (host_id, game, at, day, made) VALUES (?1, ?2, ?3, ?4, 1)
       ON CONFLICT (host_id) DO UPDATE SET game = excluded.game, at = excluded.at,
         made = CASE WHEN meetups.day = excluded.day THEN meetups.made + 1 ELSE 1 END, day = excluded.day
       WHERE meetups.day <> excluded.day OR meetups.made < ?5`,
      me, game, at, day, limits.meetupsPerDay,
    ),
  );
  if ((meta.changes ?? 0) === 0) throw rateLimited(beijingDayStart(day) + DAY - now);
  return json(200, { meetup: { game, at } });
}

/** DELETE /api/meetup：取消自己的约局。有没过的约局 1 行，没有 0 行，一样 204。当天的次数不还。 */
export async function deleteMeetup(c: Ctx): Promise<Response> {
  const { db } = c;
  await db.run(db.stmt('UPDATE meetups SET at = 0 WHERE host_id = ?1 AND at > ?2', c.session!.user.id, c.now - c.limits.meetupGraceMs));
  return noContent();
}

/**
 * 给收邀请的轮询带上的约局：好友约的、还没过（开局后 meetupGraceMs 以内）的，先开的在前；外加我自己约的。只读。
 * 扫的是 meetups 整张表（只有约过局的人那么多行），每行按主键查一次是不是好友。
 */
export async function meetupsFor(c: Ctx, me: string): Promise<{ meetups: MeetupOut[]; mine: { game: string; at: number } | null }> {
  const { db, now, limits } = c;
  const since = now - limits.meetupGraceMs;
  const [rows, mine] = await Promise.all([
    db.all<{ host_id: string; display_name: string; game: string; at: number }>(
      db.stmt(
        `SELECT m.host_id, u.display_name, m.game, m.at
           FROM meetups m
           JOIN users u ON u.id = m.host_id
           JOIN friendships f ON f.user_a = MIN(m.host_id, ?1) AND f.user_b = MAX(m.host_id, ?1) AND f.status = 'accepted'
          WHERE m.at > ?2 AND m.host_id <> ?1
          ORDER BY m.at LIMIT 20`,
        me, since,
      ),
    ),
    db.first<{ game: string; at: number }>(db.stmt('SELECT game, at FROM meetups WHERE host_id = ?1 AND at > ?2', me, since)),
  ]);
  return {
    meetups: rows.filter((r) => ROOM_GAME_IDS.has(r.game)).map((r) => ({ host: { id: r.host_id, name: r.display_name }, game: r.game, at: r.at })),
    mine: mine && ROOM_GAME_IDS.has(mine.game) ? { game: mine.game, at: mine.at } : null,
  };
}
