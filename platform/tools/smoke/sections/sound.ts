/** 冒烟分段：lobbySound（npm run smoke -- --only=<段名>，段名表在 tools/smoke.ts） */
import type { Browser, Page } from 'playwright-core';
import { BASE, check, shot, newPage } from '../lib/core.ts';

/** 大厅提醒。一处筹码在桌上时直达那个游戏；筹码见底时就地领补给，领完提醒收起。 */
/** 大厅的点按声。开着时按下能点的东西才建 AudioContext；页脚关掉以后记住，再按什么都不建（一点声音都不出），刷新后照样关着 */
export async function lobbySound(browser: Browser): Promise<void> {
  console.log('大厅点按声：开着响、关了记住且一点不响');
  const { ctx, page } = await newPage(browser, '点按声', 'portrait');
  await page.addInitScript(() => {
    const w = window as unknown as { AudioContext: typeof AudioContext; __audio: number };
    w.__audio = 0;
    const Real = w.AudioContext;
    w.AudioContext = class extends Real {
      constructor() {
        super();
        w.__audio++;
      }
    };
  });
  const audio = () => page.evaluate(() => (window as unknown as { __audio: number }).__audio);
  const press = (loc: ReturnType<Page['locator']>) => loc.dispatchEvent('pointerdown', { button: 0, pointerType: 'touch' });
  await page.goto(`${BASE}/`);
  const toggle = page.getByTestId('sound-toggle');
  await toggle.getByText('声音：开').waitFor();
  check((await audio()) === 0, '还没按任何东西就建了 AudioContext');
  await press(page.locator('.card__play').first());
  check((await audio()) === 1, `开着时按下按钮应该响一声：建了 ${await audio()} 个 AudioContext`);
  await toggle.click();
  await toggle.getByText('声音：关').waitFor();
  check((await page.evaluate(() => localStorage.getItem('arcade.sound'))) === 'off', '关掉以后应该记在 arcade.sound');
  await page.reload();
  await toggle.getByText('声音：关').waitFor();
  await press(page.locator('.card__play').first());
  await press(page.getByRole('link', { name: '隐私说明' }));
  check((await audio()) === 0, '关着时按什么都不该建 AudioContext');
  await shot(page, 'lobby-sound-off');
  await toggle.click();
  await toggle.getByText('声音：开').waitFor();
  check((await audio()) === 1, '打开时应该响一声确认');
  check((await page.evaluate(() => localStorage.getItem('arcade.sound'))) === null, '打开以后 arcade.sound 应该删掉');
  await ctx.close();
}
