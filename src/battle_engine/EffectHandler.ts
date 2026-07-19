import type {
  SkillEffect,
  SummonEffectPayload,
  BattleCombatant,
  BattleLogEntry,
  BattleEffect,
  BattleEngineLike,
  ActionContext,
  DamageType,
  DamageResult,
  ModifierType,
  CcType,
  StatusType,
  SummonTrigger,
} from "./types";
import { generateId } from "./formulas";
import { GAUGE_MAX, NORMAL_ATTACK_COST, BATTLE_DEBUG } from "./constants";

const MODIFIER_LABELS: Record<string, string> = {
  damageDealt: "攻击增伤",
  physDamageDealt: "物理增伤",
  magDamageDealt: "法术增伤",
  damageTaken: "受伤增加",
  physDamageTaken: "物理减伤",
  magDamageTaken: "法术减伤",
  healReceived: "受到治疗",
  hpRecover: "血量恢复",
  mpRecover: "法力恢复",
  speed: "速度",
  critRate: "暴击率",
  critDmg: "暴击伤害",
  dodgeRate: "闪避率",
  lifesteal: "吸血",
  defensePenetration: "穿透",
  physDefensePenetration: "破甲",
  magDefensePenetration: "破法",
  normalAttackHpRatio: "气血附加",
  normalAttackDefRatio: "护体附加",
  normalAttackResRatio: "灵御附加",
  healOverflowToShield: "溢出转护盾",
};

const CC_LABELS: Record<string, string> = {
  freeze: "冰冻",
  stun: "眩晕",
  fear: "恐惧",
  confusion: "混乱",
  silence: "沉默",
  taunt: "嘲讽",
};

const STATUS_LABELS: Record<string, string> = {
  poison: "中毒",
  burn: "灼烧",
  bleed: "流血",
  hpRegen: "生命恢复",
  mpDrain: "法力流失",
};

function modifierLabel(type: string): string {
  return MODIFIER_LABELS[type] ?? type;
}
function ccLabel(type: string): string {
  return CC_LABELS[type] ?? type;
}
function statusLabel(type: string): string {
  return STATUS_LABELS[type] ?? type;
}

function log(
  turn: number, actorName: string, action: string, type: BattleLogEntry["type"],
  narrative: string, team?: "ally" | "enemy", targetName?: string, value?: number,
): BattleLogEntry {
  return { turn, actorName, action, type, narrative, team, targetName, value };
}

export function emitDamageTrace(
  turn: number,
  actorName: string,
  team: "ally" | "enemy",
  trace?: string[],
): BattleLogEntry[] {
  if (!BATTLE_DEBUG || !trace || trace.length === 0) return [];
  return trace.map(line => log(turn, actorName, "伤害计算", "debug", line, team));
}

function buildDamageEntries(
  turn: number,
  actorName: string,
  targetName: string,
  result: DamageResult,
  damageLabel: string,
  team: "ally" | "enemy",
  extraText?: string,
  sourceName?: string,
): BattleLogEntry[] {
  const entries: BattleLogEntry[] = [];

  entries.push(...emitDamageTrace(turn, actorName, team, result.trace));

  const prefix = sourceName ? `使用${sourceName}` : "";
  const label = result.isCrit ? `暴击${damageLabel}` : damageLabel;

  if (result.dodged) {
    entries.push(log(turn, actorName, "攻击", "miss",
      `${targetName}闪避了${actorName}的${sourceName || "攻击"}`, team, targetName));
    return entries;
  }

  if (result.hpLost === 0 && result.shieldAbsorbed > 0) {
    entries.push(log(turn, actorName, "攻击", "shield",
      `${actorName}${prefix}对${targetName}的攻击被护盾完全抵挡（吸收${result.shieldAbsorbed}点）`,
      team, targetName, result.shieldAbsorbed));
  } else {
    const shieldText = result.shieldAbsorbed > 0
      ? `（护盾吸收${result.shieldAbsorbed}点）`
      : "";
    const suffix = extraText ? extraText : "";
    entries.push(log(turn, actorName, sourceName || "攻击", result.isCrit ? "crit" : "damage",
      `${actorName}${prefix}对${targetName}造成${result.hpLost}点${label}${shieldText}${suffix}`,
      team, targetName, result.hpLost));
  }

  if (result.deathWardTriggered) {
    entries.push(log(turn, targetName, "免死护盾", "buff",
      `${targetName}触发免死护盾，保留1点生命！`));
  }

  if (result.killed) {
    entries.push(log(turn, targetName, "阵亡", "death",
      `${targetName}倒下了！`));
  }

  return entries;
}

export class EffectHandler {

  executeEffects(
    effects: readonly SkillEffect[],
    ctx: ActionContext,
    engine: BattleEngineLike,
    sourceName?: string,
  ): BattleLogEntry[] {
    const entries: BattleLogEntry[] = [];
    for (const eff of effects) {
      entries.push(...this.executeOne(eff, ctx, engine, sourceName));
    }
    return entries;
  }

  executeSummonEffect(
    payload: SummonEffectPayload,
    source: BattleCombatant,
    stacks: number,
    actionCount: number,
    allies: BattleCombatant[],
    enemies: BattleCombatant[],
    engine: BattleEngineLike,
  ): BattleLogEntry[] {
    const entries: BattleLogEntry[] = [];
    for (let s = 0; s < stacks; s++) {
      switch (payload.type) {
        case "dealDamage": {
          const targets = enemies.filter(e => !e.isDead);
          if (targets.length === 0) break;
          const target = targets[Math.floor(Math.random() * targets.length)];
          const result = engine.damagePipeline.execute(
            { source, target, rawDamage: payload.value, damageType: payload.damageType, isCrit: false },
            actionCount, allies, enemies,
          );
          entries.push(...buildDamageEntries(actionCount, source.name, target.name, result, "召唤物攻击", source.team));
          break;
        }
        case "heal": {
          engine.applyHeal(source, payload.value);
          break;
        }
        case "healMp": {
          engine.applyMpChange(source, payload.value);
          break;
        }
        case "applyModifier": {
          engine.effectManager.addEffect(source, {
            id: generateId(), name: "召唤物增益", sourceId: source.id,
            category: "modifier", remainingDuration: payload.duration ?? 2,
            stacks: 1, maxStacks: 10,
            modifierType: payload.modifierType, modifierValue: payload.value,
          });
          entries.push(log(actionCount, source.name, "召唤物增益", "buff",
            `${source.name}获得召唤物增益效果`, source.team));
          break;
        }
        case "applyStatus": {
          const targets = enemies.filter(e => !e.isDead);
          if (targets.length === 0) break;
          const target = targets[Math.floor(Math.random() * targets.length)];
          const sLabel = statusLabel(payload.statusType);
          engine.effectManager.addEffect(target, {
            id: generateId(), name: `召唤物${sLabel}`, sourceId: source.id,
            category: "dot", remainingDuration: payload.duration ?? 3,
            stacks: 1, maxStacks: payload.maxStacks ?? 5,
            tickValue: payload.tickValue, tickIsPercent: payload.isPercent,
            tickResource: "hp", statusType: payload.statusType,
          });
          entries.push(log(actionCount, source.name, `召唤物施加${sLabel}`, "debuff",
            `召唤物对${target.name}施加了${sLabel}`, source.team, target.name));
          break;
        }
      }
    }
    return entries;
  }

  private executeOne(eff: SkillEffect, ctx: ActionContext, engine: BattleEngineLike, sourceName?: string): BattleLogEntry[] {
    const t = ctx.turn;
    switch (eff.type) {
      case "dealDamage": return this.doDamage(eff.damageType, eff.value, ctx, engine, sourceName);
      case "dealDamageExecute": return this.doDamageExecute(eff, ctx, engine, sourceName);
      case "dealDamagePierce": return this.doDamagePierce(eff.value, ctx, engine, sourceName);
      case "dealDamageBySummon": return this.doDamageBySummon(eff, ctx, engine, sourceName);
      case "consumePoisonDamage": return this.doConsumePoisonDamage(ctx, engine, sourceName);
      case "sacrificeHp": return this.doSacrificeHp(eff.percent, ctx);
      case "heal": return this.doHeal(eff.value, ctx, engine);
      case "healMp": return this.doHealMp(eff.value, ctx, engine);
      case "lifesteal": return this.doLifesteal(eff, ctx, engine, sourceName);
      case "applyModifier": return this.doApplyModifier(eff, ctx, engine);
      case "applyCc": return this.doApplyCc(eff, ctx, engine);
      case "applyStatus": return this.doApplyStatus(eff, ctx, engine);
      case "summon": return this.doSummon(eff, ctx, engine);
      case "cleanse": return this.doCleanse(ctx, engine);
      case "dispel": return this.doDispel(ctx, engine);
      case "revive": return this.doRevive(eff.hpPercent, ctx, engine);
      case "deathWard": return this.doDeathWard(eff.duration, ctx, engine);
      case "extraAction": return this.doExtraAction(eff.chance, ctx, engine);
      case "counter": return this.doCounter(eff.damage, eff.duration, ctx, engine);
      case "reflect": return this.doReflect(eff.percent, eff.duration, ctx, engine);
      case "damageShare": return this.doDamageShare(eff.percent, eff.duration, ctx, engine);
      case "gaugeManipulate": return this.doGaugeManipulate(eff.value, ctx);
      case "shield": return this.doShield(eff.value, ctx, engine);
      case "stealth": return this.doStealth(eff.duration, ctx, engine);
    }
  }

  private doDamage(damageType: DamageType, value: number, ctx: ActionContext, engine: BattleEngineLike, sourceName?: string): BattleLogEntry[] {
    if (!ctx.target || ctx.target.isDead) return [];
    const result = engine.damagePipeline.execute(
      { source: ctx.actor, target: ctx.target, rawDamage: value, damageType, isCrit: false },
      ctx.turn, ctx.allies, ctx.enemies,
    );
    const entries = buildDamageEntries(ctx.turn, ctx.actor.name, ctx.target.name, result, "伤害", ctx.actor.team, undefined, sourceName);
    this.addSecondaryLogs(result, ctx, entries);
    return entries;
  }

  private doDamageExecute(eff: SkillEffect & { type: "dealDamageExecute" }, ctx: ActionContext, engine: BattleEngineLike, sourceName?: string): BattleLogEntry[] {
    if (!ctx.target || ctx.target.isDead) return [];
    let value = eff.value;
    const hpRatio = ctx.target.hp / ctx.target.stats.maxHp;
    let executed = false;
    if (hpRatio < eff.threshold) {
      value = Math.round(value * (1 + eff.bonusPercent / 100));
      executed = true;
    }
    const result = engine.damagePipeline.execute(
      { source: ctx.actor, target: ctx.target, rawDamage: value, damageType: eff.damageType, isCrit: false },
      ctx.turn, ctx.allies, ctx.enemies,
    );
    const extraText = executed ? "（目标低血量，伤害提升！）" : undefined;
    const entries = buildDamageEntries(ctx.turn, ctx.actor.name, ctx.target.name, result, "斩杀伤害", ctx.actor.team, extraText, sourceName);
    this.addSecondaryLogs(result, ctx, entries);
    return entries;
  }

  private doDamagePierce(value: number, ctx: ActionContext, engine: BattleEngineLike, sourceName?: string): BattleLogEntry[] {
    if (!ctx.target || ctx.target.isDead) return [];
    const result = engine.damagePipeline.execute(
      { source: ctx.actor, target: ctx.target, rawDamage: value, damageType: "true", isCrit: false },
      ctx.turn, ctx.allies, ctx.enemies,
    );
    const entries = buildDamageEntries(ctx.turn, ctx.actor.name, ctx.target.name, result, "穿透伤害", ctx.actor.team, undefined, sourceName);
    this.addSecondaryLogs(result, ctx, entries);
    return entries;
  }

  private doDamageBySummon(eff: SkillEffect & { type: "dealDamageBySummon" }, ctx: ActionContext, engine: BattleEngineLike, sourceName?: string): BattleLogEntry[] {
    if (!ctx.target || ctx.target.isDead) return [];

    const summon = ctx.actor.effects.find(e => e.category === "summon" && e.name === eff.summonName);
    const stacks = summon?.stacks ?? 0;

    if (stacks <= 0) {
      return [log(ctx.turn, ctx.actor.name, sourceName ?? "攻击", "info",
        `${ctx.actor.name}没有${eff.summonName}，未能造成伤害`, ctx.actor.team)];
    }

    const totalDamage = Math.round(eff.value * stacks);
    const result = engine.damagePipeline.execute(
      { source: ctx.actor, target: ctx.target, rawDamage: totalDamage, damageType: eff.damageType, isCrit: false },
      ctx.turn, ctx.allies, ctx.enemies,
    );
    const extraText = `（${stacks}柄${eff.summonName}）`;
    const entries = buildDamageEntries(ctx.turn, ctx.actor.name, ctx.target.name, result, "飞剑伤害", ctx.actor.team, extraText, sourceName);
    this.addSecondaryLogs(result, ctx, entries);
    return entries;
  }

  private doConsumePoisonDamage(ctx: ActionContext, engine: BattleEngineLike, sourceName?: string): BattleLogEntry[] {
    if (!ctx.target || ctx.target.isDead) return [];

    const poison = ctx.target.effects.find(e => e.category === "dot" && e.statusType === "poison");

    if (!poison || poison.stacks <= 0) {
      return [log(ctx.turn, ctx.actor.name, sourceName ?? "引爆中毒", "info",
        `${ctx.target.name}身上没有中毒效果`, ctx.actor.team, ctx.target.name)];
    }

    const tickValue = poison.tickValue ?? 0;
    const stacks = poison.stacks;
    const remaining = Math.max(0, poison.remainingDuration);
    const maxHp = ctx.target.stats.maxHp;

    let totalDamage: number;
    if (poison.tickIsPercent) {
      totalDamage = Math.round(maxHp * tickValue / 100 * stacks * remaining);
    } else {
      totalDamage = Math.round(tickValue * stacks * remaining);
    }

    const poisonName = poison.name;
    const idx = ctx.target.effects.indexOf(poison);
    if (idx >= 0) ctx.target.effects.splice(idx, 1);

    if (totalDamage <= 0) {
      return [log(ctx.turn, ctx.actor.name, sourceName ?? "引爆中毒", "info",
        `${ctx.actor.name}引爆了${ctx.target.name}身上的${poisonName}，但已无剩余伤害`, ctx.actor.team, ctx.target.name)];
    }

    const result = engine.damagePipeline.execute(
      { source: ctx.actor, target: ctx.target, rawDamage: totalDamage, damageType: "true", isCrit: false },
      ctx.turn, ctx.allies, ctx.enemies,
    );
    const extraText = `（消耗${stacks}层${poisonName}）`;
    const entries = buildDamageEntries(ctx.turn, ctx.actor.name, ctx.target.name, result, "毒爆伤害", ctx.actor.team, extraText, sourceName);
    this.addSecondaryLogs(result, ctx, entries);
    return entries;
  }

  private doSacrificeHp(percent: number, ctx: ActionContext): BattleLogEntry[] {
    const hpCost = Math.round(ctx.actor.stats.maxHp * percent / 100);
    const actualCost = Math.min(ctx.actor.hp - 1, hpCost);
    if (actualCost <= 0) return [];
    ctx.actor.hp -= actualCost;
    return [log(ctx.turn, ctx.actor.name, "祭血", "info",
      `${ctx.actor.name}消耗${actualCost}点生命祭血`, ctx.actor.team, undefined, actualCost)];
  }

  private doHeal(value: number, ctx: ActionContext, engine: BattleEngineLike): BattleLogEntry[] {
    const target = ctx.target ?? ctx.actor;
    const healMult = 1 + engine.effectManager.getModifierTotal(target, "healReceived") / 100;
    const healed = engine.applyHeal(target, Math.round(value * healMult));
    if (healed > 0) {
      return [log(ctx.turn, ctx.actor.name, "治疗", "heal",
        `${target.name}恢复${healed}点生命`, target.team, target.name, healed)];
    }
    return [];
  }

  private doHealMp(value: number, ctx: ActionContext, engine: BattleEngineLike): BattleLogEntry[] {
    const target = ctx.target ?? ctx.actor;
    const restored = engine.applyMpChange(target, value);
    if (restored > 0) {
      return [log(ctx.turn, ctx.actor.name, "恢复法力", "heal",
        `${target.name}恢复${restored}点法力`, target.team, target.name, restored)];
    }
    return [];
  }

  private doLifesteal(eff: SkillEffect & { type: "lifesteal" }, ctx: ActionContext, engine: BattleEngineLike, sourceName?: string): BattleLogEntry[] {
    if (!ctx.target || ctx.target.isDead) return [];
    const entries: BattleLogEntry[] = [];
    const baseAttack = eff.damageType === "magical"
      ? ctx.actor.stats.magAttack
      : ctx.actor.stats.physAttack;
    const dmgValue = Math.max(1, Math.round(baseAttack * eff.damagePercent / 100));
    const result = engine.damagePipeline.execute(
      { source: ctx.actor, target: ctx.target, rawDamage: dmgValue, damageType: eff.damageType, isCrit: false },
      ctx.turn, ctx.allies, ctx.enemies,
    );
    const prefix = sourceName ? `使用${sourceName}` : "";
    const dmgEntries = buildDamageEntries(ctx.turn, ctx.actor.name, ctx.target.name, result, "吸血伤害", ctx.actor.team, undefined, sourceName);
    for (const e of dmgEntries) {
      e.action = "生命偷取";
      if (e.type === "damage" || e.type === "crit") {
        e.narrative = `${ctx.actor.name}${prefix}吸取${ctx.target.name}${result.hpLost}点生命`;
      }
    }
    entries.push(...dmgEntries);
    engine.applyHeal(ctx.actor, result.hpLost);
    if (result.hpLost > 0) {
      entries.push(log(ctx.turn, ctx.actor.name, "生命偷取", "heal",
        `${ctx.actor.name}恢复${result.hpLost}点生命`, ctx.actor.team, ctx.actor.name, result.hpLost));
    }
    this.addSecondaryLogs(result, ctx, entries);
    return entries;
  }

  private doApplyModifier(eff: SkillEffect & { type: "applyModifier" }, ctx: ActionContext, engine: BattleEngineLike): BattleLogEntry[] {
    const target = eff.targetSelf ? ctx.actor : (ctx.target ?? ctx.actor);
    const isPositive = eff.value > 0;
    const label = modifierLabel(eff.modifierType);
    const sign = isPositive ? "+" : "-";
    engine.effectManager.addEffect(target, {
      id: generateId(), name: `${label}${sign}${Math.abs(eff.value)}%`, sourceId: ctx.actor.id,
      category: "modifier", remainingDuration: eff.duration,
      stacks: 1, maxStacks: eff.maxStacks,
      modifierType: eff.modifierType, modifierValue: eff.value,
    });
    const pctText = `${Math.abs(eff.value)}%`;
    const verb = isPositive ? "增加" : "降低";
    const isSelfBuff = ctx.actor === target && isPositive;
    const narrative = isSelfBuff
      ? `${ctx.actor.name}获得增益：${verb}${label} ${pctText}`
      : `${ctx.actor.name}对${target.name}施加${isPositive ? "增益" : "减益"}：${verb}${label} ${pctText}`;
    return [log(ctx.turn, ctx.actor.name, isPositive ? "增益" : "减益", isPositive ? "buff" : "debuff",
      narrative, ctx.actor.team, target.name)];
  }

  private doApplyCc(eff: SkillEffect & { type: "applyCc" }, ctx: ActionContext, engine: BattleEngineLike): BattleLogEntry[] {
    if (!ctx.target) return [];
    const label = ccLabel(eff.ccType);
    const hit = Math.random() < eff.chance;
    if (!hit) {
      return [log(ctx.turn, ctx.actor.name, label, "info",
        `${ctx.actor.name}试图对${ctx.target.name}施加${label}，但被抵抗了`, ctx.actor.team, ctx.target.name)];
    }

    if (eff.ccType === "freeze") {
      ctx.target.actionGauge = 0;
      return [log(ctx.turn, ctx.actor.name, "冰冻", "cc",
        `${ctx.actor.name}冰冻了${ctx.target.name}，行动条清零！`, ctx.actor.team, ctx.target.name)];
    }

    engine.effectManager.addEffect(ctx.target, {
      id: generateId(), name: label, sourceId: ctx.actor.id,
      category: "cc", remainingDuration: eff.duration,
      stacks: 1, maxStacks: 1,
      ccType: eff.ccType,
    });

    return [log(ctx.turn, ctx.actor.name, label, "cc",
      `${ctx.actor.name}对${ctx.target.name}施加了${label}`, ctx.actor.team, ctx.target.name)];
  }

  private doApplyStatus(eff: SkillEffect & { type: "applyStatus" }, ctx: ActionContext, engine: BattleEngineLike): BattleLogEntry[] {
    if (!ctx.target) return [];
    const label = statusLabel(eff.statusType);
    const isDoT = eff.statusType === "poison" || eff.statusType === "burn" || eff.statusType === "bleed" || eff.statusType === "mpDrain";
    engine.effectManager.addEffect(ctx.target, {
      id: generateId(), name: label, sourceId: ctx.actor.id,
      category: isDoT ? "dot" : "hot", remainingDuration: eff.duration,
      stacks: 1, maxStacks: eff.maxStacks,
      tickValue: eff.tickValue, tickIsPercent: eff.isPercent,
      tickResource: eff.statusType === "mpDrain" ? "mp" : "hp",
      statusType: eff.statusType,
    });
    return [log(ctx.turn, ctx.actor.name, `施加${label}`, isDoT ? "debuff" : "buff",
      `${ctx.actor.name}对${ctx.target.name}施加了${label}`, ctx.actor.team, ctx.target.name)];
  }

  private doSummon(eff: SkillEffect & { type: "summon" }, ctx: ActionContext, engine: BattleEngineLike): BattleLogEntry[] {
    engine.effectManager.addEffect(ctx.actor, {
      id: generateId(), name: eff.name, sourceId: ctx.actor.id,
      category: "summon", remainingDuration: eff.duration,
      stacks: eff.stacksPerCast ?? 1, maxStacks: Infinity,
      summonTrigger: eff.trigger, summonEffect: eff.effect,
    });
    return [log(ctx.turn, ctx.actor.name, "召唤", "summon",
      `${ctx.actor.name}召唤了${eff.name}`, ctx.actor.team)];
  }

  private doCleanse(ctx: ActionContext, engine: BattleEngineLike): BattleLogEntry[] {
    const target = ctx.target ?? ctx.actor;
    const removed = engine.effectManager.removeEffects(target, e => e.category === "cc" || e.category === "dot");
    if (removed > 0) {
      return [log(ctx.turn, ctx.actor.name, "净化", "buff",
        `${ctx.actor.name}净化了${target.name}的${removed}个负面效果`, ctx.actor.team, target.name)];
    }
    return [log(ctx.turn, ctx.actor.name, "净化", "info",
      `${ctx.actor.name}尝试净化，但没有可移除的效果`, ctx.actor.team)];
  }

  private doDispel(ctx: ActionContext, engine: BattleEngineLike): BattleLogEntry[] {
    if (!ctx.target) return [];
    const removed = engine.effectManager.removeEffects(ctx.target, e => e.category === "modifier" || e.category === "hot");
    if (removed > 0) {
      return [log(ctx.turn, ctx.actor.name, "驱散", "debuff",
        `${ctx.actor.name}驱散了${ctx.target.name}的${removed}个增益效果`, ctx.actor.team, ctx.target.name)];
    }
    return [log(ctx.turn, ctx.actor.name, "驱散", "info",
      `${ctx.actor.name}尝试驱散，但没有可移除的效果`, ctx.actor.team)];
  }

  private doRevive(hpPercent: number, ctx: ActionContext, engine: BattleEngineLike): BattleLogEntry[] {
    const target = ctx.target ?? ctx.actor;
    if (!target.isDead) {
      return [log(ctx.turn, ctx.actor.name, "复活", "info",
        `${target.name}未阵亡，无需复活`, ctx.actor.team)];
    }
    target.isDead = false;
    target.hp = Math.min(target.stats.maxHp, Math.round(target.stats.maxHp * hpPercent / 100));
    return [log(ctx.turn, ctx.actor.name, "复活", "heal",
      `${target.name}被复活，恢复${target.hp}点生命`, ctx.actor.team, target.name, target.hp)];
  }

  private doDeathWard(duration: number, ctx: ActionContext, engine: BattleEngineLike): BattleLogEntry[] {
    engine.effectManager.addEffect(ctx.actor, {
      id: generateId(), name: "免死护盾", sourceId: ctx.actor.id,
      category: "special", remainingDuration: duration,
      stacks: 1, maxStacks: 1,
      specialType: "deathWard",
    });
    return [log(ctx.turn, ctx.actor.name, "免死护盾", "buff",
      `${ctx.actor.name}获得免死护盾`, ctx.actor.team)];
  }

  private doExtraAction(chance: number, ctx: ActionContext, engine: BattleEngineLike): BattleLogEntry[] {
    if (Math.random() < chance) {
      ctx.actor.actionGauge += GAUGE_MAX - NORMAL_ATTACK_COST;
      return [log(ctx.turn, ctx.actor.name, "额外行动", "buff",
        `${ctx.actor.name}获得额外行动！`, ctx.actor.team)];
    }
    return [log(ctx.turn, ctx.actor.name, "额外行动", "info",
      `${ctx.actor.name}未能触发额外行动`, ctx.actor.team)];
  }

  private doCounter(damage: number, duration: number, ctx: ActionContext, engine: BattleEngineLike): BattleLogEntry[] {
    engine.effectManager.addEffect(ctx.actor, {
      id: generateId(), name: "反击", sourceId: ctx.actor.id,
      category: "special", remainingDuration: duration,
      stacks: 1, maxStacks: 1,
      specialType: "counter", specialValue: damage,
    });
    return [log(ctx.turn, ctx.actor.name, "反击", "buff",
      `${ctx.actor.name}进入反击姿态`, ctx.actor.team)];
  }

  private doReflect(percent: number, duration: number, ctx: ActionContext, engine: BattleEngineLike): BattleLogEntry[] {
    engine.effectManager.addEffect(ctx.actor, {
      id: generateId(), name: "反弹", sourceId: ctx.actor.id,
      category: "special", remainingDuration: duration,
      stacks: 1, maxStacks: 1,
      specialType: "reflect", specialValue: percent,
    });
    return [log(ctx.turn, ctx.actor.name, "反弹", "buff",
      `${ctx.actor.name}开启伤害反弹${percent}%`, ctx.actor.team)];
  }

  private doDamageShare(percent: number, duration: number, ctx: ActionContext, engine: BattleEngineLike): BattleLogEntry[] {
    engine.effectManager.addEffect(ctx.actor, {
      id: generateId(), name: "伤害分摊", sourceId: ctx.actor.id,
      category: "special", remainingDuration: duration,
      stacks: 1, maxStacks: 1,
      specialType: "damageShare", specialValue: percent,
    });
    return [log(ctx.turn, ctx.actor.name, "伤害分摊", "buff",
      `${ctx.actor.name}开启伤害分摊${percent}%`, ctx.actor.team)];
  }

  private doGaugeManipulate(value: number, ctx: ActionContext): BattleLogEntry[] {
    if (!ctx.target) return [];
    ctx.target.actionGauge = Math.max(0, Math.min(GAUGE_MAX * 2, ctx.target.actionGauge + value));
    const action = value > 0 ? "行动条增加" : "行动条减少";
    return [log(ctx.turn, ctx.actor.name, action, "gauge",
      `${ctx.actor.name}对${ctx.target.name}的${action}了${Math.abs(value)}点`, ctx.actor.team, ctx.target.name)];
  }

  private doShield(value: number, ctx: ActionContext, engine: BattleEngineLike): BattleLogEntry[] {
    const target = ctx.target ?? ctx.actor;
    const mult = target.linggenShieldMult ?? 1;
    const amount = Math.round(value * mult);
    target.shield += amount;
    return [log(ctx.turn, ctx.actor.name, "护盾", "shield",
      `${ctx.actor.name}为${target.name}增加${amount}点护盾`, ctx.actor.team, target.name, amount)];
  }

  private doStealth(duration: number, ctx: ActionContext, engine: BattleEngineLike): BattleLogEntry[] {
    engine.effectManager.addEffect(ctx.actor, {
      id: generateId(), name: "隐匿", sourceId: ctx.actor.id,
      category: "special", remainingDuration: duration,
      stacks: 1, maxStacks: 1,
      specialType: "stealth",
    });
    return [log(ctx.turn, ctx.actor.name, "隐匿", "buff",
      `${ctx.actor.name}进入隐匿状态`, ctx.actor.team)];
  }

  private addSecondaryLogs(result: import("./types").DamageResult, ctx: ActionContext, entries: BattleLogEntry[]): void {
    if (result.lifestealHeal > 0) {
      const mult = ctx.actor.linggenHealMult ?? 1;
      const boosted = Math.round(result.lifestealHeal * mult);
      const healed = ctx.actor.stats.maxHp - ctx.actor.hp;
      const actual = Math.min(healed, boosted);
      if (actual > 0) {
        ctx.actor.hp += actual;
        entries.push(log(ctx.turn, ctx.actor.name, "吸血", "heal",
          `${ctx.actor.name}吸取${actual}点生命`, ctx.actor.team, ctx.actor.name, actual));
      }
    }
    if (result.reflectHpLost > 0) {
      entries.push(log(ctx.turn, ctx.target!.name, "反伤", "damage",
        `${ctx.target!.name}的反伤对${ctx.actor.name}造成${result.reflectHpLost}点伤害`, ctx.target!.team, ctx.actor.name, result.reflectHpLost));
      if (result.reflectKilled) {
        entries.push(log(ctx.turn, ctx.actor.name, "阵亡", "death", `${ctx.actor.name}被反伤击败了！`, ctx.actor.team));
      }
    }
    if (result.counterHpLost > 0) {
      entries.push(log(ctx.turn, ctx.target!.name, "反击", "damage",
        `${ctx.target!.name}的反击对${ctx.actor.name}造成${result.counterHpLost}点伤害`, ctx.target!.team, ctx.actor.name, result.counterHpLost));
      if (result.counterKilled) {
        entries.push(log(ctx.turn, ctx.actor.name, "阵亡", "death", `${ctx.actor.name}被反击击败了！`, ctx.actor.team));
      }
    }
    for (const sd of result.sharedDamages) {
      entries.push(log(ctx.turn, ctx.actor.name, "分摊伤害", "damage",
        `${sd.targetName}分摊了${sd.hpLost}点伤害`, ctx.target!.team, sd.targetName, sd.hpLost));
      if (sd.killed) {
        entries.push(log(ctx.turn, sd.targetName, "阵亡", "death", `${sd.targetName}被分摊伤害击败了！`, ctx.target!.team));
      }
    }
  }
}
