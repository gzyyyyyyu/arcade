import type Phaser from 'phaser';

/**
 * Phaser 的 GameObject 基类类型不带位置、深度这些字段（它们来自各个组件），而容器的 list 和场景的 children.list
 * 给出来的都是基类。这里用运行时检查把它们收窄，不用强转：真有这个字段才算，没有就跳过。
 */
type GameObject = Phaser.GameObjects.GameObject;

/** 有数值的 y（Text、Graphics、Container、Image 等都有） */
export function hasY(o: GameObject): o is GameObject & { y: number } {
  return 'y' in o && typeof o.y === 'number';
}

/** 有数值的 depth */
export function hasDepth(o: GameObject): o is GameObject & { depth: number } {
  return 'depth' in o && typeof o.depth === 'number';
}

/** 文字对象：Phaser 给每种对象一个固定的 type 字符串，Text 就是 'Text' */
export function isText(o: GameObject): o is Phaser.GameObjects.Text {
  return o.type === 'Text';
}
