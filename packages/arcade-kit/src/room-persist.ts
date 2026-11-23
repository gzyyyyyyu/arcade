/**
 * 房间存的那一行和读写它的 SQL / PG 算法（从 room.ts 拆出）：结构、旧版本补字段、SQLite 与 PG 镜像两条读写路径、PG 的开库和提交。
 * 参数都显式传入（sql 句柄、MirrorStore、storage），不碰房间实例的状态；缓存、计数、写行数仍由 room.ts 的 save / load / pgCommit 管，
 * 这样存储这块的 SQL 只有一处，两条路径的语句也一眼能对上。
 */
import type { MirrorStore } from './store.js';
import type { RoomStatus } from './protocol.js';
import type { SeatState } from './room-seats.js';

export interface Persist<S> {
  /** 结构版本：只加字段，不改含义 */
  sv: 1;
  code: string;
  /** 房主的 userId：只有房主能开局（9.1） */
  host: string;
  createdAt: number;
  status: RoomStatus;
  seq: number;
  /** 牌局最后一次变化（开局、出了一步）时的 seq */
  gameSeq: number;
  /**
   * 这一手（或这一组，RoomGame.actors）开始时的 gameSeq；客户端的 baseSeq 比它小就是 stale。
   * 一手一个人时每出一步都是新的一手，它和 gameSeq 一样（就是 0.1.0 的判法）；一组人时组里有人出手不变，后出的人不会因此被判 stale。
   * 0.1.1 加的字段，读 0.1.0 存下的房间时补成 gameSeq
   */
  turnSeq: number;
  seats: SeatState[];
  game: S | null;
  rulesVersion: number | null;
  /** 当前这一手（或这一组）从什么时候开始算 */
  turnSince: number | null;
  /** 电脑一批没算完，什么时候接着算 */
  aiAt: number | null;
  /** 从什么时候起没有入座的真人连着（只连着没入座的人也算"没人"，他们不能让房间一直活着） */
  noHumanSince: number | null;
  /** 一生收到的入站消息数，含会写库的重连（没写库的那些在内存里攒着，下次写库时一起记） */
  inbound: number;
  /** 上面这个数按 userId 分开记，只用来在关房日志里指出是谁发得最多 */
  inboundBy: Record<string, number>;
  /**
   * 开打以后每个座位绑定的 userId（null 是还没有真人坐过的电脑座位）。开局时记下入座的人；
   * 开打后坐过某个座位的人只能回这个座位，绑给别人的座位谁也接管不了（电脑一直替那个人打）；
   * 没坐过的人只能接管没绑人的电脑座位，接管后绑给他。这样一个人一局里只能看到一个座位的牌。
   * 0.1.1 加的字段；0.1.0 存下的房间没有它，读出来时按当时的座位补上（loadPersist）
   */
  owners: (string | null)[];
  /**
   * 每个人"掉线后回来"（会写库的那种进房）的次数，见 RoomLimits.maxJoins。按 userId 记、不挂在座位对象上：
   * 离座再坐下会换一个新座位，挂在座位上就会清零
   */
  joins: Record<string, number>;
  /** 写了还没报给计量的行数（内存里的为准，随这一行一起存，被驱逐后接着数） */
  unmetered?: number;
  /** 对外的事办失败了，什么时候再试（null 是不用等） */
  effectsAt?: number | null;
  /** 连着失败了几次（退避用） */
  effectTries?: number;
  /** 正在关：人都断开了，留着存储把对外的事办完再删 */
  ending?: { reason: string; at: number } | null;
  /** 开房时定下的开局选项（RoomGame.options 校验过的）；没有就是开打时由 start 定 */
  opts?: unknown;
  /**
   * 快速匹配的桌：排进来的人（建房时已经坐在各自的座位上）和最晚什么时候开打。
   * 只有这几个人能进；没有房主（host 只是第一个人，用来还名额以外不起作用），start 一律 not_host
   */
  match?: { users: string[]; joinBy: number };
}

export const TABLE = 'kit_room';
/** PG 模式把房间码记在内存存储里的 key：连接上的事件、闹钟进来时靠它找回 PG 里的行 */
const PG_NAME_KEY = 'kit.name';

/** owners 里"绑了、但不是任何人"：0.1.0 存下的已开打房间里的电脑座位（谁都不能接管）。userId 不会是空串 */
export const NOBODY = '';

/** 读存储里的那一行；0.1.0 存下的房间没有后来加的字段，按当时的状态补上（结构只加字段，不改含义）。 */
export function loadPersist<S>(raw: string): Persist<S> {
  const st = JSON.parse(raw) as Persist<S>;
  // 已经开打的：坐着的真人绑他自己；电脑座位一律当作已绑（NOBODY），谁都不能接管——
  // 0.1.0 没记谁离过座，放开的话离过座的人读出来就成了"没坐过"，又能去换座位看牌。等人阶段开局时才绑
  st.owners ??= st.seats.map((s) => (st.status === 'waiting' ? null : s.kind === 'human' ? s.userId : NOBODY));
  st.turnSeq ??= st.gameSeq;
  return st;
}

/** 开房时建表（SQLite 路径；一个房间只有这一次），返回写了几行。 */
export function createTable(sql: SqlStorage): number {
  return sql.exec(`CREATE TABLE IF NOT EXISTS ${TABLE} (k INTEGER PRIMARY KEY, v TEXT NOT NULL)`).rowsWritten;
}

/** 把房间那一行写进去（PG 镜像或 SQLite），返回写了几行。sql 传取句柄的函数：PG 模式下 ctx.storage.sql 不能碰，用不到就不取。 */
export function writeRow<S>(st: Persist<S>, pg: MirrorStore | null, sql: () => SqlStorage): number {
  if (pg) return pg.put(TABLE, 1, JSON.stringify(st));
  return sql().exec(`INSERT INTO ${TABLE} (k, v) VALUES (1, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v`, JSON.stringify(st)).rowsWritten;
}

/**
 * 只读：把房间那一行读出来。SQLite 路径表不在（从没开过房、或者关房时连表一起删了）就是没有这个房间，不建表、不写任何东西；
 * PG 镜像还没读进来（连不上）时 pg.get 会抛，不能当"没有房间"。
 */
export function readRow<S>(pg: MirrorStore | null, getSql: () => SqlStorage): Persist<S> | null {
  if (pg) {
    const v = pg.get(TABLE, 1);
    return v !== null ? loadPersist<S>(v) : null;
  }
  const sql = getSql();
  const hasTable = sql.exec(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`, TABLE).toArray().length > 0;
  const row = hasTable ? sql.exec<{ v: string }>(`SELECT v FROM ${TABLE} WHERE k = 1`).toArray()[0] : undefined;
  return row ? loadPersist<S>(row.v) : null;
}

/**
 * 把 PG 里这个房间的行读进内存镜像。name 是房间码：开房、进房、kitWake 带进来，记进内存存储（workerd 的内存存储被驱逐时还在、进程重启才清），
 * 闹钟、连接上的事件进来时从那里取。读不了回 false
 */
export async function openPg(pg: MirrorStore, storage: Pick<DurableObjectStorage, 'get' | 'put'>, name?: string): Promise<boolean> {
  try {
    let n = name ?? pg.name;
    if (n === null || n === undefined) n = (await storage.get<string>(PG_NAME_KEY)) ?? null;
    if (!n) throw new Error('room name unknown');
    if (pg.name === null) await storage.put(PG_NAME_KEY, n);
    await pg.open(n);
    return true;
  } catch (e) {
    console.error('room store open failed', e instanceof Error ? e.message : e);
    return false;
  }
}

/** 一步的最后把脏行和闹钟提交进 PG；关了房的这一步改成删掉 PG 里的行。失败抛出，由调用方按"写存储失败"收拾。 */
export async function commitPg(pg: MirrorStore, wipe: boolean, alarmAt: number | null | undefined): Promise<void> {
  if (wipe) await pg.wipe();
  else await pg.flush(alarmAt === undefined ? pg.storedAlarm : alarmAt);
}
