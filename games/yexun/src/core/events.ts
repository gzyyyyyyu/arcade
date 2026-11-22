/**
 * 核心每一拍产生的事件：画面拿它放特效和声音，规则不读它。
 * 用定长的并列数组存（一拍几百个命中也不分配对象）；每拍开始清零。
 */
export const Ev = {
  /** 打中：x, y, a = 伤害, b = 1 暴击, c = 怪的槽位 */
  Hit: 1,
  /** 打死：x, y, a = 怪的种类编号, b = 精英 1, c = 槽位 */
  Kill: 2,
  /** 桃木剑一道斩：x, y, a = 方向表下标, b = 半径, c = 1 进化 */
  Slash: 3,
  /** 天雷：x, y, a = 连锁的第几下, b = 半径, c = 1 是连锁跳过来的（不从天上劈） */
  Thunder: 4,
  /** 镇魂铃响一下：x, y, b = 半径 */
  Bell: 5,
  /** 法器出手（放声音）：a = 法器编号（weaponCode） */
  Fire: 6,
  /** 捡到：x, y, a = 掉落种类（Drop）, b = 值 */
  Pickup: 7,
  /** 升级：a = 新等级 */
  LevelUp: 8,
  /** 挨打：x, y, a = 掉的血 */
  Hurt: 9,
  /** 开宝箱：x, y, a = 法器或被动的编号（< 0 表示铜钱和回血） */
  Chest: 10,
  /** 进化：a = 法器编号 */
  Evolve: 11,
  /** 精英或尸王出场：x, y, a = 种类编号 */
  Arrive: 12,
  /** Boss 的技能：x, y, a = 0 跳砸警告 1 砸下 2 召唤 3 尸气（b = 半径）；4 进下一段（b = 段号，c = 怪种类）；纸扎老爷 5 召纸轿 6 撒纸钱 */
  Boss: 13,
  /** 一局结束：a = 1 赢（天亮）, b = 1 打倒了尸王 */
  End: 14,
  /** 符咒爆开：x, y, b = 半径 */
  Burst: 15,
  /** 八卦镜放一道光波：x, y, a = 晚几拍放, b = 推到多远, c = 每拍扩多少 */
  Wave: 16,
  /** 火葫芦喷火：x, y, a = 方向表下标, b = 火舌长, c = 半宽（方向表格数） */
  Flame: 17,
  /** 缚妖索捆住一只：x, y, a = 这一串里第几只, c = 怪的槽位 */
  Bind: 18,
  /** 桃花落地：x, y, b = 半径 */
  Petal: 19,
  /** 金钟罩：x, y, a = 0 碎了震开 1 回了一层, b = 震的半径 */
  Shield: 20,
  /** 连锁雷的一跳：从 (x, y) 到 (b, c) */
  Chain: 21,
  /** 合成：a = MERGES 的下标 */
  Merge: 22,
  /** 三昧真火在地上留了一摊火：x, y, b = 半径, c = 烧几拍 */
  Burn: 23,
  /** 黄鼠狼叼走铜钱：a = 一共叼了几枚 */
  Steal: 24,
  /** 铜钱挡下一颗敌方的弹 */
  Block: 25,
  /** 更夫敲锣，全屏的怪往后退：x, y, b = 半径 */
  Gong: 26,
  /** 复活：x, y, a = 还剩几次, b = 震开的半径 */
  Revive: 27,
  /** 守夜开宝箱（精英、老爷掉的）：x, y, a = 一共升几件（1 / 3 / 5） */
  ChestBig: 28,
  /** 碰碎摆设：x, y, a = 摆设种类（0 灯笼架 1 纸扎）, b = 掉了什么（Drop，0 没掉） */
  Prop: 29,
  /** 符咒炸弹炸开：x, y, b = 半径 */
  Bomb: 30,
  /**
   * 特色怪的技能（content/regions.ts 的怪）：x, y, a = 子类, b = 半径, c = 预警拍数。
   * 0 竹精预警 1 竹精出土 2 溺鬼拖住 3 冰傀碎裂 4 冰刺预警 5 冰刺落下 6 蛇精窜出 7 河伯涨潮
   * 8 冰魄预警 9 冰魄霜环 10 更夫敲梆 11 石僧预警 12 石僧掌击 13 竹王破土
   */
  Mob: 31,
  /** 竹子挨了一下：x, y = 竹丛脚底中心, a = 第几块（MapDef.blocks 的下标）, b = 剩下的血占几分之几（0–1）, c = 1 倒了 */
  Chop: 32,
  /** 符剑合璧：飞剑给怪贴了一张符：x, y；a = 1 炸了，b = 半径 */
  Seal: 33,
  /** 焚天金钟：外圈火环烧一下：x, y, b = 半径 */
  FireRing: 34,
  // 40–54 是夜探的（含义见 src/explore/host.ts 的 RaidEv，编号两边一致，测试锁住）
  GateOpen: 40,
  GateClose: 41,
  ChestOpen: 42,
  Loot: 43,
  Escape: 44,
  Dawn: 45,
  Lost: 46,
  Alert: 47,
  Beast: 48,
  Roamer: 49,
  Restock: 50,
  Goblin: 51,
  Market: 52,
  Key: 53,
  Vault: 54,
  /** 纸兵倒下：a = 0 倒下 / 1 撒豆成兵炸开 / 2 鸣兵震开；b = 半径 */
  Paper: 55,
  /** 跳过选卡拿到的小奖：a = 0 铜钱 / 1 回血 / 2 下次多一张卡 / 3 刷新 +1，b = 数量 */
  Skip: 56,
  /** 补了一次刷新：a = 0 进化 / 1 打倒精英或首领 */
  Reroll: 57,
  /** 守夜夜市：x, y = 中间那摊；a = 0 预告 / 1 开市 / 2 收市 / 3 买下（b = 第几摊，c = 货在 MARKET_GOODS 里的序号） */
  NightMarket: 58,
  /** 地图事件（mapEvents.ts）：x, y = 主角；a = 0 预告 / 1 开始 / 2 结束，b = 事件编号（MAP_EVENT_KINDS 的下标），c = 这局第几次（0 起） */
  MapEvent: 59,
  /** 血月（危险 8）：x, y = 主角；a = 0 预告 / 1 升起 / 2 落下 */
  BloodMoon: 60,
  /** 精英发狂（噩梦档）：x, y = 精英，a = 槽位 */
  EliteRage: 61,
  /** 寒泉：x, y = 泉心；a = 0 冒出来 / 1 寒潭干了炸开 / 2 雷雨（雷顺着泉水传开），b = 半径 */
  Spring: 62,
  /**
   * 首领连战（Setup.rush）：a = 0 一关上场（x, y = 主角，b = 第几关，c = 这关几只）/ 1 打倒一只关底（x, y = 它倒下的地方，b = 一共打倒几只，c = 怪的编号）
   * / 2 全清（b = 那一拍）
   */
  Rush: 63,
  /**
   * 画皮（x, y = 它的位置，b = 槽位）：a = 0 出场（还混在怪里）/ 1 混迹时第一次挨打（只发一次）/ 2 现形
   * / 3 甩出分身（b 改为分身数）/ 4 倒下
   */
  Huapi: 64,
  /** 角色放技能（core/skills.ts）：x, y = 主角（御剑是冲出去前的位置）；a = 技能编号（SKILL_IDS 的下标），b = 持续拍数（剑气、万符、御剑没有持续，b 是面向的方向表下标），c = 范围（剑气是半径，万符是张数，御剑是冲多远，其余是影响半径） */
  SkillUse: 65,
  /** 技能持续结束：x, y = 主角，a = 技能编号；铁布衫 b = 震开的半径 */
  SkillEnd: 66,
  /** 技能持续中的一下：a = 技能编号；更夫的梆 b = 半径，回春的一跳 b = 半径、c = 回的血，御剑 b、c = 冲到的位置；阴阳先生的阴阳互换（规则 66，不在技能持续里）b = 定住的拍数、c = 半径 */
  SkillBeat: 67,
  /**
   * 2.0 的首领和特色怪（core/foes/）：x, y = 发生的地方，a = 子类，b、c 见下。
   * 30–34 预警（b = 半径，c = 预警拍数）、50–54 落下（b = 半径），个位是圈的样子：0 竹笋 1 水猴扑 2 冰刺 3 金光圈 4 鼠洞（5 水袖）；
   * 2 竹浪放出（b = 方向 0–3）3 竹母召竹精 4 水猴潜水 5 水猴冒出 6 水鞭（b = 方向表下标）7 拖人（b = 1 开始 0 断）8 冰风（b = 方向表下标，c = 预警拍）
   * 9 冰面裂开（c = 预警拍）10 无面佛蓄力冲撞 11 撞墙眩晕 12 香炉全灭 13 雪童子（b = 0 现身冲刺 1 被火打出原形）14 棺盖弹开 15 棺钉
   * 16 棺钉鬼倒了留空棺 17 戏台开锣（b = 第几场）18 戏班鬼影冒出 19 水袖 20 换脸 / 金光圈（无面佛，b = 第几尊小佛）21 硕鼠钻地（b = 0 钻 1 冒）
   * 22 吐米 23 首领倒下（b = 怪种类编号）
   */
  Foe: 68,
} as const;
export type Ev = (typeof Ev)[keyof typeof Ev];

export const EV_CAP = 4096;

export class Events {
  n = 0;
  readonly type = new Int8Array(EV_CAP);
  readonly x = new Float64Array(EV_CAP);
  readonly y = new Float64Array(EV_CAP);
  readonly a = new Float64Array(EV_CAP);
  readonly b = new Float64Array(EV_CAP);
  readonly c = new Float64Array(EV_CAP);

  push(t: Ev, x: number, y: number, a = 0, b = 0, c = 0): void {
    const i = this.n;
    if (i >= EV_CAP) return;
    this.type[i] = t;
    this.x[i] = x;
    this.y[i] = y;
    this.a[i] = a;
    this.b[i] = b;
    this.c[i] = c;
    this.n = i + 1;
  }

  /** 这一拍第一条类型为 t（a ≥ 0 时还要 a 对上）的事件下标，没有回 -1 */
  find(t: number, a = -1): number {
    for (let q = 0; q < this.n; q++) if (this.type[q] === t && (a < 0 || this.a[q] === a)) return q;
    return -1;
  }
}
