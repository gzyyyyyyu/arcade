/** 电脑对手的公开入口。 */
export { decide, suggest, type BotConfig, type Difficulty, type PersonaId } from './bot.ts';
export { DIFFICULTIES, PERSONAS, PERSONA_IDS, SEAT_PERSONA, TUNING, formOf, situationOf, styleOf, tiltOf, tuningFor } from './persona.ts';
export { hintList, hintedPlay } from './hints.ts';
export { randomAction } from './random.ts';
export { planHand } from './plan.ts';
