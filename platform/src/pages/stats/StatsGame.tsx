/** 战绩页的游戏页签：这个游戏的局数、胜率、最大一把、本周净赢，加它的称号墙（按高度翻页） */
import { useEffect, useState } from 'react';
import type { CareerView, StatsResponse } from '../../api.ts';
import { dateText, num, signed, tone } from '../../lib/format.ts';
import { PageTabs, Paged } from '../../features/fit/Fit.tsx';
import { togetherText } from '../../lib/mates.ts';
import { loadTitles, type TitleCatalog } from '../../lib/titles.ts';
import { rateText } from './stats-logic.ts';

type Item = { id: string; name: string; desc?: string; date: string; locked: boolean };

/** 拿到的亮着（带日期），目录里还没拿到的灰着 */
function TitleWall({ game, earned }: { game: string; earned: CareerView['titles'] }) {
  const [catalog, setCatalog] = useState<TitleCatalog | null>(null);
  useEffect(() => {
    let alive = true;
    setCatalog(null);
    void loadTitles(game).then((c) => alive && setCatalog(c));
    return () => {
      alive = false;
    };
  }, [game]);
  const have = new Set(earned.map((t) => t.id));
  const items: Item[] = [
    ...earned.map((t) => ({ id: t.id, name: catalog?.[t.id]?.name ?? '神秘称号', desc: catalog?.[t.id]?.desc, date: dateText(t.at), locked: false })),
    ...(catalog ? Object.entries(catalog).filter(([id]) => !have.has(id)).map(([id, info]) => ({ id, name: info.name, desc: info.desc, date: '还没拿到', locked: true })) : []),
  ];
  const total = catalog ? Object.keys(catalog).length : 0;
  return (
    <section className="scard" data-testid={`titles-${game}`}>
      <h3 className="scard__title">
        称号墙
        <span className="scard__count">
          {earned.length}
          {total ? ` / ${total}` : ''}
        </span>
      </h3>
      {items.length === 0 ? (
        <p className="note scard__note">还没拿到称号。打出名场面，游戏会发给你。</p>
      ) : (
        <Paged
          grid
          className="stats-titles"
          items={items}
          keyOf={(t) => `${t.locked ? 'x' : 'y'}${t.id}`}
          label="称号翻页"
          render={(t) => (
            <div className={`title${t.locked ? ' title--locked' : ''}`} title={t.desc}>
              <span className="title__name">{t.name}</span>
              <span className="title__date">{t.date}</span>
            </div>
          )}
        />
      )}
    </section>
  );
}

export function GameTab({ game, c, together }: { game: string; c: CareerView; together?: NonNullable<StatsResponse['together']>[string] }) {
  const facts: { k: string; v: string; cls?: string }[] = [
    { k: '局数', v: c.rounds > 0 ? num(c.rounds) : '—' },
    { k: '胜率', v: rateText(c) },
    { k: '最大一把', v: c.best > 0 ? num(c.best) : '—' },
    { k: '本周净赢', v: signed(c.wnet), cls: tone(c.wnet) },
    { k: '上桌', v: `${num(c.n)} 次` },
  ];
  return (
    <PageTabs
      className="stats-ptabs stats-ptabs--game"
      wide="(min-width: 700px)"
      label="战绩和称号"
      tabs={[
        {
          id: 'facts',
          name: '战绩',
          body: (
            <section className="scard" data-testid={`gstats-${game}`}>
              <h3 className="scard__title">战绩</h3>
              <dl className="stats-facts">
                {facts.map((f) => (
                  <div key={f.k}>
                    <dt>{f.k}</dt>
                    <dd className={f.cls} title={f.k === '本周净赢' ? '北京时间周一清零' : undefined}>
                      {f.v}
                    </dd>
                  </div>
                ))}
              </dl>
              {together && (
                // 搭子战绩：只有好友、两边都开着、一起打过才有
                <p className="stats-together" data-testid="together">
                  <strong>和我一起</strong> {togetherText(together)}
                </p>
              )}
            </section>
          ),
        },
        { id: 'titles', name: '称号墙', body: <TitleWall game={game} earned={c.titles} /> },
      ]}
    />
  );
}
