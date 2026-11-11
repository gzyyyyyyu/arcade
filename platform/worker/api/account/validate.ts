/**
 * 用户名、密码、昵称的规则（docs/platform-backend.md 5.1）。名单都放在平台里，不引用游戏代码。
 */
import { GAME_IDS } from '../../../shared/games';
import { RESERVED_PERSONAS, TRAD_TO_SIMP } from './reserved-names';
import { WEAK_PASSWORDS } from './weak-passwords';

/** 用户名只用来登录；这些保留给平台和游戏自己，免得被人注册来冒充。游戏 id 从 games.ts 派生，登记了就保留。 */
const RESERVED_USERNAMES = new Set([
  'admin', 'administrator', 'root', 'system', 'sys', 'arcade', 'official', 'support', 'service', 'staff',
  'kefu', 'guanfang', 'guanliyuan', 'xitong', 'api', 'www', 'null', 'undefined', 'lab',
  ...GAME_IDS,
]);

// biome-ignore lint/suspicious/noControlCharactersInRegex: [^\x00-\x7f] 是“非 ASCII”的范围写法，不是在找控制字符
const foldTrad = (s: string): string => s.replace(/[^\x00-\x7f]/gu, (ch) => TRAD_TO_SIMP[ch] ?? ch);
const PERSONA_NAMES = new Set(Object.values(RESERVED_PERSONAS).flat());
/** 昵称里出现就拒绝的词：冒充电脑、官方。 */
const RESERVED_WORDS = ['电脑', '官方', '管理员', '系统', '客服'];
/**
 * 敏感词起步名单：只放最常见的骂人话。维护者可以随时补充；命中按"包含"算（去掉空白和符号、转小写后比）。
 */
const SENSITIVE_WORDS = [
  '傻逼', '傻b', '煞笔', '沙比', '操你', '草你', '草泥马', '你妈', '他妈', '妈的', '狗日', '日你',
  '婊子', '贱人', '杂种', '去死', '滚蛋', '屌', '鸡巴', '肏',
  'fuck', 'shit', 'bitch', 'cunt', 'nigger',
];

/**
 * 这几条规则返回 'ok' 或错误码、不直接抛：注册、改资料、管理员建号各自决定什么时候查（管理员生成密码时还要拿它挑一个够强的）。
 * 接口里一律交给 body.ts 的 check() 变成 422，错误码和 http.ts 的 MESSAGES 对应。
 */
export type RuleResult = 'ok' | 'invalid_username' | 'weak_password' | 'invalid_display_name' | 'reserved_display_name';

export function normalizeUsername(input: string): string {
  return input.normalize('NFKC').toLowerCase();
}

/** 只看格式。登录、找回用它：保留名只在注册时查，以后加了保留名，已经注册的老用户照样能登录。 */
export function isUsernameFormat(username: string): boolean {
  return /^[a-z0-9_]{3,20}$/.test(username);
}

/** 注册用：格式 + 保留名。 */
export function checkUsername(username: string): Extract<RuleResult, 'ok' | 'invalid_username'> {
  if (!isUsernameFormat(username) || RESERVED_USERNAMES.has(username)) return 'invalid_username';
  return 'ok';
}

/** 密码做 NFKC（同一个密码从不同输入法打出来哈希一致），不去空格、不改大小写。 */
export function normalizePassword(input: string): string {
  return input.normalize('NFKC');
}

/** password 须已归一化；长度按码点数。 */
export function checkPassword(password: string, username: string): Extract<RuleResult, 'ok' | 'weak_password'> {
  const n = [...password].length;
  if (n < 8 || n > 128) return 'weak_password';
  const lower = password.toLowerCase();
  if (WEAK_PASSWORDS.has(lower) || lower === username) return 'weak_password';
  return 'ok';
}

/** 昵称：NFKC、去首尾空白、连续空白合成一个。 */
export function normalizeDisplayName(input: string): string {
  return input.normalize('NFKC').trim().replace(/\s+/gu, ' ');
}

export function checkDisplayName(name: string): Extract<RuleResult, 'ok' | 'invalid_display_name' | 'reserved_display_name'> {
  const n = [...name].length;
  // 控制字符、零宽等格式字符、私用区和未分配码点、行/段分隔符
  if (n < 2 || n > 12 || /[\p{Cc}\p{Cf}\p{Co}\p{Cn}\p{Zl}\p{Zp}]/u.test(name)) return 'invalid_display_name';
  const bare = foldTrad(name.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, ''));
  if (SENSITIVE_WORDS.some((w) => bare.includes(w))) return 'invalid_display_name';
  if (RESERVED_WORDS.some((w) => bare.includes(w))) return 'reserved_display_name';
  // 电脑人物名：去掉数字和拉丁字母后和电脑名整名相等才拦。'老张a'、'老張1' 摆在牌桌上就是那个电脑；
  // 按"包含"查太宽，'小美丽'、'小白兔'、'慢慢来' 这类正常名字也被拦了
  if (PERSONA_NAMES.has(bare.replace(/[\p{N}\p{Script=Latin}]/gu, ''))) return 'reserved_display_name';
  return 'ok';
}
