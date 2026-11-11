/** 设置、战绩、规则、确认框：标题页和牌桌共用的弹窗。 */
import type Phaser from 'phaser';
import { DEFAULT_OPTIONS, makeCard } from '../../variants/guandan/core/index.ts';
import { app } from '../app.ts';
import { levelName } from '../guandan/labels.ts';
import { audio } from '../common/audio.ts';
import { SOUND_GAIN, getDdzStats, getSettings, getStats, getVariant, resetSettings, setDdzTutorialDone, setTutorialDone, updateSettings, type Settings, type SoundLevel } from '../store.ts';
import { COLOR, SPACE, TYPE, css, minHit } from '../common/theme.ts';
import { Button, modal, segmented, signedLine, text, worldW, type Modal } from './kit.ts';
import type { SignedRow } from '../common/stake-text.ts';
import { DDZ_RULE_TABS } from '../doudizhu/rules.ts';
import { DDZ_PATTERNS, PATTERNS, miniCards, patternTile } from './patterns.ts';
import { SHORTCUT_HELP, hasPointerKeys } from './shortcuts.ts';

export function applyAudio(s: Settings = getSettings()): void {
  audio.apply({ sfx: SOUND_GAIN[s.sfx] ?? 1, music: SOUND_GAIN[s.musicVol] ?? 1, muted: s.muted });
}

/** 设置、规则、战绩三个弹窗的宽度（art-v3）：世界宽减两边留白，封顶 1120——两边多露出一点遮罩，点外面关得到 */
export function panelW(scene: Phaser.Scene): number {
  return Math.min(worldW(scene) - SPACE.xxl * 2, 1120);
}

const SOUND_ITEMS = [{ label: '关', value: '0' }, { label: '小', value: '1' }, { label: '中', value: '2' }, { label: '大', value: '3' }];
const SETTINGS_TABS = ['声音', '对局', '地方规则'];

/**
 * 设置：三页（声音 / 对局 / 地方规则），每页最多三行，页签下面的一行永远是"恢复默认"（docs/ui.md 第 8 节）。
 * 改了立刻生效、立刻存。手机横屏每一行至少 minHit() 高，所以分页比一屏九行排得下；点弹窗外也能关（和 ✕、Esc 同一个关闭路径）。
 * "重看引导"放在"对局"页的最后一项；"恢复默认"只重置设置，不动战绩、存档和引导。
 */
export function openSettings(scene: Phaser.Scene, opts: { onTutorial?: () => void; onClose?: () => void } = {}): Modal {
  const P = Math.max(64, minHit());
  // 页签一排、下面三行、再下面一排恢复默认：高度跟着行距走
  const PH = Math.round(190 + 3.5 * P);
  const PW = Math.min(panelW(scene), 1040);
  const m = modal(scene, PW, PH, '设置', { onClose: opts.onClose, dismissOnOutside: true });
  const b = m.body;
  const page = scene.add.container(0, 0);
  b.add(page);
  const colL = -PW / 2 + 48;
  const colR = 40;
  const tabY = -PH / 2 + 100;
  const rowY = (i: number): number => tabY + P * (1 + i);
  const row = (x: number, y: number, label: string): void => {
    page.add(text(scene, x, y, label, { size: TYPE.body, bold: true, ox: 0 }));
  };
  // 选项组：标签占 labelW，第一项的中心在 x + labelW + itemW / 2
  const seg = (x: number, y: number, labelW: number, items: { label: string; value: string }[], cur: string, pick: (v: string) => void, itemW = 104): void => {
    page.add(segmented(scene, x + labelW + itemW / 2, y, items, cur, pick, itemW, P));
  };
  let cur = 0;

  const pageSound = (s: Settings): void => {
    row(colL, rowY(0), '音乐');
    seg(colL, rowY(0), 120, SOUND_ITEMS, String(s.musicVol), (v) => applyAudio(updateSettings({ musicVol: Number(v) as SoundLevel })));
    row(colL, rowY(1), '音效');
    seg(colL, rowY(1), 120, SOUND_ITEMS, String(s.sfx), (v) => {
      applyAudio(updateSettings({ sfx: Number(v) as SoundLevel }));
      if (v !== '0') audio.sfx('play');
    });
    // 一下关掉全部声音：不动上面两档，取消后回到原来的档
    row(colL, rowY(2), '全部声音');
    seg(colL, rowY(2), 120, [{ label: '开着', value: '0' }, { label: '静音', value: '1' }], s.muted ? '1' : '0', (v) => applyAudio(updateSettings({ muted: v === '1' })));
  };

  const pageGame = (s: Settings): void => {
    row(colL, rowY(0), '动画速度');
    seg(colL, rowY(0), 120, [{ label: '慢', value: 'slow' }, { label: '中', value: 'normal' }, { label: '快', value: 'fast' }], s.speed, (v) => updateSettings({ speed: v as Settings['speed'] }));
    row(colL, rowY(1), '电脑难度');
    seg(colL, rowY(1), 120, [{ label: '新手', value: 'novice' }, { label: '普通', value: 'normal' }, { label: '高手', value: 'pro' }], s.difficulty, (v) => {
      updateSettings({ difficulty: v as Settings['difficulty'] });
      if (app.session) app.session.difficulty = v as Settings['difficulty'];
    });
    row(colL, rowY(2), '牌背');
    seg(colL, rowY(2), 120, [{ label: '红', value: '0' }, { label: '绿', value: '1' }], String(s.back), (v) => updateSettings({ back: Number(v) as 0 | 1 }));
    // 别人（好友房的人、单机的电脑）的互动（短语、表情、道具，docs/table-fun.md 第 5 节）：关掉就不看也不听，单机的电脑也不发（自己照样能发）
    row(colR, rowY(0), '互动');
    seg(colR, rowY(0), 84, [{ label: '开', value: '1' }, { label: '不看', value: '0' }], s.taunts ? '1' : '0', (v) => updateSettings({ taunts: v === '1' }));
    // 聊天（好友房 0.22.0、单机 0.23.0）：开 / 不和陌生人（快速匹配桌上不收不发打字，下次进匹配桌生效）/ 不看，存的还是 chat、strangerChat 两项
    row(colR, rowY(1), '聊天');
    seg(colR, rowY(1), 84, [{ label: '开', value: '1' }, { label: '不和陌生人', value: 'friends' }, { label: '不看', value: '0' }],
      !s.chat ? '0' : s.strangerChat ? '1' : 'friends',
      (v) => updateSettings(v === '0' ? { chat: false } : { chat: true, strangerChat: v === '1' }), 124);
    // 分组末尾：重看引导
    const tb = new Button(scene, colR + 90, rowY(2), 180, 50, '重看引导', 'wood', () => {
      setTutorialDone(false);
      setDdzTutorialDone(false);
      m.close();
      opts.onTutorial?.();
    }, 'restart');
    tb.setHit(180, Math.min(P, minHit()));
    page.add(tb);
  };

  const pageRules = (s: Settings): void => {
    // 地方规则：下一局生效（说明写在恢复默认那一行的左边）
    const rules = { ...DEFAULT_OPTIONS, ...s.rules };
    const setRule = (patch: Partial<Settings['rules']>): void => {
      updateSettings({ rules: { ...getSettings().rules, ...patch } });
    };
    const rule = (i: number, label: string, items: { label: string; value: string }[], cur2: string, pick: (v: string) => void): void => {
      page.add(text(scene, colL, rowY(i), label, { size: TYPE.body, ox: 0, wrap: 560, align: 'left' }));
      // 宽度也要 minHit()（568 宽的手机上 92 只合 41 CSS 像素）
      seg(colL, rowY(i), 600, items, cur2, pick, Math.max(104, minHit()));
    };
    rule(0, '三带二能带一对王', [{ label: '能', value: '1' }, { label: '不能', value: '0' }], rules.fullHouseJokerPair ? '1' : '0', (v) => setRule({ fullHouseJokerPair: v === '1' }));
    rule(1, '打 A 没过几次退回打 2', [{ label: '3 次', value: '3' }, { label: '不退', value: '0' }], String(rules.aFailLimit === 0 ? 0 : 3), (v) => setRule({ aFailLimit: Number(v) }));
    rule(2, '双下两人合计两张大王抗贡', [{ label: '算', value: '1' }, { label: '不算', value: '0' }], rules.antiTributeCombined ? '1' : '0', (v) => setRule({ antiTributeCombined: v === '1' }));
    page.add(text(scene, colL, resetY, '新开一局时生效', { size: TYPE.small, color: COLOR.muted, ox: 0 }));
  };

  const tabBtns: Button[] = [];
  const show = (i: number): void => {
    cur = i;
    page.removeAll(true);
    tabBtns.forEach((t, j) => t.setAlpha(j === cur ? 1 : 0.62));
    const s = getSettings();
    if (i === 0) pageSound(s);
    else if (i === 1) pageGame(s);
    else pageRules(s);
  };
  SETTINGS_TABS.forEach((t, i) => {
    const btn = new Button(scene, tabX(i, SETTINGS_TABS.length), tabY, 150, 48, t, 'wood', () => show(i));
    tabBtns.push(btn);
    b.add(btn);
  });

  // 恢复默认：一下回到初值，只动设置
  const resetY = rowY(2) + P * 0.5 + 50;
  b.add(new Button(scene, 0, resetY, 200, 52, '恢复默认', 'quiet', () => {
    const s = resetSettings();
    applyAudio(s);
    if (app.session) app.session.difficulty = s.difficulty;
    show(cur);
  }, 'restart').setHit(200, Math.min(P, minHit())));
  show(0);
  return m;
}

const STATS_TABS = ['总览', '掼蛋', '斗地主'];
const NO_RATE = '—';

/**
 * 战绩：总览 + 每个玩法一个页签（仓库 docs/ui.md 第 9 节"按游戏分的内容"），打开时停在主页当前选的玩法上。
 * 每页一排六格；这一页还没打过就摆空状态，不摆一排 0。
 */
export function openStats(scene: Phaser.Scene): Modal {
  const PW = panelW(scene);
  const PH = 400;
  const m = modal(scene, PW, PH, '战绩', { dismissOnOutside: true });
  const page = scene.add.container(0, 0);
  m.body.add(page);
  const tabY = -PH / 2 + 100;
  const y = tabY + 150;
  // 没打过的胜率写"—"用灰色：红色在这里是输
  const pct = (a: number, b: number): string => (b > 0 ? `${Math.round((a / b) * 100)}%` : NO_RATE);

  const empty = (line: string): void => {
    page.add(scene.add.image(-PW / 2 + 150, y, 'avatar:me:happy').setDisplaySize(140, 140));
    page.add(text(scene, -PW / 2 + 260, y - 34, '还没打过一局', { size: TYPE.title, bold: true, color: COLOR.ink, ox: 0 }));
    page.add(text(scene, -PW / 2 + 260, y + 20, line, { size: TYPE.label, color: COLOR.muted, ox: 0 }));
  };
  const cells = (list: [string, string, number][]): void => {
    // 一排六格，格宽跟着面板宽
    const gap = SPACE.md;
    const cw = Math.min(170, (PW - SPACE.xxl * 2 - gap * 5) / 6);
    list.forEach(([label, val, color], i) => {
      const x = (i - 2.5) * (cw + gap);
      const g = scene.add.graphics();
      g.fillStyle(0xf3e6c9, 1).fillRoundedRect(x - cw / 2, y - 64, cw, 128, 14);
      g.lineStyle(2, 0xd8c39a, 1).strokeRoundedRect(x - cw / 2, y - 64, cw, 128, 14);
      page.add(g);
      page.add(text(scene, x, y - 14, val, { size: TYPE.big + 4, bold: true, color: val === NO_RATE ? COLOR.muted : color, font: 'num' }));
      page.add(text(scene, x, y + 38, label, { size: TYPE.label, color: COLOR.muted }));
    });
  };

  const pages = [
    (): void => {
      const g = getStats();
      const d = getDdzStats();
      const games = g.games + d.games;
      if (games === 0 && g.deals === 0 && d.deals === 0) return empty('打完第一局，这里会记下掼蛋和斗地主的胜率');
      cells([
        ['一共几局', String(games), COLOR.ink],
        ['胜率', pct(g.wins + d.wins, games), COLOR.red],
        ['掼蛋', String(g.games), COLOR.ink],
        ['掼蛋胜率', pct(g.wins, g.games), COLOR.goldDark],
        ['斗地主', String(d.games), COLOR.ink],
        ['斗地主胜率', pct(d.wins, d.games), COLOR.goldDark],
      ]);
    },
    (): void => {
      const st = getStats();
      if (st.games === 0 && st.deals === 0) return empty('打完第一局，这里会记下你的胜率、连胜和拿头游的次数');
      cells([
        ['局数', String(st.games), COLOR.ink],
        ['胜率', pct(st.wins, st.games), COLOR.red],
        ['最高连胜', String(st.bestStreak), COLOR.goldDark],
        ['当前连胜', String(st.streak), COLOR.ink],
        ['打过副数', String(st.deals), COLOR.ink],
        ['拿头游', String(st.firsts), COLOR.red],
      ]);
    },
    (): void => {
      const st = getDdzStats();
      if (st.games === 0 && st.deals === 0) return empty('打完第一局，这里会记下你的胜率、当地主和春天的次数');
      cells([
        ['局数', String(st.games), COLOR.ink],
        ['胜率', pct(st.wins, st.games), COLOR.red],
        ['打过副数', String(st.deals), COLOR.ink],
        ['当地主', String(st.landlord), COLOR.ink],
        ['地主胜率', pct(st.landlordWins, st.landlord), COLOR.goldDark],
        ['春天', String(st.springs), COLOR.red],
      ]);
    },
  ];
  const tabBtns: Button[] = [];
  const show = (i: number): void => {
    page.removeAll(true);
    tabBtns.forEach((t, j) => t.setAlpha(j === i ? 1 : 0.62));
    pages[i]?.();
  };
  STATS_TABS.forEach((t, i) => {
    const btn = new Button(scene, tabX(i, STATS_TABS.length), tabY, 150, 48, t, 'wood', () => show(i));
    tabBtns.push(btn);
    m.body.add(btn);
  });
  show(getVariant() === 'ddz' ? 2 : 1);
  return m;
}

/**
 * onClose：不管点哪个按钮，关掉时都会调（牌桌靠它把 overlay 清掉，不然人和电脑都不再出牌）。
 * msg 给若干行（SignedRow）时每行用 signedLine 画、输赢数字红绿（浅底，不用 dark）；窗高随行数加，按钮跟着往下
 */
export function confirm(scene: Phaser.Scene, msg: string | readonly SignedRow[], okLabel: string, onOk: () => void, onClose?: () => void): Modal {
  const rows = typeof msg === 'string' ? null : msg;
  const LH = 36;
  const h = rows ? Math.max(280, rows.length * LH + 170) : 280;
  const by = h / 2 - 70;
  const m = modal(scene, 560, h, undefined, { closeBtn: false, onClose });
  if (rows) {
    // 文字块在按钮上方居中
    const top = (-h / 2 + 30 + (by - 29 - 10)) / 2 - ((rows.length - 1) * LH) / 2;
    rows.forEach((r, i) => m.body.add(signedLine(scene, 0, top + i * LH, r.tpl, r.nums, { size: TYPE.title, bold: true })));
  } else {
    m.body.add(text(scene, 0, -50, msg as string, { size: TYPE.title, bold: true, wrap: 460 }));
  }
  const cancel = new Button(scene, -120, by, 180, 58, '算了', 'wood', () => m.close());
  m.body.add(cancel);
  m.body.setData('cancel', cancel);
  const ok = new Button(scene, 120, by, 180, 58, okLabel, 'red', () => {
    m.close();
    onOk();
  });
  m.body.add(ok);
  // 调试桥 / 冒烟按这个找"确定"
  m.body.setData('ok', ok);
  return m;
}

/** 规则页：三页（牌型 / 大小 / 怎么打），全部用图示，文字只做标注。level：牌桌上打开时传本副级数，例子跟着变；标题页没有牌局，用 7 举例。 */
export function openRules(scene: Phaser.Scene, onClose?: () => void, level?: number): Modal {
  const m = modal(scene, panelW(scene), 640, '规则', { onClose, dismissOnOutside: true });
  const b = m.body;
  const page = scene.add.container(0, 0);
  b.add(page);
  const tabs = ['牌型', '谁大', '怎么打', ...(hasPointerKeys() ? ['快捷键'] : [])];
  let cur = 0;
  const tabBtns: Button[] = [];
  const show = (i: number): void => {
    cur = i;
    page.removeAll(true);
    tabBtns.forEach((t, j) => t.setAlpha(j === cur ? 1 : 0.62));
    if (i === 0) pagePatterns(scene, page, level);
    else if (i === 1) pageOrder(scene, page, level);
    else if (i === 2) pageFlow(scene, page);
    else pageKeys(scene, page);
  };
  tabs.forEach((t, i) => {
    const btn = new Button(scene, tabX(i, tabs.length), -248, 150, 48, t, 'red', () => show(i));
    tabBtns.push(btn);
    b.add(btn);
  });
  show(0);
  return m;
}

/** 斗地主的规则页：牌型图示 + 叫分、算分两页文字（文字在 doudizhu/rules.ts，牌桌和主页共用） */
export function openDdzRules(scene: Phaser.Scene, onClose?: () => void): Modal {
  const m = modal(scene, panelW(scene), 640, '斗地主怎么玩', { onClose, dismissOnOutside: true });
  const b = m.body;
  const page = scene.add.container(0, 0);
  b.add(page);
  const tabBtns: Button[] = [];
  const show = (i: number): void => {
    page.removeAll(true);
    tabBtns.forEach((t, j) => t.setAlpha(j === i ? 1 : 0.62));
    if (i >= DDZ_RULE_TABS.length) return pageKeys(scene, page);
    const lines = DDZ_RULE_TABS[i]!.lines;
    let y = -190;
    if (i === 0) {
      DDZ_PATTERNS.forEach((p, k) => page.add(patternTile(scene, -405 + (k % 4) * 270, -170 + Math.floor(k / 4) * 124, p, 254)));
      y = 210;
    }
    for (const l of lines) {
      const t = text(scene, -520, y, l, { size: i === 0 ? TYPE.label : TYPE.body, color: COLOR.ink, ox: 0, oy: 0, wrap: 1040, align: 'left' });
      page.add(t);
      y += t.height + (i === 0 ? 6 : 16);
    }
  };
  const tabs = [...DDZ_RULE_TABS.map((t) => t.tab), ...(hasPointerKeys() ? ['快捷键'] : [])];
  tabs.forEach((t, i) => {
    const btn = new Button(scene, tabX(i, tabs.length), -248, 150, 48, t, 'red', () => show(i));
    tabBtns.push(btn);
    b.add(btn);
  });
  show(0);
  return m;
}

/** 规则页顶上的页签：n 个一排、整排居中，间距 170 */
function tabX(i: number, n: number): number {
  return (i - (n - 1) / 2) * 170;
}

/** 快捷键一页（只在电脑上有这一页）：左边键，右边干什么 */
function pageKeys(scene: Phaser.Scene, page: Phaser.GameObjects.Container): void {
  page.add(text(scene, -520, -190, '用键盘打得更快', { size: TYPE.title, bold: true, ox: 0, color: COLOR.red }));
  SHORTCUT_HELP.forEach((r, i) => {
    const y = -120 + i * 58;
    page.add(text(scene, -520, y, r.keys, { size: TYPE.body, bold: true, ox: 0, color: COLOR.ink }));
    page.add(text(scene, -250, y, r.what, { size: TYPE.body, ox: 0, color: COLOR.ink, align: 'left' }));
  });
}

/** 举例用的级数和说法："本副打 J" 或 "比如打 7 时" */
function levelExample(level: number | undefined): { lv: number; when: string } {
  if (level === undefined) return { lv: 7, when: '比如打 7 时' };
  return { lv: level, when: `本副打 ${levelName(level)}` };
}

function pagePatterns(scene: Phaser.Scene, page: Phaser.GameObjects.Container, level?: number): void {
  const { lv, when } = levelExample(level);
  PATTERNS.forEach((p, i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    const x = -405 + col * 270;
    const y = -130 + row * 128;
    page.add(patternTile(scene, x, y, p, 254));
  });
  // 第三行剩两格：逢人配说明
  const wx = 135 + 135;
  const g = scene.add.graphics();
  g.fillStyle(0xfff0d0, 1).fillRoundedRect(wx - 262, 68, 524, 116, 12);
  g.lineStyle(2.5, COLOR.gold, 1).strokeRoundedRect(wx - 262, 68, 524, 116, 12);
  page.add(g);
  page.add(miniCards(scene, wx - 210, 126, [makeCard(lv, 1)], 52, 0, lv));
  page.add(text(scene, wx - 160, 98, '逢人配：红桃级牌', { size: TYPE.body, bold: true, color: COLOR.red, ox: 0 }));
  page.add(text(scene, wx - 160, 144, `万能牌，能当除王以外的任何牌\n（${when}，就是红桃 ${levelName(lv)}）`, { size: TYPE.small, color: COLOR.ink, ox: 0, align: 'left' }));
}

function pageOrder(scene: Phaser.Scene, page: Phaser.GameObjects.Container, level?: number): void {
  const { lv, when } = levelExample(level);
  // 单张大小：大王 > 小王 > 级牌 > A > K … > 2（级牌从原位置拿掉，例子里不重复出现）
  page.add(text(scene, -520, -180, '单张大小', { size: TYPE.title, bold: true, ox: 0, color: COLOR.red }));
  page.add(text(scene, -520, -146, when, { size: TYPE.small, color: COLOR.muted, ox: 0 }));
  const rest = [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2].filter((r) => r !== lv);
  const picks = [rest[0]!, rest[1]!, rest[2]!, rest[4]!, rest[rest.length - 4]!, rest[rest.length - 1]!];
  const order = [makeCard(17, 0), makeCard(16, 0), makeCard(lv, 0), ...picks.map((r, i) => makeCard(r, [2, 3, 0, 1, 2, 3][i]!))];
  order.forEach((c, i) => {
    page.add(miniCards(scene, -330 + i * 92, -150, [c], 56, 0, lv));
    if (i < order.length - 1) page.add(text(scene, -330 + i * 92 + 46, -150, i === 6 ? '…' : '>', { size: TYPE.title, bold: true, color: COLOR.muted }));
  });
  page.add(text(scene, -330 + 2 * 92, -92, '级牌', { size: TYPE.small, bold: true, color: COLOR.goldDark }));

  // 炸弹梯子
  page.add(text(scene, -520, -30, '炸弹谁大', { size: TYPE.title, bold: true, ox: 0, color: COLOR.red }));
  page.add(text(scene, -520, 4, '炸弹能压任何普通牌型', { size: TYPE.small, color: COLOR.muted, ox: 0 }));
  const ladder = ['4 张', '5 张', '同花顺', '6 张', '7 张', '8 张', '9 张', '10 张', '天王炸'];
  ladder.forEach((l, i) => {
    const x = -330 + i * 104;
    const h = 30 + i * 13;
    const g = scene.add.graphics();
    const col = i === ladder.length - 1 ? COLOR.gold : i === 2 ? 0xd2603a : COLOR.red;
    g.fillStyle(col, 1).fillRoundedRect(x - 42, 110 - h, 84, h, 8);
    page.add(g);
    page.add(text(scene, x, 110 - h - 18, l, { size: TYPE.label, bold: true, color: i === ladder.length - 1 ? COLOR.goldDark : COLOR.ink }));
  });
  page.add(text(scene, -40, 150, '小  →  大', { size: TYPE.body, bold: true, color: COLOR.muted }));

  page.add(text(scene, -520, 200, '其他牌型：同牌型、同张数才能比，比点数', { size: TYPE.label, color: COLOR.ink, ox: 0 }));
  page.add(text(scene, -520, 232, '顺子里 A 可当 1 也可当 14，级牌按本来的位置', { size: TYPE.label, color: COLOR.ink, ox: 0 }));
}

function pageFlow(scene: Phaser.Scene, page: Phaser.GameObjects.Container): void {
  const items: [string, string, string][] = [
    ['组队', '你和对面的小美一队', 'cards'],
    ['出牌', '压过上家，或者不要；都不要时最后出牌的人再出', 'play'],
    ['接风', '有人出完了，大家都不要时由他的队友接着出', 'restart'],
    ['名次', '先出完的是头游，然后二游、三游、末游', 'crown'],
    ['升级', '头游那队升级：队友二游 +3，三游 +2，末游 +1', 'stats'],
    ['进贡', '末游把最大的牌给头游，头游还一张 10 以下的；两张大王可以抗贡', 'back'],
    ['打 A', '打 A 时拿头游、队友不是末游才算过 A，整局获胜', 'check'],
  ];
  items.forEach(([t, d, icon], i) => {
    const y = -170 + i * 64;
    const g = scene.add.graphics();
    g.fillStyle(i % 2 ? 0xf6ebd3 : 0xefe0c0, 1).fillRoundedRect(-540, y - 28, 1080, 56, 10);
    page.add(g);
    const ic = scene.add.image(-505, y, `icon:${icon}`).setDisplaySize(34, 34).setTint(COLOR.red);
    page.add(ic);
    page.add(text(scene, -470, y, t, { size: TYPE.body, bold: true, color: COLOR.red, ox: 0 }));
    page.add(text(scene, -360, y, d, { size: TYPE.label, color: COLOR.ink, ox: 0 }));
  });
}

export { css };
