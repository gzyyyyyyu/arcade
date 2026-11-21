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
/* 升级面板（openInfo）：.hd-up 两栏，左栏大立绘 + "这一级 → 下一级"小图，右栏描述、数值、花费和大升级钮；竖屏变上下（立绘缩成一排在上） */
${W} .hd-sheet .hd-up { display:grid; grid-template-columns:168px minmax(0,1fr); gap:10px; align-items:start; margin:0 0 8px; }
${W} .hd-sheet .hd-up.max { grid-template-columns:140px minmax(0,1fr); }
${W} .hd-sheet .hd-up-art { display:flex; flex-direction:column; align-items:center; gap:6px; }
${W} .hd-sheet .hd-up-big { width:100%; height:140px; display:flex; align-items:flex-end; justify-content:center; border-radius:10px; border:2px solid rgba(94,55,25,.55); background:radial-gradient(ellipse at 50% 85%,rgba(120,72,22,.22),rgba(120,72,22,0) 70%); overflow:hidden; }
${W} .hd-sheet .hd-up-big .hd-img { max-width:calc(100% - 8px); max-height:132px; width:auto !important; height:auto !important; }
${W} .hd-sheet .hd-uphero { display:flex; align-items:center; justify-content:center; gap:4px; }
${W} .hd-sheet .hd-uplook { display:flex; flex-direction:column; align-items:center; gap:0; font-size:12px; font-weight:900; }
${W} .hd-sheet .hd-uppic { width:64px; height:48px; display:flex; align-items:flex-end; justify-content:center; border-radius:8px; border:2px solid rgba(94,55,25,.55); overflow:hidden; }
${W} .hd-sheet .hd-uppic .hd-img { max-width:60px; max-height:44px; width:auto !important; height:auto !important; }
${W} .hd-sheet .hd-uplook.next .hd-uppic { border-color:#e0a824; background:radial-gradient(ellipse at 50% 80%,rgba(255,226,120,.75),rgba(255,226,120,0) 72%); box-shadow:0 0 0 2px rgba(255,214,70,.35),0 0 12px rgba(255,200,60,.45); }
${W} .hd-sheet .hd-uplook.next span { color:#8a5a0c; }
${W} .hd-sheet .hd-uparrow { font-size:20px; font-weight:900; color:${green}; text-shadow:0 1px 0 rgba(255,255,255,.6); animation:hd-upnudge 1.2s ease-in-out infinite; }
@keyframes hd-upnudge { 50% { transform:translateX(3px); } }
${W} .hd-sheet .hd-up-side { display:flex; flex-direction:column; gap:6px; min-width:0; }
${W} .hd-sheet .hd-up-side > .hd-desc { margin:0; font-size:14px; line-height:1.3; }
${W} .hd-sheet .hd-up-side > .hd-chips { margin:0; }
${W} .hd-sheet .hd-up-side > .hd-chips:empty { display:none; }
${W} .hd-sheet .hd-up-max { font-weight:900; color:#8a5a0c; }
/* 数值：名称 | 当前 | → | 下一级 | +差值，数字等宽右对齐 */
${W} .hd-sheet .hd-stats { display:grid; grid-template-columns:minmax(0,1fr) auto auto auto auto; align-items:baseline; column-gap:8px; row-gap:2px; padding:6px 10px; border-radius:8px; background:rgba(150,100,40,.13); border:2px solid rgba(94,55,25,.3); }
${W} .hd-sheet .hd-stat { display:contents; font-size:14px; }
${W} .hd-sheet .hd-stat-k { color:#6b4a2a; font-weight:700; }
${W} .hd-sheet .hd-stat-v, ${W} .hd-sheet .hd-stat-n { font-weight:900; }
${W} .hd-sheet .hd-stat-a { opacity:.55; }
${W} .hd-sheet .hd-stat-n { color:${green}; }
${W} .hd-sheet .hd-stat-d { min-width:3.5em; }
${W} .hd-sheet .hd-stat-d.zero { visibility:hidden; }
${W} .hd-sheet .hd-up.max .hd-stats { grid-template-columns:minmax(0,1fr) auto; }
/* 花费和大升级钮 */
${W} .hd-sheet .hd-upbox { display:flex; flex-direction:column; gap:6px; padding:6px 10px 8px; border-radius:8px; border:2px solid rgba(94,55,25,.35); background:rgba(255,250,232,.45); }
${W} .hd-sheet .hd-upcost { display:flex; flex-wrap:wrap; align-items:center; gap:4px 12px; font-size:16px; }
${W} .hd-sheet .hd-upcost-k { font-size:14px; font-weight:800; color:#6b4a2a; }
${W} .hd-sheet .hd-upcost-i { display:inline-flex; align-items:center; gap:4px; }
${W} .hd-sheet .hd-upcost-i b { font-weight:900; }
${W} .hd-sheet .hd-upcost-i.short b { color:${red}; }
${W} .hd-sheet .hd-upcost-i small { font-size:12px; font-weight:900; color:#fff; background:${red}; border-radius:8px; padding:0 6px; line-height:18px; }
${W} .hd-sheet .hd-btn.hd-upbtn { width:100%; min-height:52px; font-size:20px; font-weight:900; gap:8px; }
${W} .hd-sheet .hd-btn.hd-upbtn:disabled { font-size:14px; }
${W} .hd-sheet .hd-btn.hd-upgo { width:100%; min-height:44px; font-size:14px; }
/* 收取 / 移动在标题栏（关闭钮左边）；面板底一行"接着升" */
${W} .hd-sheet .hd-up-acts { display:flex; gap:8px; flex:none; }
${W} .hd-sheet .hd-up-acts .hd-btn { padding:0 12px; font-size:14px; }
${W} .hd-sheet .hd-up-foot { display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin:8px 0 0; flex:none; }
${W} .hd-sheet .hd-nextup-k { font-size:14px; font-weight:800; }
${W} .hd-sheet .hd-nextup .hd-upchip { min-height:44px; }
${W} .hd-sheet .hd-unlock, ${W} .hd-sheet .hd-rank { margin:0 0 6px; padding:6px 10px; }
${W} .hd-sheet .hd-unlock .hd-items { margin:4px 0; }
${W} .hd-sheet .hd-unlock .hd-need { margin:0; }

/* 军械所研究（researchList）：兵种一整排网格，技能和英雄并排在下面；整张卡是按钮 */
${W} .hd-sheet .hd-rs { display:grid; grid-template-columns:minmax(0,3fr) minmax(0,2fr); gap:4px 8px; align-content:start; }
/* 研究区：先靠缩卡片放下；真放不下（手机横屏、矮竖屏）只这一块原生惯性滚动，升级钮和底栏不动 */
${W} .hd-base > .hd-sheet:has(.hd-rs) { display:flex; flex-direction:column; overflow:hidden; }
${W} :where(.hd-base > .hd-sheet:has(.hd-rs)) > .hd-sbody { flex:1 1 auto; min-height:0; display:flex; flex-direction:column; }
${W} .hd-sheet .hd-up-more:has(> .hd-rs) { flex:1 1 auto; min-height:0; overflow:hidden; }
${W} .hd-sheet .hd-rs-g.troops { grid-column:1 / -1; }
${W} .hd-sheet .hd-rs-t { display:block; font-size:14px; font-weight:900; margin:0 0 2px; }
${W} .hd-sheet .hd-rs-grid { display:grid; gap:8px; }
${W} .hd-sheet .troops .hd-rs-grid { grid-template-columns:repeat(5,minmax(0,1fr)); }
${W} .hd-sheet .skills .hd-rs-grid { grid-template-columns:repeat(3,minmax(0,1fr)); }
${W} .hd-sheet .hero .hd-rs-grid { grid-template-columns:minmax(0,1fr); }
${W} .hd-sheet .hd-btn.hd-rs-card { position:relative; min-height:44px; min-width:0; padding:4px; gap:2px; display:flex; flex-direction:column; align-items:center; justify-content:flex-start; font-size:12px; line-height:1.15; text-align:center; border-width:2px; }
${W} .hd-sheet .hd-btn.hd-rs-card.na { filter:none; opacity:1; background:rgba(150,100,40,.16); box-shadow:none; }
${W} .hd-sheet .hd-btn.hd-rs-card.ok { background:var(--hd-wood),linear-gradient(#ffe58a,#e0a824); }
${W} .hd-sheet .hd-rs-top { display:flex; align-items:center; justify-content:center; gap:4px; }
${W} .hd-sheet .hd-rs-top > .hd-img { height:30px !important; width:auto !important; flex:none; }
${W} .hd-sheet .hd-rs-tx { display:flex; flex-direction:column; align-items:center; gap:1px; min-width:0; width:100%; }
${W} .hd-sheet .hd-rs-nm { font-size:14px; font-weight:900; white-space:nowrap; }
${W} .hd-sheet .hd-rs-lv { flex:none; padding:0 4px; border-radius:6px; background:rgba(43,26,21,.78); color:#fff4dc; font-size:12px; font-weight:800; line-height:16px; }
${W} .hd-sheet .hd-rs-card .hd-cost { display:flex; flex-wrap:wrap; justify-content:center; gap:0 4px; font-size:12px; }
${W} .hd-sheet .hd-rs-card .hd-cost .hd-img { height:14px !important; width:auto !important; }
${W} .hd-sheet .hd-rs-card .hd-short { color:${red}; }
${W} .hd-sheet .hd-rs-why { font-size:12px; font-weight:800; color:#8a5a0c; }
${W} .hd-sheet .hd-rs-herocard { flex-direction:row; align-items:center; text-align:left; }
${W} .hd-sheet .hd-rs-herocard .hd-rs-top { flex-direction:column; }
${W} .hd-sheet .hd-rs-herocard .hd-rs-tx { align-items:flex-start; }
${W} .hd-sheet .hd-rs-herocard .hd-cost { justify-content:flex-start; }
${W} .hd-sheet .hd-rs-note { font-size:12px; font-weight:700; color:#6b4a2a; }

/* 分叉卡：放在 .hd-up-more 里，三张并排，每张只写名字、说明、克谁 */
${W} .hd-sheet .hd-up-more .hd-td-sub { margin:0 0 4px; }
${W} .hd-sheet .hd-up-more .hd-td-branches { grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; }
${W} .hd-sheet .hd-up-more .hd-td-branch { min-height:44px; padding:4px 8px; }
${W} .hd-sheet .hd-up-more .hd-td-note { margin:6px 0 0; }

/* 电脑：升级面板加宽成两栏，其余内容在下面；军械所再宽一档，左边升级、右边研究网格 */
@media (min-width:900px) and (min-height:560px) {
  ${W} .hd-base > .hd-sheet:has(.hd-up) { width:600px; }
  ${W} .hd-base > .hd-sheet:has(.hd-rs) { width:min(1040px,calc(100% - 24px)); }
  ${W} .hd-sbody:has(.hd-rs) { display:grid; grid-template-columns:440px minmax(0,1fr); gap:0 14px; align-items:start; }
  ${W} .hd-sbody:has(.hd-rs) > .hd-up { grid-column:1; grid-row:1; grid-template-columns:150px minmax(0,1fr); }
  ${W} .hd-sbody:has(.hd-rs) > .hd-up-foot { grid-column:1; grid-row:2; }
  ${W} .hd-sbody:has(.hd-rs) > .hd-up-more { grid-column:2; grid-row:1 / span 2; }
}
/* 手机横屏：右侧面板。有其余内容（解锁预告、分叉、研究）时面板铺满宽，升级两栏在左、其余内容在右，底下一行收取 / 移动 / 接着升 */
@media (orientation:landscape) and (max-height:500px) {
  ${W} .hd-base > .hd-sheet:has(.hd-up-more) { width:calc(100% - 12px - env(safe-area-inset-right,0px) - env(safe-area-inset-left,0px)); }
  ${W} .hd-sbody:has(> .hd-up-more) { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:0 10px; align-items:start; }
  ${W} .hd-sbody:has(.hd-rs) { grid-template-columns:330px minmax(0,1fr); }
  ${W} .hd-sbody:has(> .hd-up-more) > .hd-up { grid-column:1; grid-row:1; }
  ${W} .hd-sbody:has(> .hd-up-more) > .hd-up-more { grid-column:2; grid-row:1; }
  ${W} .hd-sbody:has(.hd-rs) { display:grid; grid-template-rows:minmax(0,1fr) auto; }
  ${W} .hd-sbody:has(.hd-rs) > .hd-up-more { align-self:stretch; }
  ${W} .hd-sbody:has(> .hd-up-more) > .hd-up-foot { grid-column:1; grid-row:2; }
  ${W} .hd-sbody:has(> .hd-up-more) > .hd-up-more { grid-row:1 / span 2; }
  ${W} .hd-sbody:has(.hd-rs) > .hd-up-foot { grid-column:1 / -1; }
  ${W} .hd-sbody:has(.hd-rs) > .hd-up-more { grid-row:1; }
  ${W} .hd-sheet .hd-up { grid-template-columns:120px minmax(0,1fr); gap:8px; margin:4px 0; }
  ${W} .hd-sbody:has(> .hd-up-more) > .hd-up { grid-template-columns:100px minmax(0,1fr); }
  ${W} .hd-sheet .hd-up-big { height:84px; }
  ${W} .hd-sheet .hd-up-big .hd-img { max-height:78px; }
  ${W} .hd-sheet .hd-uppic { width:46px; height:36px; }
  ${W} .hd-sheet .hd-uppic .hd-img { max-width:42px; max-height:32px; }
  ${W} .hd-sheet .hd-uparrow { font-size:16px; }
  ${W} .hd-sheet .hd-up-side { gap:4px; }
  ${W} .hd-sheet .hd-up-side > .hd-desc { font-size:12px; }
  ${W} .hd-sheet .hd-stats { padding:2px 8px; column-gap:6px; }
  ${W} .hd-sheet .hd-stat { font-size:12px; }
  ${W} .hd-sheet .hd-upbox { padding:4px 8px 6px; gap:4px; }
  ${W} .hd-sheet .hd-upcost { font-size:14px; gap:2px 8px; }
  ${W} .hd-sheet .hd-upcost-k { font-size:12px; }
  ${W} .hd-sheet .hd-btn.hd-upbtn { min-height:44px; font-size:16px; }
  ${W} .hd-sheet .hd-upbox:has(> .hd-upgo) { flex-direction:row; flex-wrap:wrap; }
  ${W} .hd-sheet .hd-upbox:has(> .hd-upgo) > .hd-upcost { flex:1 1 100%; }
  ${W} .hd-sheet .hd-upbox:has(> .hd-upgo) > .hd-btn { flex:1 1 0; width:auto; font-size:12px; padding:0 6px; }
  ${W} .hd-sheet .hd-up-more .hd-td-branches { grid-template-columns:minmax(0,1fr); gap:8px; }
  ${W} .hd-sheet .hd-up-more .hd-td-branch { flex-direction:row; flex-wrap:wrap; align-items:center; gap:0 8px; padding:2px 8px; }
  ${W} .hd-sheet .hd-unlock, ${W} .hd-sheet .hd-rank { margin-bottom:4px; padding:4px 8px; }
  ${W} .hd-sheet .hd-rank .hd-rank-head { margin:0 0 2px; }
  ${W} .hd-sheet .hd-rank .hd-rank-pic { width:36px; height:40px; }
  ${W} .hd-sheet .hd-rank .hd-rank-pic .hd-img { max-width:36px; max-height:40px; }
  ${W} .hd-sheet .hd-rank .hd-rank-row { margin:0 0 2px; }
  ${W} .hd-sheet .hd-rank .hd-rank-lack { margin:0 0 2px; }
  ${W} .hd-sheet .hd-rank .hd-btn.hd-rank-go { min-height:44px; font-size:16px; margin:2px 0 0; }
  ${W} .hd-sheet .hd-rank .hd-rank-note { margin:2px 0 0; }
  ${W} .hd-sheet .hd-rs-top > .hd-img { height:24px !important; }
  ${W} .hd-sheet .hd-btn.hd-rs-card { padding:2px 4px; gap:2px; }
}
/* 手机竖屏：两栏变上下；立绘缩成一排在上——能升级时只留"这一级 → 下一级"两张（这一级就是当前的样子），满级只留当前大图 */
@media (max-width:559px) and (orientation:portrait) {
  ${W} .hd-sheet .hd-up, ${W} .hd-sheet .hd-up.max { grid-template-columns:minmax(0,1fr); gap:6px; margin-bottom:6px; }
  ${W} .hd-sheet .hd-up-art { flex-direction:row; justify-content:center; }
  ${W} .hd-sheet .hd-up-art:has(.hd-uphero) .hd-up-big { display:none; }
  ${W} .hd-sheet .hd-up.max { grid-template-columns:96px minmax(0,1fr); align-items:center; }
  ${W} .hd-sheet .hd-up.max .hd-up-big { width:96px; }
  ${W} .hd-sheet .hd-up-big { width:120px; height:80px; }
  ${W} .hd-sheet .hd-up-big .hd-img { max-height:76px; }
  ${W} .hd-sheet .hd-uphero { gap:10px; }
  ${W} .hd-sheet .hd-uppic { width:84px; height:58px; }
  ${W} .hd-sheet .hd-uppic .hd-img { max-width:80px; max-height:54px; }
  ${W} .hd-sheet .hd-stats { padding:4px 8px; }
  ${W} .hd-sheet .hd-btn.hd-upbtn { min-height:48px; }
  ${W} .hd-sheet .hd-upbox:has(> .hd-upgo) { flex-direction:row; flex-wrap:wrap; }
  ${W} .hd-sheet .hd-upbox:has(> .hd-upgo) > .hd-upcost { flex:1 1 100%; }
  ${W} .hd-sheet .hd-upbox:has(> .hd-upgo) > .hd-btn { flex:1 1 0; width:auto; min-height:44px; padding:0 6px; }
  ${W} .hd-sheet .hd-up-more { margin-bottom:6px; }
  ${W} .hd-sheet .hd-up-more .hd-td-branches { grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; }
  ${W} .hd-sheet .hd-up-more .hd-td-branch { flex-direction:column; align-items:flex-start; padding:3px 6px; }
  ${W} .hd-sheet .hd-rs-top > .hd-img { height:24px !important; }
  ${W} .hd-sheet .hd-btn.hd-rs-card { padding:2px; gap:2px; }
  ${W} .hd-sheet .hd-rs-nm { font-size:12px; }
  ${W} .hd-sheet .hd-rs-herocard { flex-direction:column; text-align:center; }
  ${W} .hd-sheet .hd-rs-herocard .hd-rs-top { flex-direction:row; }
  ${W} .hd-sheet .hd-rs-herocard .hd-rs-tx { align-items:center; }
  ${W} .hd-sheet .hd-rs-herocard .hd-cost { justify-content:center; }
  ${W} .hd-sheet .hd-up-foot { flex-wrap:nowrap; }
  ${W} .hd-sheet .hd-up-foot .hd-nextup-k { font-size:12px; flex:none; }
  ${W} .hd-sheet .hd-up-foot .hd-upchip { flex:0 1 auto; min-width:0; padding:0 8px; font-size:12px; white-space:nowrap; }
  ${W} .hd-sheet .hd-up-acts .hd-btn { padding:0 8px; }
}
@media (max-width:559px) and (orientation:portrait) and (max-height:700px) {
  ${W} .hd-sheet .hd-up-side > .hd-desc { font-size:12px; }
  ${W} .hd-base > .hd-sheet .hd-head { padding-bottom:4px; margin-bottom:6px; }
  ${W} .hd-sheet .hd-uppic { width:72px; height:48px; }
  ${W} .hd-sheet .hd-uppic .hd-img { max-width:68px; max-height:44px; }
  ${W} .hd-sheet .hd-up-side { gap:4px; }
  ${W} .hd-sheet .hd-stats { padding:2px 8px; }
  ${W} .hd-sheet .hd-upbox { padding:4px 8px 6px; gap:4px; }
  ${W} .hd-sheet .hd-btn.hd-upbtn { min-height:44px; font-size:16px; }
  ${W} .hd-sheet .hd-unlock, ${W} .hd-sheet .hd-rank { margin-bottom:4px; padding:4px 8px; }
  ${W} .hd-sheet .hd-rank .hd-rank-head { margin:0 0 2px; }
  ${W} .hd-sheet .hd-rank .hd-rank-pic { width:36px; height:40px; }
  ${W} .hd-sheet .hd-rank .hd-rank-pic .hd-img { max-width:36px; max-height:40px; }
  ${W} .hd-sheet .hd-rank .hd-rank-row { margin:0 0 2px; }
  ${W} .hd-sheet .hd-rank .hd-rank-lack { margin:0 0 2px; }
  ${W} .hd-sheet .hd-rank .hd-btn.hd-rank-go { min-height:44px; font-size:16px; margin:2px 0 0; }
  ${W} .hd-sheet .hd-rank .hd-rank-note { margin:2px 0 0; }
}

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
/* 翻页条：长列表（建造、成就、收藏）按抽屉放得下的数量分页，页内上一页 / 下一页 */
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
${W} .hd-fleetgrid .hd-card > .hd-img { height:36px !important; width:auto !important; }
${W} .hd-boatname { font-weight:900; margin:0 0 6px; }

/* 侦察图是可拖动缩放的视窗，内容按需缩放，不是溢出；用 clip 明示裁在视窗里 */
${W} .hd-scout-map { overflow:clip !important; }

/* 手机横屏：靠右站满高度的面板（layout.ts）加宽到 600，内容紧凑；建造页的推荐布局钮、"能升级"、卡片同排 */
@media (orientation:landscape) and (max-height:500px) {
  ${W} .hd-base > .hd-sheet { width:min(660px,78%); padding:4px 10px 4px; }
  ${W} .hd-base > .hd-sheet .hd-head { margin-bottom:0; }
  ${W} .hd-base > .hd-sheet .hd-desc { margin:0 0 2px; }
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
  /* 船队卡横屏改成「兵图在左、名字和木材在右」：两排卡各省一截高度，主寨 7 级兵种多也一屏放下 */
  ${W} .hd-base > .hd-sheet .hd-fleetgrid .hd-card { padding:3px 4px; display:grid; grid-template-columns:auto minmax(0,1fr); column-gap:4px; align-items:center; justify-items:start; }
  ${W} .hd-base > .hd-sheet .hd-fleetgrid .hd-card > .hd-img { height:26px !important; grid-row:1 / span 3; }
  ${W} .hd-base > .hd-sheet .hd-fleetgrid .hd-card > span { text-align:left; }
  ${W} .hd-fleetgrid .hd-card > span { line-height:1.15; }
  ${W} .hd-sbody > .hd-chips:last-child { margin:2px 0 0; }
  ${W} .hd-boattabs { margin-bottom:8px; }
  ${W} .hd-boatname { display:none; }
  ${W} .hd-base > .hd-sheet .hd-ach { margin-bottom:4px; padding:3px 8px; }
  ${W} .hd-sbody > .hd-chips { margin:8px 0; }
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
  ${W} .hd-fleetgrid .hd-card > .hd-img { height:30px !important; }
  ${W} .hd-base > .hd-sheet .hd-unlock { padding:6px 8px; margin-bottom:6px; }
  ${W} .hd-base > .hd-sheet .hd-items { margin:4px 0; }
  ${W} .hd-base > .hd-sheet .hd-chips { margin-bottom:8px; }
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
