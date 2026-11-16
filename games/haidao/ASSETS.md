# 素材说明

| 素材 | 来源 | 许可 |
|---|---|---|
| 建筑、兵、地面、特效、图标、船（`src/view/art/`；兵、英雄、守岛敌人的分件骨架部件在 `art/rigparts.ts`，动作关键帧在 `src/view/rig.ts`） | 本项目用 TypeScript 拼 SVG 程序画，开局时按渲染倍数烘焙成纹理（骨架部件烘进一张图集；炮台的底座和 16 个方向的炮管在 `art/turrets.ts`、`buildings.ts` 的 `turretBaseArt`，烘进 `tur.<种类>.<档>` 图集；喷火塔火舌 `fx.flamejet`）；挥砍的弧形残影和遮挡剪影用 Phaser 绘图接口开局画一次或直接复用兵的整帧；动作是程序里的关键帧数据，没有外部动画素材 | 同本仓库，MIT |
| 材质和质感（拼板缝和木纹、错缝砌石和青苔、金属色带和锤纹、颗粒、冷暖三面光照、地面的草丛 / 湿沙 / 海面渐变 / 浪花 / 贝壳 / 脚印、浪舌、波光、鱼群、云影（`art/coast.ts` 的 `cloud`）、远船和海鸟，`src/view/art/wear.ts`、`grade.ts`、`src/view/terrain.ts`、`src/view/ambient.ts`、`textures.ts` 的 `finish`） | 全部程序生成：SVG 小图元和 canvas 2D 绘制，用确定性散列定纹路（同样的输入永远同样的图），开局烘焙进静态纹理，没有任何图片、噪声贴图或第三方素材 | MIT |
| 粒子贴图（水珠、木屑、石屑、烟团、火星、水纹、光点、彩带纸片、金币，`src/view/fx.ts`） | 本项目用 Phaser 绘图接口开局时画一次（深褐描边，同调色板），对象池复用，不用图片 | MIT |
| 升级施工的脚手架（木杆、走道板、斜撑、绳结、梯子、小三角旗；占地 1–4 格各一套，分前半 / 后半两张，`src/view/art/scaffold.ts`，`npm run art` 的 `scaffold.png` 可看） | 本项目用 SVG 字符串程序画（同调色板、过配色分级），进基地时按需烘焙成纹理，不进开局的 allArt，不用图片 | MIT |
| 守岛素材（宝藏箱、七种敌人加分裂小艇的走和攻击帧、临时塔木台、火药桶、沉船、木桶、落潮湿沙、雾区的雾团、被炸哑的塔头上的烟、涨潮时落潮路口的浪花，`src/view/art/tdart.ts`、`buildings.ts` 的 `treasure`） | 本项目用 SVG 字符串程序画（同调色板、深褐描边），进守岛前按需烘焙，不用图片 | MIT |
| 界面皮肤（胡桃木板、羊皮纸、麻绳、主按钮的暗铜钉，`src/view/skin.ts`） | 木纹 / 羊皮纸斑 / 麻绳三张小纹理由 canvas 按固定散列在第一次开界面时画一次，转成 data URL 放进 CSS 变量；铜钉、阴影、按下弹起是 CSS 渐变和过渡，不放图片文件 | MIT |
| 整屏后期和环境动画（暗角 / 暖色 / 关卡天气的 CSS 渐变层、泛光的柔光圆盘，`src/view/post.ts`；棕榈 5 帧错切、主寨旗布 3 帧、烟囱烟，`src/view/envfx.ts` 和 `art/buildings.ts`） | 本项目程序生成：渐变层是 CSS，柔光圆盘开局用 canvas 画一次，棕榈 / 旗布帧是 SVG 烘焙成纹理 | MIT |
| 音效与环境声（`src/view/audio/`：界面、建筑分档、各塔开火、命中材质、兵的语气声、技能、结算短句、海浪风海鸟环境循环） | 全部程序合成：WebAudio 振荡器、噪声、滤波器现场算出，兵的语气声是锯齿波过共振峰的合成元音；没有任何音频文件或外部素材。`tools/sfx-render.ts` 可离线渲染成 WAV 检查，`tools/sfx-result-wav.ts` 把结算序列（三星、一星、失败）按时间轴混成 WAV | MIT |
| 寻宝航线的海图、补给礁、港口、罗盘、宝箱、分享卡上的航线小图（`src/view/maproute.ts`、`mapend.ts`） | 本项目手写的 SVG 和 canvas 绘图，小岛借用海图的 `mapIslandArt`，船借用 `shipArt` | MIT |
| 大厅封面 `public/cover.webp` | `tools/cover.ts` 用上面的程序画 SVG 拼出海岛场景，叠 CSS 标题，无头浏览器截图后转 WebP | MIT |
| 页面图标 `public/favicon.svg` | 本项目手写 SVG | MIT |

不使用任何别人的图片、音频、字体。玩法和画风参考过《海岛奇兵》《部落冲突》（只看风格和玩法骨架），没有拿它们的任何图、角色、数值或界面布局。
