/**
 * /privacy：存了什么、存多久、怎么删（docs/platform-backend.md 5.7）。
 * 只写代码里确实这样做的事：天数和 worker/api/lib/config.ts（会话、一年清理、每日榜留几天）、worker/api/ops/cron.ts（每天清理）对得上，改了那边要同步改这里。
 * "不放广告、不卖数据"是维护者 2026-10-14 定的。"积分和筹码"那段也是维护者 2026-10-14 定的（当时为德州扑克的筹码跨场保留，
 * 先把"只是朋友娱乐、不涉及任何线下资产"说清楚），适用于所有游戏；和仓库根 AGENTS.md"不碰真钱"那条一致，那边改了这里跟着改。
 * 访问统计那段只写 Cloudflare 官方说过的（2026-10-14 查 cloudflare.com/web-analytics 和 developers.cloudflare.com/web-analytics 的
 * about、faq、data-metrics）：beacon 每次打开页面用 Performance API 上报；统计的是访问次数（visits）和页面浏览数，按 Path、Country、
 * Browser 等维度分；不用 cookie、localStorage 等客户端状态，不靠 IP、User Agent 识别个人。"Cloudflare 收得到 IP"和"不拿来认人"是两回事，分开写。
 * "不存 IP、不留访问日志"说的是本站自己，Cloudflare 那边按上面写。
 * 对局汇总：180 天和 config.ts 的 tallyKeepDays 对得上。
 * 邀请码：30 天和 invite-codes.ts 的 INVITE_KEEP_MS 对得上。
 * 社交几项：动态留几天、挑战几天过期和 config.ts 的 feedKeepMs、challengeTtlMs 对得上；邀请 Cron 留 2 天（cron.ts）。
 */
import { useState } from 'react';
import { Paged } from '../../features/fit/Fit.tsx';
import { Panel } from '../../ui.tsx';
import { Link } from '../../router.tsx';
import { PRIVACY_SECTIONS, type PrivacyBlock } from './privacy-sections.ts';
import './privacy.css';

/**
 * 一屏放下（docs/ui.md 第 11 节）：顶上一排小节页签，每节的条目按屏幕高度一页放几条，翻页看；字号不缩。
 * 正文拆成一条一条放在 privacy-sections.ts。
 */
export function PrivacyPage() {
  const [id, setId] = useState(PRIVACY_SECTIONS[0]!.id);
  const sec = PRIVACY_SECTIONS.find((s) => s.id === id) ?? PRIVACY_SECTIONS[0]!;
  return (
    <Panel icon="lock" title="我们存了你什么" className="privacy-page">
      <div className="privacy-tabs" role="tablist" aria-label="哪一节">
        {PRIVACY_SECTIONS.map((s) => (
          <button key={s.id} type="button" role="tab" aria-selected={s.id === sec.id} className={s.id === sec.id ? 'tabs__on' : ''} onClick={() => setId(s.id)} data-testid={`ptab-${s.id}`}>
            {s.name}
          </button>
        ))}
      </div>
      <Paged
        key={sec.id}
        className="privacy-list"
        grid
        items={sec.blocks}
        keyOf={(blk) => blk.id}
        label="隐私说明翻页"
        testId="privacy-pages"
        render={(blk) => (
          <div className={`privacy-block${blk.promise ? ' privacy-block--promise' : ''}`}>
            <BlockText blk={blk} />
          </div>
        )}
      />
    </Panel>
  );
}

function BlockText({ blk }: { blk: PrivacyBlock }) {
  if (!blk.link) return <>{blk.body}</>;
  const [before, after] = blk.body.split(blk.link.text);
  return (
    <>
      {before}
      <Link href={blk.link.href}>{blk.link.text}</Link>
      {after}
    </>
  );
}
