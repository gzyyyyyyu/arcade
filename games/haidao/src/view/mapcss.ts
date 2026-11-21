import { PALETTE as P } from './art/index.ts';
import { el } from './ui.ts';

/**
 * 寻宝航线的样式：航线图页（.hd-route）、站间条（.hd-route-mid）、终局演出（.hd-route-end）、海图上的"今日航线"卡（.hd-mapcard）、
 * 登陆战顶上的站名条（.hd-mapstrip）。全部限定在 .hd-ui 下、自己的根类里；底色、边框沿用皮肤的 hd-btn / hd-pill / hd-sheet / hd-dialog。
 * 第一次进航线时注入一次。
 */
let done = false;
export function mapCss(): void {
  if (done) return;
  done = true;
  const ink = P.ink!;
  const U = '.hd-ui';
  const st = el('style');
  st.textContent = `
/* ---------- 航线图页 ---------- */
${U} .hd-route { position:absolute; inset:0; z-index:40; display:flex; flex-direction:column; pointer-events:auto; touch-action:manipulation;
  background:radial-gradient(ellipse at 50% 40%,#2c87a6,#164a66 70%,#0d2f45); animation:hd-route-in .32s cubic-bezier(.2,1,.4,1) both; }
${U} .hd-route.out { animation:hd-route-out .22s ease-in both; pointer-events:none; }
@keyframes hd-route-in { 0% { opacity:0; transform:translateY(18px); } 100% { opacity:1; transform:none; } }
@keyframes hd-route-out { 100% { opacity:0; transform:translateY(-10px); } }
${U} .hd-route > .hd-hall { top:calc(6px + env(safe-area-inset-top,0px)); }
${U} .hd-route-top { display:flex; align-items:center; gap:8px; padding:calc(6px + env(safe-area-inset-top,0px)) 8px 0 92px; min-height:50px; color:#fff4dc; }
${U} .hd-route-title { display:flex; flex-direction:column; line-height:1.15; min-width:0; flex:1 1 auto; text-shadow:0 1px 2px rgba(0,0,0,.6); }
${U} .hd-route-title b { font-size:20px; font-weight:900; white-space:nowrap; }
${U} .hd-route-title small { font-size:12px; opacity:.85; line-height:1.2; }
${U} .hd-route-pts { flex:none; }
${U} .hd-route-pts b { font-size:16px; }
${U} .hd-route-pts.pop b { animation:hd-route-pop .35s cubic-bezier(.3,1.8,.5,1); }
@keyframes hd-route-pop { 40% { transform:scale(1.3); } }
${U} .hd-route-home { flex:none; min-width:60px; }
${U} .hd-route-fleet { display:flex; flex-wrap:wrap; justify-content:center; gap:8px; padding:6px 8px 4px; flex:none; }
${U} .hd-route-fleet::-webkit-scrollbar { display:none; }
${U} .hd-route-crew, ${U} .hd-route-energy { flex:none; display:flex; align-items:center; gap:4px; height:38px; padding:0 9px 0 5px; border:3px solid ${ink}; border-radius:19px;
  background:var(--hd-wood,none),linear-gradient(#a86a34,#76441f); color:#fff4dc; box-shadow:inset 0 2px 0 rgba(255,238,200,.4),0 2px 0 ${ink}; position:relative; }
${U} .hd-route-crew b, ${U} .hd-route-energy b { font-size:14px; font-weight:900; }
${U} .hd-route-crew.hurt b { color:#ffb7a8; }
${U} .hd-route-crew.gone { filter:grayscale(1) brightness(.7); }
${U} .hd-route-crew i, ${U} .hd-route-energy i { position:absolute; left:8px; right:8px; bottom:2px; height:3px; border-radius:2px; background:rgba(0,0,0,.4); overflow:hidden; }
${U} .hd-route-crew i::after, ${U} .hd-route-energy i::after { content:''; position:absolute; inset:0; transform-origin:left; transform:scaleX(var(--k,1)); background:#7ee07a; }
${U} .hd-route-energy i::after { background:#ffd23f; }
${U} .hd-route-crew.bump, ${U} .hd-route-energy.bump { animation:hd-route-pop .4s cubic-bezier(.3,1.8,.5,1); }

${U} .hd-route-chart { position:relative; flex:1 1 auto; min-height:0; margin:2px 8px 6px; }
${U} .hd-route-paper { position:absolute; inset:0; margin:0 auto; max-width:760px; border-radius:6px; overflow:hidden;
  background:radial-gradient(ellipse at 50% 50%,rgba(255,250,230,0) 55%,rgba(120,72,22,.35)),var(--hd-parch,none),linear-gradient(#f4e4c0,#e2c690);
  border:6px solid transparent; border-image:var(--hd-rope) 8 round; box-shadow:0 0 0 2px ${ink},0 10px 24px rgba(5,15,30,.5); }
${U} .hd-route-paper > svg { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; }
${U} .hd-route-lines line { stroke:#8a6a3c; stroke-width:2.5; stroke-dasharray:3 7; stroke-linecap:round; opacity:.45; vector-effect:non-scaling-stroke; }
${U} .hd-route-lines line.taken { stroke:#b5761a; stroke-width:4.5; stroke-dasharray:6 6; opacity:1; }
${U} .hd-route-lines line.next { stroke:#1f6f8f; stroke-width:3.5; opacity:.9; animation:hd-route-dash 1.1s linear infinite; }
@keyframes hd-route-dash { to { stroke-dashoffset:-20; } }
${U} .hd-route-deco { position:absolute; pointer-events:none; opacity:.55; }
${U} .hd-route-harbor { position:absolute; transform:translate(-50%,-50%); pointer-events:none; text-align:center; font-size:12px; font-weight:800; color:#6a4a22; }
${U} .hd-route-harbor svg { display:block; margin:0 auto; }
${U} .hd-route-layer { position:absolute; left:6px; transform:translateY(-50%); font-size:12px; font-weight:900; color:#7a5a30; opacity:.8; pointer-events:none; }

${U} .hd-route-node { position:absolute; transform:translate(-50%,-50%); width:min(calc(46% - 14px),230px); min-height:66px; display:flex; align-items:center; gap:6px; padding:5px 8px 5px 5px;
  border:3px solid ${ink}; border-radius:12px; background:var(--hd-parch,none),linear-gradient(#fbf1d8,#ecd6a4); color:${ink}; font:inherit; text-align:left; cursor:default;
  box-shadow:inset 0 2px 0 rgba(255,250,230,.7),0 3px 0 ${ink}; transition:transform .18s cubic-bezier(.3,2,.5,1),box-shadow .18s ease-out,filter .2s,opacity .2s; z-index:2; }
${U} .hd-route-node.boss { width:min(62%,280px); min-height:76px; background:var(--hd-parch,none),linear-gradient(#ffeab0,#e9c062); }
${U} .hd-route-node.fut { opacity:.82; }
${U} .hd-route-node.skip { opacity:.38; filter:grayscale(.8); }
${U} .hd-route-node.done { opacity:.92; }
${U} .hd-route-node.cur { cursor:pointer; z-index:3; box-shadow:inset 0 2px 0 rgba(255,250,230,.7),0 4px 0 ${ink},0 0 0 3px rgba(255,214,90,.0); animation:hd-route-glow 1.6s ease-in-out infinite; }
${U} .hd-route-node.cur:active { transform:translate(-50%,-50%) translateY(3px); transition-duration:.04s; }
${U} .hd-route-node.sel { background:var(--hd-wood,none),linear-gradient(#ffe58a,#e0a824); transform:translate(-50%,-50%) scale(1.06); animation:none;
  box-shadow:inset 0 2px 0 rgba(255,250,210,.7),0 6px 0 ${ink},0 0 0 3px rgba(255,214,90,.95),0 0 18px rgba(255,214,90,.85); z-index:4; }
@keyframes hd-route-glow { 50% { box-shadow:inset 0 2px 0 rgba(255,250,230,.7),0 4px 0 ${ink},0 0 0 4px rgba(255,214,90,.85),0 0 16px rgba(255,214,90,.6); } }
@media (hover:hover) and (pointer:fine) {
  ${U} .hd-route-node.cur:hover:not(.sel) { transform:translate(-50%,-50%) scale(1.08); filter:brightness(1.08); z-index:5; }
  ${U} .hd-route-restbtn:hover:not(:disabled), ${U} .hd-route-pick:hover { filter:brightness(1.1); }
}
${U} .hd-route-isle { position:relative; flex:none; width:52px; height:46px; display:flex; align-items:center; justify-content:center; }
${U} .hd-route-node.boss .hd-route-isle { width:64px; height:56px; }
${U} .hd-route-info { display:flex; flex-direction:column; gap:1px; min-width:0; line-height:1.2; }
${U} .hd-route-info > b { font-size:14px; font-weight:900; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
${U} .hd-route-tags { display:flex; flex-wrap:wrap; gap:3px; }
${U} .hd-route-tag { font-size:12px; font-weight:800; padding:0 5px; border-radius:6px; background:rgba(150,100,40,.2); white-space:nowrap; }
${U} .hd-route-tag.st { color:#fff; background:var(--c,#7a5a30); }
${U} .hd-route-val { display:flex; align-items:center; gap:4px; font-size:12px; font-weight:800; white-space:nowrap; }
${U} .hd-route-val b { font-size:14px; color:#8a4f00; }
${U} .hd-route-risk { color:#c0392b; letter-spacing:-1px; }
${U} .hd-route-risk s { text-decoration:none; color:rgba(43,26,21,.25); }
${U} .hd-route-stamp { position:absolute; right:-10px; top:-12px; min-width:34px; height:34px; padding:0 6px; border-radius:17px; border:3px solid ${ink}; background:#4caf50; color:#fff;
  display:flex; align-items:center; justify-content:center; font-size:14px; font-weight:900; box-shadow:0 2px 0 ${ink}; transform:rotate(-8deg); }
@media (pointer:coarse) { ${U} .hd-route-stamp { min-width:44px; height:44px; border-radius:22px; right:-14px; top:-16px; } }
${U} .hd-route-gain.hd-pos { color:#23803a; }
${U} .hd-route-stamp.new { animation:hd-route-stamp .5s cubic-bezier(.3,1.8,.5,1) both; }
@keyframes hd-route-stamp { 0% { transform:rotate(-30deg) scale(2.2); opacity:0; } 100% { transform:rotate(-8deg); opacity:1; } }
${U} .hd-route-node .hd-key { left:auto; right:4px; top:3px; }
/* 矮竖屏（360×640 这类）四层节点叠不下：去掉岛的小图，标签挤成一行，每张卡三行字 */
@media (orientation:portrait) and (max-height:700px) {
  ${U} .hd-route-node:not(.boss) .hd-route-isle { display:none; }
  ${U} .hd-route-node:not(.boss) { min-height:0; padding:3px 6px; }
  ${U} .hd-route-node:not(.boss) .hd-route-tags { flex-wrap:nowrap; overflow:hidden; gap:2px; }
  ${U} .hd-route-node:not(.boss) .hd-route-tag { padding:0 3px; }
}
${U} .hd-route-ship { position:absolute; left:0; top:0; z-index:6; pointer-events:none; will-change:transform; filter:drop-shadow(0 4px 3px rgba(40,20,5,.45)); }
${U} .hd-route-ship .hd-img { transform:scaleX(var(--f,1)); transition:transform .25s; }

${U} .hd-route-bottom { flex:none; display:flex; gap:10px; justify-content:center; padding:8px 10px calc(8px + env(safe-area-inset-bottom,0px));
  background:linear-gradient(rgba(255,226,170,.5) 0 2px,rgba(43,26,21,0) 2px),var(--hd-wood,none),linear-gradient(#8a5028,#5e3719); border-top:3px solid ${ink}; box-shadow:0 -4px 14px rgba(20,10,4,.35); position:relative; z-index:8; }
${U} .hd-route-bottom > .hd-btn { flex:1 1 0; max-width:260px; min-height:52px; font-size:16px; position:relative; }
${U} .hd-route-tip { position:absolute; left:50%; bottom:calc(100% + 8px); transform:translateX(-50%); white-space:nowrap; padding:4px 14px; border-radius:16px; font-size:14px; font-weight:800;
  background:rgba(43,26,21,.88); color:#fff4dc; pointer-events:none; }

/* 新手引导的提示条是基地、海图上的说明，航线图页上不出（它会压住整备条的 × 和休整钮） */
${U}:has(.hd-route) .hd-tut-tip, ${U}:has(.hd-route) .hd-tut-ring, ${U}:has(.hd-route) .hd-tut-arrow { display:none !important; }
/* 整备条开着时下面的节点点不了：误点会切换选择，还和条上的钮叠着；点空白、× 收起（maproute.ts） */
${U} .hd-route:has(.hd-route-prep) .hd-route-node { pointer-events:none; }
${U} .hd-route-prep { position:absolute; left:0; right:0; bottom:100%; margin:0 auto; width:min(100%,560px); max-height:min(56vh,420px); overflow:auto; padding:10px 12px 12px;
  animation:hd-route-up .26s cubic-bezier(.2,1.2,.4,1) both; z-index:7; }
@keyframes hd-route-up { 0% { transform:translateY(40px); opacity:0; } 100% { transform:none; opacity:1; } }
${U} .hd-route-prep h2 { margin:0; font-size:20px; flex:1; }
${U} .hd-route-prep p { margin:4px 0 6px; font-size:14px; }
${U} .hd-route-prep .hd-route-facts > span { display:inline-block; }
${U} .hd-route-rest { display:flex; flex-wrap:wrap; gap:8px; margin:4px 0 6px; }
${U} .hd-route-restbtn { min-width:66px; min-height:58px; padding:2px 8px; flex-direction:column; gap:0; line-height:1.1; font-size:14px; }
${U} .hd-route-restbtn small { font-size:12px; font-weight:800; color:#2e7d32; }
${U} .hd-route-restbtn.sel small { color:${ink}; }
${U} .hd-route-picks { display:flex; gap:10px; margin-top:8px; }
${U} .hd-route-pick { flex:1 1 0; min-height:72px; flex-direction:column; gap:2px; line-height:1.2; padding:6px 8px; }
${U} .hd-route-pick b { font-size:20px; }
${U} .hd-route-pick small { font-size:12px; font-weight:700; }

/* 手机竖屏：船多时船队一行放不下，卡片缩小、换成两行（全部看得见、不出屏）；底栏收矮一点，顶栏 + 底栏仍在屏高 22% 内 */
@media (max-width:559px) {
  ${U} .hd-route-fleet { gap:4px; padding:4px 6px 2px; }
  ${U} .hd-route-crew, ${U} .hd-route-energy { height:30px; gap:2px; padding:0 6px 0 3px; border-width:2px; border-radius:15px; }
  ${U} .hd-route-crew .hd-img, ${U} .hd-route-energy .hd-img { height:20px !important; width:auto !important; }
  ${U} .hd-route-crew b, ${U} .hd-route-energy b { font-size:12px; }
  ${U} .hd-route-crew i, ${U} .hd-route-energy i { left:5px; right:5px; bottom:1px; }
  ${U} .hd-route-top { min-height:46px; }
  ${U} .hd-route-bottom { padding-top:6px; padding-bottom:calc(6px + env(safe-area-inset-bottom,0px)); }
  ${U} .hd-route-bottom > .hd-btn { min-height:48px; }
}
/* 手机横屏：航线节点矮一点，纸面放得下 */
@media (orientation:landscape) and (max-height:500px) {
  ${U} .hd-route-node { width:min(calc(46% - 14px),330px); min-height:44px; padding:1px 8px 1px 5px; gap:5px; }
  ${U} .hd-route-node.boss { width:min(62%,340px); min-height:44px; }
  ${U} .hd-route-harbor { transform:translate(-50%,-80%); }
  ${U} .hd-route-isle { width:38px; height:32px; }
  ${U} .hd-route-node.boss .hd-route-isle { width:40px; height:34px; }
  ${U} .hd-route-isle img, ${U} .hd-route-isle svg { max-width:100%; max-height:100%; width:auto; height:auto; object-fit:contain; }
  ${U} .hd-route-info { display:grid; grid-template-columns:minmax(0,1fr) auto; column-gap:6px; align-items:center; }
  ${U} .hd-route-info > b { grid-column:1 / -1; }
  ${U} .hd-route-fleet { padding:2px 6px 0; gap:4px; }
  ${U} .hd-route-crew, ${U} .hd-route-energy { height:30px; }
  ${U} .hd-route-bottom { padding-top:4px; padding-bottom:calc(4px + env(safe-area-inset-bottom,0px)); }
  ${U} .hd-route-bottom > .hd-btn { min-height:44px; }
  ${U} .hd-route-top { min-height:42px; padding-top:calc(3px + env(safe-area-inset-top,0px)); }
  ${U} .hd-route-chart { margin:0 8px 8px; }
  ${U} .hd-route-prep { max-height:none; overflow:visible; padding:6px 12px 8px; }
  ${U} .hd-route-prep p { margin:2px 0 4px; }
}
/* 海图上点岛的面板：不再按屏高 60% 截成滚动，手机横屏收紧间距 */
${U} .hd-map > .hd-sheet { max-height:none; overflow:visible; }
@media (orientation:landscape) and (max-height:500px) {
  ${U} .hd-map > .hd-sheet { padding:8px 12px 8px; }
  ${U} .hd-map > .hd-sheet .hd-desc, ${U} .hd-map > .hd-sheet .hd-mech, ${U} .hd-map > .hd-sheet .hd-bountyline { margin:2px 0; font-size:12px; }
  ${U} .hd-map > .hd-sheet .hd-chips { margin:4px 0; }
  ${U} .hd-map > .hd-sheet .hd-btn-plain { margin-top:8px !important; }
}
/* 电脑、平板：整备条靠右下，不盖住海图 */
@media (min-width:900px) and (min-height:560px) {
  ${U} .hd-route-prep { left:auto; right:12px; width:400px; margin:0; }
  ${U} .hd-route-node { width:min(40%,250px); }
}

/* ---------- 站间条（登陆战打完一站，盖在战场上） ---------- */
${U} .hd-route-mid { z-index:46; }
${U} .hd-route-midbox { width:min(100%,400px); text-align:center; padding:10px 14px 14px; animation:hd-resin .5s cubic-bezier(.2,1.3,.4,1) both; }
${U} .hd-route-midbox h2 { margin:0 0 2px; font-size:20px; }
${U} .hd-route-midbox .hd-stars { justify-content:center; }
${U} .hd-route-gain { display:flex; align-items:baseline; justify-content:center; gap:6px; color:#a86400; text-shadow:0 2px 0 rgba(255,240,200,.8); line-height:1.1; margin:2px 0; }
${U} .hd-route-gain b { font-size:40px; font-weight:900; font-variant-numeric:tabular-nums; }
${U} .hd-route-gain small { font-size:16px; font-weight:900; }
${U} .hd-route-total { font-size:14px; font-weight:800; margin-bottom:6px; }
${U} .hd-route-losscap { font-size:12px; font-weight:800; opacity:.75; margin:2px 0 4px; }
${U} .hd-route-loss { display:flex; flex-wrap:wrap; gap:6px; justify-content:center; margin:0 0 10px; }
${U} .hd-route-loss span { position:relative; display:inline-flex; flex-direction:column; align-items:center; min-width:52px; padding:4px 6px 3px; border-radius:10px; border:2px solid rgba(90,58,34,.35); background:rgba(255,248,225,.7); font-size:14px; font-weight:800; }
${U} .hd-route-loss span.gone { filter:grayscale(1); opacity:.6; }
${U} .hd-route-loss em { position:absolute; top:-6px; right:-6px; font-style:normal; font-size:12px; line-height:18px; min-width:18px; padding:0 4px; border-radius:9px; background:#c0392b; color:#fff; border:2px solid #2b1a15; }
${U} .hd-route-loss em.up { background:#2e7d32; }
${U} .hd-route-midbox .hd-row { opacity:0; transition:opacity .35s; }
${U} .hd-route-midbox .hd-row.on { opacity:1; }
${U} .hd-route-midbox .hd-row .hd-btn { min-height:50px; }

/* ---------- 终局演出 ---------- */
${U} .hd-route-end { position:absolute; inset:0; z-index:46; pointer-events:auto; overflow:hidden;
  background:radial-gradient(ellipse at 50% 55%,#2f7f98,#123a55 65%,#081d2e); animation:hd-route-in .3s ease-out both; }
${U} .hd-route-end.sunk { background:radial-gradient(ellipse at 50% 55%,#4a5b6e,#28374a 65%,#141c28); transition:background 1.2s; }
${U} .hd-route-endpts { position:absolute; left:50%; top:calc(16px + env(safe-area-inset-top,0px)); transform:translateX(-50%); z-index:3; }
${U} .hd-route-endpts b { font-size:26px; }
${U} .hd-route-endpts small { font-size:14px; color:#ffb7a8; }
${U} .hd-route-stage { position:absolute; left:50%; top:54%; width:0; height:0; }
${U} .hd-route-rays { position:absolute; left:-260px; top:-300px; width:520px; height:520px; border-radius:50%; opacity:0; pointer-events:none;
  background:repeating-conic-gradient(rgba(255,226,120,.38) 0 9deg,transparent 9deg 18deg); -webkit-mask-image:radial-gradient(circle,#000 10%,transparent 66%); mask-image:radial-gradient(circle,#000 10%,transparent 66%); }
${U} .hd-route-pillar { position:absolute; left:-60px; bottom:10px; width:120px; height:70vh; transform-origin:50% 100%; transform:scaleY(0); opacity:0; pointer-events:none;
  background:linear-gradient(to top,rgba(255,236,150,.95),rgba(255,214,90,.55) 40%,rgba(255,214,90,0)); filter:blur(4px); border-radius:60px 60px 0 0; }
${U} .hd-route-chest { position:absolute; left:-70px; top:-60px; width:140px; height:110px; will-change:transform; }
${U} .hd-route-chest > div { position:absolute; left:0; }
${U} .hd-route-chest .lid { top:0; transform-origin:8% 92%; z-index:2; }
${U} .hd-route-chest .body { top:38px; }
${U} .hd-route-chest .glow { left:16px; top:30px; width:108px; height:30px; border-radius:50%; background:radial-gradient(#fff6c8,#ffd23f 50%,rgba(255,200,60,0) 72%); opacity:0; }
${U} .hd-route-shadow { position:absolute; left:-62px; top:56px; width:124px; height:20px; border-radius:50%; background:rgba(0,0,0,.35); }
${U} .hd-route-coin { position:absolute; left:0; top:0; z-index:4; pointer-events:none; will-change:transform; display:none; }
${U} .hd-route-sinkship { position:absolute; left:-110px; top:-150px; will-change:transform; }
${U} .hd-route-waves { position:absolute; left:-320px; top:-10px; width:640px; height:120px; z-index:2; pointer-events:none;
  background:linear-gradient(rgba(30,70,110,0),rgba(20,50,80,.9) 40%); border-radius:40% 40% 0 0; }
${U} .hd-route-bubble { position:absolute; left:0; top:0; width:12px; height:12px; border-radius:50%; border:2px solid rgba(220,240,255,.8); display:none; z-index:3; }
${U} .hd-route-endcap { position:absolute; left:0; right:0; top:calc(70px + env(safe-area-inset-top,0px)); text-align:center; color:#fff4dc; font-size:20px; font-weight:900;
  text-shadow:0 2px 4px rgba(0,0,0,.6); opacity:0; }
${U} .hd-route-result { width:min(100%,420px); }
${U} .hd-route-result .hd-big { color:#8a4f00; }
${U} .hd-route-trail { display:flex; flex-wrap:wrap; gap:4px; justify-content:center; margin:2px 0 8px; }
${U} .hd-route-trail span { font-size:12px; font-weight:800; padding:1px 7px; border-radius:10px; background:rgba(150,100,40,.18); }
${U} .hd-route-result p { margin:0 0 6px; text-align:center; font-size:14px; }
${U} .hd-route-result .hd-new { color:#c0392b; font-weight:900; }
${U} .hd-route-result .hd-row { margin-bottom:8px; }
${U} .hd-route-result .hd-live-ret, ${U} .hd-route-result .hd-live-net { font-weight:800; text-align:center; }

/* ---------- 海图上的"今日航线"卡 ---------- */
${U} .hd-mapcard { position:absolute; left:8px; top:114px; z-index:32; width:calc(100% - 100px); max-width:360px; min-height:60px; display:flex; align-items:center; gap:8px; padding:6px 12px 6px 8px;
  border:3px solid ${ink}; border-radius:12px; background:var(--hd-parch,none),linear-gradient(#fff3d0,#f0cf7a); color:${ink}; font:inherit; text-align:left; cursor:pointer; pointer-events:auto;
  box-shadow:inset 0 2px 0 rgba(255,250,230,.7),0 3px 0 ${ink}; animation:hd-route-glow 1.8s ease-in-out infinite; transition:transform .18s cubic-bezier(.3,2,.5,1); }
${U} .hd-mapcard:active { transform:translateY(3px); transition-duration:.04s; }
${U} .hd-mapcard .hd-mc-t { display:flex; flex-direction:column; line-height:1.2; min-width:0; }
${U} .hd-mapcard b { font-size:16px; font-weight:900; }
${U} .hd-mapcard small { font-size:12px; font-weight:700; line-height:1.2; }
${U} .hd-mapcard .hd-mc-go { margin-left:auto; flex:none; font-size:14px; font-weight:900; padding:2px 10px; border-radius:10px; border:2px solid ${ink}; background:linear-gradient(#ffe58a,#e0a824); }
@media (hover:hover) and (pointer:fine) { ${U} .hd-mapcard:hover { filter:brightness(1.08); transform:translateY(-2px); } }
.hd-ui .hd-map:has(.hd-sheet) ~ .hd-mapcard, .hd-ui .hd-map:has(.hd-sheet) ~ .hd-seacards { display:none; }
/* 海图上的入口卡容器（今日航线、护航）：卡按内容高度往下排，不各自写死位置 */
${U} .hd-seacards { position:absolute; left:8px; top:114px; z-index:32; width:calc(100% - 128px); max-width:360px; display:flex; flex-direction:column; gap:8px; pointer-events:none; }
${U} .hd-seacards > .hd-mapcard { position:relative; left:auto; top:auto; width:100%; max-width:none; }
/* 今日航线卡和旁边的"实盘"小钮同一行：卡收窄，装饰用的"出航"小牌让给小钮（整张卡本来就能点） */
${U} .hd-seacards > .hd-mc-row { display:flex; align-items:stretch; gap:8px; width:100%; pointer-events:none; }
${U} .hd-seacards > .hd-mc-row > .hd-mapcard { position:relative; left:auto; top:auto; flex:1 1 0; width:auto; min-width:0; max-width:none; }
${U} .hd-mc-row .hd-mapcard .hd-mc-go { display:none; }
${U} .hd-mapchip { flex:none; min-width:56px; min-height:60px; padding:4px 8px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:0; font:inherit; color:#fff4dc;
  border:3px solid ${ink}; border-radius:12px; background:var(--hd-wood,none),linear-gradient(#a86a34,#76441f); box-shadow:inset 0 2px 0 rgba(255,238,200,.4),0 3px 0 ${ink}; cursor:pointer; pointer-events:auto; }
${U} .hd-mapchip b { font-size:16px; font-weight:900; }
${U} .hd-mapchip small { font-size:12px; font-weight:700; }
${U} .hd-mapchip:active { transform:translateY(3px); }

/* ---------- 出海海图：可拖动平移的地图（页面不滚，内容 transform 平移） ---------- */
${U} .hd-map { overflow:hidden; overflow:clip; touch-action:none; overscroll-behavior:none; user-select:none; -webkit-user-select:none; }
${U} .hd-map .hd-map-in { will-change:transform; }
${U} .hd-map .hd-map-in.glide { transition:transform .35s cubic-bezier(.2,.9,.3,1); }
/* 横屏放不下「卡片栏（左 8–368）+ 520 宽的海图」时，海图挪到卡片栏右边：手机横屏原来当前那座岛正好躲在卡片后面，看不见也点不到
   （岛的横坐标是海图宽的百分比，挪了照样排得开；右边让出回岛 / 回到下一关那一列） */
@media (orientation:landscape) and (max-width:1271px) {
  ${U} .hd-map .hd-map-in { margin-left:376px; width:min(520px, calc(100% - 484px)); }
}
${U} button.hd-map-home { position:absolute; top:114px; right:6px; z-index:31; min-width:44px; min-height:44px; padding:0 10px; }
/* 下一关：岛上插「下一关」小旗，旁边一颗晃动的大「出发」钮（岛在右半边放左边、左半边放右边） */
${U} .hd-map .hd-nextflag { position:absolute; left:50%; top:-22px; translate:-50% 0; z-index:1; padding:0 8px; border:3px solid ${ink}; border-radius:10px; background:linear-gradient(#ffe58a,#e0a824); color:${ink}; font-size:14px; font-weight:900; white-space:nowrap; box-shadow:0 2px 0 ${ink}; }
${U} .hd-map button.hd-node-go { position:absolute; z-index:2; min-width:76px; min-height:48px; padding:0 14px; font-size:16px; animation:hd-nextbob 1.4s ease-in-out infinite; }
${U} .hd-map button.hd-node-go.r { translate:70px -50%; }
${U} .hd-map button.hd-node-go.l { translate:calc(-100% - 70px) -50%; }
/* 岛面板开着时面板里已经有「出发」：岛旁那颗收起，同屏不出两颗出发 */
${U} .hd-map:has(> .hd-sheet) button.hd-node-go { visibility:hidden; }
/* 光圈的外发光会漫到名牌上把字洗白：名牌压在光圈上面 */
${U} .hd-map .hd-node.next span.hd-lb { position:relative; z-index:1; }
@keyframes hd-nextbob { 0%,100% { margin-top:0; } 50% { margin-top:-5px; } }
@media (prefers-reduced-motion:reduce) { ${U} .hd-map button.hd-node-go { animation:none; } }
/* 电脑和横屏：入口卡只留图标、标题和一行状态，不再一闪一闪地抢下一关的风头 */
${U} .hd-seacards .hd-mapcard { animation:none; min-height:52px; }
/* 手机竖屏：今日悬赏、今日航线、护航收成顶上一条单行小卡（只留图标 + 标题，细节点进去再看），原来三张叠起来占 31% 屏高盖住航线；
   回岛放到顶行大厅和设置之间的空当，回到下一关沉到右下角「悬赏出海（实盘）」的上面（左下是罗盘）：以前两颗钮叠在小卡下面，右边一列 8 个控件，切掉岛名牌 */
@media (max-width:559px) and (orientation:portrait) {
  ${U} .hd-bounty { top:58px; width:114px; max-width:none; min-height:44px; padding:2px 6px; gap:4px; }
  ${U} .hd-bounty .hd-img { height:24px !important; width:24px !important; }
  ${U} .hd-bounty small { display:none; }
  ${U} .hd-bounty b { font-size:14px; white-space:nowrap; }
  ${U} .hd-seacards { top:58px; left:130px; width:calc(100% - 138px); max-width:none; flex-direction:row; align-items:stretch; gap:8px; }
  ${U} .hd-seacards > .hd-mc-row { flex:1 1 auto; width:auto; min-width:0; }
  ${U} .hd-seacards > .hd-mapcard { flex:1 1 auto; width:auto; min-width:0; }
  ${U} .hd-seacards .hd-mapcard { min-height:44px; padding:2px 6px; gap:4px; animation:none; }
  ${U} .hd-seacards .hd-mapcard .hd-img { height:24px !important; width:24px !important; }
  ${U} .hd-seacards .hd-mapcard small, ${U} .hd-seacards .hd-mapcard .hd-mc-go { display:none; }
  ${U} .hd-seacards .hd-mapcard b { font-size:14px; white-space:nowrap; }
  ${U} .hd-seacards .hd-mapchip { min-width:44px; min-height:44px; padding:2px 4px; }
  ${U} .hd-map-close { top:calc(6px + env(safe-area-inset-top,0px)); right:calc(58px + env(safe-area-inset-right,0px)); min-height:44px; }
  /* 右下角最底下是登录后的「悬赏出海（实盘）」（底边 14、高 44），回到下一关叠在它上面隔 8 */
  ${U} button.hd-map-home { top:auto; bottom:calc(66px + env(safe-area-inset-bottom,0px)); }
}
/* 360 宽登录后航线卡旁边多一个「实盘」小钮，图标 + 字放不下：两张卡只留字 */
@media (max-width:379px) and (orientation:portrait) {
  ${U} .hd-seacards .hd-mapcard .hd-img { display:none; }
}
.hd-ui .hd-map:has(.hd-sheet) ~ button.hd-map-home { display:none; }

/* ---------- 登陆战顶上的站名条 ---------- */
${U} .hd-mapstrip { position:absolute; left:50%; top:calc(52px + env(safe-area-inset-top,0px)); transform:translateX(-50%); z-index:29; display:flex; align-items:center; gap:8px;
  height:34px; padding:0 12px 6px; border:3px solid ${ink}; border-radius:17px; background:var(--hd-wood,none),linear-gradient(#a86a34,#76441f); color:#fff4dc;
  box-shadow:inset 0 2px 0 rgba(255,238,200,.4),0 3px 0 ${ink}; white-space:nowrap; pointer-events:none !important; font-size:14px; }
${U} .hd-mapstrip b { font-size:14px; font-weight:900; }
${U} .hd-mapstrip-pts { display:inline-flex; align-items:center; gap:3px; }
${U} .hd-mapstrip-pts b.pop { animation:hd-route-pop .35s cubic-bezier(.3,1.8,.5,1); display:inline-block; }
${U} .hd-mapstrip-track { position:absolute; left:10px; right:10px; bottom:4px; height:4px; border-radius:2px; background:rgba(0,0,0,.45); overflow:hidden; }
${U} .hd-mapstrip-bar { position:absolute; inset:0; transform-origin:left; background:#7ee07a; transition:background .3s; }
${U} .hd-mapstrip-bar.low { background:#ff6b4a; }
@media (min-width:560px) { ${U} .hd-mapstrip { top:calc(60px + env(safe-area-inset-top,0px)); } }
${U} .hd-mapintro { background:linear-gradient(rgba(70,45,10,.92),rgba(120,80,20,.92)); }
${U} .hd-mapintro small { background:#e0a824; color:${ink}; }

@media (prefers-reduced-motion:reduce) {
  ${U} .hd-route, ${U} .hd-route-node.cur, ${U} .hd-mapcard, ${U} .hd-route-lines line.next, ${U} .hd-route-prep, ${U} .hd-route-midbox { animation:none; }
}
`;
  document.head.appendChild(st);
}
