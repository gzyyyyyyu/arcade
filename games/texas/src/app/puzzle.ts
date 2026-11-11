/**
 * 每日牌局谜题（src/puzzle/，docs/features.md 13.11）的入口：不碰钱包，进度只在本机 texas.puzzle，分数交平台每日榜。
 */
import { prepareShare } from 'arcade-kit/share';
import { submitScore } from '../net/scores.ts';
import { parseSave as parsePuzzleSave, type PuzzleSave } from '../puzzle/progress.ts';
import { site } from '../site.ts';
import { KEYS, readJson, writeJson } from '../store.ts';
import { beijingDate, dayLabel, openPuzzle, puzzleStatus } from '../view/puzzle.ts';
import { puzzleCard } from '../view/share.ts';
import type { App } from './state.ts';

const loadPuzzle = (): PuzzleSave => parsePuzzleSave(readJson<unknown>(KEYS.puzzle));

export function createPuzzle(c: App) {
  const { stage, lobby } = c.ui;

  /** 标题页入口上的状态：每次画大厅都按当前北京日期重算（过了零点就变回"未答"） */
  function drawPuzzleEntry(): void {
    const st = puzzleStatus(loadPuzzle(), beijingDate());
    lobby.setPuzzle(st.state, st.text, st.streak);
  }

  function openDailyPuzzle(): void {
    const date = beijingDate();
    openPuzzle(stage, {
      save: loadPuzzle(),
      onSave: (s) => {
        writeJson(KEYS.puzzle, s);
        drawPuzzleEntry();
      },
      // 5 道答完交每日榜（榜名 daily-日期-puzzle）：没登录、没网都只是没上榜，不挡总结卡；单独部署没有平台，不交
      submit: site.standalone ? null : (board, total) => (c.cloud.userId() ? submitScore(board, total) : Promise.resolve(false)),
      share: site.standalone
        ? null
        : (s) => {
            const url = `${location.origin}${location.pathname}`;
            const text = `今日德州谜题 ${dayLabel(s.day)}：5 道题我拿了 ${s.total} 分，你来试试？`;
            const pr = prepareShare(puzzleCard(s.total, s.oks, s.streak, dayLabel(s.day)), { url, text });
            void pr.share().catch((e: unknown) => console.warn('texas: share failed', e));
          },
      onClose: drawPuzzleEntry,
    }, date);
  }

  return { drawPuzzleEntry, openDailyPuzzle };
}
