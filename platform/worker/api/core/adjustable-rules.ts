/**
 * 管理员在线可调的一组数（钱包规则 wallet_rules、邀请规则 invite_rules）：settings 里一行 {rules, log}，改了不用发版。
 * - 每条有能调的范围（防手滑，不是业务上限），改时不合格整个 400；没真的变化不写。
 * - 记最近 20 次改动：谁、什么时候、哪几条从多少改成多少。
 * - 业务读用每个 isolate 30 秒的缓存（改的那个 isolate 马上跟上，别的最多晚 30 秒）。
 * - 库里没存的条目用默认值（新加的规则）；读库失败照常抛出，不按默认值继续：按默认写钱包、发码会把管理员改过的数悄悄冲掉。
 *   存着的值不在范围里说明这一行坏了（范围只放宽过），按坏列报错。
 */
import type { Db } from '../lib/db';
import { ApiError } from '../lib/http';
import { isRecord, parseJsonColumn } from '../lib/json-column';
import { readSetting, writeSettingStatement } from './settings';

const CACHE_MS = 30_000;
const LOG_MAX = 20;

interface RulesChange<K extends string> {
  at: number;
  by: string;
  changes: Partial<Record<K, [number, number]>>;
}

/** 管理页要的：现在的值、默认值、范围、最近的改动（新的在前） */
interface RulesState<R extends { [K in keyof R]: number }> {
  rules: R;
  defaults: R;
  range: Record<keyof R, readonly [number, number]>;
  log: RulesChange<keyof R & string>[];
  updatedAt: number | null;
}

export interface AdjustableRules<R extends { [K in keyof R]: number }> {
  /** 业务用：30 秒缓存，读不到抛错 */
  current(db: Db, now: number): Promise<R>;
  /** 管理页用：不走缓存 */
  state(db: Db): Promise<RulesState<R>>;
  /** 只改传了的几条；有变化时给出要写的语句（1 行），调用方和管理员每日计数一起 batch，写成后调 remember */
  plan(db: Db, input: Record<string, unknown>, by: string, now: number): Promise<{ stmt: D1PreparedStatement | null; rules: R }>;
  remember(rules: R, now: number): void;
  resetCacheForTests(): void;
}

export function adjustableRules<R extends { [K in keyof R]: number }>(
  key: string,
  defaults: R,
  range: Record<keyof R, readonly [number, number]>,
): AdjustableRules<R> {
  type K = keyof R & string;
  const keys = Object.keys(defaults) as K[];
  const inRange = (k: K, v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= range[k][0] && v <= range[k][1];
  type Stored = { rules: Partial<R>; log?: RulesChange<K>[] };
  const isValue = (v: unknown): v is Stored => {
    if (!isRecord(v) || !isRecord(v.rules) || (v.log !== undefined && !Array.isArray(v.log))) return false;
    const rules = v.rules;
    return keys.every((k) => rules[k] === undefined || inRange(k, rules[k]));
  };
  let cache: { rules: R; at: number } | null = null;

  async function readRow(db: Db): Promise<{ rules: R; log: RulesChange<K>[]; updatedAt: number | null }> {
    const row = await readSetting(db, key);
    const v: Stored = row ? parseJsonColumn(row.value, isValue, `settings.${key}`) : { rules: {} };
    return { rules: { ...defaults, ...v.rules }, log: v.log ?? [], updatedAt: row?.updated_at ?? null };
  }

  return {
    async current(db, now) {
      if (cache && now >= cache.at && now - cache.at < CACHE_MS) return cache.rules;
      const { rules } = await readRow(db);
      cache = { rules, at: now };
      return rules;
    },
    async state(db) {
      const { rules, log, updatedAt } = await readRow(db);
      return { rules, defaults, range, log: [...log].reverse(), updatedAt };
    },
    async plan(db, input, by, now) {
      const cur = await readRow(db);
      const next = { ...cur.rules };
      const changes: RulesChange<K>['changes'] = {};
      for (const k of keys) {
        const v = input[k];
        if (v === undefined) continue;
        if (!inRange(k, v)) throw new ApiError(400, 'bad_request', { field: k, range: range[k] });
        if (v !== cur.rules[k]) {
          changes[k] = [cur.rules[k], v];
          (next as Record<K, number>)[k] = v;
        }
      }
      if (!Object.keys(changes).length) return { stmt: null, rules: cur.rules };
      const log = [...cur.log, { at: now, by, changes }].slice(-LOG_MAX);
      return { stmt: writeSettingStatement(db, key, JSON.stringify({ rules: next, log }), now), rules: next };
    },
    remember(rules, now) {
      cache = { rules, at: now };
    },
    resetCacheForTests() {
      cache = null;
    },
  };
}
