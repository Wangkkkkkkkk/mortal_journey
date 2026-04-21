/**
 * 命运抉择最终结果：一个主接口，分「基础信息」与「五个天赋」两块。
 */

/** 叙事人称（第几人称）。 */
export type NarrationPerson = "first" | "second" | "third";

/**
 * 自定义出身表单提交结构（仅 UI / 内部状态用，不直接作为最终结果字段）。
 */
export interface CustomBirthPayload {
  tag: string;
  name: string;
  location: string;
  realmMajor: string;
  realmMinor: string | null;
  realmText: string;
  background: string;
  presetBirthKey?: string;
}

/** 轮盘上一格天赋（共五条）。 */
export interface FateChoiceTrait {
  name: string;
  rarity: string;
  desc: string;
  /** 是否锁定（逆天改命刷新时保留）。 */
  locked: boolean;
}

/**
 * 基础信息：姓名、人称、境界、出生地、出身叙述、灵根元素等。
 */
export interface FateChoiceBasics {
  /** 姓名 */
  playerName: string;
  /** 第几人称（叙事视角） */
  narrationPerson: NarrationPerson;
  /** 性别 */
  gender: string;
  /** 大境界 */
  realmMajor: string;
  /** 小境界（初期 / 中期 / 后期）；与所有大境界一致 */
  realmMinor: string | null;
  /** 出生地（地点名称） */
  birthPlace: string;
  /**
   * 出身信息：预设出身时为卡片说明与地点描述等合并文案；自定义出身时为填写的背景长文。
   */
  originStory: string;
  /**
   * 灵根五行元素列表。
   */
  linggen: string[];
}

/**
 * 命运抉择完成后的唯一结果类型：`basics` + 五个 `traits`。
 */
export interface FateChoiceResult {
  basics: FateChoiceBasics;
  traits: FateChoiceTrait[];
}
