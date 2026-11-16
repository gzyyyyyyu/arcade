import { PALETTE as P } from './art/index.ts';

/**
 * 三种屏幕的排布（手机竖屏 / 手机横屏 / 电脑和平板）和几个新件的样式：红点、操作环、回到全景钮。
 * 写成 `.hd-ui.hd-skin …`（比各界面自己的 `.hd-ui .hd-xxx` 多一级）并排在皮肤之后注入，所以不管注入先后都盖得过。
 * 镜头适配读的是这里排出来的真实位置（camfit.ts 的 measureInsets），改排布不用改数字。
 *
 * - 竖屏（默认）：顶上两行（第一行 大厅 + 主要数字 + 静音，第二行 次要信息和按钮），底部是操作区。
 * - 宽屏（≥ 560 宽，含手机横屏和电脑）：两行并成一行，高度 56；
 * - 手机横屏（宽 > 高且高 ≤ 500）：底部的操作区挪到右侧竖着排，把高度让给岛。
 * 横屏判断和 camfit.ts 的 isLandscapePhone 一致。
 */
export function layoutCss(): string {
  const c = P as Record<string, string>;
  const ink = c.ink!;
  const W = '.hd-ui.hd-skin';
  const LAND = '@media (orientation:landscape) and (max-height:500px)';
  return `
/* ---------- 排布（layout.ts） ---------- */
/* 红点：建造上有两个（能升级红、能领取金），出海上一个（被打了红）；操作环的钮上常亮 */
${W} .hd-bottom .hd-btn { position:relative; }
${W} .hd-dot { position:absolute; top:-7px; right:-7px; width:20px; height:20px; border-radius:50%; background:#e0402f; border:3px solid ${ink}; box-shadow:0 1px 0 rgba(0,0,0,.4); pointer-events:none; display:none; z-index:2; }
${W} .hd-dot.collect { right:auto; left:-7px; background:#f8c630; }
${W} .hd-dot.on, ${W} .hd-ringbtn .hd-dot { display:block; animation:hd-dotpulse 1.4s ease-in-out infinite; }
${W} .hd-ringbtn .hd-dot { top:-4px; right:-4px; width:16px; height:16px; border-width:2px; background:#e0402f; }
${W} .hd-ringbtn[data-ring=collect] .hd-dot { background:#f8c630; }
@keyframes hd-dotpulse { 50% { transform:scale(1.2); } }

/* 操作环：点建筑弹出，圆钮围着建筑，位置每帧由脚本写 left / top */
${W} .hd-rmenu { position:absolute; inset:0; z-index:25; pointer-events:none !important; }
${W} .hd-ringbtn { position:absolute; width:48px; height:48px; min-width:48px; min-height:48px; opacity:.84; padding:0; border-radius:50%; flex-direction:column; gap:0; font-size:12px; line-height:1.05; pointer-events:auto; animation:hd-ringin .2s cubic-bezier(.3,1.6,.5,1) both; }
${W} .hd-ringbtn svg { flex:none; }
${W} .hd-ringbtn span { font-size:12px; font-weight:900; }
${W} .hd-ringbtn:hover, ${W} .hd-ringbtn:active { opacity:1; }
${W} .hd-ringbtn.off { filter:saturate(.3) brightness(.85); }
@keyframes hd-ringin { 0% { transform:scale(.3); opacity:0; } 100% { transform:none; } }

/* 回到全景：放大或平移后才出现 */
${W} .hd-fitbtn { display:none; position:absolute; top:160px; right:6px; z-index:30; width:56px; min-height:56px; padding:0; flex-direction:column; gap:0; font-size:12px; line-height:1.05; }
${W} .hd-fitbtn.on { display:inline-flex; }
/* 开着建筑面板时收起"全景"：电脑上它正好压在右侧面板的关闭钮上，而且开面板时镜头由面板管（挪过去、关了再回来） */
${W} .hd-base:has(> .hd-sheet) .hd-fitbtn.on { display:none; }
/* 守岛 / 护航的造塔面板开着时整局暂停，「全景」会压住面板右上角的 ×，一起让开 */
${W} .hd-td:has(.hd-td-sheet) .hd-fitbtn.on { display:none; }
${W} .hd-fitbtn span { font-size:12px; font-weight:900; }

/* 个人面板钮：顶栏第二行最右 */
${W} .hd-profile { margin-left:auto; width:48px; padding:0; }
${W} .hd-base .hd-bar2 { pointer-events:none !important; }
${W} .hd-upchip { font-size:14px; padding:0 10px; }

/* 刘海和圆角：.hd-screen 上、左、右缩进安全区（不支持就是 0）；底栏自己加下边距；静音和震屏钮在界面根上，单独加 */
${W} .hd-screen { inset:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) 0 env(safe-area-inset-left,0px); }
${W} .hd-bottom, ${W} .hd-td-bottom { padding-bottom:calc(8px + env(safe-area-inset-bottom,0px)); }
${W} .hd-cards { padding-bottom:calc(8px + env(safe-area-inset-bottom,0px)); }
${W} .hd-mute { top:calc(4px + env(safe-area-inset-top,0px)); right:calc(6px + env(safe-area-inset-right,0px)); }
${W} .hd-feel { top:calc(110px + env(safe-area-inset-top,0px)); right:calc(6px + env(safe-area-inset-right,0px)); }
/* 守岛选关页的"回岛"让开右上角的声音钮（宽屏时再让开震动钮），别叠在一起 */
${W} .hd-tdsel-close { top:calc(4px + env(safe-area-inset-top,0px)); right:calc(58px + env(safe-area-inset-right,0px)); }

/* 360 宽：「回岛」收窄内边距，别压住居中的「悬赏守岛（实盘）」 */
@media (max-width:399px) and (orientation:portrait) {
  ${W} .hd-tdsel-close { min-width:0; padding-left:10px; padding-right:10px; }
}

${W} .hd-bar, ${W} .hd-bar2, ${W} .hd-td-bar, ${W} .hd-td-bar2, ${W} .hd-boats, ${W} .hd-skills { gap:8px; }

/* 电脑：悬停态（有鼠标才有）；按下态沿用皮肤的 :active。数字键的小角标只在有鼠标时显示 */
${W} .hd-key { display:none; }
@media (hover:hover) and (pointer:fine) {
  ${W} .hd-btn:hover:not(:disabled):not(.done):not(.off), ${W} .hd-card:hover:not(.off), ${W} .hd-boat:hover:not(.done), ${W} .hd-td-tower:hover:not(:disabled), ${W} .hd-td-branch:hover:not(:disabled), ${W} .hd-tdtab:hover, ${W} .hd-tdcard:hover, ${W} .hd-node:hover { filter:brightness(1.12) saturate(1.08); cursor:pointer; }
  ${W} .hd-node:active { transform:translate(-50%,-50%) translateY(2px); }
  ${W} .hd-tdcard:active { transform:translateY(2px); }
  ${W} .hd-key { display:block; position:absolute; left:4px; top:3px; min-width:16px; height:16px; padding:0 3px; border-radius:5px; background:rgba(43,26,21,.78); color:#fff4dc; font:800 12px/16px system-ui,sans-serif; text-align:center; pointer-events:none; }
}

/* 手机竖屏：顶栏 + 底栏合计控制在屏高的 22% 以内。基地和守岛第二行上移；战斗把星数并进第一行、加速和撤退挪到底部技能行的右边（拇指够得着，撤退有确认） */
@media (max-width:559px) and (orientation:portrait) {
  ${W} .hd-td-skill { width:60px; min-height:60px; }
  ${W} .hd-td-call { min-height:60px; }
  ${W} .hd-battle .hd-bar { left:88px; right:52px; max-width:none; flex-wrap:nowrap; gap:4px; }
  /* 窄于 380（360、375）：侦察期计时牌带「侦察中」，三块牌子要约 235 宽，左边让给「大厅」后 360 宽只剩 220，字溢出、星星出框。
     「大厅」只留小房子图标（docs/ui.md 第 1 节允许窄屏只留图标，点区仍是 44×44），顶栏左边从 88 让到 54；390 宽放得下，不动 */
  @media (max-width:379px) {
    ${W} .hd-battle .hd-hall { width:44px; min-width:44px; padding:0; justify-content:center; }
    ${W} .hd-battle .hd-hall span { display:none; }
    ${W} .hd-battle .hd-bar { left:54px; }
  }
  ${W} .hd-battle .hd-bar .hd-pill { flex:0 1 auto; min-width:0; padding:0 8px 0 6px; gap:4px; }
  ${W} .hd-battle .hd-bar .hd-pill b { font-size:14px; }
  ${W} .hd-battle .hd-bar .hd-stars .hd-img { height:18px !important; width:18px !important; }
  /* 登陆战竖屏底部两行，合计 96：上一行 = 能量 + 技能（48×44：图标在上、能量在下；名字藏起来，选中时提示条、能量不够时的提示都会说出技能名）
     + 右端的加速 / 撤退，下一行 = 兵种卡（44 高，宽跟着「图标 + 名字 ×数量」走、至少 76，免得数量压到隔壁卡）占满整宽（出兵是主操作，在拇指区；放不下的横向滑，右缘渐隐提示）。
     相邻点按目标一律隔 8（docs/ui.md）：两行之间 8、卡与卡 8、第三个技能和加速钮 8；选中的兵种卡竖屏不上浮（上浮会吃掉两行之间的 8），
     靠金底和外圈金光认。兵种行高度写死（52 = 上边距 8 + 卡 44），加速 / 撤退按它算贴在上一行的右端；
     360×640 上顶栏贴顶（下面 max-height:700px 那段），上下 HUD 合计 44 + 96 = 140，≤ 22% 屏高 */
  ${W} .hd-battle .hd-bar2 { top:auto; bottom:calc(52px + env(safe-area-inset-bottom,0px)); left:auto; right:6px; z-index:31; gap:8px; }
  ${W} .hd-battle .hd-bar2 .hd-btn { min-width:44px; min-height:44px; height:44px; padding:0 8px; }
  ${W} .hd-cards .hd-boat.sel { transform:none; }
  ${W} .hd-cards { flex-direction:column; align-items:stretch; gap:0; left:0; right:0; padding:0 0 env(safe-area-inset-bottom,0px); }
  ${W} .hd-cards .hd-skills { flex:none; justify-content:flex-start; align-items:center; gap:8px; padding:0 114px 0 6px; overflow:visible; }
  ${W} .hd-cards .hd-boats { flex:none; box-sizing:border-box; height:52px; min-width:0; gap:8px; padding:8px 6px 0; justify-content:flex-start; }
  ${W} .hd-cards .hd-boats > :first-child { margin-left:auto; }
  ${W} .hd-cards .hd-boats > :last-child { margin-right:auto; }
  ${W} .hd-cards .hd-boats.hd-more { -webkit-mask-image:linear-gradient(90deg,#000 calc(100% - 24px),transparent); mask-image:linear-gradient(90deg,#000 calc(100% - 24px),transparent); }
  ${W} .hd-cards .hd-boat, ${W} .hd-cards .hd-boats.hd-tight .hd-boat { flex:0 0 auto; min-width:76px; max-width:none; min-height:44px; height:44px; flex-direction:row; gap:2px; padding:0 6px; white-space:nowrap; }
  ${W} .hd-cards .hd-en { padding:2px 6px; min-height:36px; }
  ${W} .hd-cards .hd-skill { flex:none; width:48px; min-width:48px; height:44px; min-height:44px; flex-direction:column; gap:0; padding:0 2px; }
  ${W} .hd-cards .hd-skill small { font-size:14px; line-height:1; }
  ${W} .hd-cards .hd-skill.off { padding-bottom:8px; }
  /* 48×44 里放得下图标、能量数、进度条和锁，但不能互相压：能量不够时图标缩到 18，锁缩到 12 挪到右上角，进度条贴底边、高 4 */
  ${W} .hd-cards .hd-skill.off .hd-img { height:18px !important; width:18px !important; }
  ${W} .hd-cards .hd-skill.off::before { left:6px; right:6px; bottom:2px; height:4px; border-width:1px; }
  ${W} .hd-cards .hd-skill.off::after { left:auto; right:0; top:0; width:12px; height:12px; }
  ${W} .hd-cards .hd-skill .hd-img { height:20px !important; width:20px !important; }
  ${W} .hd-cards .hd-skill .hd-sk-n { display:none; }
  ${W} .hd-cards .hd-boat small { display:none; }
  ${W} .hd-cards .hd-boat .hd-img { height:26px !important; width:auto !important; }
  /* 出完的兵种卡只有 44 高，原来 20 的锁压在左上角正好盖住小兵；照技能钮缩到 12、挪到右上角 */
  ${W} .hd-cards .hd-boat.done::after { left:auto; right:0; top:0; width:12px; height:12px; }
  ${W} .hd-cards .hd-hint { position:absolute; left:50%; bottom:calc(100% + 4px); transform:translateX(-50%); white-space:nowrap; }
}

/* 手机竖屏的守岛 / 护航（360×640 和 390×844 都走这一套）：顶栏 + 底栏合计 ≤ 22% 屏高（640 高只有 140，844 高 185），口径是 noscroll 的「岛被上下 HUD 吃掉的高度」。
   第二行不再单独占一行：基地的个人面板、换筹码钮和守岛的金币、加速、撤退并进底栏同一行（右端），主寨等级牌和守岛的数量牌收起
   （主寨等级在个人面板里看）；底栏钮压到 52 / 48 高、内边距 4。顶上只剩第一行。点按目标 ≥ 44、间距 ≥ 8 */
@media (max-width:559px) and (orientation:portrait) {
  ${W} .hd-td .hd-td-bar2 { top:auto; left:auto; right:6px; z-index:31; align-items:center; gap:8px; }
  /* 资源牌的上限在所有手机竖屏都写成「/ 25,200」（去掉「上限」两个字）：390 宽上「上限 25,200」比牌子宽 3 像素、穿出右边框，
     金额不截断（仓库约定），放不下就换短说法 */
  ${W} .hd-base .hd-bar .hd-pill .hd-capk { display:none; }
  ${W} .hd-base .hd-bar .hd-pill small::before { content:'/ '; }
  /* 基地只在矮竖屏收（390×844 的基地顶底栏本来就只占 13%） */
  @media (max-height:700px) {
  ${W} .hd-battle .hd-hall, ${W} .hd-battle .hd-bar { top:0; }
  ${W} .hd-base .hd-bar2 { top:auto; left:auto; right:6px; z-index:31; align-items:center; gap:8px; }
  ${W} .hd-base .hd-bar2 { bottom:calc(4px + env(safe-area-inset-bottom,0px)); height:52px; }
  ${W} .hd-base .hd-bar2 .hd-pill { display:none; }
  ${W} .hd-base .hd-bottom[style*="display: none"] ~ .hd-bar2 { display:none; }
  ${W} .hd-base .hd-bar { gap:6px; }
  ${W} .hd-base .hd-bar .hd-pill { padding:0 6px 0 4px; gap:4px; }
  ${W} .hd-base .hd-bar .hd-pill .hd-img { height:20px !important; width:20px !important; }
  ${W} .hd-base .hd-profile { width:44px; }
  ${W} .hd-base .hd-live-xbtn { margin-left:0; }
  ${W} .hd-bottom { gap:8px; padding:4px 110px calc(4px + env(safe-area-inset-bottom,0px)) 6px; }
  ${W} .hd-bottom .hd-btn { min-height:52px; padding:0 2px; }
  }
  ${W} .hd-td .hd-td-bar2 { bottom:calc(4px + env(safe-area-inset-bottom,0px)); height:48px; }
  ${W} .hd-td .hd-td-bar2 > span, ${W} .hd-td .hd-td-bar2 > .hd-pill:nth-of-type(2) { display:none; }
  /* 一行装不下英雄 + 两个技能 + 叫波 + 金币牌 + 加速 + 撤退（360 宽要 400 多）：加速挪到顶栏预告钮右边的空位（tdhud.ts 的 .hd-td-speedtop），
     右边只让出金币牌（4 位数）+ 撤退；撤退收到 48 宽 */
  ${W} .hd-td:not(.hd-esc) .hd-td-bar2 > .hd-btn-wood { display:none; }
  ${W} .hd-td:not(.hd-esc) .hd-td-speedtop { display:flex; align-items:center; justify-content:center; }
  ${W} .hd-td-bottom { gap:8px; padding:4px 144px calc(4px + env(safe-area-inset-bottom,0px)) 6px; }
  ${W} .hd-td:not(.hd-esc) .hd-td-bar2 > .hd-btn { min-width:48px; width:48px; padding:0 2px; }
  ${W} .hd-td-skill { width:44px; min-height:48px; }
  ${W} .hd-td .hd-td-bar2 .hd-pill { padding:0 6px 0 4px; gap:4px; }
  /* 护航同理装不下（多一个航速钮）：航速钮浮到撤退正上方，底栏右边只让金币牌 + 撤退 */
  ${W} .hd-esc .hd-td-bottom { padding-right:152px; }
  ${W} .hd-esc .hd-td-bar2 > .hd-esc-sum { position:absolute; right:0; bottom:calc(100% + 8px); }
  ${W} .hd-esc .hd-esc-ctl.open { bottom:calc(116px + env(safe-area-inset-bottom,0px)); }
  ${W} .hd-esc .hd-td-bar2 > .hd-btn-wood:not(.hd-esc-sum) { display:none; }
  /* 预告卡收成顶栏里的一个小钮（波次号）：顶栏里的「已来 N/M 波」让位给它；点开才在顶栏下面浮出预告卡 */
  ${W} .hd-td .hd-td-bar .hd-pill:nth-of-type(2) { display:none; }
  ${W} .hd-plan-tog { display:flex; align-items:center; justify-content:center; padding:0 3px; min-width:56px; }
  ${W} .hd-plan-tog.hint { padding-right:12px; }
  ${W} .hd-td:not(.hd-plan-open) .hd-td-plan { display:none; }
  ${W} .hd-td.hd-plan-open .hd-td-plan { z-index:36; box-shadow:0 0 0 3px #fff3b0, 0 4px 0 ${ink}; }
  ${W} .hd-td-call { flex:1 1 0; min-width:44px; max-width:none; min-height:48px; padding:0 4px; font-size:14px; line-height:1.1; }
  ${W} .hd-td-call small { display:none; }
  @media (max-height:700px) { ${W} .hd-tdsel.hd-tdsel-main { padding-top:4px; padding-bottom:4px; } }
  ${W} .hd-td-plan, ${W} .hd-td-banner { top:calc(env(safe-area-inset-top, 0px) + 58px); }
  /* 第二行搬走后顶栏下面是空的：「全景」「回到船」钮上提到预告卡右边的那一列（卡展开时已给它们让出 74 像素，见 td-ui.ts）；
     登陆战竖屏的次顶栏也搬到了底部，「全景」同样贴着顶栏下沿，落在岛上方的空海里，不压右上的沙滩 */
  ${W} .hd-td .hd-fitbtn, ${W} .hd-battle .hd-fitbtn { top:calc(env(safe-area-inset-top, 0px) + 62px); }
  ${W} .hd-td .hd-esc-back { top:calc(env(safe-area-inset-top, 0px) + 126px); }
  ${W} .hd-td-paused { top:calc(env(safe-area-inset-top, 0px) + 104px); }
  ${W} .hd-td-store { top:calc(env(safe-area-inset-top, 0px) + 70px); }
  ${W} .hd-td .hd-hint { bottom:calc(64px + env(safe-area-inset-bottom,0px)); }
  ${W} .hd-esc .hd-hint { bottom:calc(126px + env(safe-area-inset-bottom,0px)); }
}

@media (min-width:560px) {
  /* 宽屏：两行并一行；个人面板钮不再贴最右 */
  ${W} .hd-bar, ${W} .hd-td-bar { max-width:none; right:auto; flex-wrap:nowrap; }
  ${W} .hd-base .hd-bar { width:316px; }
  ${W} .hd-base .hd-bar2 { top:6px; left:418px; right:auto; }
  ${W} .hd-battle .hd-bar2, ${W} .hd-td .hd-td-bar2 { top:6px; left:auto; right:112px; justify-content:flex-end; }
  ${W} .hd-profile { margin-left:0; }
  /* 登陆战底部：技能和兵种卡排成一行，提示条浮在上面，少占高度 */
  ${W} .hd-cards { flex-direction:row; justify-content:center; align-items:flex-end; gap:12px; }
  ${W} .hd-cards .hd-hint { position:absolute; left:50%; bottom:calc(100% + 4px); transform:translateX(-50%); white-space:nowrap; }
  /* 兵种多时的紧凑卡在宽屏也要放得下「火枪手 ×16」（56 宽会把末位裁掉） */
  ${W} .hd-cards .hd-boats.hd-tight .hd-boat { flex:1 1 76px; min-width:76px; }
  ${W} .hd-feel { top:calc(4px + env(safe-area-inset-top,0px)); right:calc(58px + env(safe-area-inset-right,0px)); }
  ${W} .hd-tdsel-close { right:calc(110px + env(safe-area-inset-right,0px)); }
  ${W} .hd-fitbtn { top:62px; }
  ${W} .hd-td-plan, ${W} .hd-td-banner, ${W} .hd-td-paused { top:calc(env(safe-area-inset-top, 0px) + 62px); }
  ${W} .hd-toast { top:66px; }
}

/* 平板竖屏（560–899 宽，如 820×1180）的护航：顶上预告卡（五六行）和底上整排速度钮各占一大块，合计 27.7%（质量线 22%）。
   预告卡收成顶栏里的波次小钮（和手机竖屏同一套：顶栏的「波」牌让位给它，点开浮出、点别处收起），速度排保持原样大小不动（平板上够宽，不收）。
   守岛、海盗来袭、大潮在平板上只有预告卡一块，本来就在线内，不动 */
@media (min-width:560px) and (max-width:899px) and (orientation:portrait) {
  ${W} .hd-esc .hd-td-bar .hd-pill:nth-of-type(2) { display:none; }
  ${W} .hd-esc .hd-plan-tog { display:flex; align-items:center; justify-content:center; padding:0 3px; min-width:56px; }
  ${W} .hd-esc .hd-plan-tog.hint { padding-right:12px; }
  ${W} .hd-esc:not(.hd-plan-open) .hd-td-plan { display:none; }
  ${W} .hd-esc.hd-plan-open .hd-td-plan { z-index:36; box-shadow:0 0 0 3px #fff3b0, 0 4px 0 ${ink}; }
}

/* 电脑和横屏平板：建筑、守岛面板放右侧，不把手机竖排的抽屉拉宽 */
@media (min-width:900px) and (min-height:560px) {
  ${W} .hd-base > .hd-sheet, ${W} .hd-td > .hd-td-sheet { left:auto; right:12px; top:68px; bottom:auto; margin:0; width:400px; max-height:calc(100% - 80px); border-bottom-width:6px; border-radius:4px; }
  ${W} .hd-bottom .hd-btn { max-width:132px; }
}

/* 没写字号的 small 不吃浏览器默认的"比周围小一号"（11.67px），最小就是 12 */
:where(.hd-ui) small { font-size:12px; }

/* 宽屏守岛选关页：列宽放到 720，别在大片空海里缩成窄条 */
@media (min-width:900px) {
  ${W} .hd-tdsel-head, ${W} .hd-td-income, ${W} .hd-tidecard, ${W} .hd-tdsel-live, ${W} .hd-tdtabs, ${W} .hd-tdtheme, ${W} .hd-tdsel-list, ${W} .hd-tdmodes { width:min(100%,720px); }
}

${LAND} {
  /* 手机横屏：基地的面板（建造、升级、信息）靠右竖着站满顶栏下面的高度，不再是占 60% 屏高的底部抽屉（那样 390 高的屏幕只剩一条缝）；面板开着时底栏收起，面板可以贴边 */
  ${W} .hd-base > .hd-sheet { left:auto; right:calc(6px + env(safe-area-inset-right,0px)); top:56px; bottom:6px; margin:0; width:min(360px,48%); max-height:none; border-bottom-width:3px; border-radius:10px; }
  /* 横屏矮屏：升级面板的外观对比和花费条收紧，把空间让给中间的数值；庆祝框的列表矮一点，两个按钮才放得下 */
  ${W} .hd-base > .hd-sheet .hd-uphero { margin:0 0 6px; gap:6px; }
  ${W} .hd-base > .hd-sheet .hd-uppic { width:84px; height:52px; }
  ${W} .hd-base > .hd-sheet .hd-uppic .hd-img { max-width:76px; max-height:48px; }
  ${W} .hd-base > .hd-sheet .hd-upbox { margin-bottom:6px; padding:6px 12px 8px; }
  ${W} .hd-base > .hd-sheet .hd-upcost { margin-bottom:4px; }
  ${W} .hd-base > .hd-sheet .hd-btn.hd-upbtn { min-height:46px; font-size:16px; }
  ${W} .hd-base > .hd-sheet .hd-upgo { min-height:44px !important; margin-top:4px !important; }
  ${W} .hd-celebrate .hd-newlist { max-height:34vh; margin-bottom:8px; }
  /* 手机横屏：基地的底栏挪到右侧竖着排 */
  ${W} .hd-bottom { left:auto; right:6px; top:62px; bottom:auto; width:88px; flex-direction:column; justify-content:flex-start; gap:8px; padding:8px 6px 10px; border:3px solid ${ink}; border-radius:14px; }
  ${W} .hd-bottom .hd-btn { flex:none; width:100%; max-width:none; min-height:60px; }
  ${W} .hd-base .hd-fitbtn { right:102px; }
  /* 登陆战：兵种卡和技能钮挪到右侧一列，卡片两列排，放不下时竖着滑 */
  ${W} .hd-cards { flex-direction:column; justify-content:flex-start; align-items:stretch; gap:8px; left:auto; right:6px; top:62px; bottom:6px; width:176px; padding:2px 2px 6px; overflow-y:auto; overflow-x:hidden; pointer-events:auto !important; touch-action:pan-y; }
  ${W} .hd-cards .hd-boats { display:grid; grid-template-columns:1fr 1fr; gap:8px; overflow:visible; padding-top:12px; }
  ${W} .hd-cards .hd-boat, ${W} .hd-cards .hd-boats.hd-tight .hd-boat { flex:none; min-width:0; max-width:none; min-height:84px; }
  ${W} .hd-cards .hd-boat .hd-img { height:38px !important; width:auto !important; }
  ${W} .hd-cards .hd-skills { flex-wrap:wrap; overflow:visible; justify-content:center; padding-top:4px; }
  ${W} .hd-cards .hd-skill { flex:1 1 100%; }
  ${W} .hd-cards.hd-more { -webkit-mask-image:linear-gradient(180deg,#000 calc(100% - 24px),transparent); mask-image:linear-gradient(180deg,#000 calc(100% - 24px),transparent); }
  /* 手机横屏（390 高）：右侧一列放不下"能量 + 每个技能一整行 + 两行高兵种卡"，三个技能、四种兵时要滑；
     技能两两并排（图标在上字在下），兵种卡矮一档 */
  @media (max-height:500px) {
    ${W} .hd-cards { gap:8px; }
    ${W} .hd-cards .hd-skills { gap:6px; padding-top:0; justify-content:flex-start; }
    /* 能量独占一行（矮），技能压成一排小方块（图标在上字在下），省出高度给兵种卡 */
    ${W} .hd-cards .hd-en { flex:1 1 100%; justify-content:center; min-height:30px; padding:0 8px; }
    ${W} .hd-cards .hd-skill { flex:0 0 52px; width:52px; min-width:0; min-height:52px; flex-direction:column; gap:0; padding:2px 2px; }
    ${W} .hd-cards .hd-skill .hd-img { height:20px !important; width:20px !important; }
    ${W} .hd-cards .hd-skill .hd-sk-t { align-items:center; }
    ${W} .hd-cards .hd-skill .hd-sk-n { font-size:12px; }
    ${W} .hd-cards .hd-boats { gap:6px; padding-top:8px; }
    ${W} .hd-cards .hd-boat, ${W} .hd-cards .hd-boats.hd-tight .hd-boat { min-height:56px; padding:2px; }
    ${W} .hd-cards .hd-boat .hd-img { height:26px !important; }
    /* "N 船待命"和竖屏一样收起（卡上已有 ×数量，出完会灰掉） */
    ${W} .hd-cards .hd-boat small { display:none; }
    ${W} .hd-cards .hd-hint { padding:2px 8px; font-size:12px; line-height:1.25; }
  }
  ${W} .hd-cards .hd-hint { position:static; transform:none; white-space:normal; text-align:center; align-self:stretch; }
  /* 守岛：技能和叫波挪到右下角一块板 */
  ${W} .hd-td-bottom { left:auto; right:6px; bottom:6px; width:170px; flex-wrap:wrap; justify-content:center; padding:8px 6px 8px; border:3px solid ${ink}; border-radius:14px; }
  ${W} .hd-td-call { flex:1 1 100%; max-width:none; min-height:56px; }
  ${W} .hd-td .hd-hint { left:calc((100% - 182px) / 2); bottom:10px; }
  /* 造塔 / 升级面板开着时游戏暂停，底下一半被面板盖住：右下角那块板（拒马钮 68×68）和面板的关闭钮只隔 3 像素，一起收起 */
  ${W} .hd-td:has(> .hd-td-sheet) .hd-td-bottom { visibility:hidden; }
  /* 登陆战结算框：成就、掉落、解锁提示都有时竖排有 476 高，390 高的横屏上下各切掉一截（横幅和「回家」都看不到）。
     改两栏：横幅占满一行，左栏星、摧毁率、战利品，右栏说明和按钮（dense 让右栏从第二行排起） */
  ${W} .hd-result { width:min(100%, 640px); max-width:none; display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1.4fr); grid-auto-flow:row dense; column-gap:16px; align-items:center; }
  ${W} .hd-result > * { grid-column:2; margin-top:2px; margin-bottom:2px; }
  ${W} .hd-result > h2 { grid-column:1 / -1; }
  ${W} .hd-result > .hd-stars, ${W} .hd-result > .hd-big, ${W} .hd-result > .hd-loot { grid-column:1; justify-self:center; }
}
`;
}
