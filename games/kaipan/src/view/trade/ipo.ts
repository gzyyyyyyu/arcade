import type Phaser from 'phaser';
import {
  SIZE_LABEL,
  formatMoney,
  holdingBase,
  sizeUnits,
  themeById,
  unitsWord,
  validate,
  type Action,
  type BuySize,
  type GameState,
  type IpoOffer,
} from '../../core/index.ts';
import { COLOR, TYPE } from '../theme.ts';
import { addGlyph } from '../ui/art.ts';
import { Button } from '../ui/button.ts';
import { Dialog, dialogW } from '../ui/dialog.ts';
import { addText } from '../ui/text.ts';

/**
 * 打新（docs/design.md 第 18 节）的申购面板：三档（试一口 / 半仓 / 重仓），每档写抽中率和冻结多少现金，
 * 点一档就申购（和「买多少」同一个做法）。钱数、份数、抽中率都从规则层的数来，这里只管画。
 */

const SIZES: readonly BuySize[] = ['taste', 'half', 'heavy'];

/** 离出签还有几天的说法：0 今天 / 1 明天 / 2 后天 / 其他「N 天后」。 */
export function dayWord(n: number): string {
  return ['今天', '明天', '后天'][n] ?? `${n} 天后`;
}

/** 横条和面板上的一句：「后天出签」。 */
export function drawWord(s: Pick<GameState, 'dayIndex'>, offer: IpoOffer): string {
  return `${dayWord(Math.max(0, offer.drawDay - s.dayIndex))}出签`;
}

/** 这一档冻结多少现金（和卡片上的份数同一个算法：账户 × 份数 ÷ 总份数）。 */
export function frozenMoney(s: GameState, size: BuySize): number {
  return Math.round((s.account * sizeUnits(s, size)) / holdingBase(s));
}

export class IpoPanel extends Dialog {
  constructor(scene: Phaser.Scene, s: GameState, offer: IpoOffer, onPick: (a: Action) => void) {
    // 竖屏版屏窄：框跟屏宽，三个键各约 100 宽，下面两句说明各折成两行，框高一截
    const W = dialogW(scene, 560);
    const H = W < 560 ? 390 : 330;
    super(scene, W, H, `抽新股：${offer.name}`);
    this.spaceCloses = true;
    // 题材、几天出签
    this.inner.add(addGlyph(scene, 40, 84, 'star', 24));
    this.inner.add(addText(scene, 62, 84, `${themeById(offer.theme).name} · 新股 · ${drawWord(s, offer)}`, { size: TYPE.label + 1, bold: true, color: COLOR.accentDark, originY: 0.5 }));
    let done = false;
    SIZES.forEach((size, i) => {
      const bw = Math.min(160, Math.floor((W - 60 - 28) / 3));
      const x = 30 + i * (bw + 14);
      const err = validate(s, { type: 'subscribe', size });
      const units = sizeUnits(s, size);
      const b = new Button(scene, x, 110, {
        width: bw,
        height: 110,
        label: SIZE_LABEL[size],
        subLabel: `抽中率 ${Math.round((offer.odds[size] ?? 0) * 100)}%`,
        variant: size === 'heavy' ? 'primary' : 'buy',
        fontSize: TYPE.title + 2,
        hotkey: `${i + 1}`,
        sound: null,
        onClick: () => {
          // 连点只算一次：点下去就先标记，面板淡出的 140 毫秒里再点也不再发
          if (done) return;
          done = true;
          this.close();
          onPick({ type: 'subscribe', size });
        },
      });
      const ft = addText(scene, bw / 2, 92, units > 0 ? `冻结 ${formatMoney(frozenMoney(s, size))}` : '现金不够', { size: bw < 120 ? TYPE.label : TYPE.label + 1, num: true, color: COLOR.white, originX: 0.5, originY: 0.5 });
      // 竖屏版键窄：金额不截，放不下就省掉「冻结」两个字（下面的说明讲了冻结）
      if (units > 0 && ft.width > bw - 10) ft.setText(formatMoney(frozenMoney(s, size)));
      b.add(ft);
      b.setEnabled(err === null);
      b.onDenied(() => err);
      b.tooltip(() => ({ title: `抽新股 · ${SIZE_LABEL[size]}`, body: `冻结 ${unitsWord(units)}的现金，到出签那天收盘。抽中只配 1 份新股，剩下的现金退回；没抽中，现金原样退回。` }));
      this.inner.add(b);
      this.named[`ipo:${size}`] = b;
    });
    const t1 = addText(scene, 30, 240, '多冻结只提高抽中率，抽中了都只配 1 份：钱冻得越多，白白闲置得越多。', { size: TYPE.label, color: COLOR.muted, wrap: W - 60, lineSpacing: 4 });
    this.inner.add(t1);
    this.inner.add(addText(scene, 30, Math.max(284, t1.y + t1.height + 12), '申购占一个空格；冻结期间不涨不跌，也不能卖。', { size: TYPE.label, color: COLOR.muted, wrap: W - 60 }));
  }
}
