/**
 * 页面里没人接住的报错发给平台（kit 的 arcade-kit/report，只发报错文字、调用栈、路径和版本）。
 * 这个模块必须是入口 main.ts 的第一个 import：它先于画骨架的 shell.ts 执行，启动时的报错也收得到。
 */
import { reportErrors } from 'arcade-kit/report';
import { GAME_ID } from '../game/id.ts';

reportErrors({ game: GAME_ID, version: __MAHJONG_VERSION__ });
