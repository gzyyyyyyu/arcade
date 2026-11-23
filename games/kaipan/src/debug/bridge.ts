import { runSummary, type Action, type GameEvent, type GameState, type RunSetup } from '../core/index.ts';
import { loadProfile, saveProfile, type Profile } from '../platform/profile.ts';
import { atlasStatus } from '../view/assets.ts';
import { saveViewed } from '../view/meta/prefs.ts';
import { presetProfile, type ProfilePreset } from './profiles.ts';
import type { Session } from '../view/session.ts';
import { loadTutorial, type TutorialProgress } from '../view/tutorial.ts';
import { RENDER_SCALE } from '../view/theme.ts';
import { cloudView } from '../view/cloudSync.ts';
import { runBoard, type RunBoard } from '../view/dailyBoard.ts';
import type { CloudView } from '../platform/cloud.ts';
import type { LiveRecord } from '../platform/live.ts';
import { live } from '../view/live.ts';
import type { Mood } from '../view/audio/index.ts';
import { sound, type CueRecord } from '../view/sound.ts';
import { longPressCount } from '../view/ui/clickGuard.ts';
import { focusedRect } from '../view/ui/focus.ts';
import { measureLayout, type Layout } from './layout.ts';

/** 挂在 window.__game 上的调试/自动化接口。 */
interface GameBridge {
  state(): GameState;
  /** 最近一次 dispatch（或开局）的事件 */
  events(): GameEvent[];
  /** 与界面走同一路径并播放动画 */
  dispatch(action: Action): { error: string | null };
  newRun(seed: string, setup?: RunSetup | null): { error: string | null };
  /** 直接换成给定局面（自动化：在 node 里用 core 推进到某一天再交给画面） */
  loadState(state: GameState): void;
  /** 触发「继续」（月底账单、事件结果等等待玩家的画面），没有在等待时返回 false */
  continue(): boolean;
  /** 跳过正在播放的动画（同点击 / 空格），没有动画时返回 false */
  skip(): boolean;
  /**
   * 当前场景主要控件的画布坐标（1280×720 坐标系）。
   * 交易：buy:0..2（推荐买入）、card:i（持仓卡中心）、sell:i（卖出，一步全卖）、more:i（加减，有仓位玩法时才有）、slot:i（替换 / 放稀有股票时选格子）、pick:cancel、open、settings、
   *       reward:0..2、reward:skip、event:0|1、continue（账单 / 事件结果）、guide:next、guide:close；
   * 对话框：confirm:ok、confirm:cancel、settings:done、settings:menu、settings:lobby（游戏内）、about:ok、notice:ok；
   * 开始菜单：continue、quick、new、live（实盘）、daily、flash（闪电盘）、weekly（本周市场）、codex、achievements、settings、about、cloud（云朵）、lobby（回大厅）；结束页：retry、new、menu（实盘局只有 menu）；
   * 开局面板：setup:persona:<id>、setup:diff:<n>、setup:tier:<档>（实盘）、setup:mode:fun|live、setup:start、setup:back；实盘：settings:quit-live、live:continue、live:quit；每日挑战：daily:start、daily:back；
   * 图鉴：codex:tab:<组>、codex:card:<i>、codex:close；达成弹窗：unlock:ok。
   */
  controls(): Record<string, { x: number; y: number }>;
  /** 画布里的控件框和看得见的文字（--noscroll 的重叠、裁字检查用，见 debug/layout.ts） */
  layout(): Layout;
  /** 命名区域（截图裁切用） */
  regions(): Record<string, { x: number; y: number; w: number; h: number }>;
  /** 键盘焦点框现在亮在哪（世界坐标）；没亮时为 null */
  focused(): { x: number; y: number; w: number; h: number } | null;
  /** 云存档状态（云朵显示的那个） */
  cloud(): CloudView;
  /** 当前这局在每日排行榜上的状态 */
  board(): RunBoard;
  /** 实盘的本机记录（kaipan.live） */
  live(): LiveRecord | null;
  /** 世界坐标 → 画布上的比例位置（0..1），按当前场景的相机换算（手机横屏时世界不是 1280×720） */
  toCanvas(x: number, y: number): { x: number; y: number };
  readonly ready: boolean;
  readonly idle: boolean;
  /** 是否停在等待「继续」的画面上 */
  readonly awaiting: boolean;
  readonly scene: string | null;
  /** 启动耗时（毫秒，从页面开始加载到首屏可操作） */
  readonly bootMs: number;
  /** 画布渲染倍数 */
  readonly renderScale: number;
  /** 实际帧率 */
  readonly fps: number;
  /** 游戏时钟（毫秒）：低帧率时比真实时间慢，长按这类按游戏时间计时的操作按它等 */
  readonly gameTime: number;
  /** 长按生效（按下被作废）的次数，冒烟等长按用 */
  readonly longPresses: number;
  /** 游戏循环累计时间（毫秒，不分场景）：场景切换也不会跳 */
  readonly loopTime: number;
  /** 最近 200 个音频 cue（含时间戳，毫秒） */
  readonly cues: CueRecord[];
  /** 素材加载进度 0..1 */
  readonly bootProgress: number;
  /** 当前背景音乐情绪 */
  readonly mood: Mood;
  /** 运行时统计（检查补间、纹理是否泄漏） */
  stats(): { tweens: number; textures: number; objects: number };
  /** 纹理、文字画布、主画布的像素（显存估算） */
  memory(): { textures: number; texturePx: number; texts: number; textPx: number; canvasPx: number; top: string[] };
  /** 暂停 / 恢复场景更新（截动画中途用） */
  freeze(on: boolean): void;
  /** 在 since（performance.now 毫秒）之后出现 type 这个 cue、再过 ms 毫秒时冻结画面（页面内计时，不受自动化往返延迟影响） */
  freezeAfterCue(type: string, since: number, ms: number): void;
  /**
   * 画面连续静下来几帧（补间、计时器、粒子、相机效果都播完）就冻结，最多等 maxMs 毫秒游戏时间；
   * 播完的画面只和游戏逻辑有关，不受脚本什么时候来截影响。超时冻结时 quietTimedOut 为 true。
   */
  freezeWhenQuiet(maxMs: number): void;
  readonly quietTimedOut: boolean;
  /** 画面是否已被 freeze 冻结 */
  readonly frozen: boolean;
  /** 调试：顶层显示对象的类型与深度 */
  displayList(): string[];
  /** 正在显示、纹理帧名含 needle 的图片个数（如 'blink'） */
  countFrames(needle: string): number;
  /** 教程进度（localStorage kaipan.tutorial.v3） */
  tutorial(): TutorialProgress;
  /** 当前档案（kaipan.profile） */
  profile(): Profile;
  /** 换档案：'fresh' 全新、'partial' 玩过几局、'all' 全解锁，或给一个完整档案；图鉴「已看过」随样本一起换。之后重建当前画面 */
  setProfile(p: ProfilePreset | Profile): void;
  /** 回开始菜单 */
  toTitle(): void;
  /** 图集状态：是否在用、页数、帧数、倍数；道具图标 / 眨眼素材是否已交付 */
  atlas(): ReturnType<typeof atlasStatus>;
}

declare global {
  interface Window {
    __game?: GameBridge;
  }
}

export function mountBridge(session: Session): void {
  // 每条提示发生时的游戏循环时间，freezeAfterCue 对已发生的提示用
  const cueLoopTime = new WeakMap<CueRecord, number>();
  sound.onCue((r) => cueLoopTime.set(r, session.loopTime));
  let quietTimedOut = false;
  window.__game = {
    state: () => session.state,
    events: () => session.events,
    dispatch: (action) => session.dispatch(action),
    newRun: (seed, setup = null) => session.newRun(seed, setup),
    loadState: (state) => session.load(state, []),
    continue: () => session.continue(),
    skip: () => session.skip(),
    controls: () => session.controls(),
    layout: () => measureLayout(session.viewScene, session.controls()),
    cloud: () => cloudView(),
    board: () => runBoard(runSummary(session.state).runId),
    live: () => (live.record ? { ...live.record } : null),
    regions: () => session.regions(),
    focused: () => focusedRect(),
    toCanvas: (x, y) => session.toCanvas(x, y),
    get ready() {
      return session.ready;
    },
    get idle() {
      return session.idle;
    },
    get awaiting() {
      return session.awaiting;
    },
    get scene() {
      return session.sceneKey;
    },
    get bootMs() {
      return session.bootMs;
    },
    renderScale: RENDER_SCALE,
    get fps() {
      return session.fps;
    },
    get gameTime() {
      return session.gameTime;
    },
    get longPresses() {
      return longPressCount();
    },
    get loopTime() {
      return session.loopTime;
    },
    get cues() {
      return sound.recent();
    },
    get bootProgress() {
      return session.bootProgress;
    },
    get mood() {
      return sound.currentMood;
    },
    stats: () => session.stats(),
    memory: () => session.memory(),
    displayList: () => session.displayList(),
    tutorial: () => loadTutorial(),
    countFrames: (needle) => session.countFrames(needle),
    atlas: () => atlasStatus(),
    profile: () => loadProfile().profile,
    setProfile: (p) => {
      if (typeof p === 'string') {
        const preset = presetProfile(p);
        saveProfile(preset.profile);
        saveViewed(preset.viewed);
      } else saveProfile(p);
      session.redraw();
    },
    toTitle: () => session.toTitle(),
    freeze: (on) => session.freeze(on),
    freezeAfterCue: (type, since, ms) => {
      // 按游戏时间冻结：真实时间受机器负载影响，同一段毫秒数会停在不同的帧；游戏时间（自动化下固定步长）只看帧数
      const arm = (t0: number): void => {
        const off = session.onFrame(() => {
          if (session.loopTime < t0 + ms) return;
          off();
          session.freeze(true);
        });
      };
      const hit = sound.recent().find((c) => c.t >= since && c.cue.type === type);
      if (hit) {
        // 已经发生的提示：登记过游戏时间的用登记值，没有就按真实间隔往回推
        arm(cueLoopTime.get(hit) ?? session.loopTime - (performance.now() - hit.t));
        return;
      }
      const off = sound.onCue((r) => {
        if (r.t < since || r.cue.type !== type) return;
        off();
        arm(session.loopTime);
      });
    },
    freezeWhenQuiet: (maxMs) => {
      const t0 = session.loopTime;
      let still = 0;
      quietTimedOut = false;
      const off = session.onFrame(() => {
        still = session.quiet ? still + 1 : 0;
        const timeout = session.loopTime >= t0 + maxMs;
        if (still < 3 && !timeout) return;
        quietTimedOut = still < 3;
        off();
        session.freeze(true);
      });
    },
    get quietTimedOut() {
      return quietTimedOut;
    },
    get frozen() {
      return session.frozen;
    },
  };
}
