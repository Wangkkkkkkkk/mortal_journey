/**
 * 角色领域模型 + 境界常量数据表。
 *
 * 结构：数据 → 类型 → 再导出
 *
 * - 数据：属性键/映射（具体数值见 gameConstants.ts）
 * - 类型：主属性、槽位状态、角色卡接口、UI 动作
 * - 导出：itemInfo 再导出、realmUtils 功能函数再导出、gameConstants 再导出
 */

import type {
  TreasureItemDefinition,
  GongfaItemDefinition,
  InventoryStackItem,
} from "./items";
import type { NpcMemory } from "../npcMemory";
export type { NpcMemory };
import type { WorldLocation } from "./worldLocation";
import type { WorldTime } from "../worldTime";

import {
  REALM_PRIMARY_STATS_TABLE,
  CULTIVATION_VALUES_TABLE,
  SHOUYUAN_VALUES,
  EQUIP_SLOT_COUNT,
  GONGFA_SLOT_COUNT,
  GONGFA_GRADE_ATTRI_TABLE,
  MIN_NARRATIVE_AGE_BY_MAJOR,
  MAX_NARRATIVE_AGE_BY_MAJOR,
  rollGradeAttriValue,
  GONGFA_GRADE_CULTIVATION_MULT,
  LINGGEN_CULTIVATION_MULT,
  LINGGEN_ELEMENT_BONUS_BY_MAJOR,
  getLinggenElementBonus,
  formatLinggenBonusText,
  computeLinggenCombatBonuses,
  GONGFA_MASTERY_THRESHOLDS,
  GONGFA_MASTERY_ATTRI_MULT,
  GONGFA_MASTERY_COMBAT_MULT,
} from "./gameConstants";

export {
  REALM_PRIMARY_STATS_TABLE,
  CULTIVATION_VALUES_TABLE,
  SHOUYUAN_VALUES,
  EQUIP_SLOT_COUNT,
  GONGFA_SLOT_COUNT,
  GONGFA_GRADE_ATTRI_TABLE,
  MIN_NARRATIVE_AGE_BY_MAJOR,
  MAX_NARRATIVE_AGE_BY_MAJOR,
  rollGradeAttriValue,
  GONGFA_GRADE_CULTIVATION_MULT,
  LINGGEN_CULTIVATION_MULT,
  LINGGEN_ELEMENT_BONUS_BY_MAJOR,
  getLinggenElementBonus,
  formatLinggenBonusText,
  computeLinggenCombatBonuses,
  GONGFA_MASTERY_THRESHOLDS,
  GONGFA_MASTERY_ATTRI_MULT,
  GONGFA_MASTERY_COMBAT_MULT,
};
// 一、数据 — 属性键与映射
// ═══════════════════════════════════════════════════════════════════════════

export const PRIMARY_STAT_KEYS = [
  "physique",
  "spirit",
  "strength",
  "perception",
  "guard",
  "resistance",
  "agility",
  "insight",
] as const;

export type PrimaryStatKey = (typeof PRIMARY_STAT_KEYS)[number];

export const PRIMARY_STAT_KEY_TO_ZH: Readonly<Record<PrimaryStatKey, string>> = {
  physique: "体魄",
  spirit: "灵力",
  strength: "劲力",
  perception: "神识",
  guard: "护体",
  resistance: "灵御",
  agility: "身法",
  insight: "悟性",
};

export const PRIMARY_STAT_KEY_DESC: Readonly<Record<PrimaryStatKey, string>> = {
  physique: "增加血量",
  spirit: "增加法力",
  strength: "提高造成的物伤",
  perception: "提高造成的法伤",
  guard: "提高对物伤的抵抗率",
  resistance: "提高对法伤的抵抗率",
  agility: "增加行动速度",
  insight: "增加修炼速度",
};

export type ZhStatBonusMap = Partial<Record<string, number>>;

// ═══════════════════════════════════════════════════════════════════════════
// 一、数据 — 游戏常量（结构部分）
// ═══════════════════════════════════════════════════════════════════════════

export const REALM_ORDER = ["练气", "筑基", "结丹", "元婴", "化神"] as const;
export type RealmMajor = (typeof REALM_ORDER)[number];

export const SUB_STAGES = ["初期", "中期", "后期"] as const;
export type RealmSubStage = (typeof SUB_STAGES)[number];

export type NarrationPerson = "first" | "second" | "third";

export type BreakthroughStatus = "idle" | "ready" | "in_quest";

// ═══════════════════════════════════════════════════════════════════════════
// 一、数据 — 境界主属性表
// ═══════════════════════════════════════════════════════════════════════════

export interface RealmPrimaryStatsRow {
  realm: string;
  stage: string;
  hp: number;
  mp: number;
  physique: number;
  spirit: number;
  strength: number;
  perception: number;
  guard: number;
  resistance: number;
  agility: number;
  insight: number;
}

export function realmStageIndex(realm: string, stage: string): number {
  const majorIdx = (REALM_ORDER as readonly string[]).indexOf(realm);
  if (majorIdx < 0) return 0;
  const minorIdx = (SUB_STAGES as readonly string[]).indexOf(stage);
  if (minorIdx < 0) return 0;
  return majorIdx * SUB_STAGES.length + minorIdx + 1;
}

export const TABLE: readonly RealmPrimaryStatsRow[] = (REALM_ORDER as readonly string[]).flatMap(
  (realm) =>
    (SUB_STAGES as readonly string[]).map((stage, minorIdx) => {
      const majorIdx = (REALM_ORDER as readonly string[]).indexOf(realm);
      const idx = majorIdx * SUB_STAGES.length + minorIdx;
      const row = REALM_PRIMARY_STATS_TABLE[Math.min(idx, REALM_PRIMARY_STATS_TABLE.length - 1)];
      return {
        realm, stage,
        hp: row.hp, mp: row.mp,
        physique: row.physique, spirit: row.spirit,
        strength: row.strength, perception: row.perception,
        guard: row.guard, resistance: row.resistance,
        agility: row.agility, insight: row.insight,
      };
    }),
);

export const CULTIVATION_VALUES: readonly number[] = CULTIVATION_VALUES_TABLE;

// ═══════════════════════════════════════════════════════════════════════════
// 二、结构 — 类型与接口
// ═══════════════════════════════════════════════════════════════════════════

export interface CultivationRealm {
  major: string;
  minor: string;
}

export type EquippedSlotsState = Array<TreasureItemDefinition | null>;

type Tuple8<T> = [T, T, T, T, T, T, T, T];
type GongfaSlotCell = GongfaItemDefinition | null;

export type GongfaSlotsState = Tuple8<GongfaSlotCell>;

export type TraitEntry =
  | string
  | {
      name: string;
      desc: string;
      rarity: string;
      /** 天赋具体效果（仅主角开局天赋携带；旧存档无此字段视为已结算/无效果）。 */
      effect?: import("../../fate_choice/traitEffect").TraitEffect;
    };

export interface CharacterPlayInfoCommon {
  id: string;
  displayName: string;
  realm: CultivationRealm;
  primaryStats: Record<PrimaryStatKey, number>;
  maxHp: number;
  maxMp: number;
  currentHp: number;
  currentMp: number;
  avatarUrl: string;
  gender: string;
  linggen: string[];
  age: number;
  ageConfirmed: boolean;
  shouyuan: number;
  inventorySlots: Array<InventoryStackItem | null>;
  gongfaSlots: GongfaSlotsState;
  equippedSlots: EquippedSlotsState;
  elixirBonuses?: Record<string, number>;
}

export interface ProtagonistPlayInfo extends CharacterPlayInfoCommon {
  role: "protagonist";
  narrationPerson: NarrationPerson;
  birthPlace: WorldLocation;
  originStory: string;
  traits: TraitEntry[];
  xiuwei: number;
  realmComplete: boolean;
  breakthroughStatus: BreakthroughStatus;
  /** 立绘候选池（dataURL）。旧存档缺省为空。 */
  avatarCandidates?: string[];
}

export type PowerTier = "小怪" | "精英怪" | "小boss" | "大boss" | "普通NPC";

/**
 * NPC 种族（决定外貌/服装的文生图要素清单）：
 * - 修仙者   人形修士，穿戴正常服饰。
 * - 人形妖兽 整体人形体态，但头部/躯干保留妖兽特征（兽耳/兽角/鳞片/毛色等），穿衣。
 * - 妖兽     兽形，无人类服饰（clothing 可为空）。
 */
export type NpcRace = "修仙者" | "人形妖兽" | "妖兽";

/**
 * NPC 在场状态机：
 * - active   当前在主角所在地点，参与剧情 sim。
 * - dormant  归属本地点但主角暂时离开；保留全部数据，回归时唤醒。
 * - departed 因剧情离开原地点云游（预留状态，目前与 dormant 同义）。
 * - dead     已死亡。
 */
export type NpcPresence = "active" | "dormant" | "departed" | "dead";

export interface NpcPlayInfo extends CharacterPlayInfoCommon {
  role: "npc";
  identity: string;
  favorability: number;
  isDead: boolean;
  powerTier: PowerTier;
  /** 种族：决定外貌/服装的文生图要素清单。旧存档缺省视为"修仙者"。 */
  race: NpcRace;
  /** 外貌特征（自由文本，按种族含发型/脸型/身材/毛色/兽角等要素），用于文生图。 */
  appearance: string;
  /** 服装特征（自由文本，含服装类型/主色调/纹样/配饰；兽形"妖兽"可为空），用于文生图。 */
  clothing: string;
  traits: TraitEntry[];
  xiuwei: number;
  /** 当前所在地点（权威位置字段，由状态 AI 每回合维护；用于在场判定/地图展示/迁移）。 */
  currentLocation?: WorldLocation | null;
  /** 在场状态机。 */
  presence?: NpcPresence;
  /** 上次被主角见到的世界时间（用于地点唤醒/在场判定/简表显示）。 */
  lastSeenWorldTime?: WorldTime | null;
  /** 累计相遇次数。 */
  encounterCount?: number;
  /** 立绘候选池（dataURL）：所有生成过的立绘都保留，玩家可切换/删除。旧存档缺省为空。 */
  avatarCandidates?: string[];
  /** 剧情近况快照（追加+限长）：状态 AI 每轮为有显著行为的 NPC 追加一句话，用于跨轮记忆。旧存档缺省为空。 */
  storySnapshot?: string;
  /** 互动记忆日志（append-only，带上限）：与主角的关键互动按时间顺序记录，用于深度连续性。旧存档缺省为空。 */
  memories?: NpcMemory[];
  /** 好感度突破条件（上涨门槛文本）：正向 delta 跨档前须满足；旧存档缺省为空（无门槛）。 */
  favorBreakthroughCondition?: string;
}

export type EquipSlotKey = number;

export type ProtagonistDetailAction =
  | { id: "unequipWear"; equipSlot: EquipSlotKey }
  | { id: "unequipGongfa"; gongfaIndex: number }
  | { id: "equipWearFromBag"; inventoryIndex: number }
  | { id: "equipGongfaFromBag"; inventoryIndex: number }
  | { id: "consumeElixir"; inventoryIndex: number }
  | { id: "cultivateGongfa"; gongfaIndex: number }
  | { id: "sellFromBag"; inventoryIndex: number; count: number };

// ═══════════════════════════════════════════════════════════════════════════
// 三、导出 — itemInfo 再导出
// ═══════════════════════════════════════════════════════════════════════════

export type {
  TreasureItemDefinition,
  GongfaItemDefinition,
  ElixirItemDefinition,
  MaterialItemDefinition,
  MiscItemDefinition,
  CategorizedItemDefinition,
  SpiritStoneInventoryStack,
  TreasureBagStack,
  GongfaBagStack,
  ElixirBagStack,
  MaterialBagStack,
  MiscBagStack,
  InventoryStackItem,
} from "./items";

// ═══════════════════════════════════════════════════════════════════════════
// 三、导出 — realmUtils 功能函数再导出
// ═══════════════════════════════════════════════════════════════════════════

export {
  getRealmPrimaryStats,
  getProtagonistNarrativeAge,
  getShouyuanForRealm,
  getCultivationRequired,
  getRow,
  hasRow,
  getTable,
  getMinNarrativeAgeForMajor,
  getMaxNarrativeAgeForMajor,
  customBirthBackgroundImpliesAgeException,
  resolveEffectiveMajorForNarrativeAge,
} from "../realmUtils";

export type {
  CustomBirthSlice,
  FateChoiceSliceForAge,
  GameSliceForNarrativeAge,
} from "../realmUtils";

export type { WorldLocation } from "./worldLocation";
export {
  formatWorldLocation,
  formatWorldLocationDash,
  parseWorldLocationFromDash,
  isWorldLocationEqual,
  isEmptyWorldLocation,
} from "./worldLocation";
