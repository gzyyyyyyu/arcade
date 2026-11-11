/**
 * 快速局 · 全下或弃牌（docs/features.md 13.10）和今日局：娱乐、6 人、每人 PF_STACK_BB 个大盲，不碰钱包。
 * 今日局的种子由北京日期推出，当天第一局记分上榜（开始就算打过），之后重玩是练习。
 */
import { canScore, dailyBoardId, dailySeed, finishDaily, parseRecord, startDaily } from '../core/daily.ts';
import { FUN_LEVEL, FUN_STAKES, PF_STACK_BB, stakesOf } from '../core/stakes.ts';
import { walletError } from '../net/wallet.ts';
import { submitScore } from '../net/scores.ts';
import { site } from '../site.ts';
import { ME, Solo } from '../solo.ts';
import { KEYS, readJson, writeJson } from '../store.ts';
import { dialog } from '../view/dialog.ts';
import { el, setText } from '../view/dom.ts';
import { beijingDate } from '../view/puzzle.ts';
import { pushFoldCard } from '../view/share.ts';
import { chips, handName, signed } from '../view/text.ts';
import { shareIt } from './shell.ts';
import type { App } from './state.ts';
import { must } from '../must.ts';

export function createDaily(c: App) {
  const f = c.fn;
  const { stage } = c.ui;

  /** daily：今日局 */
  async function startPushFold(daily = false): Promise<void> {
    if (c.busy || c.solo || c.tour) return;
    c.busy = true;
    f.drawLobby();
    const st = stakesOf(FUN_STAKES);
    const date = beijingDate();
    const rec = parseRecord(readJson(KEYS.pushfold));
    const scored = daily && !site.standalone && canScore(rec, date);
    const r = await Solo.open(c.deps, {
      userId: c.cloud.userId(),
      stakes: FUN_STAKES,
      size: 6,
      amount: st.bb * PF_STACK_BB,
      practice: true,
      level: FUN_LEVEL.normal,
      pushFold: true,
      ...(daily ? { entropy: dailySeed(date), daily: { date, scored } } : {}),
    });
    c.busy = false;
    if ('error' in r) {
      c.walletNote = walletError(r.error);
      f.drawLobby();
      return;
    }
    if (scored) writeJson(KEYS.pushfold, startDaily(rec, date));
    c.solo = r;
    f.enterTable();
  }

  /**
   * 快速局打完（打满 PF_HANDS 手或输光）：结果卡写最后筹码、打了几手、最大的一手，和本机的最好成绩（texas.pushfold）。
   * "再来一局"一下重开；"回大厅"离桌。娱乐不碰钱包：离桌只是清掉本机这一桌
   */
  async function pfFinish(s: Solo): Promise<void> {
    f.stopCountdown();
    const st = s.stats;
    const start = stakesOf(s.table.stakes).bb * PF_STACK_BB;
    const final = must(s.table.seats[ME], '单机桌一定有我的座位').stack;
    const daily = s.session.daily;
    let rec = parseRecord(readJson(KEYS.pushfold));
    const prevBest = rec.best;
    const record = prevBest === null || final > prevBest;
    // 今日局的分单独记（rec.daily），不混进普通快速局的最好成绩
    let board: string | null = null;
    if (daily) {
      rec = daily.scored ? finishDaily(rec, daily.date, final) : rec;
      board = daily.scored ? dailyBoardId(daily.date) : null;
    } else rec = { ...rec, best: record ? final : prevBest, plays: rec.plays + 1 };
    writeJson(KEYS.pushfold, rec);
    // 交分：失败不挡结果卡（没登录、没网、平台停写都只是没上榜）
    const sent = board && c.cloud.userId() ? submitScore(board, final) : Promise.resolve(false);
    const body = el('div', 'pf-sum');
    // 大字写输赢（和开局比），剩下的筹码是最终成绩，放次要行，免得"0"被读成得了 0 分
    const diff = final - start;
    el('div', `pf-score ${diff > 0 ? 'up' : diff < 0 ? 'down' : ''}`, body, signed(diff));
    el('div', 'pf-line', body, `最后剩 ${chips(final)}（开局 ${chips(start)}）${final === 0 ? '，输光了' : ''}`);
    el('div', 'pf-line', body, `打了 ${st.hands} 手，赢了 ${st.won} 手`);
    el('div', 'pf-line', body, st.best ? `最大的一手：赢 ${chips(st.best.won)}${st.best.value === null ? '（对手都弃了）' : `，${handName(st.best.value)}`}` : '这一局没赢过');
    const note = el('div', 'pf-best', body);
    if (daily) setText(note, daily.scored ? '正在交今日榜的分…' : `练习局（${daily.date} 的牌今天已经记过分），不上榜`);
    else setText(note, record ? (prevBest === null ? '第一局，记下了' : `新纪录！上次最好 ${chips(prevBest)}`) : `最好成绩 ${chips(must(prevBest, '不是新纪录就说明以前记过最好成绩'))}`);
    if (daily?.scored) void sent.then((ok) => setText(note, ok ? '已上今日榜' : '今日榜没交上：连不上，稍后再试；分数已记在本机'));
    const share = daily?.scored && !site.standalone ? shareIt(pushFoldCard(daily.date, final, st.hands, st.won, c.myName)) : null;
    let pick: string | null;
    for (;;) {
      pick = await dialog(stage, daily ? '今日局结束' : '快速局结束', body, [
        ...(share ? [{ label: '分享', value: 'share' }] : []),
        { label: '回大厅', value: 'lobby' },
        { label: daily ? '再练一遍' : '再来一局', value: 'again', primary: true },
      ], true);
      if (pick === 'share' && share) share();
      else break;
    }
    if (c.solo !== s) return;
    await s.leave();
    c.solo = null;
    f.showLobby();
    if (pick === 'again') await startPushFold(!!daily);
  }

  return { startPushFold, pfFinish };
}
