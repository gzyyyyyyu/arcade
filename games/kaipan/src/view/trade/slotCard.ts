import Phaser from 'phaser';
import { formatPoints, themeById, unitsWord, type GameState, type HoldingCard } from '../../core/index.ts';
import { hasArt, roleKey, stockKey } from '../assets.ts';
import { dayWord as ipoDayWord } from './ipo.ts';
import { boardsText, holdText, sellKey, stText, todayText } from '../labels.ts';
import type { Rect } from '../rect.ts';
import { COLOR, FS, PHONE, PORTRAIT, THEME_COLOR, signColor, textOn } from '../theme.ts';
import { addImage, addPill, addSlice } from '../ui/art.ts';
import { Button, HIT_MIN, touchHit } from '../ui/button.ts';
import { StockGuy } from '../ui/stockGuy.ts';
import { addText, setColor, fitWidth } from '../ui/text.ts';
import { pctArrow } from '../labels.ts';
import { bindTooltip } from '../ui/tooltip.ts';
import { ROLE_TERM, ROLE_WORD, term, termTip } from '../glossary.ts';
import { SHORT_COLOR, chipStack, sunglasses } from './ext.ts';
import { addGlyph } from '../ui/art.ts';
import { addSpark, type Spark } from '../ui/spark.ts';
import { openStockDetail } from './detail.ts';
import { clickSuppressed } from './dragGeo.ts';
import { preCount, stockMoves, streakOf, vsMarket, vsWord } from './tape.ts';
import { frozenKeyOf, type FrozenInfo, type PickMode, type SlotExt } from './holdingsShared.ts';
import { COMPACT_SLOTS } from './layout.ts';

/** 一张持仓卡：股票小人卡或「现金」空格。 */
export class SlotCard {
  readonly slot: number;
  readonly rect: Rect;
  readonly root: Phaser.GameObjects.Container;
  private readonly scene: Phaser.Scene;
  stockId: string | null;
  /** 0.5.1：放大镜（看详情）的位置 */
  magCenter: { x: number; y: number } | null = null;
  guy: StockGuy | null = null;
  private today: Phaser.GameObjects.Text | null = null;
  private hold: Phaser.GameObjects.Text | null = null;
  private boards: Phaser.GameObjects.Container | null = null;
  private st: Phaser.GameObjects.Container | null = null;
  sell: Button | null = null;
  /** 有仓位玩法时「卖出」旁边的小按钮：加仓 / 减一半的菜单 */
  more: Button | null = null;
  pick: Button | null = null;
  shownToday = 0;

  /** 0.4 C 仓位玩法（null = 0.3 的玩法） */
  private readonly ext: SlotExt | null;
  /** 押跌（卡片反色、小人倒着站） */
  readonly short: boolean;
  private units: Phaser.GameObjects.Container | null = null;
  /** 0.19.0 手机上很窄的卡（SE 上约 104 宽） */
  private tiny = false;
  /** 左边 ST / 低吸签的右边缘（连涨签让开它） */
  private stRight = 0;

  /** 打新：这一格是申购中（冻结）的卡，不是持仓：不能拖、不能卖 */
  frozen = false;
  /** 申购中卡的内容签（出签倒数变了就重画） */
  frozenKey = '';
  private nameText: Phaser.GameObjects.Text | null = null;
  private newTag: Phaser.GameObjects.Container | null = null;
  private newTagKey = '';

  constructor(scene: Phaser.Scene, slot: number, rect: Rect, card: HoldingCard | null, idle: boolean, onSell: (slot: number) => void, busy = false, onInspect?: (slot: number) => void, ext: SlotExt | null = null, state: GameState | null = null, onMore?: (slot: number) => void, onMenu?: (slot: number) => void, frozen: FrozenInfo | null = null) {
    this.state = state;
    this.ext = ext;
    this.short = !!card?.short;
    this.scene = scene;
    this.slot = slot;
    this.rect = rect;
    this.stockId = card?.id ?? null;
    const { x, y, w, h } = rect;
    this.root = scene.add.container(0, 0);
    if (!card && frozen) {
      this.frozen = true;
      this.frozenKey = frozenKeyOf(frozen);
      this.drawFrozen(frozen);
      return;
    }
    if (!card) {
      // 空格画成纸垫（HoldingsView.drawPurse），这里只留点击区和悬停说明，选格子模式照样能点。
      // 推荐卡一屏只出现一处（右栏），空格里不再放推荐位
      const hit = scene.add.rectangle(x, y, w, h, 0xffffff, 0.001).setOrigin(0, 0);
      bindTooltip(hit, () => rect, () => ({ title: '空格 = 现金', body: ext ? `空格是现金，不涨不跌。手里还有 ${ext.cash} 份现金，可以从${PORTRAIT ? '下面' : '右边'}的推荐里买一只。` : `空格是现金，不涨不跌，可以从${PORTRAIT ? '下面' : '右边'}的推荐里买一只。` }));
      this.root.add(hit);
      return;
    }
    if (COMPACT_SLOTS) {
      this.drawCompact(card, idle, onSell, busy, onInspect, ext, onMore, onMenu);
      return;
    }
    const small = w < 150;
    // 0.19.0 手机世界变小以后，SE 上一张卡只有约 104 宽（844×390 上约 129）：小人、走势框收窄，
    // 「跑赢 / 跑输」挪进卡身的悬停说明，累计那条只写数字（「累计」两个字在悬停里）
    const tiny = PHONE && w < 120;
    this.tiny = tiny;
    const frame = addSlice(scene, x, y, w, h, 'card_holding');
    // 押跌：卡片翻成冷色（和普通卡的暖色反过来）
    const flip = this.short ? scene.add.rectangle(x + 5, y + 5, w - 10, h - 10, 0xcdd5f3).setOrigin(0, 0).setRounded(10) : null;
    const tc = THEME_COLOR[card.theme];
    // 第一行：风口签（风口色）+ 角色图标和名字
    const tagText = addText(scene, 0, y + 20, card.themeName, { size: small ? 11 : 12, bold: true, color: textOn(tc), originX: 0.5, originY: 0.5 });
    const tagW = tagText.width + 16;
    const tag = addPill(scene, x + 10, y + 10, tagW, 20, tc);
    tagText.setX(x + 10 + tagW / 2);
    const role = addImage(scene, x + w - 20, y + 20, roleKey(card.role), 22);
    role.setInteractive();
    bindTooltip(role, () => ({ x: x + w - 32, y: y + 8, w: 26, h: 26 }), () => termTip(ROLE_TERM[card.role]));
    const roomForRole = w - 10 - tagW - 10 - 30;
    const roleWord = addText(scene, x + w - 33, y + 20, ROLE_WORD[card.role], { size: FS.xs, bold: true, color: card.role === 'st' ? COLOR.danger : COLOR.muted, originX: 1, originY: 0.5 });
    if (roleWord.width > roomForRole) roleWord.setVisible(false);
    tag.setInteractive();
    bindTooltip(tag, () => ({ x: x + 10, y: y + 10, w: tagW, h: 20 }), () => termTip('theme', `这只属于「${card.themeName}」这个风口。`));
    // 第二行左：风口热度（数字 + 小条）；ST / 低吸时换成提示签（setPills）
    this.heatNode = scene.add.container(0, 0);
    // 小人（偏左）+ 右边的迷你走势框
    // 仓位玩法：左边有一摞筹码，小人缩一点、往右挪，不和筹码挤
    const size = tiny ? 52 : ext ? 60 : small ? 60 : 72;
    const gx = x + (tiny ? 30 : ext ? 72 : small ? 46 : 54);
    // 手机：卡矮了 8（214），名字、涨跌、累计、卖出整体上移
    const dy = PHONE ? -8 : 0;
    this.guy = new StockGuy(scene, gx, this.short ? y + 60 : y + 124 + dy, card.id, card.face, size, { idle });
    if (this.short) this.guy.setScale(1, -1);
    const bx = x + w - (tiny ? 46 : ext ? 56 : small ? 50 : 62);
    const bw = tiny ? 40 : ext ? 50 : small ? 44 : 56;
    // 0.5.2：框里不再写"近10天"（小字把半个框占了、柱子挤得看不清；卡身的悬停说明里有最近几天）；柱高按这只自己的涨跌幅缩放
    const chartBg = scene.add.rectangle(bx, y + 56, bw, 46, COLOR.screen, 0.9).setOrigin(0, 0).setRounded(7);
    this.spark = addSpark(scene, bx + 5, y + 61, bw - 10, 36, [], { kind: 'bars', capMin: 3, axis: true });
    this.vs = addText(scene, bx + bw / 2, y + 112, '', { size: 12, bold: true, originX: 0.5, originY: 0.5 }).setVisible(!PHONE);
    this.vs.setInteractive();
    bindTooltip(this.vs, () => ({ x: bx, y: y + 104, w: bw, h: 16 }), () => ({ title: '和大环境比', body: '同样这几天，这只的涨跌减去大环境的涨跌：跑赢是比大环境强，跑输是比大环境弱，差不到 1% 算持平。' }));
    const body = scene.add.rectangle(x + 4, y + 52, w - 8, h - 92, 0xffffff, 0.001).setOrigin(0, 0);
    bindTooltip(body, () => ({ x, y: y + 52, w, h: h - 92 }), () => this.tip(card));
    // 点小人：在窗户那块看今天的拆解条
    body.setInteractive({ useHandCursor: true });
    // 左键看拆解；右键弹加仓 / 卖出菜单；刚拖完那下松手不算点击（见 dragGeo 的点击抑制）
    const onCardUp = (p: Phaser.Input.Pointer): void => {
      if (clickSuppressed(performance.now())) return;
      if (p.button === 2) onMenu?.(slot);
      else if (p.button === 0) onInspect?.(slot);
    };
    body.on(Phaser.Input.Events.POINTER_UP, onCardUp);
    // 整张卡的右键点击区垫在最下面：点在名字、小人、标签这些没有自己点击区的地方也算在这张卡上
    const cardHit = scene.add.rectangle(x, y, w, h, 0xffffff, 0.001).setOrigin(0, 0).setInteractive();
    cardHit.on(Phaser.Input.Events.POINTER_UP, (p: Phaser.Input.Pointer) => {
      if (p.button === 2 && !clickSuppressed(performance.now())) onMenu?.(slot);
    });
    // 放大镜：股票详情卡（大走势图、连涨连跌、风口热度、比大环境）
    const magIcon = addGlyph(scene, bx + bw - 1, y + 57, 'magnifier', 20);
    // 图标只有 20：透明点击区垫到 32（电脑，docs/ui.md），触屏上撑到 HIT_MIN
    const mag = touchHit(scene, bx + bw - 1, y + 57, 32, 32);
    this.magCenter = { x: bx + bw - 1, y: y + 57 };
    mag.on(Phaser.Input.Events.POINTER_UP, (p: Phaser.Input.Pointer) => {
      if (p.button !== 0 || clickSuppressed(performance.now())) return;
      if (this.state) openStockDetail(scene, this.state, card.id);
    });
    bindTooltip(mag, () => ({ x: bx + bw - 14, y: y + 46, w: 24, h: 24 }), () => ({ title: '看详情', body: '走势图、连涨连跌、风口热度、比大环境强还是弱。' }));
    const name = fitWidth(addText(scene, x + w / 2, y + 126 + dy, card.name, { size: small ? 13 : 15, bold: true, color: this.short ? SHORT_COLOR : COLOR.ink, originX: 0.5 }), w - 8);
    this.nameText = name;
    this.today = addText(scene, x + w / 2, y + 143 + (PHONE ? -11 : 0), '', { size: small ? 19 : 22, bold: true, num: true, originX: 0.5 });
    // 持有盈亏色块
    // 手机：卖出键加高到 34，累计条往上挪 4、矮 2，两者不叠；卖出的点击区只往下撑（往上会盖住卡片，点卡片看拆解时误卖）
    const holdY = PHONE ? y + 158 : y + 170;
    const holdH = PHONE ? 16 : 18;
    this.holdBg = scene.add.rectangle(x + 10, holdY, w - 20, holdH, COLOR.muted, 0.16).setOrigin(0, 0).setRounded(holdH / 2);
    this.hold = addText(scene, x + w / 2, holdY + holdH / 2, '', { size: 12, bold: true, num: true, color: COLOR.muted, originX: 0.5, originY: 0.5 });
    const sellH = PHONE ? 34 : 26;
    // 卖出一步到位：「卖出」直接全卖（押跌的写「不押了」，一样是一步收手）；有仓位玩法时右边多一个小按钮「加减」，点开加仓 / 减一半的菜单
    const moreW = ext ? (tiny ? 38 : PHONE ? 44 : 38) : 0;
    const gap = ext ? (tiny ? 3 : 4) : 0;
    const sellW = w - 20 - moreW - gap;
    // 手机上最窄的卡（SE 五格，约 104 宽）「卖出」只剩 40 多宽：三个字的标签换成两个字的，放不下会溢出
    this.sellNarrow = sellW < 56;
    this.sell = new Button(scene, x + 10, y + h - sellH - 5, { width: sellW, height: sellH, label: this.sellWord(true), variant: 'danger', fontSize: 14, hotkey: sellKey(slot), hitPad: { top: 0, bottom: 14 }, onClick: () => onSell(slot) });
    if (ext) {
      this.more = new Button(scene, x + w - 10 - moreW, y + h - sellH - 5, { width: moreW, height: sellH, label: '加减', fontSize: 13, hitPad: { top: 0, bottom: 14 }, onClick: () => onMore?.(slot) });
      this.more.tooltip(() => ({ title: '加仓 / 减一半', body: '再买一份，或者先卖一半落袋。在卡上点右键也能打开。' }));
      this.more.onDenied(() => (this.sellBlocked === 'busy' ? '今天在加班，顾不上炒股，不能买也不能卖' : null));
    }
    this.sell.tooltip(() =>
      this.sell?.isEnabled() === false && this.sellBlocked === 'busy'
        ? { title: '今天在加班', body: '顾不上炒股，今天不能买也不能卖，只能直接开盘。' }
        : this.sell?.isEnabled() === false && this.sellBlocked === 't1'
          ? termTip('t1')
          : this.sell?.isEnabled()
            ? { title: this.short ? '不押了' : '卖出', body: ext ? '一步全部卖掉。想加仓或只卖一半，点旁边的「加减」，或在卡上点右键。也可以把卡拖出持仓区。' : '把这只全部卖掉。也可以把卡拖出持仓区。' }
            : null,
    );
    this.sell.onDenied(() => (this.sellBlocked === 'busy' ? '今天在加班，顾不上炒股，不能买也不能卖' : this.sellBlocked === 't1' ? '今天买的，明天才能卖' : null));
    this.root.add([frame, ...(flip ? [flip] : []), cardHit, tag, tagText, roleWord, role, this.heatNode, chartBg, this.spark.g, this.vs, body, this.guy, magIcon, mag, name, this.today, this.holdBg, this.hold, this.sell, ...(this.more ? [this.more] : [])]);
    this.update(card, true, busy);
    this.spark.play(500, !idle);
  }

  /** 竖屏版的矮卡（0.33.0）：第一行的签从这里往右排、到这里为止（放大镜在右上角） */
  private compact = false;
  private row1X = 0;
  private row1Right = 0;

  /**
   * 竖屏版的矮卡（0.33.0，约 124–190 宽、94–103 高）：第一行风口签（押跌写「押跌」）、仓位份数、连板签，右上角放大镜；
   * 左边小人，右边名字和涨跌（宽卡再写累计）；最下面「卖出」「加减」。走势框、热度、跑赢跑输、ST 签都在悬停和详情里。
   */
  private drawCompact(card: HoldingCard, idle: boolean, onSell: (slot: number) => void, busy: boolean, onInspect?: (slot: number) => void, ext: SlotExt | null = null, onMore?: (slot: number) => void, onMenu?: (slot: number) => void): void {
    const { scene, slot } = this;
    const { x, y, w, h } = this.rect;
    this.compact = true;
    this.tiny = true;
    const frame = addSlice(scene, x, y, w, h, 'card_holding');
    const flip = this.short ? scene.add.rectangle(x + 5, y + 5, w - 10, h - 10, 0xcdd5f3).setOrigin(0, 0).setRounded(10) : null;
    const tc = this.short ? SHORT_COLOR : THEME_COLOR[card.theme];
    const tagText = addText(scene, 0, y + 15, this.short ? '押跌' : card.themeName, { size: 11, bold: true, color: textOn(tc), originX: 0.5, originY: 0.5 });
    const tagW = tagText.width + 14;
    const tag = addPill(scene, x + 8, y + 6, tagW, 18, tc);
    tagText.setX(x + 8 + tagW / 2);
    tag.setInteractive();
    bindTooltip(tag, () => ({ x: x + 8, y: y + 6, w: tagW, h: 18 }), () => (this.short ? { title: '押跌', body: '押它跌：它跌你赚，它涨你亏。它涨停那天会被轧，亏得最狠。' } : termTip('theme', `这只属于「${card.themeName}」这个风口。`)));
    this.row1X = x + 8 + tagW + 4;
    this.row1Right = x + w - 32;
    // 卖出键 30 高：点击区往下撑 6（两行之间隔 8，下面一行的卡、标签页都不压），其余往上撑到 HIT_MIN（360 宽上 50）
    const sellH = 30;
    const sellY = y + h - sellH - 4;
    const pad = { top: Math.max(11, HIT_MIN - sellH - 6), bottom: 6 };
    const magX = x + w - 16;
    const magY = y + 15;
    const magIcon = addGlyph(scene, magX, magY, 'magnifier', 18);
    // 点击区贴着卡片右上角往里长（不往上、往右伸到隔壁卡和上一排的「加减」里）
    const magS = Math.max(40, HIT_MIN);
    const mag = scene.add.rectangle(x + w - magS, y, magS, Math.min(magS, sellY - pad.top - y), 0xffffff, 0.001).setOrigin(0, 0).setInteractive({ useHandCursor: true });
    this.magCenter = { x: magX, y: magY };
    mag.on(Phaser.Input.Events.POINTER_UP, (p: Phaser.Input.Pointer) => {
      if (p.button !== 0 || clickSuppressed(performance.now())) return;
      if (this.state) openStockDetail(scene, this.state, card.id);
    });
    bindTooltip(mag, () => ({ x: magX - 14, y: magY - 14, w: 28, h: 28 }), () => ({ title: '看详情', body: '走势图、连涨连跌、风口热度、比大环境强还是弱。' }));
    this.guy = new StockGuy(scene, x + 26, this.short ? y + 26 : sellY - 2, card.id, card.face, 34, { idle });
    if (this.short) this.guy.setScale(1, -1);
    const colX = x + 48;
    const name = fitWidth(addText(scene, colX, y + 24, card.name, { size: 13, bold: true, color: this.short ? SHORT_COLOR : COLOR.ink }), w - 48 - 6);
    this.nameText = name;
    this.today = addText(scene, colX, y + 40, '', { size: 17, bold: true, num: true });
    // 累计：宽卡（2 张一行）写在涨跌右边；窄卡只在悬停里
    this.hold = addText(scene, x + w - 8, y + 50, '', { size: 12, bold: true, num: true, color: COLOR.muted, originX: 1, originY: 0.5 }).setVisible(w >= 170);
    // 点卡身看详情：从卡顶到「卖出」的点击区为止、让开右上角放大镜那一列，高约 55（点击区够 HIT_MIN）
    const bodyH = sellY - pad.top - y;
    const bodyW = w - magS;
    const body = scene.add.rectangle(x, y, bodyW, bodyH, 0xffffff, 0.001).setOrigin(0, 0);
    bindTooltip(body, () => ({ x, y, w: bodyW, h: bodyH }), () => this.tip(card));
    body.setInteractive({ useHandCursor: true });
    body.on(Phaser.Input.Events.POINTER_UP, (p: Phaser.Input.Pointer) => {
      if (clickSuppressed(performance.now())) return;
      if (p.button === 2) onMenu?.(slot);
      else if (p.button === 0) onInspect?.(slot);
    });
    const cardHit = scene.add.rectangle(x, y, w, h, 0xffffff, 0.001).setOrigin(0, 0).setInteractive();
    cardHit.on(Phaser.Input.Events.POINTER_UP, (p: Phaser.Input.Pointer) => {
      if (p.button === 2 && !clickSuppressed(performance.now())) onMenu?.(slot);
    });
    const moreW = ext ? 44 : 0;
    const gap = ext ? 4 : 0;
    const sellW = w - 16 - moreW - gap;
    this.sellNarrow = sellW < 56;
    this.sell = new Button(scene, x + 8, sellY, { width: sellW, height: sellH, label: this.sellWord(true), variant: 'danger', fontSize: 14, hotkey: sellKey(slot), hitPad: pad, hitPadX: { right: 0 }, onClick: () => onSell(slot) });
    if (ext) {
      this.more = new Button(scene, x + w - 8 - moreW, sellY, { width: moreW, height: sellH, label: '加减', fontSize: 13, hitPad: pad, hitPadX: { left: 0 }, onClick: () => onMore?.(slot) });
      this.more.tooltip(() => ({ title: '加仓 / 减一半', body: '再买一份，或者先卖一半落袋。在卡上点右键也能打开。' }));
      this.more.onDenied(() => (this.sellBlocked === 'busy' ? '今天在加班，顾不上炒股，不能买也不能卖' : null));
    }
    this.sell.tooltip(() =>
      this.sell?.isEnabled() === false && this.sellBlocked === 'busy'
        ? { title: '今天在加班', body: '顾不上炒股，今天不能买也不能卖，只能直接开盘。' }
        : this.sell?.isEnabled() === false && this.sellBlocked === 't1'
          ? termTip('t1')
          : this.sell?.isEnabled()
            ? { title: this.short ? '不押了' : '卖出', body: ext ? '一步全部卖掉。想加仓或只卖一半，点旁边的「加减」。也可以把卡拖出持仓区。' : '把这只全部卖掉。也可以把卡拖出持仓区。' }
            : null,
    );
    this.sell.onDenied(() => (this.sellBlocked === 'busy' ? '今天在加班，顾不上炒股，不能买也不能卖' : this.sellBlocked === 't1' ? '今天买的，明天才能卖' : null));
    this.root.add([frame, ...(flip ? [flip] : []), cardHit, body, tag, tagText, this.guy, magIcon, mag, name, this.today, this.hold, this.sell, ...(this.more ? [this.more] : [])]);
    this.update(card, true, busy);
  }

  /**
   * 申购中的卡（打新冻结）：新股形象置灰，写「申购中」和几天出签；整张卡只有悬停说明，没有卖出、没有加减、不能拖。
   * 画法跟持仓卡一个底（card_holding），再盖一层灰，让人一眼分得出它还不是持仓。
   */
  private drawFrozen(f: FrozenInfo): void {
    const { scene } = this;
    const { x, y, w, h } = this.rect;
    if (COMPACT_SLOTS) return this.drawFrozenCompact(f);
    const small = w < 150;
    const frame = addSlice(scene, x, y, w, h, 'card_holding');
    const dim = scene.add.rectangle(x + 5, y + 5, w - 10, h - 10, 0xcfc6b8, 0.75).setOrigin(0, 0).setRounded(10);
    const tc = THEME_COLOR[f.offer.theme];
    const tagText = addText(scene, 0, y + 20, themeById(f.offer.theme).name, { size: small ? 11 : 12, bold: true, color: textOn(tc), originX: 0.5, originY: 0.5 });
    const tagW = tagText.width + 16;
    const tag = addPill(scene, x + 10, y + 10, tagW, 20, tc);
    tagText.setX(x + 10 + tagW / 2);
    const key = stockKey(f.offer.stockId, 'calm');
    const face = hasArt(scene.textures, key) ? addImage(scene, x + w / 2, y + 74, key, small ? 56 : 64).setTint(0x9a9a9a).setAlpha(0.85) : scene.add.rectangle(0, 0, 1, 1, 0xffffff, 0);
    const name = fitWidth(addText(scene, x + w / 2, y + 110, f.offer.name, { size: small ? 13 : 15, bold: true, color: COLOR.muted, originX: 0.5 }), w - 8);
    const word = addText(scene, x + w / 2, y + 134, '申购中', { size: 20, bold: true, color: COLOR.accentDark, originX: 0.5 });
    const when = addText(scene, x + w / 2, y + 164, `${ipoDayWord(f.daysLeft)}出签`, { size: 14, bold: true, color: COLOR.ink, originX: 0.5 });
    const cash = fitWidth(addText(scene, x + w / 2, y + h - 30, `冻结 ${unitsWord(f.units)}`, { size: FS.xs, bold: true, color: COLOR.muted, originX: 0.5 }), w - 12);
    const hit = scene.add.rectangle(x, y, w, h, 0xffffff, 0.001).setOrigin(0, 0).setInteractive();
    bindTooltip(hit, () => this.rect, () => ({ title: `申购中：${f.offer.name}`, body: `冻结了 ${unitsWord(f.units)}的现金，${ipoDayWord(f.daysLeft)}收盘出签。期间不涨不跌，也不能卖。\n中了：配 1 份新股，剩下的现金退回；没中：现金原样退回。` }));
    this.root.add([frame, dim, tag, tagText, face, name, word, when, cash, hit]);
  }

  /** 竖屏矮卡的申购中：左边置灰的新股，右边名字、「申购中」、几天出签、冻结几份 */
  private drawFrozenCompact(f: FrozenInfo): void {
    const { scene } = this;
    const { x, y, w, h } = this.rect;
    const frame = addSlice(scene, x, y, w, h, 'card_holding');
    const dim = scene.add.rectangle(x + 5, y + 5, w - 10, h - 10, 0xcfc6b8, 0.75).setOrigin(0, 0).setRounded(10);
    const tc = THEME_COLOR[f.offer.theme];
    const tagText = addText(scene, 0, y + 15, themeById(f.offer.theme).name, { size: 11, bold: true, color: textOn(tc), originX: 0.5, originY: 0.5 });
    const tagW = tagText.width + 14;
    const tag = addPill(scene, x + 8, y + 6, tagW, 18, tc);
    tagText.setX(x + 8 + tagW / 2);
    const key = stockKey(f.offer.stockId, 'calm');
    const face = hasArt(scene.textures, key) ? addImage(scene, x + 26, y + h / 2 + 8, key, 38).setTint(0x9a9a9a).setAlpha(0.85) : scene.add.rectangle(0, 0, 1, 1, 0xffffff, 0);
    const colX = x + 48;
    const name = fitWidth(addText(scene, colX, y + 26, f.offer.name, { size: 13, bold: true, color: COLOR.muted }), w - 54);
    const word = addText(scene, colX, y + 44, '申购中', { size: 16, bold: true, color: COLOR.accentDark });
    const when = fitWidth(addText(scene, colX, y + 64, `${ipoDayWord(f.daysLeft)}出签 · 冻结 ${unitsWord(f.units)}`, { size: FS.xs, bold: true, color: COLOR.ink }), w - 54);
    const hit = scene.add.rectangle(x, y, w, h, 0xffffff, 0.001).setOrigin(0, 0).setInteractive();
    bindTooltip(hit, () => this.rect, () => ({ title: `申购中：${f.offer.name}`, body: `冻结了 ${unitsWord(f.units)}的现金，${ipoDayWord(f.daysLeft)}收盘出签。期间不涨不跌，也不能卖。\n中了：配 1 份新股，剩下的现金退回；没中：现金原样退回。` }));
    this.root.add([frame, dim, tag, tagText, face, name, word, when, hit]);
  }

  /** 新股角标（上市头两天）：名字旁的小签，「新」、首日涨了写「新 +X%」、跌了写「新 -X%」；null 去掉。 */
  setNewTag(tag: { text: string; fill: number; ink: number } | null): void {
    const key = tag ? `${tag.text}|${tag.fill}` : '';
    if (key === this.newTagKey) return;
    this.newTagKey = key;
    this.newTag?.destroy();
    this.newTag = null;
    const name = this.nameText;
    if (!name) return;
    const { x, w } = this.rect;
    if (this.compact) {
      // 矮卡：名字左对齐，签挂在名字左边（名字往右让）
      name.setX(x + 48);
      if (!tag) return;
      const t = addText(this.scene, 0, 0, tag.text, { size: FS.xs, bold: true, color: tag.ink, originX: 0.5, originY: 0.5 });
      const pw = t.width + 10;
      name.setX(x + 48 + pw + 4);
      fitWidth(name, w - 48 - 6 - pw - 4);
      const pill = addPill(this.scene, x + 48, name.y, pw, 17, tag.fill);
      t.setPosition(x + 48 + pw / 2, name.y + 8);
      this.newTag = this.scene.add.container(0, 0, [pill, t]);
      this.root.add(this.newTag);
      return;
    }
    name.setX(x + w / 2);
    if (!tag) return;
    const t = addText(this.scene, 0, 0, tag.text, { size: FS.xs, bold: true, color: tag.ink, originX: 0.5, originY: 0.5 });
    const pw = t.width + 12;
    // 名字让出一块给签：名字往右挪、必要时缩一点，签贴在名字左边
    fitWidth(name, w - 8 - pw - 4);
    name.setX(x + w / 2 + (pw + 4) / 2);
    const px = name.x - name.width / 2 - pw - 4;
    const pill = addPill(this.scene, px, name.y + 1, pw, 18, tag.fill);
    t.setPosition(px + pw / 2, name.y + 10);
    this.newTag = this.scene.add.container(0, 0, [pill, t]);
    this.root.add(this.newTag);
  }

  private state: GameState | null;
  private spark: Spark | null = null;
  private vs: Phaser.GameObjects.Text | null = null;
  private holdBg: Phaser.GameObjects.Rectangle | null = null;
  private heatNode: Phaser.GameObjects.Container | null = null;
  private streak: Phaser.GameObjects.Container | null = null;

  /** 第二行：左边风口热度（数字 + 小条），右边连涨 / 连跌签。 */
  private setRow2(c: HoldingCard, hideHeat: boolean): void {
    // 竖屏矮卡没有第二行：热度、连涨连跌在悬停和详情里
    if (this.compact) return;
    const { x, y, w } = this.rect;
    const sc = this.scene;
    this.heatNode?.removeAll(true);
    this.streak?.destroy();
    this.streak = null;
    // 先放右边的连涨 / 连跌签，热度小条再用剩下的宽度（窄卡上两者不再叠在一起）
    let right = x + w - 10;
    const moves = this.state ? stockMoves(this.state, c.id, 10) : c.history;
    const n = streakOf(moves);
    // 左边已经有 ST / 低吸签时，连涨签放不下就不放（悬停和详情里有）
    const fitsStreak = (pw: number): boolean => this.st === null || x + w - 10 - pw >= this.stRight + 4;
    if (c.boards <= 0 && Math.abs(n) >= 2) {
      const t = addText(sc, 0, 0, n > 0 ? `连涨${n}天` : `连跌${-n}天`, { size: FS.xs, bold: true, color: COLOR.white, originX: 0.5, originY: 0.5 });
      const pw = t.width + 12;
      if (!fitsStreak(pw)) {
        t.destroy();
        return;
      }
      const pill = addPill(sc, -pw / 2, -10, pw, 20, signColor(n), false);
      this.streak = sc.add.container(x + w - 10 - pw / 2, y + 44, [pill, t]);
      this.root.add(this.streak);
      right -= pw + 6;
    }
    if (this.heatNode && !hideHeat && this.state) {
      const heat = Math.round(this.state.themes[c.theme]?.heat ?? 0);
      const t = addText(sc, x + 12, y + 44, `热${heat}`, { size: 12, bold: true, color: COLOR.ink, originY: 0.5 });
      // 窄卡上热度字和连涨签放不下就只留连涨签（热度在风口页和悬停说明里）
      if (t.x + t.width > right) {
        t.destroy();
        return;
      }
      const bx = t.x + t.width + 4;
      const bw = Math.min(40, right - bx);
      if (bw >= 12) {
        const bg = sc.add.rectangle(bx, y + 41, bw, 7, 0xeadcc8).setOrigin(0, 0).setRounded(3);
        const fg = sc.add.rectangle(bx, y + 41, Math.max(3, (bw * Math.min(100, heat)) / 100), 7, THEME_COLOR[c.theme]).setOrigin(0, 0).setRounded(3);
        this.heatNode.add([t, bg, fg]);
      } else this.heatNode.add(t);
    }
  }

  /** 迷你走势 + 比大环境。 */
  private setSpark(c: HoldingCard): void {
    if (!this.spark || !this.state) return;
    const moves = stockMoves(this.state, c.id, 10);
    this.spark.setPre(preCount(this.state, moves.length)).set(moves);
    const vs = vsWord(vsMarket(this.state, c.id, Math.min(5, moves.length)));
    if (this.vs) {
      // 押跌的卡：股票弱于大环境对你是好事，颜色跟着"对你是赚是亏"走
      const word = vs ? (vs.sign > 0 ? '跑赢' : vs.sign < 0 ? '跑输' : '持平') : '';
      this.vs.setText(word);
      setColor(this.vs, vs ? (vs.sign === 0 ? COLOR.muted : signColor(c.short ? -vs.sign : vs.sign)) : COLOR.muted);
    }
  }

  /** 「卖出」按钮窄到放不下三个字 */
  private sellNarrow = false;

  /** 「卖出」按钮上的字：能点时卖出（押跌的写「不押了」），不能点时写原因；窄按钮用两个字。 */
  private sellWord(can: boolean): string {
    if (can) return this.short && !this.sellNarrow ? '不押了' : '卖出';
    if (this.sellBlocked === 'busy') return this.sellNarrow ? '加班' : '加班中';
    return this.sellNarrow ? '明天' : '明天卖';
  }

  /** 卖出按钮为什么不能点：T+1（今天买的）或加班日 */
  private sellBlocked: 't1' | 'busy' | null = null;

  get todayLabel(): Phaser.GameObjects.Text | null {
    return this.today;
  }

  private tip(c: HoldingCard): { title: string; body: string } {
    // 和走势框同一个来源（含开局前历史），第 1 天也有
    const hist = (this.state ? stockMoves(this.state, c.id, 5) : c.history).map((v) => formatPoints(v)).join(' ');
    const extra = stText(c);
    // 手机上卡上不写「跑赢 / 跑输」，挪到这里
    const vs = PHONE && this.state ? vsWord(vsMarket(this.state, c.id, Math.min(5, stockMoves(this.state, c.id, 10).length))) : null;
    const vsLine = vs ? `\n最近几天比大环境：${vs.sign > 0 ? '跑赢' : vs.sign < 0 ? '跑输' : '持平'}` : '';
    return {
      title: `${c.name}（${c.themeName} · ${ROLE_WORD[c.role]}）`,
      body: `${ROLE_WORD[c.role]}。占账户的 ${Math.round(c.weight * 100)}%，买入以来 ${formatPoints(c.holdRet)}${c.boards > 1 ? `，已经连续涨停 ${c.boards} 天` : ''}\n最近 5 天：${hist || '—'}${vsLine}${c.lowBuy ? `\n${term('lowbuy').word}：${term('lowbuy').explain}` : ''}${extra ? `\n${extra}` : ''}\n点一下，看今天的涨跌是怎么来的`,
    };
  }

  /** 刷新数字与按钮（同一只股票原地更新）。 */
  update(c: HoldingCard, premarket: boolean, busy = false, s: GameState | null = null): void {
    if (s) this.state = s;
    if (!this.today || !this.hold) return;
    this.dayWord = premarket ? '昨天' : '今天';
    // 今天刚买的：还没开过盘、而且（不是因为加班）还不能卖；开局就在手里的持仓没开过盘但能卖
    const boughtToday = c.todayRet === null && !c.canSell && !busy;
    // 开局就在手里、还没开过盘：和其他日子开盘前一样显示"昨天"的涨跌（开局前历史的最后一天），不写"未开盘"
    const pre = c.todayRet === null && !boughtToday && this.state ? (stockMoves(this.state, c.id, 1).at(-1) ?? null) : null;
    this.setToday(c.todayRet ?? pre, boughtToday && premarket);
    // 窄卡上「累计 ↑16.4%」放不下就只写数字（「累计」在卡身的悬停说明里）
    this.hold.setText(holdText(c.holdRet));
    if (this.tiny || (PHONE && this.hold.width > this.rect.w - 20)) this.hold.setText(pctArrow(c.holdRet));
    setColor(this.hold, signColor(c.holdRet));
    this.holdBg?.setFillStyle(Math.abs(c.holdRet) < 0.05 ? COLOR.muted : signColor(c.holdRet), 0.16);
    this.guy?.setFace(c.face);
    this.setPills(c.boards, stText(c), c.lowBuy);
    this.setRow2(c, !!stText(c) || c.lowBuy);
    this.setSpark(c);
    this.setUnits(c);
    // 加班日：不管能不能卖都禁用（规则层的 canSell 也会算进加班，这里先按顶栏的 busy 判断）
    // 「卖出」（押跌的写「不押了」）直接全卖：今天买的明天才能卖，加班日不能；仓位玩法的「加减」今天买的也能点（加仓），只有加班日不能
    const can = c.canSell && !busy;
    this.sellBlocked = !premarket || can ? null : busy ? 'busy' : 't1';
    if (this.sell) {
      this.sell.setVisible(premarket);
      this.sell.setEnabled(can);
      this.sell.setLabel(this.sellWord(can));
    }
    if (this.more) {
      this.more.setVisible(premarket);
      this.more.setEnabled(!busy);
    }
  }

  /** 仓位：左边一摞筹码（越高压得越多）+ "N 份"；押跌再挂一个戴墨镜的"押跌"牌子。 */
  private setUnits(c: HoldingCard): void {
    this.units?.destroy();
    this.units = null;
    if (!this.ext) return;
    const { x, y } = this.rect;
    if (this.compact) {
      // 矮卡：第一行风口签右边写「N 份」（放不下就只在悬停里）
      const t = addText(this.scene, this.row1X, y + 15, unitsWord(c.units), { size: FS.xs, bold: true, color: this.short ? SHORT_COLOR : COLOR.accentDark, originY: 0.5 });
      if (t.x + t.width > this.row1Right) {
        t.destroy();
        return;
      }
      this.units = this.scene.add.container(0, 0, [t]);
      this.root.add(this.units);
      return;
    }
    const fill = this.short ? SHORT_COLOR : COLOR.gold;
    const parts: Phaser.GameObjects.GameObject[] = [chipStack(this.scene, x + 22, y + 104, c.units, fill)];
    const label = addText(this.scene, x + 22, y + 106, unitsWord(c.units), { size: FS.xs, bold: true, color: this.short ? SHORT_COLOR : COLOR.accentDark, originX: 0.5 });
    parts.push(label);
    if (this.short) {
      // 卡片顶边上挂一条"押跌"的牌子（戴墨镜），不压小人和角标
      const px = x + this.rect.w / 2 - 34;
      const py = y - 12;
      const pill = addPill(this.scene, px, py, 68, 22, SHORT_COLOR);
      const g = sunglasses(this.scene, px + 17, py + 11, 22);
      const t = addText(this.scene, px + 32, py + 11, '押跌', { size: 12, bold: true, color: COLOR.white, originY: 0.5 });
      pill.setInteractive();
      const r = { x: px, y: py, w: 68, h: 22 };
      bindTooltip(pill, () => r, () => ({ title: '押跌', body: '押它跌：它跌你赚，它涨你亏。它涨停那天会被轧，亏得最狠。' }));
      parts.push(pill, g, t);
    }
    const hit = this.scene.add.rectangle(x + 6, y + 60, 34, 60, 0xffffff, 0.001).setOrigin(0, 0).setInteractive();
    bindTooltip(hit, () => ({ x: x + 6, y: y + 60, w: 34, h: 60 }), () => ({ title: `压了 ${unitsWord(c.units)}`, body: `钱一共分成 ${this.ext?.total ?? 4} 份，这只压了 ${unitsWord(c.units)}，约占账户的 ${Math.round(c.weight * 100)}%。压得越多，赚亏都越大。` }));
    parts.unshift(hit);
    this.units = this.scene.add.container(0, 0, parts);
    this.root.add(this.units);
  }

  /** 卡上涨跌前面的「昨天 / 今天」：开盘前是昨天，收盘动画里是今天。 */
  dayWord: '今天' | '昨天' = '昨天';

  setToday(v: number | null, boughtToday = false): void {
    if (!this.today) return;
    this.shownToday = v ?? 0;
    this.today.setText(todayText(v, boughtToday, this.dayWord));
    setColor(this.today, v === null ? COLOR.muted : signColor(v));
  }

  /** 角标：连板（右）、ST 提示或低吸（左）。 */
  setPills(boards: number, st: string, lowBuy: boolean): void {
    const { x, y, w } = this.rect;
    this.boards?.destroy();
    this.boards = null;
    this.st?.destroy();
    this.st = null;
    const bt = boardsText(boards);
    if (this.compact) {
      // 矮卡：连板签贴在放大镜左边，和风口签、份数不叠才放；ST、低吸签在悬停里
      if (!bt) return;
      const t = addText(this.scene, 0, 0, bt, { size: FS.xs, bold: true, color: COLOR.white, originX: 0.5, originY: 0.5 });
      const pw = t.width + 10;
      const used = this.units ? this.row1X + (this.units.getBounds().width + 4) : this.row1X;
      if (this.row1Right - pw < used) {
        t.destroy();
        return;
      }
      const pill = addPill(this.scene, -pw / 2, -9, pw, 18, COLOR.up);
      this.boards = this.scene.add.container(this.row1Right - pw / 2, y + 15, [pill, t]);
      this.root.add(this.boards);
      return;
    }
    if (bt) {
      const t = addText(this.scene, 0, 0, bt, { size: 12, bold: true, color: COLOR.white, originX: 0.5, originY: 0.5 });
      const pw = t.width + 14;
      const pill = addPill(this.scene, -pw / 2, -10, pw, 20, COLOR.up);
      this.boards = this.scene.add.container(x + w - 10 - pw / 2, y + 44, [pill, t]);
      pill.setInteractive();
      bindTooltip(pill, () => ({ x: x + w - 10 - pw, y: y + 34, w: pw, h: 20 }), () => termTip(boards > 1 ? 'boards' : 'limit'));
      this.root.add(this.boards);
    }
    const left = st || (lowBuy ? term('lowbuy').word : '');
    if (left) {
      const warn = st !== '' && !st.startsWith('翻身');
      const fill = warn ? 0xffd9d2 : st ? 0xffe7a8 : 0xd9f0ff;
      const t = addText(this.scene, 0, 0, left, { size: FS.xs, bold: true, color: warn ? COLOR.danger : COLOR.ink, originX: 0, originY: 0.5 });
      const pw = Math.min(w * 0.55, t.width + 12);
      // 字比签宽时截短（全文在悬停里），不溢出到右边的连涨签上
      fitWidth(t, pw - 10, 2);
      const pill = addPill(this.scene, 0, -10, pw, 20, fill);
      t.setX(6);
      this.stRight = x + 10 + pw;
      this.st = this.scene.add.container(x + 10, y + 44, [pill, t]);
      pill.setInteractive();
      bindTooltip(pill, () => ({ x: x + 10, y: y + 34, w: pw, h: 20 }), () => (st ? termTip('st', st) : termTip('lowbuy')));
      this.root.add(this.st);
    }
  }

  setLocked(locked: boolean): void {
    this.sell?.setLocked(locked);
    this.more?.setLocked(locked);
  }

  setPick(mode: PickMode | null, card: HoldingCard | null): void {
    this.pick?.destroy();
    this.pick = null;
    this.sell?.setAlpha(mode ? 0 : 1);
    this.more?.setAlpha(mode ? 0 : 1);
    if (!mode) return;
    const label = mode.label(this.slot, card);
    if (!label) return;
    const { x, y, w, h } = this.rect;
    // 只占卖出按钮那一条（以前 42 高，把「累计」那行盖住了）
    this.pick = new Button(this.scene, x + 8, y + h - 33, { width: w - 16, height: 30, label, variant: 'primary', fontSize: 14, hotkey: `${this.slot + 1}`, onClick: () => mode.onPick(this.slot) });
    this.root.add(this.pick);
  }

  destroy(): void {
    this.root.destroy();
  }
}

