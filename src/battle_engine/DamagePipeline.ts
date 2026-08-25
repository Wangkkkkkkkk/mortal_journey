import type {
  DamageContext,
  DamageResult,
  BattleCombatant,
  DamageType,
  ModifierType,
} from "./types";
import type { EffectManager } from "./EffectManager";
import { generateId } from "./formulas";
import { COATING_MAX_STACKS } from "../role_core/poison";
import type { EventDispatcher } from "./EventDispatcher";
import { calcDefenseReduction, checkCrit, checkDodge } from "./formulas";

const EMPTY_RESULT: DamageResult = {
  finalDamage: 0,
  shieldAbsorbed: 0,
  hpLost: 0,
  killed: false,
  dodged: false,
  deathWardTriggered: false,
  isCrit: false,
  reflectHpLost: 0,
  reflectKilled: false,
  counterHpLost: 0,
  counterKilled: false,
  lifestealHeal: 0,
  sharedDamages: [],
  trace: [],
};

const DAMAGE_TYPE_LABEL: Record<DamageType, string> = {
  physical: "物理",
  magical: "法术",
  true: "真实",
};

function formatModBreakdown(combatant: BattleCombatant, type: ModifierType): string {
  const mods = combatant.effects.filter(e => e.category === "modifier" && e.modifierType === type);
  if (mods.length === 0) return "无";
  return mods.map(e => {
    const v = (e.modifierValue ?? 0) * e.stacks;
    return `${e.name}${v >= 0 ? "+" : ""}${v}%`;
  }).join(", ");
}

export class DamagePipeline {
  constructor(
    private effectManager: EffectManager,
    private dispatcher: EventDispatcher,
  ) {}

  execute(
    ctx: DamageContext,
    actionCount: number,
    allies: BattleCombatant[],
    enemies: BattleCombatant[],
  ): DamageResult {
    const trace: string[] = [];
    const typeLabel = DAMAGE_TYPE_LABEL[ctx.damageType];
    trace.push(`[伤害计算] ${ctx.source.name} → ${ctx.target.name} (${typeLabel})`);

    this.dispatcher.emit("pre_damage", {
      event: "pre_damage", source: ctx.source, target: ctx.target, turn: actionCount, allies, enemies,
    });

    let rawDamage = ctx.rawDamage;
    trace.push(`  原始伤害: ${rawDamage}`);

    const dodgeRate = this.effectManager.getModifierTotal(ctx.target, "dodgeRate");
    trace.push(`  闪避判定: 闪避率=${dodgeRate}%${formatModBreakdown(ctx.target, "dodgeRate") !== "无" ? ` (${formatModBreakdown(ctx.target, "dodgeRate")})` : ""}`);
    if (checkDodge(dodgeRate)) {
      trace.push(`  → 闪避成功!`);
      this.dispatcher.emit("dodge", {
        event: "dodge", source: ctx.source, target: ctx.target, turn: actionCount, allies, enemies,
      });
      return { ...EMPTY_RESULT, dodged: true, trace };
    }
    trace.push(`  → 未闪避`);

    let actualCrit = ctx.isCrit;

    if (!actualCrit) {
      const critRateBase = ctx.source.stats.critRate;
      const critRateMod = this.effectManager.getModifierTotal(ctx.source, "critRate");
      const critRate = critRateBase + critRateMod;
      trace.push(`  暴击判定: 暴击率=${critRate}% (基础${critRateBase}+修正${critRateMod >= 0 ? "+" : ""}${critRateMod})`);
      actualCrit = checkCrit(Math.max(0, critRate));
    } else {
      trace.push(`  暴击判定: 强制暴击`);
    }
    if (actualCrit) {
      const critDmgBase = ctx.source.stats.critDmg;
      const critDmgMod = this.effectManager.getModifierTotal(ctx.source, "critDmg");
      const critDmg = critDmgBase + critDmgMod;
      trace.push(`  → 暴击! 倍率=${critDmg}% (基础${critDmgBase}+修正${critDmgMod >= 0 ? "+" : ""}${critDmgMod})`);
      rawDamage = Math.round(rawDamage * critDmg / 100);
      trace.push(`  暴击后伤害: ${rawDamage}`);
    } else {
      trace.push(`  → 未暴击`);
    }

    const rawDefense = ctx.damageType === "physical" ? ctx.target.stats.physDefense
      : ctx.damageType === "magical" ? ctx.target.stats.magDefense
      : 0;
    const penGeneral = this.effectManager.getModifierTotal(ctx.source, "defensePenetration");
    const penSpecific = ctx.damageType === "physical"
      ? this.effectManager.getModifierTotal(ctx.source, "physDefensePenetration")
      : ctx.damageType === "magical"
        ? this.effectManager.getModifierTotal(ctx.source, "magDefensePenetration")
        : 0;
    const penetration = penGeneral + penSpecific;
    const effectiveDefense = ctx.damageType === "true" ? 0 : Math.round(rawDefense * (1 - penetration / 100));
    let baseDamage = calcDefenseReduction(rawDamage, effectiveDefense, ctx.damageType);
    trace.push(`  防御: ${typeLabel}${rawDefense}${penetration > 0 ? `（破甲${penetration}%→有效${effectiveDefense}）` : ""} → 减防后: ${baseDamage}`);

    const damageDealtGeneral = this.effectManager.getModifierTotal(ctx.source, "damageDealt");
    const damageDealtSpecific = ctx.damageType === "physical"
      ? this.effectManager.getModifierTotal(ctx.source, "physDamageDealt")
      : ctx.damageType === "magical"
        ? this.effectManager.getModifierTotal(ctx.source, "magDamageDealt")
        : 0;
    const dealtMult = 1 + (damageDealtGeneral + damageDealtSpecific) / 100;
    trace.push(`  攻击方伤害加成: damageDealt${damageDealtGeneral >= 0 ? "+" : ""}${damageDealtGeneral}%, ${ctx.damageType === "physical" ? "physDamageDealt" : ctx.damageType === "magical" ? "magDamageDealt" : "specific"}${damageDealtSpecific >= 0 ? "+" : ""}${damageDealtSpecific}% → 倍率=${dealtMult.toFixed(4)}`);

    const damageTakenGeneral = this.effectManager.getModifierTotal(ctx.target, "damageTaken");
    const damageTakenSpecific = ctx.damageType === "physical"
      ? this.effectManager.getModifierTotal(ctx.target, "physDamageTaken")
      : ctx.damageType === "magical"
        ? this.effectManager.getModifierTotal(ctx.target, "magDamageTaken")
        : 0;
    const takenMult = 1 + (damageTakenGeneral + damageTakenSpecific) / 100;
    trace.push(`  受击方承伤修正: damageTaken${damageTakenGeneral >= 0 ? "+" : ""}${damageTakenGeneral}%, ${ctx.damageType === "physical" ? "physDamageTaken" : ctx.damageType === "magical" ? "magDamageTaken" : "specific"}${damageTakenSpecific >= 0 ? "+" : ""}${damageTakenSpecific}% → 倍率=${takenMult.toFixed(4)}`);

    let finalDamage = Math.max(1, Math.round(baseDamage * dealtMult * takenMult));
    trace.push(`  最终伤害: max(1, round(${baseDamage} × ${dealtMult.toFixed(4)} × ${takenMult.toFixed(4)})) = ${finalDamage}`);

    let remaining = finalDamage;
    let shieldAbsorbed = 0;
    if (ctx.target.shield > 0) {
      const absorbed = Math.min(ctx.target.shield, remaining);
      ctx.target.shield -= absorbed;
      remaining -= absorbed;
      shieldAbsorbed = absorbed;
      trace.push(`  护盾: 吸收${shieldAbsorbed} → 穿透${remaining}`);
    }

    const hpLost = Math.min(ctx.target.hp, remaining);
    ctx.target.hp -= hpLost;
    trace.push(`  生命损失: ${hpLost} (目标剩余HP: ${ctx.target.hp}/${ctx.target.stats.maxHp})`);

    let killed = false;
    let deathWardTriggered = false;
    if (ctx.target.hp <= 0) {
      ctx.target.hp = 0;

      this.dispatcher.emit("fatal", {
        event: "fatal", source: ctx.source, target: ctx.target, turn: actionCount, allies, enemies,
      });

      if (this.effectManager.consumeDeathWard(ctx.target)) {
        ctx.target.hp = 1;
        deathWardTriggered = true;
        trace.push(`  [免死护盾触发] 保留1点生命`);
      } else {
        killed = true;
        ctx.target.isDead = true;
        trace.push(`  [目标阵亡]`);
      }
    }

    let reflectHpLost = 0;
    let reflectKilled = false;
    let counterHpLost = 0;
    let counterKilled = false;
    const sharedDamages: DamageResult["sharedDamages"] = [];

    if (!ctx.isReflected && hpLost > 0) {
      const reflectEffects = ctx.target.effects.filter(e => e.specialType === "reflect");
      for (const refl of reflectEffects) {
        const reflDmg = Math.max(1, Math.round(finalDamage * (refl.specialValue ?? 0) / 100));
        const sourceHpLost = Math.min(ctx.source.hp, reflDmg);
        ctx.source.hp -= sourceHpLost;
        reflectHpLost += sourceHpLost;
        if (ctx.source.hp <= 0) {
          ctx.source.hp = 0;
          ctx.source.isDead = true;
          reflectKilled = true;
          break;
        }
      }

      const counterEffects = ctx.target.effects.filter(e => e.specialType === "counter");
      for (const ctr of counterEffects) {
        const ctrDmg = Math.max(1, (ctr.specialValue ?? 0) * ctr.stacks);
        const sourceHpLost = Math.min(ctx.source.hp, ctrDmg);
        ctx.source.hp -= sourceHpLost;
        counterHpLost += sourceHpLost;
        if (ctx.source.hp <= 0) {
          ctx.source.hp = 0;
          ctx.source.isDead = true;
          counterKilled = true;
          break;
        }
      }

      const targetTeamAllies = ctx.target.team === "ally" ? allies : enemies;
      const damageShareHolders = targetTeamAllies.filter(a =>
        !a.isDead && a.id !== ctx.target.id && a.effects.some(e => e.specialType === "damageShare"),
      );
      if (damageShareHolders.length > 0) {
        let totalSharePct = 0;
        const holderShares: Array<{ combatant: BattleCombatant; pct: number }> = [];
        for (const holder of damageShareHolders) {
          const shareEffect = holder.effects.find(e => e.specialType === "damageShare")!;
          const pct = shareEffect.specialValue ?? 0;
          totalSharePct += pct;
          holderShares.push({ combatant: holder, pct });
        }
        totalSharePct = Math.min(totalSharePct, 50);
        const sharedTotal = Math.round(finalDamage * totalSharePct / 100);
        const refund = Math.min(hpLost, sharedTotal);
        if (refund > 0) {
          ctx.target.hp = Math.min(ctx.target.stats.maxHp, ctx.target.hp + refund);
          if (ctx.target.hp > 0) ctx.target.isDead = false;
        }
        for (const { combatant, pct } of holderShares) {
          const share = Math.round(sharedTotal * pct / totalSharePct);
          const lost = Math.min(combatant.hp, share);
          combatant.hp -= lost;
          const holderKilled = combatant.hp <= 0;
          if (holderKilled) {
            combatant.hp = 0;
            combatant.isDead = true;
          }
          sharedDamages.push({
            targetId: combatant.id,
            targetName: combatant.name,
            hpLost: lost,
            killed: holderKilled,
          });
        }
      }
    }

    let lifestealHeal = 0;
    if (hpLost > 0) {
      const lifestealMod = this.effectManager.getModifierTotal(ctx.source, "lifesteal");
      if (lifestealMod > 0) {
        lifestealHeal = Math.round(hpLost * lifestealMod / 100);
        trace.push(`  吸血: ${lifestealMod}% → 恢复${lifestealHeal}点生命`);
      }
      // 淬毒涂层：造成实际掉血后，按已装备法宝的涂层对目标叠加一层 DoT。
      // 走 addEffect 而非直接 push，由其统一处理叠层与持续回合刷新——
      // 层数上限对齐毒修功法的 maxStacks 约定，靠反复命中累积威力。
      for (const coat of ctx.source.coatings ?? []) {
        this.effectManager.addEffect(ctx.target, {
          id: generateId(),
          name: coat.name,
          sourceId: ctx.source.id,
          category: "dot",
          remainingDuration: coat.duration,
          stacks: 1,
          maxStacks: COATING_MAX_STACKS,
          tickValue: coat.tickPercent,
          tickIsPercent: true,
          tickResource: "hp",
          statusType: "poison",
        });
        const cur = ctx.target.effects.find(
          e => e.category === "dot" && e.name === coat.name && e.sourceId === ctx.source.id,
        );
        trace.push(`  淬毒: ${coat.name} → ${cur?.stacks ?? 1}层，每层每回合最大血量${coat.tickPercent}%`);
      }
    }

    const result: DamageResult = {
      finalDamage,
      shieldAbsorbed,
      hpLost,
      killed,
      dodged: false,
      deathWardTriggered,
      isCrit: actualCrit,
      reflectHpLost,
      reflectKilled,
      counterHpLost,
      counterKilled,
      lifestealHeal,
      sharedDamages,
      trace,
    };

    this.dispatcher.emit("damage_dealt", {
      event: "damage_dealt", source: ctx.source, target: ctx.target, damage: result, turn: actionCount, allies, enemies,
    });
    this.dispatcher.emit("damage_taken", {
      event: "damage_taken", source: ctx.target, target: ctx.target, damage: result, turn: actionCount, allies, enemies,
    });
    if (actualCrit) {
      this.dispatcher.emit("crit", {
        event: "crit", source: ctx.source, target: ctx.target, damage: result, turn: actionCount, allies, enemies,
      });
    }
    if (killed) {
      this.dispatcher.emit("kill", {
        event: "kill", source: ctx.source, target: ctx.target, turn: actionCount, allies, enemies,
      });
      this.dispatcher.emit("death", {
        event: "death", target: ctx.target, turn: actionCount, allies, enemies,
      });
    }

    return result;
  }
}
