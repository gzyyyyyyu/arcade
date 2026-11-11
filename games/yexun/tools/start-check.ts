/**
 * 起手回归（sim 回归，不进 npm test）：每个能选的角色，正常起手和第二件起手（Setup.startAlt）各跑一小把，
 * 实盘雪原中档、普通机器人；第二件起手的胜率低于正常起手的一半就报出来、退出码 1。
 * 0.19.0 按规则选的第二件里有开不了局的（招魂幡、雷符），这条防同类问题再出现（主线 11-06）。
 * 两边都走自己那件起手所在流派的路线、带同流派的心法：选第二件起手的人就是要玩另一主修。
 *
 * 命令行：npm run sim:starts [-- --n 40 --char zhijiang,yinyang]（约 20 分钟，跑在一个线程上）
 */
import { altSchool, mainSchools } from '../src/content/pools.ts';
import { LIVE_CHAR_IDS } from '../src/content/live.ts';
import { CHARACTERS, type CharacterId } from '../src/content/meta.ts';
import type { SchoolId } from '../src/content/guide.ts';
import { runOne } from './sim.ts';

const arg = (k: string): string | undefined => {
  const i = process.argv.indexOf(k);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const N = Number(arg('--n') ?? 40);
const chars = (arg('--char')?.split(',') ?? LIVE_CHAR_IDS) as CharacterId[];

/** 正常起手所在的流派 = 两个主修里不是 altSchool 的那个 */
const ownSchool = (c: CharacterId): SchoolId => mainSchools(c).find((s) => s !== altSchool(c)) ?? altSchool(c);

const winRate = (c: CharacterId, school: SchoolId, alt: boolean): number => {
  let won = 0;
  for (let i = 0; i < N; i++) if (runOne(1 + i, 2, 'normal', school, 'snow', c, false, false, true, '', true, alt, school).won) won++;
  return won / N;
};

let bad = 0;
for (const c of chars) {
  const own = ownSchool(c), alt = altSchool(c);
  const a = winRate(c, own, false), b = winRate(c, alt, true);
  const ok = b >= a / 2;
  if (!ok) bad++;
  console.log(`${ok ? '过' : '不过'}　${CHARACTERS[c].name}：正常起手（${own}）${(a * 100).toFixed(0)}%，第二件起手（${alt}）${(b * 100).toFixed(0)}%`);
}
console.log(bad ? `${bad} 个角色的第二件起手胜率不到正常起手的一半` : `全部通过（每边 ${N} 局）`);
process.exit(bad ? 1 : 0);
