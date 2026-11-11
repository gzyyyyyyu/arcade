/**
 * 整局指纹：拆文件、搬代码这类"行为不该变"的重构，前后各跑一次比对。
 * 每种玩法、每组规则选项打若干整场（全电脑，固定种子），每一步把状态（含事件）和每个座位的视图喂进一个 SHA-256，
 * 一组选项一个指纹，最后一行是全部合起来的总指纹。同一个提交跑两次必须一样；规则核心里改动任何一点行为，相应的指纹就变。
 *
 * 用法：node scripts/fingerprint.ts [每组几场，默认 12]
 * 反证（证明它真能抓到差别）：node scripts/fingerprint.ts 12 --mutate，把每一步的第一个事件的座位号改掉再算，指纹必须全变。
 */
import { createHash } from 'node:crypto';
import { AIS } from '../src/ai/index.ts';
import { variantOf, type OptsOf } from '../src/core/variants/index.ts';
import { NEUTRAL_TUNE } from '../src/core/variants/types.ts';
import { baseOf } from '../src/game/stakes.ts';

const GAMES = Number(process.argv[2] ?? 12);
const MUTATE = process.argv.includes('--mutate');
const SHARE = 2_000;

const CASES: readonly [string, Record<string, unknown>][] = [
  ['sichuan-xuezhan', {}],
  ['sichuan-xuezhan', { rounds: 4, cap: 3, swap: false, zimo: 'fan', transfer: false }],
  ['sichuan-xuezhan', { rounds: 4, flow: true }],
  ['sichuan-xuezhan', { rounds: 4, three: true, swap: false }],
  ['riichi', { length: 'tonpuu' }],
  ['riichi', { length: 'hanchan' }],
  ['riichi', { length: 'ikkyoku' }],
];

/** 种子：第 g 场的 8 个 32 位整数 */
const keyOf = (g: number): number[] => Array.from({ length: 8 }, (_, i) => (Math.imul(g + 1, 0x9e3779b1) ^ Math.imul(i + 1, 0x85ebca6b)) >>> 0);

const total = createHash('sha256');
for (const [id, extra] of CASES) {
  const v = variantOf(id)!;
  const ai = AIS[v.id];
  const h = createHash('sha256');
  let steps = 0;
  for (let g = 0; g < GAMES; g++) {
    const opts = { ...v.defaults, ...extra } as OptsOf;
    // biome-ignore lint/suspicious/noExplicitAny: 指纹只按 JSON 形状遍历各玩法的状态（events、players），不区分玩法
    let s: any = v.begin(keyOf(g), opts, ['ai', 'ai', 'ai', 'ai'], { share: SHARE, base: baseOf(SHARE), personas: [g % 7, (g + 2) % 7, (g + 4) % 7, (g + 6) % 7], tunes: [NEUTRAL_TUNE, NEUTRAL_TUNE, NEUTRAL_TUNE, NEUTRAL_TUNE] });
    const feed = (): void => {
      const snap = MUTATE && s.events?.length ? { ...s, events: [{ ...s.events[0], seat: (s.events[0].seat ?? 0) + 1 }, ...s.events.slice(1)] } : s;
      h.update(JSON.stringify(snap));
      for (let seat = 0; seat < (s.players?.length ?? 4); seat++) h.update(JSON.stringify(v.view(s, seat)));
      h.update(JSON.stringify(v.view(s, null)));
      steps++;
    };
    feed();
    for (let n = 0; n < 40_000 && !v.over(s); n++) {
      const act = v.actors(s);
      if (!act?.seats.length) {
        s = v.resume(s);
        feed();
        continue;
      }
      const seat = act.seats[0]!;
      const next = v.apply(s, seat, v.auto(s, seat, ai));
      if ('error' in next) throw new Error(`${id} 第 ${g} 场走不下去：${next.error}`);
      s = next;
      feed();
    }
    if (!v.over(s)) throw new Error(`${id} 第 ${g} 场 40,000 步没打完`);
    h.update(JSON.stringify(v.result(s)));
  }
  const d = h.digest('hex');
  total.update(d);
  console.log(`${id} ${JSON.stringify(extra)}  ${GAMES} 场 ${steps} 步  ${d.slice(0, 16)}`);
}
console.log(`总指纹 ${total.digest('hex')}`);
