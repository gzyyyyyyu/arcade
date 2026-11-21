import Phaser from 'phaser';
import { FEEL_LABEL, buyError, feelOf, type GameState, type RecView, canShortNow } from '../../core/index.ts';
import { buyKey } from '../labels.ts';
import { ROLE_TERM, ROLE_WORD, termTip } from '../glossary.ts';
import { COLOR, FS, THEME_COLOR, signColor, textOn } from '../theme.ts';
import { addGlyph, addImage, addPill, addSlice } from '../ui/art.ts';
import { Button } from '../ui/button.ts';
import { addSpark, type Spark } from '../ui/spark.ts';
import { StockGuy } from '../ui/stockGuy.ts';
import { addText, fitWidth } from '../ui/text.ts';
import { bindTooltip } from '../ui/tooltip.ts';
import { shortLine } from './chatFluff.ts';
import { openStockDetail } from './detail.ts';
import { clickSuppressed } from './dragGeo.ts';
import { preCount, stockMoves, streakOf, sumMoves, vsMarket } from './tape.ts';
import { streakText, vsLabel, SX, SW, BODY_Y, BODY_H, CX, CW, REC_H, REC_H_FLAT, REC_H_MINI } from './chatConsts.ts';
import { avatar, recordTag } from './chatBubbles.ts';
import type { ChatView3 } from './chat.ts';

/** 推荐卡上「买入」按钮的状态 */
type RecAction = 'buy' | 'replace' | null;

/** 推荐卡能做什么：直接买入（有空格）、换仓（满仓但能替换）、不能买（给原因）。 */
export function recAction(s: GameState, r: RecView): { action: RecAction; reason: string | null } {
  if (r.taken) return { action: null, reason: '今天已经买了这只' };
  if (!r.error) return { action: 'buy', reason: null };
  const replaceable = s.slots.some((_, i) => buyError(s, r.index, i) === null);
  if (replaceable && s.slots.every((h) => h !== null)) return { action: 'replace', reason: null };
  return { action: null, reason: r.error };
}

/** 手机横屏的「推荐」页：推荐卡从上往下排，放得下用大卡，放不下压扁。 */
export function layoutRecs(v: ChatView3, s: GameState, recs: readonly RecView[], minRecH: number): void {
  const gap = 4;
  const room = BODY_H - 6;
  const h = [REC_H, REC_H_FLAT, REC_H_MINI].find((rh) => rh >= minRecH && recs.length * (rh + gap) <= room) ?? minRecH;
  let y = BODY_Y + 4;
  for (const r of recs) {
    y = addRec(v, s, r, y, h) + gap;
    const node = v.recNodes[v.recNodes.length - 1];
    if (node) {
      v.content.remove(node);
      v.recLayer.add(node);
    }
  }
  if (recs.length === 0) {
    const t = addText(v.scene, SX + SW / 2, BODY_Y + 40, '今天没有推荐', { size: 13, color: COLOR.muted, originX: 0.5 });
    v.recLayer.add(t);
  }
  v.recHeight = h;
}

export function addRec(v: ChatView3, s: GameState, r: RecView, y: number, h = REC_H): number {
  const sc = v.scene;
  const root = sc.add.container(0, 0);
  const flat = h < REC_H;
  const card = addSlice(sc, CX, y, CW, h, 'bubble_card');
  // 顶条跟随风口颜色（素材自带的是橙色）：盖一层风口色，再补回分隔线
  const tc = THEME_COLOR[r.stock.theme];
  const on = textOn(tc);
  const bandH = flat ? 15 : 16;
  const band = sc.add.graphics();
  band.fillStyle(tc, 1).fillRoundedRect(CX + 4, y + 4, CW - 8, bandH, { tl: 13, tr: 13, bl: 0, br: 0 });
  band.fillStyle(COLOR.ink, 1).fillRect(CX + 3, y + 3 + bandH, CW - 6, 2.4);
  const who = r.friend ? `${r.friend.name}推荐` : '行情软件推荐';
  // 顶条：左「风口名 热度 NN · 要火」，右「★ 今日推荐」（0.5.1 找回）。0.36.1：带上风口栏同款体感词，教程说「挑要火的风口」时不用再去左边对照
  const by = y + 4 + bandH / 2;
  const th = s.themes[r.stock.theme];
  const heat = Math.round(th?.heat ?? 0);
  const head = addText(sc, CX + 14, by, r.stock.themeName, { size: FS.xs, bold: true, color: on, originY: 0.5 });
  const heatT = addText(sc, head.x + head.width + 6, by, `热度${heat} · ${FEEL_LABEL[feelOf(th?.history ?? [])]}`, { size: FS.xs, bold: true, num: true, color: on, originY: 0.5 });
  const today = addText(sc, CX + CW - 12, by, '今日推荐', { size: FS.xs, bold: true, color: on, originX: 1, originY: 0.5 });
  const star = addGlyph(sc, today.x - today.width - 8, by, 'star', 11);
  root.add([card, band, head, heatT, today, star]);

  // 小人（带表情；动画开着时隔几秒蹦一下，像在招手）+ 放大镜：点卡身看详情
  const gx = flat ? 22 : 30;
  const tx = flat ? 44 : 60;
  const guyY = flat ? y + h - 5 : y + 78;
  const guy = new StockGuy(sc, CX + gx, guyY, r.stock.id, r.stock.face, flat ? 32 : 48, { idle: v.idle });
  if (v.idle) {
    const tw = sc.tweens.add({ targets: guy, y: guyY - (flat ? 3 : 5), duration: 170, yoyo: true, repeat: -1, repeatDelay: 2600 + r.index * 900, delay: 1200 + r.index * 500, ease: 'Quad.easeOut' });
    guy.once(Phaser.GameObjects.Events.DESTROY, () => tw.remove());
  }
  const glass = addGlyph(sc, CX + gx + (flat ? 14 : 20), y + bandH + (flat ? 12 : 14), 'magnifier', flat ? 13 : 16);
  root.add([guy, glass]);

  // 第一行：名字 + 角色图标 + 角色名（危险股红字）
  const right = CX + CW - (flat ? 66 : 70);
  const row1 = y + bandH + (flat ? 6 : 8);
  const name = addText(sc, CX + tx, row1, r.stock.name, { size: flat ? 13 : 14, bold: true });
  const roleIcon = addImage(sc, name.x + name.width + 10, row1 + 9, `role:${r.stock.role}`, flat ? 15 : 17);
  const roleT = addText(sc, roleIcon.x + 10, row1 + 9, ROLE_WORD[r.stock.role], { size: FS.xs, bold: true, color: r.stock.role === 'st' ? COLOR.danger : COLOR.muted, originY: 0.5 });
  if (roleT.x + roleT.width > right) roleT.setVisible(false);
  for (const o of [roleIcon, roleT]) {
    o.setInteractive();
    bindTooltip(o, () => ({ x: roleIcon.x - 9, y: row1, w: 20 + (roleT.visible ? roleT.width : 0), h: 20 }), () => termTip(ROLE_TERM[r.stock.role]));
  }
  root.add([name, roleIcon, roleT]);

  // 5 天涨跌柱（出现时从左往右画出来）+ 连涨连跌 + 比大环境强弱
  const moves = stockMoves(s, r.stock.id, 5);
  const streak = streakOf(moves);
  const vs = vsLabel(vsMarket(s, r.stock.id, 5));
  const row2 = flat ? row1 : row1 + 19;
  let x2 = flat ? Math.max(roleIcon.x + 12, roleT.visible ? roleT.x + roleT.width + 6 : 0) : CX + tx;
  const sparkW = flat ? 28 : 36;
  let spark: Spark | null = null;
  let streakT: Phaser.GameObjects.Text | null = null;
  if (moves.length > 0 && x2 + sparkW <= right) {
    spark = addSpark(sc, x2, row2 + 2, sparkW, flat ? 14 : 16, moves, { kind: 'bars', capMin: 3, bg: COLOR.paperHi, bgAlpha: 0.9, pre: preCount(s, moves.length) });
    root.add(spark.g);
    x2 += sparkW + 7;
    streakT = addText(sc, x2, row2 + 10, flat ? streakText(streak).replace('天', '') : streakText(streak), { size: FS.xs, bold: true, color: streak === 0 ? COLOR.muted : signColor(streak), originY: 0.5 });
    if (streakT.x + streakT.width > right) {
      streakT.destroy();
      streakT = null;
    } else {
      root.add(streakT);
      x2 += streakT.width + 6;
    }
  }
  // 强弱签：第二行放不下就放到推荐人那一行（扁卡放不下就只在悬停里）
  const vsTag = (x: number, yy: number): number => {
    if (!vs) return 0;
    const t = addText(sc, 0, yy + 9, vs.word, { size: FS.xs, bold: true, color: vs.sign === 0 ? COLOR.muted : signColor(vs.sign), originY: 0.5 });
    const w = t.width + 10;
    if (x + w > right) {
      t.destroy();
      return 0;
    }
    const bg = addPill(sc, x, yy + 1, w, 16, vs.sign > 0 ? 0xffe3dc : vs.sign < 0 ? 0xdcf2e3 : 0xece3ea, false);
    t.setX(x + 5);
    root.add([bg, t]);
    return w;
  };
  let vsShown = vsTag(x2, row2) > 0;

  // 推荐人：小头像 + 名字 + 战绩（扁卡省掉，只在理由前放小头像）
  const row3 = row2 + 19;
  if (!flat) {
    let x3 = CX + tx;
    if (r.friend) {
      const av = avatar(v, r.friend.id, x3, row3, 'normal', 18);
      const fn = addText(sc, x3 + 22, row3 + 1, r.friend.name, { size: FS.xs, bold: true, color: COLOR.ink });
      const tag = recordTag(v, r.friend.record, fn.x + fn.width + 3, row3 + 1);
      root.add([av, fn, tag.icon, tag.text]);
      x3 = tag.text.x + tag.text.width + 6;
    } else {
      const fn = addText(sc, x3, row3 + 1, '行情软件', { size: FS.xs, bold: true, color: COLOR.muted });
      root.add(fn);
      x3 += fn.width + 6;
    }
    if (!vsShown) vsShown = vsTag(x3, row3) > 0;
  }

  // 理由：一句不超过 12 个字的短话（不是硬截断），全文在悬停提示里
  const ry = flat ? y + h - 22 : y + h - 24;
  const rx = flat ? CX + tx : CX + 10;
  // 押跌按钮在时右边那列一直到卡底，理由条让开
  const rw = flat || (!r.taken && canShortNow(s)) ? right - rx : CW - 20;
  let reasonX = rx;
  if (flat && r.friend) {
    root.add(avatar(v, r.friend.id, rx, ry, 'normal', 16));
    reasonX += 20;
  } else if (!flat) {
    // 理由条：淡黄底 + 左边一道风口色竖条（像引用）
    const strip = sc.add.rectangle(rx, ry - 2, rw, 21, 0xffefc9, 1).setOrigin(0, 0).setRounded(8).setStrokeStyle(1.5, COLOR.edge, 1);
    const q = sc.add.rectangle(rx + 6, ry + 2, 4, 13, tc, 1).setOrigin(0, 0).setRounded(2);
    root.add([strip, q]);
    reasonX += 16;
  }
  const reason = addText(sc, reasonX, ry + (flat ? 1 : 0), `${r.liar ? '【反话】' : ''}${shortLine(r.text, r.stock.name, 12)}`, { size: flat ? 11 : 12, color: COLOR.ink });
  fitWidth(reason, rx + rw - reasonX - 4, 1);
  root.add(reason);

  // 卡身（按钮以外）：悬停看全文和数据，点一下打开股票详情
  const hit = sc.add.rectangle(CX, y, CW - 72, h, 0xffffff, 0.001).setOrigin(0, 0).setInteractive({ useHandCursor: true });
  const sum = moves.length > 0 ? sumMoves(moves) : null;
  bindTooltip(hit, () => ({ x: CX, y, w: CW - 72, h }), () => ({
    title: `${r.stock.name}（${r.stock.themeName} · ${ROLE_WORD[r.stock.role]}）`,
    body: `${who}：${r.text}${r.liar ? '\n本周群友说的全是反话：这条推荐多半要跌。' : ''}\n${sum === null ? '' : `最近 ${moves.length} 天合计 ${sum >= 0 ? '+' : ''}${sum.toFixed(1)}%，${streakText(streak)}`}${vs ? `，${vs.word}` : ''}\n点卡片看详情。`,
  }));
  hit.on(Phaser.Input.Events.POINTER_UP, (p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
    // 右键不看详情（留给取消）；拖拽松手那下也不算点击
    if (p.button !== 0 || clickSuppressed(performance.now())) return;
    ev.stopPropagation();
    openStockDetail(sc, v.state, r.stock.id);
  });
  root.addAt(hit, 1);
  if (spark) v.recSparks.set(root, spark);
  const act = recAction(s, r);
  // 0.4 C：押跌解锁后，买入按钮下面多一个"押跌"（唱空群友推荐的这只，押跌按钮更醒目）
  const canShort = !r.taken && canShortNow(s);
  const hintShort = canShort && !!r.short;
  // 按钮列：扁卡顶条下面放得下两颗小按钮
  const bx = CX + CW - (flat ? 62 : 66);
  const bw = flat ? 56 : 60;
  const buyY = canShort ? y + (flat ? 20 : 24) : y + (flat ? 25 : 32);
  const buyH = canShort ? (flat ? 22 : 26) : flat ? 30 : 36;
  const shortY = y + (flat ? 44 : 54);
  const shortH = flat ? 21 : 26;
  const btn = new Button(sc, bx, buyY, {
    width: bw,
    height: buyH,
    // 押跌拿下的写"已押跌"，不写"已买"
    label: r.taken ? (s.slots.some((h) => h?.stockId === r.stock.id && h.short) ? '已押' : '已买') : act.action === 'replace' ? '换掉' : '买入',
    variant: hintShort ? 'default' : 'buy',
    fontSize: canShort ? 13 : 14,
    hotkey: canShort ? undefined : buyKey(r.index),
    sound: null,
    onClick: () => v.onBuy(r.index),
  });
  btn.setEnabled(act.action !== null);
  btn.onDenied(() => act.reason);
  btn.tooltip(() =>
    act.action === 'replace'
      ? { title: '格子满了', body: '点一下，再选要换掉哪一格（那只会被卖掉）。今天买的那只不能换。' }
      : act.reason
        ? { title: '现在不能买', body: act.reason }
        : null,
  );
  root.add(btn);
  if (canShort) {
    const sb = new Button(sc, bx, shortY, {
      width: bw,
      height: shortH,
      label: '押跌',
      variant: 'danger',
      fontSize: 13,
      sound: null,
      onClick: () => v.onShort?.(r.index),
    });
    sb.setEnabled(act.action !== null);
    sb.onDenied(() => act.reason);
    sb.tooltip(() => ({ title: hintShort ? `${r.friend?.name ?? '群友'}建议押跌` : '押跌', body: '押它跌：它跌你赚，它涨你亏；它涨停那天会被轧，亏得最狠。' }));
    if (hintShort) {
      // 唱空的群友推荐的：押跌按钮套一圈金边，更醒目
      root.add(sc.add.rectangle(bx - 3, shortY - 3, bw + 6, shortH + 6, COLOR.gold, 1).setOrigin(0, 0).setRounded(9));
    }
    root.add(sb);
    v.shortButtons[r.index] = sb;
  }
  v.content.add(root);
  v.recNodes.push(root);
  v.buttons[r.index] = btn;
  v.recRects[r.index] = { x: CX, y, w: CW, h };
  return y + h;
}
