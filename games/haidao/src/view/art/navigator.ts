/**
 * 守岛第二个英雄航海士的外观：只做分件骨架的部件（守岛英雄一直画完整骨架，不用整张帧），坐标约定同 troops.ts 的 DECO。
 * 一眼和船长分开：深青短外套（全场只有船长穿红）、奶白扎巾不戴三角帽、脑后一条长辫、端长管火枪、腰间挂黄铜单筒望远镜。
 */
import { ell, f, line, path, rect } from './kit.ts';
import { PALETTE as C } from './palette.ts';
import type { Look, TroopDeco } from './troops.ts';

/** 深青外套（急射旗旗面、选英雄钮也用这个色） */
const NAV_COAT = '#1f7a8c';
const COAT_D = '#155866';
const BRAID = '#4a2a1a';
const BRASS = '#d8a33c';

export const NAV_LOOK: Look = { scale: 1.56, skin: '#f1c09a', pants: '#3b3a4a', boot: '#2a1a14', shirt: NAV_COAT, half: 6.4, top: -24, head: 9.5 };

/** 腰间的单筒望远镜：黄铜两节、镜口一圈深色；gold 为 12 级的金边版 */
function spyglass(x: number, y: number, gold: boolean): string {
  const rim = gold ? C.gold! : BRASS;
  return rect(x - 1, y - 1.6, 9, 3.2, rim, { sw: 1.2 }) + rect(x + 7.6, y - 2.2, 4, 4.4, gold ? C.goldL! : '#b8862c', { sw: 1.2 }) + ell(x + 11.6, y, 0.9, 2, '#2a1c14', { sw: 0 });
}

export const NAV_DECO: TroopDeco = {
  headY: -33,
  // 长辫：从后脑垂到腰，一节一节编着，辫梢一个绳结
  back: (lean, b) => {
    let s = path(`M${f(lean - 7)},${f(-27 + b)} Q${f(lean - 12)},${f(-20 + b)} ${f(lean - 10)},${f(-11 + b)}`, 'none', { stroke: BRAID, sw: 4.6 });
    for (let i = 0; i < 4; i++) s += ell(lean - 8.6 - i * 0.8, -25 + i * 3.6 + b, 2.2, 1.6, darkenBraid(i), { sw: 0.9 });
    return s + ell(lean - 10, -10 + b, 1.6, 1.6, C.cream!, { sw: 0.9 });
  },
  torso: (x, yt, b) => {
    // 白衬衫的 V 领、两排扣、皮带和铜扣，腰侧挂望远镜
    let s = path(`M${f(x - 4.4)},${f(yt + 1.5)} L${f(x)},${f(yt + 7)} L${f(x + 4.4)},${f(yt + 1.5)} Z`, '#f6efe0', { sw: 1.2 });
    for (let i = 0; i < 2; i++) s += ell(x - 3.2, yt + 9 + i * 3.4, 0.9, 0.9, BRASS, { sw: 0 }) + ell(x + 3.2, yt + 9 + i * 3.4, 0.9, 0.9, BRASS, { sw: 0 });
    s += rect(x - 6.8, -14 + b, 13.6, 3, '#5a3a22', { sw: 1.3 }) + rect(x - 1.6, -14.3 + b, 3.2, 3.6, BRASS, { sw: 0.9 });
    return s + spyglass(x + 3, -11.4 + b, false);
  },
  // 短外套的下摆：到大腿，后片比前片长一点
  coat: (lean, b, sk) =>
    path(`M${f(lean - 7.4)},${f(-11.5 + b)} L${f(lean - 9.6 - sk)},${f(-5.4)} Q${f(lean)},${f(-3.6)} ${f(lean + 8.4 + sk * 0.6)},${f(-6.6)} L${f(lean + 7.4)},${f(-11.5 + b)} Z`, COAT_D, { sw: 1.6 }) +
    line([lean - 9 - sk, -5.8], [lean + 8 + sk * 0.6, -6.9], '#f6efe0', 1.1, 0.8),
  // 扎巾：奶白底一道深青条，结打在脑后，两条巾尾往后飘
  hat: (cx, cy) => {
    let s = path(`M${f(cx - 9.8)},${f(cy - 1.6)} A9.8,9.6 0 0 1 ${f(cx + 9.8)},${f(cy - 2)} Q${f(cx)},${f(cy - 5.4)} ${f(cx - 9.8)},${f(cy - 1.6)} Z`, C.cream!, { sw: 2 });
    s += path(`M${f(cx - 9.2)},${f(cy - 3.6)} Q${f(cx)},${f(cy - 7.2)} ${f(cx + 9.2)},${f(cy - 4)}`, 'none', { stroke: NAV_COAT, sw: 2.2 });
    s += path(`M${f(cx - 9)},${f(cy - 3)} q-7,0 -10,5 q5,-1 8,0 Z`, C.cream!, { sw: 1.6 }) + path(`M${f(cx - 9)},${f(cy - 2)} q-5,3 -6,9 q3,-3 6,-4 Z`, C.cream!, { sw: 1.6 });
    return s;
  },
};

function darkenBraid(i: number): string {
  return i % 2 === 0 ? '#5a3422' : '#3e2214';
}

/** 等级外观（坐标同 NAV_DECO）：4 级辫子上一个金扣，8 级金肩章（和船长同一副，rigparts 里加），12 级换金边望远镜 */
export const NAV_RANK = {
  clasp: (b = 0): string => ell(-9.6, -16 + b, 2.6, 1.8, C.gold!, { sw: 1.2 }) + ell(-9.6, -16 + b, 1, 0.7, C.goldL!, { sw: 0 }),
  goldGlass: (b = 0): string => spyglass(3, -11.4 + b, true),
};
