import Phaser from 'phaser';
import { reportErrors } from 'arcade-kit/report';
import { BRANCH_LEVEL, BUILDINGS, CAMPAIGN, branchOptions } from './content/index.ts';
import { TD_TOWER_KINDS, canPlace, produce, tdGrowthProfile, type TdTowerKind } from './core/index.ts';
import { dayIndex } from './view/meta.ts';
import { ISLAND, type BattleSetup, type Profile } from './core/types.ts';
import { escortLive, live, tdLive } from './net/live.ts';
import { startSnapshotSync } from './net/pvp.ts';
import { startCloud } from './platform/cloud.ts';
import { loadSave, saveHooks } from './platform/save.ts';
import { app, type Api } from './view/app.ts';
import { BaseScene } from './view/BaseScene.ts';
import { BattleScene, type BattleData } from './view/BattleScene.ts';
import { battleData } from './view/battlestart.ts';
import { TdScene, prepareTd, prepareTide } from './view/TdScene.ts';
import { checkRaided } from './view/pvp.ts';
import { piecesFor, tdPieces, troopF } from './view/art.ts';
import { bakeAll, bakeAtlas, ensureArt } from './view/textures.ts';
import { ensureTurrets } from './view/turret.ts';
import { RIG_TEX } from './view/rigsprite.ts';
import { rigAllPieces } from './view/art/rigparts.ts';
import { resumeLive } from './view/live.ts';
import { sfxStats, sfxStatsReset, unlockAudio } from './view/audio/sfx.ts';
import { confirmBox, glitchBanner, settingsButton, toast, uiRoot } from './view/ui.ts';
import { LOW_MEMORY, fitViewport, renderScale } from './view/viewport.ts';
import { glRenderer, wantMsaa } from './view/msaa.ts';
import { SEA_BG } from './view/ground.ts';

// 页面里没人接住的报错发给平台（共用包 0.22）：只带报错、调用栈、路径、游戏和版本；单独部署没有平台时发不出去也不影响玩
reportErrors({ game: 'haidao', version: __APP_VERSION__ });

declare global {
  interface Window {
    __haidao: Api;
  }
}

const q = new URLSearchParams(location.search);
/** 离线最多补多久：和矿自身的上限（12 小时产量，content/buildings.ts）一致，再长矿也装不下 */
const OFFLINE_MAX = 12 * 3600;

/** 打开时按离开的真实时间补算产出（最多 12 小时） */
function loadWithOffline(): void {
  const s = loadSave();
  if (s.lastSeen > 0) s.profile = produce(s.profile, Math.max(0, Math.min(OFFLINE_MAX, (Date.now() - s.lastSeen) / 1000)));
  // 老玩家（已经出过海）不再引导
  if (s.profile.stats.attacks > 0 && s.profile.tutorial < 7) s.profile = { ...s.profile, tutorial: 7 };
  s.lastSeen = Date.now();
  app.save = s;
}

class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }
  create(): void {
    this.loadArt();
  }

  /** 首屏素材：进度条 + 百分比；失败说清下一步并给"重试"（点了重新装一遍，已装好的不重烘） */
  private loadArt(): void {
    const boot = document.getElementById('boot');
    const tip = boot?.querySelector('span');
    const fill = boot?.querySelector<HTMLElement>('.bar i');
    boot?.querySelector('button')?.remove();
    const setProgress = (pct: number): void => {
      if (tip) tip.textContent = `正在起锚… ${pct}%`;
      if (fill) fill.style.width = `${pct}%`;
    };
    setProgress(0);
    bakeAll(this.textures, app.r, (d, t) => setProgress(Math.round((d / t) * 100)))
      // 兵和守岛敌人的分件骨架部件烘进一张图集（rigsprite.ts）
      .then(() => bakeAtlas(this.textures, RIG_TEX, rigAllPieces(), app.r))
      .then(() => ensureArt(this.textures, piecesFor(app.profile.base.buildings), app.r))
      .then(() => {
        document.getElementById('boot')?.remove();
        const id = q.get('battle');
        if (id && CAMPAIGN.some((l) => l.id === id)) {
          app.volatile = true;
          app.startBattle(id, q.has('auto'));
        } else {
          this.scene.start('base');
          // 异步攻防：取回被打掉的 / 打来的资源，你不在时被打了就提示（冒烟的演示局不查）
          if (!app.volatile) {
            void checkRaided();
            // 悬赏出海：上次没结完的一份先收尾
            resumeLive();
          }
        }
      })
      .catch((e: unknown) => {
        console.error(e);
        if (tip) tip.textContent = '画面素材没装好，可能是网络不稳或手机内存紧。进度都存着，点“重试”再装一次';
        if (boot && !boot.querySelector('button')) {
          const b = document.createElement('button');
          b.type = 'button';
          b.textContent = '重试';
          b.addEventListener('click', () => this.loadArt());
          boot.appendChild(b);
        }
      });
  }
}

function main(): void {
  loadWithOffline();
  const r = (app.r = renderScale());
  uiRoot();
  settingsButton();
  // 声音要在用户手势里解锁（iOS）
  // 画布里的双指缩放（CamCtl）不能同时触发 iOS 的页面缩放：gesturestart 是 Safari 的捏合手势事件，取消它
  document.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false });
  addEventListener('pointerdown', unlockAudio);
  addEventListener('keydown', unlockAudio);
  const host = document.getElementById('app')!;
  const cloud = startCloud({
    onApplied: () => {
      app.save = loadSave();
      app.reload();
    },
  });
  // 异步攻防：存档写完后防抖上传基地快照（单独部署、没登录时自动停）
  const snap = startSnapshotSync(() => app.save);
  saveHooks.onWrite = () => {
    cloud.touch('profile');
    snap.touch();
  };

  const game = (app.game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: host,
    width: Math.max(1, host.clientWidth) * r,
    height: Math.max(1, host.clientHeight) * r,
    backgroundColor: SEA_BG,
    // 画布按 r 倍实际像素画，再用 CSS 缩回（手机封顶 2 倍省显存）
    scale: { mode: Phaser.Scale.NONE, zoom: 1 / r },
    // ?mt1：只用一个纹理单元合批。没有 GPU 的无头 Chrome（SwiftShader）多纹理合批会取错纹理、精灵随机缺整块，录屏时加这个；正常玩家不加
    // 多重采样（antialiasGL）按渲染器决定：软件光栅（没显卡）的电脑上关，真 GPU、读不到渲染器、手机平板都开，理由见 view/msaa.ts。?msaa=1 / ?msaa=0 强制（帧率 A/B 用）
    render: { antialias: true, antialiasGL: wantMsaa(LOW_MEMORY, LOW_MEMORY ? null : glRenderer(), q.get('msaa')), powerPreference: 'high-performance', maxTextures: q.has('mt1') ? 1 : -1 },
    banner: false,
    audio: { noAudio: true },
    scene: [BootScene, BaseScene, BattleScene, TdScene],
  }));

  // WebGL 上下文丢了（显存吃紧时 iOS 会收回）Phaser 会等它恢复；3 秒还没恢复才提示刷新，恢复就收起，同一时间只有一条
  game.events.once(Phaser.Core.Events.READY, () => {
    let wait: ReturnType<typeof setTimeout> | null = null;
    let close: (() => void) | null = null;
    game.canvas.addEventListener('webglcontextlost', () => {
      if (wait || close) return;
      wait = setTimeout(() => {
        wait = null;
        close = glitchBanner();
      }, 3000);
    });
    game.canvas.addEventListener('webglcontextrestored', () => {
      if (wait) clearTimeout(wait);
      wait = null;
      close?.();
      close = null;
    });
  });

  fitViewport(() => {
    game.scale.resize(Math.max(1, host.clientWidth) * r, Math.max(1, host.clientHeight) * r);
    game.scale.setZoom(1 / r);
  });

  const toScene = (key: string, data?: object): void => {
    const cur = game.scene.getScenes(true)[0];
    if (cur) cur.scene.start(key, data);
    else game.scene.start(key, data);
  };
  app.goBase = () => void ensureArt(game.textures, piecesFor(app.profile.base.buildings), r).finally(() => toScene('base'));
  // 驻岛英雄借船长的帧：进攻方没带船长时开局没烘，这里一起补
  const battlePieces = (st: BattleSetup) => [...piecesFor(st.layout), ...(st.hero ? (['idle', 'walk', 'attack'] as const).flatMap((an) => troopF('captain', an)) : [])];
  app.startBattle = (levelId, auto, setup, opts) => {
    const data = battleData(levelId, auto, setup, opts, q);
    if (!data) return;
    const s = data.setup;
    // 敌岛里用到的（种类, 等级）没烘过的先烘，再开战；烘不出来也能开（用低等级顶替）
    void Promise.all([ensureArt(game.textures, battlePieces(s), r), ensureTurrets(game.textures, s.layout, r)]).finally(() => toScene('battle', data));
  };
  app.startTdLevel = (levelId) => {
    void prepareTd(levelId, game.textures, r).then((res) => {
      if (res.ok) toScene('td', res.data);
      else toast(res.error === 'locked' ? '这一关还没解锁' : '开不了这一关');
    });
  };
  app.startEscortLive = (levelId, setup, tier) => {
    void prepareTd(levelId, game.textures, r, { setup, tier }).then((res) => {
      if (res.ok) toScene('td', res.data);
      else toast('开不了这一局');
    });
  };
  app.startTdTide = () => {
    void prepareTide(game.textures, r).then((data) => toScene('td', data));
  };
  app.startTdLive = (setup, tier) => {
    // 悬赏守岛：岛是固定模板，素材和战役守岛同一批
    void Promise.all([ensureArt(game.textures, tdPieces(), r), ensureTurrets(game.textures, setup.layout, r)])
      .catch(() => undefined)
      .finally(() => toScene('td', { levelId: 'tdlive', setup, speed: q.has('fast') ? 4 : 1, live: { tier } }));
  };
  app.startPvp = (setup, pvp) => {
    const data: BattleData = { levelId: 'pvp', setup, auto: false, settle: false, speed: q.has('fast') ? 4 : 1, pvp };
    // 对手岛上的（种类, 等级）没烘过的先烘，和 startBattle 一样
    void Promise.all([ensureArt(game.textures, battlePieces(setup), r), ensureTurrets(game.textures, setup.layout, r)]).finally(() => toScene('battle', data));
  };
  app.startMapStop = (setup, map) => {
    const data: BattleData = { levelId: 'map', setup, auto: false, settle: false, speed: q.has('fast') ? 4 : 1, map };
    void Promise.all([ensureArt(game.textures, battlePieces(setup), r), ensureTurrets(game.textures, setup.layout, r)]).finally(() => toScene('battle', data));
  };
  // 测试辅助：音效触发统计（每种请求 / 放出 / 被限频或并发上限丢掉几次）和最近 40 次；只读计数，不影响声音
  // 测试辅助：手动按固定帧长推帧（录 60 帧视频，不受没有 GPU 时实际帧率的影响）
  let stepT = -1;
  app.api.frameStep = (n, ms) => {
    if (stepT < 0) {
      game.loop.sleep();
      stepT = game.loop.now;
    }
    for (let i = 0; i < n; i++) game.loop.step((stepT += ms));
  };
  app.api.frameEnd = () => {
    if (stepT < 0) return;
    stepT = -1;
    game.loop.wake();
  };
  app.api.sfxStats = sfxStats;
  app.api.sfxStatsReset = sfxStatsReset;
  app.api.battle = (id, auto) => {
    app.volatile = true;
    app.startBattle(id, auto);
  };
  /**
   * 测试辅助：塔选上分叉，按塔种在 TD_TOWER_KINDS 里的序号交替——偶数位够 6 级的两档都选，其余只选第一档；
   * 驻守台卡片上一张、两张分叉牌都有，noscroll 的重叠检查才覆盖得到
   */
  const withBranches = (base: Profile['base']): Profile['base'] => ({
    ...base,
    buildings: base.buildings.map((b) => {
      const o1 = branchOptions(b.kind, 1)[0];
      if (!o1 || b.level < BRANCH_LEVEL[1]) return b;
      const o2 = TD_TOWER_KINDS.indexOf(b.kind as TdTowerKind) % 2 === 0 && b.level >= BRANCH_LEVEL[2] ? branchOptions(b.kind, 2)[0] : undefined;
      return { ...b, branch: o2 ? [o1.id, o2.id] : [o1.id] };
    }),
  });
  /**
   * 开发档：tdGrowthProfile 的塔坐标只是占位（模拟只看每种塔的最高等级，全挤在第 0 行），验收截图里塔排成一排压在岛边。
   * 在离主寨约 RING 格的一圈上、隔 4 格的点里找空地摆开：高等级塔的画比占地高大，挨着主寨摆会叠成一团
   */
  const spreadTowers = (base: Profile['base']): Profile['base'] => {
    const isTower = (k: string): boolean => (TD_TOWER_KINDS as readonly string[]).includes(k);
    const hq = base.buildings.find((b) => b.kind === 'hq');
    const c = hq ? hq.x + BUILDINGS.hq.size / 2 : ISLAND / 2;
    const cy = hq ? hq.y + BUILDINGS.hq.size / 2 : ISLAND / 2;
    const spots: Array<[number, number]> = [];
    const RING = 6.5;
    for (let x = 1; x < ISLAND - 2; x += 4) for (let y = 1; y < ISLAND - 2; y += 4) spots.push([x, y]);
    const off = (q: [number, number]): number => Math.abs(Math.hypot(q[0] + 1 - c, q[1] + 1 - cy) - RING);
    spots.sort((a, b) => off(a) - off(b));
    const p: Profile = { ...app.profile, base: { ...base, buildings: base.buildings.filter((b) => !isTower(b.kind)) } };
    for (const t of base.buildings.filter((b) => isTower(b.kind))) {
      const at = spots.find(([x, y]) => canPlace(p, t.kind, x, y));
      p.base.buildings.push(at ? { ...t, x: at[0], y: at[1] } : t);
    }
    return p.base;
  };
  if (q.has('dev')) {
    // 测试辅助：给资源和星数，不写存档（volatile）
    app.volatile = true;
    app.api.dev = {
      td: (hq, branch = false, hero) => {
        // 建议养成的存档：每种能造的塔各一座、英雄等级跟主寨，战役全部 1★；资源给够
        const g = tdGrowthProfile({ hq }, 'suggest');
        const base = spreadTowers(g.base);
        app.save.profile = { ...app.profile, base: branch ? withBranches(base) : base, res: { gold: 5000, wood: 5000 }, tutorial: 99, stats: { ...app.profile.stats, attacks: 1 }, research: { ...app.profile.research, hero: hero ?? g.research.hero ?? 1 }, td: { ...g.td!, day: dayIndex(), gotGold: 0, gotWood: 0 } };
        app.reload();
      },
      load: (p) => {
        app.save.profile = p;
        app.reload();
      },
      give: (gold, wood, stars) => {
        const star: Record<string, number> = {};
        let left = stars;
        for (const l of CAMPAIGN) {
          const n = Math.min(3, left);
          if (n > 0) star[l.id] = n;
          left -= n;
        }
        app.save.profile = { ...app.profile, res: { gold, wood }, stars: star };
        app.reload();
      },
    };
  }
  window.__haidao = app.api;

  app.leave = () => {
    const go = (): void => {
      app.flush();
      cloud.hidden(true);
      location.assign('/');
    };
    // 实盘局离开后，下次打开按 0 倍结回（resumeLive），要先说清楚会输掉带进去的那一份
    const staked = live.record?.step === 'playing' || tdLive.record?.step === 'playing' || escortLive.record?.step === 'playing';
    const msg = staked
      ? '现在离开，带进去的这份筹码就输掉了。'
      : app.api.level === 'map' && app.api.scene === 'battle'
        ? '现在离开，这一站按 0 宝分算（航线进度存着，回来接着走）。'
        : app.api.scene === 'td'
        ? '现在离开，这一局就算放弃了。'
        : '现在离开，这场进攻就算放弃了（木材不退）。';
    if (app.inBattle) confirmBox(msg, '离开', go, '继续打');
    else go();
  };
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && app.flush());
  addEventListener('pagehide', () => app.flush());
}

main();
