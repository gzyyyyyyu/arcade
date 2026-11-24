/**
 * 设置面板（顶栏齿轮，docs/ui.md 第 8 节）：音量 / 茶馆声 / 电脑出牌 / 提示和互动四组，加「恢复默认」。
 * 齿轮挂在顶栏、面板挂在 stage 上，位置由 shell.ts 在搭骨架时调 mountSettings 定；每个开关改完调 repaint 让顶栏整体重画。
 * 不 import shell.ts：shell 在模块顶层就调这里，反过来引用会读到还没初始化的节点。
 */
import { setCutinFast } from '../view/cutin.ts';
import { button, el } from '../view/dom.ts';
import { chatMode, funOff, setChatMode, setFunOff, type ChatMode } from '../view/fun.ts';
import { play, setAmbience, setSound, setVolume } from '../view/sound.ts';
import { setSafeHint } from '../view/variants/riichi/ui.ts';
import { coachAllowed } from '../game/coach.ts';
import { live, prefs, resetSettings, savePrefs, setLiveSound } from './prefs.ts';
import { session } from './session.ts';
import { TIMING } from './timing.ts';

export interface Settings {
  paint(): void;
  close(): boolean;
}

/** 齿轮（24 格，八个齿 + 中间的孔，填充色跟着 currentColor） */
const GEAR_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="M10.3 2h3.4l.5 2.6 1.6.7 2.2-1.5 2.4 2.4-1.5 2.2.7 1.6 2.4.5v3.4l-2.6.5-.7 1.6 1.5 2.2-2.4 2.4-2.2-1.5-1.6.7-.5 2.6h-3.4l-.5-2.6-1.6-.7-2.2 1.5-2.4-2.4 1.5-2.2-.7-1.6L2 13.7v-3.4l2.6-.5.7-1.6-1.5-2.2 2.4-2.4 2.2 1.5 1.6-.7zM12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z"/></svg>';
export function mountSettings(topbar: HTMLElement, stage: HTMLElement, repaint: () => void): Settings {
  // 设置：顶栏只有一个齿轮（docs/ui.md 第 8 节；出牌速度也在里面，360 宽顶栏放不下单独的按钮），点开小面板，再点或点别处收起
  const soundBtn = button('icon gear', topbar, '', () => {
    volBox.hidden = !volBox.hidden;
    // 弹幕开关的字跟着这一桌的互动组件（开局才有）
    repaint();
  });
  soundBtn.innerHTML = GEAR_SVG;
  soundBtn.setAttribute('aria-label', '设置');
  soundBtn.title = '设置';
  const volBox = el('div', 'vol', stage);
  volBox.hidden = true;
  /** 面板分组（ui.md 第 8 节的顺序）：音量 / 茶馆声 / 速度（单机才有） / 提示，每组一个小标题 */
  const group = (title: string): HTMLElement => {
    const g = el('div', 'vol-group', volBox);
    el('p', 'vol-title', g, title);
    return g;
  };
  const gVol = group('音量');
  const gAmb = group('茶馆声');
  const gSpeed = group('电脑出牌');
  const gHint = group('提示和互动');
  const volRange = el('input', '', gVol) as HTMLInputElement;
  volRange.type = 'range';
  volRange.min = '0';
  volRange.max = '100';
  volRange.value = String(Math.round(prefs.volume * 100));
  volRange.setAttribute('aria-label', '音量');
  volRange.addEventListener('input', () => {
    prefs.volume = Number(volRange.value) / 100;
    setVolume(prefs.volume);
    if (prefs.volume > 0 && !live.sound) {
      setLiveSound(true);
      setSound(true);
    }
    repaint();
  });
  volRange.addEventListener('change', () => {
    savePrefs();
    play('button');
  });
  const muteBtn = button('act soft', gVol, '', () => {
    setLiveSound(!live.sound);
    setSound(live.sound);
    repaint();
  });
  const ambBtn = button('act soft', gAmb, '', () => {
    prefs.ambience = !prefs.ambience;
    setAmbience(prefs.ambience);
    savePrefs();
    repaint();
  });
  const speedBtn = button('act soft', gSpeed, '', () => {
    prefs.fast = !prefs.fast;
    savePrefs();
    applySpeed();
    repaint();
  });
  function applySpeed(): void {
    if (session.solo) session.solo.speed = prefs.fast ? TIMING.fastScale : 1;
  }
  // 安全牌提示（立直玩法才出现这个按钮）
  const safeBtn = button('act soft', gHint, '', () => {
    prefs.safeHint = !prefs.safeHint;
    setSafeHint(prefs.safeHint);
    savePrefs();
    repaint();
  });
  // 推荐出牌（单机娱乐新手、实盘小档才出现这个按钮，game/coach.ts）
  const coachBtn = button('act soft', gHint, '', () => {
    prefs.coach = !prefs.coach;
    savePrefs();
    applyCoach();
    repaint();
  });
  /** 这一桌该不该标推荐的牌：设置开着、而且是能开推荐的单机桌 */
  const coachHere = (): boolean => !!session.solo && coachAllowed(session.solo.save);
  function applyCoach(): void {
    session.table?.setCoach(prefs.coach && coachHere());
  }
  // 互动的总开关也放这儿（docs/table-fun.md 第 5 节）：关了别人的一律不播，单机电脑也不反应
  const funBtn = button('act soft', gHint, '', () => {
    setFunOff(!funOff());
    if (funOff()) session.fun?.closeAll();
    repaint();
  });
  // 聊天的开关（好友房和单机都有，三档轮着切）：对局里出现。
  // 不看：别人说的不显示，自己还能说；不和陌生人：只管快速匹配的桌，下次进匹配桌起不收也不能说
  const CHAT_NEXT: Record<ChatMode, ChatMode> = { on: 'stranger', stranger: 'off', off: 'on' };
  const CHAT_LABEL: Record<ChatMode, string> = { on: '聊天：开', stranger: '聊天：不和陌生人', off: '聊天：不看' };
  const chatBtn = button('act soft', gHint, '', () => {
    setChatMode(CHAT_NEXT[chatMode()]);
    repaint();
  });
  // 弹幕：和 kit 聊天框、面板里的"弹幕"同一份开关（存在 mahjong.chat）；对局里才有
  const danBtn = button('act soft', gHint, '', () => {
    session.fun?.setDanmaku(!session.fun.danmaku());
    repaint();
  });
  // 恢复默认：音量、静音、茶馆声、出牌速度、安全牌提示、推荐出牌、互动、聊天回出厂值，立刻生效并存回（弹幕随系统的减少动态设置，不在这里动）
  button('act soft reset', volBox, '恢复默认', () => {
    resetSettings();
    applySpeed();
    setVolume(prefs.volume);
    setSound(live.sound);
    setAmbience(prefs.ambience);
    setSafeHint(prefs.safeHint);
    applyCoach();
    setFunOff(false);
    setChatMode('on');
    volRange.value = String(Math.round(prefs.volume * 100));
    play('button');
    repaint();
  });
  document.addEventListener('pointerdown', (e) => {
    if (!volBox.hidden && !volBox.contains(e.target as Node) && e.target !== soundBtn) volBox.hidden = true;
  });

  return {
    /** 设置面板里各按钮的字和显隐，跟着现在在打单机、好友房还是没开局 */
    paint(): void {
      // 写的是现在的速度
      speedBtn.textContent = prefs.fast ? '速度：快' : '速度：常速';
      setCutinFast(prefs.fast);
      soundBtn.classList.toggle('muted', !(live.sound && prefs.volume > 0));
      muteBtn.textContent = live.sound ? '静音' : '开声';
      funBtn.textContent = funOff() ? '表情道具：不看' : '表情道具：显示';
      ambBtn.textContent = prefs.ambience ? '茶馆声：开' : '茶馆声：关';
      safeBtn.textContent = prefs.safeHint ? '安全牌提示：开' : '安全牌提示：关';
      safeBtn.hidden = !session.table?.root.classList.contains('rc');
      coachBtn.textContent = prefs.coach ? '推荐出牌：开' : '推荐出牌：关';
      coachBtn.hidden = !coachHere();
      chatBtn.textContent = CHAT_LABEL[chatMode()];
      chatBtn.hidden = !session.online && !session.solo;
      danBtn.textContent = session.fun?.danmaku() ? '弹幕：开' : '弹幕：关';
      danBtn.hidden = !session.fun;
      gSpeed.hidden = !session.solo;
    },
    /** 面板开着就关上、焦点还给齿轮，回 true；本来就关着回 false */
    close(): boolean {
      if (volBox.hidden) return false;
      volBox.hidden = true;
      soundBtn.focus({ preventScroll: true });
      return true;
    },
  };
}
