/**
 * 牌桌互动的文字（掼蛋、斗地主共用，接 arcade-kit/table-fun）：kit 的短语表和电脑表情旁的那句话。
 * 掼蛋专属的互动性格、名场面映射在 variants/guandan/net/fun-moments.ts。
 */
import type { FunMood } from 'arcade-kit/fun-logic';
import { EMOTES, TAUNTS } from './emotes.ts';

/** kit 的短语表：客气话在前、嘲讽在后，编号和房间转发的 emote 一致（表情从 20 起、道具从 32 起，emotes.ts） */
export const PHRASES: readonly string[] = [...EMOTES, ...TAUNTS];

/**
 * 电脑表情旁那句话（kit 的 moodLines）：掼蛋的说法——炸弹、头游、进贡、接风、双下。kit 按情绪挑一句，
 * 被扔了回应、名场面起哄都用它；只说牌局，不说人（同 emotes.ts 的嘲讽）
 */
export const MOOD_LINES: Record<FunMood, readonly string[]> = {
  angry: ['炸我？等着瞧', '这一墩我记下了', '下把专门炸你', '别得意，级还没过呢', '有本事接着出'],
  sweat: ['手滑了手滑了', '这手牌没法打', '贡都快进不起了', '别扔了，给条活路', '让我缓一手'],
  love: ['够意思！', '谢了搭档', '这配合，稳', '收下了，回头还你', '接风接得漂亮'],
  smug: ['就这？', '炸弹准备好了', '头游拿了，承让', '谢谢送分', '这把你们没戏', '还贡记得挑张好的'],
  shock: ['这也能炸？', '天王炸都出来了', '好家伙，同花顺', '这都能接风？', '藏得够深啊'],
  cry: ['又被双下了', '这贡进得心疼', '末游背锅了', '服了，下副再来', '炸弹全白攒了'],
};
