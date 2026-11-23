/**
 * 开局准备里花铜钱的三页（DESIGN 3.8a）：锦囊（下一局带）、外观（买下永久有）、换筹码。只画，状态由 main.ts 给，点击回给 prep.ts。
 */
import { carryExcept, CHIPS_NO_CASH, COIN_EXCHANGE, KIT_IDS, KITS, LOOK_IDS, LOOKS, type KitId, type LookId, type LookSlot } from '../../content/meta.ts';
import type { XcLogRow } from '../../platform/save.ts';

/** 换筹码页的状态：quota 为 null 是拿不到今天的额度（没登录、连不上），按 COIN_EXCHANGE.dailyCap 写 */
export interface ExchangeView {
  /** 这里没有钱包（单独部署）：整页说明换不了 */
  unavailable: boolean;
  quota: { left: number; cap: number } | null;
  /** 有没结的（铜钱先扣着、在重发） */
  pending: number;
  /** 正在换（按钮先灰着） */
  busy: boolean;
  /** 上一次的结果，一句话 */
  msg: string;
}

export interface ShopState {
  coins: number;
  kits: KitId[];
  looks: LookId[];
  wear: Partial<Record<LookSlot, LookId>>;
  xc: ExchangeView;
  /** 本机最近几笔兑换（新的在前） */
  xcLog: XcLogRow[];
}

const coin = (n: number): string => `<span class="yx-coin"></span>${n.toLocaleString('zh-CN')}`;

export function kitsHtml(s: ShopState): string {
  const total = s.kits.reduce((a, k) => a + KITS[k].cost, 0);
  return (
    `<div class="yx-pnote">下一局带上，开局时扣铜钱、只管这一局；娱乐守夜、夜探能带（${carryExcept('kits')}不带）。现在选了 ${s.kits.length} 个，开局扣 ${total.toLocaleString('zh-CN')}</div>` +
    '<div class="yx-pgrid yx-pkits">' +
    KIT_IDS.map((id) => {
      const k = KITS[id];
      const on = s.kits.includes(id);
      const dis = !on && s.coins < total + k.cost;
      return `<button type="button" class="yx-pcard yx-pkit${on ? ' on' : ''}" data-a="kit" data-id="${id}"${dis ? ' aria-disabled="true"' : ''}><b>${k.name}</b><p>${k.text}</p><em>${on ? '带上了' : coin(k.cost)}</em></button>`;
    }).join('') +
    '</div>'
  );
}

export function looksHtml(s: ShopState): string {
  const slot = (sl: LookSlot, title: string): string =>
    `<div class="yx-pnote">${title}</div><div class="yx-pgrid yx-pskins">` +
    LOOK_IDS.filter((id) => LOOKS[id].slot === sl)
      .map((id) => {
        const l = LOOKS[id];
        const own = s.looks.includes(id);
        const on = s.wear[sl] === id;
        const dis = !own && s.coins < l.cost;
        const act = own ? (on ? '穿着' : '穿上') : coin(l.cost);
        return `<button type="button" class="yx-pcard yx-pskin${on ? ' on' : ''}" data-a="${own ? 'wear' : 'look'}" data-id="${id}"${dis ? ' aria-disabled="true"' : ''}><i class="yx-lk yx-lk-${sl}" style="--lc:${l.color};--le:${l.edge}"></i><b>${l.name}</b><em>${act}</em></button>`;
      })
      .join('') +
    '</div>';
  return slot('frame', '头像框：对局左上角的头像换个框；穿着的再点一下脱下') + slot('aura', '脚下光圈：对局里脚下一圈光，走动时留一道淡淡的光痕');
}

export function exchangeHtml(s: ShopState): string {
  const x = s.xc;
  const rate = COIN_EXCHANGE.rate;
  const fmt = (n: number): string => n.toLocaleString('zh-CN');
  if (x.unavailable) return '<div class="yx-pnote">这里没有平台钱包，换不了筹码。</div>';
  const closed = x.quota?.cap === 0;
  const full = !closed && x.quota?.left === 0;
  const left = x.quota ? x.quota.left : COIN_EXCHANGE.dailyCap;
  const head = closed ? '今天兑换关了' : full ? '今天换满了，明天再来' : x.quota ? `今天还能换 ${fmt(x.quota.left)} 筹码` : `每天最多换 ${fmt(COIN_EXCHANGE.dailyCap)} 筹码`;
  const btns = COIN_EXCHANGE.steps
    .map((n) => {
      const dis = x.busy || closed || full || n > left || s.coins < n * rate;
      return `<button type="button" class="yx-pcard yx-pxc" data-a="xc" data-id="${n}"${dis ? ' aria-disabled="true"' : ''}><b>${fmt(n)} 筹码</b><em>${coin(n * rate)}</em></button>`;
    })
    .join('');
  // 换满：今天剩下的和铜钱够换的取小；换不了写原因
  const max = closed || full ? 0 : Math.min(left, Math.floor(s.coins / rate));
  const why = closed ? '今天兑换关了' : full ? '今天换满了' : '铜钱不够';
  const all = max > 0
    ? `<button type="button" class="yx-pcard yx-pxc yx-pxcall" data-a="xc" data-id="${max}"${x.busy ? ' aria-disabled="true"' : ''}><b>换满今天剩下的 ${fmt(max)} 筹码</b><em>${coin(max * rate)}</em></button>`
    : `<button type="button" class="yx-pcard yx-pxc yx-pxcall" aria-disabled="true"><b>换满今天剩下的</b><em>${why}</em></button>`;
  const used = x.quota && !closed ? `<b>今天换了 ${fmt(x.quota.cap - x.quota.left)} / ${fmt(x.quota.cap)} 筹码</b>` : '';
  const rows = s.xcLog
    .map((r) => `<li><span>${r.at === null ? '更早' : stamp(r.at)}</span><b>+${fmt(r.chips)} 筹码</b><span>${coin(r.coins)}${r.pending ? ' · 还没到账' : ''}</span></li>`)
    .join('');
  return (
    `<div class="yx-pnote">${rate} 铜钱兑 1 筹码；铜钱是在夜巡里玩出来的，不能花钱买。筹码进平台钱包，各个游戏通用。每天额度按北京时间算。${CHIPS_NO_CASH}。</div>` +
    `<div class="yx-pxchead"><b>${head}</b>${x.pending ? `<span>有 ${x.pending} 笔还没到账，铜钱先扣着，会自动重发</span>` : ''}</div>` +
    `<div class="yx-pgrid yx-pxcs">${btns}${all}</div>` +
    (x.msg ? `<div class="yx-pxcmsg" role="status">${x.msg}</div>` : '') +
    `<div class="yx-pxclog">${used}${rows ? `<ul>${rows}</ul>` : '<p>这台设备上还没换过</p>'}</div>`
  );
}

/** 兑换时间：北京时间「月-日 时:分」 */
function stamp(ms: number): string {
  const t = new Date(ms + 8 * 3600_000);
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}`;
}
