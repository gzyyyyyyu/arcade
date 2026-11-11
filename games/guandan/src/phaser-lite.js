/**
 * Phaser 的精简入口（vite.config.ts 把 'phaser' 别名到这里，打包和开发服务器都走它；类型仍用 phaser 自带的）。
 * 官方 ESM 发行包是预先打好的整块（Arcade/Matter 物理、Tilemap、Video、Rope、Mesh 等全在内），树摇摇不掉；
 * 这里改从源码按需引入牌馆用到的部分：容器、图形、图片、文字、区域、圆和矩形、粒子，以及补间、计时、输入、缩放。
 * 新增用到别的游戏对象时，要在这里加上它和对应的 Factory、Creator（这两种模块只做注册，用 `import '...'` 引入）（否则 scene.add.xxx 不存在）。
 */
import 'phaser-src/polyfills/requestVideoFrame';
import CONST from 'phaser-src/const';
import Extend from 'phaser-src/utils/object/Extend';
import animations from 'phaser-src/animations';
import BlendModes from 'phaser-src/renderer/BlendModes';
import cache from 'phaser-src/cache';
import cameras2d from 'phaser-src/cameras/2d';
import core from 'phaser-src/core';
import Class from 'phaser-src/utils/Class';
import data from 'phaser-src/data';
import display_mask from 'phaser-src/display/mask';
import dom from 'phaser-src/dom';
import events from 'phaser-src/events';
import filters from 'phaser-src/filters';
import Game from 'phaser-src/core/Game';
import geom from 'phaser-src/geom';
import DisplayList from 'phaser-src/gameobjects/DisplayList';
import GameObjectCreator from 'phaser-src/gameobjects/GameObjectCreator';
import GameObjectFactory from 'phaser-src/gameobjects/GameObjectFactory';
import UpdateList from 'phaser-src/gameobjects/UpdateList';
import gameobjects_components from 'phaser-src/gameobjects/components';
import BuildGameObject from 'phaser-src/gameobjects/BuildGameObject';
import BuildGameObjectAnimation from 'phaser-src/gameobjects/BuildGameObjectAnimation';
import GameObject from 'phaser-src/gameobjects/GameObject';
import gameobjects_events from 'phaser-src/gameobjects/events';
import Container from 'phaser-src/gameobjects/container/Container';
import Graphics from 'phaser-src/gameobjects/graphics/Graphics';
import Image from 'phaser-src/gameobjects/image/Image';
import Layer from 'phaser-src/gameobjects/layer/Layer';
import gameobjects_particles from 'phaser-src/gameobjects/particles';
import Sprite from 'phaser-src/gameobjects/sprite/Sprite';
import Text from 'phaser-src/gameobjects/text/Text';
import Zone from 'phaser-src/gameobjects/zone/Zone';
import Shape from 'phaser-src/gameobjects/shape/Shape';
import Arc from 'phaser-src/gameobjects/shape/arc/Arc';
import Rectangle from 'phaser-src/gameobjects/shape/rectangle/Rectangle';
import 'phaser-src/gameobjects/container/ContainerFactory';
import 'phaser-src/gameobjects/graphics/GraphicsFactory';
import 'phaser-src/gameobjects/image/ImageFactory';
import 'phaser-src/gameobjects/layer/LayerFactory';
import 'phaser-src/gameobjects/particles/ParticleEmitterFactory';
import 'phaser-src/gameobjects/sprite/SpriteFactory';
import 'phaser-src/gameobjects/text/TextFactory';
import 'phaser-src/gameobjects/zone/ZoneFactory';
import 'phaser-src/gameobjects/shape/arc/ArcFactory';
import 'phaser-src/gameobjects/shape/rectangle/RectangleFactory';
import 'phaser-src/gameobjects/container/ContainerCreator';
import 'phaser-src/gameobjects/graphics/GraphicsCreator';
import 'phaser-src/gameobjects/image/ImageCreator';
import 'phaser-src/gameobjects/layer/LayerCreator';
import 'phaser-src/gameobjects/particles/ParticleEmitterCreator';
import 'phaser-src/gameobjects/sprite/SpriteCreator';
import 'phaser-src/gameobjects/text/TextCreator';
import 'phaser-src/gameobjects/zone/ZoneCreator';
import input from 'phaser-src/input';
import ImageFile from 'phaser-src/loader/filetypes/ImageFile';
import JSONFile from 'phaser-src/loader/filetypes/JSONFile';
import File from 'phaser-src/loader/File';
import FileTypesManager from 'phaser-src/loader/FileTypesManager';
import GetURL from 'phaser-src/loader/GetURL';
import LoaderPlugin from 'phaser-src/loader/LoaderPlugin';
import MergeXHRSettings from 'phaser-src/loader/MergeXHRSettings';
import MultiFile from 'phaser-src/loader/MultiFile';
import XHRLoader from 'phaser-src/loader/XHRLoader';
import XHRSettings from 'phaser-src/loader/XHRSettings';
import math from 'phaser-src/math';
import plugins from 'phaser-src/plugins';
import renderer from 'phaser-src/renderer';
import scale from 'phaser-src/scale';
import ScaleModes from 'phaser-src/renderer/ScaleModes';
import Scene from 'phaser-src/scene/Scene';
import scene from 'phaser-src/scene';
import structs from 'phaser-src/structs';
import textures from 'phaser-src/textures';
import time from 'phaser-src/time';
import TintModes from 'phaser-src/renderer/TintModes';
import tweens from 'phaser-src/tweens';


const Phaser = {
  Animations: animations,
  BlendModes: BlendModes,
  Cache: cache,
  Cameras: { Scene2D: cameras2d },
  Core: core,
  Class: Class,
  Data: data,
  Display: { Masks: display_mask },
  DOM: dom,
  Events: events,
  Filters: filters,
  Game: Game,
  Geom: geom,
  GameObjects: {
    DisplayList: DisplayList,
    GameObjectCreator: GameObjectCreator,
    GameObjectFactory: GameObjectFactory,
    UpdateList: UpdateList,
    Components: gameobjects_components,
    BuildGameObject: BuildGameObject,
    BuildGameObjectAnimation: BuildGameObjectAnimation,
    GameObject: GameObject,
    Events: gameobjects_events,
    Container: Container,
    Graphics: Graphics,
    Image: Image,
    Layer: Layer,
    Particles: gameobjects_particles,
    Sprite: Sprite,
    Text: Text,
    Zone: Zone,
    Shape: Shape,
    Arc: Arc,
    Rectangle: Rectangle,
  },
  Input: input,
  // 游戏不加载外部文件（素材都是代码烘焙的），只留加载器本体和图片/JSON 两种
  Loader: {
    FileTypes: {
      ImageFile: ImageFile,
      JSONFile: JSONFile,
    },
    File: File,
    FileTypesManager: FileTypesManager,
    GetURL: GetURL,
    LoaderPlugin: LoaderPlugin,
    MergeXHRSettings: MergeXHRSettings,
    MultiFile: MultiFile,
    XHRLoader: XHRLoader,
    XHRSettings: XHRSettings,
  },
  Math: math,
  Plugins: plugins,
  Renderer: renderer,
  Scale: scale,
  ScaleModes: ScaleModes,
  Scene: Scene,
  Scenes: scene,
  Structs: structs,
  Textures: textures,
  Time: time,
  TintModes: TintModes,
  Tweens: tweens,
};

export default Extend(false, Phaser, CONST);
