import { describe, expect, it } from 'vitest';
import { createWorld, fingerprint, loadoutCost, loadoutOk, Pick, rushEnterMap, rushPresets, rushResult, rushRoute, step, type Setup, type World } from '../../src/core/index.ts';
import { applyRushCard } from '../../src/core/rush-flow.ts';
import { RUSH_API } from '../../src/core/step.ts';
import { decodePicks, encodePicks } from '../../src/replay/format.ts';
import { CHARACTER_IDS } from '../../src/content/meta.ts';
import { MAPS } from '../../src/content/maps.ts';
import { ARENA } from '../../src/content/player.ts';
import { AFFIX_FX } from '../../src/content/rushFoes.ts';
import { ENEMIES, ENEMY_BY_KIND, MARKETBOSS } from '../../src/content/enemies.ts';
import { RUSH, RUSH_FOES, RUSH_TOTAL, YELOU } from '../../src/content/rush.ts';
import { AFFIX_BIT, rushSkipToFinal } from '../../src/core/foes/index.ts';

describe('连战：路线图', () => {
  it('同种子逐位相同，换种子不同；10 只不重复；每列至少一条普通、同列不重图', () => {
    expect(JSON.stringify(rushRoute(7))).toBe(JSON.stringify(rushRoute(7)));
    expect(JSON.stringify(rushRoute(7))).not.toBe(JSON.stringify(rushRoute(8)));
    for (let seed = 1; seed <= 200; seed++) {
      const r = rushRoute(seed);
      expect(r.foes.length).toBe(RUSH.stages);
      expect(new Set(r.foes).size).toBe(RUSH.stages);
      expect(r.layers.length).toBe(RUSH.stages);
      r.layers.forEach((col, k) => {
        expect(col.length).toBe(k === 0 ? RUSH.firstPaths : RUSH.paths);
        expect(col.some((o) => !o.elite)).toBe(true);
        expect(new Set(col.map((o) => o.map)).size).toBe(col.length);
        for (const o of col) if (o.elite) expect(o.stop).toBeNull();
      });
      for (const o of r.layers[RUSH.stages - 1]!) expect(o.stop === 'rest' || o.stop === 'shop').toBe(true);
      const all = r.layers.flat();
      expect(all.filter((o) => o.stop === 'shop').length).toBeGreaterThanOrEqual(RUSH.minShops);
      expect(all.filter((o) => o.stop === 'rest').length).toBeGreaterThanOrEqual(RUSH.minRests);
    }
  });
});

describe('连战：配装', () => {
  it('每个角色三套推荐都合法、点数不超', () => {
    for (const c of CHARACTER_IDS) {
      for (const l of rushPresets(c)) {
        expect(loadoutOk(l), `${c} ${JSON.stringify(l)}`).toBe(true);
        expect(loadoutCost(l)).toBeLessThanOrEqual(RUSH.budget);
      }
    }
  });

  it('不合法的配装：别的流派心法、池外被动、超点数、第二件和起手一样', () => {
    const [steady, strong, dual] = rushPresets('xiaodao');
    expect(loadoutOk({ ...steady, xinfa: 'fire' })).toBe(false);
    expect(loadoutOk({ ...steady, passives: [{ id: 'qiandai', level: 1 }] })).toBe(false);
    expect(loadoutOk({ ...dual, second: dual.start })).toBe(false);
    const over = { ...strong, passives: [{ id: 'xiantao', level: 2 }, { id: 'zhusha', level: 2 }] } as const;
    expect(loadoutCost(over)).toBeGreaterThan(RUSH.budget);
    expect(loadoutOk(over)).toBe(false);
  });

  it('开局按配装给：起手 3 级、等级固定；没配装补「稳」', () => {
    const w = createWorld({ seed: 3, mode: 'vigil', danger: 2, rush: true });
    const l = rushPresets('xiaodao')[0];
    expect(w.setup.rushLoadout).toEqual(l);
    expect(w.weapons.map((o) => [o.id, o.level])).toEqual([[l.start, 3]]);
    expect(w.level).toBe(RUSH.level);
    expect(w.mapId).toBe(w.rush!.layers[0]![0]!.map);
  });
});

// ───────────────────────── 流程 ─────────────────────────

type Policy = { route?: (w: World) => number; stop?: (w: World) => number; card?: (w: World) => number };

/** 跑连战：菜单按 policy 选（缺省第 1 条路、离开驿站、挑第 1 张），对局里乱走；god = 血一直满、关底一碰就倒 */
function drive(w: World, ticks: number, p: Policy = {}, opts: { god?: boolean; kill?: boolean; onTick?: (w: World) => void } = {}): World {
  let s = w.setup.seed >>> 0;
  let dir = 1;
  for (let n = 0; n < ticks && w.phase !== 'over'; n++) {
    let choice = -1;
    if (w.phase === 'choose') {
      if (w.menu === 'route') choice = p.route?.(w) ?? Pick.Route;
      else if (w.menu === 'stop') choice = p.stop?.(w) ?? Pick.Leave;
      else choice = p.card?.(w) ?? 0;
    } else {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      if (s % 23 === 0) dir = s % 33;
      if (opts.god) w.hp = w.stats.hpMax;
      if (opts.kill) for (let i = 0; i < w.eRush.length; i++) if (w.eRush[i] && w.eAlive[i]) w.eHp[i] = Math.min(w.eHp[i]!, 1);
    }
    step(w, dir, choice);
    opts.onTick?.(w);
  }
  return w;
}

const setup = (seed: number, extra: Partial<Setup> = {}): Setup => ({ seed, mode: 'vigil', danger: 2, rush: true, ...extra });

describe('连战：流程', () => {
  it('开局先看第 1 列路线图；选路换图、上场的首领血按关数', () => {
    const w = createWorld(setup(5));
    expect(w.phase).toBe('choose');
    expect(w.menu).toBe('route');
    const opt = w.rush!.layers[0]![1]!;
    step(w, 0, Pick.Route + 1);
    expect(w.rushPath).toEqual([1]);
    expect(w.mapId).toBe(opt.map);
    if (opt.stop) step(w, 0, Pick.Leave);
    expect(w.phase).toBe('play');
    drive(w, RUSH.first + 2);
    const foe = RUSH_FOES[w.rush!.foes[0]!];
    const hpMul = w.rushHpMul * (opt.elite ? RUSH.eliteHp : 1);
    const hps: number[] = [];
    for (let i = 0; i < w.eRush.length; i++) if (w.eRush[i] && w.eAlive[i]) hps.push(w.eHpMax[i]!);
    expect(hps.length).toBe(foe.kinds.length);
    for (const h of hps) expect(h).toBeCloseTo(RUSH.hp[0]! * foe.hpK * hpMul, 6);
    expect(w.level).toBe(RUSH.level);
  });

  it('清一关：给纸钱、喘口气后 5 张里挑 2 张，挑一张剩下的不重抽', () => {
    const x = createWorld(setup(9));
    // 一拍一拍推到第一次选卡（drive 每次从种子重起方向，所以这里自己转方向）
    let guard = 0;
    while (!(x.phase === 'choose' && x.menu === 'cards') && guard++ < 3000) {
      if (x.phase === 'choose') step(x, 0, x.menu === 'route' ? Pick.Route : Pick.Leave);
      else {
        x.hp = x.stats.hpMax;
        for (let i = 0; i < x.eRush.length; i++) if (x.eRush[i] && x.eAlive[i]) x.eHp[i] = Math.min(x.eHp[i]!, 1);
        step(x, 1 + ((guard >> 4) % 32), -1);
      }
    }
    expect(x.rushStage).toBe(1);
    expect(x.rushCoins).toBeGreaterThanOrEqual(RUSH.coins.normal);
    expect(x.choices.length).toBe(RUSH.hand);
    const elite = x.rush!.layers[0]![0]!.elite;
    expect(x.rushTake).toBe(elite ? RUSH.take.elite : RUSH.take.normal);
    const rest = x.choices.slice(1);
    step(x, 0, 0);
    expect(x.choices).toEqual(rest);
    expect(x.phase).toBe('choose');
    step(x, 0, 0);
    if (!elite) expect(x.menu).toBe('route');
  });

  it('锁住的卡留到下一手；放逐的不再出现', () => {
    const x = createWorld(setup(11));
    const toCards = (): void => {
      let g = 0;
      while (!(x.phase === 'choose' && x.menu === 'cards') && g++ < 4000) drive(x, 1, {}, { god: true, kill: true });
    };
    toCards();
    const locked = x.choices[4]!;
    step(x, 0, Pick.Lock + 4);
    expect(x.rushLocked).toEqual([locked]);
    const banned = x.choices.find((c) => c.kind === 'weapon' || c.kind === 'passive')!;
    const bi = x.choices.indexOf(banned);
    if (banned !== locked) step(x, 0, Pick.Ban + bi);
    while (x.menu === 'cards' && x.phase === 'choose') step(x, 0, x.choices.findIndex((c) => c !== locked));
    toCards();
    expect(x.choices[0]).toEqual(locked);
    if (banned !== locked) {
      expect(x.banned).toContain(banned.id);
      expect(x.choices.some((c) => c.id === banned.id)).toBe(false);
    }
  });

  it('稀有度：几级的卡升几级，新法器直接到这一级；符印进包、血葫芦加血上限', () => {
    const w = createWorld(setup(13));
    const have = w.weapons[0]!;
    const lv = have.level;
    applyRushCard(w, { kind: 'weapon', id: have.id, tier: 2 }, RUSH_API);
    expect(w.weapons[0]!.level).toBe(lv + 2);
    const hp = w.stats.hpMax;
    applyRushCard(w, { kind: 'relic', id: 'gourd', tier: 3 }, RUSH_API);
    expect(w.rushRelics).toEqual(['gourd']);
    expect(w.stats.hpMax).toBe(hp + 25);
  });

  it('换图：地形、水、冰、香炉对上新图，场上没有残留的怪和掉落，主角在中心', () => {
    const w = createWorld(setup(17));
    drive(w, 1, { route: () => Pick.Route }, {});
    if (w.phase === 'choose') step(w, 0, Pick.Leave);
    drive(w, RUSH.first + 30);
    expect(w.eCount).toBeGreaterThan(0);
    for (const map of ['bamboo', 'icelake', 'riverbank', 'temple'] as const) {
      rushEnterMap(w, map);
      expect(w.mapId).toBe(map);
      expect(w.blocks).toBe(MAPS[map].blocks);
      expect(w.water).toEqual(MAPS[map].water ?? []);
      expect(w.ice).toEqual(MAPS[map].ice ?? []);
      expect(w.incense).toEqual(MAPS[map].incense ?? []);
      expect(w.eCount).toBe(0);
      expect(w.eAlive.some((v) => v === 1)).toBe(false);
      expect(w.dAlive.some((v) => v === 1)).toBe(false);
      expect([w.x, w.y]).toEqual([ARENA.w / 2, ARENA.h / 2]);
    }
    // 竹林换出去再换回来，竹子血是满的
    rushEnterMap(w, 'bamboo');
    expect(w.blockHp.length).toBeGreaterThan(0);
    // 换完照常打
    drive(w, 300, {}, { god: true });
    expect(w.phase).not.toBe('over');
  });

  it('软限时：到点首领发狂，伤害、移速按档往上加，不判负', () => {
    const w = createWorld(setup(19));
    drive(w, 1);
    if (w.phase === 'choose') step(w, 0, Pick.Leave);
    drive(w, RUSH.first + 1);
    const i = w.eRush.findIndex((v, k) => v === 1 && w.eAlive[k] === 1);
    const dmg = w.eDmg[i]!;
    const speed = w.eSpeed[i]!;
    let rage = 0;
    drive(w, RUSH.soft + RUSH.enrage.every + 5, {}, { god: true, onTick: (x) => {
      rage = Math.max(rage, x.rushRage);
      // 首领打不死，只看发狂
      for (let k = 0; k < x.eRush.length; k++) if (x.eRush[k] && x.eAlive[k]) x.eHp[k] = x.eHpMax[k]!;
    } });
    expect(w.phase).not.toBe('over');
    expect(rage).toBe(2);
    expect(w.eAlive[i]).toBe(1);
      expect(w.eDmg[i]).toBeCloseTo(dmg * (1 + 2 * RUSH.enrage.dmg), 6);
      expect(w.eSpeed[i]).toBeCloseTo(speed * (1 + 2 * RUSH.enrage.speed), 6);
  });

  it('打通：10 关 + 终局，打倒 11 只就收工，战果全清', () => {
    const w = drive(createWorld(setup(23)), 60_000, {}, { god: true, kill: true });
    expect(w.phase).toBe('over');
    expect(w.won).toBe(true);
    expect(w.rushPath.length).toBe(RUSH.stages);
    const r = rushResult(w)!;
    expect(r).toMatchObject({ down: RUSH_TOTAL, total: RUSH_TOTAL, cleared: true, hexes: 0 });
    expect(r.ticks).toBe(w.rushEnd);
  });

  it('倒下：没有总限时，血掉光才收工；战果按打倒几只', () => {
    const w = drive(createWorld(setup(29, { danger: 4 })), 200_000);
    expect(w.phase).toBe('over');
    expect(w.won).toBe(false);
    const r = rushResult(w)!;
    expect(r.cleared).toBe(false);
    expect(r.down).toBe(w.rushDown);
  });
});

describe('连战：驿站', () => {
  /** 找一条带某种驿站的种子和列 */
  function find(kind: 'shop' | 'rest' | 'event', event?: string): { seed: number; col: number; path: number } {
    for (let seed = 1; seed < 500; seed++) {
      const r = rushRoute(seed);
      const p = r.layers[0]!.findIndex((o) => o.stop === kind && (!event || o.event === event));
      if (p >= 0) return { seed, col: 0, path: p };
    }
    throw new Error('找不到');
  }

  it('商店：钱够才买，买了扣钱、每格（含重抽、放逐）只卖一次；满血不卖回血', () => {
    const { seed, path } = find('shop');
    const w = createWorld(setup(seed));
    step(w, 0, Pick.Route + path);
    expect(w.menu).toBe('stop');
    expect(w.stop).toBe('shop');
    const heal = w.stopGoods.findIndex((g) => g.kind === 'heal');
    step(w, 0, Pick.Buy + heal);
    expect(w.stopGoods[heal]!.sold).toBe(false);
    w.rushCoins = 100;
    const ban = w.stopGoods.findIndex((g) => g.kind === 'ban');
    const bans = w.bans;
    step(w, 0, Pick.Buy + ban);
    step(w, 0, Pick.Buy + ban);
    expect(w.bans).toBe(bans + 1);
    expect(w.rushCoins).toBe(100 - RUSH.prices.ban);
    step(w, 0, Pick.Buy + heal);
    expect(w.stopGoods[heal]!.sold).toBe(false);
    expect(w.rushCoins).toBe(100 - RUSH.prices.ban);
    w.hp = w.stats.hpMax / 2;
    step(w, 0, Pick.Buy + heal);
    expect(w.stopGoods[heal]!.sold).toBe(true);
    const coins = w.rushCoins;
    step(w, 0, Pick.Buy + heal);
    expect(w.rushCoins).toBe(coins);
    step(w, 0, Pick.Leave);
    expect(w.phase).toBe('play');
  });

  it('休整：回血或一件法器升两级', () => {
    const { seed, path } = find('rest');
    const w = createWorld(setup(seed));
    step(w, 0, Pick.Route + path);
    const lv = w.weapons[0]!.level;
    step(w, 0, Pick.Rest + 1);
    expect(w.weapons[0]!.level).toBe(lv + RUSH.restLevels);
    expect(w.phase).toBe('play');
  });

  it('事件：古井许愿下一手多 2 张；无名碑放逐 +2', () => {
    const a = find('event', 'well');
    const w = createWorld(setup(a.seed));
    step(w, 0, Pick.Route + a.path);
    expect(w.stopChoices.length).toBe(2);
    step(w, 0, Pick.Event + 1);
    expect(w.rushNext.hand).toBe(2);
    let g = 0;
    while (!(w.phase === 'choose' && w.menu === 'cards') && g++ < 4000) drive(w, 1, {}, { god: true, kill: true });
    expect(w.choices.length).toBe(RUSH.hand + 2);
    const b = find('event', 'stele');
    const v = createWorld(setup(b.seed));
    const bans = v.bans;
    step(v, 0, Pick.Route + b.path);
    step(v, 0, Pick.Event);
    expect(v.bans).toBe(bans + 2);
  });
});

describe('连战：确定性', () => {
  it('同种子同选择（路线、商店、事件、休整、锁、放逐、重抽）：逐拍指纹相同', () => {
    const policy: Policy = {
      route: (w) => Pick.Route + (w.rushStage % w.rush!.layers[w.rushStage]!.length),
      stop: (w) => {
        if (w.stop === 'shop') {
          const k = w.stopGoods.findIndex((g) => !g.sold && g.price <= w.rushCoins && g.kind !== 'ban' && g.kind !== 'reroll');
          return k >= 0 ? Pick.Buy + k : Pick.Leave;
        }
        if (w.stop === 'event') return Pick.Event;
        if (w.stop === 'rest') return Pick.Rest + 1;
        return Pick.Leave;
      },
      card: (w) => (w.rerolls > 0 && w.rushStage === 2 ? Pick.Reroll : w.rushLocks > 0 && w.rushLocked.length === 0 ? Pick.Lock + w.choices.length - 1 : 0),
    };
    const run = (): number[] => {
      const out: number[] = [];
      drive(createWorld(setup(31, { rushHexes: ['fierce', 'poor'] })), 30_000, policy, { god: true, kill: true, onTick: (w) => w.tick % 60 === 0 && out.push(fingerprint(w)) });
      return out;
    };
    const a = run();
    expect(a.length).toBeGreaterThan(10);
    expect(run()).toEqual(a);
  });
});

describe('连战：录像', () => {
  it('新选择码（锁、路、买、离开、事件、休整）录像编码装得下', () => {
    const picks = [Pick.Lock + 4, Pick.Route + 2, Pick.Buy + 5, Pick.Leave, Pick.Event + 2, Pick.Rest + 6].map((choice, k) => ({ tick: k * 100, choice }));
    expect(decodePicks(encodePicks(picks))).toEqual(picks);
  });
});

describe('连战：打倒几只按关算', () => {
  it('双煞一关两只都倒了 down 只 +1；倒第一只不加', () => {
    let seed = 1;
    while (RUSH_FOES[rushRoute(seed).foes[0]!].kinds.length < 2) seed++;
    const w = createWorld(setup(seed));
    step(w, 0, Pick.Route);
    if (w.phase === 'choose') step(w, 0, Pick.Leave);
    drive(w, RUSH.first + 2);
    const slots = [...w.eRush.keys()].filter((i) => w.eRush[i] && w.eAlive[i]);
    expect(slots.length).toBe(2);
    let downs: number[] = [];
    // 一只一只打：先只压第一只的血，倒了再压第二只
    for (const i of slots) {
      for (let g = 0; g < 3000 && w.eAlive[i] && w.eRush[i]; g++) {
        w.eHp[i] = Math.min(w.eHp[i]!, 1);
        drive(w, 1, {}, { god: true });
      }
      expect(w.eRush[i]).toBe(0);
      downs = [...downs, w.rushDown];
    }
    expect(downs[0]).toBe(0);
    expect(w.rushDown).toBe(1);
    expect(rushResult(w)!.down).toBe(1);
  });
});

describe('连战：接上首领路（夜漏君、词缀、精英招式）', () => {
  const kindOf = (w: World, i: number) => ENEMIES[w.eKind[i]!]!.kind;
  const bosses = (w: World) => [...w.eRush.keys()].filter((i) => w.eRush[i] && w.eAlive[i]);
  const enter = (w: World): World => {
    step(w, 0, Pick.Route);
    if (w.phase === 'choose') step(w, 0, Pick.Leave);
    return drive(w, RUSH.first + 2);
  };

  it('终局是夜漏君，血按 YELOU；终局不吃软限时发狂', () => {
    const w = enter(createWorld(setup(31)));
    rushSkipToFinal(w, RUSH.stages);
    drive(w, 32, {}, { god: true });
    const [i] = bosses(w);
    expect(kindOf(w, i!)).toBe(RUSH.finalKind);
    expect(RUSH.finalKind).toBe('yelou');
    expect(w.eHpMax[i!]).toBeCloseTo(YELOU.hp * w.rushHpMul, 6);
    drive(w, RUSH.soft + RUSH.enrage.every * 2, {}, { god: true, onTick: (x) => {
      for (const k of bosses(x)) x.eHp[k] = x.eHpMax[k]!;
    } });
    expect(w.rushRage).toBe(0);
  });

  it('词缀生效：咒「凶」第 1 关就带词缀，抽到「铁」血 ×1.25', () => {
    let hit = false;
    for (let seed = 1; seed < 80 && !hit; seed++) {
      const w = enter(createWorld(setup(seed, { rushHexes: ['fierce'] })));
      const opt = w.rush!.layers[0]![0]!;
      for (const i of bosses(w)) {
        expect(w.eAffix[i]).not.toBe(0);
        if (!(w.eAffix[i]! & AFFIX_BIT.tough)) continue;
        const base = RUSH.hp[0]! * RUSH_FOES[w.rush!.foes[0]!].hpK * w.rushHpMul * (opt.elite ? RUSH.eliteHp : 1);
        expect(w.eHpMax[i]).toBeCloseTo(base * AFFIX_FX.tough, 6);
        hit = true;
      }
    }
    expect(hit).toBe(true);
  });

  it('精英招式伤害随关数涨：鬼市主的钱弹按 eAtk 乘', () => {
    const got: number[] = [];
    for (const k of [0, RUSH.stages - 1]) {
      const w = enter(createWorld(setup(37)));
      const i = RUSH_API.spawn(w, 'marketboss');
      const atk = RUSH.dmg[k]! / ENEMY_BY_KIND.marketboss.dmg;
      w.eAtk[i] = atk;
      const want = MARKETBOSS.dmg * atk;
      let seen = false;
      drive(w, MARKETBOSS.every[0]! + 30, {}, { god: true, onTick: (x) => {
        for (let s = 0; s < x.sAlive.length; s++) if (x.sAlive[s] && x.sDmg[s] === want) seen = true;
      } });
      expect(seen).toBe(true);
      got.push(want);
    }
    expect(got[1]!).toBeGreaterThan(got[0]!);
  });
});
