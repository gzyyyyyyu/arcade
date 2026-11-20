/**
 * 守岛界面的样式（选关页、局内顶栏底栏、预告卡、造塔面板、克制表、敌人图鉴、结算）。全部限定在 .hd-ui 下；
 * 第一次画守岛界面时注入一次。layout.ts 按屏幕尺寸的排布排在它后面注入、盖过这里。
 */
import { PALETTE as P } from './art/index.ts';
import { el } from './ui.ts';

let cssDone = false;
export function injectTdCss(): void {
  if (cssDone) return;
  cssDone = true;
  const st = el('style');
  st.textContent = tdCss();
  document.head.appendChild(st);
}

function tdCss(): string {
  const c = P;
  const ink = c.ink!, cream = c.cream!, creamD = c.creamD!, gold = c.gold!, red = c.red!, redD = c.redD!;
  return `
.hd-ui .hd-tdgar-rec { position:absolute; left:-3px; top:-3px; z-index:1; pointer-events:none; width:22px; height:22px; border-radius:50%; background:${gold}; color:${ink}; border:2px solid ${ink}; box-shadow:0 2px 0 ${ink}; font-size:12px; font-weight:900; line-height:18px; text-align:center; }
.hd-ui .hd-td-boss { display:none; position:absolute; left:50%; top:calc(60px + env(safe-area-inset-top,0px)); transform:translateX(-50%); width:min(300px,56vw); z-index:12; pointer-events:none; flex-direction:column; align-items:center; gap:2px; }
.hd-ui .hd-td-boss.on { display:flex; }
.hd-ui .hd-td-boss b { font-size:14px; line-height:1.1; color:#fff; text-shadow:0 0 3px ${ink}, 0 2px 0 ${ink}; }
.hd-ui .hd-td-boss-bar { display:block; width:100%; height:12px; background:${ink}; border:2px solid ${ink}; border-radius:7px; box-shadow:0 2px 0 rgba(0,0,0,.25); overflow:hidden; }
.hd-ui .hd-td-boss-bar i { display:block; height:100%; width:100%; border-radius:5px; background:linear-gradient(#ff6a5a,${red} 55%,${redD}); transition:width .25s ease-out; }
.hd-ui .hd-tdsel { position:absolute; inset:0; z-index:20; pointer-events:auto; background:linear-gradient(${c.seaLight},${c.sea} 40%,${c.seaDeep}); overflow-y:auto; padding:56px 10px 24px; }
.hd-ui .hd-tdsel-head { display:flex; align-items:center; justify-content:center; margin:0 auto; width:min(100%,520px); padding-left:84px; padding-right:60px; min-height:44px; }
.hd-ui .hd-tdsel-head h2 { margin:0; font-size:20px; flex:1; text-align:center; text-shadow:0 2px 0 rgba(255,255,255,.5); }
.hd-ui .hd-td-income { width:min(100%,520px); margin:6px auto 10px; background:${cream}; border:3px solid ${ink}; border-radius:14px; padding:6px 12px; display:flex; flex-wrap:wrap; gap:4px 14px; align-items:center; box-shadow:0 3px 0 ${ink}; }
.hd-ui .hd-td-inc { display:inline-flex; align-items:center; gap:4px; }
.hd-ui .hd-td-inc small { opacity:.7; }
.hd-ui .hd-td-capnote { flex-basis:100%; color:${redD}; font-weight:800; }
.hd-ui .hd-tidecard { display:flex; align-items:center; gap:10px; width:min(100%,520px); margin:0 auto 10px; background:${cream}; border:3px solid ${ink}; border-radius:14px; padding:8px 10px; box-shadow:0 3px 0 ${ink}; min-height:84px; }
.hd-ui .hd-tidecard.lock { filter:grayscale(.7); opacity:.8; }
.hd-ui .hd-tidecard .hd-btn { flex:none; min-width:74px; min-height:44px; }
.hd-ui .hd-tidebest { font-weight:800; opacity:1 !important; }
.hd-ui .hd-tdsel-live { display:block; width:min(100%,520px); min-height:44px; margin:0 auto 10px; }
.hd-ui .hd-tdtabs { width:min(100%,520px); margin:0 auto 6px; display:flex; gap:8px; }
.hd-ui .hd-tdtab { flex:1 1 0; min-width:0; min-height:48px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:0; padding:2px 4px; font:inherit; color:inherit; cursor:pointer; background:#fff8e6; border:3px solid ${ink}; border-radius:12px; box-shadow:0 3px 0 ${ink}; }
.hd-ui .hd-tdtab b { font-size:14px; font-weight:900; }
.hd-ui .hd-tdtab small { font-size:12px; opacity:.85; }
.hd-ui .hd-tdtab.on { background:linear-gradient(${c.goldL},${gold}); transform:translateY(2px); box-shadow:0 1px 0 ${ink}; }
/* 说明行压在浅青的海上：白字直接压对比度只有 2:1，垫一块深海色底（白字对比度约 6:1） */
.hd-ui .hd-tdtheme { display:block; width:fit-content; max-width:min(100%,720px); margin:0 auto 8px; padding:2px 10px; border-radius:8px; background:rgba(11,74,110,.88); font-size:14px; font-weight:800; color:#fff; text-align:center; }
.hd-ui .hd-tdsel-list { width:min(100%,520px); margin:0 auto; display:flex; flex-direction:column; gap:10px; }
.hd-ui .hd-tdcard { display:flex; align-items:center; gap:10px; background:${cream}; border:3px solid ${ink}; border-radius:14px; padding:8px 10px; box-shadow:0 3px 0 ${ink}; min-height:84px; }
.hd-ui .hd-tdcard.lock { filter:grayscale(.7); opacity:.8; }
.hd-ui .hd-tdnum { flex:none; width:34px; height:34px; border-radius:50%; background:${gold}; border:3px solid ${ink}; display:flex; align-items:center; justify-content:center; font-weight:900; font-size:16px; }
.hd-ui .hd-tdmid { flex:1; min-width:0; display:flex; flex-direction:column; gap:1px; }
.hd-ui .hd-tdname { font-size:16px; font-weight:900; }
.hd-ui .hd-tdmid small { font-size:14px; opacity:.85; }
.hd-ui .hd-tdmid small.hd-short { color:${red}; opacity:1; font-weight:800; }
.hd-ui .hd-tdnew { color:${c.grassDD}; font-weight:800; opacity:1 !important; }
.hd-ui .hd-tdlock { color:${redD}; }
.hd-ui .hd-tdcard .hd-btn { flex:none; min-width:74px; }
.hd-ui .hd-tdsel-foot { text-align:center; color:#fff; text-shadow:0 1px 0 ${c.seaDark}; }
.hd-ui .hd-tdsel-close { position:absolute; top:6px; right:6px; z-index:31; }
/* 页面切换：选关页 → 驻守台面板，新页从右侧滑入，旧页往左淡出 */
.hd-ui .hd-tdpage { animation:hd-tdpagein .26s cubic-bezier(.2,.9,.3,1) both; transition:transform .26s cubic-bezier(.2,.9,.3,1), opacity .26s ease-out; }
.hd-ui .hd-tdpage.away { transform:translateX(-18%); opacity:0; pointer-events:none !important; }
@keyframes hd-tdpagein { 0% { transform:translateX(14%); opacity:0; } 100% { transform:none; opacity:1; } }
@keyframes hd-tdin { 0% { transform:translateY(-6px); opacity:0; } 100% { transform:none; opacity:1; } }
.hd-ui .hd-tdmodes { width:min(100%,520px); margin:0 auto; display:grid; grid-template-columns:1fr; gap:0 10px; }
@media (min-width:700px) { .hd-ui .hd-tdmodes { width:min(100%,760px); grid-template-columns:1fr 1fr; } }
.hd-ui .hd-tdmodes .hd-tidecard { width:auto; margin:0 0 10px; }
.hd-ui .hd-homecard { background:linear-gradient(#fff1d6,${cream}); }
.hd-ui .hd-homecard .hd-home-hard { min-width:60px; }
/* 加难、带谁、出发三个钮一组，放不下时（手机横竖屏）整组换到第二行靠右，说明不被挤成一字一行 */
.hd-ui .hd-homecard { flex-wrap:wrap; row-gap:6px; }
.hd-ui .hd-homecard .hd-tdmid { flex:1 1 150px; }
.hd-ui .hd-homecard .hd-home-acts { display:flex; gap:10px; margin-left:auto; }
.hd-ui .hd-homecard .hd-home-hard.on { background:#c0392b; color:#fff8ec; border-color:${ink}; }
/* 带哪个英雄：航海士用她外套的深青色，船长是默认的木色 */
.hd-ui :is(.hd-homecard,.hd-tdgar-btns) .hd-tdhero { min-width:92px; white-space:nowrap; flex:0 1 auto; }
.hd-ui :is(.hd-homecard,.hd-tdgar-btns) .hd-tdhero.on { background:#1f7a8c; color:#fff8ec; border-color:${ink}; }
.hd-ui.hd-skin .hd-tdsel-main .hd-tdcard.next { border-color:${gold}; box-shadow:0 3px 0 ${ink}, 0 0 0 3px ${gold}, 0 0 14px ${gold}; }
.hd-ui .hd-tdrule { font-weight:700; }
/* 窄屏上星级规则、选关页标题折行时两行匀开，不剩一个字孤零零挂在第二行（「…算输」「…驻守台」） */
.hd-ui .hd-tdrule, .hd-ui .hd-tdsel h2, .hd-ui .hd-tdgar h2 { text-wrap:balance; }
.hd-ui .hd-tdgar { z-index:22; }
.hd-ui .hd-tdgar-note { width:min(100%,560px); margin:0 auto 10px; padding:2px 10px; border-radius:8px; background:rgba(11,74,110,.88); font-size:14px; color:#fff; }
.hd-ui .hd-tdgar-spot { width:min(100%,560px); margin:0 auto 10px; background:${cream}; border:3px solid ${ink}; border-radius:14px; padding:8px 10px; box-shadow:0 3px 0 ${ink}; }
.hd-ui .hd-tdgar-title { display:flex; align-items:baseline; gap:8px; margin-bottom:6px; }
.hd-ui .hd-tdgar-title b { font-size:16px; font-weight:900; }
.hd-ui .hd-tdgar-title small { font-size:14px; }
.hd-ui .hd-tdgar-row { display:grid; grid-template-columns:repeat(auto-fill,minmax(104px,1fr)); gap:8px; }
.hd-ui .hd-tdgar-card { position:relative; display:flex; flex-direction:column; align-items:center; gap:2px; min-height:118px; padding:5px 4px; border:3px solid ${ink}; border-radius:12px; background:#fff8e6; font:inherit; color:inherit; cursor:pointer; transition:transform .12s, box-shadow .12s; box-shadow:0 3px 0 ${ink}; }
.hd-ui .hd-tdgar-card b { font-size:14px; }
.hd-ui .hd-tdgar-card small { font-size:12px; }
/* 选中不上浮：金底和外发光已经够醒目，上浮 3 像素会让它和上一行的卡只隔 5 像素（点按目标要隔 8） */
.hd-ui .hd-tdgar-card.on { background:linear-gradient(${c.goldL},${gold}); box-shadow:0 5px 0 ${ink}, 0 0 0 3px #fff3b0; }
.hd-ui .hd-tdgar-card:active { transform:translateY(2px); box-shadow:0 1px 0 ${ink}; }
.hd-ui .hd-tdgar-card:disabled { opacity:.5; filter:grayscale(.7); cursor:default; }
@media (hover:hover) and (pointer:fine) { .hd-ui .hd-tdgar-card:hover:not(:disabled) { filter:brightness(1.08); } }
.hd-ui .hd-tdgar-tier strong { font-size:14px; font-weight:900; color:${c.grassDD}; }
.hd-ui .hd-tdgar-bonus { color:${c.grassDD}; font-weight:800; }
.hd-ui .hd-tdgar-empty { display:block; margin-top:6px; color:${redD}; font-weight:800; }
.hd-ui .hd-tdgar-btns { width:min(100%,560px); margin:12px auto 0; }
.hd-ui .hd-tdgar-btns .hd-btn { min-height:52px; font-size:16px; }

/* 选关页版面：左栏（标题、收入、玩法入口）+ 右栏（章节页签、关卡）。电脑上下叠、关卡 3 列；手机竖屏 1 列、章内翻页；
   手机横屏左右并排。比 layout.ts 的 .hd-ui.hd-skin 规则多一级，盖得过它的 720 宽 */
.hd-ui.hd-skin .hd-tdsel-main { display:flex; flex-direction:column; align-items:center; gap:8px; padding:6px 8px 8px; }
.hd-ui.hd-skin .hd-tdsel-main .hd-tdsel-l, .hd-ui.hd-skin .hd-tdsel-main .hd-tdsel-r { width:min(100%,1040px); min-width:0; display:flex; flex-direction:column; gap:6px; }
.hd-ui.hd-skin .hd-tdsel-main :is(.hd-tdsel-head,.hd-td-income,.hd-tidecard,.hd-tdsel-live,.hd-tdtabs,.hd-tdtheme,.hd-tdsel-list,.hd-tdmodes,.hd-tdsel-top) { width:100%; margin:0; }
.hd-ui.hd-skin .hd-tdsel-main .hd-tdsel-head { padding:0 136px 0 84px; }
.hd-ui.hd-skin .hd-tdsel-main .hd-tdsel-top { display:grid; grid-template-columns:1fr auto; gap:8px; }
.hd-ui.hd-skin .hd-tdsel-main .hd-td-income { padding:4px 12px; gap:2px 12px; }
.hd-ui.hd-skin .hd-tdsel-main .hd-td-income > small:first-child { flex-basis:auto; }
.hd-ui.hd-skin .hd-tdsel-main .hd-tdsel-live { display:flex; align-items:center; justify-content:center; min-height:44px; padding:0 20px; }
.hd-ui.hd-skin .hd-tdsel-main .hd-tdmodes { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
.hd-ui.hd-skin .hd-tdsel-main .hd-tdmodes .hd-tidecard { margin:0; min-height:0; padding:6px 10px; }
.hd-ui.hd-skin .hd-tdsel-main .hd-tidecard .hd-tdmid small { font-size:12px; }
.hd-ui.hd-skin .hd-tdsel-main .hd-tdtab { min-height:44px; }
.hd-ui.hd-skin .hd-tdsel-main .hd-tdtheme { width:fit-content; max-width:100%; align-self:center; margin:0; font-size:12px; line-height:1.25; }
.hd-ui.hd-skin .hd-tdsel-main .hd-tdsel-list { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; align-content:start; }
.hd-ui.hd-skin .hd-tdsel-main .hd-tdsel-foot { grid-column:1 / -1; }
.hd-ui.hd-skin .hd-tdsel-main .hd-tdcard { display:grid; grid-template-columns:auto minmax(0,1fr) auto; align-items:center; gap:4px 8px; min-height:0; padding:6px 8px; }
.hd-ui.hd-skin .hd-tdsel-main .hd-tdcard .hd-btn { min-width:64px; min-height:44px; padding:0 8px; }
.hd-ui.hd-skin .hd-tdsel-main .hd-tdinfo { grid-column:1 / -1; display:flex; flex-direction:column; }
.hd-ui.hd-skin .hd-tdsel-main .hd-tdinfo small { font-size:12px; line-height:1.3; opacity:.9; }
.hd-ui.hd-skin .hd-tdsel-main .hd-tdinfo small.hd-short { color:${red}; opacity:1; font-weight:800; }
.hd-ui.hd-skin .hd-tdsel-main .hd-tdinfo small.hd-tdnew { color:${c.grassDD}; font-weight:800; opacity:1; }
.hd-ui.hd-skin .hd-tdsel-main .hd-tdinfo small.hd-tdlock { color:${redD}; }
.hd-ui.hd-skin .hd-tdsel-main .hd-tdname { font-size:14px; line-height:1.2; }
/* 主寨不够的提醒是这一页最要紧的一句：羊皮纸小条 + 深红字（对比度约 6.7:1） */
.hd-ui.hd-skin .hd-tdsel-main .hd-tdwarn { background:${cream}; color:${redD}; border:2px solid ${ink}; }
/* 电脑和竖拿的平板：卡片顶上一张岛缩略图（td-ui.ts 的 THUMB_QUERY 才画）。两排卡分掉页面上半截（约 510 像素）以外的高度，720 到 1080 高都一屏放下 */
.hd-ui.hd-skin .hd-tdsel-main .hd-tdcard.thumb { align-content:start; }
.hd-ui.hd-skin .hd-tdsel-main .hd-tdthumb { grid-column:1 / -1; height:clamp(72px, calc((var(--app-h, 100vh) - 510px) / 2), 190px); margin:-2px -4px 2px; border-radius:10px; background:linear-gradient(#5fb8d6,#3d93b8); overflow:hidden; justify-content:center; }
.hd-ui.hd-skin .hd-tdsel-main .hd-tdthumb svg { width:auto; height:100%; max-width:100%; }
.hd-ui.hd-skin .hd-tdsel-main .hd-tdnum { font-size:16px; }
.hd-ui.hd-skin .hd-tdpager { display:none; align-items:center; justify-content:center; gap:12px; }
.hd-ui.hd-skin .hd-tdsel-main.paged .hd-tdpager { display:flex; }
.hd-ui.hd-skin .hd-tdpager .hd-btn { min-width:88px; min-height:44px; }
.hd-ui.hd-skin .hd-tdpager b { min-width:48px; text-align:center; color:#fff; text-shadow:0 1px 2px ${c.seaDark}; }
@media (pointer:coarse), (max-width:959px) { .hd-ui.hd-skin .hd-tdsel-main .hd-tdnum { width:44px; height:44px; } }
/* 手机竖屏：顶上一行本来只是给大厅、回岛、设置钮留的，悬赏入口就放进这一行正中，标题让位 */
@media (max-width:700px) and (orientation:portrait) {
  .hd-ui.hd-skin .hd-tdsel-main { position:absolute; }
  .hd-ui.hd-skin .hd-tdsel-main .hd-tdsel-head h2 { display:none; }
  .hd-ui.hd-skin .hd-tdsel-main .hd-tdsel-live { position:absolute; top:6px; left:calc(50% - 70px); width:116px; padding:0 2px; font-size:12px; z-index:1; }
  /* 一行放不下「今日守岛收入还剩」+ 两个「已用 / 上限」：以前硬塞一行，标题和「/ 304,800」各自折成两行；标题自己占一行，两个数各自不折 */
  .hd-ui.hd-skin .hd-tdsel-main .hd-td-income { flex-wrap:wrap; padding:3px 8px; gap:0 12px; }
  .hd-ui.hd-skin .hd-tdsel-main .hd-td-income > small:first-child { flex-basis:100%; }
  .hd-ui.hd-skin .hd-tdsel-main .hd-td-inc { white-space:nowrap; }
  .hd-ui.hd-skin .hd-tdsel-main .hd-td-income b { font-size:14px; }
  .hd-ui.hd-skin .hd-tdsel-main .hd-td-income small { font-size:12px; }
  .hd-ui.hd-skin .hd-tdsel-main .hd-td-income .hd-td-capnote { flex-basis:auto; }
  .hd-ui.hd-skin .hd-tdsel-main .hd-tdmodes .hd-tidecard { padding:4px 8px; }
  .hd-ui.hd-skin .hd-tdsel-main .hd-tdmodes .hd-tdname { font-size:14px; }
  .hd-ui.hd-skin .hd-tdsel-main .hd-tidecard .hd-tdmid small { line-height:1.2; }
}
@media (max-width:700px) {
  .hd-ui.hd-skin .hd-tdsel-main .hd-tdsel-top, .hd-ui.hd-skin .hd-tdsel-main .hd-tdmodes, .hd-ui.hd-skin .hd-tdsel-main .hd-tdsel-list { grid-template-columns:1fr; }
}
/* 手机横屏：左右并排，关卡 3 列、每张竖着摆（名字行 / 说明 / 按钮），一页 3 关 */
@media (orientation:landscape) and (max-height:500px) {
  .hd-ui.hd-skin .hd-tdsel-main { flex-direction:row; align-items:flex-start; }
  .hd-ui.hd-skin .hd-tdsel-main .hd-tdsel-l { width:300px; flex:none; }
  .hd-ui.hd-skin .hd-tdsel-main .hd-tdsel-r { flex:1 1 0; width:auto; }
  .hd-ui.hd-skin .hd-tdsel-main .hd-tdsel-head { padding:0 0 0 84px; }
  .hd-ui.hd-skin .hd-tdsel-main .hd-tdsel-top, .hd-ui.hd-skin .hd-tdsel-main .hd-tdmodes { grid-template-columns:1fr; }
  .hd-ui.hd-skin .hd-tdsel-main .hd-tdtabs { padding-right:176px; }
  .hd-ui.hd-skin .hd-tdsel-main .hd-tdsel-list { grid-template-columns:repeat(3,minmax(0,1fr)); }
  .hd-ui.hd-skin .hd-tdsel-main .hd-tdcard { grid-template-columns:auto minmax(0,1fr); }
  .hd-ui.hd-skin .hd-tdsel-main .hd-tdcard .hd-tdinfo { grid-row:2; }
  .hd-ui.hd-skin .hd-tdsel-main .hd-tdcard .hd-btn { grid-column:1 / -1; grid-row:3; }
}

/* 驻守台选塔页：一座台一块；多座台电脑上并排成列，手机和矮屏用顶上的台子页签一次摆一座；选项卡横排（图标在左、字在右）省高度 */
.hd-ui .hd-tdgar-main { display:flex; flex-direction:column; align-items:center; gap:8px; padding:6px 8px 8px; }
.hd-ui .hd-tdgar-main > * { width:min(100%,1040px); margin:0; }
.hd-ui .hd-tdgar-main .hd-tdsel-head { padding:0 136px 0 84px; }
.hd-ui .hd-tdgar-top { display:flex; align-items:center; gap:12px; }
.hd-ui .hd-tdgar-top .hd-tdgar-note { flex:1 1 0; margin:0; }
.hd-ui .hd-minimap { display:flex; flex-direction:column; align-items:center; gap:2px; }
.hd-ui .hd-minimap svg { display:block; width:100%; height:auto; min-height:0; filter:drop-shadow(0 2px 0 rgba(20,60,80,.45)); }
.hd-ui .hd-minimap .sand { fill:#f1d89a; }
.hd-ui .hd-minimap .land { fill:#8cc56a; }
.hd-ui .hd-minimap .water { fill:#3fa0c4; }
.hd-ui .hd-minimap .wall { fill:#6d5b4b; }
.hd-ui .hd-minimap .hq { fill:#a0603a; }
.hd-ui .hd-minimap .treasure { fill:${gold}; stroke:${ink}; stroke-width:.3; }
.hd-ui .hd-minimap .pad { fill:#c9a36b; }
.hd-ui .hd-minimap .lane { fill:${red}; stroke:#fff; stroke-width:.4; }
.hd-ui .hd-minimap .route { fill:none; stroke:#fff8e6; stroke-width:.9; stroke-dasharray:1.6 1; stroke-linecap:round; stroke-linejoin:round; }
.hd-ui .hd-minimap .gate { fill:${redD}; stroke:#fff; stroke-width:.4; }
.hd-ui .hd-minimap .start { fill:#fff8e6; stroke:${ink}; stroke-width:.4; }
.hd-ui .hd-minimap .port { fill:${gold}; stroke:${ink}; stroke-width:.5; }
.hd-ui .hd-minimap .spot { cursor:pointer; }
.hd-ui .hd-minimap .spot circle { fill:#fff8e6; stroke:${ink}; stroke-width:.5; }
.hd-ui .hd-minimap .spot text { font-weight:900; text-anchor:middle; fill:${ink}; pointer-events:none; }
.hd-ui .hd-minimap .spot.on circle { fill:${gold}; stroke:#fff; stroke-width:.7; }
.hd-ui .hd-minimap-legend { display:flex; flex-wrap:wrap; justify-content:center; gap:2px 10px; font-size:12px; font-weight:800; color:#fff; text-shadow:0 1px 2px ${c.seaDark}; }
.hd-ui .hd-minimap-legend span::before { content:''; display:inline-block; width:10px; height:10px; margin-right:3px; border-radius:50%; border:1px solid ${ink}; vertical-align:-1px; }
.hd-ui .hd-minimap-legend .lg-lane::before { background:${red}; }
.hd-ui .hd-minimap-legend .lg-treasure::before { background:${gold}; border-radius:2px; }
.hd-ui .hd-minimap-legend .lg-spot::before { background:#fff8e6; }
.hd-ui .hd-minimap-legend .lg-start::before { background:#fff8e6; }
.hd-ui .hd-minimap-legend .lg-gate::before { background:${redD}; }
.hd-ui .hd-minimap-legend .lg-port::before { background:${gold}; }
.hd-ui .hd-tdgar-map { flex:none; width:200px; }
/* 竖屏手机：小地图吃掉面板上方的空当，选塔面板和开打钮沉到屏幕下半（拇指够得着）；矮屏（横屏手机、360×640）放不下，不画 */
@media (max-width:700px) and (orientation:portrait) and (min-height:701px) {
  .hd-ui .hd-tdgar-top { flex:1 1 0; min-height:0; flex-direction:column; align-items:stretch; gap:6px; }
  .hd-ui .hd-tdgar-map { flex:1 1 0; min-height:0; width:100%; }
  .hd-ui .hd-tdgar-map svg { flex:1 1 0; height:100%; }
  .hd-ui .hd-tdgar-top .hd-tdgar-note { flex:none; }
}
@media (max-height:700px) { .hd-ui .hd-tdgar-map { display:none; } }
/* 横屏手机、360×640 这种矮小屏：小地图本来就不画，顶上那段阶数折算说明也收起（每张卡写着几阶、台子标题写着最高几阶、
   悬停提示有折算），让带两档分叉的三行塔卡一屏放下 */
@media (max-height:500px), (max-width:420px) and (max-height:700px) { .hd-ui .hd-tdgar-main .hd-tdgar-top { display:none; } }
/* 横屏收起说明后页签贴上来，和顶角的大厅、回岛钮至少隔 8 像素 */
@media (max-height:500px) { .hd-ui .hd-tdgar-main .hd-tdgar-tabs { margin-top:2px; } }
/* 矮的电脑屏（720–800 高）：小地图缩一号，给塔卡让出高度 */
@media (min-width:701px) and (min-height:701px) and (max-height:800px) { .hd-ui .hd-tdgar-map { width:150px; } }
.hd-ui .hd-tdgar-main .hd-tdgar-note { font-size:12px; line-height:1.3; }
.hd-ui .hd-tdgar-main .hd-tdgar-spots { display:grid; grid-template-columns:repeat(var(--spots,1),minmax(0,1fr)); gap:8px; align-items:start; }
.hd-ui .hd-tdgar-main .hd-tdgar-spot { margin:0; width:auto; padding:6px 8px; }
.hd-ui .hd-tdgar-main .hd-tdgar-spot.off { display:none; }
.hd-ui .hd-tdgar-main .hd-tdgar-title { margin-bottom:8px; }
.hd-ui .hd-tdgar-main .hd-tdgar-row { grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); }
.hd-ui .hd-tdgar-main .hd-tdgar-card { display:grid; grid-template-columns:minmax(0,1fr); align-content:center; justify-items:start; text-align:left; gap:0 6px; min-height:48px; padding:3px 6px; }
/* 塔卡：第 1 行名字 | 阶数（都不折行，第 2 列吃剩下的宽、第 3 列按阶数宽）；下面是一个跨两列、能换行的容器，
   伤害类型、加成、台子封顶、分叉牌依次排开（以前分叉牌在第 2 列、加成在第 3 列，分叉牌溢进第 3 列压住加成） */
.hd-ui .hd-tdgar-main .hd-tdgar-card:has(> img) { grid-template-columns:32px minmax(0,1fr) auto; min-height:44px; }
.hd-ui .hd-tdgar-main .hd-tdgar-card > b { white-space:nowrap; }
.hd-ui .hd-tdgar-main .hd-tdgar-card > img { width:32px !important; height:32px !important; object-fit:contain; grid-column:1; grid-row:1 / span 2; align-self:center; }
.hd-ui .hd-tdgar-main .hd-tdgar-card:has(> img) > b { grid-column:2; grid-row:1; }
.hd-ui .hd-tdgar-main .hd-tdgar-card:has(> img) > .hd-tdgar-tier { grid-column:3; grid-row:1; justify-self:end; white-space:nowrap; }
.hd-ui .hd-tdgar-main .hd-tdgar-meta { grid-column:2 / -1; grid-row:2; display:flex; flex-wrap:wrap; align-items:center; gap:1px 5px; }
.hd-ui .hd-tdgar-main .hd-tdgar-meta small { white-space:nowrap; }
/* 后期每座塔两档分叉，窄卡要折成三行：行高收紧，整面板在 720 高的电脑、手机上也一屏放下 */
.hd-ui .hd-tdgar-main .hd-tdgar-card { line-height:1.15; }
.hd-ui .hd-tdgar-main .hd-tdgar-meta .hd-chip { font-size:12px; padding:0 5px; line-height:1.3; }
.hd-ui .hd-tdgar-main .hd-tdgar-cap { color:${redD}; font-weight:800; }
.hd-ui .hd-tdgar-main .hd-tdgar-tabs { display:flex; gap:8px; }
.hd-ui .hd-tdgar-main .hd-tdgar-tab { flex:1 1 0; min-width:0; min-height:44px; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:2px 4px; font:inherit; color:inherit; cursor:pointer; background:#fff8e6; border:3px solid ${ink}; border-radius:12px; box-shadow:0 3px 0 ${ink}; }
.hd-ui .hd-tdgar-main .hd-tdgar-tab b { font-size:14px; font-weight:900; }
.hd-ui .hd-tdgar-main .hd-tdgar-tab small { font-size:12px; opacity:.85; }
.hd-ui .hd-tdgar-main .hd-tdgar-tab.on { background:linear-gradient(${c.goldL},${gold}); transform:translateY(2px); box-shadow:0 1px 0 ${ink}; }
.hd-ui .hd-tdgar-main .hd-tdgar-btns { margin-top:0; }
.hd-ui .hd-tdgar-main .hd-tdgar-btns .hd-btn { min-height:48px; }
/* 局内 */
.hd-ui .hd-td-bar { position:absolute; top:6px; left:92px; right:58px; display:flex; flex-wrap:nowrap; gap:6px; pointer-events:none !important; }
.hd-ui .hd-td-bar .hd-pill { min-width:0; }
.hd-ui .hd-td-speedtop, .hd-ui .hd-td-pausetop { display:none; flex:none; min-width:44px; min-height:44px; padding:0 4px; }
.hd-ui .hd-td-pause.on, .hd-ui .hd-td-pausetop.on { background:#ffe885; }
.hd-ui .hd-plan-tog { display:none; position:relative; flex:none; min-width:44px; min-height:44px; padding:0 2px; font-size:12px; font-weight:900; white-space:nowrap; }
/* 驻守台选塔页盖在选关页上面时，底下那页不再参与排版和点按 */
.hd-ui .hd-tdsel:not(.hd-tdgar):has(~ .hd-tdgar) { visibility:hidden; }
.hd-ui .hd-plan-tog.hint { padding-right:12px; }
.hd-ui .hd-plan-tog.hint::after { content:''; position:absolute; top:3px; right:3px; width:10px; height:10px; border-radius:50%; background:#e0402f; border:2px solid ${ink}; } /* 红点收在钮里：探出去会把钮的可滚宽度撑大；钮右边让出一截，免得压住「4/8」 */
@media (max-width:520px) {
  .hd-ui .hd-td-bar { gap:4px; }
  .hd-ui .hd-td-bar .hd-tw { display:none; }
  .hd-ui .hd-td-bar .hd-pill { padding:0 8px 0 4px; gap:4px; }
  .hd-ui .hd-td-bar .hd-pill b { font-size:14px; }
}
.hd-ui .hd-td-bar2 { position:absolute; top:58px; left:6px; right:6px; display:flex; gap:6px; align-items:center; pointer-events:none !important; }
.hd-ui .hd-td-bar2 > * { pointer-events:auto; }
/* 克制表的小徽记：伤害（方章）、护甲（圆章），单字 + 颜色，塔卡、敌人、预告、克制表都用这一套 */
.hd-ui .hd-dmg, .hd-ui .hd-arm { display:inline-flex; align-items:center; justify-content:center; flex:none; width:20px; height:20px; font:900 12px/1 system-ui,sans-serif; font-style:normal; color:#fff; border:2px solid ${ink}; text-shadow:0 1px 0 rgba(0,0,0,.45); vertical-align:middle; }
.hd-ui .hd-dmg { border-radius:5px; }
.hd-ui .hd-arm { border-radius:50%; }
.hd-ui .hd-dmg.d-shot { background:#3f6fa8; } .hd-ui .hd-dmg.d-shell { background:#5a4636; } .hd-ui .hd-dmg.d-fire { background:#e0602f; } .hd-ui .hd-dmg.d-blast { background:#b8322a; }
.hd-ui .hd-arm.a-cloth { background:#b98f55; } .hd-ui .hd-arm.a-heavy { background:#66737f; } .hd-ui .hd-arm.a-wood { background:#86562b; } .hd-ui .hd-arm.a-air { background:#3d9ad1; }
.hd-ui .hd-tden { position:relative; display:inline-flex; align-items:flex-end; gap:1px; }
.hd-ui .hd-tden .hd-arm { position:absolute; left:-4px; bottom:-2px; width:16px; height:16px; font-size:12px; border-width:1.5px; }
.hd-ui .hd-tden b { font-size:14px; font-weight:900; }
.hd-ui .hd-eye { display:inline-block; width:16px; height:10px; border:2px solid ${ink}; border-radius:50%/60%; background:radial-gradient(circle,${ink} 0 2.5px,#fff 3px); position:absolute; right:-6px; top:-4px; }
/* 克制表卡：默认收成一个按钮，.on 展开 */
.hd-ui .hd-ctr { margin:8px 0 2px; }
.hd-ui .hd-ctr-tog { width:100%; min-height:44px; flex-direction:row; gap:8px; justify-content:center; }
.hd-ui .hd-ctr-tog small { font-size:12px; opacity:.85; }
.hd-ui .hd-ctr-tb, .hd-ui .hd-ctr-who, .hd-ui .hd-ctr-key { display:none; }
.hd-ui .hd-ctr.on .hd-ctr-tb { display:table; }
.hd-ui .hd-ctr.on .hd-ctr-who, .hd-ui .hd-ctr.on .hd-ctr-key { display:flex; }
/* 表上一句怎么读，后面三个色块就是格子的颜色 */
.hd-ui .hd-ctr-key { flex-wrap:wrap; align-items:center; gap:2px 6px; margin:0 0 2px; font-size:12px; font-weight:700; }
.hd-ui .hd-ctr-key i { font-style:normal; font-weight:900; padding:0 5px; border:2px solid ${ink}; border-radius:6px; }
.hd-ui .hd-ctr.on .hd-ctr-tog { display:none; }
.hd-ui .hd-ctr-tb { width:100%; border-collapse:separate; border-spacing:3px; font-size:14px; animation:hd-tdin .22s cubic-bezier(.3,1.4,.5,1); }
.hd-ui .hd-ctr-tb th { font-weight:800; font-size:12px; white-space:nowrap; text-align:center; }
.hd-ui .hd-ctr-tb th span { margin-left:3px; }
.hd-ui .hd-ctr-tb th.hd-ctr-corner { font-weight:700; opacity:.7; vertical-align:bottom; }
.hd-ui .hd-ctr-h { display:flex; align-items:center; justify-content:center; }
/* 表头里属于这一行 / 这一列的塔和敌人小图，放不下就折行 */
.hd-ui .hd-ctr-ic { display:flex; justify-content:center; gap:0 1px; margin:1px auto 0; }
.hd-ui .hd-ctr-ic img { width:18px; height:18px; object-fit:contain; }
/* 矮屏（手机横屏、360×640）一屏放不下表头的小图：只留徽记和名字，谁属于哪一行、哪一列看表下按名字列的两组 */
@media (max-height:700px) { .hd-ui .hd-ctr-ic { display:none; } }
.hd-ui .hd-ctr-tb td { text-align:center; font-weight:900; border:2px solid ${ink}; border-radius:7px; padding:2px 2px; background:#fff8e6; }
.hd-ui .hd-ctr-tb td.c-good, .hd-ui .hd-ctr-key .c-good { background:#9fe08a; }
.hd-ui .hd-ctr-tb td.c-weak, .hd-ui .hd-ctr-key .c-weak { background:#ffc9a0; }
.hd-ui .hd-ctr-tb td.c-none, .hd-ui .hd-ctr-key .c-none { background:#cfcfcf; color:#5b5b5b; }
.hd-ui .hd-ctr-tb td { font-size:12px; white-space:nowrap; }
.hd-ui .hd-ctr-who { flex-wrap:wrap; gap:2px 10px; margin:4px 0 0; font-size:12px; }
/* 图鉴里这一波每种敌人一行：护甲章 + 「水手 · 布衣：火打它多一半」 */
.hd-ui .hd-best-foes { display:flex; flex-direction:column; gap:2px; margin:2px 0 4px; font-size:12px; font-weight:700; }
.hd-ui .hd-best-foes span { display:flex; align-items:center; gap:4px; }
.hd-ui .hd-tdgar-dmg { display:inline-flex; align-items:center; gap:2px; font-weight:800; }
/* 矮屏驻守台卡只留伤害徽记（悬停 / 点一下有说明），全名会把这一行挤成两行、整页放不下 */
@media (max-height:700px) { .hd-ui .hd-tdgar-dmg span { display:none; } }
.hd-ui .hd-ctr-who span { display:inline-flex; align-items:center; gap:3px; }
/* 顶部预告卡：一整块，首领波变红；点它打开敌人图鉴 */
.hd-ui .hd-td-plan { position:absolute; top:calc(env(safe-area-inset-top, 0px) + 110px); left:6px; max-width:min(360px,calc(100% - 12px)); z-index:30; pointer-events:auto; cursor:pointer; padding:4px 9px 5px; border:2px solid ${ink}; border-radius:12px; background:${cream}; box-shadow:0 2px 0 ${ink}; font-size:14px; font-weight:800; line-height:1.25; transition:transform .18s cubic-bezier(.3,1.5,.5,1); }
.hd-ui .hd-td-plan:active { transform:translateY(2px); box-shadow:0 0 0 ${ink}; }
.hd-ui .hd-td-plan.fresh { animation:hd-tdplanin .5s cubic-bezier(.3,1.5,.5,1); }
.hd-ui .hd-td-plan.boss { background:linear-gradient(#ffd0c4,#ffab98); border-color:${redD}; }
.hd-ui .hd-plan-r1 { display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
.hd-ui .hd-plan-w { font-size:14px; font-weight:900; }
.hd-ui .hd-plan-foes { display:inline-flex; flex-wrap:wrap; align-items:flex-end; gap:2px 8px; }
.hd-ui .hd-plan-foes .hd-tden .hd-arm { display:none; } /* 护甲在下一行写了全名，头像上的小圆章只会盖住脸 */
.hd-ui .hd-plan-foes .hd-tden b { font-size:12px; }
.hd-ui .hd-plan-arm { display:flex; flex-wrap:wrap; align-items:center; gap:2px 8px; margin-top:2px; font-size:12px; font-weight:800; }
.hd-ui .hd-plan-arm span { display:inline-flex; align-items:center; gap:3px; white-space:nowrap; }
.hd-ui .hd-plan-sug { display:inline-flex; align-items:center; gap:3px; padding:0 6px 0 2px; border-radius:9px; background:#fff1c4; border:2px solid ${ink}; }
.hd-ui .hd-plan-left { margin-left:auto; font-variant-numeric:tabular-nums; }
.hd-ui .hd-plan-note { font-size:12px; margin-top:2px; opacity:.9; }
.hd-ui .hd-plan-next { display:inline-flex; align-items:center; gap:3px; margin-left:8px; opacity:.85; white-space:nowrap; }
.hd-ui .hd-plan-next .hd-arm { width:16px; height:16px; font-size:12px; border-width:1.5px; }
@keyframes hd-tdplanin { 0% { transform:translateY(-10px) scale(.92); opacity:0; } 60% { transform:scale(1.04); opacity:1; } 100% { transform:none; } }
@media (hover:hover) and (pointer:fine) { .hd-ui .hd-td-plan:hover { filter:brightness(1.06); } }
/* 敌人图鉴 */
.hd-ui .hd-best-row { display:flex; align-items:center; gap:10px; flex-wrap:wrap; padding:3px 0 5px; border-bottom:1px dashed rgba(43,26,21,.25); }
.hd-ui .hd-best-lane { min-width:52px; font-weight:800; }
.hd-ui .hd-td-sub.boss { color:${redD}; }
.hd-ui .hd-td-bar .hd-pill b, .hd-ui .hd-td-bar2 .hd-pill b { font-variant-numeric:tabular-nums; }
.hd-ui .hd-pill.bump { animation:hd-tdbump .4s; }
.hd-ui .hd-pill.hurt { background:#ffd6cf; border-color:${redD}; animation:hd-tdbump .5s; }
.hd-ui .hd-td-flash { position:absolute; inset:0; background:radial-gradient(transparent 40%,rgba(217,59,50,.55)); opacity:0; pointer-events:none !important; z-index:35; }
.hd-ui .hd-td-flash.on { animation:hd-tdflash .6s ease-out; }
.hd-ui .hd-td-banner { position:absolute; left:0; right:0; top:calc(env(safe-area-inset-top, 0px) + 110px); z-index:44; text-align:center; pointer-events:none !important; animation:hd-tdban .9s ease-out forwards; }
.hd-ui .hd-td-banner span { display:inline-block; background:linear-gradient(${c.goldL},${gold}); border:4px solid ${ink}; border-radius:18px; padding:3px 20px; font-size:20px; font-weight:900; box-shadow:0 5px 0 ${ink}; }
.hd-ui .hd-td-banner.boss span { background:linear-gradient(${c.redL},${red}); color:#fff; }
.hd-ui .hd-td-banner small { display:block; margin-top:4px; font-size:14px; color:#fff; text-shadow:0 1px 3px ${ink}; font-weight:800; }
.hd-ui .hd-td-bottom { position:absolute; left:0; right:0; bottom:0; padding:6px 8px 8px; display:flex; gap:8px; justify-content:center; align-items:flex-end; pointer-events:none !important; }
.hd-ui .hd-td-bottom > * { pointer-events:auto; }
.hd-ui .hd-hint { position:absolute; left:50%; bottom:92px; transform:translateX(-50%); white-space:nowrap; pointer-events:none !important; }
.hd-ui .hd-td .hd-padhint { bottom:calc(150px + env(safe-area-inset-bottom,0px)); font-size:16px; font-weight:900; background:#ffe885; color:#2b1a15; box-shadow:0 3px 0 #2b1a15; z-index:7; }
.hd-ui .hd-td:has(.hd-td-sheet) .hd-padhint { display:none; }
.hd-ui .hd-td-skill { position:relative; width:68px; min-height:68px; padding:0; flex-direction:column; gap:0; font-size:12px; overflow:hidden; }
.hd-ui .hd-td-skill.sel { background:linear-gradient(${c.goldL},${gold}); transform:translateY(-4px); }
.hd-ui .hd-td-skill .hd-cd { position:absolute; inset:0; background:conic-gradient(rgba(20,35,58,.62) var(--cd,0deg), transparent 0); pointer-events:none; }
.hd-ui .hd-td-skill.cool { filter:grayscale(.6); }
.hd-ui .hd-td-skill b { position:relative; font-size:12px; }
/* 章末机制钮（水闸）右上角的剩余次数；灰掉（off）= 这一波按了没用 */
.hd-ui .hd-td-skill .hd-td-left { position:absolute; right:3px; top:3px; min-width:16px; height:16px; padding:0 3px; border-radius:8px; background:${ink}; color:${cream}; font:800 12px/16px system-ui,sans-serif; font-style:normal; text-align:center; pointer-events:none; }
.hd-ui .hd-td-skill.hd-td-mech.off { filter:grayscale(.75); opacity:.8; }
/* 竖屏放大时屏外东西的边缘指示：敌人是红底箭头加数量（点了镜头移过去），空木台是不挡点按的小金标 */
.hd-ui .hd-td-edges { position:absolute; inset:0; pointer-events:none; z-index:6; }
/* 屏外的提示三种，都带指向那边的箭头：红圈 = 敌人（剑 + 个数，点一下镜头过去）；木牌加号 = 能造塔的空木台；黄旗 = 路口 / 关口 */
.hd-ui .hd-td-edge { position:absolute; left:-22px; top:-22px; width:44px; min-width:44px; height:44px; min-height:44px; padding:0; border-radius:50%; pointer-events:auto; background:rgba(150,30,24,0.9); border:2px solid #ffd27a; color:#fff; font-size:14px; font-weight:900; line-height:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:1px; }
.hd-ui .hd-td-edge .hd-img { flex:none; }
.hd-ui .hd-td-edge i { position:absolute; inset:0; pointer-events:none; }
.hd-ui .hd-td-edge i::after { content:''; position:absolute; right:-4px; top:50%; margin-top:-8px; border:8px solid transparent; border-left:10px solid #ffd27a; border-right:0; filter:drop-shadow(0 1px 0 rgba(0,0,0,.6)); }
.hd-ui .hd-td-edge b { position:relative; }
.hd-ui .hd-td-edge.crate { background:#f2c14e; border-color:#6b4a1e; }
.hd-ui .hd-td-edge.crate i::after { border-left-color:#6b4a1e; }
.hd-ui .hd-td-edge.goal { background:#ffe885; border-color:${ink}; box-shadow:0 0 0 3px rgba(255,232,133,.45); }
.hd-ui .hd-td-edge.goal i::after { border-left-color:${ink}; }
.hd-ui .hd-td-edge.slot, .hd-ui .hd-td-edge.gate { left:-15px; top:-15px; width:30px; min-width:30px; height:30px; min-height:30px; border-radius:6px; transform-origin:center; pointer-events:none; background:#d9a766; border:2px solid #6b4a1e; color:#4a2e12; font-size:16px; }
.hd-ui .hd-td-edge.slot i::after, .hd-ui .hd-td-edge.gate i::after { right:-3px; margin-top:-6px; border-width:6px; border-left-width:8px; border-left-color:#ffd27a; }
.hd-ui .hd-td-edge.slot b::before { content:'+' attr(data-n); }
.hd-ui .hd-td-edge.gate { background:transparent; border-color:transparent; }
.hd-ui .hd-td-edge.gate b { display:block; width:4px; height:26px; background:#6b4a1e; border-radius:2px; }
.hd-ui .hd-td-edge.gate b::before { content:''; position:absolute; left:4px; top:1px; width:14px; height:11px; background:#f2c14e; border:2px solid #6b4a1e; border-radius:2px 5px 5px 2px; box-sizing:border-box; }
.hd-ui .hd-td-call { position:relative; flex:1 1 auto; max-width:230px; min-height:68px; flex-direction:column; gap:0; font-size:16px; }
.hd-ui .hd-td-call small { font-size:12px; font-weight:800; }
.hd-ui .hd-td-sheet { position:absolute; left:0; right:0; margin:0 auto; bottom:0; width:min(100%,560px); max-height:62%; overflow:auto; z-index:36; pointer-events:auto; background:${cream}; border:3px solid ${ink}; border-bottom:0; border-radius:18px 18px 0 0; padding:10px 10px 12px; box-shadow:0 -4px 0 rgba(43,26,21,.25); }
.hd-ui .hd-td-sheet h2 { margin:0; font-size:16px; font-weight:900; flex:1; }
.hd-ui .hd-td-towers { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; }
.hd-ui .hd-td-tower { display:flex; flex-direction:column; align-items:center; gap:1px; min-height:112px; padding:4px 3px; border:3px solid ${ink}; border-radius:12px; background:#fff8e6; font:inherit; color:inherit; cursor:pointer; }
.hd-ui .hd-td-tower:disabled { opacity:.5; filter:grayscale(.6); cursor:default; }
.hd-ui .hd-td-tower b { font-size:14px; }
.hd-ui .hd-td-tower small { font-size:12px; line-height:1.2; text-align:center; }
.hd-ui .hd-td-tower .hd-td-price { display:inline-flex; align-items:center; gap:2px; font-weight:900; }
.hd-ui .hd-td-tower .hd-td-price.short { color:${red}; }
.hd-ui .hd-td-tower .hd-td-ctr { display:flex; align-items:center; gap:3px; flex-wrap:wrap; justify-content:center; font-weight:800; }
.hd-ui .hd-td-tower .hd-td-ctr .hd-armn { font:800 12px/16px system-ui,sans-serif; font-style:normal; color:#fff; padding:0 4px; margin-left:3px; border-radius:8px; text-shadow:0 1px 0 rgba(0,0,0,.45); }
.hd-ui .hd-td-tower .hd-td-ctr .hd-armn.ng { text-decoration:line-through 2px #3b1d10; opacity:.8; }
.hd-ui .hd-td-tower .hd-td-ctr .hd-armn.a-cloth { background:#b98f55; } .hd-ui .hd-td-tower .hd-td-ctr .hd-armn.a-heavy { background:#66737f; } .hd-ui .hd-td-tower .hd-td-ctr .hd-armn.a-wood { background:#86562b; } .hd-ui .hd-td-tower .hd-td-ctr .hd-armn.a-air { background:#3d9ad1; }
.hd-ui .hd-td-tower .hd-key { left:4px; top:3px; }
.hd-ui .hd-td-tower { position:relative; }
.hd-ui .hd-td-tower.rec { box-shadow:0 0 0 3px #ffe885, 0 0 12px rgba(255,232,133,.8); }
.hd-ui .hd-plan-sug.hd-plan-open img { margin-left:3px; }
.hd-ui .hd-plan-sug .hd-plan-short { color:${red}; font-size:12px; font-weight:800; }
.hd-ui .hd-plan-sug .hd-plan-short::before { content:'· '; color:${ink}; }
.hd-ui .hd-plan-sug .hd-plan-short:empty { display:none; }
.hd-ui .hd-plan-sug.hd-plan-go { cursor:pointer; }
@media (hover:hover) and (pointer:fine) { .hd-ui .hd-plan-sug.hd-plan-go:hover { background:#ffe885; } }
.hd-ui .hd-td-tower:active:not(:disabled) { transform:translateY(2px); }
.hd-ui .hd-td-acts { display:flex; gap:8px; flex-wrap:wrap; margin-top:8px; }
.hd-ui .hd-td-acts .hd-btn { flex:1 1 140px; min-height:48px; }
.hd-ui .hd-td-sell.arm { background:linear-gradient(#ffb7a8,#e0402f) !important; color:#fff; }
.hd-ui .hd-td-tierchip { font-weight:900; }
.hd-ui .hd-td-sub { margin:8px 0 4px; font-size:14px; font-weight:800; }
.hd-ui .hd-td-branches { display:grid; grid-template-columns:repeat(auto-fit,minmax(104px,1fr)); gap:8px; }
.hd-ui .hd-td-branch { display:flex; flex-direction:column; gap:1px; align-items:flex-start; min-height:76px; padding:6px 8px; border:3px solid ${ink}; border-radius:12px; background:linear-gradient(#fff8e6,${creamD}); font:inherit; color:inherit; text-align:left; cursor:pointer; }
.hd-ui .hd-td-branch:disabled { opacity:.5; }
.hd-ui .hd-td-branch b { font-size:14px; }
.hd-ui .hd-td-branch span { font-size:12px; }
.hd-ui .hd-td-branch small { font-size:12px; color:${c.grassDD}; font-weight:800; }
.hd-ui .hd-td-note { margin:8px 0 0; font-size:12px; opacity:.75; }
.hd-ui .hd-td-sheet .hd-td-block { display:flex; align-items:center; justify-content:space-between; gap:8px; margin:0 0 8px; padding:6px 8px; border-radius:10px; background:rgba(200,60,40,.16); border:2px solid rgba(200,60,40,.55); font-size:14px; }
.hd-ui .hd-td-sheet .hd-td-block .hd-btn { min-height:40px; padding:0 12px; font-size:14px; }
.hd-ui .hd-td-result { text-align:center; max-width:360px; }
.hd-ui .hd-td-result h2 { margin:0 0 4px; font-size:24px; }
.hd-ui .hd-home-result .hd-home-hardtag { display:inline-block; margin-left:8px; padding:1px 8px; border-radius:8px; background:#c0392b; color:#fff8ec; font-size:14px; vertical-align:middle; }
.hd-ui .hd-td-kept { display:flex; align-items:center; justify-content:center; gap:8px; margin:6px 0; font-size:16px; font-weight:900; }
.hd-ui .hd-td-line { margin:4px 0 !important; font-size:14px !important; }
.hd-ui .hd-td-line.cap { color:${redD}; font-weight:800; }
.hd-ui .hd-td-stolen { position:absolute; z-index:61; left:50%; top:calc(env(safe-area-inset-top, 0px) + 168px); transform:translateX(-50%); white-space:nowrap; font-size:14px; font-weight:900; color:#fff; background:#d8463a; border:2px solid #2b1d14; border-radius:10px; padding:1px 8px; pointer-events:none; transition:opacity .4s; }
.hd-ui .hd-td-stolen.off { opacity:0; }
.hd-ui .hd-td-store { position:absolute; top:calc(env(safe-area-inset-top, 0px) + 118px); left:50%; transform:translateX(-50%); max-width:calc(100% - 12px); white-space:nowrap; font-size:14px; z-index:62; display:flex; gap:6px; padding:4px 10px 4px 8px; background:${cream}; border:3px solid ${ink}; border-radius:20px; box-shadow:0 2px 0 ${ink}; align-items:center; pointer-events:none; }
.hd-ui .hd-td-store span { display:inline-flex; align-items:center; gap:3px; }
.hd-ui .hd-td-store.bump { animation:hd-tdstorebump .3s; }
.hd-ui .hd-td-btns { display:flex; gap:8px; flex-wrap:wrap; margin-top:10px; }
.hd-ui .hd-td-btns .hd-btn { flex:1 1 100px; }
.hd-ui .hd-bar-branch { margin:8px 0; }
.hd-ui .hd-td-drop { animation:hd-tddrop .38s cubic-bezier(.3,1.5,.5,1); }
.hd-ui .hd-td-starrow { display:flex; justify-content:center; margin:4px 0; }
.hd-ui .hd-td-paused { position:absolute; top:calc(env(safe-area-inset-top, 0px) + 110px); right:6px; z-index:31; padding:2px 10px; border:2px solid ${ink}; border-radius:12px; background:#ffe885; font-size:14px; font-weight:900; box-shadow:0 2px 0 ${ink}; pointer-events:none !important; display:none; }
.hd-ui .hd-td-paused.on { display:block; animation:hd-tdpause .25s ease-out; }
/* 暴雨（规则版本 22，tdrain.ts）：画布上面、界面下面一层，图比屏幕大一格、往左下挪一格再循环（只动 transform，走合成器） */
.hd-ui .hd-td-rain { position:absolute; inset:0; overflow:hidden; pointer-events:none !important; opacity:0; transition:opacity .6s linear; z-index:0; }
.hd-ui .hd-td-rain.on { opacity:1; }
.hd-ui .hd-td-rain i { position:absolute; left:0; top:-1024px; right:-256px; bottom:0; background-repeat:repeat; background-size:256px 256px; will-change:transform; animation:hd-tdrain 2.2s linear infinite; }
/* 雨丝斜率正好 1/4：往左 1 格图、往下 4 格图，首尾都对齐平铺，循环时不跳 */
@keyframes hd-tdrain { from { transform:translate(0,0); } to { transform:translate(-256px,1024px); } }
@media (prefers-reduced-motion:reduce) { .hd-ui .hd-td-rain i { animation:none; } }
/* 战书（规则版本 22）：倒数里浮在右上（手机竖屏在底栏上方，见 layout.ts），「接」「不接」两颗 ≥ 44 的钮；接了「接」亮着 */
.hd-ui .hd-td-dare { position:absolute; top:calc(env(safe-area-inset-top, 0px) + 150px); right:6px; z-index:30; display:none; align-items:center; gap:8px; padding:4px 6px 4px 8px; border:2px solid ${ink}; border-radius:12px; background:${cream}; box-shadow:0 2px 0 ${ink}; pointer-events:auto; }
.hd-ui .hd-td-dare.on { display:flex; animation:hd-tdpause .25s ease-out; }
.hd-ui .hd-td-dare-tx { display:flex; flex-direction:column; line-height:1.15; }
.hd-ui .hd-td-dare-tx b { font-size:16px; font-weight:900; }
.hd-ui .hd-td-dare-tx small { font-size:12px; font-weight:800; white-space:nowrap; }
.hd-ui .hd-td-dare .hd-btn { min-width:48px; min-height:44px; padding:0 8px; font-size:16px; }
.hd-ui .hd-td-dare:not(.taken) .hd-td-dare-yes { filter:saturate(.55) brightness(.95); }
.hd-ui .hd-td-dare:not(.taken) .hd-td-dare-no, .hd-ui .hd-td-dare.taken .hd-td-dare-yes { box-shadow:0 0 0 3px #fff3b0, 0 2px 0 ${ink}; }
.hd-ui .hd-td-dare.taken { border-color:${redD}; background:linear-gradient(#ffe2b8,#ffc98a); }
.hd-ui .hd-screen .hd-hint.bad { background:${red}; color:#fff; font-weight:900; }
.hd-ui .hd-td-sheet .hd-td-branch small { font-size:12px; }
@keyframes hd-tdpause { 0% { transform:translateY(-8px); opacity:0; } 100% { transform:none; opacity:1; } }
/* 手机竖屏：面板做成矮一点的底部抽屉，上面的岛和敌人还看得见；分叉卡竖排成行 */
@media (max-width:600px) and (orientation:portrait) {
  .hd-ui .hd-td-sheet { max-height:88%; padding:8px 8px 10px; }
  .hd-ui .hd-td-sheet.build { max-height:88%; }
  .hd-ui .hd-td-sheet .hd-desc { margin:2px 0 6px; font-size:12px; }
  .hd-ui .hd-td-towers { gap:8px; }
  .hd-ui .hd-td-tower { min-height:92px; padding:2px 2px; }
  .hd-ui .hd-td-branches { grid-template-columns:1fr; gap:8px; }
  .hd-ui .hd-td-branch { flex-direction:row; flex-wrap:wrap; align-items:center; min-height:44px; padding:3px 8px; gap:0 8px; }
  .hd-ui .hd-td-branch b { font-size:14px; }
  .hd-ui .hd-td-sub { margin:4px 0 4px; }
  .hd-ui .hd-bar-branch { margin:4px 0; }
  /* 预告卡占左上，"已暂停"挪到它下面一行的右边，不叠在一起 */
  .hd-ui .hd-td-paused { top:calc(env(safe-area-inset-top, 0px) + 156px); }
  .hd-ui .hd-td-plan { max-width:calc(100% - 12px); padding:3px 7px 4px; }
  .hd-ui .hd-tdgar-row { grid-template-columns:repeat(auto-fill,minmax(96px,1fr)); }
}
@media (max-height:500px) { .hd-ui .hd-td-sheet { max-height:72%; } }


/* 克制表展开（建塔面板里）：其余内容让位，只留表和"收起"钮；图鉴里的表一直展开 */
.hd-ui .hd-ctr-off { display:none; width:100%; min-height:44px; margin-top:8px; }
.hd-ui .hd-ctr.on:not(.fixed) .hd-ctr-off { display:flex; }
.hd-ui .hd-td-sheet:not(.hd-td-best):has(.hd-ctr.on) > :not(.hd-head):not(.hd-ctr) { display:none; }
.hd-ui .hd-best-pager { display:flex; align-items:center; justify-content:center; gap:12px; margin-top:8px; }
.hd-ui .hd-best-pager .hd-btn { min-width:88px; min-height:44px; }
.hd-ui .hd-td-price b, .hd-ui .hd-td-store b, .hd-ui .hd-td-kept b { font-variant-numeric:tabular-nums; }
@media (max-width:600px) and (orientation:portrait) {
  .hd-ui .hd-ctr-tb { border-spacing:2px; }
  .hd-ui .hd-ctr-tb td { padding:2px 1px; }
  .hd-ui .hd-ctr-who { margin:2px 0 0; font-size:12px; line-height:1.25; }
  .hd-ui .hd-best-row { padding:1px 0 3px; }
}
/* 造塔卡：横排（图标在左，名字和造价一行，下面是一句话、射程、克谁），电脑和竖屏两列、横屏四列，八种塔也放得下 */
.hd-ui .hd-td-towers { grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; }
.hd-ui .hd-td-tower { display:grid; grid-template-columns:44px minmax(0,1fr) auto; column-gap:6px; align-content:center; justify-items:start; text-align:left; min-height:0; padding:2px 6px 2px 8px; }
.hd-ui .hd-td-tower > img { grid-column:1; grid-row:1 / span 4; align-self:center; }
/* 图标的行内宽高是按原图比例算的（img()），加农炮、臼炮这类扁的图比列宽还宽，会压到右边的字上：一律按列宽等比缩 */
.hd-ui .hd-td-tower > img { width:100% !important; height:auto !important; max-height:44px; object-fit:contain; }
.hd-ui .hd-td-tower > b { grid-column:2; grid-row:1; }
.hd-ui .hd-td-tower > .hd-td-price { grid-column:3; grid-row:1; justify-self:end; }
.hd-ui .hd-td-tower > small { grid-column:2 / -1; text-align:left; }
.hd-ui .hd-td-tower .hd-td-ctr { justify-content:flex-start; }
.hd-ui .hd-td-tower .hd-key { top:2px; left:2px; }
/* 窄竖屏（360 一类）：名字列太窄会把"加农炮"挤成一字一行；图标缩到 32 只占前两行，说明、射程、克谁铺满整张卡宽 */
@media (max-width:420px) {
  /* 矮竖屏造塔面板：塔卡行距和说明行高、面板内边距收紧，八种塔 + 克制表钮一屏放下 */
  .hd-ui .hd-td-sheet.build { padding-top:6px; padding-bottom:8px; }
  .hd-ui .hd-td-sheet.build .hd-desc { margin:2px 0 4px; }
  .hd-ui .hd-td-tower { row-gap:0; }
  .hd-ui .hd-td-tower small { line-height:1.1; }
  .hd-ui .hd-td-towers { gap:8px; }
  .hd-ui .hd-td-tower { grid-template-columns:32px minmax(0,1fr) auto; padding:1px 5px 1px 6px; }
  .hd-ui .hd-td-tower > img { grid-row:1 / span 2; max-height:32px; }
  .hd-ui .hd-td-tower > b { white-space:nowrap; }
  .hd-ui .hd-td-tower > small { grid-column:1 / -1; }
  .hd-ui .hd-td-tower > small:first-of-type { grid-column:2 / -1; }
}
/* 小屏上面板顶到右上角，会和齿轮、撤退钮叠在一起；面板开着时整局暂停，先把这两个藏起来 */
@media (max-height:500px), (max-width:420px) {
  .hd-ui.hd-skin:has(.hd-td > .hd-td-sheet) .hd-mute, .hd-ui.hd-skin .hd-td:has(> .hd-td-sheet) .hd-btn-red { visibility:hidden; }
}
/* 手机横屏：面板铺满宽度（只让出顶上一行），造塔卡横排（图标在左、字在右）一行四张；图鉴左边两波、右边克制表 */
@media (orientation:landscape) and (max-height:500px) {
  .hd-ui.hd-skin .hd-td > .hd-td-sheet { left:6px; right:6px; width:auto; max-height:calc(100% - 8px); margin:0; padding:6px 10px 8px; }
  .hd-ui .hd-td-sheet .hd-desc { margin:2px 0 4px; }
  .hd-ui .hd-td-towers { grid-template-columns:repeat(4,minmax(0,1fr)); }
  .hd-ui .hd-ctr { margin:8px 0 0; }
  .hd-ui .hd-tdgar-main { padding-top:3px; padding-bottom:3px; }
  .hd-ui .hd-tdgar-main .hd-tdgar-spot { padding-top:4px; padding-bottom:4px; }
  .hd-ui .hd-tdgar-main .hd-tdgar-card { padding-top:2px; padding-bottom:2px; }
  .hd-ui .hd-td-sheet.hd-td-best { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); column-gap:14px; align-content:start; }
  .hd-ui .hd-td-sheet.hd-td-best > .hd-head { grid-column:1 / -1; }
  .hd-ui .hd-td-best .hd-best-waves { grid-column:1; }
  .hd-ui .hd-td-best .hd-ctr { grid-column:2; grid-row:2; margin:0; }
}

/* 守岛 2.0 新件的皮肤（羊皮纸底，和 skin.ts 的卡片一致；比上面多一级 .hd-skin，盖过布局里的纯色底） */
.hd-ui.hd-skin .hd-td-plan, .hd-ui.hd-skin .hd-tdgar-spot { background:var(--hd-parch),linear-gradient(#f7ead0,#e9d4a2); box-shadow:inset 0 0 14px rgba(120,72,22,.26),0 3px 0 ${ink}; }
.hd-ui.hd-skin .hd-td-plan.boss { background:var(--hd-parch),linear-gradient(#ffcfc2,#f09a85); }
.hd-ui.hd-skin .hd-tdgar-card { background:var(--hd-parch),linear-gradient(#f9eed6,#e8d2a0); box-shadow:inset 0 2px 0 rgba(255,250,230,.7),inset 0 0 14px rgba(120,72,22,.25),0 3px 0 ${ink}; }
.hd-ui.hd-skin .hd-tdgar-card.on { background:var(--hd-parch),linear-gradient(${c.goldL},${gold}); box-shadow:0 5px 0 ${ink},0 0 0 3px #fff3b0,0 0 16px rgba(255,214,90,.8); }

/* 下面几条比 layout.ts 多一级选择器，盖过它 */
.hd-ui .hd-nowrap { white-space:nowrap; }
/* 叫波钮副文字永远单行；超出就省略号，整句在 title 里 */
.hd-ui .hd-td-call small { white-space:nowrap; max-width:100%; overflow:hidden; text-overflow:ellipsis; }
/* 开着造塔 / 图鉴面板时整局暂停，预告卡收起：「已暂停」黄条在它原来的位置，不再压着文字 */
.hd-ui.hd-skin .hd-td:has(.hd-td-sheet) .hd-td-plan { visibility:hidden; }
/* 窄屏（手机竖横屏）：顶栏「已来」二字收起，牌只留「N/M 波」，右邻牌不再盖住最后一个字 */
@media (max-width:900px) { .hd-ui .hd-wave-pre { display:none; } }
/* 手机的叫波钮（竖屏底栏、横屏右下角 170 宽的板）放不下「技能快 N 秒」，收起 */
@media (max-width:559px), (orientation:landscape) and (max-height:500px) { .hd-ui .hd-td-call .hd-call-cd { display:none; } }
/* 手机竖屏：放大后出现的「全景」钮在预告卡右边，卡给钮让出 62 像素（卡最多五行，不让它盖住右下角的倒计时） */
@media (max-width:559px) and (orientation:portrait) { .hd-ui.hd-skin .hd-td:has(.hd-fitbtn.on) .hd-td-plan { max-width:calc(100% - 74px); } }
/* 矮横屏的结算：结算框占满高度，仓库条（金币木材飞入的落点）不再盖在框中间，挪到框左边的空地，框宽 360 居中，两边各剩一半 */
@media (orientation:landscape) and (max-height:500px) {
  .hd-ui.hd-skin .hd-mask > .hd-td-store { left:6px; top:calc(env(safe-area-inset-top, 0px) + 64px); transform:none; max-width:calc((100% - 360px) / 2 - 12px); animation-name:none; }
  .hd-ui.hd-skin .hd-mask > .hd-td-store.bump { animation:hd-tdbump .3s; }
  @media (max-width:720px) { .hd-ui.hd-skin .hd-mask > .hd-td-store { flex-direction:column; align-items:flex-start; border-radius:14px; } }
}
@keyframes hd-tdbump { 40% { transform:scale(1.18); } }
@keyframes hd-tdstorebump { 40% { transform:translateX(-50%) scale(1.18); } }
@keyframes hd-tdflash { 0% { opacity:1; } 100% { opacity:0; } }
@keyframes hd-tdban { 0% { transform:translateY(-26px) scale(.7); opacity:0; } 17% { transform:scale(1.08); opacity:1; } 28% { transform:none; } 70% { opacity:1; } 100% { transform:translateY(-8px); opacity:0; } }
@keyframes hd-tddrop { 0% { transform:translateY(-70px) scale(2); opacity:0; } 55% { transform:translateY(4px) scale(.92); opacity:1; } 100% { transform:none; opacity:1; } }
`;
}
