/**
 * 新号前几局（BALANCE.novice）抽的行情段：段库里去掉崩盘、熊市两种市况，剩下牛市、泡沫、横盘（tools/data 生成段库后按市况筛的，顺序同 index.json）。
 * 段库加段不用跟着改；加了想让新号也抽到，按同样的筛法重排这张表。
 */
export const NOVICE_SEGMENTS: readonly string[] = [
  'seg_118683445d', 'seg_bea9d7405c', 'seg_a2b822e5af', 'seg_3406225ac6', 'seg_503ea2c0d0', 'seg_1f3c87568b', 'seg_426e8efecc', 'seg_2fd2afad3f',
  'seg_62e2bca898', 'seg_435be7140d', 'seg_188db92273', 'seg_db858da5df', 'seg_dcd5b6fac7', 'seg_6dbd01d1ce', 'seg_923a3f89bd', 'seg_e34a8b4435',
  'seg_2b876ce185', 'seg_3fdb054fe1', 'seg_655883e4d0', 'seg_04025d30f3', 'seg_2dd72eb974', 'seg_758d4d2cf7', 'seg_1cb0f5baaf', 'seg_943fcafbba',
  'seg_dd0dee071c', 'seg_babddf96a2', 'seg_634d0c2877', 'seg_3c14ae5087', 'seg_65c0bdebf8', 'seg_da57885794', 'seg_aceb555daf', 'seg_440855e0fd',
  'seg_3a6c9194fc', 'seg_31508e7e93', 'seg_efbf89dcec', 'seg_3307a68e6d', 'seg_1fc332bcd7', 'seg_e21e73727a', 'seg_5a19480cb6', 'seg_0bc43a9ab6',
  'seg_da902cd185', 'seg_d6f48b3056', 'seg_ff5d97b294', 'seg_0204fc7298', 'seg_a0b8ee7f27', 'seg_6a25320dc7', 'seg_e44db292e4', 'seg_e9258f8930',
  'seg_f082ee99f3', 'seg_9816bf0c92', 'seg_def0f596da', 'seg_99f42d8816', 'seg_2cb161b2a6', 'seg_88275e65cc', 'seg_9a9ac9b8fd', 'seg_1f4bcac893',
  'seg_4dfb09075b', 'seg_db8500881c', 'seg_16bfe54492', 'seg_f8dc5bb25a', 'seg_b4cb115eb7', 'seg_734bdae7f9', 'seg_2b0f716902', 'seg_70350a0c32',
  'seg_f0561c354b', 'seg_81030f19e7', 'seg_80e2463761', 'seg_23fe0a85a9', 'seg_9ed5130e70', 'seg_125fe8910e', 'seg_e4ebe7cec5', 'seg_e2fb4b5bf8',
  'seg_b30d588bbe', 'seg_c5e74c681b', 'seg_8e92dc8a3d', 'seg_cce998284d', 'seg_27b25e5358', 'seg_1210f89a3b', 'seg_97df6f0194', 'seg_d3c4ca1e0f',
  'seg_f4a717fc59', 'seg_f7a18867cf', 'seg_73bc184761', 'seg_8d5a59581b', 'seg_7a8c3acabd', 'seg_046422299d', 'seg_f277f1ff5e', 'seg_9ca2f98ffd',
  'seg_1ba8683384', 'seg_943cfb5208', 'seg_4cc74f2b7d', 'seg_e6a3bc5e35', 'seg_38a08baeb0', 'seg_19961418f4', 'seg_6e83483077',
];
