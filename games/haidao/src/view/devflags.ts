/**
 * 地址栏开关，全在这里读一次（别处不再 new URLSearchParams）。
 * - 改玩法的取证开关只在带 ?dev 时生效：devarmy（战役局换兵）、devhero（战役局带驻岛英雄）、funseed（娱乐局固定种子）、devwalls（拉一道城墙）。
 * - 不改规则的：fast（局内 4 倍速，冒烟和录屏用）、battle / auto（开发入口：直接开某关、机器人代打，不写存档）、
 *   渲染 A/B：msaa、mt1、bloom、sea、rs、lowmem（性能对比和无头截图用，默认值就是线上的样子）。
 */
// 单测在 Node 里载入画面模块时没有 location：当成空地址栏
const q = new URLSearchParams(typeof location === 'undefined' ? '' : location.search);
const dev = q.has('dev');
const num = (k: string): number => Number(q.get(k)) || 0;

export const DEV = {
  /** ?dev：测试辅助（给资源、不写存档，main.ts 的 app.api.dev） */
  on: dev,
  /** 局内倍速 */
  speed: q.has('fast') ? 4 : 1,
  /** 开发入口：?battle=<关 id>[&auto] */
  battle: q.get('battle'),
  auto: q.has('auto'),
  /** devarmy=sailor,brute:2,…：战役局换成这几种兵各一船（冒号后每船几个） */
  army: dev ? q.get('devarmy') : null,
  /** devhero=<1-8>：战役局临时放一个宝藏箱并带驻岛英雄 */
  hero: dev ? num('devhero') : 0,
  /** funseed=<数>：没给 setup 的娱乐局固定种子 */
  funSeed: dev ? num('funseed') : 0,
  /** devwalls：去掉最外面的金矿，左边沙滩和炮台之间拉一道城墙 */
  walls: dev && q.has('devwalls'),
  /** 渲染 A/B */
  msaa: q.get('msaa'),
  oneTexture: q.has('mt1'),
  bloom: q.get('bloom'),
  sea: q.get('sea') !== '0',
  /** ?lowmem：按省内存设备跑（冒烟用） */
  lowMemory: q.has('lowmem'),
  /** ?rs=<1–3>：强制渲染倍数（帧率 A/B 用） */
  renderScale: ((): number | null => {
    const n = num('rs');
    return n >= 1 && n <= 3 ? n : null;
  })(),
} as const;
