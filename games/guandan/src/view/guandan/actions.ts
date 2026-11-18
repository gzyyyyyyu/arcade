/** 我这一手的判定、提示、出牌和不要（从 TableScene.ts 拆出，只搬家；函数接收场景实例）。 */
import { hintList, hintedPlay } from '../../variants/guandan/ai/index.ts';
import { beats, canPass, interpret, isBomb, partnerOf, samePlayShape, type Card, type Play, type PlayerView } from '../../variants/guandan/core/index.ts';
import { audio } from '../common/audio.ts';
import { playDetail, playLabel } from './labels.ts';
import { ME } from './session.ts';
import { COLOR } from '../common/theme.ts';
import { Button, modal, toast, worldW } from '../ui/kit.ts';
import { CHOOSE, TOAST_Y } from '../table/layout.ts';
import type { TableScene } from '../scenes/TableScene.ts';

/** 选中的牌能不能出：返回可用的解释（可能多个）或一句原因。只调用核心的 interpret / beats。 */
export function judge(sc: TableScene, v: PlayerView, sel: Card[]): { ok: boolean; plays: Play[]; reason: string; label: string } {
  if (sel.length === 0) return { ok: false, plays: [], reason: '', label: '' };
  const all = interpret(sel, v.level, v.options);
  if (all.length === 0) return { ok: false, plays: [], reason: '不成牌型', label: '' };
  const target = v.trick.last?.play ?? null;
  const ok = target ? all.filter((p) => beats(p, target)) : all;
  if (ok.length === 0) {
    const sameType = all.some((p) => p.type === target!.type && p.cards.length === target!.cards.length);
    return { ok: false, plays: [], reason: sameType || isBomb(target!) ? '压不过' : `要出${playLabel(target!)}`, label: '' };
  }
  // 同一种牌型/点数的解释只算一种
  const uniq: Play[] = [];
  for (const p of ok) if (!uniq.some((q) => samePlayShape(p, q))) uniq.push(p);
  const label = uniq.length === 1 ? playDetail(uniq[0]!) : `有 ${uniq.length} 种出法`;
  return { ok: true, plays: uniq, reason: '', label };
}

export function ensureHints(sc: TableScene, v: PlayerView): (Play | null)[] {
  if (sc.hintStep === v.step) return sc.hints;
  sc.hintStep = v.step;
  sc.hintIdx = 0;
  sc.hints = hintList(v, sc.ses.hintSeed());
  return sc.hints;
}

export function onHint(sc: TableScene): void {
  const v = sc.ses.view();
  if (!sc.myTurn(v) || v.phase !== 'play') return;
  const list = sc.ensureHints(v);
  if (list.length === 0) {
    toast(sc, '没有能压过的牌', worldW(sc) / 2, TOAST_Y);
    return;
  }
  const p = list[sc.hintIdx % list.length]!;
  sc.hintIdx++;
  sc.hinted = p;
  if (p === null) {
    sc.hand.setSelected([]);
    sc.refreshButtons();
    const partner = v.trick.last && v.trick.last.seat === partnerOf(ME);
    toast(sc, partner ? '队友的牌够大，建议不要' : '建议不要，留着好牌', worldW(sc) / 2, TOAST_Y);
    sc.setStatus('提示：这手建议 不要（再点提示看能压的牌）');
    sc.fxLog.push('建议不要');
    sc.pulse(sc.btnPass);
    return;
  }
  sc.hand.setSelected(p.cards);
  sc.refreshButtons();
}

export function onPass(sc: TableScene): void {
  const v = sc.ses.view();
  if (!sc.myTurn(v) || !canPass(v)) return;
  sc.hand.setSelected([]);
  sc.act({ type: 'pass', seat: ME });
}

export function onPlay(sc: TableScene): void {
  const v = sc.ses.view();
  if (!sc.myTurn(v)) return;
  const sel = sc.hand.selected();
  if (v.myTribute) {
    if (sel.length !== 1) return;
    sc.act(v.myTribute.kind === 'tribute' ? { type: 'tribute', seat: ME, card: sel[0]! } : { type: 'return', seat: ME, card: sel[0]! });
    return;
  }
  const r = sc.judge(v, sel);
  if (!r.ok) {
    audio.sfx('error');
    if (r.reason) toast(sc, r.reason, worldW(sc) / 2, TOAST_Y, COLOR.redDark);
    return;
  }
  const p = r.plays.length === 1 ? r.plays[0]! : hintedPlay(sc.hintStep === v.step ? sc.hinted : null, sel, r.plays);
  if (p) {
    sc.act({ type: 'play', seat: ME, cards: sel, as: { type: p.type, rank: p.rank, extra: p.extra } });
    return;
  }
  sc.chooseInterpretation(sel, r.plays);
}

/** 逢人配让一手牌有多种解释：列出来让玩家挑。 */
export function chooseInterpretation(sc: TableScene, sel: Card[], plays: Play[]): void {
  const h = CHOOSE.headH + plays.length * CHOOSE.rowH;
  const m = modal(sc, CHOOSE.w, h, '当作哪一手？', { onClose: () => sc.closeOverlay() });
  sc.openOverlay('choose', m);
  plays.forEach((p, i) => {
    const b = new Button(sc, 0, -h / 2 + CHOOSE.firstY + i * CHOOSE.rowH, CHOOSE.btnW, CHOOSE.btnH, playDetail(p), isBomb(p) ? 'red' : 'gold', () => {
      m.close();
      sc.act({ type: 'play', seat: ME, cards: sel, as: { type: p.type, rank: p.rank, extra: p.extra } });
    });
    m.body.add(b);
  });
}
