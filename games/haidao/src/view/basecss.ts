import { PALETTE as P } from './art/index.ts';

/**
 * 基地手感相关的界面样式：升级面板（外观前后对比、数值"当前 → 下一级"、花费、大升级钮）、电脑右键菜单、悬停名牌、
 * 摆放时底栏的原因和提示、手机上虚影旁的 ✓ / ✕。全部写成 `.hd-ui.hd-skin …`，排在皮肤和排布之后注入。
 */
export function baseFeelCss(): string {
  const ink = P.ink!;
  const W = '.hd-ui.hd-skin';
  const parch = 'var(--hd-parch),linear-gradient(#f7ead0,#e6cf9c)';
  const green = '#23803a';
  const red = '#c0392b';
  return `
/* ---------- 基地手感（basecss.ts） ---------- */
/* 主寨"升到 N 级开放"：条件够了是绿字，红色只给缺的东西 */
${W} .hd-need.ok { color:${green}; }
${W} .hd-spend { position:absolute; z-index:30; pointer-events:none; font-size:20px; font-weight:900; color:#ff7a66; -webkit-text-stroke:3px #2b1a15; paint-order:stroke fill; text-shadow:0 2px 0 #2b1a15; }
${W} .hd-cardnote { font-weight:800; color:#8a5a0c; }
${W} .hd-cardnote.lack { color:${red}; }
${W} .hd-card.poor { opacity:.82; }
/* 升级面板：这一级 → 下一级的样子 */
${W} .hd-uphero { display:flex; align-items:center; justify-content:center; gap:10px; margin:2px 0 10px; }
${W} .hd-uplook { display:flex; flex-direction:column; align-items:center; gap:2px; font-size:14px; font-weight:900; }
${W} .hd-uppic { width:104px; height:84px; display:flex; align-items:flex-end; justify-content:center; border-radius:10px; border:2px solid rgba(94,55,25,.55); background:radial-gradient(ellipse at 50% 85%,rgba(120,72,22,.18),rgba(120,72,22,0) 70%); overflow:hidden; }
${W} .hd-uppic .hd-img { max-width:96px; height:auto !important; max-height:78px; }
${W} .hd-uplook.next .hd-uppic { border-color:#e0a824; background:radial-gradient(ellipse at 50% 80%,rgba(255,226,120,.75),rgba(255,226,120,0) 72%); box-shadow:0 0 0 2px rgba(255,214,70,.35),0 0 16px rgba(255,200,60,.45); }
${W} .hd-uplook.next span { color:#8a5a0c; }
${W} .hd-uparrow { font-size:26px; font-weight:900; color:${green}; text-shadow:0 1px 0 rgba(255,255,255,.6); animation:hd-upnudge 1.2s ease-in-out infinite; }
@keyframes hd-upnudge { 50% { transform:translateX(4px); } }

/* 数值：名字 | 当前 → 下一级 +增量（绿色） */
${W} .hd-stats { display:grid; grid-template-columns:auto auto auto auto 1fr; align-items:baseline; column-gap:8px; row-gap:4px; margin:0 0 10px; padding:8px 10px; border-radius:8px; background:rgba(150,100,40,.13); border:2px solid rgba(94,55,25,.3); }
${W} .hd-stat { display:contents; font-size:14px; }
${W} .hd-stat-k { color:#6b4a2a; font-weight:700; }
${W} .hd-stat-v { font-weight:900; text-align:right; }
${W} .hd-stat-a { opacity:.55; }
${W} .hd-stat-n { font-weight:900; color:${green}; }
${W} .hd-stat-d { justify-self:start; font-size:14px; font-weight:900; color:#fff; background:${green}; border-radius:9px; padding:0 7px; line-height:18px; }
${W} .hd-stat-d.zero { display:none; }

/* 花费和大升级钮：贴在面板底部（抽屉滚动时也看得见） */
${W} .hd-upbox { position:sticky; bottom:-14px; z-index:2; margin:6px -12px 10px; padding:8px 12px 10px; background:${parch}; border-top:2px solid rgba(94,55,25,.35); box-shadow:0 -6px 10px -6px rgba(60,30,10,.35); }
${W} .hd-upcost { display:flex; flex-wrap:wrap; align-items:center; gap:6px 12px; margin-bottom:8px; font-size:14px; }
${W} .hd-upcost-k { font-weight:800; color:#6b4a2a; }
${W} .hd-upcost-i { display:inline-flex; align-items:center; gap:4px; }
${W} .hd-upcost-i b { font-weight:900; }
${W} .hd-upcost-i.short b { color:${red}; }
${W} .hd-upcost-i small { font-size:12px; font-weight:900; color:#fff; background:${red}; border-radius:8px; padding:0 6px; line-height:18px; }
${W} .hd-btn.hd-upbtn { width:100%; min-height:58px; font-size:20px; font-weight:900; gap:8px; }
${W} .hd-btn.hd-upbtn:disabled { font-size:14px; }

/* ---------- 海盗王阶（rankui.ts）：主寨面板里的称号、进度条、献上钮；顶栏船长钮上的王旗色点 ---------- */
${W} .hd-rank { margin:0 0 10px; padding:8px 10px 10px; border-radius:8px; background:rgba(150,100,40,.13); border:2px solid rgba(94,55,25,.3); }
${W} .hd-rank .hd-rank-head { display:flex; align-items:center; gap:10px; margin:0 0 6px; }
${W} .hd-rank .hd-rank-pic { flex:none; width:56px; height:64px; display:flex; align-items:flex-end; justify-content:center; }
${W} .hd-rank .hd-rank-pic .hd-img { max-width:56px; max-height:64px; width:auto !important; height:auto !important; }
${W} .hd-rank .hd-rank-t { display:flex; flex-direction:column; gap:2px; min-width:0; }
${W} .hd-rank .hd-rank-t b { font-size:16px; font-weight:900; }
${W} .hd-rank .hd-rank-t small { font-size:14px; color:#6b4a2a; font-weight:700; }
${W} .hd-rank .hd-rank-row { display:flex; align-items:center; gap:8px; margin:0 0 4px; }
${W} .hd-rank .hd-rank-bar { flex:1 1 auto; min-width:40px; height:14px; border-radius:7px; border:2px solid rgba(94,55,25,.55); background:rgba(60,30,10,.18); overflow:hidden; }
${W} .hd-rank .hd-rank-bar i { display:block; height:100%; border-radius:5px; background:linear-gradient(#ffe885,#e0a824); transition:width .5s cubic-bezier(.2,.8,.2,1); }
${W} .hd-rank .hd-rank-row:last-of-type .hd-rank-bar i { background:linear-gradient(#e9b878,#b97a3d); }
${W} .hd-rank .hd-rank-n { flex:none; font-size:14px; font-weight:800; min-width:112px; text-align:right; }
${W} .hd-rank .hd-rank-lack { margin:0 0 6px; color:${red}; font-weight:700; }
${W} .hd-rank .hd-btn.hd-rank-go { width:100%; min-height:48px; font-size:20px; font-weight:900; gap:8px; margin:4px 0 0; }
${W} .hd-rank .hd-btn.hd-rank-go:disabled { font-size:16px; }
${W} .hd-rank .hd-rank-note { margin:6px 0 0; font-size:12px; }
${W} .hd-rank-lock { margin:6px 0 0; }
${W} .hd-rank-title { font-weight:800; }
${W} .hd-profile.hd-ranked { position:relative; }
${W} .hd-profile.hd-ranked::after { content:''; position:absolute; top:4px; right:4px; width:12px; height:12px; border-radius:50%; background:var(--rk); border:2px solid var(--rk-trim); box-shadow:0 0 0 1px #2b1a15, 0 0 6px var(--rk-trim); pointer-events:none; }
}
@media (max-width:559px) and (orientation:portrait) {
  ${W} .hd-rank { padding:6px 8px 8px; margin-bottom:6px; }
  ${W} .hd-rank .hd-rank-pic { width:44px; height:52px; }
  ${W} .hd-rank .hd-rank-pic .hd-img { max-width:44px; max-height:52px; }
  ${W} .hd-rank .hd-rank-n { min-width:104px; }
  ${W} .hd-rank .hd-btn.hd-rank-go { min-height:44px; }
}

/* ---------- 面板一屏放下（不滚动）：翻页条、抽屉高度、紧凑排布 ---------- */
/* 翻页条：长列表（建造、成就、收藏、军械所）按抽屉放得下的数量分页，页内上一页 / 下一页 */
${W} .hd-pager { display:flex; align-items:center; justify-content:center; gap:10px; margin-top:8px; }
${W} .hd-pager .hd-pg { flex:1 1 0; max-width:150px; }
${W} .hd-pg-n { min-width:56px; text-align:center; font-weight:900; }
${W} .hd-presetbtn { width:100%; margin-bottom:8px; }
/* 船队：先点哪条船，再在它下面选兵（每条船的选项都全部摆出来，不折叠） */
${W} .hd-boattabs { display:flex; gap:8px; margin:0 0 8px; }
${W} .hd-boattab { flex:1 1 0; min-width:44px; padding:0 4px; gap:4px; font-size:14px; }
${W} .hd-boattab .hd-img { height:26px !important; width:auto !important; }
${W} .hd-fleetgrid { grid-template-columns:repeat(5,minmax(0,1fr)); gap:8px; margin-bottom:6px; }
${W} .hd-fleetgrid .hd-card { min-height:0; padding:6px 2px; gap:2px; border-width:3px; }
${W} .hd-fleetgrid .hd-card.cur { background:#ffe885; }
${W} .hd-fleetgrid .hd-nm { font-size:14px; text-align:center; }
${W} .hd-fleetgrid .hd-sub { text-align:center; line-height:1.2; }
${W} .hd-fleetgrid .hd-card .hd-img { height:36px !important; width:auto !important; }
${W} .hd-boatname { font-weight:900; margin:0 0 6px; }

/* 侦察图是可拖动缩放的视窗，内容按需缩放，不是溢出；用 clip 明示裁在视窗里 */
${W} .hd-scout-map { overflow:clip !important; }

/* 手机横屏：靠右站满高度的面板（layout.ts）加宽到 600，内容紧凑；建造页的推荐布局钮、"能升级"、卡片同排 */
@media (orientation:landscape) and (max-height:500px) {
  ${W} .hd-base > .hd-sheet { width:min(660px,78%); padding:4px 10px 4px; }
  ${W} .hd-base > .hd-sheet .hd-head { margin-bottom:0; }
  ${W} .hd-base > .hd-sheet .hd-desc { margin:0 0 2px; }
  ${W} .hd-base > .hd-sheet .hd-uplook { gap:0; font-size:12px; }
  ${W} .hd-sbody:has(> .hd-presetbtn) { display:flex; flex-wrap:wrap; align-items:center; gap:4px 8px; }
  ${W} .hd-sbody > .hd-presetbtn { width:auto; margin:0; }
  ${W} .hd-sbody > .hd-desc { margin:0; }
  ${W} .hd-sbody > .hd-chips { margin:0; }
  ${W} .hd-sbody > .hd-grid, ${W} .hd-sbody > .hd-pager { width:100%; }
  ${W} .hd-base > .hd-sheet .hd-grid { grid-template-columns:repeat(auto-fill,minmax(110px,1fr)); gap:8px; }
  ${W} .hd-base > .hd-sheet .hd-card { min-height:0; padding:3px 4px; gap:1px; }
  /* 只缩卡上的建筑图（卡的直接子元素）；写成后代选择器会把花费里 18 的金币、木材小图标也撑到 36，伐木场、船坞的木材数被挤出卡外 */
  ${W} .hd-base > .hd-sheet .hd-card > .hd-img { height:36px !important; width:auto !important; }
  ${W} .hd-base > .hd-sheet .hd-pager { margin-top:8px; }
  ${W} .hd-base > .hd-sheet .hd-tabs { margin-bottom:4px; }
  ${W} .hd-base > .hd-sheet .hd-fleetgrid { grid-template-columns:repeat(5,minmax(0,1fr)); gap:8px; margin-bottom:2px; }
  ${W} .hd-base > .hd-sheet .hd-fleetgrid .hd-card { padding:3px 2px; }
  ${W} .hd-base > .hd-sheet .hd-fleetgrid .hd-card .hd-img { height:22px !important; }
  ${W} .hd-fleetgrid .hd-card > span { line-height:1.15; }
  ${W} .hd-sbody > .hd-chips:last-child { margin:2px 0 0; }
  ${W} .hd-boattabs { margin-bottom:8px; }
  ${W} .hd-boatname { display:none; }
  ${W} .hd-base > .hd-sheet .hd-ach { margin-bottom:4px; padding:3px 8px; }
  ${W} .hd-base > .hd-sheet .hd-uppic { width:64px; height:44px; }
  ${W} .hd-base > .hd-sheet .hd-uppic .hd-img { max-height:40px; }
  ${W} .hd-sbody > .hd-chips { margin:8px 0; }
  ${W} .hd-upbox { margin:4px -10px 4px; padding:4px 10px 6px; }
  ${W} .hd-btn.hd-upbtn { min-height:48px; }
}

/* 升级面板宽排布（手机横屏的右侧面板、电脑的右侧面板）：外观对比和数值在左，"升到 N 级开放"在右；
   花费和大按钮并排，"移动"和"接着升"同一行 */
@media (orientation:landscape) and (max-height:500px), (min-width:900px) and (min-height:560px) {
  ${W} .hd-sbody:has(.hd-uphero) { display:grid; grid-template-columns:1fr 1fr; gap:0 10px; align-items:start; }
  ${W} .hd-sbody:has(.hd-uphero) > * { grid-column:1 / -1; }
  ${W} .hd-sbody:has(.hd-uphero) > .hd-uphero { grid-column:1; grid-row:2; margin:0 0 4px; }
  ${W} .hd-sbody:has(.hd-uphero) > .hd-stats { grid-column:2; grid-row:2; margin:0 0 4px; padding:4px 8px; }
  ${W} .hd-sbody:has(.hd-unlock) > .hd-stats { grid-column:1; grid-row:3; }
  ${W} .hd-sbody:has(.hd-unlock) > .hd-unlock { grid-column:2; grid-row:2 / span 2; margin:0 0 4px; padding:4px 8px; height:calc(100% - 4px); }
  ${W} .hd-sbody:has(.hd-unlock) > .hd-unlock .hd-items { margin:3px 0; }
  ${W} .hd-sbody:has(.hd-unlock) > .hd-upbox { grid-column:1 / -1; grid-row:4; margin:0 0 4px; display:grid; grid-template-columns:1.3fr 1fr 1fr; gap:0 8px; align-items:center; }
  ${W} .hd-sbody:has(.hd-unlock) > .hd-upbox > .hd-upcost { grid-column:1; grid-row:1; margin:0; }
  ${W} .hd-sbody:has(.hd-unlock) > .hd-upbox > .hd-upbtn { grid-column:2; grid-row:1; margin:0; min-height:48px; font-size:14px; }
  ${W} .hd-sbody:has(.hd-unlock) > .hd-upbox > .hd-upbtn:last-child { grid-column:2 / -1; }
  ${W} .hd-sbody:has(.hd-unlock) > .hd-upbox > .hd-upgo { grid-column:3; grid-row:1; margin:0 !important; min-height:48px !important; }
  ${W} .hd-sbody:has(.hd-unlock) > .hd-row { grid-column:1; grid-row:5; }
  ${W} .hd-sbody:has(.hd-unlock) > .hd-nextup-k { display:none; }
  ${W} .hd-sbody:has(.hd-unlock) > .hd-nextup { grid-column:2; grid-row:5; margin:0; }
  ${W} .hd-sbody:has(.hd-unlock) > .hd-nextup::before { content:'接着升：'; font-weight:800; align-self:center; }
  ${W} .hd-sbody > .hd-chips:empty { display:none; }
}
@media (min-width:900px) and (min-height:560px) {
  ${W} .hd-base > .hd-sheet { width:560px; }
}

/* 平板竖屏：主寨面板（升级对比 + 开放项 + 接着升）比 60% 高出几像素就出滚动条；屏高够，放到 64%，上面照样露出主寨 */
@media (orientation:portrait) and (min-width:560px) {
  ${W} .hd-base > .hd-sheet { max-height:64%; }
}
/* 手机竖屏：抽屉可以到顶栏下面，不再只给 60% */
@media (max-width:559px) and (orientation:portrait) {
  ${W} .hd-base > .hd-sheet { max-height:calc(100% - 104px); padding:8px 10px 10px; }
  ${W} .hd-base > .hd-sheet .hd-head { margin-bottom:4px; }
  ${W} .hd-base > .hd-sheet .hd-desc { margin:0 0 6px; }
  ${W} .hd-fleetgrid { grid-template-columns:repeat(5,minmax(0,1fr)); gap:8px; }
  ${W} .hd-fleetgrid .hd-sub { font-size:12px; }
  ${W} .hd-fleetgrid .hd-card .hd-img { height:30px !important; }
  ${W} .hd-base > .hd-sheet .hd-uppic { width:76px; height:52px; }
  ${W} .hd-base > .hd-sheet .hd-uppic .hd-img { max-height:48px; }
  ${W} .hd-base > .hd-sheet .hd-unlock { padding:6px 8px; margin-bottom:6px; }
  ${W} .hd-base > .hd-sheet .hd-items { margin:4px 0; }
  ${W} .hd-base > .hd-sheet .hd-upbox { margin:4px -10px 6px; padding:6px 10px 8px; }
  ${W} .hd-base > .hd-sheet .hd-uphero { margin:0 0 6px; }
  ${W} .hd-base > .hd-sheet .hd-stats { margin:0 0 6px; padding:6px 8px; }
  ${W} .hd-base > .hd-sheet .hd-chips { margin-bottom:8px; }
  ${W} .hd-btn.hd-upbtn { min-height:48px; }
}
/* 矮的竖屏（360×640 一类）：主寨面板缺星时多了去处钮和"接着升"，单列放不下。
   灰着的升级钮和去处钮并排，"移动"和"接着升"同一行，外观图再小一档；信息一条不少 */
@media (max-width:559px) and (orientation:portrait) and (max-height:700px) {
  ${W} .hd-base > .hd-sheet .hd-uppic { width:60px; height:40px; }
  ${W} .hd-base > .hd-sheet .hd-uppic .hd-img { max-height:36px; }
  ${W} .hd-base > .hd-sheet .hd-uplook { gap:0; font-size:12px; }
  ${W} .hd-base > .hd-sheet .hd-upbox:has(> .hd-upgo) { display:grid; grid-template-columns:1fr 1fr; gap:4px 6px; align-items:stretch; }
  ${W} .hd-base > .hd-sheet .hd-upbox:has(> .hd-upgo) > .hd-upcost { grid-column:1 / -1; margin-bottom:2px; }
  ${W} .hd-base > .hd-sheet .hd-upbox:has(> .hd-upgo) > .hd-upbtn { margin:0; min-height:44px; font-size:14px; }
  ${W} .hd-base > .hd-sheet .hd-upbox:has(> .hd-upgo) > .hd-upgo { margin:0 !important; font-size:14px; }
  ${W} .hd-sbody:has(.hd-uphero) { display:grid; grid-template-columns:auto minmax(0,1fr); gap:0 6px; align-items:center; }
  ${W} .hd-sbody:has(.hd-uphero) > * { grid-column:1 / -1; }
  ${W} .hd-sbody:has(.hd-uphero) > .hd-row { grid-column:1; margin:0; }
  ${W} .hd-sbody:has(.hd-uphero) > .hd-nextup-k { display:none; }
  ${W} .hd-sbody:has(.hd-uphero) > .hd-nextup { grid-column:2; margin:0; }
  ${W} .hd-sbody:has(.hd-uphero) > .hd-nextup::before { content:'接着升：'; font-weight:800; font-size:12px; align-self:center; white-space:nowrap; }
  ${W} .hd-sbody:has(.hd-uphero) > .hd-nextup { gap:8px; align-items:center; }
  ${W} .hd-sbody:has(.hd-uphero) > .hd-nextup .hd-upchip { padding:0 8px; font-size:12px; }
  ${W} .hd-sbody:has(.hd-uphero) > .hd-row .hd-btn { padding:0 10px; }
  ${W} .hd-sbody > .hd-chips:empty { display:none; }
}

/* 电脑右键菜单：贴着鼠标，竖排，每项右边是快捷键 */
${W} .hd-ctxmenu { position:absolute; z-index:40; width:228px; padding:6px; display:flex; flex-direction:column; gap:4px; pointer-events:auto; background:${parch}; border:3px solid ${ink}; border-radius:10px; box-shadow:0 8px 20px rgba(10,8,20,.45),inset 0 0 14px rgba(120,72,22,.25); animation:hd-ctxin .14s cubic-bezier(.3,1.5,.5,1) both; transform-origin:0 0; }
@keyframes hd-ctxin { 0% { transform:scale(.85); opacity:0; } }
${W} .hd-ctxhead { font-size:14px; font-weight:900; color:#6b4a2a; padding:2px 6px 4px; border-bottom:2px solid rgba(94,55,25,.25); }
${W} .hd-btn.hd-ctxitem { position:relative; justify-content:flex-start; gap:8px; min-height:44px; padding:0 8px; font-size:14px; border-width:2px; box-shadow:0 2px 0 ${ink}; }
${W} .hd-btn.hd-ctxitem.up { background:var(--hd-wood),linear-gradient(#ffe58a,#e0a824); }
${W} .hd-btn.hd-ctxitem.off { filter:saturate(.3) brightness(.9); }
${W} .hd-ctxic { display:inline-flex; width:20px; justify-content:center; }
${W} .hd-ctxlb { font-weight:900; }
${W} .hd-ctxitem .hd-cost { margin-left:auto; font-size:14px; }
${W} .hd-ctxitem .hd-cost .hd-img { height:16px !important; width:auto !important; }
${W} .hd-ctxwhy { margin-left:auto; font-size:12px; font-weight:800; color:${red}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:110px; }
${W} .hd-ctxwhy + .hd-ctxkey { margin-left:6px; }
${W} .hd-ctxkey { margin-left:auto; min-width:22px; height:22px; padding:0 5px; border-radius:6px; background:rgba(43,26,21,.8); color:#fff4dc; font:800 12px/22px system-ui,sans-serif; text-align:center; }
${W} .hd-ctxitem .hd-cost + .hd-ctxkey { margin-left:6px; }
${W} .hd-ctxitem .hd-dot { display:block; top:-5px; right:-5px; width:14px; height:14px; border-width:2px; }

/* 悬停名牌：名字 + 等级 + 能升级的小箭头 */
${W} .hd-nameplate { position:absolute; left:0; top:0; z-index:24; display:none; align-items:center; gap:6px; padding:3px 10px; border-radius:12px; white-space:nowrap; pointer-events:none !important;
  background:var(--hd-wood),linear-gradient(#a86a34,#76441f); color:#fff4dc; border:2px solid ${ink}; box-shadow:0 3px 0 ${ink}; font-size:14px; text-shadow:0 1px 0 rgba(40,20,6,.7); }
${W} .hd-nameplate.on { display:inline-flex; }
${W} .hd-nameplate b { font-weight:900; }
${W} .hd-np-lv { opacity:.9; }
${W} .hd-np-up { font-style:normal; font-size:12px; color:#fff; background:#2f9a46; border:2px solid ${ink}; border-radius:50%; width:20px; height:20px; display:inline-flex; align-items:center; justify-content:center; animation:hd-npup 1s ease-in-out infinite; }
@keyframes hd-npup { 50% { transform:translateY(-2px); } }

/* 摆放：底栏写能不能放和原因；手指用虚影旁的 ✓ / ✕，鼠标看提示和取消钮 */
${W} .hd-place .hd-tag { flex-wrap:wrap; justify-content:center; max-width:min(100%,520px); }
${W} .hd-place-why { font-weight:900; padding:0 8px; border-radius:9px; line-height:22px; }
${W} .hd-place-why.ok { color:#fff; background:#2f8a40; }
${W} .hd-place-why.bad { color:#fff; background:${red}; }
${W} .hd-place-hint { font-size:14px; font-weight:800; color:#fff4dc; text-shadow:0 1px 2px rgba(0,0,0,.8),0 0 6px rgba(0,0,0,.5); text-align:center; }
/* 新手引导开着时它已经说了怎么摆，提示行收起，不和引导文字抢位置 */
.hd-ui.hd-skin:has(.hd-tut-tip) .hd-place-hint { display:none; }
${W} .hd-place.touch .hd-place-row { display:none; }
${W} .hd-place-float { position:absolute; left:0; top:0; z-index:26; display:none; gap:8px; pointer-events:none !important; }
${W} .hd-place-float.on { display:flex; }
${W} .hd-place-float .hd-btn { width:52px; min-width:52px; height:52px; padding:0; font-size:24px; font-weight:900; border-radius:50%; pointer-events:auto; }
${W} .hd-place-float .hd-place-ok:disabled { opacity:.55; }
`;
}
