/**
 * 图鉴和成就（DESIGN.md 3.8）：怪物、法器、成就四个标签（怪物、法器、成就、夜事；夜事页只是查阅，不算收集度），顶上是总收集度。
 * 数据每次 show 时重新读（传进来的是取数函数），所以结算后再打开就是最新的。
 * 没见过的怪画成黑影加问号，没用过的法器同理。图标只用图集里已有的帧（key 找不到时 icons 自己兜底）。
 */
import { ACHIEVEMENTS, rewardCoins } from '../../content/achievements.ts';
import { ENEMIES, type EnemyKind } from '../../content/enemies.ts';
import { SHELVED_KINDS } from '../../content/foes.ts';
import { PASSIVES, WEAPONS, spanNums, type WeaponId } from '../../content/weapons.ts';
import { collection, type Records } from '../../meta/records.ts';
import { beijingDate } from '../../online/daily.ts';
import { combosClick, combosFor, mergeHow, newCombosState, renderCombos, whoText } from './codexCombos.ts';
import { SHOWN_MERGES } from '../../content/combos.ts';
import { nightData } from './codexNights.ts';
import { closeModal, modalChrome, openModal } from './modal.ts';
import { PAGER_CTL, Pager } from './pager.ts';
import './codex.css';
import { esc } from './screens/shared.ts';


/** 怪的名字和一句话（图集里的帧名 = 怪的 kind） */
export const MONSTER_INFO: Record<EnemyKind, { name: string; tag: string; blurb: string }> = {
  paper: { name: '纸人', tag: '常规', blurb: '成群结队，很脆，怕火' },
  wisp: { name: '小鬼火', tag: '常规', blurb: '又快又脆，成串飘来' },
  jiangshi: { name: '跳尸', tag: '常规', blurb: '一蹦一蹦，落地会停一下；怕火怕铃' },
  lantern: { name: '灯笼鬼', tag: '常规', blurb: '远远停下吐火球；刀剑伤不了它，怕水' },
  fox: { name: '狐妖', tag: '常规', blurb: '停一下，然后猛冲过来' },
  horse: { name: '纸马', tag: '常规', blurb: '排成一列直直冲来，怕火' },
  water: { name: '水鬼', tag: '常规', blurb: '从地里冒出来，抓住你会拖慢脚步；怕土' },
  bone: { name: '枯骨', tag: '常规', blurb: '打碎后散成两只小的；怕铃声' },
  bat: { name: '蝙蝠精', tag: '常规', blurb: '飞得快，乱晃，成群来' },
  scarecrow: { name: '稻草人', tag: '常规', blurb: '站着不动，走近才醒，很硬；怕火' },
  weasel: { name: '黄鼠狼', tag: '常规', blurb: '偷地上的铜钱就跑，追上打死加倍还' },
  snow: { name: '雪魅', tag: '常规', blurb: '远处丢冰锥，打中会变慢；怕火' },
  shishi: { name: '石狮怪', tag: '精英', blurb: '又大又慢又硬，刀剑砍不动' },
  general: { name: '跳尸将军', tag: '精英', blurb: '会召唤小跳尸；怕火怕铃' },
  whitefox: { name: '白狐', tag: '精英', blurb: '一口气连冲三下' },
  palanquin: { name: '纸轿', tag: '精英', blurb: '四个纸人抬着，打碎放出一群纸人' },
  lord: { name: '纸扎老爷', tag: 'Boss', blurb: '撒纸钱，召纸轿；约 8 分钟现身' },
  huapi: { name: '画皮', tag: 'Boss', blurb: '鬼市约 8 分钟混进怪群，头顶一缕红丝；打疼了才现形，甩人皮分身、身边缠丝拖慢人' },
  huapiskin: { name: '人皮', tag: 'Boss', blurb: '画皮甩出来的分身，碰到会挨打，打两下就破' },
  patrol: { name: '巡夜将', tag: '精英', blurb: '夜探里守着铜箱和院子，看见就追；6 分钟、11 分钟还有游荡的' },
  beast: { name: '镇门石兽', tag: 'Boss', blurb: '夜探里守着金箱，会扑、会甩尾；血少一半连扑两下' },
  goblin: { name: '宝妖', tag: '精英', blurb: '夜探 5、10 分钟各出一只，背着宝袋见人就跑；追上打倒掉两件好宝物' },
  bamsprout: { name: '竹精', tag: '竹林', blurb: '脚边先冒一圈绿影，过一会儿破土而出狠拍一下；怕火' },
  snakespirit: { name: '蛇精', tag: '竹林', blurb: '藏在竹影里慢慢游，近了猛地窜出来；怕火' },
  bambooking: { name: '竹王', tag: '精英', blurb: '竹林的主人，隔一阵在你四周种出一圈竹精；怕火' },
  drown: { name: '溺鬼', tag: '河滩', blurb: '从水边冒出来，抓住你往回拖，脚步变沉；怕土' },
  crab: { name: '河蟹', tag: '河滩', blurb: '横着走，壳很硬，刀剑符咒都吃力；怕火' },
  hebo: { name: '河伯', tag: '精英', blurb: '涨潮放出一圈水弹，还会放出溺鬼；怕土' },
  icegolem: { name: '冰傀', tag: '冰湖', blurb: '一身冰块，打碎了裂成两个小的；怕火怕铃' },
  icicle: { name: '冰凌', tag: '冰湖', blurb: '远远盯着你脚下，先画圈再落冰刺，别站着不动；怕火' },
  frostsoul: { name: '冰魄', tag: '精英', blurb: '蓄力后震出一圈寒霜，冻住脚步，还会放出冰傀；怕火' },
  nightwatch: { name: '更夫鬼', tag: '古镇', blurb: '夜探古镇里敲梆子，每敲一下招来小鬼火；怕火怕铃' },
  stonemonk: { name: '石僧', tag: '山寺', blurb: '夜探山寺里又慢又硬，走近了合掌拍地；刀剑砍不动，怕水怕铃' },
  templeghost: { name: '庙祝鬼', tag: '荒庙', blurb: '远远站着往你脚下撒香灰，先画灰圈，落地迷眼走慢；怕火' },
  puppet: { name: '皮影鬼', tag: '鬼市', blurb: '驴皮刻的影人，原地一闪一闪，下一下就蹦到你跟前；怕火' },
  peddler: { name: '鬼贩', tag: '鬼市', blurb: '挑着担子躲着你走，你追它就退，远远丢钱袋；怕火、怕木' },
  marketboss: { name: '鬼市主', tag: '精英', blurb: '鬼市的东家，朝你撒一扇铜钱，血少了还叫皮影鬼围上来；怕符怕铃' },
  crossbow: { name: '纸弩手', tag: '河滩·荒庙', blurb: '糊纸的小人端着弩，远远站在你够不着的地方放箭，你一靠近它就后退；怕火、怕木，镇守的铃和镜够不着它，追上去用远处的法器' },
  hurrier: { name: '催命鬼', tag: '河滩·荒庙', blurb: '你站在原地不动超过两秒，它就通身变红、跑得飞快扑过来；一动起来它就慢下来；怕火怕符' },
  juemu: { name: '掘墓鬼', tag: '乱葬岗', blurb: '从你脚边的土里钻出来；很怕火，引进烧着的磷火里一下就没了' },
  taoyong: { name: '陶俑', tag: '窑镇', blurb: '烧过的泥胎，又硬又慢，刀剑砍不动；怕水' },
  lampghost: { name: '提灯鬼', tag: '常规', blurb: '提着灯笼不怕火，危险 3 以后半夜出来；怕符、怕铃' },
  boss: { name: '尸王', tag: 'Boss', blurb: '跳砸、召唤、尸气，血越少越凶；14 分钟现身' },
  zhumu: { name: '千年竹母', tag: 'Boss', blurb: '竹林约 8 分钟现身：地里排出一行竹笋（先冒红圈）、召一圈竹精；血少一半后整片竹林摇晃，四个方向轮流扫来竹浪，躲进空隙；怕火' },
  shuihou: { name: '水猴王', tag: 'Boss', blurb: '河滩约 8 分钟现身：潜水不见，从你脚边冒出来扑一下；甩三条水鞭打中减速；血少一半后把你往河里拖，走出河岸就断' },
  binghun: { name: '冰魄娘娘', tag: 'Boss', blurb: '冰湖约 8 分钟现身：吹冰风让冰面更滑、身周落一圈冰刺；血少一半后冰面裂成浮冰，只有浮冰上走得稳，水里只是慢；怕火' },
  wumian: { name: '无面佛', tag: 'Boss', blurb: '荒庙约 8 分钟现身：端坐不动，四尊小佛轮流放金光圈；睁眼冲撞，撞上庙柱眩晕 3 秒，趁机输出；血少一半后香炉全灭，香火区外挨打 ×1.5' },
  xuetong: { name: '雪童子', tag: '雪原', blurb: '白毛风来时隐在雪里只露一对黑眼，靠近到跟前才现身冲刺；被火打中现形；怕火' },
  guandingui: { name: '棺钉鬼', tag: '义庄', blurb: '躺在棺材旁，走近弹开棺盖坐起，朝你钉出三枚棺钉（直线，可躲）；倒下留一副空棺；怕火怕符' },
  coffin: { name: '空棺', tag: '义庄', blurb: '棺钉鬼留下的空棺，挡路；打碎，或过一阵自己散' },
  ratdemon: { name: '鼠妖', tag: '粮仓镇', blurb: '夜探粮仓镇里成群出来，又快又脆；怕火怕铃' },
  troupe: { name: '戏班鬼影', tag: '戏楼镇', blurb: '夜探戏楼镇里戏台开场时成队冒出来，锣鼓点越来越快；怕火怕符' },
  hongyi: { name: '红衣戏子', tag: 'Boss', blurb: '夜探戏楼镇守门：甩水袖扫一圈；换脸后分出假身，头顶有一缕红丝的才是真的' },
  hongyiclone: { name: '戏子假身', tag: 'Boss', blurb: '红衣戏子换脸留下的假身，头顶没有红丝，一碰就破' },
  shuoshu: { name: '硕鼠将军', tag: 'Boss', blurb: '夜探粮仓镇守门：打洞钻地从别处冒出来，吐陈米堆成小山挡路；血少一半后带出一窝鼠妖' },
  ricepile: { name: '米山', tag: '粮仓镇', blurb: '硕鼠将军吐的陈米堆，挡路；打碎，或过一阵自己散' },
};

type Tab = 'monster' | 'weapon' | 'combos' | 'achv' | 'night';
const TABS: [Tab, string][] = [
  ['monster', '怪物'],
  ['weapon', '法器'],
  ['combos', '搭配'],
  ['achv', '成就'],
  ['night', '夜事'],
];

export class Codex {
  readonly root: HTMLDivElement;
  private tab: Tab = 'monster';
  private readonly combos = newCombosState();
  private pager: Pager | null = null;
  private readonly icons: (k: string) => string;
  private readonly getRecords: () => Records;
  onClose: () => void = () => undefined;

  /** icons：图集帧名 → 图片地址；getRecords：取最新的累计统计 */
  constructor(parent: HTMLElement, icons: (k: string) => string, getRecords: () => Records) {
    this.icons = icons;
    this.getRecords = getRecords;
    this.root = document.createElement('div');
    this.root.className = 'yx-screen yx-codex';
    this.root.style.display = 'none';
    parent.appendChild(this.root);
    this.root.addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-a]');
      if (!el || !this.root.contains(el)) return;
      if (el.dataset.a === 'close') this.onClose();
      else if (combosClick(this.combos, el.dataset.a, el.dataset.v)) this.render();
      else if (el.dataset.a === 'tab') {
        this.tab = el.dataset.t as Tab;
        this.render();
      }
    });
  }

  /** character：当前出战的角色，搭配页默认按他看 */
  show(tab?: Tab, character?: string): void {
    if (tab) this.tab = tab;
    if (character) combosFor(this.combos, character);
    this.render();
    this.root.style.display = '';
    openModal(this.root, () => this.onClose(), () => this.hide());
  }

  hide(): void {
    this.root.style.display = 'none';
    closeModal(this.root);
  }

  private render(): void {
    const rec = this.getRecords();
    const col = collection(rec);
    const [sub, body] = this.tab === 'monster' ? this.monsters(rec) : this.tab === 'weapon' ? this.weapons(rec) : this.tab === 'combos' ? ['', renderCombos(this.combos, this.icons, rec)] : this.tab === 'achv' ? this.achievements(rec) : this.nights();
    const tabs = TABS.map(([t, n]) => `<button type="button" class="yx-tab${t === this.tab ? ' on' : ''}" data-a="tab" data-t="${t}">${n}</button>`).join('');
    this.pager?.destroy();
    this.root.innerHTML =
      '<div class="yx-panel yx-codex-panel">' +
      `<div class="yx-panel-head"><b class="yx-brush">图鉴</b><em>收集度 <strong>${col.percent}%</strong>（${col.done}/${col.total}）</em></div>` +
      `<div class="yx-cbar"><i style="width:${col.percent}%"></i></div>` +
      `<div class="yx-tabs">${tabs}</div>` +
      (sub ? `<div class="yx-csub">${sub}</div>` : '') +
      `<div class="yx-cbody">${body}</div>` +
      `<div class="yx-row3 yx-pgfoot">${PAGER_CTL}<button type="button" class="yx-big ghost" data-a="close">返回</button></div>` +
      '</div>';
    // 翻页：最小一块是卡片、成就行和小标题；标题不单独留在页底
    this.pager = new Pager({ body: this.root.querySelector<HTMLElement>('.yx-cbody')!, ctl: this.root.querySelector<HTMLElement>('.yx-pager')!, leaves: '.yx-ccard, .yx-arow, .yx-cc-row, .yx-cc-w, .yx-cc-line, .yx-cbody h4, .yx-cbody .yx-csub', keep: 'h4, .yx-csub' });
    modalChrome(this.root);
  }

  private monsters(rec: Records): [string, string] {
    // 收起的镇子里才有的怪不列（遇不到，列出来只会永远是问号）
    const list = ENEMIES.filter((e) => !SHELVED_KINDS.includes(e.kind));
    const seenN = list.filter((e) => rec.seen.includes(e.kind)).length;
    const cards = list.map((e) => {
      const info = MONSTER_INFO[e.kind];
      const seen = rec.seen.includes(e.kind);
      const n = rec.killed[e.kind] ?? 0;
      if (!seen) return `<div class="yx-ccard lock"><img class="sil" alt="" src="${this.icons(e.kind)}"><b>？？？</b><span>${info.tag}</span><em>还没见过</em></div>`;
      return `<div class="yx-ccard${n > 0 ? ' done' : ''}"><img alt="" src="${this.icons(e.kind)}"><b>${esc(info.name)}</b><span>${info.tag}</span><p>${esc(info.blurb)}</p><em>${n > 0 ? `打倒 ${n.toLocaleString('zh-CN')} 只` : '见过，还没打倒'}</em></div>`;
    }).join('');
    return [`见过 ${seenN}/${list.length}`, `<div class="yx-cgrid">${cards}</div>`];
  }

  private weapons(rec: Records): [string, string] {
    const ids = Object.keys(WEAPONS) as WeaponId[];
    const badge = (on: boolean, t: string): string => `<i class="${on ? 'on' : ''}">${t}</i>`;
    const cards = ids
      .map((id) => {
        const w = WEAPONS[id];
        const used = rec.weaponsUsed.includes(id);
        const evo = rec.weaponsEvolved.includes(id);
        if (!used) return `<div class="yx-ccard lock"><img class="sil" alt="" src="${this.icons(w.icon)}"><b>？？？</b><span>${w.el}·${w.type}</span><em>还没用过</em></div>`;
        const evoName = w.evolve ? (evo ? w.evolve.name : '？？？') : '';
        return (
          `<div class="yx-ccard${evo ? ' done' : ''}"><img alt="" src="${this.icons(evo && w.evolve ? w.evolve.icon : w.icon)}"><b>${esc(w.name)}</b><span>${w.el}·${w.type}</span>` +
          `<p>${esc(w.desc)}</p><p class="num">1→8 级 ${spanNums(id).map((n) => `${n.name} ${n.from}→${n.to}${n.unit}`).join(' · ')}</p>${evoName ? `<p class="evo">进化：${esc(evoName)}${evo || !w.evolve ? '' : `（满级 + ${esc(PASSIVES[w.evolve.with].name)}）`}</p>` : ''}` +
          `<div class="yx-badges">${badge(true, '用过')}${badge(rec.weaponsMaxed.includes(id), '满级')}${badge(evo, '进化')}</div></div>`
        );
      })
      .join('');
    // 合成页：配方一直写明（让玩家知道凑什么），没做成过的压暗；双修用自己的颜色描边。
    // 合成要两件都进化，配方写两件进化后的名字；双修一件进化、另一件满级就行，写两件法器的名字（条件在下面的 em 里）。只列能选的角色凑得出的
    const merges = SHOWN_MERGES.map((m) => {
      const done = rec.merges.includes(m.id);
      const recipe = m.dual ? `${esc(WEAPONS[m.a].name)} + ${esc(WEAPONS[m.b].name)}` : `${esc(WEAPONS[m.a].evolve!.name)} + ${esc(WEAPONS[m.b].evolve!.name)}`;
      return (
        `<div class="yx-ccard ${done ? 'done' : 'lock'}${m.dual ? ' dual' : ''}" style="--mc:${m.color}">` +
        `<img${done ? '' : ' class="sil"'} alt="" src="${this.icons(done ? m.icon : WEAPONS[m.a].icon)}"><b>${m.dual ? '双修 · ' : ''}${esc(m.name)}</b><span>${esc(whoText(m))}</span>` +
        `<p class="evo">${recipe}</p><p>${esc(m.desc)}</p>${done ? '<em>合成过</em>' : `<em class="how">${mergeHow(m)}</em>`}</div>`
      );
    }).join('');
    const usedN = rec.weaponsUsed.length;
    return [`用过 ${usedN}/${ids.length} · 满级 ${rec.weaponsMaxed.length} · 进化 ${rec.weaponsEvolved.length} · 合成 ${SHOWN_MERGES.filter((m) => rec.merges.includes(m.id)).length}/${SHOWN_MERGES.length}`, `<div class="yx-cgrid">${cards}${merges}</div>`];
  }

  private nights(): ['', string] {
    const d = nightData(beijingDate(Date.now()));
    const events = d.events
      .map((e) => `<div class="yx-ccard yx-cn-card"><i class="yx-cn-ic yx-cn-${e.kind}">${e.icon}</i><b>${esc(e.name)}</b><span>${esc(e.map)}</span><p>${esc(e.blurb)}</p></div>`)
      .join('');
    const rows = (items: { name: string; text: string }[]): string =>
      `<div class="yx-alist">${items.map((r) => `<div class="yx-arow yx-cn-row"><div><b>${esc(r.name)}</b><p>${esc(r.text)}</p></div></div>`).join('')}</div>`;
    return [
      '',
      `<h4>地图事件</h4><div class="yx-csub">${esc(d.eventWhen)}</div><div class="yx-cgrid">${events}</div>` +
      `<h4>高危险档</h4>${rows(d.nightmare.map((n) => ({ name: n.name, text: n.items.join('；') })))}` +
      `<h4>本周夜事</h4><div class="yx-csub">${esc(d.weeklyNote)}</div>${rows(d.weeklies.map((w) => ({ name: w.now ? `${w.name}（本周）` : w.name, text: w.text })))}` +
      `<h4>咒印</h4><div class="yx-csub">${esc(d.curseNote)}</div>${rows(d.curses.map((c) => ({ name: c.name, text: c.text })))}`,
    ];
  }

  private achievements(rec: Records): [string, string] {
    const got = new Set(rec.achievements);
    const gotCoins = rewardCoins(rec.achievements);
    const groups = [...new Set(ACHIEVEMENTS.map((a) => a.group))];
    const html = groups
      .map((g) => {
        const rows = ACHIEVEMENTS.filter((a) => a.group === g)
          .map((a) => {
            const on = got.has(a.id);
            return (
              `<div class="yx-arow${on ? ' done' : ''}"><span class="mark">${on ? '✓' : ''}</span><div><b>${esc(a.name)}</b>${a.title ? `<u>称号「${esc(a.title)}」</u>` : ''}<p>${esc(a.desc)}</p></div>` +
              `<em>${a.coins} 铜钱</em></div>`
            );
          })
          .join('');
        return `<h4>${g}</h4><div class="yx-alist">${rows}</div>`;
      })
      .join('');
    return [`已达成 ${got.size}/${ACHIEVEMENTS.length} · 已得 ${gotCoins.toLocaleString('zh-CN')} 铜钱`, html];
  }
}

/**
 * 解锁成就的小提示条：贴在顶部，一条 3 秒，几条排队依次出。不挡操作（pointer-events: none）。
 * 用法：结算时 `toast.show(unlocked)`；对局中解锁也可以随时调。
 */
export class AchievementToast {
  private readonly root: HTMLDivElement;
  private queue: string[] = [];
  private busy = false;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'yx-atoast';
    parent.appendChild(this.root);
  }

  show(ids: readonly string[]): void {
    this.queue.push(...ids.filter((id) => ACHIEVEMENTS.some((a) => a.id === id)));
    if (!this.busy) this.next();
  }

  clear(): void {
    this.queue = [];
    this.root.innerHTML = '';
    this.busy = false;
  }

  private next(): void {
    const id = this.queue.shift();
    const a = id ? ACHIEVEMENTS.find((x) => x.id === id) : undefined;
    if (!a) {
      this.busy = false;
      return;
    }
    this.busy = true;
    const el = document.createElement('div');
    el.className = 'yx-atoast-item';
    el.innerHTML = `<span class="k">成就达成</span><b>${esc(a.name)}</b><span class="s">${esc(a.desc)} · +${a.coins} 铜钱${a.title ? ` · 称号「${esc(a.title)}」` : ''}</span>`;
    this.root.appendChild(el);
    setTimeout(() => el.classList.add('out'), 2700);
    setTimeout(() => {
      el.remove();
      this.next();
    }, 3100);
  }
}
