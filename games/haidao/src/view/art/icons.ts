/** 界面小图标（32×32，锚点在中心）：资源、星、能量、按钮和旗舰技能。 */
import type { SkillKind } from '../../core/types.ts';
import { PALETTE as C } from './palette.ts';
import type { ArtPiece, Pt } from './kit.ts';
import { ell, line, path, pieceRaw as piece, poly, rect, skull as skullPic, tube } from './kit.ts';

type IconKind = 'gold' | 'wood' | 'star' | 'starEmpty' | 'energy' | 'hammer' | 'sword' | 'shield' | 'ship' | 'map' | 'home' | 'skull' | 'bounty' | 'trophy' | 'shieldOn' | 'replay' | 'revenge' | 'treasure' | 'sluice' | 'battery' | 'hook' | SkillKind;

function starPts(r1: number, r2: number): Pt[] {
  const a: Pt[] = [];
  for (let i = 0; i < 10; i++) {
    const an = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 ? r2 : r1;
    a.push([Math.cos(an) * r, Math.sin(an) * r + 1]);
  }
  return a;
}

function make(kind: IconKind): string {
  switch (kind) {
    case 'gold':
      return ell(0, 1.5, 12, 12, C.goldD!, { sw: 2 }) + ell(0, 0, 12, 12, C.gold!, { sw: 2 }) + ell(0, 0, 8, 8, 'none', { sw: 1.6, stroke: C.goldD! }) +
        path('M-1.4,-5 h2.8 v10 h-2.8z M-4,-3 q4,-3 8,0 M-4,3 q4,3 8,0', C.goldD!, { sw: 0 }) + path('M-7,-6 q3,-5 8,-6', 'none', { stroke: C.goldL!, sw: 2, op: 0.9 });
    case 'wood':
      return tube([-12, 8], [10, -4], 13, 13, C.wood!, C.woodL!) + ell(-12, 8, 4.4, 6.8, C.woodDD!, { sw: 1.8 }) + ell(10, -4, 4.4, 6.8, C.woodL!, { sw: 2 }) + ell(10, -4, 1.8, 3, C.wood!, { sw: 0 }) +
        tube([-10, 12], [12, 2], 8, 8, C.woodD!, C.wood!) + ell(12, 2, 3, 4.4, C.woodL!, { sw: 1.6 });
    case 'star':
      return poly(starPts(14, 6), C.gold!, { sw: 2.2 }) + poly([[0, -12], [3, -4], [-1, -3], [-10, -2]], C.goldL!, { sw: 0 }) + poly([[0, 12], [6, 5], [3, -1], [0, 0]], C.goldD!, { sw: 0, op: 0.7 });
    case 'starEmpty':
      // 空星：外圈深色边在羊皮纸上看得清，里面一圈奶白细边在顶栏的半透明深木底上看得清（烘进图标，不用运行时的 CSS 滤镜）
      return poly(starPts(14, 6), '#6f7686', { sw: 2.2, stroke: '#2a2d38' }) + poly(starPts(11.2, 4.8), 'none', { sw: 1.3, stroke: '#ece2cc' }) + poly([[0, -9], [1.8, -4], [-7, -2]], '#9aa1b2', { sw: 0 });
    case 'energy':
      return poly([[3, -15], [-9, 2], [-1, 2], [-4, 15], [9, -3], [1, -3]], C.fireL!, { sw: 2.2 }) + poly([[2, -11], [-5, 0], [0, 0]], '#fff7c8', { sw: 0 });
    case 'hammer':
      return line([-10, 12], [6, -6], C.woodD!, 5) + line([-10, 12], [6, -6], C.woodL!, 2.2) + poly([[-1, -14], [13, -6], [9, 2], [-5, -6]], C.iron!, { sw: 2.2 }) + poly([[0, -12], [9, -7], [3, -6]], C.ironL!, { sw: 0 });
    case 'sword':
      return line([-11, 11], [6, -6], '#fff', 0, 0) + poly([[11, -12], [12, -5], [-5, 9], [-9, 8], [-8, 4]], '#e2ebf3', { sw: 2.2 }) + line([-9, 8], [-4, 3], C.gold!, 4.5) + line([-8, 14], [-11, 11], C.woodD!, 4);
    case 'shield':
      return path('M0,-13 L12,-9 Q13,6 0,14 Q-13,6 -12,-9 Z', C.blue!, { sw: 2.2 }) + path('M0,-13 L12,-9 Q13,6 0,14 Z', C.blueD!, { sw: 0, op: 0.7 }) + path('M0,-9 L8,-6 Q8,4 0,10', 'none', { stroke: C.gold!, sw: 2 }) + ell(0, -1, 3, 3, C.gold!, { sw: 0 });
    case 'ship':
      return path('M-14,4 L14,4 L9,12 L-9,12 Z', C.wood!, { sw: 2.2 }) + line([0, 4], [0, -13], C.woodDD!, 2.6) + path('M2,-12 Q14,-6 2,2 Z', C.cream!, { sw: 1.8 }) + path('M-2,-10 Q-9,-5 -2,0 Z', C.cream!, { sw: 1.8 }) + path('M-14,13 q4,-3 7,0 t7,0 t7,0', 'none', { stroke: C.seaLight!, sw: 1.8 });
    case 'map':
      return path('M-13,-9 L-5,-12 L5,-9 L13,-12 L13,9 L5,12 L-5,9 L-13,12 Z', '#f1dca0', { sw: 2.2 }) + line([-5, -12], [-5, 9], C.goldD!, 1, 0.6) + line([5, -9], [5, 12], C.goldD!, 1, 0.6) + line([-9, 4], [-1, -3], C.red!, 1.8) + line([0, 3], [9, -4], C.red!, 1.8) + line([6, -8], [11, -3], C.red!, 2.4) + line([11, -8], [6, -3], C.red!, 2.4);
    case 'home':
      return poly([[0, -14], [14, -2], [-14, -2]], C.red!, { sw: 2.2 }) + rect(-9, -2, 18, 14, C.cream!, { sw: 2.2 }) + rect(-3, 4, 6, 8, C.woodD!, { sw: 1.6 }) + rect(5.5, -11, 4, 7, C.stone!, { sw: 1.6 });
    case 'skull':
      return skullPic(0, -2, 22, true);
    case 'barrage':
      return ell(-6, 6, 6, 6, '#2f3140', { sw: 2 }) + ell(7, -4, 6, 6, '#2f3140', { sw: 2 }) + ell(-9, -9, 4.4, 4.4, '#2f3140', { sw: 2 }) + line([-7, 9], [-14, 15], C.fireL!, 2.4) + line([8, -1], [14, 6], C.fireL!, 2.4) + ell(-7.6, 4, 2, 1.4, '#8a8da2', { sw: 0 }) + ell(5.4, -6, 2, 1.4, '#8a8da2', { sw: 0 }) +
        path('M-14,-14 L-4,-4 M4,-12 L10,-6', 'none', { stroke: '#ff6a1f', sw: 2 });
    case 'flare':
      return poly([[0, -14], [3, -4], [13, -3], [5, 3], [8, 13], [0, 7], [-8, 13], [-5, 3], [-13, -3], [-3, -4]], '#ff4b30', { sw: 2.2 }) + ell(0, 0, 4.6, 4.6, C.fireL!, { sw: 0 }) + ell(0, 0, 2, 2, '#fff', { sw: 0 });
    case 'bounty':
      return path('M-12,-14 L12,-14 L12,12 L-12,12 Z', '#f1dca0', { sw: 2.2 }) + path('M-12,-14 L-9,-17 L-5,-14 L-1,-17 L3,-14 L7,-17 L12,-14', 'none', { stroke: C.ink!, sw: 1.4 }) + skullPic(0, -4, 12, false) + line([-8, 6], [8, 6], C.red!, 2) + ell(0, 9, 2.4, 2.4, C.gold!, { sw: 1 });
    case 'treasure':
      // 守岛的宝藏：敞口铁箍小箱、金币冒尖（和金币图标分开，顶栏里「20/20」不会被看成金币）
      return path('M-13,-2 L13,-2 L12,12 L-12,12 Z', C.wood!, { sw: 2.2 }) + rect(-13, 2, 26, 3, C.ironD!, { sw: 0 }) + rect(-2.5, -2, 5, 7, C.gold!, { sw: 1.4 }) +
        path('M-12,-2 Q-6,-12 0,-9 Q6,-13 12,-2 Z', C.gold!, { sw: 2 }) + ell(-5, -6, 3, 2, C.goldL!, { sw: 0 }) + ell(4, -8, 2.6, 1.8, C.goldL!, { sw: 0 }) + path('M8,-15 l1.2,3 l3,1.2 l-3,1.2 l-1.2,3 l-1.2,-3 l-3,-1.2 l3,-1.2z', '#fff6c0', { sw: 0 });
    case 'sluice':
      // 潮汐水闸：两根木桩夹一扇放下的闸板，闸外是浪
      return path('M-15,10 q4,-4 8,0 t8,0 t8,0 t7,0', 'none', { stroke: '#2b7fa3', sw: 4 }) + path('M-15,10 q4,-4 8,0 t8,0 t8,0 t7,0', 'none', { stroke: '#e8f8f4', sw: 1.8 }) +
        rect(-14, -14, 5, 24, C.woodD!, { sw: 2 }) + rect(9, -14, 5, 24, C.woodD!, { sw: 2 }) + rect(-9, -8, 18, 14, C.wood!, { sw: 2 }) +
        line([-9, -3], [9, -3], C.woodDD!, 1.4) + line([-9, 2], [9, 2], C.woodDD!, 1.4) + rect(-16, -16, 32, 4, C.ironD!, { sw: 1.8 });
    case 'battery':
      // 岸防老炮：石墩上一门粗短的旧铜炮，炮口冒一缕烟
      return rect(-14, 4, 26, 10, C.stone!, { sw: 2 }) + line([-14, 9], [12, 9], C.stoneD!, 1.2) +
        path('M-12,4 L-12,-2 Q-10,-8 -2,-8 L12,-12 L14,-6 L0,2 Z', '#b07a3a', { sw: 2.2 }) + ell(13, -9, 2.6, 3.6, '#2b1a15', { sw: 1.4 }) +
        ell(-7, 5, 5, 5, C.woodD!, { sw: 1.8 }) + ell(-7, 5, 1.6, 1.6, C.gold!, { sw: 0 }) + path('M14,-14 q4,-4 1,-8 q5,1 5,6', 'none', { stroke: '#c9ccd4', sw: 2.2 });
    case 'hook':
      // 锚钩：左上一截铁链，下面一只三爪铁钩（中间的柄带一个环）
      return ell(-11, -12, 3.2, 2.2, 'none', { stroke: C.ironD!, sw: 2.2 }) + ell(-7, -8, 2.2, 3.2, 'none', { stroke: C.ironD!, sw: 2.2 }) + ell(-3, -4, 3.2, 2.2, 'none', { stroke: C.ironD!, sw: 2.2 }) +
        line([1, -1], [4, 9], C.ink!, 5) + line([1, -1], [4, 9], C.ironL!, 2.4) + ell(1, -2, 2.6, 2.6, 'none', { stroke: C.ink!, sw: 2 }) +
        path('M4,9 Q-6,11 -8,1 L-5,3 M4,9 Q14,10 13,0 L10,3 M4,9 L5,14', 'none', { stroke: C.ink!, sw: 4.4 }) + path('M4,9 Q-6,11 -8,1 L-5,3 M4,9 Q14,10 13,0 L10,3 M4,9 L5,14', 'none', { stroke: C.iron!, sw: 2.2 });
    case 'trophy':
      return path('M-9,-12 L9,-12 L8,0 Q0,8 -8,0 Z', C.gold!, { sw: 2.2 }) + path('M-9,-9 Q-16,-9 -13,-2 Q-11,2 -8,1 M9,-9 Q16,-9 13,-2 Q11,2 8,1', 'none', { stroke: C.ink!, sw: 2.2 }) + rect(-2, 5, 4, 5, C.goldD!, { sw: 1.6 }) + rect(-7, 10, 14, 4, C.woodD!, { sw: 1.8 }) + path('M-6,-10 Q-6,-2 -3,2', 'none', { stroke: C.goldL!, sw: 2, op: 0.9 });
    case 'shieldOn':
      return path('M0,-14 L12,-10 Q13,6 0,14 Q-13,6 -12,-10 Z', '#6fd0ff', { sw: 2.2 }) + path('M0,-14 L12,-10 Q13,6 0,14 Z', '#2f8fd0', { sw: 0, op: 0.7 }) + ell(0, 0, 17, 17, 'none', { sw: 2, stroke: '#bff0ff', op: 0.8 }) + poly([[-3, -4], [3, -4], [3, 4], [-3, 4]], '#fff', { sw: 0, op: 0.0 }) + path('M-5,0 l4,4 l7,-8', 'none', { stroke: '#fff', sw: 3 });
    case 'replay':
      return path('M-10,0 A10,10 0 1 1 -6,8', 'none', { stroke: C.ink!, sw: 6 }) + path('M-10,0 A10,10 0 1 1 -6,8', 'none', { stroke: '#7fd0ff', sw: 3.4 }) + poly([[-14,-3], [-6,-3], [-10,4]], '#7fd0ff', { sw: 1.6 }) + poly([[-2, -6], [8, 0], [-2, 6]], C.cream!, { sw: 1.8 });
    case 'revenge':
      return line([-11, 11], [6, -8], '#e2ebf3', 5) + line([11, 11], [-6, -8], '#e2ebf3', 5) + poly([[11, -13], [13, -6], [-4, 9], [-9, 8], [-8, 4]], '#dfe8f0', { sw: 2 }) + poly([[-11, -13], [-13, -6], [4, 9], [9, 8], [8, 4]], '#dfe8f0', { sw: 2 }) + path('M-4,-2 q4,-10 8,0 q-4,4 -8,0z', C.red!, { sw: 1.4 });
    default: // medkit：补给桶
      return rect(-10, -10, 20, 22, C.wood!, { sw: 2.2, r: 4 }) + line([-10, -3], [10, -3], C.woodDD!, 1.6) + line([-10, 6], [10, 6], C.woodDD!, 1.6) + poly([[-3, -8], [3, -8], [3, -3], [8, -3], [8, 3], [3, 3], [3, 8], [-3, 8], [-3, 3], [-8, 3], [-8, -3], [-3, -3]], '#fff', { sw: 1.6 }) + poly([[-2, 0], [-2, -6], [2, -6], [2, 0]], C.red!, { sw: 0, op: 0 }) + rect(-2, -7, 4, 14, C.red!, { sw: 0 }) + rect(-7, -2, 14, 4, C.red!, { sw: 0 });
  }
}

const cache = new Map<string, ArtPiece>();
export function iconArt(kind: IconKind): ArtPiece {
  let a = cache.get(kind);
  if (!a) cache.set(kind, (a = piece(`i.${kind}`, 36, 36, 18, 18, make(kind))));
  return a;
}

/** 成就徽章：铜、银、金，圆章加缎带和星 */
export function badgeArt(tier: 'bronze' | 'silver' | 'gold'): ArtPiece {
  const c = tier === 'gold' ? [C.gold!, C.goldD!, C.goldL!] : tier === 'silver' ? ['#c9d3de', '#8793a2', '#f2f6fa'] : ['#cd8a4a', '#8a5328', '#f0b680'];
  let s = poly([[-9, 4], [-3, 4], [-6, 22], [-9, 18], [-13, 20]], C.red!, { sw: 1.8 }) + poly([[9, 4], [3, 4], [6, 22], [9, 18], [13, 20]], C.redD!, { sw: 1.8 });
  s += ell(0, -4, 16, 16, c[1]!, { sw: 2.2 }) + ell(0, -5, 14, 14, c[0]!, { sw: 1.6 }) + ell(0, -5, 10, 10, 'none', { sw: 1.4, stroke: c[1]! });
  s += poly(starPts(8, 3.4).map((p) => [p[0], p[1] - 6] as Pt), c[2]!, { sw: 1.4, stroke: c[1]! }) + path('M-10,-10 Q-6,-16 2,-17', 'none', { stroke: '#fff', sw: 2, op: 0.7 });
  return piece(`i.badge.${tier}`, 44, 52, 22, 22, s);
}

/**
 * 稀有掉落弹窗的宝箱（正面略俯视，120×96）：合着的是铁箍木箱带锁；开着的盖子向后掀、箱口冒金光。
 * 只给 DOM 弹窗用（img），不进开局烘焙的纹理
 */
export function lootChestArt(open: boolean): ArtPiece {
  const key = `i.lootchest.${open ? 1 : 0}`;
  let a = cache.get(key);
  if (a) return a;
  let s = ell(0, 40, 50, 8, '#000', { sw: 0, op: 0.18 });
  // 箱身：前脸、顶面（开着时是箱口）、两道铁箍、包角
  s += path('M-46,0 L46,0 L42,38 L-42,38 Z', C.wood!, { sw: 2.6 });
  s += path('M-46,0 L46,0 L44,8 L-44,8 Z', C.woodL!, { sw: 0, op: 0.6 });
  for (const x of [-30, 30]) s += path(`M${x - 5},0 L${x + 5},0 L${x + 4.6},38 L${x - 4.6},38 Z`, C.ironD!, { sw: 1.8 });
  for (let i = 0; i < 3; i++) s += line([-40, 13 + i * 9], [40, 13 + i * 9], C.woodD!, 1.4, 0.55);
  if (open) {
    // 箱口：深色内壁上堆着金币，后面掀起的盖子
    s += path('M-44,-24 L44,-24 L46,0 L-46,0 Z', C.woodD!, { sw: 2.6 });
    s += path('M-42,-26 Q-44,-58 0,-62 Q44,-58 42,-26 Z', C.wood!, { sw: 2.6 }) + path('M-36,-30 Q-38,-52 0,-56 Q38,-52 36,-30', 'none', { stroke: C.woodL!, sw: 2, op: 0.7 });
    for (const x of [-30, 30]) s += path(`M${x - 5},-27 Q${x - 5},-54 ${x},-57 Q${x + 5},-54 ${x + 5},-27 Z`, C.ironD!, { sw: 1.6 });
    s += path('M-40,-2 Q-30,-22 -10,-16 Q0,-26 12,-17 Q30,-24 40,-2 Z', C.gold!, { sw: 2 });
    for (const [x, y] of [[-26, -12], [-12, -18], [2, -21], [16, -16], [28, -10], [-4, -10], [10, -8]] as const) s += ell(x, y, 5, 3, C.goldL!, { sw: 1, stroke: C.goldD! });
    s += path('M-6,-30 l2,6 l6,2 l-6,2 l-2,6 l-2,-6 l-6,-2 l6,-2z', '#fff6c0', { sw: 0 }) + path('M22,-34 l1.4,4 l4,1.4 l-4,1.4 l-1.4,4 l-1.4,-4 l-4,-1.4 l4,-1.4z', '#fff6c0', { sw: 0 });
  } else {
    // 合着的拱顶盖和锁
    s += path('M-46,0 L-46,-12 Q-46,-34 0,-36 Q46,-34 46,-12 L46,0 Z', C.wood!, { sw: 2.6 }) + path('M-40,-12 Q-40,-28 0,-30 Q40,-28 40,-12', 'none', { stroke: C.woodL!, sw: 2, op: 0.7 });
    for (const x of [-30, 30]) s += path(`M${x - 5},0 L${x - 5},-28 Q${x},-31 ${x + 5},-28 L${x + 5},0 Z`, C.ironD!, { sw: 1.8 });
    s += rect(-8, -8, 16, 18, C.gold!, { sw: 2, r: 3 }) + ell(0, 0, 2.6, 2.6, C.ink!, { sw: 0 }) + rect(-1, 1, 2, 5, C.ink!, { sw: 0 });
  }
  a = piece(key, 120, open ? 112 : 96, 60, open ? 70 : 54, s);
  cache.set(key, a);
  return a;
}
