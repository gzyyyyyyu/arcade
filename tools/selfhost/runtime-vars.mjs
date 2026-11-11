/**
 * 哪些 vars 允许运行时覆盖（ARCADE_VARS_<Worker>_<名>，见 arcade.sh）。
 * 单独一个文件是为了能不带 build.mjs 的副作用直接单测（test/runtime-vars.test.mjs）。
 */

/**
 * 该 Worker 的 runtime_vars = 最终 vars 的键 ∩ 部署白名单里它的 vars − {GATE} − forbiddenVars。
 * - GATE 不开放：它是部署工具按平台关系盖上的（login），关掉等于让游戏不认人，属于安全相关，不给运行时改；
 * - forbiddenVars（Secret 和 SITE_ORIGIN）本来就走环境变量，不重复开；
 * - 白名单里有、模块 vars 里没有的名字不开放：没有默认值，也就不知道该写成 text 还是 json。
 * @param {string} name Worker 名
 * @param {Record<string, unknown>} vars 叠加平台绑定之后、该 Worker 最终的 vars
 * @param {{ vars?: Record<string, string[]>, forbiddenVars?: string[] }} allow tools/deploy-allowlist.json
 * @returns {string[]}
 */
export function runtimeVarsOf(name, vars, allow) {
  const skip = new Set(['GATE', ...(allow.forbiddenVars ?? [])]);
  return (allow.vars?.[name] ?? []).filter((k) => Object.hasOwn(vars, k) && !skip.has(k));
}
