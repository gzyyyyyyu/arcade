import { PALETTE as P } from './art/palette.ts';
import { h32 } from './art/grade.ts';

/**
 * 界面皮肤：海盗材质（木板 + 铜钉、羊皮纸、麻绳）。
 * 不放图片文件：木纹、羊皮纸斑、麻绳三张小纹理在第一次开界面时用 canvas 画一次（按固定编号散列，确定性），
 * 转成 data URL 写进根节点的 CSS 变量；铜钉是 CSS 渐变。样式全部限定在 `.hd-ui.hd-skin` 下，
 * 比各界面自己的 `.hd-ui .hd-xxx` 多一级，所以不用管注入的先后；各界面的布局规则不动，只换底色、边框、阴影和按下手感。
 */

type Draw = (g: CanvasRenderingContext2D, w: number, h: number) => void;

/** 画一张小纹理，返回 `url("data:…")`；没有 DOM（单测）返回空串，皮肤退回纯渐变 */
function tile(w: number, h: number, draw: Draw): string {
  if (typeof document === 'undefined') return '';
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (!g) return '';
  draw(g, w, h);
  return `url("${c.toDataURL('image/png')}")`;
}

const rnd = (a: number, b: number): number => (h32(a, b, 4107) % 10000) / 10000;

/** 木纹：只有半透明的深浅纹路（叠在各种木色渐变上），左右上下都能无缝平铺 */
function woodTex(): string {
  return tile(128, 64, (g, w, h) => {
    const lines = 13;
    for (let i = 0; i < lines; i++) {
      const y0 = ((i + 0.5) * h) / lines + (rnd(i, 1) - 0.5) * 2;
      const amp = 0.8 + rnd(i, 2) * 2.2;
      const k = 1 + (h32(i, 3) % 2);
      const ph = rnd(i, 4) * 6.283;
      g.strokeStyle = `rgba(52,26,8,${(0.09 + rnd(i, 5) * 0.14).toFixed(3)})`;
      g.lineWidth = 0.7 + rnd(i, 6) * 1.1;
      g.beginPath();
      for (let x = 0; x <= w; x += 4) {
        const y = y0 + Math.sin((x / w) * 6.283 * k + ph) * amp;
        if (x === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
      if (i % 3 === 0) {
        g.strokeStyle = 'rgba(255,226,170,0.10)';
        g.lineWidth = 0.8;
        g.beginPath();
        for (let x = 0; x <= w; x += 4) {
          const y = y0 + 2.2 + Math.sin((x / w) * 6.283 * k + ph) * amp;
          if (x === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.stroke();
      }
    }
    // 两个木节
    for (const [kx, ky] of [[34, 22], [96, 47]] as const) {
      g.strokeStyle = 'rgba(48,22,6,0.26)';
      g.lineWidth = 1.2;
      g.beginPath();
      g.ellipse(kx, ky, 5, 2.6, 0, 0, 6.283);
      g.stroke();
      g.beginPath();
      g.ellipse(kx, ky, 2.2, 1.1, 0, 0, 6.283);
      g.stroke();
    }
  });
}

/** 羊皮纸：深浅不一的褐色斑、纤维和小黑点（半透明，叠在奶黄渐变上） */
function parchTex(): string {
  return tile(128, 128, (g, w, h) => {
    for (let i = 0; i < 16; i++) {
      const x = rnd(i, 10) * w;
      const y = rnd(i, 11) * h;
      const r = 14 + rnd(i, 12) * 26;
      const a = 0.04 + rnd(i, 13) * 0.08;
      for (const dx of [-w, 0, w]) {
        for (const dy of [-h, 0, h]) {
          const gr = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
          gr.addColorStop(0, `rgba(136,92,38,${a.toFixed(3)})`);
          gr.addColorStop(1, 'rgba(136,92,38,0)');
          g.fillStyle = gr;
          g.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
        }
      }
    }
    g.lineWidth = 0.7;
    for (let i = 0; i < 90; i++) {
      const x = rnd(i, 20) * w;
      const y = rnd(i, 21) * h;
      const a = rnd(i, 22) * 6.283;
      g.strokeStyle = `rgba(110,72,28,${(0.05 + rnd(i, 23) * 0.07).toFixed(3)})`;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(a) * 5, y + Math.sin(a) * 5);
      g.stroke();
    }
    for (let i = 0; i < 50; i++) {
      g.fillStyle = `rgba(80,50,18,${(0.08 + rnd(i, 31) * 0.1).toFixed(3)})`;
      g.fillRect(Math.floor(rnd(i, 30) * w), Math.floor(rnd(i, 32) * h), 1, 1);
    }
  });
}

/** 麻绳：45 度的斜股，周期 8 像素，边框图（border-image 切 8 像素）四边都对得上 */
function ropeTex(): string {
  return tile(24, 24, (g, w, h) => {
    g.fillStyle = '#b48a52';
    g.fillRect(0, 0, w, h);
    g.lineCap = 'butt';
    for (let c = 0; c <= w + h; c += 8) {
      g.strokeStyle = 'rgba(58,32,10,0.85)';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(c, 0);
      g.lineTo(c - h, h);
      g.stroke();
      g.strokeStyle = 'rgba(238,212,156,0.9)';
      g.lineWidth = 2.2;
      g.beginPath();
      g.moveTo(c + 3.4, 0);
      g.lineTo(c + 3.4 - h, h);
      g.stroke();
    }
  });
}

/** 把三张纹理写成根节点上的 CSS 变量，并打上 hd-skin 类。重复调用只做一次 */
export function applySkin(root: HTMLElement): void {
  if (root.classList.contains('hd-skin')) return;
  root.classList.add('hd-skin');
  const wood = woodTex();
  const parch = parchTex();
  const rope = ropeTex();
  // 没有纹理时用 none，background 简写里的这一层就被跳过
  root.style.setProperty('--hd-wood', wood || 'none');
  root.style.setProperty('--hd-parch', parch || 'none');
  root.style.setProperty('--hd-rope', rope || 'none');
}

export function skinCss(): string {
  const ink = P.ink!;
  // 铜钉：四角各一颗（8×8），亮点 → 铜 → 暗边
  const nail = 'radial-gradient(circle at 38% 36%,#fff3c0 0 1px,#dcaa3e 2px,#6e4812 3.4px,rgba(60,35,10,.0) 4px)';
  const nails = ['left 4px top 4px', 'right 4px top 4px', 'left 4px bottom 4px', 'right 4px bottom 4px'].map((p) => `${nail} ${p}/8px 8px no-repeat`).join(',');
  // 胶囊只在两头各一颗，不挤数字
  const nails2 = ['left 6px center', 'right 6px center'].map((p) => `${nail} ${p}/8px 8px no-repeat`).join(',');
  const plank = (a: string, b: string): string => `${nails},var(--hd-wood),linear-gradient(${a},${b})`;
  const plank2 = (a: string, b: string): string => `${nails2},var(--hd-wood),linear-gradient(${a},${b})`;
  const lift = 'inset 0 2px 0 rgba(255,238,200,.5),inset 0 -3px 0 rgba(66,34,10,.34)';
  const W = '.hd-ui.hd-skin';
  const parchBg = (a = '#f7ead0', b = '#e6cf9c'): string => `var(--hd-parch),linear-gradient(${a},${b})`;
  const frame = `border:6px solid transparent; border-image:var(--hd-rope) 8 round; border-radius:4px; background-clip:padding-box;`;
  const frameShadow = `box-shadow:0 0 0 2px ${ink}, inset 0 0 0 2px rgba(43,26,21,.55), inset 0 0 26px rgba(120,72,22,.34), 0 12px 24px rgba(10,8,20,.5);`;
  return `
/* ---------- 界面皮肤（skin.ts）：木板 + 铜钉、羊皮纸、麻绳 ---------- */
${W} { --hd-plank-a:#ecc088; --hd-plank-b:#cf9250; }
/* 按钮：木板，按下去（下移 3 像素、阴影缩短）再弹回来（回弹曲线） */
${W} .hd-btn { border:3px solid ${ink}; border-radius:10px; background:${plank('#ecc088', '#cf9250')}; color:${ink}; text-shadow:0 1px 0 rgba(255,236,200,.35);
  box-shadow:${lift},0 4px 0 ${ink}; transition:transform .18s cubic-bezier(.3,2,.5,1),box-shadow .18s ease-out,filter .15s; }
${W} .hd-btn:active:not(:disabled) { transform:translateY(3px); transition-duration:.04s;
  box-shadow:inset 0 2px 0 rgba(0,0,0,.2),inset 0 -2px 0 rgba(66,34,10,.25),0 1px 0 ${ink}; }
${W} .hd-btn:disabled { opacity:.6; filter:grayscale(.6) brightness(.9); box-shadow:inset 0 2px 0 rgba(255,238,200,.3),0 2px 0 ${ink}; }
${W} .hd-btn.hd-btn-plain { background:${plank('#ecc088', '#cf9250')}; }
${W} .hd-btn.hd-btn-gold { background:${plank('#ffe58a', '#e0a824')}; color:${ink}; text-shadow:0 1px 0 rgba(255,250,210,.5); }
${W} .hd-btn.hd-btn-wood { background:${plank('#b3703a', '#7f4824')}; color:#fff4dc; text-shadow:0 1px 0 ${P.woodDD}; }
${W} .hd-btn.hd-btn-red { background:${plank('#dd4a3d', '#a8261f')}; color:#fff; text-shadow:0 1px 0 rgba(70,10,8,.6); }
${W} .hd-btn.sel, ${W} .hd-btn.hd-skill.sel { background:${plank('#ffe58a', '#e0a824')}; }
/* 两个右上角的小开关和关闭键：不画钉子，免得 44 像素的方块里挤 */
${W} .hd-mute, ${W} .hd-feel, ${W} .hd-x, ${W} .hd-hall { background:var(--hd-wood),linear-gradient(#ecc088,#cf9250); }

/* 顶栏胶囊：深色木牌，两头一颗钉；字用奶白，红色提示改浅 */
${W} .hd-pill { border:3px solid ${ink}; border-radius:20px; padding:0 15px 0 14px; background:${plank2('#a86a34', '#76441f')}; color:#fff4dc; text-shadow:0 1px 0 rgba(40,20,6,.7);
  box-shadow:${lift},0 3px 0 ${ink}; }
${W} .hd-pill small { opacity:.85; }
${W} .hd-pill.full b, ${W} .hd-pill .hd-short { color:#ffb7a8; }
${W} .hd-pill.hurt { background:${plank2('#d4553f', '#9a2a20')}; border-color:${ink}; }
${W} .hd-en, ${W} .hd-td-store { background:${plank2('#a86a34', '#76441f')}; color:#fff4dc; border:3px solid ${ink}; box-shadow:${lift},0 3px 0 ${ink}; padding-left:16px; padding-right:16px; }
${W} .hd-td-store .hd-short, ${W} .hd-en .hd-short { color:#ffb7a8; }
${W} .hd-bounty { background:${plank2('#a86a34', '#76441f')}; color:#fff4dc; border:3px solid ${ink}; box-shadow:${lift},0 3px 0 ${ink}; padding-left:16px; }
${W} .hd-td-paused { background:var(--hd-wood),linear-gradient(#ffe58a,#e0a824); }

/* 底栏：一条横木板，上沿有光、下沿暗，按钮坐在上面 */
${W} .hd-bottom, ${W} .hd-td-bottom { background:linear-gradient(rgba(255,226,170,.5) 0 2px,rgba(43,26,21,.0) 2px),var(--hd-wood),linear-gradient(#8a5028,#5e3719);
  border-top:3px solid ${ink}; box-shadow:0 -4px 14px rgba(20,10,4,.35); padding-top:8px; }
${W} .hd-bottom .hd-btn, ${W} .hd-td-bottom .hd-btn { box-shadow:${lift},0 4px 0 ${ink}; }

/* 面板：羊皮纸 + 麻绳边；弹窗、底部抽屉、各种信息卡 */
${W} .hd-dialog, ${W} .hd-sheet, ${W} .hd-td-sheet, ${W} .hd-tut-tip { background:${parchBg()}; ${frame} ${frameShadow} }
${W} .hd-sheet, ${W} .hd-td-sheet { border-bottom-width:0; border-radius:4px 4px 0 0; }
${W} .hd-td-income, ${W} .hd-tidecard, ${W} .hd-tdcard, ${W} .hd-scout-info, ${W} .hd-preset, ${W} .hd-live-card, ${W} .hd-pvp-item {
  background:${parchBg('#f7ead0', '#e9d4a2')}; border:3px solid ${ink}; border-radius:8px; box-shadow:inset 0 0 18px rgba(120,72,22,.28),0 3px 0 ${ink}; }
${W} .hd-live-card, ${W} .hd-pvp-item { box-shadow:inset 0 0 14px rgba(120,72,22,.26); border:2px solid rgba(94,55,25,.7); }
${W} .hd-card, ${W} .hd-td-tower, ${W} .hd-td-branch, ${W} .hd-tdtab, ${W} .hd-boat { background:${parchBg('#f9eed6', '#e8d2a0')}; border:3px solid ${ink};
  box-shadow:inset 0 2px 0 rgba(255,250,230,.7),inset 0 0 14px rgba(120,72,22,.25),0 3px 0 ${ink}; transition:transform .18s cubic-bezier(.3,2,.5,1),box-shadow .18s ease-out; }
${W} .hd-card:active, ${W} .hd-td-tower:active:not(:disabled), ${W} .hd-td-branch:active:not(:disabled), ${W} .hd-tdtab:active, ${W} .hd-boat:active { transform:translateY(3px); transition-duration:.04s; box-shadow:inset 0 0 14px rgba(120,72,22,.25),0 0 0 ${ink}; }
${W} .hd-boat.sel, ${W} .hd-tdtab.on { background:var(--hd-wood),linear-gradient(#ffe58a,#e0a824); }
${W} .hd-td-tower:disabled, ${W} .hd-td-branch:disabled { filter:grayscale(.5) brightness(.92); }
${W} .hd-unlock, ${W} .hd-newitem, ${W} .hd-advice, ${W} .hd-badgerow, ${W} .hd-ach { background:rgba(255,250,232,.5); border:2px solid rgba(94,55,25,.7); }
${W} .hd-chip, ${W} .hd-item { background:rgba(150,100,40,.18); }
${W} .hd-node span.hd-lb { background:var(--hd-wood),linear-gradient(#e6b878,#c78d4c); border:3px solid ${ink}; border-radius:8px; box-shadow:${lift},0 2px 0 ${ink}; }
${W} .hd-node.lock span.hd-lb { background:var(--hd-wood),linear-gradient(#b8aa94,#8d806c); }
${W} .hd-num, ${W} .hd-tdnum { background:var(--hd-wood),radial-gradient(circle at 38% 34%,#ffe58a,#d9a02a); }
${W} .hd-scout-map, ${W} .hd-preset-map { border:4px solid ${ink}; }
${W} .hd-toast { background:var(--hd-wood),linear-gradient(#5e3719,#40230d); border:2px solid ${ink}; }
${W} .hd-hint { background:var(--hd-wood),linear-gradient(rgba(94,55,25,.95),rgba(64,35,13,.95)); border:2px solid ${ink}; }

/* 麻绳分隔线：标题栏下面、各段标题上面一条绳 */
${W} .hd-head { padding-bottom:8px; margin-bottom:10px; background:linear-gradient(135deg,rgba(58,32,10,.0) 0 40%,transparent 40%),
  repeating-linear-gradient(135deg,#8c6a3a 0 2px,#e2c88e 2px 4px,#8c6a3a 4px 5px,#6a4a22 5px 8px) left bottom/100% 5px no-repeat; }
${W} .hd-td-sub, ${W} .hd-sheet h2 + .hd-desc { }
${W} .hd-live-note, ${W} .hd-scout-tip { }
${W} .hd-mask { background:radial-gradient(ellipse at 50% 45%,rgba(20,35,58,.45),rgba(8,14,28,.78)); }

/* ---------- 战斗 / 守岛底部的兵种卡和技能钮：三种状态一眼分清 ----------
   选中：金底、整张卡上浮、外圈金光；冷却 / 充能：暗化加进度（扫光、进度条）；不可用（用完、没能量、英雄倒下）：去饱和加锁 */
${W} .hd-boats, ${W} .hd-skills { padding-top:14px; padding-bottom:6px; }
${W} .hd-boat { position:relative; min-height:96px; }
${W} .hd-boat.sel { transform:translateY(-9px); border-color:${ink}; box-shadow:inset 0 2px 0 rgba(255,250,210,.7),0 6px 0 ${ink},0 0 0 3px rgba(255,214,90,.95),0 0 18px rgba(255,214,90,.85); }
${W} .hd-boat.done { filter:grayscale(1) brightness(.82); opacity:.72; }
${W} .hd-boat.done::after { content:''; position:absolute; left:4px; top:4px; width:20px; height:20px; background:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><rect x='3' y='7' width='10' height='7' rx='1.5' fill='%23e0a824' stroke='%232b1a15' stroke-width='1.5'/><path d='M5 7V5a3 3 0 0 1 6 0v2' fill='none' stroke='%232b1a15' stroke-width='1.8'/></svg>") center/contain no-repeat; }
${W} .hd-skill { position:relative; min-height:52px; overflow:hidden; }
${W} .hd-skill.sel, ${W} .hd-td-skill.sel { transform:translateY(-8px); box-shadow:${lift},0 6px 0 ${ink},0 0 0 3px rgba(255,214,90,.95),0 0 16px rgba(255,214,90,.8); }
${W} .hd-skill.off { filter:saturate(.25) brightness(.8); opacity:1; padding-bottom:8px; }
${W} .hd-skill.off::before { content:''; position:absolute; left:8px; right:8px; bottom:4px; height:6px; border:1.5px solid ${ink}; border-radius:4px;
  background:linear-gradient(90deg,#ffd23f var(--p,0%),rgba(43,26,21,.6) 0); }
${W} .hd-skill.off::after { content:''; position:absolute; left:3px; top:3px; width:16px; height:16px; background:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><rect x='3' y='7' width='10' height='7' rx='1.5' fill='%23e0a824' stroke='%232b1a15' stroke-width='1.5'/><path d='M5 7V5a3 3 0 0 1 6 0v2' fill='none' stroke='%232b1a15' stroke-width='1.8'/></svg>") center/contain no-repeat; }
${W} .hd-td-skill { min-height:68px; }
${W} .hd-td-skill .hd-cd { background:conic-gradient(rgba(14,22,40,.7) var(--cd,0deg),transparent 0); }
${W} .hd-td-skill.cool { filter:saturate(.35) brightness(.88); }
${W} .hd-td-skill.off { filter:saturate(0) brightness(.7); }
${W} .hd-td-skill.off::after { content:''; position:absolute; right:3px; top:3px; width:18px; height:18px; background:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><rect x='3' y='7' width='10' height='7' rx='1.5' fill='%23e0a824' stroke='%232b1a15' stroke-width='1.5'/><path d='M5 7V5a3 3 0 0 1 6 0v2' fill='none' stroke='%232b1a15' stroke-width='1.8'/></svg>") center/contain no-repeat; }

/* ---------- 结算演出（画面部分）：框落下 → 横幅落下 → 星星依次落 → 战利品滚动 → 按钮最后淡入 ---------- */
${W} .hd-dialog.hd-result, ${W} .hd-dialog.hd-td-result { position:relative; animation:hd-resin .6s cubic-bezier(.2,1.3,.4,1) both; }
${W} .hd-result h2, ${W} .hd-td-result h2 { position:relative; margin:-28px -16px 12px; padding:6px 18px 8px; font-size:24px; letter-spacing:1px; text-align:center;
  background:var(--hd-wood),linear-gradient(#ffe58a,#e0a824); color:${ink}; border:3px solid ${ink}; border-radius:6px; text-shadow:0 1px 0 rgba(255,250,210,.6);
  box-shadow:${lift},0 4px 0 ${ink}; clip-path:polygon(0 0,100% 0,calc(100% - 12px) 50%,100% 100%,0 100%,12px 50%);
  animation:hd-banner .7s .12s cubic-bezier(.25,1.5,.45,1) both; }
${W} .hd-lose h2 { background:var(--hd-wood),linear-gradient(#5d7088,#3a4a60); color:#f1eadb; text-shadow:0 1px 0 rgba(10,16,30,.7); animation:hd-banner-soft .9s .15s ease-out both; }
${W} .hd-lose.hd-dialog { animation:hd-resin-soft .9s ease-out both; }
${W} .hd-result > :not(h2):not(.hd-stars):not(.hd-row):not(.hd-btn), ${W} .hd-td-result > :not(h2):not(.hd-stars):not(.hd-td-starrow):not(.hd-td-btns):not(.hd-btn) { animation:hd-rise .45s ease-out var(--sd,1s) both; }
${W} .hd-result .hd-loot { animation:none; }
${W} .hd-result .hd-row, ${W} .hd-result > .hd-btn, ${W} .hd-td-result .hd-td-btns, ${W} .hd-td-result > .hd-btn { animation:hd-rise .5s ease-out var(--fin,1.8s) both; }
/* 620 像素的转光比手机屏宽，溢出会让外层变得可横向滚动，聚焦按钮时整页被挪走一截（手机竖屏三星结算左移）；clip 不产生滚动区 */
${W} .hd-mask.hd-s3 { overflow:clip; }
${W} .hd-mask.hd-s3::before { content:''; position:absolute; left:50%; top:50%; width:620px; height:620px; margin:-330px 0 0 -310px; pointer-events:none;
  background:repeating-conic-gradient(rgba(255,226,120,.34) 0 9deg,transparent 9deg 18deg); -webkit-mask-image:radial-gradient(circle,#000 8%,transparent 68%); mask-image:radial-gradient(circle,#000 8%,transparent 68%);
  animation:hd-spin 22s linear infinite,hd-fadein 1s .5s both; }
${W} .hd-mask.hd-s3 .hd-stars .hd-img:not([style*="hidden"]) { filter:drop-shadow(0 0 6px rgba(255,226,120,.9)); }
@keyframes hd-resin { 0% { transform:translateY(-70px) scale(.9); opacity:0; } 60% { transform:translateY(6px) scale(1.01); opacity:1; } 100% { transform:none; } }
@keyframes hd-resin-soft { 0% { transform:translateY(-28px); opacity:0; } 100% { transform:none; opacity:1; } }
@keyframes hd-banner { 0% { transform:translateY(-120px) scaleY(.6); opacity:0; } 55% { transform:translateY(8px) scaleY(1.06); opacity:1; } 100% { transform:none; } }
@keyframes hd-banner-soft { 0% { transform:translateY(-40px); opacity:0; } 100% { transform:none; opacity:1; } }
@keyframes hd-rise { 0% { transform:translateY(10px); opacity:0; } 100% { transform:none; opacity:1; } }
@keyframes hd-fadein { 0% { opacity:0; } 100% { opacity:1; } }
@keyframes hd-spin { to { transform:rotate(360deg); } }
@media (prefers-reduced-motion:reduce) {
  ${W} .hd-dialog.hd-result, ${W} .hd-dialog.hd-td-result, ${W} .hd-result h2, ${W} .hd-td-result h2, ${W} .hd-mask.hd-s3::before { animation:none; }
  ${W} .hd-result > *, ${W} .hd-td-result > * { animation:none !important; }
}
`;
}
