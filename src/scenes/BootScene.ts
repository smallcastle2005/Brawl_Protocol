import Phaser from 'phaser';
import { genCharacterTextures, genEnvTextures } from '../assets/charTex';
import { CHIBI_CHARS, CHIBI_DIRS, genChibiTextures } from '../assets/chibiTex';
import { genMonsterTextures } from '../assets/monsterTex';
import { genWolfTextures, WOLF_DIRS } from '../assets/wolfTex';
import { genWestBossTextures, WEST_BOSS_DIRS } from '../assets/westBossTex';
import { initSfx } from '../audio/sfx';
// 装备图：打包为单文件时通过 ?inline 内联成 data URI（pack.mjs 不会内联外部图片）
import westernIcon from '../assets/western-memory-icon.jpg?inline';
import windStaffIcon from '../assets/wind-staff-icon.jpg?inline';
import bomberMissileIcon from '../assets/bomber-missile-icon.jpg?inline';
import arcaneCodexIcon from '../assets/arcane-codex-icon-2.jpg?inline';
import warOverloadIcon from '../assets/war-overload-icon.jpg?inline';
// PVE 关卡大地图
import pveWorldMap from '../assets/pve-world-map.jpg?inline';

/** 训练木偶贴图（v0.20）：16×18 像素，与角色贴图同尺寸，复用同一套缩放/碰撞参数 */
function genDummyTexture(scene: Phaser.Scene) {
  if (scene.textures.exists('tex-dummy')) return;
  const tex = scene.textures.createCanvas('tex-dummy', 16, 18);
  if (!tex) return;
  const ctx = tex.getContext();
  const px = (x: number, y: number, w: number, h: number, color: number) => {
    ctx.fillStyle = '#' + color.toString(16).padStart(6, '0');
    ctx.fillRect(x, y, w, h);
  };
  // 靶心（圆盘的像素近似）：木框 → 米色盘面 → 红环 → 白色靶心
  px(4, 1, 8, 8, 0x7a4f2a);
  px(5, 2, 6, 6, 0xd9c7a6);
  px(6, 3, 4, 4, 0xd64545);
  px(7, 4, 2, 2, 0xf4efe2);
  // 横臂
  px(1, 10, 14, 2, 0x9c663a);
  px(1, 10, 14, 1, 0xc08a55);
  // 立柱
  px(7, 8, 2, 8, 0x9c663a);
  px(6, 8, 1, 8, 0x7a4f2a);
  // 底座
  px(4, 16, 8, 2, 0x2a1d12);
  tex.refresh();
}

/** 死神之眼狙击弹（v0.41）：16×10 水滴形子弹，尖端朝右 */
function genLockDropTexture(scene: Phaser.Scene) {
  if (scene.textures.exists('tex-lockdrop')) return;
  const tex = scene.textures.createCanvas('tex-lockdrop', 16, 10);
  if (!tex) return;
  const ctx = tex.getContext();
  const px = (x: number, y: number, w: number, h: number, color: number) => {
    ctx.fillStyle = '#' + color.toString(16).padStart(6, '0');
    ctx.fillRect(x, y, w, h);
  };
  // 尾部尖端 → 圆钝弹体
  px(0, 4, 2, 2, 0x2f6f9e);
  px(1, 3, 2, 4, 0x3f8fc4);
  px(2, 2, 6, 6, 0x2f6f9e);
  px(3, 3, 6, 4, 0x6fc8ff);
  px(4, 4, 5, 2, 0xd8f6ff);
  // 尖端
  px(8, 4, 4, 2, 0x9fe4ff);
  px(11, 4, 2, 2, 0xe8fbff);
  px(13, 4, 1, 2, 0xffffff);
  tex.refresh();
}

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    this.load.image('equip-western-icon', westernIcon);
    this.load.image('equip-wind-icon', windStaffIcon);
    this.load.image('equip-bomber-icon', bomberMissileIcon);
    this.load.image('equip-codex-icon', arcaneCodexIcon);
    this.load.image('equip-war-icon', warOverloadIcon);
    this.load.image('pve-world-map', pveWorldMap);
  }

  create() {
    genEnvTextures(this);
    genCharacterTextures(this);
    genChibiTextures(this);
    genMonsterTextures(this);
    genWolfTextures(this);
    genWestBossTextures(this);
    genDummyTexture(this);
    genLockDropTexture(this);
    // 程序化合成全部音效并解码注册（异步，不阻塞启动）
    void initSfx(this.game);

    // 角色行走动画（分朝向，2 帧循环）
    for (const prefix of CHIBI_CHARS) {
      for (const dir of CHIBI_DIRS) {
        const key = `walk-${prefix}-${dir}`;
        if (!this.anims.exists(key)) {
          this.anims.create({
            key,
            frames: [{ key: `${prefix}-${dir}-w1` }, { key: `${prefix}-${dir}-w2` }],
            frameRate: 8,
            repeat: -1,
          });
        }
        // 敌对红色轮廓的行走动画：与本体严格同帧
        const oKey = `walk-o-${prefix}-${dir}`;
        if (!this.anims.exists(oKey)) {
          this.anims.create({
            key: oKey,
            frames: [{ key: `${prefix}-${dir}-w1-o` }, { key: `${prefix}-${dir}-w2-o` }],
            frameRate: 8,
            repeat: -1,
          });
        }
      }
    }

    // PVE 怪物行走动画（侧视）
    for (const prefix of ['ghost-gunner', 'shadow-bull']) {
      const key = 'walk-' + prefix;
      if (!this.anims.exists(key)) {
        this.anims.create({
          key,
          frames: [{ key: prefix + '-w1' }, { key: prefix + '-w2' }],
          frameRate: 6,
          repeat: -1,
        });
      }
    }

    // 心兽狼人：四向行走动画（与 Q 版角色一致的四向动作）
    for (const dir of WOLF_DIRS) {
      const key = 'walk-heart-beast-' + dir;
      if (!this.anims.exists(key)) {
        this.anims.create({
          key,
          frames: [
            { key: `heart-beast-${dir}-w1` },
            { key: `heart-beast-${dir}-w2` },
          ],
          frameRate: 7,
          repeat: -1,
        });
      }
    }

    // 西部双 BOSS：四向行走动画
    for (const boss of ['west-demon', 'west-angel']) {
      for (const dir of WEST_BOSS_DIRS) {
        const key = `walk-${boss}-${dir}`;
        if (!this.anims.exists(key)) {
          this.anims.create({
            key,
            frames: [
              { key: `${boss}-${dir}-w1` },
              { key: `${boss}-${dir}-w2` },
            ],
            frameRate: 6,
            repeat: -1,
          });
        }
      }
    }

    // 雄兵行走动画（普通 / 特立独行精锐 / 百折不挠持盾）
    for (const prefix of ['soldier', 'soldier-p3', 'soldier-p4']) {
      const key = 'walk-' + prefix;
      if (!this.anims.exists(key)) {
        this.anims.create({
          key,
          frames: [{ key: prefix + '-w1' }, { key: prefix + '-w2' }],
          frameRate: 8,
          repeat: -1,
        });
      }
    }

    this.scene.start('Menu');
  }
}