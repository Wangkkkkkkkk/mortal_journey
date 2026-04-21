/**
 * 角色 / 物品加成属性键：英文 runtime 键与中文 bonus 键在此统一定义。
 * 与 mortal_journey `player_base_runtime` 中 ZH_BONUS_TO_PLAYER_KEY 对应。
 * 独立文件，供 playInfo、itemInfo、realm_state 等共用，避免循环依赖。
 */

/** 与 `PlayerBaseStats`、境界表十维顺序一致（勿改顺序，除非全项目同步） */
export const PLAYER_STAT_BONUS_KEYS = [
  "hp",
  "mp",
  "patk",
  "pdef",
  "matk",
  "mdef",
  "sense",
  "luck",
  "dodge",
  "tenacity",
] as const;

/** 英文属性键（面板十维 / 境界表 / 物品 bonus 映射左侧） */
export type PlayerStatBonusKey = (typeof PLAYER_STAT_BONUS_KEYS)[number];

/** 中文加成键（物品 `bonus`、日志与 UI） */
export type ZhPlayerStatBonusKey =
  | "血量"
  | "法力"
  | "物攻"
  | "物防"
  | "法攻"
  | "法防"
  | "神识"
  | "气运"
  | "闪避"
  | "韧性";

/** 英文键 → 中文键（唯一对照表） */
export const PLAYER_STAT_KEY_TO_ZH: Readonly<Record<PlayerStatBonusKey, ZhPlayerStatBonusKey>> = {
  hp: "血量",
  mp: "法力",
  patk: "物攻",
  pdef: "物防",
  matk: "法攻",
  mdef: "法防",
  sense: "神识",
  luck: "气运",
  dodge: "闪避",
  tenacity: "韧性",
};

export type ZhStatBonusMap = Partial<Record<ZhPlayerStatBonusKey, number>>;
