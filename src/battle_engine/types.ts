// ═══════════════════════════════════════════════════════════════
// 战斗引擎类型定义 — 自包含，不引用 role_core
// ═══════════════════════════════════════════════════════════════

// ─── 伤害类型 ───

export type DamageType = "physical" | "magical" | "true";

// ─── 修正类型（增益/减益） ───

export type ModifierType =
  | "damageDealt"
  | "physDamageDealt"
  | "magDamageDealt"
  | "damageTaken"
  | "physDamageTaken"
  | "magDamageTaken"
  | "healReceived"
  | "hpRecover"
  | "mpRecover"
  | "speed"
  | "critRate"
  | "critDmg"
  | "dodgeRate"
  | "lifesteal"
  | "defensePenetration"
  | "physDefensePenetration"
  | "magDefensePenetration"
  | "normalAttackHpRatio"
  | "normalAttackDefRatio"
  | "normalAttackResRatio"
  | "healOverflowToShield";

// ─── 控制效果 ───

export type CcType =
  | "freeze"
  | "stun"
  | "fear"
  | "confusion"
  | "silence"
  | "taunt";

// ─── 状态类型（DoT/HoT） ───

export type StatusType =
  | "poison"
  | "burn"
  | "bleed"
  | "hpRegen"
  | "mpDrain";

// ─── 召唤物触发条件 ───

export type SummonTrigger =
  | "on_attack"
  | "on_hit"
  | "on_turn_start"
  | "on_turn_end"
  | "on_kill"
  | "on_crit"
  | "on_dodge";

// ─── 战斗事件 ───

export type BattleEvent =
  | "battle_start"
  | "turn_start"
  | "turn_end"
  | "action_start"
  | "action_end"
  | "pre_damage"
  | "damage_dealt"
  | "damage_taken"
  | "heal"
  | "crit"
  | "dodge"
  | "kill"
  | "death"
  | "fatal"
  | "effect_expire"
  | "battle_end";

// ─── 战斗阶段 ───

export type BattlePhase =
  | "init"
  | "running"
  | "playerAction"
  | "targetSelection"
  | "victory"
  | "defeat"
  | "fled";

// ─── 战斗结局 ───

export type BattleOutcome = "victory" | "defeat" | "fled";

// ═══════════════════════════════════════════════════════════════
// 战斗者
// ═══════════════════════════════════════════════════════════════

export interface CombatantStats {
  maxHp: number;
  maxMp: number;
  speed: number;
  physAttack: number;
  magAttack: number;
  physDefense: number;
  magDefense: number;
  critRate: number;
  critDmg: number;
}

export interface BattleCombatant {
  id: string;
  name: string;
  team: "ally" | "enemy";
  isPlayerControlled: boolean;
  isProtagonist: boolean;

  stats: Readonly<CombatantStats>;

  hp: number;
  mp: number;
  shield: number;
  actionGauge: number;
  isDead: boolean;
  isFleeing: boolean;

  skills: BattleSkill[];
  cooldowns: number[];
  elixirs: BattleElixir[];
  /** 战斗中可用的毒药（由制毒产出，仅主角持有）。 */
  poisons: BattlePoison[];
  /** 已装备法宝的淬毒涂层：命中造成伤害后对目标叠加 DoT。 */
  coatings: BattleCoating[];

  effects: BattleEffect[];

  /** 灵根契合·火：战斗期恢复乘区（1 = 无加成）。作用于治疗/恢复接受者。 */
  linggenHealMult?: number;
  /** 灵根契合·土：战斗期护盾乘区（1 = 无加成）。作用于护盾接受者。 */
  linggenShieldMult?: number;

  realm?: { major: string; minor: string };
  powerTier?: string;
  identity?: string;
  sourceNpcName?: string;
  /** 头像 dataURL（主角为玩家上传图，NPC 目前为空）。 */
  avatarUrl?: string;
}

// ═══════════════════════════════════════════════════════════════
// 技能系统
// ═══════════════════════════════════════════════════════════════

export interface BattleSkill {
  name: string;
  desc: string;
  mpCost: number;
  actionCost: number;
  cooldown: number;
  needTarget: boolean;
  targetTeam: "ally" | "enemy";
  isAoE: boolean;
  effects: readonly SkillEffect[];
}

export interface BattleElixir {
  name: string;
  desc: string;
  effectType: "healHp" | "healMp";
  value: number;
  isPercent: boolean;
  count: number;
}

// ─── 技能效果（联合类型） ───

export type SkillEffect =
  | { type: "dealDamage"; damageType: DamageType; value: number }
  | { type: "dealDamageExecute"; damageType: DamageType; value: number; threshold: number; bonusPercent: number }
  | { type: "dealDamagePierce"; value: number }
  | { type: "dealDamageBySummon"; damageType: DamageType; value: number; summonName: string }
  | { type: "consumePoisonDamage" }
  | { type: "sacrificeHp"; percent: number }
  | { type: "heal"; value: number }
  | { type: "lifesteal"; damageType: DamageType; damagePercent: number }
  | { type: "applyModifier"; modifierType: ModifierType; value: number; duration: number; maxStacks: number; targetSelf?: boolean }
  | { type: "applyCc"; ccType: CcType; chance: number; duration: number }
  | { type: "applyStatus"; statusType: StatusType; tickValue: number; isPercent: boolean; duration: number; maxStacks: number }
  | { type: "summon"; name: string; trigger: SummonTrigger; effect: SummonEffectPayload; duration: number; stacksPerCast?: number }
  | { type: "cleanse" }
  | { type: "dispel" }
  | { type: "revive"; hpPercent: number }
  | { type: "deathWard"; duration: number }
  | { type: "extraAction"; chance: number }
  | { type: "counter"; damage: number; duration: number }
  | { type: "reflect"; percent: number; duration: number }
  | { type: "damageShare"; percent: number; duration: number }
  | { type: "gaugeManipulate"; value: number }
  | { type: "shield"; value: number }
  | { type: "stealth"; duration: number };

export type SummonEffectPayload =
  | { type: "dealDamage"; damageType: DamageType; value: number }
  | { type: "heal"; value: number }
  | { type: "healMp"; value: number }
  | { type: "applyModifier"; modifierType: ModifierType; value: number; duration?: number }
  | { type: "applyStatus"; statusType: StatusType; tickValue: number; isPercent: boolean; duration: number; maxStacks?: number };

// ═══════════════════════════════════════════════════════════════
// 效果系统
// ═══════════════════════════════════════════════════════════════

/**
 * 效果类别。
 * - delayed：延迟伤害。持续期间不结算，`remainingDuration` 归零被移除的那一刻
 *   一次性打出 `tickValue` 点伤害（见 `EffectManager.tickEffects`）。
 */
export type EffectCategory = "modifier" | "dot" | "hot" | "cc" | "summon" | "special" | "delayed";

export interface BattleEffect {
  id: string;
  name: string;
  sourceId: string;
  category: EffectCategory;
  remainingDuration: number;
  stacks: number;
  maxStacks: number;

  modifierType?: ModifierType;
  modifierValue?: number;

  tickValue?: number;
  tickIsPercent?: boolean;
  tickResource?: "hp" | "mp";
  statusType?: StatusType;

  ccType?: CcType;

  summonTrigger?: SummonTrigger;
  summonEffect?: SummonEffectPayload;

  specialType?: "deathWard" | "counter" | "reflect" | "damageShare" | "stealth" | "extraAction" | "shield";
  specialValue?: number;

  hidden?: boolean;
}

// ═══════════════════════════════════════════════════════════════
// 行动 & 上下文
// ═══════════════════════════════════════════════════════════════

export type BattleAction =
  | { type: "normalAttack"; targetId: string }
  | { type: "skill"; skillIndex: number; targetId: string }
  | { type: "elixir"; elixirIndex: number }
  | { type: "poison"; poisonIndex: number; targetId: string }
  | { type: "flee" };

export interface ActionContext {
  actor: BattleCombatant;
  action: BattleAction;
  allies: BattleCombatant[];
  enemies: BattleCombatant[];
  turn: number;
  target?: BattleCombatant;
}

export interface EventContext {
  event: BattleEvent;
  source?: BattleCombatant;
  target?: BattleCombatant;
  actor?: BattleCombatant;
  action?: BattleAction;
  damage?: DamageResult;
  allies: BattleCombatant[];
  enemies: BattleCombatant[];
  turn: number;
}

export type EventHandler = (ctx: EventContext) => void;

// ═══════════════════════════════════════════════════════════════
// 伤害结果
// ═══════════════════════════════════════════════════════════════

export interface DamageContext {
  source: BattleCombatant;
  target: BattleCombatant;
  rawDamage: number;
  damageType: DamageType;
  isCrit: boolean;
  isReflected?: boolean;
}

export interface DamageResult {
  finalDamage: number;
  shieldAbsorbed: number;
  hpLost: number;
  killed: boolean;
  dodged: boolean;
  deathWardTriggered: boolean;
  isCrit: boolean;
  reflectHpLost: number;
  reflectKilled: boolean;
  counterHpLost: number;
  counterKilled: boolean;
  lifestealHeal: number;
  sharedDamages: Array<{
    targetId: string;
    targetName: string;
    hpLost: number;
    killed: boolean;
  }>;
  trace?: string[];
}

// ═══════════════════════════════════════════════════════════════
// 日志
// ═══════════════════════════════════════════════════════════════

export type BattleLogType =
  | "damage" | "heal" | "shield" | "buff" | "debuff" | "cc"
  | "dot" | "miss" | "crit" | "flee_success" | "flee_fail"
  | "death" | "summon" | "info" | "gauge" | "debug";

export interface BattleLogEntry {
  turn: number;
  actorName: string;
  action: string;
  targetName?: string;
  type: BattleLogType;
  value?: number;
  narrative: string;
  team?: "ally" | "enemy";
}

// ═══════════════════════════════════════════════════════════════
// 行动选项（UI用）
// ═══════════════════════════════════════════════════════════════

export interface SkillActionItem {
  skillIndex: number;
  name: string;
  mpCost: number;
  needTarget: boolean;
  targetTeam: "ally" | "enemy";
  isAoE: boolean;
  description: string;
  cooldown: number;
  /** 是否可施放（法力足 + 未冷却 + 未被沉默）；false 时 UI 置灰。 */
  usable: boolean;
  /** 不可用原因文案（法力不足 / 冷却中N回合 / 被沉默）；可用时为 undefined。 */
  disabledReason?: string;
}

/** 法宝淬毒涂层在战斗中的形态。 */
export interface BattleCoating {
  name: string;
  tickPercent: number;
  duration: number;
}

/** 战斗中可对敌方使用的毒药。 */
export interface BattlePoison {
  name: string;
  desc: string;
  /** 效果类别：DoT / 延迟爆发 / 属性削弱。 */
  kind: "dot" | "delayed" | "modifier";
  /** DoT 与延迟伤害：占目标最大血量的百分比。属性削弱：修正百分点。 */
  value: number;
  /** 属性削弱时的修正类型。 */
  modifierType?: ModifierType;
  /** 持续回合数；延迟伤害为引爆前的回合数。 */
  duration: number;
  count: number;
}

export interface PoisonActionItem {
  poisonIndex: number;
  name: string;
  count: number;
  description: string;
}

export interface ElixirActionItem {
  elixirIndex: number;
  name: string;
  effectType: "healHp" | "healMp";
  value: number;
  count: number;
  description: string;
}

export interface ActionOptions {
  canNormalAttack: boolean;
  normalAttackCost: number;
  normalAttackDamage: number;
  skillActionCost: number;
  elixirActionCost: number;
  fleeActionCost: number;
  canFlee: boolean;
  skills: SkillActionItem[];
  elixirs: ElixirActionItem[];
  poisons: PoisonActionItem[];
}

// ═══════════════════════════════════════════════════════════════
// 战斗状态 & 结果
// ═══════════════════════════════════════════════════════════════

export interface FloatingText {
  id: number;
  combatantId: string;
  text: string;
  kind: "hp" | "mp";
}

export interface BattleState {
  phase: BattlePhase;
  actionCount: number;
  allies: BattleCombatant[];
  enemies: BattleCombatant[];
  activeCombatantId: string | null;
  pendingAction: BattleAction | null;
  selectedTargetId: string | null;
  log: BattleLogEntry[];
  floatingTexts: FloatingText[];
  triggerEntry: unknown;
}

export interface BattleResult {
  outcome: BattleOutcome;
  actionCount: number;
  protagonistHpPercent: number;
  protagonistMpPercent: number;
  elixirsUsed: { name: string; count: number }[];
  enemiesKilled: string[];
  triggerReason: string;
  allyNames: string[];
  enemyNames: string[];
  triggerKind: "active" | "passive";
  /** 战斗胜利时从每个被击杀敌人身上随机缴获的一件法宝/功法（纯游戏性，不经 AI）。 */
  loot: LootEntry[];
  /** 主角在战斗中身亡（仅正常/困难难度下战败时为 true；简单模式主角不会死亡）。 */
  protagonistDied?: boolean;
}

/** 单件战利品记录：来自哪个敌人、是法宝还是功法、物品名。 */
export interface LootEntry {
  enemyName: string;
  itemKind: "法宝" | "功法";
  itemName: string;
}

// ─── 引擎接口（内部模块间引用） ───

export interface BattleEngineLike {
  readonly effectManager: import("./EffectManager").EffectManager;
  readonly eventDispatcher: import("./EventDispatcher").EventDispatcher;
  readonly damagePipeline: import("./DamagePipeline").DamagePipeline;
  addLog(entry: BattleLogEntry): void;
  addLogEntries(entries: BattleLogEntry[]): void;
  findCombatant(id: string): BattleCombatant | undefined;
  getAllCombatants(): BattleCombatant[];
  applyHeal(target: BattleCombatant, rawHeal: number): number;
  applyMpChange(target: BattleCombatant, delta: number): number;
}
