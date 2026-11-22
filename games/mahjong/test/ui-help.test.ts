import { describe, expect, it } from 'vitest';
import { resetSettings, SETTINGS_DEFAULTS, prefs } from '../src/app/prefs.ts';
import { TERMS } from '../src/view/terms.ts';
import { ERR_REFRESH, NET_FAIL, walletError } from '../src/view/text.ts';
import { LIMIT_NAME, PAY_NAME } from '../src/view/variants/riichi/text.ts';
import { PAY_KIND } from '../src/view/text.ts';

describe('设置面板恢复默认', () => {
  it('改过的偏好回到出厂值，其余不动', () => {
    const p = { ...prefs, sound: false, volume: 0.1, ambience: false, safeHint: false, fast: true, level: 'hard' as const };
    resetSettings(p);
    expect(p).toMatchObject({ ...SETTINGS_DEFAULTS, level: 'hard' });
  });
});

describe('结算术语说明', () => {
  it('结算里会出现的术语都有说明', () => {
    for (const w of ['本场', '供托', '跳满', '里宝指示', '退税']) expect(TERMS[w]).toBeTruthy();
    for (const w of [...Object.values(PAY_NAME), ...Object.values(PAY_KIND)]) if (['本场', '供托', '退税', '包牌'].includes(w)) expect(TERMS[w]).toBeTruthy();
    for (const w of Object.values(LIMIT_NAME)) if (w) expect(TERMS[w]).toBeTruthy();
  });
});

describe('连不上的话术', () => {
  it('断网、平台不可用、服务出错都是同一句；对照表其余不变', () => {
    for (const c of ['network', 'unavailable', 'internal']) expect(walletError(c).text).toBe(NET_FAIL);
    expect(walletError('whatever')).toEqual({ text: ERR_REFRESH, fix: 'refresh' });
    expect(walletError('no_stake').fix).toBe('wallet');
  });
});
