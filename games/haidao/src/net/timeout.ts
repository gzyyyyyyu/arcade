/** 前端请求等多久算网断了：超时按「离线」处理（按钮不一直转），实盘结回会照旧重发、钱包按 op 去重 */
export const NET_TIMEOUT_MS = 10_000;
export const netTimeout = (): AbortSignal => AbortSignal.timeout(NET_TIMEOUT_MS);
