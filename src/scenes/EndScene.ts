import Phaser from 'phaser';
import { CHAR_INFO, CharId, GAME_WIDTH, KILLS_TO_WIN, MODE, ModeId } from '../config';
import { FONT_BODY, FONT_MONO, useCrispText } from '../core/text';
import { applyRenderScale } from '../core/view';
import { addEquipXp, pveXpReward } from '../pve/equipment';
import { getPveLevel } from '../pve/levels';

interface ScoreRow { name: string; charId: CharId; kills: number; isPlayer: boolean; team?: number }

interface EndData {
  win: boolean;
  /** 推车模式获胜队伍（0 进攻 / 1 防守）；win 已是玩家视角 */
  winnerTeam?: number;
  charId: CharId;
  aiChars: CharId[];
  time: number;
  dealt: number;
  taken: number;
  scores?: ScoreRow[];
  mode?: ModeId;
  /** v0.37：本局地图信息，重开 / 返回选人时沿用 */
  payloadMap?: 'ruins' | 'coral';
  mapIndex?: number;
  mapName?: string;
  /** PVE 关卡信息，重开 / 返回关卡地图时沿用 */
  levelId?: string;
  levelName?: string;
  /** 结算原因（推车模式为「火车头抵达遗迹终点 / 推车时间耗尽…」） */
  reason?: string;
}

export class EndScene extends Phaser.Scene {
  private result: EndData = {
    win: true, charId: 'gunner', aiChars: [], time: 0, dealt: 0, taken: 0, scores: [],
  };
  /** 防止回车/点击连发导致重复 scene.start（重复启动会黑屏） */
  private leaving = false;

  constructor() {
    super('End');
  }

  init(data: EndData) {
    this.result = data;
    this.leaving = false;
  }

  create() {
    this.leaving = false;
    useCrispText(this);
    applyRenderScale(this);
    this.cameras.main.setBackgroundColor('#10131f');
    this.cameras.main.fadeIn(200);

    const win = this.result.win;
    const payload = this.result.mode === MODE.PAYLOAD;
    const pve = this.result.mode === MODE.PVE;

    const bg = this.add.rectangle(
      GAME_WIDTH / 2, 300, GAME_WIDTH, 600,
      win ? 0x14241c : 0x241418, 0.55,
    );
    void bg;

    const title = this.add.text(GAME_WIDTH / 2, 52, win ? '胜利！' : '败北…', {
      fontFamily: FONT_BODY,
      fontSize: '62px',
      fontStyle: 'bold',
      color: win ? '#f2c94c' : '#ff6b7a',
    }).setOrigin(0.5).setStroke('#10131f', 12).setDepth(5);
    this.tweens.add({ targets: title, scale: 1.15, duration: 420, yoyo: true, repeat: 2 });

    const subTitle = pve
      ? `${this.result.levelName ?? '冒险关卡'} · ${this.result.reason ?? (win ? '关卡完成' : '挑战失败')}`
      : payload
        ? `${(this.result.winnerTeam ?? (win ? 0 : 1)) === 0 ? '进攻方胜利' : '防守方胜利'} · ${this.result.reason ?? (win ? '火车头抵达终点' : '火车头被拦下')}`
        : (win ? `你率先拿下 ${KILLS_TO_WIN} 次击杀！` : `对手抢先达成了 ${KILLS_TO_WIN} 次击杀…`);
    this.add.text(GAME_WIDTH / 2, 104, subTitle, {
      fontFamily: FONT_BODY, fontSize: '16px', color: payload || pve ? '#ffe27a' : '#c9d6ee',
    }).setOrigin(0.5).setDepth(5);

    // 战绩卡：PVE 只展示玩家本人，其余模式展示全员
    const rawScores: ScoreRow[] = this.result.scores && this.result.scores.length > 0
      ? [...this.result.scores]
      : [
        { name: CHAR_INFO[this.result.charId].name, charId: this.result.charId, kills: 0, isPlayer: true },
        ...this.result.aiChars.map((c) => ({ name: '机·' + CHAR_INFO[c].name, charId: c, kills: 0, isPlayer: false })),
      ];
    const scores = pve ? rawScores.filter((s) => s.isPlayer) : rawScores;
    scores.sort((a, b) => payload
      ? (a.team ?? 0) - (b.team ?? 0) || b.kills - a.kills
      : b.kills - a.kills);

    const baseY = 254;
    const gap = 150;
    const startX = GAME_WIDTH / 2 - ((scores.length - 1) * gap) / 2;
    scores.forEach((row, i) => {
      const x = startX + i * gap;
      const cardW = 140;
      const cardH = 200;
      const panel = this.add.graphics().setDepth(3);
      const fill = row.isPlayer ? 0x22331f : payload
        ? (row.team === 0 ? 0x16283a : 0x2a1a20) : 0x1a2134;
      const edge = row.isPlayer ? 0x57e08b : payload
        ? (row.team === 0 ? 0x57c8ff : 0xff5f6d) : 0x3a4560;
      panel.fillStyle(fill, 0.96);
      panel.fillRoundedRect(x - cardW / 2, baseY - cardH / 2, cardW, cardH, 10);
      panel.lineStyle(row.isPlayer ? 3 : 2, edge, 1);
      panel.strokeRoundedRect(x - cardW / 2, baseY - cardH / 2, cardW, cardH, 10);

      this.add.image(x, baseY - 42, row.charId + '-portrait')
        .setScale(0.72).setDepth(4).setAlpha(row.isPlayer || win ? 1 : 0.85);
      const nameColor = row.isPlayer ? '#8ff0b0'
        : payload ? (row.team === 0 ? '#8fd6ff' : '#ff8a8a') : '#ffb3ba';
      this.add.text(x, baseY + 22, row.name, {
        fontFamily: FONT_BODY, fontSize: '12px', color: nameColor,
      }).setOrigin(0.5).setDepth(5);
      if (payload) {
        this.add.text(x, baseY + 38, row.team === 0 ? '进攻' : '防守', {
          fontFamily: FONT_BODY, fontSize: '10px',
          color: row.team === 0 ? '#57c8ff' : '#ff5f6d',
        }).setOrigin(0.5).setDepth(5);
      }
      this.add.text(x, baseY + 62, `⚔ ${row.kills} 杀`, {
        fontFamily: FONT_MONO, fontSize: '18px', fontStyle: 'bold',
        color: i === 0 ? '#f2c94c' : '#c9d6ee',
      }).setOrigin(0.5).setDepth(5);
      if (!pve) {
        this.add.text(x, baseY - 76, `#${i + 1}`, {
          fontFamily: FONT_MONO, fontSize: '13px', fontStyle: 'bold',
          color: i === 0 ? '#f2c94c' : '#8fa3c8',
        }).setOrigin(0.5).setDepth(5);
      }
    });

    // 对局数据
    const statLines = [
      ...(pve ? [`关卡  ${this.result.levelName ?? '-'}`] : []),
      `对局时长  ${this.result.time}s`,
      `造成伤害  ${this.result.dealt}`,
      `承受伤害  ${this.result.taken}`,
    ];
    this.add.text(GAME_WIDTH / 2, 388, statLines.join('    |    '), {
      fontFamily: FONT_MONO, fontSize: '15px', color: '#c9d6ee',
    }).setOrigin(0.5).setDepth(5);

    // PVE：结算专属装备经验（无专属装备或已满级时给出对应提示）
    if (pve) {
      const level = getPveLevel(this.result.levelId);
      const gain = pveXpReward(level.order, win);
      const res = addEquipXp(this.result.charId, gain);
      const xpText = !res
        ? `${CHAR_INFO[this.result.charId].name}暂无专属装备，无法获得装备经验`
        : res.gain <= 0
          ? `装备「${res.def.name}」已满级`
          : `装备「${res.def.name}」获得 ${res.gain} 经验`
            + (res.after.level > res.before.level
              ? `　升级！Lv.${res.before.level} → Lv.${res.after.level}`
              : '');
      this.add.text(GAME_WIDTH / 2, 422, xpText, {
        fontFamily: FONT_BODY, fontSize: '14px',
        color: res && res.gain > 0 ? '#ffe27a' : '#8fa3c8',
      }).setOrigin(0.5).setDepth(5);
    }

    this.makeButton(370, 486, 240, 44, pve ? '再次挑战（回车）' : '再来一局（回车）', () => this.rematch());
    this.makeButton(640, 486, 240, 44, pve ? '返回关卡地图（ESC）' : '更换角色（ESC）', () => this.toSelect());

    this.input.keyboard!.on('keydown-ENTER', () => this.rematch());
    this.input.keyboard!.on('keydown-SPACE', () => this.rematch());
    this.input.keyboard!.on('keydown-R', () => this.rematch());
    this.input.keyboard!.on('keydown-ESC', () => this.toSelect());
  }

  private makeButton(
    cx: number, cy: number, w: number, h: number,
    label: string, onClick: () => void,
  ) {
    const panel = this.add.graphics();
    panel.fillStyle(0x1d2536, 1);
    panel.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, 10);
    panel.lineStyle(2, 0xf2c94c, 1);
    panel.strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, 10);
    this.add.text(cx, cy, label, {
      fontFamily: FONT_BODY, fontSize: '15px', color: '#f2e9c4',
    }).setOrigin(0.5);
    const zone = this.add.zone(cx, cy, w, h).setInteractive({ useHandCursor: true });
    zone.on('pointerover', () => {
      panel.clear();
      panel.fillStyle(0x2a3550, 1);
      panel.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, 10);
      panel.lineStyle(2, 0xffe07a, 1);
      panel.strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, 10);
    });
    zone.on('pointerout', () => {
      panel.clear();
      panel.fillStyle(0x1d2536, 1);
      panel.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, 10);
      panel.lineStyle(2, 0xf2c94c, 1);
      panel.strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, 10);
    });
    zone.on('pointerdown', onClick);
    return { panel, zone };
  }

  private rematch() {
    if (this.leaving) return;
    this.leaving = true;
    this.cameras.main.fadeOut(160);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('Game', {
        charId: this.result.charId,
        mode: this.result.mode,
        payloadMap: this.result.payloadMap,
        mapIndex: this.result.mapIndex,
        levelId: this.result.levelId,
        levelName: this.result.levelName,
      });
    });
  }

  private toSelect() {
    if (this.leaving) return;
    this.leaving = true;
    this.cameras.main.fadeOut(160);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start(this.result.mode === MODE.PVE ? 'LevelSelect' : 'Select', {
        mode: this.result.mode,
        payloadMap: this.result.payloadMap,
        mapIndex: this.result.mapIndex,
        mapName: this.result.mapName,
        levelId: this.result.levelId,
        levelName: this.result.levelName,
      });
    });
  }
}
