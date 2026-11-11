/** 起停本地接口服务（临时目录里的本地 D1 + wrangler dev，端口 5181） */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { PORT, BASE, fail } from './core.ts';
import { ADMIN_TOKEN } from './fakes.ts';

export function startServer(state: string): ChildProcess {
  const migrate = spawnSync('npx', ['wrangler', 'd1', 'migrations', 'apply', 'arcade', '--local', '--persist-to', state], {
    encoding: 'utf8',
    env: { ...process.env, CI: '1' },
  });
  if (migrate.status !== 0) fail(`迁移失败：\n${migrate.stdout}\n${migrate.stderr}`);
  // 管理页的筹码统计表要有一行才画得出来：本地库里先放一天的（冒烟里不跑 Cron）
  const day = { day: '2026-10-14', total: 1_234_567, wallets: 3, grant: 30_000, relief: 2_000, games: { kaipan: { in: 4_000, out: 6_000, back: 0, capped: 500 } } };
  const seed = spawnSync('npx', ['wrangler', 'd1', 'execute', 'arcade', '--local', '--persist-to', state, '--command',
    `INSERT INTO wallet_stats (day, data, created_at) VALUES ('${day.day}', '${JSON.stringify(day)}', 0)`], {
    encoding: 'utf8',
    env: { ...process.env, CI: '1' },
  });
  if (seed.status !== 0) fail(`放统计行失败：\n${seed.stdout}\n${seed.stderr}`);
  const fake = (k: string) => ['--var', `${k}:smoke:smoke-only-pepper-${k.toLowerCase()}-0000`];
  const args = [
    'wrangler', 'dev', '--ip', '127.0.0.1', '--port', String(PORT), '--local-upstream', `localhost:${PORT}`,
    '--persist-to', state, '--show-interactive-dev-session=false',
    '--var', `SITE_ORIGIN:${BASE}`,
    ...fake('PEPPER_PW'), ...fake('PEPPER_RC'), ...fake('PEPPER_SID'), ...fake('PEPPER_IP'),
    '--var', `ADMIN_TOKEN:${ADMIN_TOKEN}`,
  ];
  // 单独一个进程组，结束时整组杀掉（npx 下面还有 wrangler 和 workerd）
  return spawn('npx', args, { detached: true, stdio: ['ignore', 'ignore', 'inherit'], env: { ...process.env, CI: '1' } });
}

/** 5181 已经有人在用（比如开着 npm run dev:api，或者上次没收干净）：直接失败，免得连到别的服务上测了个寂寞。 */
export async function ensurePortFree(): Promise<void> {
  try {
    await fetch(`${BASE}/`);
  } catch {
    return;
  }
  fail(`${PORT} 端口已经有服务在跑，先停掉它（npm run dev:api 或上次残留的 wrangler dev）`);
}

export async function waitForServer(): Promise<void> {
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(`${BASE}/api/me`);
      if (r.status === 200) return;
    } catch {
      // 还没起来
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  fail('wrangler dev 60 秒内没起来');
}

// ---------- 场景 ----------
