/**
 * 钱包里掼蛋桌上那一份，但这台设备上没有它的存档（别的设备开的，或者带入的回话没收到）：单机的可以原样退回，
 * 不然要干等 24 小时到期。好友房的（gd-）不归这里管；斗地主单机的（solo-ddz-）归 doudizhu/stake.ts。
 * 钱包按游戏 id 记，掼蛋和斗地主都是 guandan，所以要认得斗地主的 ref 才能排除，放在认得两个玩法的根目录。
 */
import { isSoloRef as isDdzSoloRef } from '../variants/doudizhu/stake/index.ts';
import { isSoloRef } from '../variants/guandan/stake/index.ts';
import type { WalletView } from './common/stake-api.ts';
import type { StakeSave } from './guandan/stake.ts';

export function strayStake(w: WalletView, local: StakeSave | null): { ref: string; solo: boolean } | null {
  const st = w.stakes.find((x) => x.game === 'guandan' && !isDdzSoloRef(x.ref));
  if (!st || st.ref === local?.ref) return null;
  return { ref: st.ref, solo: isSoloRef(st.ref) };
}
