/** wrangler.jsonc 的几处约定：巡检和 /api/me 要先过 Worker（不然被静态资源接走），线上日志开着（仓库根 docs/monitoring.md） */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

interface Cfg {
  observability?: { enabled: boolean };
  assets: { run_worker_first: string[] };
}

/** 只去掉整行注释：这份配置的注释都单独占一行 */
const cfg = JSON.parse(
  readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n'),
) as Cfg;

describe('wrangler.jsonc', () => {
  it('health、/api/me、首页、开房进房先过 Worker', () => {
    expect(cfg.assets.run_worker_first).toEqual(
      expect.arrayContaining(['/', '/api/me', '/games/racing/', '/games/racing/health', '/games/racing/rooms', '/games/racing/rooms/*']),
    );
  });

  it('observability 开着', () => {
    expect(cfg.observability?.enabled).toBe(true);
  });
});
