import Phaser from 'phaser';
import { dailySetup, difficultyDef, difficultyView, flashSetup, formatMoney, personaById, personaView, weeklyInfo, weeklySetup, type DailyKind, type RunSetup } from '../../core/index.ts';
import { isPersonaUnlocked, type Profile } from '../../platform/profile.ts';
import { FLASH_DAYS, FLASH_EVENT_DAYS, dailyDate, dailyText, levelLabel } from '../labels.ts';
import { COLOR, FS, TYPE } from '../theme.ts';
import { addGlyph, addPill } from '../ui/art.ts';
import { bindTooltip } from '../ui/tooltip.ts';
import { wanShort } from './bits.ts';
import { Button } from '../ui/button.ts';
import { Dialog, phonePanel, SOLID_BACKDROP_ALPHA, TOP_DIALOG } from '../ui/dialog.ts';
import { addText } from '../ui/text.ts';
import { addBadge, addPortrait } from './setupPanel.ts';
import { phoneLayout } from '../viewport.ts';

const DESK_W = 640;

/**
 * 今天的每日挑战（按北京日期）：人设、市场环境、种子、今日最好成绩，「开始挑战」；「排行榜」看今天的排行（0.5.10）。
 * onBoard 为 null（0.8.0 单独部署，没有平台）时不放「排行榜」。
 * kind 为 'flash' 时是闪电盘（10 天短局）：同样的人设、难度两块，第三块写玩法（闪电盘不进档案，没有「今日最好」）。
 * kind 为 'weekly' 时是本周市场：date 是周号（YYYY-Www），第三块写这一周的规则，榜是周榜。
 */
export class DailyPanel extends Dialog {
  constructor(
    scene: Phaser.Scene,
    profile: Profile,
    onStart: (seed: string, setup: RunSetup) => void,
    onBoard: ((date: string) => void) | null,
    date = dailyDate(),
    kind: DailyKind | 'weekly' = 'classic',
  ) {
    // 手机横屏：面板取 phonePanel（SE 上 702×392），三块小卡收矮一点、立绘小一点，按钮贴下边
    const ph = phoneLayout(scene);
    const PW = ph ? phonePanel(scene) : null;
    const W = PW ? PW.w : DESK_W;
    const H = PW ? PW.h : 440;
    super(scene, W, H, `${kind === 'weekly' ? '本周市场' : kind === 'flash' ? '闪电盘' : '每日挑战'} · ${date}`, undefined, SOLID_BACKDROP_ALPHA);
    // 竖屏版（0.33.0）：立绘在上居中，三块小卡整宽排在下面，按钮两排（开始单独一排、最下面）
    const pt = ph && H > W;
    const ptTop = pt ? 296 + Math.round(Math.max(0, H - 694) * 0.3) : 0;
    const tops = pt ? [ptTop, ptTop + 84, ptTop + 158] : ph ? [68, 152, 226] : [72, 168, 256];
    const hs = ph ? [76, 66, 62] : [80, 72, 64];
    const weekly = kind === 'weekly';
    // 闪电盘、本周市场都是 10 天短局：第三块写玩法（本周市场写这周的规则），不记进档案
    const flash = kind === 'flash' || weekly;
    const d = weekly ? weeklySetup(date) : flash ? flashSetup(date) : dailySetup(date);
    const wk = weekly ? weeklyInfo(date) : null;
    const p = personaView(d.setup.persona);
    const lv = difficultyView(d.setup.difficulty);
    this.inner.add(addPortrait(scene, pt ? W / 2 : ph ? 112 : 120, pt ? 80 + (ptTop - 296) / 2 + 100 : ph ? 182 : 196, p, false, 160));
    // 右：三块整宽的小卡（0.16.0，以前三行字挤在左边、右半空着）：人设、难度、今日最好；长说明都在悬停
    const R = pt ? 16 : 230;
    const RW = W - 32 - R;
    const row = (y: number, h: number): Phaser.GameObjects.Rectangle =>
      scene.add.rectangle(R, y, RW, h, COLOR.paperHi, 0.9).setOrigin(0, 0).setRounded(12).setStrokeStyle(2, COLOR.edge, 1);
    const tip = (y: number, h: number, content: () => { title: string; body: string }): Phaser.GameObjects.Rectangle => {
      const hit = scene.add.rectangle(R, y, RW, h, 0xffffff, 0.001).setOrigin(0, 0);
      bindTooltip(hit, () => ({ x: this.inner.x + R, y: this.inner.y + y, w: RW, h }), content);
      return hit;
    };
    this.inner.add(row(tops[0]!, hs[0]!));
    const y1 = tops[0]! + (ph ? 8 : 12);
    this.inner.add(addText(scene, R + 16, y1, p.name, { size: TYPE.title + 4, bold: true }));
    this.inner.add(addText(scene, R + 16, tops[0]! + (ph ? 42 : 46), `${wanShort(p.account)} · ${personaById(p.id).short ?? p.title}`, { size: TYPE.label + 2, color: COLOR.ink }));
    if (!isPersonaUnlocked(profile, p.id)) this.inner.add([addPill(scene, R + RW - 64, y1, 48, 22, COLOR.accent), addText(scene, R + RW - 40, y1 + 11, '试玩', { size: TYPE.label, bold: true, color: COLOR.white, originX: 0.5, originY: 0.5 })]);
    const pHit = tip(tops[0]!, hs[0]!, () => ({ title: `${p.name}（${p.title}）`, body: `${p.desc}${isPersonaUnlocked(profile, p.id) ? '' : '\n还没解锁的人设，今天可以先试玩'}` }));
    this.inner.add(row(tops[1]!, hs[1]!));
    this.inner.add(addBadge(scene, R + 36, tops[1]! + (ph ? 33 : 36), lv.level, 48));
    this.inner.add(addText(scene, R + 72, tops[1]! + (ph ? 8 : 16), lv.name, { size: TYPE.title, bold: true }));
    this.inner.add(addText(scene, R + 72, tops[1]! + (ph ? 36 : 42), difficultyDef(lv.level).short ?? lv.desc, { size: TYPE.label, color: COLOR.muted }));
    const dHit = tip(tops[1]!, hs[1]!, () => ({ title: levelLabel(lv.level, lv.name), body: lv.detail ? `${lv.desc}\n${lv.detail}` : lv.desc }));
    // 今日最好：奖杯 + 数字；没打过写一句，不只是一道横线
    const rec = flash ? undefined : profile.daily[date];
    this.inner.add(row(tops[2]!, hs[2]!));
    this.inner.add(addGlyph(scene, R + 36, tops[2]! + (ph ? 31 : 32), flash ? 'bolt' : 'trophy', 36));
    const played = !!rec && rec.attempts > 0;
    this.inner.add(addText(scene, R + 72, tops[2]! + (ph ? 8 : 14), wk ? `本周规则 · ${FLASH_DAYS} 天约 5 分钟` : flash ? '玩法' : '今日最好', { size: TYPE.label - 2, bold: true, color: COLOR.muted }));
    const best = wk ? wk.name : flash ? `${FLASH_DAYS} 个交易日 · 约 5 分钟` : !rec || !played ? '今天还没打' : rec.won ? formatMoney(rec.bestAccount) : `撑到 ${rec.bestMonths}/12 月`;
    this.inner.add(addText(scene, R + 72, tops[2]! + (ph ? 24 : 30), best, { size: played ? TYPE.title + 2 : TYPE.title, bold: true, num: played, color: played ? COLOR.ink : flash ? COLOR.ink : COLOR.muted }));
    const rHit = tip(tops[2]!, hs[2]!, () =>
      wk
        ? {
            title: `本周市场 · ${wk.name}`,
            body: `${wk.tip}\n玩法和闪电盘一样：${FLASH_DAYS} 个交易日，不用还钱，不会出局，开局先三选一道具，${FLASH_EVENT_DAYS}收盘后各来一件事。\n这一周所有人玩的都是同一局，成绩上本周的排行榜，不记进档案和成就；北京时间周一 0 点换新规则。\n这一局的编号：${d.seed}`,
          }
        : flash
        ? {
            title: '闪电盘',
            body: `${FLASH_DAYS} 个交易日，不用还钱，不会出局：开局先三选一道具，${FLASH_EVENT_DAYS}收盘后各来一件事。\n${FLASH_DAYS} 天后账户里的钱就是分数，比谁多。\n今天所有人玩的都是同一局：同样的开局、人设和行情。成绩只上闪电盘的排行榜，不记进档案和成就。\n这一局的编号：${d.seed}`,
          }
        : {
            title: '今日挑战',
            body: `${dailyText(rec)}\n今天所有人玩的都是同一局：同样的开局、人设和市场环境。\n每日挑战只记今天的成绩、成就和图鉴，不会解锁新难度。\n这一局的编号：${d.seed}`,
          },
    );
    this.inner.add([pHit, dHit, rHit]);
    const bw2 = Math.floor((W - 32 - 12) / 2);
    const go = pt
      ? new Button(scene, 16, H - 68, { width: W - 32, height: 52, label: '开始', variant: 'primary', fontSize: FS.lg })
      : new Button(scene, W - 32 - 180, H - (ph ? 62 : 66), { width: 180, height: 48, label: '开始', variant: 'primary', fontSize: FS.lg, hotkey: '回车' });
    go.setHandler(() => {
      this.close();
      onStart(d.seed, d.setup);
    });
    const back = pt
      ? new Button(scene, 16, H - 68 - 56, { width: onBoard ? bw2 : W - 32, height: 44, label: '返回', fontSize: 15 })
      : new Button(scene, 32, H - (ph ? 58 : 62), { width: 110, height: 40, label: '返回', fontSize: 15, hotkey: 'Esc' });
    back.setHandler(() => this.close());
    this.inner.add([go, back]);
    this.named['daily:start'] = go;
    this.named['daily:back'] = back;
    if (onBoard) {
      const board = pt
        ? new Button(scene, 16 + bw2 + 12, H - 68 - 56, { width: bw2, height: 44, label: '排行榜', icon: 'trophy', fontSize: 15 })
        : new Button(scene, 32 + 110 + 16, H - (ph ? 58 : 62), { width: 120, height: 40, label: '排行榜', icon: 'trophy', fontSize: 15 });
      // 榜单叠在面板上开，关掉榜单回到这里
      board.setHandler(() => onBoard(date));
      this.inner.add(board);
      this.named['daily:board'] = board;
    }
    const onKey = (e: KeyboardEvent): void => {
      // 榜单叠在上面时回车不开局
      if (scene.data.get(TOP_DIALOG) !== this) return;
      if (e.code === 'Enter' || e.code === 'NumpadEnter') go.press();
    };
    scene.input.keyboard?.on('keydown', onKey);
    this.once(Phaser.GameObjects.Events.DESTROY, () => scene.input.keyboard?.off('keydown', onKey));
  }
}
