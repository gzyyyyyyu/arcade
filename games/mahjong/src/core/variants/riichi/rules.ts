/**
 * 立直麻将（日麻，天凤式四人）的牌局流程（docs/riichi.md 第 1、2 节）：状态、动作、每一步怎么走。纯函数，单机和好友房共用。
 * 役、符、点数在 score.ts，这里只管谁摸谁打、谁能吃碰杠和、钱（点数）怎么动、一场什么时候结束。
 *
 * 一局：发牌 → 庄家摸第一张 → 摸打、吃碰杠、立直 → 有人和、荒牌流局或中途流局 → 结算点数、换庄、本场、供托。
 * 一场：东南半庄（或东风战），西入、飞了、最后一局庄家第一自动结束；打完按点数、顺位马换筹码（只在一场结束时动一次筹码）。
 *
 * 声明窗口沿用川麻的公平做法（DESIGN.md 第 6 节）：名单是所有别家，真人的回答走 kit 的 free，电脑的回答带 bot、答完离开名单；
 * 有选择的人都答完就裁决：和 > 碰 / 杠 > 吃，两家和是双响，三家和是流局。
 *
 * 所有改动都在 applyMut 里原地做；对外的 apply 先复制一份再改（index.ts）。
 */
// 拆分后的出口：外面一律从 ./rules.ts 引，名字和拆分前一致。
export { VARIANT, RULES_VERSION, SEATS, TILESET, START_POINTS, RETURN_POINTS, UMA, DEAD_WALL, SHARE_POINTS, type RcOpts, DEFAULT_OPTS, type Phase, type RcEnd, type RcRiverTile, type RcPlayer, type RcWin, type RoundSummary, type SeatStats, type Claim, type RcEvent, type Final, type RcState, type RcAction, TABLE } from './state.ts';
export { seatWind, doraIndicators, uraIndicators, tenpaiKinds, furiten } from './helpers.ts';
export { begin } from './deal.ts';
export { chiOptions } from './claims.ts';
export { ranking, allLast, standings, finishMatch } from './settle.ts';
export { riichiOptions, discardOptions, kanOptions, canTsumo, canKyuushu, applyMut, resumeMut, actorsOf, restakeMut, seatedMut } from './actions.ts';
