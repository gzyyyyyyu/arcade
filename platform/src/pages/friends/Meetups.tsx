/**
 * 约局（docs/social.md 1.6）：好友列表卡片头上"约一局"，点开在弹窗里选游戏（只列能开好友房的）、今天或明天、几点，发给全部好友；
 * 列表顶上一条写好友约的局和我约的局。到点（开局前 10 分钟到开局后 30 分钟）"去"变主按钮：主人已经在那个游戏的房间里就直接进房，
 * 还没开就进游戏首页（平台不建房间，开桌、叫人走游戏里已有的好友房和"叫他来"）。数据跟着收邀请的 30 秒轮询来（Invites.tsx）。
 */
import { useState } from 'react';
import { ROOM_GAMES } from '../../../shared/games.ts';
import { api, type FriendLists } from '../../api.ts';
import { pollInvites, useMeetups } from '../../features/invites/Invites.tsx';
import { defaultSlot, hhmm, isDue, slots, whenText } from '../../features/meetup/meetup-logic.ts';
import { Modal } from '../../features/modal/Modal.tsx';
import { gameName } from '../../lib/format.ts';
import { FormError, useWritable } from '../../ui.tsx';
import { useAction } from './FriendsPeople.tsx';

type Friends = FriendLists['friends'];

/** 好友在这个游戏的房间里就进他的房间，不然进游戏首页 */
function goUrl(game: string, hostId: string, friends: Friends): string {
  const w = friends.find((f) => f.userId === hostId)?.where;
  const base = `/games/${encodeURIComponent(game)}/`;
  return w?.place === 'room' && w.game === game && w.room ? `${base}?room=${encodeURIComponent(w.room)}` : base;
}

/** 约局条占几行（好友卡片判断"人少按内容高"时连好友一起算，不然矮一点的手机上最后一个好友被页脚压住） */
export function useMeetupRows(withNew: boolean): number {
  const { meetups, mine } = useMeetups();
  return Math.min(meetups.length, 2) + (meetups.length > 2 ? 1 : 0) + (mine || withNew ? 1 : 0);
}

/** 列表顶上那一条：好友约的（先开的在前）和我约的；都没有就不出现。withNew：窄屏卡片头放不下"约一局"，按钮放在这里 */
export function MeetupStrip({ friends, withNew }: { friends: Friends; withNew: boolean }) {
  const { meetups, mine } = useMeetups();
  const writable = useWritable();
  const { busy, error, run } = useAction();
  const now = Date.now();
  if (!meetups.length && !mine && !withNew) return null;
  return (
    <div className="meetups" data-testid="meetups">
      {meetups.slice(0, 2).map((m) => {
        const due = isDue(m.at, now);
        return (
          <p key={m.host.id} className={`meetups__row${due ? ' meetups__row--due' : ''}`}>
            <span className="meetups__text">
              <strong>{[...m.host.name].slice(0, 12).join('')}</strong> 约了 <span className="tnum">{whenText(m.at, now)}</span> · {gameName(m.game)}
            </span>
            <a className={`btn btn--small${due ? ' btn--primary' : ''}`} href={goUrl(m.game, m.host.id, friends)} data-testid="meetup-go">
              去
            </a>
          </p>
        );
      })}
      {meetups.length > 2 && <p className="note">还有 {meetups.length - 2} 个约局，先打完这两个</p>}
      {mine && (
        <p className={`meetups__row${isDue(mine.at, now) ? ' meetups__row--due' : ''}`} data-testid="meetup-mine">
          <span className="meetups__text">
            我约了 <span className="tnum">{whenText(mine.at, now)}</span> · {gameName(mine.game)}，到点开桌叫人
          </span>
          <a className="btn btn--small btn--primary" href={`/games/${encodeURIComponent(mine.game)}/`}>
            开桌
          </a>
          {withNew && <MeetupButton label="改" />}
          <button className="btn btn--small" type="button" disabled={busy || !writable} onClick={() => void run(async () => { await api.cancelMeetup(); await pollInvites(); })}>
            取消
          </button>
        </p>
      )}
      {withNew && !mine && (
        <p className="meetups__row">
          <span className="meetups__text">约好友什么时候一起玩</span>
          <MeetupButton />
        </p>
      )}
      <FormError text={error} />
    </div>
  );
}

/** "约一局"按钮和它的弹窗（电脑在卡片头上，窄屏在约局条里；已经约了时叫"改"，再约覆盖） */
export function MeetupButton({ label = '约一局' }: { label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn btn--small" type="button" onClick={() => setOpen(true)} data-testid="meetup-new">
        {label}
      </button>
      <Modal open={open} title="约一局" onClose={() => setOpen(false)} className="modal__box--narrow" testId="meetup-form">
        {open && <MeetupForm onDone={() => setOpen(false)} />}
      </Modal>
    </>
  );
}

function MeetupForm({ onDone }: { onDone: () => void }) {
  const writable = useWritable();
  const { busy, error, run } = useAction();
  const [now] = useState(() => Date.now());
  const [game, setGame] = useState(ROOM_GAMES[0]!.id);
  const [at, setAt] = useState(() => defaultSlot(now));
  const [day, setDay] = useState<0 | 1>(() => (slots(now, 0).includes(at) ? 0 : 1));
  const times = slots(now, day);
  const pickDay = (d: 0 | 1) => {
    setDay(d);
    const list = slots(now, d);
    if (!list.includes(at)) setAt(list.find((t) => hhmm(t) === hhmm(at)) ?? list[0]!);
  };
  return (
    <form
      className="form meetup-form"
      onSubmit={(e) => {
        e.preventDefault();
        void run(async () => {
          await api.meetup(game, at);
          await pollInvites();
          onDone();
        });
      }}
    >
      <fieldset className="meetup-form__set">
        <legend className="field__label">玩什么</legend>
        <div className="pills">
          {ROOM_GAMES.map((g) => (
            <button key={g.id} type="button" aria-pressed={g.id === game} className={g.id === game ? 'tabs__on' : undefined} onClick={() => setGame(g.id)}>
              {g.name}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="meetup-form__set">
        <legend className="field__label">什么时候（北京时间）</legend>
        <div className="row meetup-form__when">
          <div className="pills">
            {([0, 1] as const).map((d) => (
              <button key={d} type="button" aria-pressed={d === day} className={d === day ? 'tabs__on' : undefined} disabled={!slots(now, d).length} onClick={() => pickDay(d)}>
                {d === 0 ? '今天' : '明天'}
              </button>
            ))}
          </div>
          <select className="field__input" aria-label="几点" value={at} onChange={(e) => setAt(Number(e.target.value))}>
            {times.map((t) => (
              <option key={t} value={t}>
                {hhmm(t)}
              </option>
            ))}
          </select>
        </div>
      </fieldset>
      <p className="note">发给全部好友。到点前 10 分钟他们头像上有个小点，好友页能一键过去；你到点在游戏里开好友房、叫人就行。每天最多约 3 次。</p>
      <FormError text={error} />
      <button className="btn btn--primary" type="submit" aria-busy={busy} disabled={busy || !writable}>
        {busy ? '请稍等…' : `约 ${whenText(at, now)} 的${gameName(game)}`}
      </button>
    </form>
  );
}
