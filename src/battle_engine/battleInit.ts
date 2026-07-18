import type { BattleCombatant, BattleSkill, BattleElixir, BattleEffect, SkillEffect, DamageType, ModifierType, CcType, StatusType, SummonTrigger, BattleConsumableSkill } from "./types";
import type { BattleTriggerEntry } from "../ai_core";
import type { GongfaSlotsState, EquippedSlotsState } from "../role_core/types/playInfo";
import type { InventoryStackItem, ElixirItemDefinition } from "../role_core/types/items";
import type { Effect, EffectBundle, LayerValue } from "../role_core/types/effects";
import { atLayer, atLayerFloat, resolveEffectDesc, effectFamily } from "../role_core/types/effects";
import type { PrimaryStatKey } from "../role_core/types/playInfo";
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
  eff: Effect,
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
  eff: Effect,
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
    default:
      // 非主动战斗效果（消耗/转换）不应出现在主动技能里；兜底返回 0 伤害。
      return { type: "dealDamage", damageType: "physical", value: 0 };
  }
}

function isTargetEnemy(eff: Effect): boolean {
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

function needsTarget(eff: Effect): boolean {
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
    if (!gf || !gf.effect) continue;
    const bundle = gf.effect;
    if (bundle.type !== "主动") continue;

    const layer = gf.mastery ?? 1;
    const masteryMult = getMasteryMult(layer);
    const battleEffects = bundle.effects.filter(e => effectFamily(e) === "activeBattle");
    const effects = battleEffects.map(eff =>
      convertBattleEffectToSkillEffect(eff, getStat, masteryMult, layer),
    );

    const hasOffensive = battleEffects.some(isTargetEnemy);
    const hasNeedTarget = battleEffects.some(needsTarget);

    const getStatForDesc = (key: PrimaryStatKey) => getStat(key);
    const desc = battleEffects
      .map(e => resolveEffectDesc(e, getStatForDesc, masteryMult, layer, false))
      .join("；");

    skills.push({
      name: gf.name,
      desc,
      mpCost: atLayer(bundle.mpCost ?? 0, layer),
      actionCost: 100,
      cooldown: Math.max(0, (bundle.cooldown ?? 0) - cooldownReduce),
      needTarget: hasNeedTarget,
      targetTeam: hasOffensive ? "enemy" : "ally",
      isAoE: !!bundle.isAoE,
      effects,
    });
  }
  return skills;
}

function convertBattleEffectToInitEffect(
  eff: Effect,
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
    default:
      // 非被动战斗效果（消耗/转换）不产生战斗 BattleEffect。
      return base;
  }
}

function extractPassiveEffects(
  gongfaSlots: GongfaSlotsState,
  getStat: (key: string) => number,
  combatantId: string,
): BattleEffect[] {
  const effects: BattleEffect[] = [];

  for (const gf of gongfaSlots) {
    if (!gf || !gf.effect) continue;
    const bundle = gf.effect;
    if (bundle.type !== "被动") continue;

    const layer = gf.mastery ?? 1;
    const masteryMult = getMasteryMult(layer);
    for (const eff of bundle.effects) {
      if (effectFamily(eff) !== "passiveBattle") continue;
      const be = convertBattleEffectToInitEffect(eff, getStat, masteryMult, layer, bundle.name, combatantId);
      be.hidden = true;
      effects.push(be);
    }
  }

  return effects;
}

function extractTreasurePassiveEffects(
  equippedSlots: EquippedSlotsState,
  getStat: (key: string) => number,
  combatantId: string,
): BattleEffect[] {
  const effects: BattleEffect[] = [];

  for (const tr of equippedSlots) {
    if (!tr || !tr.effect) continue;
    for (const eff of tr.effect.effects) {
      if (effectFamily(eff) === "passiveBattle") {
        const be = convertBattleEffectToInitEffect(eff, getStat, 1.0, 1, tr.effect.name, combatantId);
        be.hidden = true;
        effects.push(be);
      } else if (eff.type === "applyModifier") {
        // 修正型被动（已统一为 applyModifier Effect）
        const rawType = eff.modifierType as string;
        const engineType = (rawType === "healReceived" ? "hpRecover" : rawType) as ModifierType;
        const val = atLayer(eff.value, 1);
        effects.push({
          id: generateEffectId(),
          name: tr.effect.name,
          sourceId: combatantId,
          category: "modifier",
          remainingDuration: 99,
          stacks: 1,
          maxStacks: 1,
          modifierType: engineType,
          modifierValue: val,
          hidden: true,
        });
      }
      // conversion / consumable 不在此处理（Character / consumeElixir 负责）
    }
  }

  return effects;
}

function extractRecoveryElixirs(inventorySlots: Array<InventoryStackItem | null>): BattleElixir[] {
  const result: BattleElixir[] = [];
  for (const slot of inventorySlots) {
    if (!slot) continue;
    if ("itemType" in slot && slot.itemType === "丹药") {
      const el = slot as ElixirItemDefinition;
      if (!el.effect) continue;
      for (const eff of el.effect.effects) {
        if (eff.type === "healHp" || eff.type === "healMp") {
          result.push({
            name: el.name,
            desc: el.desc ?? "",
            effectType: eff.type,
            value: atLayer(eff.value, 1),
            isPercent: eff.isPercent,
            count: el.count,
          });
        }
      }
    }
  }
  return result;
}

function extractConsumableSkills(
  inventorySlots: Array<InventoryStackItem | null>,
  getStat: (key: string) => number,
  combatantId: string,
): BattleConsumableSkill[] {
  const result: BattleConsumableSkill[] = [];
  for (let i = 0; i < inventorySlots.length; i++) {
    const slot = inventorySlots[i];
    if (!slot) continue;
    if (!("itemType" in slot) || (slot.itemType !== "符箓" && slot.itemType !== "阵法")) continue;
    const item = slot as unknown as ElixirItemDefinition;
    if (!item.effect || item.count <= 0) continue;

    const isFormation = slot.itemType === "阵法";
    const activeEffects = item.effect.effects.filter(e => effectFamily(e) === "activeBattle");
    if (activeEffects.length === 0) continue;

    const skillEffects: SkillEffect[] = [];
    for (const eff of activeEffects) {
      skillEffects.push(convertBattleEffectToSkillEffect(eff, getStat, 1, 1));
    }

    const hasOffensive = activeEffects.some(isTargetEnemy);
    const hasNeedTarget = activeEffects.some(needsTarget);

    const getStatForDesc = (key: PrimaryStatKey) => getStat(key);
    const desc = activeEffects
      .map(e => resolveEffectDesc(e, getStatForDesc, 1, 1, false))
      .join("；");

    const skill: BattleSkill = {
      name: item.name,
      desc,
      mpCost: 0,
      actionCost: 30, // ELIXIR_COST
      cooldown: 0,
      needTarget: hasNeedTarget,
      targetTeam: hasOffensive ? "enemy" : "ally",
      isAoE: isFormation, // 阵法默认群体；符箓单目标
      effects: skillEffects,
    };

    result.push({
      skill,
      inventorySlotIndex: i,
      remainingCount: item.count,
      itemName: item.name,
    });
  }
  return result;
}

function createProtagonistCombatant(): BattleCombatant | null {
  const p = protagonist.value;
  if (!p) return null;

  const primaryStats = p.getPrimaryStats();
  const getStat = (key: string) => (primaryStats as Record<string, number>)[key] ?? 0;
  const linggenBonus = computeLinggenCombatBonuses(p.linggen, p.realm.major);
  const skills = buildBattleSkills(p.gongfaSlots, getStat, linggenBonus.cooldownReduce);
  const elixirs = extractRecoveryElixirs(p.inventorySlots);
  const consumableSkills = extractConsumableSkills(p.inventorySlots, getStat, generateId("ally", 0));
  const passiveEffects: BattleEffect[] = [
    ...extractPassiveEffects(p.gongfaSlots, getStat, generateId("ally", 0)),
    ...extractTreasurePassiveEffects(p.equippedSlots, getStat, generateId("ally", 0)),
  ];

  return {
    id: generateId("ally", 0),
    name: p.displayName,
    team: "ally",
    isProtagonist: true,
    isPlayerControlled: true,

    stats: {
      maxHp: p.maxHp,
      maxMp: p.maxMp,
      speed: primaryStats.agility ?? 0,
      physAttack: primaryStats.strength ?? 0,
      magAttack: primaryStats.perception ?? 0,
      physDefense: primaryStats.guard ?? 0,
      magDefense: primaryStats.resistance ?? 0,
      critRate: 0,
      critDmg: BASE_CRIT_DMG + linggenBonus.critDmgBonus,
    },

    hp: p.currentHp,
    mp: p.currentMp,
    shield: 0,
    actionGauge: 0,
    isDead: false,
    isFleeing: false,

    skills,
    cooldowns: new Array(Math.max(GONGFA_SLOT_COUNT, skills.length)).fill(0),
    elixirs,
    consumableSkills,

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
  const consumableSkills = extractConsumableSkills(npc.inventorySlots, getStat, id);
  const passiveEffects: BattleEffect[] = [
    ...extractPassiveEffects(npc.gongfaSlots, getStat, id),
    ...extractTreasurePassiveEffects(npc.equippedSlots, getStat, id),
  ];

  // 困难模式：敌方全主属性 ×1.5（攻防血速同步放大，含当前 HP/MP 以保证满血开战）。
  const m = team === "enemy" ? enemyStatMult : 1;
  const scale = (v: number): number => Math.round(v * m);

  return {
    id,
    name: npc.displayName,
    team,
    isProtagonist: false,
    isPlayerControlled: false,

    stats: {
      maxHp: scale(npc.maxHp),
      maxMp: scale(npc.maxMp),
      speed: scale(primaryStats.agility ?? 0),
      physAttack: scale(primaryStats.strength ?? 0),
      magAttack: scale(primaryStats.perception ?? 0),
      physDefense: scale(primaryStats.guard ?? 0),
      magDefense: scale(primaryStats.resistance ?? 0),
      critRate: 0,
      critDmg: BASE_CRIT_DMG + linggenBonus.critDmgBonus,
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
    consumableSkills,

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
