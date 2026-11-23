/** 攻防段位（base.md 第④批）：按奖杯分 7 档，只管显示，不重置、不发奖品。名字自拟 */
export interface League {
  /** 到这一档要的奖杯 */
  min: number;
  name: string;
}

export const LEAGUES: readonly League[] = [
  { min: 0, name: '舢板' },
  { min: 100, name: '单桅' },
  { min: 250, name: '双桅' },
  { min: 450, name: '三桅' },
  { min: 700, name: '战舰' },
  { min: 1000, name: '旗舰' },
  { min: 1400, name: '海王' },
];
