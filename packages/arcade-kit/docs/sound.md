# 大厅静音带进游戏（`platformSoundOn`，`arcade-kit/client`）

平台大厅页脚有"声音"开关，关掉记在 localStorage 的 `arcade.sound` = `'off'`。这是**平台对游戏公开的唯一一个存储约定**：游戏只读、不写。

```ts
import { platformSoundOn } from 'arcade-kit/client';
const muteThisVisit = !platformSoundOn(); // 启动时读一次
```

- 返回 false（大厅关了声音）：游戏**这一次打开**先静音，自己的声音开关显示"关"。
- 玩家在游戏里打开声音：只管本游戏这一次，不写 `arcade.sound`，也不改游戏自己存的声音偏好（下次从大厅静音进来照样先静音）。
- 没有这个 key、读不了（隐私模式、单独部署没有平台、Node 里）：返回 true，按游戏自己的设置。
- 不用"大厅和游戏都开才响"：那样会出现开关显示开却没声。

其余存储一律按各模块自己的前缀，游戏不读平台的其他 key。
