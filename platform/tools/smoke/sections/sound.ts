/** 冒烟分段：lobbySound（npm run smoke -- --only=<段名>，段名表在 tools/smoke.ts） */
import type { Browser, Page } from 'playwright-core';
import { BASE, check, shot, newPage } from '../lib/core.ts';

/** 大厅的点按声。开着时按下能点的东西才建 AudioContext；页脚关掉以后记住，再按什么都不建（一点声音都不出），刷新后照样关着 */
export async function lobbySound(browser: Browser): Promise<void> {
  console.log('大厅点按声：开着响、关了记住且一点不响');
  const { ctx, page } = await newPage(browser, '点按声', 'portrait');
  await page.addInitScript(() => {
    const w = window as unknown as { AudioContext: typeof AudioContext; __audio: number; __notes: number };
    w.__audio = 0;
    w.__notes = 0;
    const Real = w.AudioContext;
    w.AudioContext = class extends Real {
      constructor() {
        super();
        w.__audio++;
      }
      override createOscillator() {
        w.__notes++;
        return super.createOscillator();
      }
    };
    // 装成不认 :has 的老浏览器（Chrome <105、Safari <15.4）：选择器里有 :has 就抛错，点按声不能用它
    const closest = Element.prototype.closest;
    Element.prototype.closest = function (this: Element, sel: string) {
      if (sel.includes(':has(')) throw new SyntaxError(`老浏览器不认 ${sel}`);
      return closest.call(this, sel);
    };
  });
  const audio = () => page.evaluate(() => (window as unknown as { __audio: number }).__audio);
  const notes = () => page.evaluate(() => (window as unknown as { __notes: number }).__notes);
  const press = (loc: ReturnType<Page['locator']>) => loc.dispatchEvent('pointerdown', { button: 0, pointerType: 'touch' });
  await page.goto(`${BASE}/`);
  const toggle = page.getByTestId('sound-toggle');
  await toggle.getByText('声音：开').waitFor();
  check((await audio()) === 0, '还没按任何东西就建了 AudioContext');
  await press(page.locator('.card__play').first());
  check((await audio()) === 1, `开着时按下按钮应该响一声：建了 ${await audio()} 个 AudioContext`);
  await page.evaluate(() => {
    for (const [id, off] of [['tap-on', false], ['tap-off', true]] as const) {
      const label = document.createElement('label');
      label.id = id;
      label.innerHTML = `<input type="checkbox"${off ? ' disabled' : ''}> 勾选`;
      document.body.append(label);
    }
  });
  const before = await notes();
  await press(page.locator('#tap-off'));
  check((await notes()) === before, '按下禁用勾选框的字不该响');
  await press(page.locator('#tap-on'));
  check((await notes()) > before, '按下勾选框的字应该响');
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
