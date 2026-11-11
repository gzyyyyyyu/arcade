const TRIGGER = /^CREATE\s+(TEMP\s+|TEMPORARY\s+)?TRIGGER\b/;

/**
 * 把一份 SQL 文本（wrangler d1 export 或本包 export 的整库导出）切成单条语句。
 * 为什么要切：DO 的 SQLite 一次 exec 的 SQL 文本有长度上限（约 100KB，超了 SQLITE_TOOBIG），只有注释或空白的片段还会报
 * "SQL code did not contain a statement."；整份 dump 一次 exec 只能恢复很小的库。
 *
 * 只认分号做分隔，分号在这些地方不算：'…'（'' 转义）、"…"、`…`、[…]、-- 行注释、/* *\/ 块注释，
 * 以及 CREATE TRIGGER 的 BEGIN … END 之间（触发器体里每条语句都带分号；BEGIN、CASE 加一层，END 减一层，回到 0 层的分号才结束整条）。
 * 返回的语句去掉结尾分号和首尾空白；只有注释、空白的片段丢掉。
 */
export function splitStatements(sql: string): string[] {
  const out: string[] = [];
  let start = 0;
  // 当前语句里有没有注释以外的内容、开头几个词（判断是不是 CREATE TRIGGER）、触发器里 BEGIN/CASE … END 的层数
  let hasCode = false;
  let head = '';
  let depth = 0;
  const n = sql.length;
  let i = 0;
  const push = (end: number) => {
    if (hasCode) out.push(sql.slice(start, end).trim());
    start = end + 1;
    hasCode = false;
    head = '';
    depth = 0;
  };
  while (i < n) {
    const c = sql[i]!;
    if (c === '-' && sql[i + 1] === '-') {
      const nl = sql.indexOf('\n', i);
      i = nl < 0 ? n : nl + 1;
      continue;
    }
    if (c === '/' && sql[i + 1] === '*') {
      const e = sql.indexOf('*/', i + 2);
      i = e < 0 ? n : e + 2;
      continue;
    }
    if (c === "'" || c === '"' || c === '`' || c === '[') {
      const close = c === '[' ? ']' : c;
      let j = i + 1;
      for (;;) {
        const k = sql.indexOf(close, j);
        if (k < 0) {
          j = n;
          break;
        }
        // 引号里两个连写是转义（[…] 没有转义）
        if (close !== ']' && sql[k + 1] === close) {
          j = k + 2;
          continue;
        }
        j = k + 1;
        break;
      }
      hasCode = true;
      i = j;
      continue;
    }
    if (c === ';') {
      if (depth <= 0 || !TRIGGER.test(head)) push(i);
      i++;
      continue;
    }
    if (/[A-Za-z0-9_]/.test(c)) {
      let j = i + 1;
      while (j < n && /[A-Za-z0-9_]/.test(sql[j]!)) j++;
      const word = sql.slice(i, j).toUpperCase();
      // 语句开头的几个词够判断是不是 CREATE TRIGGER
      if (head.length < 40) head += `${word} `;
      if (word === 'BEGIN' || word === 'CASE') depth++;
      else if (word === 'END') depth--;
      hasCode = true;
      i = j;
      continue;
    }
    if (!/\s/.test(c)) hasCode = true;
    i++;
  }
  push(n);
  return out;
}
