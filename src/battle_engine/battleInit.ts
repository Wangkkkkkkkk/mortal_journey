import type { BattleCombatant, BattleSkill, BattleElixir, BattlePoison, BattleCoating, BattleEffect, SkillEffect, DamageType, ModifierType, CcType, StatusType, SummonTrigger, CombatantStats } from "./types";
import type { BattleTriggerEntry } from "../ai/state_generate";
import type { GongfaSlotsState, EquippedSlotsState } from "../role_core/types/playInfo";
import type { InventoryStackItem, ElixirItemDefinition, PoisonItemDefinition } from "../role_core/types/itemInfo";
import type { GongfaBattleEffect, LayerValue } from "../role_core/types/gongfa";
import type { PrimaryStatKey } from "../role_core/types/playInfo";
import { atLayer, atLayerFloat, resolveGongfaBattleEffectDesc } from "../role_core/types/gongfa";
import { protagonist } from "../role_core/Protagonist";
import { Npc } from "../role_core/Npc";
import { npcStore } from "../role_core/npcStore";
import { gameLog } from "../log/gameLog";
import { GONGFA_SLOT_COUNT, GONGFA_MASTERY_COMBAT_MULT, computeLinggenCombatBonuses } from "../role_core/types/gameConstants";
import { generateId as generateEffectId } from "./formulas";
import { BASE_CRIT_DMG } from "./constants";

function generateId(team: "ally" | "enemy", index: number): string {
  return `${team}_${index}`;
}

function getMasteryMult(mastery?: number): number {
  if (mastery != null && mastery >= 1) {
    return GONGFA_MASTERY_COMBAT_MULT[Math.min(mastery, GONGFA_MASTERY_COMBAT_MULT.length) - 1];
  }
  return 1.0;
}

function bakeScalingValue(
  eff: GongfaBattleEffect,
  getStat: (key: string) => number,
  masteryMult: number,
  layer: number,
): number | undefined {
  if (!("baseValue" in eff) || !("scalingRatio" in eff) || !("scalingStat" in eff)) {
    return undefined;
  }
  const bv = atLayer(eff.baseValue as LayerValue, layer);
  const sr = atLayerFloat(eff.scalingRatio as LayerValue, layer);
  const stat = getStat(eff.scalingStat);
  return Math.round((bv + sr * stat) * masteryMult);
}

function convertBattleEffectToSkillEffect(
  eff: GongfaBattleEffect,
  getStat: (key: string) => number,
  masteryMult: number,
  layer: number,
): SkillEffect {
  const v = bakeScalingValue(eff, getStat, masteryMult, layer);

  switch (eff.type) {
    case "dealDamage":
      return { type: "dealDamage", damageType: eff.damageType as DamageType, value: v ?? 0 };
    case "dealDamageExecute":
      return { type: "dealDamageExecute", damageType: eff.damageType as DamageType, value: v ?? 0, threshold: eff.threshold, bonusPercent: eff.bonusPercent };
    case "dealDamagePierce":
      return { type: "dealDamagePierce", value: v ?? 0 };
    case "dealDamageBySummon":
      return { type: "dealDamageBySummon", damageType: eff.damageType as DamageType, value: v ?? 0, summonName: eff.summonName };
    case "consumePoisonDamage":
      return { type: "consumePoisonDamage" };
    case "sacrificeHp":
      return { type: "sacrificeHp", percent: atLayer(eff.percent as LayerValue, layer) };
    case "heal":
      return { type: "heal", value: v ?? 0 };
    case "lifesteal":
      return { type: "lifesteal", damageType: eff.damageType as DamageType, damagePercent: atLayer(eff.damagePercent, layer) };
    case "applyModifier":
      return { type: "applyModifier", modifierType: eff.modifierType as ModifierType, value: atLayer(eff.value, layer), duration: eff.duration, maxStacks: eff.maxStacks, targetSelf: eff.targetSelf };
    case "applyCc":
      return { type: "applyCc", ccType: eff.ccType as CcType, chance: atLayerFloat(eff.chance, layer), duration: eff.duration };
    case "applyStatus":
      return { type: "applyStatus", statusType: eff.statusType as StatusType, tickValue: atLayer(eff.tickValue, layer), isPercent: eff.isPercent, duration: eff.duration, maxStacks: eff.maxStacks };
    case "shield":
      return { type: "shield", value: v ?? 0 };
    case "counter":
      return { type: "counter", damage: v ?? 0, duration: eff.duration };
    case "reflect":
      return { type: "reflect", percent: atLayer(eff.percent, layer), duration: eff.duration };
    case "damageShare":
      return { type: "damageShare", percent: atLayer(eff.percent, layer), duration: eff.duration };
    case "deathWard":
      return { type: "deathWard", duration: eff.duration };
    case "extraAction":
      return { type: "extraAction", chance: eff.chance };
    case "gaugeManipulate":
      return { type: "gaugeManipulate", value: eff.value };
    case "stealth":
      return { type: "stealth", duration: eff.duration };
    case "cleanse":
      return { type: "cleanse" };
    case "dispel":
      return { type: "dispel" };
    case "revive":
      return { type: "revive", hpPercent: eff.hpPercent };
    case "summon": {
      const baseDmg = atLayer(eff.summonDamage, layer);
      const scalingDmg = eff.scalingRatio != null && eff.scalingStat
        ? atLayerFloat(eff.scalingRatio as LayerValue, layer) * getStat(eff.scalingStat)
        : 0;
      const dmg = Math.round(baseDmg + scalingDmg);
      const count = eff.countPerCast != null ? atLayer(eff.countPerCast as LayerValue, layer) : 1;
      return { type: "summon", name: eff.name, trigger: eff.trigger as SummonTrigger, effect: { type: "dealDamage", damageType: "physical", value: dmg }, duration: eff.duration, stacksPerCast: count };
    }
  }
}

function isTargetEnemy(eff: GongfaBattleEffect): boolean {
  switch (eff.type) {
    case "dealDamage": case "dealDamageExecute": case "dealDamagePierce": case "dealDamageBySummon":
    case "consumePoisonDamage":
    case "lifesteal": case "applyCc":
    case "gaugeManipulate": case "dispel":
      return true;
    case "applyStatus":
      return eff.statusType !== "hpRegen";
    case "applyModifier":
      return !eff.targetSelf;
    default:
      return false;
  }
}

function needsTarget(eff: GongfaBattleEffect): boolean {
  switch (eff.type) {
    case "dealDamage": case "dealDamageExecute": case "dealDamagePierce": case "dealDamageBySummon":
    case "consumePoisonDamage":
    case "lifesteal": case "applyCc": case "applyStatus":
    case "gaugeManipulate": case "dispel": case "heal":
      return true;
    case "applyModifier":
      return !eff.targetSelf;
    default:
      return false;
  }
}
function buildBattleSkills(gongfaSlots: GongfaSlotsState, getStat: (key: string) => number, cooldownReduce: number): BattleSkill[] {
  const skills: BattleSkill[] = [];

  for (const gf of gongfaSlots) {
    if (!gf || !gf.function) continue;
    if (gf.function.type !== "主动") continue;

    const layer = gf.mastery ?? 1;
    const masteryMult = getMasteryMult(layer);
    const effects = gf.function.battleEffects.map(eff =>
      convertBattleEffectToSkillEffect(eff, getStat, masteryMult, layer),
    );

    const hasOffensive = gf.function.battleEffects.some(isTargetEnemy);
    const hasNeedTarget = gf.function.battleEffects.some(needsTarget);

    const getStatForDesc = (key: PrimaryStatKey) => getStat(key);
    const desc = gf.function.battleEffects
      .map(e => resolveGongfaBattleEffectDesc(e, getStatForDesc, masteryMult, layer, false))
      .join("；");

    skills.push({
      name: gf.name,
      desc,
      mpCost: atLayer(gf.function.mpCost ?? 0, layer),
      actionCost: 100,
      cooldown: Math.max(0, (gf.function.cooldown ?? 0) - cooldownReduce),
      needTarget: hasNeedTarget,
      targetTeam: hasOffensive ? "enemy" : "ally",
      isAoE: !!gf.function.isAoE,
      effects,
    });
  }
  return skills;
}

function convertBattleEffectToInitEffect(
  eff: GongfaBattleEffect,
  getStat: (key: string) => number,
  masteryMult: number,
  layer: number,
  effectName: string,
  combatantId: string,
): BattleEffect {
  const v = bakeScalingValue(eff, getStat, masteryMult, layer);
  const base: BattleEffect = {
    id: generateEffectId(),
    name: effectName,
    sourceId: combatantId,
    category: "special",
    remainingDuration: 2,
    stacks: 1,
    maxStacks: 1,
  };

  switch (eff.type) {
    case "applyModifier":
      return { ...base, category: "modifier", modifierType: eff.modifierType as ModifierType, modifierValue: atLayer(eff.value, layer), remainingDuration: eff.duration, maxStacks: eff.maxStacks };
    case "applyCc":
      return { ...base, category: "cc", ccType: eff.ccType as CcType, remainingDuration: eff.duration };
    case "applyStatus": {
      const isDoT = eff.statusType === "poison" || eff.statusType === "burn" || eff.statusType === "bleed" || eff.statusType === "mpDrain";
      return { ...base, category: isDoT ? "dot" : "hot", tickValue: atLayer(eff.tickValue, layer), tickIsPercent: eff.isPercent, tickResource: eff.statusType === "mpDrain" ? "mp" : "hp", statusType: eff.statusType as StatusType, remainingDuration: eff.duration, maxStacks: eff.maxStacks };
    }
    case "shield":
      return { ...base, specialType: "shield", specialValue: v ?? 0, remainingDuration: 99 };
    case "counter":
      return { ...base, specialType: "counter", specialValue: v ?? 0, remainingDuration: eff.duration };
    case "reflect":
      return { ...base, specialType: "reflect", specialValue: atLayer(eff.percent, layer), remainingDuration: eff.duration };
    case "damageShare":
      return { ...base, specialType: "damageShare", specialValue: atLayer(eff.percent, layer), remainingDuration: eff.duration };
    case "deathWard":
      return { ...base, specialType: "deathWard", remainingDuration: eff.duration };
    case "stealth":
      return { ...base, specialType: "stealth", remainingDuration: eff.duration };
    case "extraAction":
      return { ...base, specialType: "extraAction", specialValue: Math.round(eff.chance * 100), remainingDuration: 99 };
    case "dealDamage":
    case "dealDamageExecute":
    case "dealDamagePierce":
    case "dealDamageBySummon":
    case "consumePoisonDamage":
    case "sacrificeHp":
    case "heal":
    case "lifesteal":
      return { ...base, category: "modifier", modifierType: "damageDealt" as ModifierType, modifierValue: 0, remainingDuration: 99 };
    case "gaugeManipulate":
      return base;
    case "cleanse":
    case "dispel":
    case "revive":
    case "summon":
      return base;
  }
}

export function extractPassiveEffects(
  gongfaSlots: GongfaSlotsState,
  getStat: (key: string) => number,
  combatantId: string,
): BattleEffect[] {
  const effects: BattleEffect[] = [];

  for (const gf of gongfaSlots) {
    if (!gf || !gf.function) continue;
    if (gf.function.type !== "被动") continue;

    const layer = gf.mastery ?? 1;
    const masteryMult = getMasteryMult(layer);
    for (const eff of gf.function.battleEffects) {
      const be = convertBattleEffectToInitEffect(eff, getStat, masteryMult, layer, gf.function.name, combatantId);
      be.hidden = true;
      effects.push(be);
    }
  }

  return effects;
}

export function extractTreasurePassiveEffects(
  equippedSlots: EquippedSlotsState,
  combatantId: string,
): BattleEffect[] {
  const effects: BattleEffect[] = [];

  for (const tr of equippedSlots) {
    if (!tr || !tr.function) continue;
    if (!("modifiers" in tr.function)) continue;
    for (const mod of tr.function.modifiers) {
      const rawType = mod.modifierType as string;
      const engineType = (rawType === "healReceived" ? "hpRecover" : rawType) as ModifierType;
      effects.push({
        id: generateEffectId(),
        name: tr.function.name,
        sourceId: combatantId,
        category: "modifier",
        remainingDuration: 99,
        stacks: 1,
        maxStacks: 1,
        modifierType: engineType,
        modifierValue: mod.modifierType === "damageTaken" ? -mod.value : mod.value,
        hidden: true,
      });
    }
  }

  return effects;
}

/**
 * 由主属性 + 灵根加成组装战斗单位的基础属性块。
 * 暴击率基础为 0，暴伤基础 {@link BASE_CRIT_DMG}% + 金灵根加成；
 * 暴击/闪避/吸血/回血等的实际来源是法宝词条与被动功法的修正 effect。
 * 战斗初始化与主界面面板（`panelStats.ts`）共用此函数，保证两处数值同源。
 */
export function buildCombatantBaseStats(
  primaryStats: Record<string, number>,
  maxHp: number,
  maxMp: number,
  critDmgBonus: number,
): CombatantStats {
  return {
    maxHp,
    maxMp,
    speed: primaryStats.agility ?? 0,
    physAttack: primaryStats.strength ?? 0,
    magAttack: primaryStats.perception ?? 0,
    physDefense: primaryStats.guard ?? 0,
    magDefense: primaryStats.resistance ?? 0,
    critRate: 0,
    critDmg: BASE_CRIT_DMG + critDmgBonus,
  };
}

function extractRecoveryElixirs(inventorySlots: Array<InventoryStackItem | null>): BattleElixir[] {
  const result: BattleElixir[] = [];
  for (const slot of inventorySlots) {
    if (!slot) continue;
    if ("itemType" in slot && slot.itemType === "丹药" && "effectType" in slot
      && (slot.effectType === "恢复血量" || slot.effectType === "恢复法力")) {
      const el = slot as ElixirItemDefinition;
      result.push({
        name: el.name,
        desc: el.desc ?? "",
        effectType: el.effectType === "恢复血量" ? "healHp" : "healMp",
        value: el.effects?.value ?? 0,
        isPercent: el.effects?.isPercent ?? false,
        count: el.count,
      });
    }
  }
  return result;
}

/** 从储物袋提取可在战斗中使用的毒药。 */
function extractBattlePoisons(inventorySlots: Array<InventoryStackItem | null>): BattlePoison[] {
  const result: BattlePoison[] = [];
  for (const slot of inventorySlots) {
    if (!slot) continue;
    if ("itemType" in slot && slot.itemType === "毒药") {
      const p = slot as PoisonItemDefinition;
      result.push({
        name: p.name,
        desc: p.desc,
        kind: p.kind,
        value: p.value,
        modifierType: p.modifierType,
        duration: p.duration,
        count: p.count,
      });
    }
  }
  return result;
}

/** 汇总已装备法宝的淬毒涂层。 */
function extractCoatings(equippedSlots: EquippedSlotsState): BattleCoating[] {
  const out: BattleCoating[] = [];
  for (const tr of equippedSlots) {
    const c = tr?.function && "coating" in tr.function ? tr.function.coating : undefined;
    if (c) out.push({ name: c.name, tickPercent: c.tickPercent, duration: c.duration });
  }
  return out;
}

function createProtagonistCombatant(): BattleCombatant | null {
  const p = protagonist.value;
  if (!p) return null;

  const primaryStats = p.getPrimaryStats();
  const getStat = (key: string) => (primaryStats as Record<string, number>)[key] ?? 0;
  const linggenBonus = computeLinggenCombatBonuses(p.linggen, p.realm.major);
  const skills = buildBattleSkills(p.gongfaSlots, getStat, linggenBonus.cooldownReduce);
  const elixirs = extractRecoveryElixirs(p.inventorySlots);
  const passiveEffects: BattleEffect[] = [
    ...extractPassiveEffects(p.gongfaSlots, getStat, generateId("ally", 0)),
    ...extractTreasurePassiveEffects(p.equippedSlots, generateId("ally", 0)),
  ];

  return {
    id: generateId("ally", 0),
    name: p.displayName,
    team: "ally",
    isProtagonist: true,
    isPlayerControlled: true,

    stats: buildCombatantBaseStats(primaryStats, p.maxHp, p.maxMp, linggenBonus.critDmgBonus),

    hp: p.currentHp,
    mp: p.currentMp,
    shield: 0,
    actionGauge: 0,
    isDead: false,
    isFleeing: false,

    skills,
    cooldowns: new Array(Math.max(GONGFA_SLOT_COUNT, skills.length)).fill(0),
    elixirs,
    poisons: extractBattlePoisons(p.inventorySlots),
    coatings: extractCoatings(p.equippedSlots),

    effects: passiveEffects,
    linggenHealMult: linggenBonus.healMult,
    linggenShieldMult: linggenBonus.shieldMult,
    realm: { ...p.realm },
    avatarUrl: p.avatarUrl,
  };
}

function createNpcCombatant(
  npc: Npc,
  team: "ally" | "enemy",
  index: number,
  enemyStatMult = 1,
): BattleCombatant {
  const primaryStats = npc.getPrimaryStats();
  const getStat = (key: string) => (primaryStats as Record<string, number>)[key] ?? 0;
  const linggenBonus = computeLinggenCombatBonuses(npc.linggen, npc.realm.major);
  const skills = buildBattleSkills(npc.gongfaSlots, getStat, linggenBonus.cooldownReduce);
  const elixirs = extractRecoveryElixirs(npc.inventorySlots);
  const id = generateId(team, index);
  const passiveEffects: BattleEffect[] = [
    ...extractPassiveEffects(npc.gongfaSlots, getStat, id),
    ...extractTreasurePassiveEffects(npc.equippedSlots, id),
  ];

  // 困难模式：敌方全主属性 ×1.5（攻防血速同步放大，含当前 HP/MP 以保证满血开战）。
  const m = team === "enemy" ? enemyStatMult : 1;
  const scale = (v: number): number => Math.round(v * m);

  const base = buildCombatantBaseStats(primaryStats, npc.maxHp, npc.maxMp, linggenBonus.critDmgBonus);

  return {
    id,
    name: npc.displayName,
    team,
    isProtagonist: false,
    isPlayerControlled: false,

    stats: {
      ...base,
      maxHp: scale(base.maxHp),
      maxMp: scale(base.maxMp),
      speed: scale(base.speed),
      physAttack: scale(base.physAttack),
      magAttack: scale(base.magAttack),
      physDefense: scale(base.physDefense),
      magDefense: scale(base.magDefense),
    },

    hp: scale(npc.currentHp),
    mp: scale(npc.currentMp),
    shield: 0,
    actionGauge: 0,
    isDead: false,
    isFleeing: false,

    skills,
    cooldowns: new Array(Math.max(GONGFA_SLOT_COUNT, skills.length)).fill(0),
    elixirs,
    // NPC 不使用毒药（制毒是主角技艺）。
    poisons: [],
    coatings: extractCoatings(npc.equippedSlots),

    effects: passiveEffects,
    linggenHealMult: linggenBonus.healMult,
    linggenShieldMult: linggenBonus.shieldMult,
    sourceNpcName: npc.displayName,
    realm: { ...npc.realm },
    powerTier: npc.powerTier,
    identity: npc.identity,
    avatarUrl: npc.avatarUrl,
  };
}

export function createBattleCombatants(
  triggerEntry: BattleTriggerEntry,
  opts?: { enemyStatMult?: number },
): {
  allies: BattleCombatant[];
  enemies: BattleCombatant[];
} {
  const enemyStatMult = opts?.enemyStatMult ?? 1;
  const allies: BattleCombatant[] = [];
  const enemies: BattleCombatant[] = [];

  const protagonistCombatant = createProtagonistCombatant();
  if (protagonistCombatant) {
    allies.push(protagonistCombatant);
  }

  let allyIndex = 1;
  for (const ally of triggerEntry.allies) {
    if (ally.roleHint === "主角") continue;
    const npc = npcStore.getNpc(ally.displayName);
    if (!npc || npc.isDead) {
      gameLog.warn(`[initBattle] 友方NPC "${ally.displayName}" 未在npcStore中找到或已死亡`);
      continue;
    }
    if (allies.length >= 5) break;
    allies.push(createNpcCombatant(npc, "ally", allyIndex));
    allyIndex++;
  }

  let enemyIndex = 0;
  for (const enemy of triggerEntry.enemies) {
    const npc = npcStore.getNpc(enemy.displayName);
    if (!npc || npc.isDead) {
      gameLog.warn(`[initBattle] 敌方NPC "${enemy.displayName}" 未在npcStore中找到或已死亡`);
      continue;
    }
    if (enemies.length >= 5) break;
    enemies.push(createNpcCombatant(npc, "enemy", enemyIndex, enemyStatMult));
    enemyIndex++;
  }

  return { allies, enemies };
}
