/**
 * 护航界面的样式：顶栏商船血条、底部速度三联钮 / 修船 / 跟随、预告里的相遇点、"回到船"钮、结算大数字、选图页。
 * 全部限定在 .hd-ui 下，类名 hd-esc- 前缀；可点的东西 min-width / min-height 都 ≥ 44（tests/escort-ui.test.ts 锁住）。
 * 字号只用 12/14/16/20（大数字另算）。进护航时注入一次。
 */
const INK = '#2b1a15';
const CREAM = '#fff3d0';
const U = '.hd-ui';
const LAND = '(orientation:landscape) and (max-height:500px)';

export const ESCORT_CSS = `
/* ---------- 顶栏：商船血条 ---------- */
${U} .hd-esc-hullw { position:relative; flex:1 1 140px; width:140px; min-width:110px; height:32px; }
${U} .hd-esc-hull { position:absolute; inset:0; border:3px solid ${INK}; border-radius:16px; background:rgba(20,35,58,.72); overflow:hidden; box-shadow:0 2px 0 ${INK}; }
${U} .hd-esc-hull .fill { position:absolute; inset:0; transform-origin:left center; transform:scaleX(var(--p,1)); background:linear-gradient(#a6ec8c,#46b23f); transition:transform .25s ease-out; }
${U} .hd-esc-hull.mid .fill { background:linear-gradient(#ffe58a,#e0a824); }
${U} .hd-esc-hull.low .fill { background:linear-gradient(#ff9a86,#d8463a); }
${U} .hd-esc-hull .txt { position:absolute; left:8px; top:0; bottom:0; display:flex; align-items:center; gap:4px; font-size:14px; font-weight:900; color:#fff; text-shadow:0 1px 2px rgba(0,0,0,.7); white-space:nowrap; }
${U} .hd-esc-hull .mk { position:absolute; top:0; bottom:0; left:var(--at); width:2px; background:#ffe885; box-shadow:0 0 0 1px rgba(43,26,21,.5); }
${U} .hd-esc-hull .mk b { position:absolute; left:4px; bottom:1px; font-size:12px; font-weight:900; color:#ffe885; text-shadow:0 1px 2px rgba(0,0,0,.8); white-space:nowrap; }
${U} .hd-esc-hull .mk.hi b { left:auto; right:4px; }
${U} .hd-esc-hullw.bite { animation:hd-esc-shake .3s; }
${U} .hd-esc-loss { position:absolute; left:50%; top:100%; z-index:5; font-size:16px; font-weight:900; color:#ff6b5a; text-shadow:0 0 3px #fff,0 1px 0 ${INK}; pointer-events:none; animation:hd-esc-float .9s ease-out forwards; }

/* ---------- 底部：速度三联钮、修船、跟随 ---------- */
${U} .hd-esc-ctl { position:absolute; left:0; right:0; bottom:92px; z-index:37; display:flex; justify-content:center; align-items:flex-end; gap:10px; padding:0 8px; pointer-events:none !important; }
${U} .hd-esc-ctl > * { pointer-events:auto; }
${U} .hd-esc-right { display:contents; }
${U} .hd-esc-pace { display:flex; gap:8px; align-items:flex-end; }
${U} .hd-esc-ctl .hd-esc-pbtn { position:relative; min-width:56px; min-height:56px; padding:2px 4px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:0; font-size:14px; font-weight:900; line-height:1.1;
  border:3px solid ${INK}; border-radius:12px; background:linear-gradient(#c98f55,#8a5a30); color:#fff3dc; box-shadow:0 3px 0 ${INK}; transition:transform .16s cubic-bezier(.3,1.8,.5,1), box-shadow .16s; }
/* 三种样子分得开：选中的金色抬起、能点的暖木色、点不了的（修船：钱不够或船是满的）灰而淡。以前没选中的船速和点不了的修船同是灰底 */
${U} .hd-esc-ctl .hd-esc-pbtn svg { width:28px; height:28px; display:block; }
${U} .hd-esc-ctl .hd-esc-pbtn.on { background:linear-gradient(#ffe58a,#e0a824); color:${INK}; opacity:1; filter:none; transform:translateY(-6px); box-shadow:0 0 0 3px #fff3b0, 0 0 16px 4px rgba(255,214,90,.85), 0 3px 0 ${INK}; }
${U} .hd-esc-ctl .hd-esc-pbtn:active { transform:translateY(-2px); }
${U} .hd-esc-ctl .hd-esc-pbtn .hd-key { left:3px; top:1px; right:auto; }
/* 准备倒数最后 10 秒还停着：「巡航」钮（竖屏是船速小钮）金圈一明一暗，提醒点它出发（escortview 的 sailNudge） */
${U} .hd-esc-ctl .hd-esc-pbtn.nudge, ${U} .hd-esc-sum.nudge { animation:hd-esc-nudge 1s ease-in-out infinite; }
${U} :is(.hd-esc-ctl, .hd-esc-quick) .hd-esc-mend { position:relative; min-width:64px; min-height:56px; padding:2px 8px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:0; overflow:hidden; font-size:14px; font-weight:900; line-height:1.1; white-space:nowrap; }
${U} :is(.hd-esc-ctl, .hd-esc-quick) .hd-esc-mend svg { width:24px; height:24px; display:block; position:relative; }
${U} :is(.hd-esc-ctl, .hd-esc-quick) .hd-esc-mend small { position:relative; font-size:12px; font-weight:800; }
${U} :is(.hd-esc-ctl, .hd-esc-quick) .hd-esc-mend b { position:relative; font-size:14px; }
${U} :is(.hd-esc-ctl, .hd-esc-quick) .hd-esc-mend .cd { position:absolute; inset:0; background:conic-gradient(rgba(20,35,58,.62) var(--cd,0deg), transparent 0); pointer-events:none; }
${U} :is(.hd-esc-ctl, .hd-esc-quick) .hd-esc-mend.poor, ${U} :is(.hd-esc-ctl, .hd-esc-quick) .hd-esc-mend.full { background:linear-gradient(#8f8a84,#5f5a55); color:#e6e1da; filter:grayscale(1); opacity:.6; }
${U} :is(.hd-esc-ctl, .hd-esc-quick) .hd-esc-follow { min-width:56px; min-height:56px; padding:2px 6px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px; font-size:14px; font-weight:900; line-height:1.1; }
${U} :is(.hd-esc-ctl, .hd-esc-quick) .hd-esc-follow i { width:20px; height:12px; border:2px solid ${INK}; border-radius:7px; background:#8a7f72; position:relative; }
${U} :is(.hd-esc-ctl, .hd-esc-quick) .hd-esc-follow i::after { content:''; position:absolute; left:1px; top:1px; width:6px; height:6px; border-radius:50%; background:#fff; transition:transform .15s; }
${U} :is(.hd-esc-ctl, .hd-esc-quick) .hd-esc-follow.on i { background:#46b23f; }
${U} :is(.hd-esc-ctl, .hd-esc-quick) .hd-esc-follow.on i::after { transform:translateX(8px); }
${U} .hd-esc .hd-hint { bottom:164px; }
${U} .hd-esc .hd-td-sheet { z-index:36; }

/* 手机竖屏：造塔面板开着时游戏暂停，操作排被抬到面板上沿会压住顶栏的速度钮，整排收起 */
@media (orientation:portrait) and (max-width:559px), (orientation:portrait) and (max-height:700px) {
  ${U} .hd-esc:has(.hd-td-sheet) .hd-esc-ctl { display:none; }
}
/* 手机竖屏（360×640、390×844 同）：速度排收成底栏同一行里的小钮（显示当前船速，点一下换档），长按小钮或点血条展开速度排（三档、修船、跟随），血条同时是展开的入口所以拉到 44 高。
   844 高也收：摆开的速度排 56 高再叠在底栏上，顶底栏合计会到 25% 以上（质量线 22%） */
${U} .hd-esc-sum, ${U} .hd-esc-ctl .hd-esc-speed, ${U} .hd-esc-quick { display:none; }
@media (max-width:559px) and (orientation:portrait) {
  ${U} .hd-esc-sum { display:flex; flex:none; flex-direction:column; align-items:center; justify-content:center; gap:0; min-width:44px; min-height:48px; padding:0 2px; font-size:12px; font-weight:900; line-height:1.05; }
  ${U} .hd-esc-sum svg { width:20px; height:20px; display:block; }
  ${U} .hd-esc-hullw { flex:1 1 100px; min-width:100px; height:44px; pointer-events:auto; cursor:pointer; }
  ${U} .hd-esc-ctl { display:none; }
  ${U} .hd-esc-ctl.open { display:flex; }
  ${U} .hd-esc-ctl .hd-esc-speed { display:flex; min-width:56px; min-height:56px; padding:2px 6px; align-items:center; justify-content:center; font-size:16px; font-weight:900; }
  /* 修船、跟随常驻：竖在右下角船速小钮上面（小钮在底栏上沿 +8、48 高，layout.ts 的 .hd-esc-sum；escortview 的 PORTRAIT_PHONE 把两颗钮搬进来）；
     造塔面板开着、速度排展开时收起 */
  ${U} .hd-esc-quick { display:flex; flex-direction:column; gap:8px; position:absolute; right:6px; bottom:calc(116px + env(safe-area-inset-bottom,0px)); z-index:37; }
  ${U} .hd-esc:has(.hd-td-sheet) .hd-esc-quick, ${U} .hd-esc:has(.hd-esc-ctl.open) .hd-esc-quick { display:none; }
  ${U} .hd-esc-quick .hd-esc-mend { min-width:56px; padding:2px 4px; }
  ${U} .hd-esc-quick .hd-esc-mend small { display:none; }
}
/* ---------- 竖屏镜头的"回到船"钮 ---------- */
${U} .hd-esc-back { position:absolute; top:224px; right:6px; z-index:30; display:none; min-width:56px; min-height:56px; padding:0 4px; flex-direction:column; align-items:center; justify-content:center; font-size:12px; font-weight:900; line-height:1.05; }
${U} .hd-esc-back.on { display:inline-flex; }
${U} .hd-esc-back svg { width:24px; height:24px; }

/* ---------- 预告卡里的相遇点 ---------- */
${U} .hd-esc-meet { display:flex; align-items:center; gap:6px; margin-top:2px; font-size:12px; font-weight:800; }
${U} .hd-esc-meet i { flex:none; width:12px; height:12px; border-radius:50%; background:#e0402f; border:2px solid #fff; box-shadow:0 0 0 1px ${INK}; }
${U} .hd-esc-meet.miss i { background:#9a9a9a; }

/* ---------- 结算 ---------- */
${U} .hd-esc-result .hd-esc-big { margin:2px 0; font-size:44px; font-weight:900; line-height:1.1; color:#2e8a35; text-shadow:0 2px 0 #fff; }
${U} .hd-esc-result.hd-lose .hd-esc-big { color:#b8322a; }
${U} .hd-esc-result .hd-esc-bigsub { margin:0 0 4px; font-size:14px; font-weight:800; opacity:.8; }

/* ---------- 海图上的入口卡、选图页 ---------- */
${U} .hd-esc-sel .hd-esc-sub { margin:0 auto 8px; width:min(100%,560px); font-size:14px; color:#fff; text-shadow:0 1px 2px rgba(0,40,70,.8); }
${U} .hd-esc-maps { width:min(100%,560px); margin:0 auto; display:flex; flex-direction:column; gap:8px; }
${U} .hd-esc-map { display:flex; align-items:center; gap:10px; min-height:64px; padding:8px 12px; border:3px solid ${INK}; border-radius:14px; background:${CREAM}; color:${INK}; font:inherit; text-align:left; cursor:pointer; box-shadow:0 3px 0 ${INK}; }
${U} .hd-esc-map.on { background:linear-gradient(#ffe58a,#e0a824); transform:translateY(-2px); }
${U} .hd-esc-map.lock { opacity:.6; filter:grayscale(.5); }
${U} .hd-esc-map .t { display:flex; flex-direction:column; min-width:0; line-height:1.25; }
${U} .hd-esc-map b { font-size:16px; font-weight:900; }
${U} .hd-esc-map small { font-size:12px; font-weight:700; }
${U} .hd-esc-diffs { width:min(100%,560px); margin:12px auto 0; display:grid; grid-template-columns:repeat(3,1fr); gap:8px; }
${U} .hd-esc-diff { min-height:64px; padding:4px 4px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px; border:3px solid ${INK}; border-radius:12px; background:${CREAM}; color:${INK}; font:inherit; cursor:pointer; box-shadow:0 3px 0 ${INK}; }
${U} .hd-esc-diff.on { background:linear-gradient(#ffe58a,#e0a824); transform:translateY(-3px); box-shadow:0 5px 0 ${INK}, 0 0 0 3px #fff3b0; }
${U} .hd-esc-diff:disabled { opacity:.5; filter:grayscale(.7); cursor:default; }
${U} .hd-esc-diff b { font-size:16px; font-weight:900; }
${U} .hd-esc-diff small { font-size:12px; font-weight:800; }
${U} .hd-esc-info { width:min(100%,560px); margin:10px auto 0; padding:8px 12px; border:3px solid ${INK}; border-radius:12px; background:${CREAM}; color:${INK}; font-size:14px; font-weight:700; line-height:1.4; }
${U} .hd-esc-go { display:block; width:min(100%,560px); min-height:56px; margin:12px auto 0; font-size:20px; }
/* 「出发」和「实盘」同一行：出发占满剩下的宽度（实盘用固定的关，不跟这里选的图和难度走） */
${U} .hd-esc-gorow { display:flex; gap:8px; width:min(100%,560px); margin:12px auto 0; }
${U} .hd-esc-gorow .hd-esc-go { flex:1 1 0; min-width:0; width:auto; margin:0; }
${U} .hd-esc-gorow .hd-esc-live { flex:none; min-width:84px; min-height:56px; font-size:16px; }
/* 航线小地图：电脑上摆右栏，竖拿的平板摆在出发钮下面；手机竖屏、横屏都放不下，不摆 */
${U} .hd-esc-view { display:none; padding:10px; border:3px solid ${INK}; border-radius:14px; background:linear-gradient(#5fb8d6,#3d93b8); box-shadow:0 3px 0 ${INK}; }
${U} .hd-esc-view .hd-esc-isle { flex:1 1 0; min-height:0; justify-content:center; gap:6px; }
${U} .hd-esc-view .hd-esc-isle svg { flex:1 1 0; min-height:0; height:100%; }
@media (min-width:701px) and (max-width:959px) and (min-height:1000px) {
  ${U} .hd-esc-sel .hd-esc-view { display:flex; width:min(100%,560px); height:360px; margin:12px auto 0; }
}
@media (min-width:960px) and (min-height:600px) {
  ${U} .hd-esc-sel { display:grid; grid-template-columns:minmax(0,520px) minmax(0,560px); justify-content:center; align-content:center; gap:10px 24px; }
  ${U} .hd-esc-sel > .hd-tdsel-head, ${U} .hd-esc-sel > .hd-esc-sub { grid-column:1 / -1; }
  ${U} .hd-esc-sel > .hd-esc-sub { margin:0 auto; text-align:center; }
  ${U} .hd-esc-sel .hd-esc-maps, ${U} .hd-esc-sel .hd-esc-diffs, ${U} .hd-esc-sel .hd-esc-info, ${U} .hd-esc-sel .hd-esc-gorow { grid-column:1; width:100%; margin:0; }
  ${U} .hd-esc-sel .hd-esc-view { display:flex; grid-column:2; grid-row:3 / span 4; min-height:0; }
}

/* ---------- 手机横屏：操作区在右边一列，速度钮、修船、跟随排在左下角；造塔面板开着时（游戏暂停）整排收起 ---------- */
@media ${LAND} {
  ${U} .hd-esc-ctl { bottom:8px; justify-content:flex-start; gap:8px; padding:0 6px; right:auto; }
  ${U} .hd-esc-ctl .hd-esc-pbtn { min-width:52px; min-height:52px; }
  ${U} .hd-esc-ctl .hd-esc-pbtn svg { width:24px; height:24px; }
  ${U} .hd-esc-ctl .hd-esc-mend { min-height:52px; }
  ${U} .hd-esc-ctl .hd-esc-follow { min-width:52px; min-height:52px; }
  ${U} .hd-esc .hd-hint { bottom:92px; }
  ${U} .hd-esc .hd-td-sheet { width:min(60%,520px); }
  /* 顶栏两段各自按内容定宽、互不知道对方：左段（波数 + 船血条）右端约 350，右段（金币到撤退）贴着 right:112 往左长，
     844 宽时左缘约 337，血条和金币牌叠一截。血条收窄、右段挪到设置钮旁边（这里没有手感钮占 58–112） */
  ${U} .hd-esc-hullw { flex:0 1 112px; width:112px; min-width:64px; }
  ${U}.hd-skin .hd-td.hd-esc .hd-td-bar2 { right:calc(58px + env(safe-area-inset-right,0px)); }
  ${U} .hd-esc-back { top:126px; }
}
/* 选图页手机横屏：左边三张图，右边难度、说明、出发，一屏放下不滚 */
@media ${LAND} {
  ${U} .hd-esc-sel { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:4px 12px; align-content:start; padding:6px 12px 8px; }
  ${U} .hd-esc-sel > .hd-tdsel-head, ${U} .hd-esc-sel > .hd-esc-sub { grid-column:1 / -1; margin:0; width:auto; }
  ${U} .hd-esc-sel > .hd-esc-sub { text-align:center; }
  ${U} .hd-esc-sel > .hd-tdsel-head { width:min(100%,520px); margin:0 auto; }
  ${U} .hd-esc-sel .hd-esc-maps { grid-column:1; grid-row:3 / span 3; width:100%; margin:0; gap:8px; }
  ${U} .hd-esc-sel .hd-esc-diffs { grid-column:2; grid-row:3; width:100%; margin:0; }
  ${U} .hd-esc-sel .hd-esc-info { grid-column:2; grid-row:4; width:100%; margin:0; padding:6px 10px; font-size:12px; }
  ${U} .hd-esc-sel .hd-esc-gorow { grid-column:2; grid-row:5; width:100%; margin:0; align-self:start; }
  ${U} .hd-esc-sel .hd-esc-gorow .hd-esc-go, ${U} .hd-esc-sel .hd-esc-gorow .hd-esc-live { min-height:48px; }
}
@media (min-width:700px) and (min-height:501px) {
  ${U} .hd-esc-ctl .hd-esc-pbtn { min-width:64px; min-height:64px; }
}
@keyframes hd-esc-shake { 0%,100% { transform:none; } 20% { transform:translateX(-4px); } 45% { transform:translateX(4px); } 70% { transform:translateX(-2px); } }
@keyframes hd-esc-nudge { 0%,100% { box-shadow:0 0 0 3px #fff3b0, 0 0 6px 2px rgba(255,214,90,.5), 0 3px 0 ${INK}; } 50% { box-shadow:0 0 0 4px #ffe14d, 0 0 20px 8px rgba(255,214,90,.95), 0 3px 0 ${INK}; } }
@keyframes hd-esc-float { 0% { transform:translate(-50%,0); opacity:1; } 100% { transform:translate(-50%,22px); opacity:0; } }
@media (prefers-reduced-motion:reduce) {
  ${U} .hd-esc-hullw.bite, ${U} .hd-esc-loss { animation:none; }
  ${U} .hd-esc-ctl .hd-esc-pbtn.nudge, ${U} .hd-esc-sum.nudge { animation:none; box-shadow:0 0 0 4px #ffe14d, 0 0 16px 6px rgba(255,214,90,.9), 0 3px 0 ${INK}; }
  ${U} .hd-esc-loss { opacity:.95; }
  ${U} .hd-esc-hull .fill, ${U} .hd-esc-ctl .hd-esc-pbtn, ${U} .hd-esc-follow i::after { transition:none; }
}
`;

let done = false;
/** 进护航时注入一次 */
export function injectEscortCss(): void {
  if (done || typeof document === 'undefined') return;
  done = true;
  const st = document.createElement('style');
  st.textContent = ESCORT_CSS;
  document.head.appendChild(st);
}
