/**
 * 开局的几个弹层（docs/stake.md 2.1）：先选"娱乐 / 实盘"，娱乐再选难度、实盘再选档位。
 * 每档一张卡，写三件事（仓库 docs/balance.md 第 5 节，四个游戏一致）：电脑多强（1–4 颗星）、一场约多久、一场最多赢 / 最多输。
 * 按钮都用 body.setData('btn:<名字>', 按钮) 登记，标题页的 controls() 据此给冒烟坐标。
 */
import type Phaser from 'phaser';
import { SOLO_LEVELS, type SoloLevel } from '../../variants/guandan/ai/venue.ts';
import { ROOM_DEALS, SOLO_DEALS, TIERS, TIER_IDS, pointValue, type TierId } from '../../variants/guandan/stake/index.ts';
import { LENGTH_CARD, LEVEL_CARD, STAKE_TEXT, TIER_CARD, TIER_NAME, fmtChips, fmtWan, stakeError, stars, RETRY_LABEL } from '../common/stake-text.ts';
import { buyinStake, loadStake, type StakeSession } from '../guandan/stake.ts';
import { strayStake } from '../stake-stray.ts';
import { fetchWallet, refundStray, type StakeReply, type WalletView } from '../common/stake-api.ts';
import { COLOR, TYPE, minHit, phoneType } from '../common/theme.ts';
import { Button, fitWidth, modal, segmented, text, worldW, type Modal } from './kit.ts';
import type { GameLength } from '../store.ts';

function reg(m: Modal, key: string, b: Button): Button {
  m.body.add(b);
  m.body.setData(`btn:${key}`, b);
  return b;
}

/**
 * 娱乐选难度：上面一排选局长（短局打到 10 / 完整打过 A，0.25.0），下面新手 / 普通 / 高手每档一行（电脑多强、一局多久、适合谁）；
 * 当前设置的那档描金边，时间那行跟着局长换。给了 onMatch 右下角还有"快速匹配"（0.26.0：和真人打，娱乐好友房的规则，打过 A）
 */
export function openLevelPicker(
  scene: Phaser.Scene,
  current: SoloLevel,
  length: GameLength,
  onPick: (level: SoloLevel, length: GameLength) => void,
  onMatch?: () => void,
): Modal {
  // 三行的行距至少 minHit() + 2（手机横屏上"开始"的点按区要 44 CSS 像素，568×320 要 100），多出来的高度加在弹窗上；电脑上还是 92、500 高。
  // 竖屏的主页（世界宽 720）：每档一张三行的卡（名字和星、时间、适合谁），行距 150，弹窗 680 宽
  const narrow = worldW(scene) < 1100;
  const P = narrow ? Math.max(150, minHit() + 2) : Math.max(92, minHit() + 2);
  const MW = narrow ? 680 : 900;
  const H = narrow ? 300 + 3 * P : 500 + 3 * (P - 92);
  const T = -H / 2;
  const RW = MW - 60;
  const m = modal(scene, MW, H);
  const b = m.body;
  const phone = phoneType();
  let len = length;
  b.add(text(scene, 0, T + 45, '选难度', { size: TYPE.title, bold: true, color: COLOR.redDark }));
  const lens: GameLength[] = ['short', 'full'];
  const times: Phaser.GameObjects.Text[] = [];
  // 手机上字托底到 12 像素，整句会压到右边"适合谁"那段：只留"一局约 N 分钟"
  const timeOf = (lv: SoloLevel): string => {
    const t = len === 'short' ? LEVEL_CARD[lv].short : LEVEL_CARD[lv].time;
    return phone ? t.split('，')[0]! : t;
  };
  const segW = narrow ? 290 : 330;
  const seg = segmented(
    scene,
    -segW / 2,
    T + 100,
    lens.map((l) => ({ label: `${LENGTH_CARD[l].name} · ${LENGTH_CARD[l].goal}`, value: l })),
    len,
    (v) => {
      len = v as GameLength;
      SOLO_LEVELS.forEach((lv, i) => times[i]!.setText(timeOf(lv)));
    },
    segW,
    // 手机上 60 只合 27–36 CSS 像素：拉到 minHit()；下沿最低 T + 144（不压到第一行"开始"的点按区），再高就往上伸进标题字
    Math.max(60, minHit()),
    Math.min(0, 44 - Math.max(60, minHit()) / 2),
  );
  b.add(seg);
  m.body.setData('seg:length', seg);
  const rowH = narrow ? P - 12 : 80;
  const firstY = narrow ? T + 170 + P / 2 : T + 190 + (P - 92) / 2;
  SOLO_LEVELS.forEach((lv, i) => {
    const y = firstY + i * P;
    const c = LEVEL_CARD[lv];
    const g = scene.add.graphics();
    g.fillStyle(i % 2 ? 0xf3e4c4 : 0xf8ecd2, 1).fillRoundedRect(-RW / 2, y - rowH / 2, RW, rowH, 12);
    if (lv === current) g.lineStyle(3, COLOR.gold, 1).strokeRoundedRect(-RW / 2, y - rowH / 2, RW, rowH, 12);
    b.add(g);
    const x0 = -RW / 2 + 30;
    if (narrow) {
      // 竖屏：名字和星一行，时间一行，适合谁一行；"开始"在右边居中
      b.add(text(scene, x0, y - rowH / 2 + 30, c.name, { size: TYPE.title, bold: true, color: COLOR.redDark, ox: 0 }));
      b.add(text(scene, x0 + 110, y - rowH / 2 + 30, `电脑 ${stars(c.stars)}`, { size: TYPE.label, bold: true, color: COLOR.goldDark, ox: 0 }));
      const t = text(scene, x0, y - rowH / 2 + 66, timeOf(lv), { size: TYPE.small, color: COLOR.muted, ox: 0 });
      times.push(t);
      b.add(t);
      b.add(fitWidth(text(scene, x0, y - rowH / 2 + 102, c.who, { size: TYPE.label, color: COLOR.ink, ox: 0 }), RW - 230));
    } else {
      b.add(text(scene, -390, y, c.name, { size: TYPE.title, bold: true, color: COLOR.redDark, ox: 0 }));
      b.add(text(scene, -250, y - 15, `电脑 ${stars(c.stars)}`, { size: TYPE.label, bold: true, color: COLOR.goldDark, ox: 0 }));
      const t = text(scene, -250, y + 17, timeOf(lv), { size: TYPE.small, color: COLOR.muted, ox: 0 });
      times.push(t);
      b.add(t);
      b.add(text(scene, -30, y, c.who, { size: TYPE.label, color: COLOR.ink, ox: 0, wrap: 250, align: 'left' }));
    }
    // 点按区高 P - 2：上下两行、上面的局长切换都不互相压着
    reg(m, `level:${lv}`, new Button(scene, RW / 2 - 90, y, 130, 52, '开始', 'red', () => {
      m.close();
      onPick(lv, len);
    }, 'play')).setHit(Math.max(130, minHit()), Math.min(P - 2, Math.max(52, minHit())));
  });
  // 竖屏：说明一行在上、快速匹配在下居中；横屏并排
  const by = H / 2 - (narrow ? 50 : 40);
  const tipY = narrow ? (onMatch ? by - 70 : by) : by;
  b.add(fitWidth(text(scene, onMatch && !narrow ? -120 : 0, tipY, '随时能在设置里换难度；局长下次开局还是这个', { size: TYPE.small, color: COLOR.muted }), RW));
  if (onMatch) {
    // 点按区 minHit() 高，居中会压到第三行"开始"的点按区：往下挪
    const mh = Math.max(52, minHit());
    const top = Math.max(by - mh / 2, firstY + 2 * P + P / 2);
    reg(m, 'match', new Button(scene, narrow ? 0 : 300, by, 220, 52, '快速匹配', 'blue', () => {
      m.close();
      onMatch();
    }, 'invite')).setHit(Math.max(220, minHit()), mh, top + mh / 2 - by);
  }
  return m;
}

/**
 * 选档位：每档一份多少、电脑多强、一场多久、最多赢 / 最多输；钱包不够的灰掉，钱包连不上整个灰掉。进场成功交给 onStarted。
 * 给了 onMatch 右上角多一个"和电脑 / 快速匹配"（0.26.0）：切到匹配时每档的按钮变"匹配"、时间那行换成好友房实盘的副数，点了交给 onMatch（带入由房间开打时办）
 */
/**
 * 选档位里随玩法变的部分（牌馆：掼蛋、斗地主同一个选档页）：一场几副、每分多少、怎么带入、哪一份算"别处开的单机"
 */
export interface TierFlow<S> {
  soloDeals: number;
  roomDeals: number;
  /** 单机一场大概多久（按各自的时长模拟：掼蛋约 8 分钟，斗地主约 5 分钟，docs/stake.md） */
  time: string;
  pointValue(tier: TierId): number;
  buyin(tier: TierId): Promise<{ ok: true; ses: S } | { ok: false; error: string; wallet?: WalletView }>;
  stray(w: WalletView): { ref: string; solo: boolean } | null;
  refundStray(ref: string): Promise<StakeReply>;
}

export const GUANDAN_FLOW: TierFlow<StakeSession> = {
  soloDeals: SOLO_DEALS,
  roomDeals: ROOM_DEALS,
  time: TIER_CARD.time,
  pointValue,
  buyin: (tier) => buyinStake(tier),
  stray: (w) => strayStake(w, loadStake()),
  refundStray: (ref) => refundStray(ref),
};

export function openTierPicker<S = StakeSession>(
  scene: Phaser.Scene,
  onStarted: (ses: S) => void,
  onMatch?: (tier: TierId) => void,
  flow: TierFlow<S> = GUANDAN_FLOW as unknown as TierFlow<S>,
): Modal {
  // 四档的行距至少 minHit() + 2（手机横屏上"进场"的点按区要 44 CSS 像素），多出来的高度加在弹窗上；电脑上还是 78、600 高。
  // 竖屏的主页（世界宽 720）：弹窗 680 宽，"和电脑 / 快速匹配"单独一行，每档一张三行的卡（名字和星、一份和每分、最多输赢和时间）
  const narrow = worldW(scene) < 1100;
  const P = narrow ? Math.max(132, minHit() + 2) : Math.max(78, minHit() + 2);
  const MW = narrow ? 680 : 940;
  const RW = MW - 80;
  const head = narrow ? (onMatch ? 236 : 160) : 160 + (P - 78) / 2;
  const H = narrow ? head + 4 * P + 150 : 600 + 3 * (P - 78);
  const T = -H / 2;
  const y0 = narrow ? T + head + P / 2 : T + head;
  const m = modal(scene, MW, H);
  const b = m.body;
  b.add(text(scene, 0, T + 50, '选档位', { size: TYPE.title, bold: true, color: COLOR.redDark }));
  // 有匹配时钱包靠左、右边放切换（竖屏切换在下一行，钱包照样靠左）
  const balance = text(scene, onMatch ? -RW / 2 + 30 : 0, T + 92, '正在看钱包…', { size: TYPE.body, bold: true, color: COLOR.ink, ...(onMatch ? { ox: 0 } : {}) });
  b.add(balance);
  let matching = false;
  const times: Phaser.GameObjects.Text[] = [];
  // 手机上 568 宽放不下"约 8 分钟"，写成"约 8 分"，免得被截成省略号
  const soloTime = phoneType() ? flow.time.replace(/分钟$/, '分') : flow.time;
  const timeOf = (): string => (matching ? `${flow.roomDeals} 副 · ${STAKE_TEXT.matchWho}` : `${flow.soloDeals} 副 · ${soloTime}`);
  if (onMatch) {
    const seg = segmented(
      scene,
      // 右边留出关闭键的点按区（弹窗右上角，手机上约 100 见方）；竖屏单独一行居中
      narrow ? -150 : 185,
      narrow ? T + 160 : T + 92,
      [{ label: '和电脑', value: 'solo' }, { label: '快速匹配', value: 'match' }],
      'solo',
      (v) => {
        matching = v === 'match';
        for (const t of TIER_IDS) buttons[t]!.label.setText(matching ? '匹配' : '进场');
        times.forEach((t) => fitWidth(t.setText(timeOf()), t.getData('maxW') as number));
      },
      150,
      Math.max(60, minHit()),
      // 下面紧挨第一档的"进场"（点按区 minHit() 高）：手机上往上伸进标题字，不和它压着
      Math.min(0, y0 - Math.max(52, minHit()) / 2 - 1 - (T + 92 + Math.max(60, minHit()) / 2)),
    );
    b.add(seg);
    m.body.setData('seg:mode', seg);
  }
  const buttons: Partial<Record<TierId, Button>> = {};
  const rowH = narrow ? P - 12 : 70;
  TIER_IDS.forEach((tier, i) => {
    const y = y0 + i * P;
    const g = scene.add.graphics();
    g.fillStyle(i % 2 ? 0xf3e4c4 : 0xf8ecd2, 1).fillRoundedRect(-RW / 2, y - rowH / 2, RW, rowH, 12);
    b.add(g);
    const x0 = -RW / 2 + 30;
    // 竖屏三行：名字和星；一份、每分；最多输赢、时间
    const row = (k: number): number => y - rowH / 2 + 28 + k * 36;
    b.add(text(scene, x0, narrow ? row(0) : y, TIER_NAME[tier], { size: TYPE.title, bold: true, color: COLOR.redDark, ox: 0 }));
    // 实盘一场最多输一份、最多赢一份（结回 0 到两份，docs/stake.md 1.1）
    const share = fmtChips(TIERS[tier]);
    // 实盘的钱数不截断（截成"最多输 20…"正好把能输多少藏掉了）。赢输都是一份，第二行合成"最多输赢"，
    // 手机字托底到 12 像素后，豪华档"一份 200,000 · 每分 10,000"在 568×320 上会压到右边一列的"电脑"：手机上这一行整万写成"20万"（不丢精度），第二行照旧写全数
    const pv = flow.pointValue(tier);
    const line1 = phoneType() ? `一份 ${fmtWan(TIERS[tier])} · 每分 ${fmtWan(pv)}` : `一份 ${share} · 每分 ${fmtChips(pv)}`;
    b.add(text(scene, narrow ? x0 : -270, narrow ? row(1) : y - 14, line1, { size: TYPE.label, color: COLOR.ink, ox: 0 }));
    const cap = text(scene, narrow ? x0 : -270, narrow ? row(2) : y + 16, `最多输赢 ${narrow ? fmtWan(TIERS[tier]) : share}`, { size: TYPE.small, color: COLOR.muted, ox: 0 });
    b.add(cap);
    b.add(text(scene, narrow ? x0 + 120 : 60, narrow ? row(0) : y - 14, `电脑 ${stars(TIER_CARD[tier].stars)}`, { size: TYPE.label, bold: true, color: COLOR.goldDark, ox: 0 }));
    // 时间那行可以截（手机上放不下时）
    // 竖屏时间接在"最多输赢"后面，留一个字宽
    const tx = narrow ? x0 + cap.width + 24 : 60;
    const maxW = narrow ? RW / 2 - 170 - tx : 195;
    const time = fitWidth(text(scene, tx, narrow ? row(2) : y + 16, timeOf(), { size: TYPE.small, color: COLOR.muted, ox: 0 }).setData('maxW', maxW), maxW);
    times.push(time);
    b.add(time);
    const btn = reg(m, `tier:${tier}`, new Button(scene, RW / 2 - 90, y, 150, 52, '进场', 'red', () => {
      if (matching && onMatch) {
        m.close();
        onMatch(tier);
      } else void enter(tier);
    }));
    btn.setEnabled(false);
    buttons[tier] = btn;
  });
  const note = text(scene, 0, H / 2 - 114, '', { size: TYPE.label, bold: true, color: COLOR.redDark, wrap: RW - 40 });
  b.add(note);
  b.add(text(scene, 0, H / 2 - 38, STAKE_TEXT.noCash, { size: TYPE.small, color: COLOR.muted }));
  let stray: Button | null = null;
  let retry: Button | null = null;
  let busy = false;

  const retryWallet = async (): Promise<void> => {
    if (!retry || retry.loading) return;
    const btn = retry;
    btn.setLoading(true);
    balance.setText('正在看钱包…');
    const w = await fetchWallet();
    if (m.root.scene) show(w);
  };

  const show = (w: WalletView | null, msg = ''): void => {
    stray?.destroy();
    stray = null;
    retry?.destroy();
    retry = null;
    if (!w) {
      balance.setText('钱包：连不上');
      note.setText(msg || STAKE_TEXT.walletDown);
      for (const t of TIER_IDS) buttons[t]!.setEnabled(false);
      // 断网统一配"重试"，放在"钱包：连不上"右边（和右侧切换之间有空，底部红字不挤）；重试期间转圈、不能连点
      retry = reg(m, 'tierRetry', new Button(scene, narrow ? RW / 2 - 90 : onMatch ? -100 : 140, T + 92, 120, 52, RETRY_LABEL, 'wood', () => void retryWallet()));
      return;
    }
    balance.setText(`钱包 ${fmtChips(w.balance)}`);
    // 别的设备上开的单机那一份不挡开新的（平台 0.9.5 起能同时有好几份），给个原样退回的办法；好友房的不归这里管
    const other = flow.stray(w);
    for (const t of TIER_IDS) buttons[t]!.setEnabled(!busy && w.balance >= TIERS[t]);
    if (other?.solo) {
      note.setText(msg || STAKE_TEXT.elsewhere);
      stray = reg(m, 'stray', new Button(scene, 0, H / 2 - 68, 300, 50, '原样退回那一份', 'wood', () => void giveBack(other.ref)));
    } else if (msg) note.setText(msg);
    else note.setText(w.balance < TIERS.mid ? STAKE_TEXT.lowFunds : '');
  };

  const enter = async (tier: TierId): Promise<void> => {
    if (busy) return;
    busy = true;
    for (const t of TIER_IDS) buttons[t]!.setEnabled(false);
    note.setText('正在进场…');
    const r = await flow.buyin(tier);
    busy = false;
    if (!m.root.scene) return;
    if (r.ok) {
      m.close();
      onStarted(r.ses);
      return;
    }
    show(r.wallet ?? (await fetchWallet()), stakeError(r.error));
  };

  const giveBack = async (ref: string): Promise<void> => {
    if (busy) return;
    busy = true;
    stray?.setEnabled(false);
    note.setText('正在退回…');
    const r = await flow.refundStray(ref);
    busy = false;
    if (!m.root.scene) return;
    const msg = r.ok ? '那一份已经原样退回钱包' : r.error === 'no_stake' || r.error === 'expired' ? '那一份已经退回过了' : stakeError(r.error);
    show(r.wallet ?? (await fetchWallet()), msg);
  };

  void fetchWallet().then((w) => {
    if (m.root.scene) show(w);
  });
  return m;
}
