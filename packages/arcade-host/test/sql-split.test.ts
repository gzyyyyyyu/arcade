import { describe, expect, it } from 'vitest';
import { splitStatements } from '../src/runtime/sql-split.ts';

describe('splitStatements', () => {
  it('普通多条：去分号、去首尾空白', () => {
    expect(splitStatements('SELECT 1;\n  SELECT 2 ;  \n')).toEqual(['SELECT 1', 'SELECT 2']);
  });
  it('单引号里的分号和 \'\' 转义', () => {
    expect(splitStatements("INSERT INTO t VALUES('a;b''c;');SELECT 1;")).toEqual(["INSERT INTO t VALUES('a;b''c;')", 'SELECT 1']);
  });
  it('双引号、反引号、方括号里的分号', () => {
    expect(splitStatements('CREATE TABLE "a;b"(x);CREATE TABLE `c;d`(y);CREATE TABLE [e;f](z);')).toEqual(['CREATE TABLE "a;b"(x)', 'CREATE TABLE `c;d`(y)', 'CREATE TABLE [e;f](z)']);
  });
  it('-- 行注释里的分号', () => {
    expect(splitStatements('SELECT 1 -- a; b\n, 2;SELECT 3;')).toEqual(['SELECT 1 -- a; b\n, 2', 'SELECT 3']);
  });
  it('/* */ 块注释里的分号', () => {
    expect(splitStatements('SELECT /* a; b */ 1;SELECT 2;')).toEqual(['SELECT /* a; b */ 1', 'SELECT 2']);
  });
  it('只有注释或空白的片段丢掉', () => {
    expect(splitStatements('-- hi\n;  ;/* x */;SELECT 1;\n-- tail')).toEqual(['SELECT 1']);
  });
  it('CREATE TRIGGER … BEGIN …; …; END; 算一条', () => {
    const trg = 'CREATE TRIGGER tr AFTER INSERT ON t BEGIN\n  UPDATE a SET n = n + 1;\n  INSERT INTO log VALUES (new.id);\nEND';
    expect(splitStatements(`CREATE TABLE t(id);${trg};SELECT 1;`)).toEqual(['CREATE TABLE t(id)', trg, 'SELECT 1']);
  });
  it('X\'00ff\' 字面量', () => {
    expect(splitStatements("INSERT INTO b VALUES(X'00ff');INSERT INTO b VALUES(x'AB;');")).toEqual(["INSERT INTO b VALUES(X'00ff')", "INSERT INTO b VALUES(x'AB;')"]);
  });
  it("字符串里有 '--'、'/*'、';'、换行", () => {
    const a = "INSERT INTO t VALUES('x -- y /* z ; \nw')";
    expect(splitStatements(`${a};SELECT 1;`)).toEqual([a, 'SELECT 1']);
  });
  it('wrangler 的 replace(…, char(10)) 写法', () => {
    const a = "INSERT INTO \"t\" (\"id\",\"v\") VALUES(1,replace('a;b\\nc -- d','\\n',char(10)))";
    expect(splitStatements(`${a};\n${a};`)).toEqual([a, a]);
  });
  it('结尾没分号的最后一条', () => {
    expect(splitStatements('SELECT 1; SELECT 2')).toEqual(['SELECT 1', 'SELECT 2']);
  });
  it('空输入', () => {
    expect(splitStatements('')).toEqual([]);
    expect(splitStatements('  \n ')).toEqual([]);
  });
});
