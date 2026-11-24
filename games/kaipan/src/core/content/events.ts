import { fx } from '../balance.ts';
import type { EventDef, EventPrepCtx } from '../hooks.ts';
import type { EventState, GameState, Stage, ThemeId } from '../types.ts';
import { formatMoney } from '../format.ts';
import { BALANCE } from '../balance.ts';
import { forwardRet, isEaseRun } from '../real.ts';
import { COLLATERALS, collateralTerms } from './ext.ts';
import { ITEMS } from './items.ts';
import { PERSONAS } from './personas.ts';
import { STOCKS, THEMES } from './stocks.ts';

const UP_STAGES: readonly Stage[] = ['sprout', 'ferment', 'rally'];

function stockName(id: string | undefined): string {
  return STOCKS.find((d) => d.id === id)?.name ?? '？';
}

function themeName(id: ThemeId | undefined): string {
  return THEMES.find((t) => t.id === id)?.name ?? '？';
}

function yuan(v: number): string {
  // 千位加逗号，和选项上的金额（formatMoney）写法一致
  return `¥${String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

/** 放进来的股票会占哪一格：第一个空格；没有就换掉持有收益最低的一只（同样低时取靠后的）。 */
export function eventSlot(s: Readonly<GameState>): number {
  const empty = s.slots.indexOf(null);
  if (empty >= 0) return empty;
  let worst = 0;
  let worstValue = Infinity;
  s.slots.forEach((h, i) => {
    if (h && h.value <= worstValue) {
      worstValue = h.value;
      worst = i;
    }
  });
  return worst;
}

/**
 * 新加的事件只在真实行情的非每日局进池：池子变了 rng.int(ready.length) 抽到的就变了。
 * 合成行情（离线兜底、replay-golden）会对不上旧回放；每日挑战会让上线前后打同一天的人不是同一局，榜没法比。
 */
function realOnly(state: GameState): boolean {
  return !!state.real && state.setup?.daily === undefined && state.setup?.flash === undefined && state.setup?.weekly === undefined;
}

/**
 * 闪电盘的事件池（第 4、8 个交易日收盘后各抽一个）：只留当场见分晓的。
 * 排除只适合月底的（年终奖、房东涨租、丈母娘）、要两个月后结算的（借钱、摆摊、理财、量化软件）、要银行或押跌的、加班跳过一天的，
 * 闪电盘没有月供、也没有"下个月"。
 */
export const FLASH_EVENTS: readonly string[] = ['cousin', 'livestream', 'lottery_party', 'course', 'lottery', 'cat_keyboard', 'red_packet', 'blind_box', 'overtime'];

const TACTICS = ITEMS.filter((d) => d.kind === 'tactic' && !d.ext);

/** 随机给道具的几处（卖课、盲盒、老股民）和月底三选一用同一条规则：realOnly 的道具只在真实行情的非每日局里出现。 */
function tacticIds(state: GameState): string[] {
  return TACTICS.filter((d) => !d.realOnly || realOnly(state)).map((d) => d.id);
}

function pctText(v: number): string {
  return `${Math.round(v * 100) / 100}%`;
}

/**
 * 消息面事件只在真实行情的普通局出现（同 isRegularRun：不是每日挑战、闪电盘、本周市场、实盘）：
 * 池子变了同种子抽到的事件就变了，排行榜和实盘期望要对得上。
 */
function regularOnly(state: Readonly<GameState>): boolean {
  // 和 tempo.ts 的 isRegularRun 同口径；这里不引 tempo.ts（它经 content/index.ts 绕回本文件，成环）
  return realOnly(state) && state.setup?.live === undefined;
}

/** 本局登场的风口里随机挑一个（只当话题，不代表方向）。 */
function anyTheme(state: Readonly<GameState>, rng: { int(n: number): number }): ThemeId | undefined {
  return state.themeIds[rng.int(state.themeIds.length)];
}

/**
 * 情报类：选「听」拿一个临时情报道具（用到下个月底），选「不听」什么都不变。手里已经有、或人设不让拿时不出。
 * 道具只看不改：风口温度计、熬夜复盘、老王的小本本、小道消息、反着信韭菜收割机都只让消息更清楚，涨跌照真的走。
 */
function intelPrep(item: string) {
  return ({ state, rng, month }: EventPrepCtx): Omit<EventState, 'id' | 'month'> | null => {
    if (!regularOnly(state) || month >= 12 || state.items.includes(item)) return null;
    if ((PERSONAS.find((p) => p.id === state.persona)?.bannedItems ?? []).includes(item)) return null;
    const theme = anyTheme(state, rng);
    return theme ? { itemId: item, theme } : null;
  };
}

/** 小钱类：账户的 fx(id, 'pct')%。 */
function cashPrep(id: string) {
  return ({ state, rng, month }: EventPrepCtx): Omit<EventState, 'id' | 'month'> | null => {
    if (!regularOnly(state) || month >= 12) return null;
    const theme = anyTheme(state, rng);
    return theme ? { theme, amount: Math.round((state.account * fx(id, 'pct')) / 100) } : null;
  };
}

const itemName = (id: string | undefined): string => ITEMS.find((d) => d.id === id)?.name ?? '？';

const NEWS_EVENTS: readonly EventDef[] = [
  {
    id: 'policy_talk',
    name: '政策吹风会',
    text: (e) => `晚间新闻里开了个吹风会，点名提到了「${themeName(e.theme)}」。群里吵翻了：有人说是好事，有人说是要管。`,
    options: (e) => [`蹲直播看解读（拿到「${itemName(e.itemId)}」，用到 ${e.month + 1} 月底）`, '不看（新闻联播看完就睡）'],
    prepare: intelPrep('mood_meter'),
    resolve(c, option) {
      if (option !== 0 || !c.event.itemId) return '你关了电视。第二天群里还在吵，你决定看行情说话。';
      c.gainItem(c.event.itemId, c.event.month + 1);
      return "专家讲了两个钟头，你记了满满一页：哪个风口真热、哪个是虚火，心里有点数了。";
    },
  },
  {
    id: 'merger_rumor',
    name: '并购传闻',
    text: (e) => `群里传「${themeName(e.theme)}」里有家公司要被收购，截图有鼻子有眼。老王说他有个表弟在那边上班。`,
    options: (e) => [`请老王喝一杯打听（拿到「${itemName(e.itemId)}」，用到 ${e.month + 1} 月底）`, '不信谣不传谣'],
    prepare: intelPrep('notebook'),
    resolve(c, option) {
      if (option !== 0 || !c.event.itemId) return '你没接话。截图在群里转了三圈，没人知道真假。';
      c.gainItem(c.event.itemId, c.event.month + 1);
      return '两杯下肚，老王把他的小本本推了过来："以后我说的，你记着。"';
    },
  },
  {
    id: 'debunk',
    name: '官方辟谣',
    text: (e) => `昨天韭菜收割机在群里喊的「${themeName(e.theme)}」大消息，今天被官方辟谣了。他装没看见，又发了一条新的。`,
    options: (e) => [`记下这笔账（拿到「${itemName(e.itemId)}」，用到 ${e.month + 1} 月底）`, '算了，收割机也不容易'],
    prepare: intelPrep('fan_qunzhu'),
    resolve(c, option) {
      if (option !== 0 || !c.event.itemId) return '你给他点了个赞。收割机私聊你："懂我。"';
      c.gainItem(c.event.itemId, c.event.month + 1);
      return '你把他这个月喊过的话列了张表，对着行情一看：反着听，好像更准。';
    },
  },
  {
    id: 'stamp_tax',
    name: '降印花税的传言',
    text: () => '半夜群里有人说"明早要降交易印花税"，几百条消息刷屏，有人说是真的，有人说去年也这么传过。',
    options: (e) => [`熬夜等消息（拿到「${itemName(e.itemId)}」，用到 ${e.month + 1} 月底）`, '睡觉（明早再说）'],
    prepare: intelPrep('night_review'),
    resolve(c, option) {
      if (option !== 0 || !c.event.itemId) return '你睡得很香。早上起来，传言还是传言。';
      c.gainItem(c.event.itemId, c.event.month + 1);
      return '消息到天亮也没来，但你养成了收盘后复盘的习惯。';
    },
  },
  {
    id: 'tv_analyst',
    name: '电视股评',
    text: (e) => `财经频道的股评嘉宾拍着桌子讲「${themeName(e.theme)}」，台下观众连连点头。节目最后给了个热线号码。`,
    options: (e) => [`记下热线（拿到「${itemName(e.itemId)}」，用到 ${e.month + 1} 月底）`, '换台（看会儿动画片）'],
    prepare: intelPrep('rumor_mill'),
    resolve(c, option) {
      if (option !== 0 || !c.event.itemId) return '你换了台。动画片里的猫也在炒股，亏得比你还惨。';
      c.gainItem(c.event.itemId, c.event.month + 1);
      return '热线那头每天给你发一条小道消息。准不准另说，反正热闹。';
    },
  },
  {
    id: 'fake_insider',
    name: '冒牌内幕群',
    text: () => '有人私聊你："拉你进 VIP 内幕群，跟单包赚，先交会员费。"头像是一辆跑车。',
    options: (e) => [`举报（平台奖励 +${yuan(e.amount ?? 0)}）`, '直接拉黑（跑车头像也不好使）'],
    prepare: cashPrep('fake_insider'),
    resolve(c, option) {
      if (option !== 0) return '拉黑了。跑车头像换了个号，又来加你。';
      c.addAccount(c.event.amount ?? 0);
      return `举报成功，平台发来 ${yuan(c.event.amount ?? 0)} 奖励和一句"谢谢您守护投资环境"。`;
    },
  },
  {
    id: 'rate_rumor',
    name: '降息传闻',
    text: () => '银行的朋友神神秘秘地说"最近可能要降息"。你问他哪天，他说"反正是最近"。',
    options: (e) => [`请他吃顿饭（他抢着买单，还塞给你 +${yuan(e.amount ?? 0)} 的购物卡）`, '不了（"最近"这个词我听过很多次）'],
    prepare: cashPrep('rate_rumor'),
    resolve(c, option) {
      if (option !== 0) return '他耸耸肩："信不信由你。"';
      c.addAccount(c.event.amount ?? 0);
      return `饭桌上他讲了一晚上利率，你一句没听懂，倒是拿到一张 ${yuan(c.event.amount ?? 0)} 的购物卡。`;
    },
  },
  {
    id: 'clarify',
    name: '公司澄清公告',
    text: (e) => `一家公司发澄清公告："我们和「${themeName(e.theme)}」没有关系。"顺便邀请股东来参加开放日，有纪念品。`,
    options: (e) => [`去开放日（纪念品折价 +${yuan(e.amount ?? 0)}；跑了一天，下个交易日没空：不能买也不能卖）`, '不去（澄清就澄清吧）'],
    prepare: cashPrep('clarify'),
    resolve(c, option) {
      if (option !== 0) return '你没去。听说纪念品是个印着公司名的保温杯。';
      c.addAccount(c.event.amount ?? 0);
      c.skipNextDay();
      return `你领到一个保温杯和一盒点心，折合 ${yuan(c.event.amount ?? 0)}。回到家，行情已经收盘了。`;
    },
  },
];

/**
 * 事件（15 个，前 6 个是 M0 的）：每月领完奖励后按概率触发一个，二选一，后果简单明确。数值在 BALANCE.fx[id]。
 * 全部虚构。延后结算的事件（借钱、摆摊、理财、量化软件续费）在 prepare 时要求 month + 2 ≤ 12。
 * 第 8 级"末日"：花费和损失 × badMult（EventCtx.addAccount 自动乘），概率类的坏结果由事件自己放大。
 */
export const EVENTS: readonly EventDef[] = [
  {
    id: 'cousin',
    name: '表哥荐股',
    text: (e) => `表哥神秘兮兮地发来一只过山车股：${stockName(e.stockId)}。"这次绝对靠谱！"（表哥的消息大概只有 ${Math.round(fx('cousin', 'acc') * 100)}% 准）`,
    options(e, s) {
      const old = e.slot !== undefined ? s.slots[e.slot] : null;
      return [`买（${stockName(e.stockId)}${old ? `，换掉${stockName(old.stockId)}` : '，放进空位'}）`, '不买，表哥的话听听就好'];
    },
    prepare({ state, rng }) {
      const held = new Set(state.slots.map((h) => h?.stockId));
      const memes = STOCKS.filter((d) => d.role === 'meme' && state.stocks[d.id] && !state.stocks[d.id]?.delisted && !held.has(d.id));
      if (memes.length === 0) return null;
      const good = rng.next() < fx('cousin', 'acc');
      // 真实行情：表哥说中 = 这只接下来 3 天真的涨
      const real = state.real;
      const fits = real
        ? memes.filter((d) => forwardRet(real, 'stock', d.id, state.dayIndex, 3) > 0 === good)
        : memes.filter((d) => UP_STAGES.includes(state.themes[d.theme]?.stage ?? 'cold') === good);
      const pool = fits.length > 0 ? fits : memes;
      return { stockId: pool[rng.int(pool.length)]?.id, slot: eventSlot(state) };
    },
    resolve(c, option) {
      if (option !== 0 || !c.event.stockId || c.event.slot === undefined) return '表哥：不信我？你会后悔的。';
      c.placeStock(c.event.stockId, c.event.slot);
      return `${stockName(c.event.stockId)}到手了。表哥：放心，这次稳了。`;
    },
  },
  {
    id: 'livestream',
    name: '大V直播间',
    text: (e) => `股市小诸葛开直播："家人们，${themeName(e.theme)}还能冲！"弹幕刷屏，要不要跟着买？`,
    options: (e, s) => [
      s.real
        ? `跟（直播间粉丝抢着买：手里${themeName(e.theme)}的股票每一份马上多赚 ${fx('livestream', 'realBonus')}%；热度也被带起来，但涨跌照真的走）`
        : `跟（接下来 ${fx('livestream', 'days')} 天${themeName(e.theme)}每天热度 +${fx('livestream', 'dH')}；手里有它的股票才赚得到）`,
      '不跟，看看就好',
    ],
    prepare({ state }) {
      let best: ThemeId | null = null;
      let heat = -1;
      for (const id of state.themeIds) {
        const h = state.themes[id]?.heat ?? 0;
        if (h > heat) {
          heat = h;
          best = id;
        }
      }
      return best ? { theme: best } : null;
    },
    resolve(c, option) {
      if (option !== 0 || !c.event.theme) return '你关掉了直播间，世界清静了。';
      c.boostTheme(c.event.theme, fx('livestream', 'dH'), fx('livestream', 'days'));
      if (c.state.real) {
        let units = 0;
        for (const h of c.state.slots) if (h && !h.short && STOCKS.find((d) => d.id === h.stockId)?.theme === c.event.theme) units += h.units ?? 1;
        const got = c.addAccount((c.state.account * units * fx('livestream', 'realBonus')) / 400);
        return got > 0 ? `你在弹幕里刷了一句"跟了"。粉丝抢着接你手里的${themeName(c.event.theme)}，多拿 ${yuan(got)}。` : `你在弹幕里刷了一句"跟了"。可你手里没有${themeName(c.event.theme)}的股票，只是凑了个热闹。`;
      }
      return `你在弹幕里刷了一句"跟了"。${themeName(c.event.theme)}的热度被直播间带了起来。`;
    },
  },
  {
    id: 'lottery_party',
    name: '年会抽奖',
    text: () => `公司年会抽奖，奖品是账户 +${fx('lottery_party', 'min')}~${fx('lottery_party', 'max')}% 的红包。`,
    options: () => ['上台抽奖', '把机会让给实习生'],
    prepare: () => ({}),
    resolve(c, option) {
      if (option !== 0) return '实习生抽中了一等奖，对你千恩万谢。';
      const lo = fx('lottery_party', 'min');
      const hi = fx('lottery_party', 'max');
      const pct = lo + c.rng.int(Math.max(1, hi - lo + 1));
      c.addAccount((c.state.account * pct) / 100);
      return `抽中了 ${pct}% 的红包！`;
    },
  },
  {
    id: 'course',
    name: '韭菜收割机卖课',
    text: (e) => `韭菜收割机私聊你："《三天学会跟紧大哥》限时特价 ${yuan(e.amount ?? 0)}，学完随机送你一招！"`,
    options: (e) => [`花 ${yuan(e.amount ?? 0)} 买课（随机学会一招买卖套路，是个道具）`, '拒绝，并把韭菜收割机设为免打扰'],
    prepare({ state }) {
      if (!tacticIds(state).some((id) => !state.items.includes(id))) return null;
      return { amount: Math.round((state.account * fx('course', 'cost')) / 100) };
    },
    resolve(c, option) {
      if (option !== 0) return '韭菜收割机：你会回来求我的。';
      const left = tacticIds(c.state).filter((id) => !c.state.items.includes(id));
      const id = left[c.rng.int(left.length)];
      c.addAccount(-(c.event.amount ?? 0));
      if (!id) return '课程内容是一页 PPT。';
      c.gainItem(id);
      return `你学会了${ITEMS.find((d) => d.id === id)?.name ?? id}（课程本身是一页 PPT）。`;
    },
  },
  {
    id: 'lottery',
    name: '买彩票',
    text: (e) => `路过彩票店，老板说今天奖池很大。一注 ${yuan(e.amount ?? 0)}，中了账户 +${fx('lottery', 'prize')}%。`,
    options: (e) => [`花 ${yuan(e.amount ?? 0)} 买一注`, '不买，回家看股票'],
    prepare: ({ state }) => ({ amount: Math.round((state.account * fx('lottery', 'cost')) / 100) }),
    resolve(c, option) {
      if (option !== 0) return '你省下了一注彩票钱。';
      c.addAccount(-(c.event.amount ?? 0));
      if (c.rng.next() < fx('lottery', 'chance')) {
        c.addAccount((c.state.account * fx('lottery', 'prize')) / 100);
        return `中了！账户 +${fx('lottery', 'prize')}%！老板说你印堂发亮。`;
      }
      return '没中。老板说下次一定。';
    },
  },
  {
    id: 'bonus',
    name: '公司发年终奖',
    text: () => `公司发年终奖了！账户 +${fx('bonus', 'pct')}%。`,
    options: () => ['收下', '婉拒，留给老板买游艇'],
    // 只在 1 月（刚还完 1 月月供）或 12 月（刚还完 11 月月供、进入 12 月）出现
    prepare: ({ state, month }) => (month === 1 || month === 11 ? { amount: Math.round((state.account * fx('bonus', 'pct')) / 100) } : null),
    resolve(c, option) {
      if (option !== 0) return '老板感动得热泪盈眶，然后照常加班。';
      c.addAccount(c.event.amount ?? 0);
      return `年终奖到账 ${yuan(c.event.amount ?? 0)}。`;
    },
  },
  {
    id: 'landlord',
    name: '房东涨租',
    text: () => '房东发来微信："下个月起房租涨一点点哈～"后面跟着三朵玫瑰。',
    options: (e) => [
      `答应（下个月要还的钱 ×${fx('landlord', 'billMult')}）`,
      `搬家（花 ${yuan(e.amount ?? 0)} 搬家费，要还的钱不变）`,
    ],
    prepare: ({ state }) => ({ amount: Math.round((state.account * fx('landlord', 'moveCost')) / 100) }),
    resolve(c, option) {
      if (option === 0) {
        c.scaleNextBill(fx('landlord', 'billMult'));
        return '房东回了句"谢谢老板"，又发了三朵玫瑰。';
      }
      const d = c.addAccount(-(c.event.amount ?? 0));
      return `搬家花了 ${yuan(-d)}，师傅把显示器磕了个角，不过房租保住了。`;
    },
  },
  {
    id: 'classmate_loan',
    name: '老同学借钱',
    text: (e) =>
      `大学室友找你借 ${yuan(e.amount ?? 0)}："${e.month + 2} 月初一定还，再多给你 ${fx('classmate_loan', 'interest')}% 利息。兄弟我什么时候骗过你？"`,
    options: (e) => [
      `借（${e.month + 2} 月初连本带利还 ${yuan(((e.amount ?? 0) * (100 + fx('classmate_loan', 'interest'))) / 100)}，前提是他记得）`,
      '不借（友谊的小船晃了一下）',
    ],
    prepare: ({ state, month }) => (month + 2 <= 12 ? { amount: Math.round((state.account * fx('classmate_loan', 'pct')) / 100) } : null),
    resolve(c, option) {
      if (option !== 0) return '室友回了个"理解理解"，然后把你的朋友圈设成了三天可见。';
      c.addAccount(-(c.event.amount ?? 0), true);
      c.addPending(c.event.amount ?? 0, c.event.month + 2);
      return `钱转过去了。室友："${c.event.month + 2} 月初见！"`;
    },
    settle(c, amount) {
      if (c.rng.next() < fx('classmate_loan', 'forget') * c.badMult) {
        return { delta: 0, text: '室友说他"最近手头紧"，下个月一定还。你看着他新换的手机，没说话。' };
      }
      const back = Math.round((amount * (100 + fx('classmate_loan', 'interest'))) / 100);
      return { delta: back, text: `室友连本带利还了 ${yuan(back)}，附赠一句"苟富贵，勿相忘"。` };
    },
  },
  {
    id: 'side_hustle',
    name: '周末摆摊',
    text: (e) => `朋友拉你周末去夜市摆摊卖烤肠，说"稳赚不赔"。入伙要 ${yuan(e.amount ?? 0)}。`,
    options: (e) => [
      `入伙（${e.month + 2} 月初分账：拿回本金的 ${Math.round(fx('side_hustle', 'min') * 100)}%~${Math.round(fx('side_hustle', 'max') * 100)}%）`,
      '不去（周末在家研究股票）',
    ],
    prepare: ({ state, month }) => (month + 2 <= 12 ? { amount: Math.round((state.account * fx('side_hustle', 'pct')) / 100) } : null),
    resolve(c, option) {
      if (option !== 0) return '你在家研究了一整个周末股票，研究出了黑眼圈。';
      c.addAccount(-(c.event.amount ?? 0), true);
      c.addPending(c.event.amount ?? 0, c.event.month + 2);
      return '你系上围裙，烤肠在铁板上滋滋作响。';
    },
    settle(c, amount) {
      const lo = fx('side_hustle', 'min');
      const hi = fx('side_hustle', 'max');
      const mult = (lo + c.rng.next() * (hi - lo)) / c.badMult;
      const back = Math.round(amount * mult);
      return {
        delta: back,
        text: mult >= 1 ? `夜市分账：拿回 ${yuan(back)}。烤肠真香。` : `城管来了三次，分账只拿回 ${yuan(back)}。烤肠自己吃了。`,
      };
    },
  },
  {
    id: 'cat_keyboard',
    name: '猫踩键盘',
    text: (e) => `猫从键盘上踩过去，留下一笔买单：${stockName(e.stockId)}。它回头看了你一眼，好像很有把握。`,
    options(e, s) {
      const old = e.slot !== undefined ? s.slots[e.slot] : null;
      return [`留着（${stockName(e.stockId)}${old ? `，换掉${stockName(old.stockId)}` : '，放进空位'}）`, '撤单（猫不懂炒股）'];
    },
    prepare({ state, rng }) {
      const held = new Set(state.slots.map((h) => h?.stockId));
      const pool = STOCKS.filter((d) => d.role === 'follower' && state.stocks[d.id] && !state.stocks[d.id]?.delisted && !held.has(d.id));
      if (pool.length === 0) return null;
      const random = pool[rng.int(pool.length)]?.id;
      // 真实行情：猫有 BALANCE.intel.cat 的概率踩中接下来 2 天真实涨得最多的那只小弟
      const real = state.real;
      if (real && rng.next() < BALANCE.intel.cat) {
        let best = pool[0]?.id;
        let bx = -Infinity;
        for (const d of pool) {
          const x = forwardRet(real, 'stock', d.id, state.dayIndex, 2);
          if (x > bx) {
            bx = x;
            best = d.id;
          }
        }
        return { stockId: best, slot: eventSlot(state) };
      }
      return { stockId: random, slot: eventSlot(state) };
    },
    resolve(c, option) {
      if (option !== 0 || !c.event.stockId || c.event.slot === undefined) return '你撤了单。猫在键盘上睡着了，打出一行"jjjjjjjj"。';
      c.placeStock(c.event.stockId, c.event.slot);
      return `${stockName(c.event.stockId)}到手了。猫的眼光如何，开盘见分晓。`;
    },
  },
  {
    id: 'red_packet',
    name: '群里抢红包',
    text: () => '韭菜收割机在群里发了个拼手气红包："抢到的都是自己人！"',
    options: () => [
      `抢！（多半能抢到一点；要是手气最差，按群规得回发一个红包，大约是你账户的 ${pctText(fx('red_packet', 'lose'))}）`,
      '不抢（韭菜收割机的红包不好拿）',
    ],
    prepare: () => ({}),
    resolve(c, option) {
      if (option !== 0) return '你没抢。韭菜收割机："不合群。"';
      const u = c.rng.next();
      const v = c.rng.next();
      if (u < fx('red_packet', 'win') / c.badMult) {
        const lo = fx('red_packet', 'min');
        const hi = fx('red_packet', 'max');
        const d = c.addAccount((c.state.account * (lo + v * (hi - lo))) / 100);
        return `抢到 ${yuan(d)}！韭菜收割机私聊你："自己人，VIP 群了解一下？"`;
      }
      const d = c.addAccount((-c.state.account * fx('red_packet', 'lose')) / 100);
      return `手气最差，抢到 ¥0.01。按群规回发了一个 ${yuan(-d)} 的大红包，群里一片"谢谢老板"。`;
    },
  },
  {
    id: 'quant_trial',
    name: '炒股软件试用',
    text: () => '一款叫"韭菜雷达"的炒股软件邀请你免费试用一个月，说能看穿每个风口的真实状态。',
    options: (e) => [
      `试用（${e.month + 1} 月一整月有"风口温度计"；${e.month + 2} 月初自动续费 ${yuan(e.amount ?? 0)}）`,
      '不用（我信我自己）',
    ],
    prepare: ({ state, month }) =>
      month + 2 <= 12 && !state.items.includes('mood_meter') ? { amount: Math.round((state.account * fx('quant_trial', 'renew')) / 100) } : null,
    resolve(c, option) {
      if (option !== 0) return '你关掉了弹窗。弹窗又弹了三次。';
      c.gainItem('mood_meter', c.event.month + 1);
      c.addPending(c.event.amount ?? 0, c.event.month + 2);
      return '装好了。炒股软件里多了一排小字，看起来很专业。';
    },
    settle(c, amount) {
      const fee = Math.round(amount * c.badMult);
      return { delta: -fee, text: `"韭菜雷达"自动续费成功，扣了 ${yuan(fee)}。取消按钮藏在第七层菜单里。` };
    },
  },
  {
    id: 'blind_box',
    name: '炒股盲盒',
    text: (e) => `楼下新开了家"炒股盲盒"店，${yuan(e.amount ?? 0)} 一个，开出什么道具全看手气。`,
    options: (e) => [`抽一个（花 ${yuan(e.amount ?? 0)}，随机得到一个道具）`, '不抽（盲盒的尽头是破产）'],
    prepare({ state }) {
      if (blindPool(state).length === 0) return null;
      return { amount: Math.round((state.account * fx('blind_box', 'cost')) / 100) };
    },
    resolve(c, option) {
      if (option !== 0) return '你忍住了。店员在背后说"下次一定"。';
      const pool = blindPool(c.state);
      const id = pool[c.rng.int(pool.length)];
      c.addAccount(-(c.event.amount ?? 0));
      if (!id) return '盲盒是空的，里面只有一张"谢谢惠顾"。';
      c.gainItem(id);
      return `开出了「${ITEMS.find((d) => d.id === id)?.name ?? id}」！店员说你今天手气爆棚。`;
    },
  },
  {
    id: 'fund_manager',
    name: '理财经理来电',
    text: (e) =>
      `银行理财经理打来电话："稳稳理财，一个月 +${fx('fund_manager', 'ret')}%，比放着强多了！"起投 ${yuan(e.amount ?? 0)}，锁一个月。`,
    options: (e) => [
      `买（锁到 ${e.month + 2} 月初，连本带利拿回约 ${yuan(((e.amount ?? 0) * (100 + fx('fund_manager', 'ret'))) / 100)}；锁着的钱不能拿来还月底的账）`,
      '不买（稳稳的幸福自己给）',
    ],
    prepare: ({ state, month }) => (month + 2 <= 12 ? { amount: Math.round((state.account * fx('fund_manager', 'pct')) / 100) } : null),
    resolve(c, option) {
      if (option !== 0) return '理财经理："好的，祝您生活愉快。"语气里有一丝失落。';
      c.addAccount(-(c.event.amount ?? 0), true);
      c.addPending(c.event.amount ?? 0, c.event.month + 2);
      return '签完字，理财经理送了你一桶花生油。';
    },
    settle(c, amount) {
      if (c.badMult > 1 && c.rng.next() < (c.badMult - 1) * 0.3) {
        const back = Math.round(amount * 0.9);
        return { delta: back, text: `理财产品说"晚点再还"，最后只拿回 ${yuan(back)}。花生油还在。` };
      }
      const back = Math.round((amount * (100 + fx('fund_manager', 'ret'))) / 100);
      return { delta: back, text: `理财到期，连本带利 ${yuan(back)} 到账。花生油也吃完了。` };
    },
  },
  {
    id: 'overtime',
    name: '老板喊加班',
    text: () => '老板在群里@你："这周末加个班，三倍工资。"下面是一排整齐的"收到"。',
    options: (e) => [`加班（账户 +${yuan(e.amount ?? 0)}，但下个交易日没空：不能买也不能卖）`, '拒绝（老板的脸色比跌停还难看）'],
    prepare: ({ state }) => ({ amount: Math.round((state.account * fx('overtime', 'pct')) / 100) }),
    resolve(c, option) {
      if (option !== 0) return '老板说"年轻人要有奋斗精神"，然后去钓鱼了。';
      c.addAccount(c.event.amount ?? 0);
      c.skipNextDay();
      return '三倍工资到账。下个交易日你在工位上，只能偷偷瞄一眼股价。';
    },
  },
  // ---------------------------------------------------------------- 押跌、抵押（只在有新机制的局里出现）
  {
    id: 'bank_manager',
    name: '银行经理上门',
    text: (e) => {
      const c = COLLATERALS.find((d) => d.id === e.collateral);
      return `银行客户经理拎着果篮上门："听说您炒股很厉害？把${c?.name ?? '东西'}押给我们，马上借您 ${yuan(e.amount ?? 0)}，利息打 ${Math.round(fx('bank_manager', 'rateMult') * 10)} 折。"`;
    },
    options: (e) => {
      const c = COLLATERALS.find((d) => d.id === e.collateral);
      return [`押${c?.name ?? '东西'}，借 ${yuan(e.amount ?? 0)}（赚亏都放大；亏多了东西会被收走）`, '不借（果篮留下，人请回）'];
    },
    prepare: ({ state, rng, month }) => {
      const x = state.ext;
      if (!x || month >= 12 || month + 1 < BALANCE.ext.bankMonth) return null;
      const free = COLLATERALS.filter((d) => !x.loans.some((l) => l.id === d.id) && !x.log.seized.includes(d.id) && collateralTerms(d.id, state.difficulty));
      const ok = free.filter((d) => {
        const amount = collateralTerms(d.id, state.difficulty)?.amount ?? 0;
        let debt = amount;
        for (const l of x.loans) debt += l.amount;
        return state.account + amount >= debt * BALANCE.ext.borrowLine;
      });
      if (ok.length === 0) return null;
      const pick = ok[rng.int(ok.length)] as (typeof ok)[number];
      return { collateral: pick.id, amount: collateralTerms(pick.id, state.difficulty)?.amount ?? 0 };
    },
    resolve(c, option) {
      if (option !== 0 || !c.event.collateral) return '经理走的时候顺手把果篮也拎走了。';
      return c.takeLoan(c.event.collateral, fx('bank_manager', 'rateMult')) ? '签字、按手印，钱到账了。经理笑得比你还开心。' : '经理看了看你的账户，说"下次一定"。';
    },
  },
  {
    id: 'bear_live',
    name: '空头大V直播',
    text: () => '一个戴墨镜的大V在直播间喊："只会买涨的都是韭菜！押跌也能赚钱！"他给你发了一张押跌体验卡。',
    options: () => [`收下（${fx('bear_live', 'months')} 个月内可以押跌，空军老周进群）`, '不要（我只会买涨，我骄傲）'],
    prepare: ({ state, month }) => (state.ext && month < 12 && !isEaseRun(state) && !state.items.includes('short_permit') && state.difficulty < BALANCE.ext.shortLevel ? {} : null),
    resolve(c, option) {
      if (option !== 0) return '大V骂了一句"韭菜就是韭菜"，下播了。';
      c.gainItem('short_permit', c.event.month + fx('bear_live', 'months'));
      return '体验卡到手。群里多了个戴墨镜的头像。';
    },
  },
  {
    id: 'mother_in_law',
    name: '丈母娘查岗',
    text: (e) => `丈母娘突然来电："听说你把${e.collateral === 'house' ? '房子' : '金镯子'}押出去炒股了？"`,
    options: (e) => [`发个红包压压惊（${yuan(e.amount ?? 0)}）`, `老实交代（下个月家里要多交 ${Math.round((fx('mother_in_law', 'billMult') - 1) * 100)}% 生活费）`],
    prepare: ({ state, month }) => {
      const x = state.ext;
      if (!x || month >= 12) return null;
      const l = x.loans.find((l) => l.id === 'house' || l.id === 'bracelet');
      return l ? { collateral: l.id, amount: Math.round((state.account * fx('mother_in_law', 'pct')) / 100) } : null;
    },
    resolve(c, option) {
      if (option === 0) {
        c.addAccount(-(c.event.amount ?? 0));
        return '红包发过去，对面回了一个"好女婿"的表情包。';
      }
      c.scaleNextBill(fx('mother_in_law', 'billMult'));
      return '你老实交代了。丈母娘说："赚了算你的，亏了算你的。"';
    },
  },
  {
    id: 'parents_call',
    name: '爸妈打电话',
    text: () => '爸妈打来电话："钱用得还顺手吗？不够再说啊。"',
    options: () => ['"挺好的，赚了！"（报喜不报忧）', '说实话（爸妈说那笔钱不要利息了）'],
    prepare: ({ state, month }) => (state.ext?.loans.some((l) => l.id === 'pension') && month < 12 ? {} : null),
    resolve(c, option) {
      if (option === 0) return '爸妈很高兴，说要去跳广场舞庆祝。你挂了电话，看了一眼账户。';
      c.setLoanRate('pension', 0);
      return '爸妈沉默了一会儿："不着急还，利息就算了，你好好的就行。"';
    },
  },
  // ---------------------------------------------------------------- 两个只在真实行情局里出现的事件（见 realOnly）
  {
    id: 'salary_advance',
    name: '老板问要不要预支工资',
    text: (e) => `老板拍拍你的肩："手头紧的话，下个月工资可以先预支一部分。"财务已经把 ${yuan(e.amount ?? 0)} 的单子备好了。`,
    options: (e) => [
      `预支（账户马上 +${yuan(e.amount ?? 0)}，下个月要还的钱 ×${fx('salary_advance', 'billMult')}）`,
      '不预支（月光族也有自尊）',
    ],
    prepare: ({ state, month }) => (realOnly(state) && month < 12 ? { amount: Math.round((state.account * fx('salary_advance', 'pct')) / 100) } : null),
    resolve(c, option) {
      if (option !== 0) return '老板点点头："有骨气。"转身又去问隔壁工位了。';
      c.addAccount(c.event.amount ?? 0);
      c.scaleNextBill(fx('salary_advance', 'billMult'));
      return `预支的 ${yuan(c.event.amount ?? 0)} 到账了。下个月工资条上会少一截，你决定暂时不看。`;
    },
  },
  {
    id: 'old_trader',
    name: '楼下老股民请吃饭',
    text: () => '楼下小饭馆的老股民叫住你："年轻人，坐，我给你讲讲我这二十年的心得。"桌上只有一碟花生米。',
    options: (e) => [
      `陪他聊（学到一招：${ITEMS.find((d) => d.id === e.itemId)?.name ?? '？'}，用到 ${e.month + 1} 月底；但聊到太晚，下个交易日没空：不能买也不能卖）`,
      '婉拒（回家早点睡）',
    ],
    prepare({ state, rng, month }) {
      if (!realOnly(state) || month >= 12) return null;
      const banned = new Set(PERSONAS.find((p) => p.id === state.persona)?.bannedItems ?? []);
      const left = tacticIds(state).filter((id) => !state.items.includes(id) && !banned.has(id));
      const id = left[rng.int(left.length)];
      return id ? { itemId: id } : null;
    },
    resolve(c, option) {
      if (option !== 0 || !c.event.itemId) return '老股民叹了口气："现在的年轻人，不爱听了。"自己把花生米吃完了。';
      c.gainItem(c.event.itemId, c.event.month + 1);
      c.skipNextDay();
      return `一碟花生米聊到打烊，你学会了${ITEMS.find((d) => d.id === c.event.itemId)?.name ?? '一招'}。回家路上脑子还在嗡嗡响。`;
    },
  },
  // ---------------------------------------------------------------- 两个同样只在真实行情局里出现的事件
  {
    id: 'invest_group',
    name: '同事拉你进投资群',
    text: () => '同事神秘兮兮地凑过来："我们有个投资群，每天都有人发内幕，拉你进来？"手机已经震了三下。',
    options: () => [
      `进群（群里消息多：到下个月底每天多一条小道消息；但整天盯着群，下个交易日没空：不能买也不能卖）`,
      `不进（耳根清净，省下随份子的钱 +${fx('invest_group', 'pct')}%）`,
    ],
    prepare({ state, month }) {
      if (!realOnly(state) || month >= 12 || state.items.includes('rumor_mill')) return null;
      const banned = PERSONAS.find((p) => p.id === state.persona)?.bannedItems ?? [];
      return banned.includes('rumor_mill') ? null : { amount: Math.round((state.account * fx('invest_group', 'pct')) / 100) };
    },
    resolve(c, option) {
      if (option !== 0) {
        c.addAccount(c.event.amount ?? 0);
        return `你婉拒了。群里的红包和份子钱都跟你没关系，省下 ${yuan(c.event.amount ?? 0)}。`;
      }
      c.gainItem('rumor_mill', c.event.month + 1);
      c.skipNextDay();
      return '你进了群，两百人，九十九个在喊"稳了"。你盯着消息刷了一整天，没顾上看股票。';
    },
  },
  {
    id: 'broker_tea',
    name: '券商经理请喝茶',
    text: (e) => `券商客户经理约你喝茶："您是我们的重点客户，下个月的生活开销我们帮您抵扣一点。"临走他递来一份理财产品单子，${yuan(e.amount ?? 0)} 起购。`,
    options: (e) => [
      `喝茶并买一份（先付 ${yuan(e.amount ?? 0)}，下个月要还的钱 ×${fx('broker_tea', 'billMult')}）`,
      '不喝（茶可以，单子不行）',
    ],
    prepare: ({ state, month }) => (realOnly(state) && month < 12 ? { amount: Math.round((state.account * fx('broker_tea', 'pct')) / 100) } : null),
    resolve(c, option) {
      if (option !== 0) return '经理笑着说"下次一定"，茶也没让你喝。';
      c.addAccount(-(c.event.amount ?? 0));
      c.scaleNextBill(fx('broker_tea', 'billMult'));
      return `你买了一份，经理当场把抵扣券拍在桌上。下个月的账单会轻一些，这个月的钱少了 ${yuan(c.event.amount ?? 0)}。`;
    },
  },
  // ---------------------------------------------------------------- 再两个只在真实行情局里出现的散户日常
  {
    id: 'show_off',
    name: '朋友圈晒收益',
    text: () => '这个月赚得不错，手指悬在朋友圈的发送键上。晒一下吧？点赞估计少不了，就是总有人会让你请客。',
    options: (e) => [
      `晒（点赞和打赏 +${yuan(e.amount ?? 0)}；请大家吃饭，下个月要还的钱 ×${fx('show_off', 'billMult')}）`,
      '不晒（闷声发大财，什么都不变）',
    ],
    prepare: ({ state, month }) => (realOnly(state) && month < 12 ? { amount: Math.round((state.account * fx('show_off', 'pct')) / 100) } : null),
    resolve(c, option) {
      if (option !== 0) return '你把手机扣在桌上。朋友圈里没人知道你这个月赚了多少。';
      c.addAccount(c.event.amount ?? 0);
      c.scaleNextBill(fx('show_off', 'billMult'));
      return `点赞刷了一百多个，还有人发来红包，收到 ${yuan(c.event.amount ?? 0)}。然后有人留言"什么时候请客"，下个月的开销会重一些。`;
    },
  },
  {
    id: 'free_eggs',
    name: '营业部送鸡蛋',
    text: () => '楼下证券营业部门口排起长队：开户送鸡蛋，还送一份小礼包。队伍绕了半条街。',
    options: (e) => [
      `排队领（折价 +${yuan(e.amount ?? 0)}；排了一整天，下个交易日没空：不能买也不能卖）`,
      '不领（鸡蛋不值几个钱，什么都不变）',
    ],
    prepare: ({ state, month }) => (realOnly(state) && month < 12 ? { amount: Math.round((state.account * fx('free_eggs', 'pct')) / 100) } : null),
    resolve(c, option) {
      if (option !== 0) return '你绕开了长队。回头看一眼，大爷大妈们提着鸡蛋笑得很开心。';
      c.addAccount(c.event.amount ?? 0);
      c.skipNextDay();
      return `你排了三个钟头，领到一盒鸡蛋和一份礼包，折合 ${yuan(c.event.amount ?? 0)}。回到家天都黑了，行情没顾上看。`;
    },
  },
  // ---------------------------------------------------------------- 消息面（政策、传闻、辟谣），只给情报或小钱，不改涨跌
  ...NEWS_EVENTS,
];

/** 事件卡上一个选项：≤8 字的按钮 + 一个大数字（代价或收益；tone 决定颜色）。 */
export interface EventPick {
  label: string;
  big?: string;
  tone?: 'gain' | 'cost' | 'plain';
}

/** 事件卡的短版：一行情景（≤20 字）+ 两个选项。长句（正文、选项原文）留在悬停详情里。 */
export interface EventBrief {
  brief(e: Readonly<EventState>, s: Readonly<GameState>): string;
  picks(e: Readonly<EventState>, s: Readonly<GameState>): [EventPick, EventPick];
}

const cost = (v: number): EventPick['big'] => formatMoney(-Math.abs(v));
const gain = (v: number): EventPick['big'] => formatMoney(Math.abs(v), { sign: true });

export const EVENT_BRIEF: Readonly<Record<string, EventBrief>> = {
  cousin: {
    brief: (e) => `表哥发来一只过山车股：${stockName(e.stockId)}`,
    picks: () => [{ label: '买下', big: `${Math.round(fx('cousin', 'acc') * 100)}%准`, tone: 'plain' }, { label: '不买' }],
  },
  livestream: {
    brief: (e) => `小诸葛直播：${themeName(e.theme)}还能冲！`,
    picks: (_e, s) => [
      s.real ? { label: '跟', big: `+${fx('livestream', 'realBonus')}%`, tone: 'gain' } : { label: '跟', big: `热度+${fx('livestream', 'dH')}`, tone: 'gain' },
      { label: '不跟' },
    ],
  },
  lottery_party: {
    brief: () => '公司年会抽红包',
    picks: () => [{ label: '上台抽奖', big: `+${fx('lottery_party', 'min')}~${fx('lottery_party', 'max')}%`, tone: 'gain' }, { label: '让给实习生' }],
  },
  course: {
    brief: () => '限时特价课，学完随机送你一招',
    picks: (e) => [{ label: '买课', big: cost(e.amount ?? 0), tone: 'cost' }, { label: '拒绝' }],
  },
  lottery: {
    brief: () => `彩票奖池很大，中了账户+${fx('lottery', 'prize')}%`,
    picks: (e) => [{ label: '买一注', big: cost(e.amount ?? 0), tone: 'cost' }, { label: '不买' }],
  },
  bonus: {
    brief: () => '公司发年终奖了！',
    picks: (e) => [{ label: '收下', big: gain(e.amount ?? 0), tone: 'gain' }, { label: '婉拒' }],
  },
  landlord: {
    brief: () => '房东：下个月房租涨一点哈',
    picks: (e) => [
      { label: '答应', big: `房租×${fx('landlord', 'billMult')}`, tone: 'cost' },
      { label: '搬家', big: cost(e.amount ?? 0), tone: 'cost' },
    ],
  },
  classmate_loan: {
    brief: (e) => `室友借钱，说${e.month + 2}月初连本带利还`,
    picks: (e) => [{ label: '借给他', big: cost(e.amount ?? 0), tone: 'cost' }, { label: '不借' }],
  },
  side_hustle: {
    brief: () => '朋友拉你去夜市摆摊卖烤肠',
    picks: (e) => [{ label: '入伙', big: cost(e.amount ?? 0), tone: 'cost' }, { label: '不去' }],
  },
  cat_keyboard: {
    brief: (e) => `猫踩键盘，下单了：${stockName(e.stockId)}`,
    picks: () => [{ label: '留着' }, { label: '撤单' }],
  },
  red_packet: {
    brief: () => '收割机发了个拼手气红包',
    picks: () => [{ label: '抢！', big: '碰手气', tone: 'plain' }, { label: '不抢' }],
  },
  quant_trial: {
    brief: () => '炒股软件请你免费试用一个月',
    picks: (e) => [{ label: '试用', big: `续费${formatMoney(e.amount ?? 0)}`, tone: 'cost' }, { label: '不用' }],
  },
  blind_box: {
    brief: () => '楼下开了家炒股盲盒店',
    picks: (e) => [{ label: '抽一个', big: cost(e.amount ?? 0), tone: 'cost' }, { label: '不抽' }],
  },
  fund_manager: {
    brief: () => `理财经理：一个月稳赚+${fx('fund_manager', 'ret')}%`,
    picks: (e) => [{ label: '买', big: cost(e.amount ?? 0), tone: 'cost' }, { label: '不买' }],
  },
  overtime: {
    brief: () => '老板：周末加个班，三倍工资',
    picks: (e) => [{ label: '加班', big: gain(e.amount ?? 0), tone: 'gain' }, { label: '拒绝' }],
  },
  bank_manager: {
    brief: (e) => `银行经理上门：押${COLLATERALS.find((d) => d.id === e.collateral)?.name ?? '东西'}借钱`,
    picks: (e) => [{ label: '押了借钱', big: gain(e.amount ?? 0), tone: 'plain' }, { label: '不借' }],
  },
  bear_live: {
    brief: () => '墨镜大V送你押跌体验卡',
    picks: () => [{ label: '收下', big: `${fx('bear_live', 'months')}个月`, tone: 'plain' }, { label: '不要' }],
  },
  mother_in_law: {
    brief: () => '丈母娘查岗：东西押出去了？',
    picks: (e) => [
      { label: '发红包', big: cost(e.amount ?? 0), tone: 'cost' },
      { label: '老实交代', big: `账单+${Math.round((fx('mother_in_law', 'billMult') - 1) * 100)}%`, tone: 'cost' },
    ],
  },
  parents_call: {
    brief: () => '爸妈来电：钱够用吗？',
    picks: () => [{ label: '报喜' }, { label: '说实话', big: '免利息', tone: 'gain' }],
  },
  salary_advance: {
    brief: () => '先拿一笔钱，下个月多还一截',
    picks: (e) => [{ label: '预支', big: gain(e.amount ?? 0), tone: 'gain' }, { label: '不预支' }],
  },
  old_trader: {
    brief: () => '能白学一招，但下个交易日没空',
    picks: () => [{ label: '陪他聊', big: '学一招', tone: 'plain' }, { label: '婉拒' }],
  },
  invest_group: {
    brief: () => '同事拉你进群，多一条小道消息',
    picks: (e) => [{ label: '进群', big: '多条消息', tone: 'plain' }, { label: '不进', big: gain(e.amount ?? 0), tone: 'gain' }],
  },
  broker_tea: {
    brief: () => '券商经理请喝茶，递来一份单子',
    picks: (e) => [{ label: '喝茶', big: cost(e.amount ?? 0), tone: 'cost' }, { label: '不喝' }],
  },
  show_off: {
    brief: () => '朋友圈晒收益，赚点赞也招人请客',
    picks: (e) => [{ label: '晒', big: gain(e.amount ?? 0), tone: 'gain' }, { label: '不晒' }],
  },
  free_eggs: {
    brief: () => '营业部送鸡蛋，排队要一整天',
    picks: (e) => [{ label: '排队领', big: gain(e.amount ?? 0), tone: 'gain' }, { label: '不领' }],
  },
  policy_talk: {
    brief: (e) => `吹风会点名「${themeName(e.theme)}」`,
    picks: (e) => [{ label: '看解读', big: itemName(e.itemId), tone: 'plain' }, { label: '不看' }],
  },
  merger_rumor: {
    brief: (e) => `群里传「${themeName(e.theme)}」有公司要被收购`,
    picks: (e) => [{ label: '打听', big: itemName(e.itemId), tone: 'plain' }, { label: '不信' }],
  },
  debunk: {
    brief: () => '收割机的大消息被辟谣了',
    picks: (e) => [{ label: '记账', big: itemName(e.itemId), tone: 'plain' }, { label: '算了' }],
  },
  stamp_tax: {
    brief: () => '半夜传言：明早降印花税',
    picks: (e) => [{ label: '熬夜等', big: itemName(e.itemId), tone: 'plain' }, { label: '睡觉' }],
  },
  tv_analyst: {
    brief: (e) => `股评嘉宾拍桌讲「${themeName(e.theme)}」`,
    picks: (e) => [{ label: '记热线', big: itemName(e.itemId), tone: 'plain' }, { label: '换台' }],
  },
  fake_insider: {
    brief: () => '有人拉你进收费「内幕群」',
    picks: (e) => [{ label: '举报', big: gain(e.amount ?? 0), tone: 'gain' }, { label: '拉黑' }],
  },
  rate_rumor: {
    brief: () => '银行朋友：最近可能要降息',
    picks: (e) => [{ label: '请吃饭', big: gain(e.amount ?? 0), tone: 'gain' }, { label: '不了' }],
  },
  clarify: {
    brief: () => '公司澄清公告，顺便办开放日',
    picks: (e) => [{ label: '去开放日', big: gain(e.amount ?? 0), tone: 'gain' }, { label: '不去' }],
  },
};

/** 盲盒能开出的道具：还没有的，去掉对当前人设没用的。 */
function blindPool(s: Readonly<GameState>): string[] {
  const banned = new Set(PERSONAS.find((p) => p.id === s.persona)?.bannedItems ?? []);
  return ITEMS.filter((d) => !s.items.includes(d.id) && !banned.has(d.id) && (!d.ext || !!s.ext) && (!d.realOnly || realOnly(s))).map((d) => d.id);
}
