import Phaser from 'phaser';
import { defaultSettings, getSettings, onSettingsChange, updateSettings, type AnimSpeed, type ColorScheme, type Settings } from '../../platform/settings.ts';
import { COLOR, FS, PHONE } from '../theme.ts';
import { Button } from './button.ts';
import { Dialog } from './dialog.ts';
import { Slider } from './slider.ts';
import { addText } from './text.ts';
import { loadTutorial, setTutorialOn, tutorialActive } from '../tutorial.ts';
import { DEFAULT_VIEW_PREFS, HINT_AUTO_RUNS, hintsOn, loadViewPrefs, saveViewPrefs } from '../meta/prefs.ts';
import { phoneLayout, viewOf } from '../viewport.ts';

interface SettingsPanelOpts {
  /** 游戏内打开时提供「返回主菜单」 */
  onMenu?: () => void;
  /** 游戏内打开时提供「回大厅」（对局中回平台首页，齿轮 → 回大厅两步）；点了关闭时 onClosed 的 lobby 为 true */
  lobby?: boolean;
  /** URL 参数指定了动画速度（自动化），设置里的选择暂不生效 */
  animLocked: boolean;
  /** 关闭时回调；schemeChanged 表示涨跌配色变了，需要重建画面；lobby 表示是点「回大厅」关的 */
  onClosed?: (schemeChanged: boolean, lobby: boolean) => void;
  /** 档案里玩过几局（新手提示「自动」时按它判断） */
  runs?: number;
  /** 实盘局里多一个「提前收手」（点了关掉设置再调它，由它去问一次） */
  onQuitLive?: () => void;
}

const W = 1000;
const H = 560;
/** 两栏：左边声音和画面，右边帮助类开关 */
const COLS = [
  { label: 32, ctrl: 160 },
  { label: 524, ctrl: 664 },
];
const ROW = 46;
/** 分组小标题的中心 y 和它到第一行的距离 */
const HEAD_Y = 84;
const HEAD_GAP = 38;

/**
 * 手机横屏（960×444）：两栏叠不下说明小字，改成两个页签（声音画面 / 提示节奏），每页一栏，
 * 说明小字放在同一行按钮的右边。
 */
const PHONE_UI = { w: 940, h: 430, label: 32, ctrl: 150, row: [46, 52], note: [520, 386] } as const;

/**
 * 手机世界变小（718–960×404）后按看得见的范围算：面板最大 940×430，SE 上是 702×392。
 * 矮了就收行距（音量 36、其余 44 / 46）、底下一排按钮下移；窄了音量条短一点，说明小字往左挪。
 */
function phoneGeo(v: { w: number; h: number }) {
  // 竖屏版（世界 404 宽）：面板占满高度，页签单独一排；标签窄一点、按钮从 116 起，说明小字写在按钮下面一行
  if (v.h > v.w) {
    const w = v.w - 16;
    return { ...PHONE_UI, w, h: v.h - 24, label: 20, ctrl: 116, top: 136, top1: 136, volRow: 50, row: [50, 50], note: [20, 20], slider: w - 116 - 64, footY: 112, doneY: 60, portrait: true };
  }
  const w = Math.min(PHONE_UI.w, v.w - 16);
  const h = Math.min(PHONE_UI.h, v.h - 12);
  const short = h < 420;
  const narrow = w < 900;
  return {
    ...PHONE_UI,
    w,
    h,
    top: short ? 80 : 88,
    top1: short ? 80 : 96,
    volRow: short ? 36 : 38,
    row: short ? [44, 46] : PHONE_UI.row,
    note: narrow ? [430, 386] : PHONE_UI.note,
    slider: narrow ? 220 : 280,
    footY: short ? 50 : 60,
    doneY: short ? 52 : 64,
    portrait: false,
  };
}

const SPEEDS: [AnimSpeed, string][] = [
  [0, '关闭'],
  [1, '1×'],
  [2, '2×'],
  [4, '4×'],
];
const SCHEMES: [ColorScheme, string][] = [
  ['cn', '红涨绿跌'],
  ['intl', '绿涨红跌'],
];

/**
 * 设置面板（两栏，电脑上有分组小标题）：左边「声音」（音量、静音）和「画面和动画」（动画速度、涨跌配色、减少动态效果）；
 * 右边「玩法」（月底账单、新手教程、新手提示、收盘小结、平淡日）。修改即时保存；「恢复默认」点两下恢复。
 */
export class SettingsPanel extends Dialog {
  private readonly groups: { refresh: (s: Settings) => void }[] = [];
  /** 控件加到哪里：电脑上是 inner；手机上是当前页签的容器 */
  private box: Phaser.GameObjects.Container;
  private readonly phone: boolean;

  constructor(scene: Phaser.Scene, opts: SettingsPanelOpts) {
    const startScheme = getSettings().colorScheme;
    const phone = phoneLayout(scene);
    const P = phoneGeo(viewOf(scene));
    let toLobby = false;
    super(scene, phone ? P.w : W, phone ? P.h : H, '设置', () => opts.onClosed?.(getSettings().colorScheme !== startScheme, toLobby));
    this.phone = phone;
    this.box = this.inner;
    const pages = phone ? [scene.add.container(0, 0), scene.add.container(0, 0)] : [];
    if (phone) {
      this.inner.add(pages);
      this.box = pages[0]!;
      this.tabs(pages);
    }
    let col: { label: number; ctrl: number } = phone ? P : COLS[0]!;
    let page = 0;
    // 手机第一页有七行（含「月底账单」），对局里底下还有「回到主菜单」「回大厅」：从 88 起、音量三行收到 38，最后一行的按钮底边 359，不再压到底下按钮（顶边 370）
    let y = phone ? P.top : HEAD_Y;
    let lastAt = y;
    const row = (label: string, pitch?: number): number => {
      this.box.add(addText(scene, col.label, y, label, { size: 15, color: COLOR.muted, originY: 0.5 }));
      const at = y;
      lastAt = at;
      y += pitch ?? (phone ? P.row[page]! : ROW);
      return at;
    };
    // 电脑上的分组小标题（手机用页签分组，没有地方放）：一行粗体字加一条细线
    const heading = (text: string): void => {
      if (phone) return;
      this.box.add(addText(scene, col.label, y, text, { size: 15, bold: true, color: COLOR.ink, originY: 0.5 }));
      this.box.add(scene.add.rectangle(col.label + 16 + text.length * 15, y, W / 2 - 64 - 16 - text.length * 15, 2, COLOR.edge).setOrigin(0, 0.5));
      y += HEAD_GAP;
    };
    const note = (text: string): Phaser.GameObjects.Text => {
      if (phone && P.portrait) {
        // 竖屏：写在按钮下面一行，占整宽
        const t = addText(scene, P.label, y - P.row[page]! + this.btnH / 2 + 4, text, { size: 13, color: COLOR.muted, wrap: P.w - P.label * 2, lineSpacing: 2 });
        this.box.add(t);
        y += t.height + 6;
        return t;
      }
      if (phone) {
        // 手机：写在上一行按钮的右边，不另占一行
        const nx = P.note[page]!;
        const t = addText(scene, nx, lastAt, text, { size: 13, color: COLOR.muted, wrap: P.w - nx - 32, originY: 0.5, lineSpacing: 2 });
        this.box.add(t);
        return t;
      }
      const t = addText(scene, col.ctrl, y - 24, text, { size: FS.xs, color: COLOR.muted, wrap: W / 2 - (col.ctrl - col.label) - 48 });
      this.box.add(t);
      y += Math.max(16, t.height) - 4;
      return t;
    };

    const volume = (label: string, field: 'masterVolume' | 'sfxVolume' | 'musicVolume'): void => {
      const at = row(label, phone ? P.volRow : undefined);
      const sw = phone ? P.slider : 280;
      const pct = addText(scene, col.ctrl + sw + 20, at, '', { size: 15, num: true, originY: 0.5 });
      const slider = new Slider(scene, col.ctrl, at, sw, getSettings()[field], (v) => updateSettings({ [field]: v }));
      this.box.add([slider, pct]);
      this.groups.push({ refresh: (s) => pct.setText(`${Math.round(s[field] * 100)}%`) });
    };
    const pad = phone ? 10 : 6;
    let refreshHelp = (): void => {};
    let tButtons: { on: boolean; b: Button }[] = [];
    let hButtons: { on: boolean; b: Button }[] = [];
    let tNote: Phaser.GameObjects.Text;
    let hNote: Phaser.GameObjects.Text;
    let rb: { mode: 'full' | 'brief'; b: Button }[] = [];
    let qb: { on: boolean; b: Button }[] = [];
    let bb: { mode: 'stage' | 'quick'; b: Button }[] = [];

    const sound = (): void => {
      heading('声音');
      volume('主音量', 'masterVolume');
      volume('音效', 'sfxVolume');
      volume('音乐', 'musicVolume');
      this.choice(col.ctrl, row('声音'), [[false, '开'], [true, '关']], (s) => s.muted, (v) => updateSettings({ muted: v }));
    };
    const look = (): void => {
      heading('画面和动画');
      this.choice(col.ctrl, row('动画速度'), SPEEDS, (s) => s.animSpeed, (v) => updateSettings({ animSpeed: v }));
      if (opts.animLocked) note('现在由网址里的 anim / speed 控制，正常打开游戏时这里的设置才生效');
      this.choice(col.ctrl, row('涨跌配色'), SCHEMES, (s) => s.colorScheme, (v) => updateSettings({ colorScheme: v }));
    };
    const motion = (): void => {
      this.choice(col.ctrl, row('减少动态效果'), [[true, '开启'], [false, '关闭']], (s) => s.reduceMotion, (v) => updateSettings({ reduceMotion: v }));
      note('打开后不震屏、不闪电、不放烟花，小人也不再摇来摇去');
      y += pad;
    };
    const bill = (): void => {
      // 月底账单：舞台（每月不到 2 秒，点一下跳过）/ 简短（直接出账单和章）
      const billAt = row('月底账单');
      bb = (
        [
          ['stage', '完整'],
          ['quick', '简短'],
        ] as const
      ).map(([mode, label], i) => {
        const b = new Button(scene, col.ctrl + i * 108, billAt - this.btnH / 2, { width: 100, height: this.btnH, label, fontSize: FS.sm, sound: 'select' });
        b.setHandler(() => {
          saveViewPrefs({ bill: mode });
          refreshHelp();
        });
        this.box.add(b);
        this.named[`settings:bill-${mode}`] = b;
        return { mode, b };
      });
      note(phone ? '每月不到 2 秒，点一下就跳过' : '每月不到 2 秒，点一下就跳过；简短直接出结果');
      y += pad;
    };
    const help = (): void => {
    // 新手教程：开启 = 从头再看一遍；关闭 = 不再出现（进度记在本地）
    tButtons = this.pair(col.ctrl, row('新手教程'), 'tutorial', (on) => {
      setTutorialOn(on);
      refreshHelp();
    });
    tNote = note('');
    y += pad;

    // 新手提示：开盘前猫说一句（前 3 局默认打开）
    hButtons = this.pair(col.ctrl, row('新手提示'), 'hints', (on) => {
      saveViewPrefs({ hints: on ? 'on' : 'off' });
      refreshHelp();
    });
    hNote = note('');
    y += pad;

    // 收盘小结：完整 / 只看总账
    const recapAt = row('收盘小结');
    rb = (
      [
        ['full', '完整'],
        ['brief', '只看总账'],
      ] as const
    ).map(([mode, label], i) => {
      const b = new Button(scene, col.ctrl + i * 108, recapAt - this.btnH / 2, { width: 100, height: this.btnH, label, fontSize: FS.sm, sound: 'select' });
      b.setHandler(() => {
        saveViewPrefs({ recap: mode });
        refreshHelp();
      });
      this.box.add(b);
      this.named[`settings:recap-${mode}`] = b;
      return { mode, b };
    });
    // 电脑上小结固定先收成一行（交易页一屏只留一条提示），这项只管手机；电脑上点「详情」看完整的
    note(PHONE ? '完整：收盘把今天的明细摊开；只看总账：只写一句，点「详情」再看' : '这一项只管手机；电脑上收盘先写一句总账，点「详情」看完整的');
    y += pad;

    // 没什么事的日子自动快进
    const qAt = row('平淡日');
    qb = (
      [
        [true, '自动快进'],
        [false, '手动'],
      ] as const
    ).map(([on, label], i) => {
      const b = new Button(scene, col.ctrl + i * 108, qAt - this.btnH / 2, { width: 100, height: this.btnH, label, fontSize: FS.sm, sound: 'select' });
      b.setHandler(() => {
        saveViewPrefs({ autoQuiet: on });
        refreshHelp();
      });
      this.box.add(b);
      this.named[`settings:quiet-${on ? 'auto' : 'manual'}`] = b;
      return { on, b };
    });
    note('没什么事的日子自动翻过去，碰到大涨大跌、事件、目标变化就停下（手动时按 F 快进）');
    };

    if (phone) {
      // 手机：第一页声音和画面（含减少动态效果），第二页玩法（月底账单、提示节奏）；顺序照 docs/ui.md 第 8 节：声音 → 画面 → 玩法
      sound();
      look();
      motion();
      page = 1;
      this.box = pages[1]!;
      col = P;
      y = P.top1;
      bill();
      help();
    } else {
      // 电脑：左栏声音、画面和动画；右栏玩法；恢复默认在最下面
      sound();
      y += 2;
      look();
      motion();
      col = COLS[1]!;
      y = HEAD_Y;
      heading('玩法');
      bill();
      help();
    }

    const runs = opts.runs ?? 0;
    refreshHelp = (): void => {
      const p = loadTutorial();
      const active = tutorialActive(p);
      for (const { on, b } of tButtons) b.setSelected(on === active);
      tNote.setText(active ? (p.done.length > 0 ? `已经看过 ${p.done.length} 步，剩下的到时候会冒出来` : '第一局里会一步步冒出来') : '点「开启」可以从头再看一遍');
      const vp = loadViewPrefs();
      const hon = hintsOn(vp, runs);
      for (const { on, b } of hButtons) b.setSelected(on === hon);
      hNote.setText(vp.hints === 'auto' ? `开盘前，猫会根据看板说一句建议（前 ${HINT_AUTO_RUNS} 局自动打开）` : '开盘前，猫会根据看板说一句建议（它也是猜的）');
      for (const { mode, b } of rb) b.setSelected(mode === vp.recap);
      for (const { on, b } of qb) b.setSelected(on === vp.autoQuiet);
      for (const { mode, b } of bb) b.setSelected(mode === vp.bill);
    };
    refreshHelp();

    const close = new Button(scene, this.dw - (P.portrait && phone ? 16 : 32) - 130, this.dh - (phone ? P.doneY : 64), { width: 130, height: 44, label: '完成', variant: 'primary', fontSize: FS.md });
    close.setHandler(() => this.close());
    this.inner.add(close);
    this.named['settings:done'] = close;

    // 恢复默认：第一下按钮变成「再点一次」（3 秒内不点就还原），第二下才恢复，免得手滑清掉全部设置。
    // 默认值取自 DEFAULT_SETTINGS / DEFAULT_VIEW_PREFS；新手教程的进度不动（它有自己的开关）
    const resetW = phone ? 100 : 120;
    // 竖屏：和「完成」同一排、在左边
    const reset = phone && P.portrait
      ? new Button(scene, 16, this.dh - P.doneY + 2, { width: resetW, height: 40, label: '恢复默认', fontSize: 15 })
      : new Button(scene, phone ? this.dw - 196 : this.dw - 32 - 130 - 12 - resetW, phone ? 16 : this.dh - 62, { width: resetW, height: phone ? 40 : 40, label: '恢复默认', fontSize: 15 });
    let armed: Phaser.Time.TimerEvent | null = null;
    const disarm = (): void => {
      armed?.remove(false);
      armed = null;
      reset.setLabel('恢复默认').setSelected(false);
    };
    reset.setHandler(() => {
      if (!armed) {
        reset.setLabel('再点一次').setSelected(true);
        armed = scene.time.delayedCall(3000, disarm);
        return;
      }
      disarm();
      const { version: _v, ...defaults } = defaultSettings();
      updateSettings(defaults);
      saveViewPrefs(DEFAULT_VIEW_PREFS);
      refreshHelp();
    });
    this.once(Phaser.GameObjects.Events.DESTROY, () => armed?.remove(false));
    this.inner.add(reset);
    this.named['settings:reset'] = reset;
    // 竖屏：回到主菜单、回大厅、提前收手在「完成」上面一排，按个数均分整宽
    const footN = [opts.onMenu, opts.lobby, opts.onQuitLive].filter(Boolean).length;
    const footW = Math.floor((this.dw - 32 - 8 * (footN - 1)) / Math.max(1, footN));
    let footX = 16;
    const foot = (w: number, x: number): { x: number; w: number } => {
      if (!(phone && P.portrait)) return { x, w };
      const at = footX;
      footX += footW + 8;
      return { x: at, w: footW };
    };
    if (opts.onMenu) {
      const onMenu = opts.onMenu;
      const f = foot(150, COLS[0]!.label);
      const menu = new Button(scene, f.x, this.dh - (phone ? P.footY : 60), { width: f.w, height: 40, label: '回到主菜单', fontSize: 15 });
      menu.setHandler(() => {
        this.close();
        onMenu();
      });
      this.inner.add(menu);
      this.named['settings:menu'] = menu;
    }
    if (opts.lobby) {
      const f = foot(120, COLS[0]!.label + (opts.onMenu ? 162 : 0));
      const lobby = new Button(scene, f.x, this.dh - (phone ? P.footY : 60), { width: f.w, height: 40, label: '回大厅', icon: 'house', fontSize: 15 });
      lobby.setHandler(() => {
        toLobby = true;
        this.close();
      });
      this.inner.add(lobby);
      this.named['settings:lobby'] = lobby;
    }
    if (opts.onQuitLive) {
      const onQuit = opts.onQuitLive;
      const f = foot(120, COLS[0]!.label + (opts.onMenu ? 162 : 0) + (opts.lobby ? 132 : 0));
      const quit = new Button(scene, f.x, this.dh - (phone ? P.footY : 60), { width: f.w, height: 40, label: '提前收手', fontSize: 15 });
      // 先告诉调用方是收手关的，再关：关的时候 onClosed 是同步调的，要能认出来不去重建画面
      quit.setHandler(() => {
        onQuit();
        this.close();
      });
      this.inner.add(quit);
      this.named['settings:quit-live'] = quit;
    }

    const refresh = (s: Settings): void => {
      for (const g of this.groups) g.refresh(s);
    };
    refresh(getSettings());
    // 设置变化时刷新（包括本面板自己的修改）
    const off = onSettingsChange(refresh);
    this.once(Phaser.GameObjects.Events.DESTROY, () => off());
  }

  /** 选项按钮的高：手机上抬到 38，手指点得到 */
  private get btnH(): number {
    return this.phone ? 38 : 34;
  }

  /** 手机：标题右边两个页签，切换两页（命名 settings:tab-0 / settings:tab-1）。 */
  private tabs(pages: Phaser.GameObjects.Container[]): void {
    const labels = ['声音画面', '提示节奏'];
    // 竖屏：标题行放不下，单独一排、各占一半
    const pt = this.dh > this.dw;
    const tw = pt ? Math.floor((this.dw - 32 - 8) / 2) : 120;
    const buttons = labels.map((label, i) => {
      const b = new Button(this.scene, pt ? 16 + i * (tw + 8) : 112 + i * 128, pt ? 72 : 16, { width: tw, height: 40, label, fontSize: 15, sound: 'select' });
      b.setHandler(() => show(i));
      this.inner.add(b);
      this.named[`settings:tab-${i}`] = b;
      return b;
    });
    const show = (i: number): void => {
      pages.forEach((p, k) => p.setVisible(k === i));
      buttons.forEach((b, k) => b.setSelected(k === i));
    };
    show(0);
  }

  /** 手机上另一页签里的按钮看不见、点不到：不交给自动化（先点 settings:tab-N 换页）。 */
  override controls(): Record<string, { x: number; y: number }> {
    const out = super.controls();
    for (const [k, b] of Object.entries(this.named)) {
      const parent = b.parentContainer;
      if (parent && parent !== this.inner && !parent.visible) delete out[k];
    }
    return out;
  }

  /** 开启 / 关闭一对按钮（命名 settings:<name>-on / -off）。 */
  private pair(x: number, y: number, name: string, set: (on: boolean) => void): { on: boolean; b: Button }[] {
    return (
      [
        [true, '开启'],
        [false, '关闭'],
      ] as const
    ).map(([on, label], i) => {
      const b = new Button(this.scene, x + i * 88, y - this.btnH / 2, { width: 80, height: this.btnH, label, fontSize: FS.sm, sound: 'toggle' });
      b.setHandler(() => set(on));
      this.box.add(b);
      this.named[`settings:${name}-${on ? 'on' : 'off'}`] = b;
      return { on, b };
    });
  }

  /** 一组单选按钮。 */
  private choice<T>(x: number, y: number, options: [T, string][], get: (s: Settings) => T, set: (v: T) => void): void {
    // 手机上四个选项（动画速度）按 56 宽排：到 398 止，不压到右边 430 起的说明小字
    const bw = this.phone && options.length >= 4 ? 56 : 80;
    const buttons = options.map(([value, label], i) => {
      const b = new Button(this.scene, x + i * (bw + 8), y - this.btnH / 2, { width: bw, height: this.btnH, label, fontSize: FS.sm, sound: 'select' });
      b.setHandler(() => set(value));
      this.box.add(b);
      return { value, b };
    });
    this.groups.push({ refresh: (s) => buttons.forEach(({ value, b }) => b.setSelected(value === get(s))) });
  }
}
