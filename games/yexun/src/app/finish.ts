import { DANGERS, DAWN_TICK } from '../content/waves.ts';
import { LIVE_TIERS, type LiveTier } from '../content/live.ts';
import type { MapId } from '../content/maps.ts';
import { MAPS } from '../content/maps.ts';
import { RAID_TEMPLATES, type RaidLiveTemplate, type RaidTemplateId } from '../content/explore.ts';
import { RUSH } from '../content/rush.ts';
import { SCHOOLS } from '../content/guide.ts';
import { TREASURES } from '../content/treasures.ts';
import { WEEKLIES } from '../content/weekly.ts';
import { rewardCoins, rewardLine } from '../content/achievements.ts';
import { rushResult } from '../core/rush.ts';
import type { World } from '../core/state.ts';
import { trialResult } from '../core/trial.ts';
import { goalText } from '../content/trials.ts';
import type { WeekRun } from '../content/weekGoals.ts';
import { WEAPONS } from '../content/weapons.ts';
import { settleRaid } from '../explore/settle.ts';
import { recordRaid } from '../explore/vault.ts';
import { applyRun, recordTrial, type RunTally, saveRecords, summarize } from '../meta/records.ts';
import { beijingDate, isNightmareSunday } from '../online/daily.ts';
import { weekIndex } from '../online/weekly.ts';
import { buildShareCard } from '../online/share.ts';
import { scoresOfRun } from '../online/score.ts';
import { outcomeText, type createSubmitter } from '../online/submit.ts';
import type { createSocial } from '../online/social.ts';
import type { RunSummary } from '../online/types.ts';
import type { createLive } from '../platform/live.ts';
import { applyWeekRun, carryCoins, type CoinSource, coins, finishRun, finishTrial, grantCoins, recordLiveVigil, type loadSave, writeSave } from '../platform/save.ts';
import type { Recorder } from '../replay/recorder.ts';
import { storeReplay } from '../replay/store.ts';
import { music } from '../view/audio/music.ts';
import { treasureIconKey } from '../view/art/sprites-raid.ts';
import type { GameScene } from '../view/game/GameScene.ts';
import { decorateRushResult } from '../view/ui/rushResult.ts';
import type { Banners } from '../view/ui/banner.ts';
import type { AchievementToast } from '../view/ui/codex.ts';
import type { Confirm, Result, Tips } from '../view/ui/screens.ts';
import { prepareShare } from 'arcade-kit/share';
import { buildRows } from './buildRows.ts';
import { recordText } from './liveText.ts';
import type { loadRecords } from '../meta/records.ts';
import { TOUCH } from '../view/viewport.ts';

/**
 * 这台设备前三局倒下时结算页的「下次试试」（新手实录：不动的新号 3:43 倒下，结算页只写撑了多久，不知道下次该怎么办）。
 * 按第几局给：先教走位，再教挑法器和吃肉包，最后指到「加成」
 */
const ADVICE: readonly string[] = [
  TOUCH ? '按住屏幕拖动走位，绕着怪群转圈，别站着让它们围上来' : '用 WASD 或方向键走位，绕着怪群转圈，别站着让它们围上来',
  '升级时多挑「新」法器，法器越多清怪越快；地上的肉包能回血',
  '铜钱去「选模式」里的「加成」买力量、体魄，带着再来',
];

/** 一局的流转状态：开局（main 的 startRun）写，结束（下面的 finish）读写，两边共用这一份 */
export interface Session {
  /** 这一局是实盘时记下种子（每 10 秒报一次撑到哪，结束时结回） */
  liveRun: { seed: number } | null;
  /** 录像（本机，DESIGN.md 5.4）和交分（5.7）：每局一个录像机 */
  rec: Recorder | null;
  /** 每日挑战那天的日期跟着这一局走 */
  dailyDate: string | null;
  /** 本周夜事挑战开局那天的日期（同 dailyDate，决定交哪个周榜） */
  weeklyDate: string | null;
  /** 上一局是不是实盘、哪一档（"再来一局"照样来） */
  lastLive: { tier: LiveTier; raid?: RaidLiveTemplate; map?: MapId } | null;
  liveTier: LiveTier;
  /** 这一局已经结束（结算页出来了；回放里也先置上，暂停面板和结算都不出） */
  ended: boolean;
  /** 成就和图鉴（5c）：累计统计存 yexun.records；每局按事件计数，结算时一起算解锁 */
  records: ReturnType<typeof loadRecords>;
  tally: RunTally;
}

export interface FinishDeps {
  sess: Session;
  save: ReturnType<typeof loadSave>;
  live: ReturnType<typeof createLive>;
  submitter: ReturnType<typeof createSubmitter>;
  social: ReturnType<typeof createSocial>;
  result: Result;
  confirm: Confirm;
  tips: Tips;
  banners: Banners;
  toast: AchievementToast;
  scene: () => GameScene | null;
  setPaused: (on: boolean) => void;
  showPlay: (on: boolean) => void;
  nonce: () => string;
}

/** 一局打完以后的事：存录像、交分、记纪录和成就、出结算页；实盘和夜探各有结回的走法 */
export function createFinisher(d: FinishDeps): { finish: (w: World, quit: boolean) => void } {
  const { sess, save, live, submitter, social, result, confirm, tips, banners, toast, scene, setPaused, showPlay, nonce } = d;

  /** 撑到了天亮：无尽局过了天亮再倒下也算（解锁、战绩按这个） */
  const dawned = (w: World): boolean => w.won || (!!w.setup.endless && w.tick >= DAWN_TICK);
  /** 夜探撤出带出的宝物价值；没撤出、守夜是 0 */
  const lootOf = (w: World): number => (w.raid && w.raid.outcome === 'escaped' ? settleRaid(w.raid, w.coins).value : 0);
  /**
   * 试炼：局末成绩记进存档（认输的不记），第一次通关发铜钱、记进成就统计（各档全通给称号）。
   * 交分前算好：只有刷新了最好成绩才交 trial-<id> 榜
   */
  const trialEnd = (w: World, quit: boolean): { score: number; best: boolean; won: boolean; extra: CoinSource[] } | null => {
    const t = w.trial;
    const r = t ? trialResult(w, lootOf(w)) : null;
    if (!t || !r) return null;
    if (quit) return { score: r.score, best: false, won: false, extra: [] };
    const got = finishTrial(save, t.id, r.score);
    const extra: CoinSource[] = got.first > 0 ? [{ label: `试炼「${t.name}」第一次通关`, coins: got.first }] : [];
    if (r.won) {
      const rr = recordTrial(sess.records, t.id);
      sess.records = rr.records;
      saveRecords(sess.records);
      toast.show(rr.unlocked);
    }
    return { score: r.score, best: got.best, won: r.won, extra };
  };
  /** 周目标：守夜、夜探、实盘、试炼的局都算（连战、回放不进 finish 的这条路），新完成的发铜钱 */
  const weekEnd = (w: World): CoinSource[] => {
    const escaped = !!w.raid && w.raid.outcome === 'escaped';
    const run: WeekRun = {
      mode: w.raid ? 'raid' : 'vigil',
      won: w.raid ? escaped : dawned(w),
      danger: w.setup.danger,
      kills: w.kills,
      elites: sess.tally.elites,
      boss: w.bossKilled,
      evolves: sess.tally.evolves,
      treasures: escaped ? settleRaid(w.raid!, w.coins).kept.length : 0,
    };
    return applyWeekRun(save, weekIndex(beijingDate(Date.now())), run);
  };
  /** 结算页的来源行之外再拿到的铜钱（夜探、实盘的结算页没有来源表）：提示一句 */
  const tellExtra = (extra: readonly CoinSource[]): void => {
    if (extra.length) tips.show(extra.map((x) => `${x.label} <b>+${x.coins.toLocaleString('zh-CN')}</b> 铜钱`).join('<br>'), 7000);
  };
  /** 一局的小结：交分、录像、分享卡都从它来 */
  const runSummary = (w: World, quit: boolean, trial: { score: number; best: boolean } | null): RunSummary => ({
    runId: `${w.setup.seed.toString(36)}-${sess.rec?.at.toString(36) ?? '0'}`,
    setup: w.setup,
    won: w.raid ? w.raid.outcome === 'escaped' : w.rush ? w.won : dawned(w),
    quit,
    bossKilled: w.bossKilled,
    seconds: Math.floor((w.setup.endless ? w.tick : Math.min(w.tick, w.rush ? RUSH.limit : DAWN_TICK)) / 30),
    ...(w.rush ? { rush: rushResult(w)! } : {}),
    kills: w.kills,
    level: w.level,
    coins: w.coins,
    // 夜探：撤出带出的宝物价值（夜探榜按它排）；没撤出是 0
    loot: lootOf(w),
    live: sess.liveRun !== null,
    reducedDamage: !!w.setup.assist,
    daily: sess.dailyDate,
    weekly: sess.weeklyDate,
    build: w.weapons.map((o) => WEAPONS[o.id].name),
    ...(trial ? { trial: { score: trial.score, best: trial.best } } : {}),
  });
  /** 结束时：存录像、交分（实盘、降低伤害、认输的不交总榜，规则在 online/score.ts） */
  const archive = (w: World, quit: boolean, trial: { score: number; best: boolean } | null): RunSummary => {
    const run = runSummary(w, quit, trial);
    if (sess.rec) {
      const today = beijingDate(Date.now());
      storeReplay(sess.rec.finish(w, { won: run.won, quit, seconds: run.seconds, kills: run.kills, level: run.level, bossKilled: run.bossKilled, loot: run.loot, daily: run.daily }, scoresOfRun(run, today)));
      sess.rec = null;
    }
    void submitter.submit(run).then((outs) => {
      if (outs.length) result.setNote(outs.map(outcomeText).join('；'));
    });
    return run;
  };
  /**
   * 分享卡（kit 的 arcade-kit/share）：结算页一出来就先画好，点"分享"时在点击里直接调系统分享（iOS 只认点击那一下）。
   * 实盘局不给分享（onShare 置空）。卡上只有战绩和咒印，不放自由文字
   */
  const offerShare = (run: RunSummary | null): void => {
    if (!run) {
      result.onShare = null;
      return;
    }
    const prepared = prepareShare(buildShareCard(run), { url: './', zIndex: 11000 });
    result.onShare = () => void prepared.share();
  };

  /** 夜探结算：撤出全带走、换铜钱；倒下 / 迷失丢包，铜钱剩一半（教学镇不丢）；宝物记进藏宝阁 */
  const finishRaid = (w: World, quit: boolean, seconds: number, liveSeed: number | null = null, extra: readonly CoinSource[] = [], trialName = ''): void => {
    const raid = w.raid!;
    const st = settleRaid(raid, carryCoins(w));
    const rr = recordRaid(save.vault, st);
    save.vault = rr.vault;
    if (raid.teach) save.raidDone = true;
    if (st.outcome === 'escaped') save.extracts++;
    // 实盘的夜探：筹码按撤出时带出的价值结回；局内铜钱和娱乐一样存进账户（所有者 10-20：账户铜钱只买永久加成和请角色，永久加成不进实盘）。
    // 实盘流水 id 用这一份的种子，结回重试也只记一次
    if (st.coins > 0) grantCoins(save, liveSeed === null ? `raid:${w.setup.seed.toString(36)}-${nonce()}` : `live:${liveSeed.toString(36)}`, st.coins);
    writeSave(save);
    showPlay(false);
    const view = (code: number) => {
      const t = TREASURES[code]!;
      return { icon: treasureIconKey(t.icon), name: t.name, tier: t.tier, value: t.value, fresh: rr.fresh.includes(t.id) };
    };
    const tpl = raid.setup.template as RaidTemplateId;
    result.show({
      won: st.outcome === 'escaped',
      quit,
      bossKilled: false,
      seconds,
      kills: w.kills,
      level: w.level,
      coins: st.coins,
      coinsTotal: coins(save),
      label: trialName ? `试炼 · ${trialName}` : liveSeed === null ? `夜探 · ${RAID_TEMPLATES[tpl].name}${raid.teach ? '' : ` · ${DANGERS[w.setup.danger].name}`}` : `实盘 · 夜探 · ${RAID_TEMPLATES[tpl].name} · ${LIVE_TIERS[sess.liveTier].name}档`,
      ...(liveSeed === null ? {} : { live: '正在结回…' }),
      record: false,
      build: buildRows(w),
      raid: { outcome: st.outcome === 'escaped' || st.outcome === 'lost' ? st.outcome : 'dead', teach: raid.teach, kept: st.kept.map(view), lost: st.lost.map(view), value: st.value },
    });
    tellExtra(extra);
    if (liveSeed !== null) void live.finishRaid(liveSeed, st.bp).then(showLiveResult);
  };
  /** 实盘结回完：结算页写结果，结完的记录清掉 */
  const showLiveResult = (): void => {
    const lrec = live.record;
    result.setLive(recordText(lrec));
    if (lrec?.step === 'done') {
      live.markTold();
      live.clearFinished();
    }
  };
  const finish = (w: World, quit: boolean): void => {
    if (sess.ended) return;
    sess.ended = true;
    setPaused(true);
    music.stop();
    tips.hide();
    banners.clear();
    const seconds = (w.setup.endless ? w.tick : Math.min(w.tick, DAWN_TICK)) / 30;
    const trial = trialEnd(w, quit);
    const run = archive(w, quit, trial);
    // 周目标（连战不算）；试炼首通的铜钱一起报
    const extra = w.rush ? [] : [...(trial?.extra ?? []), ...weekEnd(w)];
    social.setWhere('menu');
    offerShare(sess.liveRun ? null : run);
    if (sess.liveRun && w.raid) {
      // 夜探实盘：撤出才有钱（按带出的价值），倒下、迷失、认输都是 0
      const seed = sess.liveRun.seed;
      sess.liveRun = null;
      return finishRaid(w, quit, seconds, seed, extra);
    }
    if (sess.liveRun) {
      // 实盘：不记纪录（固定配置，和娱乐分开），按撑到的时间结回；认输按当时撑到的算。
      // 局内铜钱和娱乐一样存进账户（所有者 10-20），流水 id 用这一份的种子，结回重试也只记一次
      const seed = sess.liveRun.seed;
      sess.liveRun = null;
      grantCoins(save, `live:${seed.toString(36)}`, carryCoins(w));
      // 撑过的时间照样解锁地图、更夫，天亮了照样开下一危险档（以前实盘分支不记，撑到天亮竹林还锁着）
      recordLiveVigil(save, { danger: w.setup.danger, won: dawned(w), ticks: Math.min(w.tick, DAWN_TICK), market: w.mkBuys });
      showPlay(false);
      result.show({ won: w.won, quit, bossKilled: w.bossKilled, seconds, kills: w.kills, level: w.level, coins: carryCoins(w), coinsTotal: coins(save), night: scene()?.nightLog, label: `实盘 · ${LIVE_TIERS[sess.liveTier].name}档`, live: '正在结回…', record: false, build: buildRows(w) });
      tellExtra(extra);
      void live.finish(seed, { ticks: w.won ? DAWN_TICK : w.tick, won: w.won, bossKilled: w.bossKilled }).then(showLiveResult);
      return;
    }
    if (w.raid) return finishRaid(w, quit, seconds, null, extra, w.trial ? `${w.trial.name} · ${goalText(w.trial.goal)}` : '');
    if (w.rush && run.rush) {
      // 首领连战：只交每日连战榜（archive 里交过了），不记守夜的纪录、解锁和成就（构筑是给好的，和守夜不可比），不发铜钱
      showPlay(false);
      result.show({ won: run.rush.cleared, quit, bossKilled: false, seconds: run.rush.ticks / 30, kills: w.kills, level: w.level, coins: w.coins, label: `每日连战 · ${MAPS[w.setup.map ?? 'snow'].name} · ${SCHOOLS[w.rush.school].name}`, fixed: true, record: false, build: buildRows(w) });
      decorateRushResult(result.root, w.rush, run.rush, quit);
      return;
    }
    // 认输的局算一局、铜钱照拿，但不算纪录
    const got = finishRun(save, { id: `${w.setup.seed.toString(36)}-${nonce()}`, danger: w.setup.danger, won: dawned(w), quit, ticks: Math.min(w.tick, DAWN_TICK), kills: w.kills, coins: carryCoins(w), curses: w.setup.curses?.length ?? 0, ...(w.setup.weekly ? { weekly: w.setup.weekly } : {}), boss: w.bossKilled, market: w.mkBuys, coinBy: w.coinBy, day: beijingDate(Date.now()) });
    // 成就：解锁的奖励铜钱另记一条流水（id 带成就 id，两台设备各解锁一次也只记一次）
    const ach = applyRun(sess.records, summarize(w, sess.tally, quit));
    sess.records = ach.records;
    saveRecords(sess.records);
    for (const id of ach.unlocked) grantCoins(save, `ach:${id}`, rewardCoins([id]));
    const achCoins = rewardCoins(ach.unlocked);
    const sources = [...got.sources, ...(achCoins > 0 ? [{ label: rewardLine(ach.unlocked), coins: achCoins }] : []), ...extra];
    const extraCoins = extra.reduce((a, x) => a + x.coins, 0);
    // 不弹顶上的成就横幅：结算页一出来横幅正好盖住标题（新手第一局一次解锁三四个，盖十来秒），成就名写在上面那条铜钱明细里
    showPlay(false);
    const label = w.trial ? `试炼 · ${w.trial.name} · ${goalText(w.trial.goal)}` : `${sess.dailyDate ? '每日挑战 · ' : ''}${sess.weeklyDate && w.setup.weekly ? `本周夜事 · ${WEEKLIES[w.setup.weekly].name} · ` : ''}${w.setup.endless ? '无尽 · ' : ''}${DANGERS[w.setup.danger].name}${sess.dailyDate && isNightmareSunday(sess.dailyDate, w.setup.mode) ? ' · 周日噩梦日' : ''}${w.setup.curses?.length ? ` · 咒印 ${w.setup.curses.length}` : ''}${w.setup.assist ? ' · 降低伤害' : ''}`;
    const advice = !w.won && !quit && !w.raid && !w.trial && !sess.dailyDate && !sess.weeklyDate ? ADVICE[save.runs - 1] : undefined;
    result.show({ won: w.won, quit, bossKilled: w.bossKilled, seconds, kills: w.kills, level: w.level, coins: got.coins + achCoins + extraCoins, coinsTotal: coins(save), night: scene()?.nightLog, sources, label, ...(advice ? { advice } : {}), fixed: !!sess.dailyDate || !!(sess.weeklyDate && w.setup.weekly) || !!w.trial, record: got.record && !w.trial, build: buildRows(w) });
    if (got.askAssist)
      confirm.ask('连着倒下好几局了。要不要把挨打的伤害降低 30%？开着时成绩不进总榜，设置里随时能关。', '降低伤害', '不用', (ok) => {
        save.assist = ok;
        writeSave(save);
      });
  };

  return { finish };
}
