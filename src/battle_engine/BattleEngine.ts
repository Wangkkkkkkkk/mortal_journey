import type {
  BattleState,
  BattleCombatant,
  BattleAction,
  BattleLogEntry,
  BattlePhase,
  ActionContext,
  ActionOptions,
  SkillActionItem,
  ElixirActionItem,
  PoisonActionItem,
  BattlePoison,
  BattleEffect,
  BattleEngineLike,
} from "./types";

import { EventDispatcher } from "./EventDispatcher";
import { GaugeManager } from "./GaugeManager";
import { EffectManager } from "./EffectManager";
import { DamagePipeline } from "./DamagePipeline";
import { EffectHandler, emitDamageTrace } from "./EffectHandler";
import { BattleAI } from "./BattleAI";
import { NORMAL_ATTACK_COST, ELIXIR_COST, FLEE_COST, GAUGE_MAX } from "./constants";
import { generateId as generateEffectId } from "./formulas";

/** 毒药在行动栏中的效果说明。 */
function describePoison(p: BattlePoison): string {
  if (p.kind === "dot") return `每回合损失最大血量${p.value}%，持续${p.duration}回合`;
  if (p.kind === "delayed") return `${p.duration}回合后毒发，损失最大血量${p.value}%`;
  return `${p.modifierType} ${p.value > 0 ? "+" : ""}${p.value}%，持续${p.duration}回合`;
}

export class BattleEngine implements BattleEngineLike {
  readonly eventDispatcher = new EventDispatcher();
  readonly effectManager = new EffectManager();
  readonly gaugeManager = new GaugeManager();
  readonly damagePipeline = new DamagePipeline(this.effectManager, this.eventDispatcher);
  readonly effectHandler = new EffectHandler();

  private ai = new BattleAI();
  private floatId = 0;
  state!: BattleState;

  init(allies: BattleCombatant[], enemies: BattleCombatant[], triggerEntry: unknown): void {
    this.state = {
      phase: "init",
      actionCount: 0,
      allies,
      enemies,
      activeCombatantId: null,
      pendingAction: null,
      selectedTargetId: null,
      log: [],
      floatingTexts: [],
      triggerEntry,
    };
    this.startBattle();
  }

  private startBattle(): void {
    this.state.phase = "running";
    for (const c of [...this.state.allies, ...this.state.enemies]) {
      this.effectManager.applyInitialShields(c);
    }
    this.eventDispatcher.emit("battle_start", {
      event: "battle_start", allies: this.state.allies, enemies: this.state.enemies, turn: 0,
    });
  }

  checkActorReady(): BattleCombatant | null {
    const ready = this.getAllCombatants()
      .filter(c => !c.isDead && c.actionGauge >= GAUGE_MAX && !c.isFleeing)
      .sort((a, b) => b.actionGauge - a.actionGauge ||
        this.gaugeManager.getEffectiveSpeed(b) - this.gaugeManager.getEffectiveSpeed(a));
    return ready[0] ?? null;
  }

  checkFleeSuccess(): boolean {
    const fleeing = this.getAllCombatants().find(c => c.isFleeing && !c.isDead);
    if (!fleeing) return false;
    if (fleeing.actionGauge >= GAUGE_MAX) {
      this.state.phase = "fled";
      this.addLog({
        turn: this.state.actionCount, actorName: fleeing.name, action: "逃跑成功",
        type: "flee_success", narrative: `${fleeing.name}成功逃离了战斗！`, team: fleeing.team,
      });
      this.emitBattleEnd();
      return true;
    }
    return false;
  }

  executeTurn(): boolean {
    const actor = this.findCombatant(this.state.activeCombatantId ?? "");
    if (!actor) return false;

    this.state.actionCount++;
    this.addLog({
      turn: this.state.actionCount, actorName: actor.name, action: "回合开始",
      type: "info", narrative: `─── ${actor.name}的回合 ───`, team: actor.team,
    });

    const tickEntries = this.effectManager.tickEffects(
      actor, this.state.actionCount,
      (id, text, kind) => this.pushFloat(id, text, kind),
    );
    this.addLogEntries(tickEntries);

    this.tickCooldowns(actor);

    if (actor.isDead || this.checkBattleEnd()) return false;

    if (!this.effectManager.canAct(actor)) {
      this.addLog({
        turn: this.state.actionCount, actorName: actor.name, action: "被控制",
        type: "info", narrative: `${actor.name}无法行动`, team: actor.team,
      });
      this.gaugeManager.consumeGauge(actor, GAUGE_MAX);
      return true;
    }

    if (actor.isPlayerControlled) {
      this.state.phase = "playerAction";
      this.state.pendingAction = null;
      return false;
    }

    const action = this.ai.decide(actor, this.state, this);
    if (!action) {
      this.gaugeManager.consumeGauge(actor, GAUGE_MAX);
      return true;
    }

    this.executeAction(actor, action);

    if (this.checkBattleEnd()) return false;

    this.triggerSummons(actor, "on_turn_end");
    return true;
  }

  submitPlayerAction(action: BattleAction): void {
    this.state.phase = "running";

    const actor = this.findCombatant(this.state.activeCombatantId ?? "");
    if (!actor) return;

    this.executeAction(actor, action);

    if (!this.checkBattleEnd()) {
      this.triggerSummons(actor, "on_turn_end");
    }
  }

  private executeAction(actor: BattleCombatant, action: BattleAction): void {
    this.eventDispatcher.emit("action_start", {
      event: "action_start", actor,
      allies: actor.team === "ally" ? this.state.allies : this.state.enemies,
      enemies: actor.team === "ally" ? this.state.enemies : this.state.allies,
      turn: this.state.actionCount,
    });

    this.resolveTargetOverride(actor, action);

    switch (action.type) {
      case "normalAttack":
        this.executeNormalAttack(actor, action.targetId);
        break;
      case "skill":
        this.executeSkill(actor, action.skillIndex, action.targetId);
        break;
      case "poison":
        this.executePoison(actor, action.poisonIndex, action.targetId);
        break;
      case "elixir":
        this.executeElixir(actor, action.elixirIndex);
        break;
      case "flee":
        this.executeFlee(actor);
        break;
    }

    this.eventDispatcher.emit("action_end", {
      event: "action_end", actor, action,
      allies: actor.team === "ally" ? this.state.allies : this.state.enemies,
      enemies: actor.team === "ally" ? this.state.enemies : this.state.allies,
      turn: this.state.actionCount,
    });
  }

  private resolveTargetOverride(actor: BattleCombatant, action: BattleAction): void {
    if (action.type === "flee" || action.type === "elixir" || action.type === "poison") return;
    if (!("targetId" in action)) return;

    const taunt = this.effectManager.isTaunted(actor);
    if (taunt.taunted && taunt.tauntSourceId) {
      action.targetId = taunt.tauntSourceId;
      return;
    }

    if (this.effectManager.isFeared(actor)) {
      const allTargets = this.getAllCombatants().filter(c => !c.isDead && c.id !== actor.id);
      if (allTargets.length > 0) {
        action.targetId = allTargets[Math.floor(Math.random() * allTargets.length)].id;
      }
      return;
    }

    if (this.effectManager.isConfused(actor)) {
      const enemyTeam = actor.team === "ally" ? this.state.enemies : this.state.allies;
      const otherEnemies = enemyTeam.filter(c => !c.isDead && c.id !== actor.id);
      if (otherEnemies.length > 0) {
        action.targetId = otherEnemies[Math.floor(Math.random() * otherEnemies.length)].id;
      }
    }
  }

  private executeNormalAttack(actor: BattleCombatant, targetId: string): void {
    const target = this.findCombatant(targetId);
    if (!target || target.isDead) {
      this.addLog({ turn: this.state.actionCount, actorName: actor.name, action: "普通攻击", type: "miss", narrative: `${actor.name}的攻击落空了`, team: actor.team });
      this.gaugeManager.consumeGauge(actor, NORMAL_ATTACK_COST);
      return;
    }

    const hpRatio = this.effectManager.getModifierTotal(actor, "normalAttackHpRatio");
    const defRatio = this.effectManager.getModifierTotal(actor, "normalAttackDefRatio");
    const resRatio = this.effectManager.getModifierTotal(actor, "normalAttackResRatio");
    let rawDmg = actor.stats.physAttack;
    if (hpRatio > 0) rawDmg += Math.round(actor.stats.maxHp * hpRatio / 100);
    if (defRatio > 0) rawDmg += Math.round(actor.stats.physDefense * defRatio / 100);
    if (resRatio > 0) rawDmg += Math.round(actor.stats.magDefense * resRatio / 100);
    const result = this.damagePipeline.execute(
      { source: actor, target, rawDamage: rawDmg, damageType: "physical", isCrit: false },
      this.state.actionCount, this.state.allies, this.state.enemies,
    );

    this.addLogEntries(emitDamageTrace(this.state.actionCount, actor.name, actor.team, result.trace));

    if (result.dodged) {
      this.addLog({ turn: this.state.actionCount, actorName: actor.name, action: "普通攻击", targetName: target.name, type: "miss", narrative: `${target.name}闪避了${actor.name}的普通攻击`, team: actor.team });
      this.triggerSummons(actor, "on_dodge");
    } else {
      const label = result.isCrit ? "暴击物理伤害" : "物理伤害";
      const shieldText = result.shieldAbsorbed > 0 ? `（护盾吸收${result.shieldAbsorbed}点）` : "";
      this.addLog({ turn: this.state.actionCount, actorName: actor.name, action: "普通攻击", targetName: target.name, type: result.isCrit ? "crit" : "damage", value: result.hpLost, narrative: `${actor.name}使用普通攻击对${target.name}造成${result.hpLost}点${label}${shieldText}`, team: actor.team });
      if (result.deathWardTriggered) {
        this.addLog({ turn: this.state.actionCount, actorName: target.name, action: "免死护盾", type: "buff", narrative: `${target.name}触发免死护盾，保留1点生命！`, team: target.team });
      }
      if (result.killed) {
        this.addLog({ turn: this.state.actionCount, actorName: target.name, action: "阵亡", type: "death", narrative: `${target.name}被击败了！`, team: target.team });
        this.triggerSummons(actor, "on_kill");
      }
      this.triggerSummons(actor, "on_attack");
      this.addSecondaryDamageLogs(result, actor, target);
    }

    this.gaugeManager.consumeGauge(actor, NORMAL_ATTACK_COST);
  }

  private executeSkill(actor: BattleCombatant, skillIndex: number, targetId: string): void {
    const skill = actor.skills[skillIndex];
    if (!skill) {
      this.addLog({ turn: this.state.actionCount, actorName: actor.name, action: "技能", type: "info", narrative: `${actor.name}尝试使用技能但失败了`, team: actor.team });
      return;
    }

    if (actor.cooldowns[skillIndex] > 0) {
      this.addLog({ turn: this.state.actionCount, actorName: actor.name, action: "技能冷却中", type: "info", narrative: `${skill.name}正在冷却中（剩余${actor.cooldowns[skillIndex]}回合）`, team: actor.team });
      return;
    }

    if (skill.mpCost > 0) {
      this.applyMpChange(actor, -skill.mpCost);
      this.addLog({ turn: this.state.actionCount, actorName: actor.name, action: "消耗法力", type: "info", value: skill.mpCost, narrative: `${actor.name}消耗${skill.mpCost}点法力`, team: actor.team });
    }

    const target = this.findCombatant(targetId);
    const ctx: ActionContext = {
      actor, action: { type: "skill", skillIndex, targetId },
      allies: actor.team === "ally" ? this.state.allies : this.state.enemies,
      enemies: actor.team === "ally" ? this.state.enemies : this.state.allies,
      turn: this.state.actionCount, target,
    };

    if (skill.isAoE) {
      const targets = (skill.targetTeam === "enemy" ? ctx.enemies : ctx.allies).filter(c => !c.isDead);
      for (const t of targets) {
        ctx.target = t;
        const entries = this.effectHandler.executeEffects(skill.effects, ctx, this, skill.name);
        this.addLogEntries(entries);
      }
    } else {
      const entries = this.effectHandler.executeEffects(skill.effects, ctx, this, skill.name);
      this.addLogEntries(entries);
    }

    if (skill.cooldown > 0) {
      actor.cooldowns[skillIndex] = skill.cooldown + 1;
    }

    this.gaugeManager.consumeGauge(actor, skill.actionCost);
  }

  /**
   * 使用毒药：对指定敌方施加 DoT / 延迟伤害 / 属性削弱。
   *
   * 毒药只影响目标身上的效果列表，不直接造成即时伤害，因此不走伤害管线。
   */
  private executePoison(actor: BattleCombatant, poisonIndex: number, targetId: string): void {
    const poison = actor.poisons[poisonIndex];
    if (!poison || poison.count <= 0) return;
    const target = this.findCombatant(targetId);
    if (!target || target.isDead) return;

    poison.count--;

    const base = {
      id: generateEffectId(),
      name: poison.name,
      sourceId: actor.id,
      remainingDuration: poison.duration,
      stacks: 1,
      maxStacks: 1,
    };

    let effect: BattleEffect;
    let narrative: string;
    if (poison.kind === "dot") {
      effect = { ...base, category: "dot", tickValue: poison.value, tickIsPercent: true, tickResource: "hp", statusType: "poison" };
      narrative = `${actor.name}对${target.name}施用${poison.name}，毒素蔓延（每回合损失最大血量${poison.value}%，持续${poison.duration}回合）`;
    } else if (poison.kind === "delayed") {
      effect = { ...base, category: "delayed", tickValue: poison.value, tickIsPercent: true, tickResource: "hp" };
      narrative = `${actor.name}对${target.name}施用${poison.name}，毒性潜伏（${poison.duration}回合后毒发）`;
    } else {
      effect = { ...base, category: "modifier", modifierType: poison.modifierType, modifierValue: poison.value };
      narrative = `${actor.name}对${target.name}施用${poison.name}，${poison.value > 0 ? "承伤加剧" : "身法受制"}（持续${poison.duration}回合）`;
    }

    target.effects.push(effect);
    this.addLog({ turn: this.state.actionCount, actorName: actor.name, action: "使用毒药", type: "debuff", targetName: target.name, narrative, team: actor.team });
  }

  private executeElixir(actor: BattleCombatant, elixirIndex: number): void {
    const elixir = actor.elixirs[elixirIndex];
    if (!elixir || elixir.count <= 0) return;

    elixir.count--;

    const healMult = 1 + this.effectManager.getModifierTotal(actor, "healReceived") / 100;

    if (elixir.effectType === "healHp") {
      const baseHeal = elixir.isPercent
        ? Math.round(actor.stats.maxHp * elixir.value / 100)
        : elixir.value;
      const healed = this.applyHeal(actor, Math.round(baseHeal * healMult));
      if (healed <= 0) {
        this.addLog({ turn: this.state.actionCount, actorName: actor.name, action: "使用丹药", type: "info", narrative: `${actor.name}使用${elixir.name}，但生命已满`, team: actor.team });
      } else {
        this.addLog({ turn: this.state.actionCount, actorName: actor.name, action: "使用丹药", type: "heal", value: healed, narrative: `${actor.name}使用${elixir.name}，恢复${healed}点生命`, team: actor.team });
      }
    } else if (elixir.effectType === "healMp") {
      const baseRestore = elixir.isPercent
        ? Math.round(actor.stats.maxMp * elixir.value / 100)
        : elixir.value;
      const restored = this.applyMpChange(actor, baseRestore);
      if (restored <= 0) {
        this.addLog({ turn: this.state.actionCount, actorName: actor.name, action: "使用丹药", type: "info", narrative: `${actor.name}使用${elixir.name}，但法力已满`, team: actor.team });
      } else {
        this.addLog({ turn: this.state.actionCount, actorName: actor.name, action: "使用丹药", type: "heal", value: restored, narrative: `${actor.name}使用${elixir.name}，恢复${restored}点法力`, team: actor.team });
      }
    }

    this.gaugeManager.consumeGauge(actor, ELIXIR_COST);
  }

  private executeFlee(actor: BattleCombatant): void {
    if (!actor.isProtagonist) {
      this.addLog({ turn: this.state.actionCount, actorName: actor.name, action: "逃跑失败", type: "flee_fail", narrative: `${actor.name}无法逃跑！`, team: actor.team });
      this.gaugeManager.consumeGauge(actor, GAUGE_MAX);
      return;
    }

    actor.isFleeing = true;
    this.gaugeManager.consumeGauge(actor, FLEE_COST);
    this.addLog({ turn: this.state.actionCount, actorName: actor.name, action: "开始逃跑", type: "info", narrative: `${actor.name}开始蓄力逃跑，行动条从零开始累积…`, team: actor.team });
  }

  private triggerSummons(actor: BattleCombatant, trigger: string): void {
    const summons = this.effectManager.getSummonEffects(actor, trigger);
    for (const summon of summons) {
      if (!summon.summonEffect) continue;
      const entries = this.effectHandler.executeSummonEffect(
        summon.summonEffect, actor, summon.stacks,
        this.state.actionCount, this.state.allies, this.state.enemies, this,
      );
      this.addLogEntries(entries);
      if (this.checkBattleEnd()) return;
    }
    // on_turn_end 时，召唤物攻击完成后才递减其剩余回合（先攻击后递减，
    // 确保最后一次攻击不会被「减到0即移除」跳过）。
    if (trigger === "on_turn_end") {
      this.effectManager.tickSummonDurations(actor);
    }
  }

  checkBattleEnd(): boolean {
    if (this.state.phase === "fled") return true;

    const alliesAlive = this.state.allies.some(a => !a.isDead);
    const enemiesAlive = this.state.enemies.some(e => !e.isDead);
    // 主角阵亡即战败：主角是玩家唯一可操控角色，阵亡后战斗无意义；
    // 结算（settleBattle）亦以 phase==="defeat" 判定主角身亡触发结局。
    const protagonistDead = this.state.allies.some(a => a.isProtagonist && a.isDead);

    if (!enemiesAlive) {
      this.state.phase = "victory";
      this.emitBattleEnd();
      return true;
    }
    if (!alliesAlive || protagonistDead) {
      this.state.phase = "defeat";
      this.emitBattleEnd();
      return true;
    }
    return false;
  }

  private emitBattleEnd(): void {
    this.eventDispatcher.emit("battle_end", {
      event: "battle_end", allies: this.state.allies, enemies: this.state.enemies, turn: this.state.actionCount,
    });
  }

  getPlayerActionOptions(): ActionOptions {
    const actor = this.findCombatant(this.state.activeCombatantId ?? "");
    if (!actor || actor.isDead) {
      return { canNormalAttack: false, normalAttackCost: NORMAL_ATTACK_COST, normalAttackDamage: 0, skillActionCost: 100, elixirActionCost: ELIXIR_COST, fleeActionCost: FLEE_COST, canFlee: false, skills: [], elixirs: [], poisons: [] };
    }

    const canAct = this.effectManager.canAct(actor);
    if (!canAct) {
      return { canNormalAttack: false, normalAttackCost: NORMAL_ATTACK_COST, normalAttackDamage: 0, skillActionCost: 100, elixirActionCost: ELIXIR_COST, fleeActionCost: FLEE_COST, canFlee: false, skills: [], elixirs: [], poisons: [] };
    }

    const canUseSkills = this.effectManager.canUseSkills(actor);

    const skills: SkillActionItem[] = [];
    for (let i = 0; i < actor.skills.length; i++) {
      const skill = actor.skills[i];
      const cd = actor.cooldowns[i] > 0 ? actor.cooldowns[i] : 0;
      // 不再隐藏任何功法：被沉默 / 冷却中 / 法力不足 均置灰展示并标注原因。
      let usable: boolean;
      let disabledReason: string | undefined;
      if (!canUseSkills) {
        usable = false;
        disabledReason = "被沉默";
      } else if (cd > 0) {
        usable = false;
        disabledReason = `冷却中 ${cd}回合`;
      } else if (skill.mpCost > actor.mp) {
        usable = false;
        disabledReason = "法力不足";
      } else {
        usable = true;
        disabledReason = undefined;
      }

      skills.push({
        skillIndex: i,
        name: skill.name,
        mpCost: skill.mpCost,
        needTarget: skill.needTarget,
        targetTeam: skill.targetTeam,
        isAoE: skill.isAoE,
        description: skill.desc,
        cooldown: actor.cooldowns[i],
        usable,
        disabledReason,
      });
    }

    const elixirs: ElixirActionItem[] = [];
    for (let i = 0; i < actor.elixirs.length; i++) {
      const el = actor.elixirs[i];
      if (!el || el.count <= 0) continue;
      const statLabel = el.effectType === "healHp" ? "生命" : "法力";
      elixirs.push({
        elixirIndex: i,
        name: el.name,
        effectType: el.effectType,
        value: el.value,
        count: el.count,
        description: `恢复${el.value}${el.isPercent ? "%" : "点"}${statLabel}`,
      });
    }

    const poisons: PoisonActionItem[] = [];
    for (let i = 0; i < actor.poisons.length; i++) {
      const po = actor.poisons[i];
      if (!po || po.count <= 0) continue;
      poisons.push({
        poisonIndex: i,
        name: po.name,
        count: po.count,
        description: describePoison(po),
      });
    }

    return {
      canNormalAttack: true,
      normalAttackCost: NORMAL_ATTACK_COST,
      normalAttackDamage: actor.stats.physAttack,
      skillActionCost: 100,
      elixirActionCost: ELIXIR_COST,
      poisons,
      canFlee: actor.isProtagonist,
      fleeActionCost: FLEE_COST,
      skills,
      elixirs,
    };
  }

  private tickCooldowns(combatant: BattleCombatant): void {
    for (let i = 0; i < combatant.cooldowns.length; i++) {
      if (combatant.cooldowns[i] > 0) {
        combatant.cooldowns[i]--;
      }
    }
  }

  addLog(entry: BattleLogEntry): void {
    this.state.log.push(entry);
  }

  addLogEntries(entries: BattleLogEntry[]): void {
    this.state.log.push(...entries);
  }

  addSecondaryDamageLogs(result: import("./types").DamageResult, source: BattleCombatant, target: BattleCombatant, turn?: number): void {
    const t = turn ?? this.state.actionCount;
    if (result.lifestealHeal > 0) {
      const deficit = source.stats.maxHp - source.hp;
      const healed = Math.min(deficit, result.lifestealHeal);
      if (healed > 0) {
        source.hp += healed;
        this.pushFloat(source.id, `+${healed}`, "hp");
        this.addLog({ turn: t, actorName: source.name, action: "吸血", type: "heal", value: healed, narrative: `${source.name}吸取${healed}点生命`, team: source.team });
      }
    }
    if (result.reflectHpLost > 0) {
      this.addLog({ turn: t, actorName: target.name, action: "反伤", targetName: source.name, type: "damage", value: result.reflectHpLost, narrative: `${target.name}的反伤对${source.name}造成${result.reflectHpLost}点伤害`, team: target.team });
      if (result.reflectKilled) {
        this.addLog({ turn: t, actorName: source.name, action: "阵亡", type: "death", narrative: `${source.name}被反伤击败了！`, team: source.team });
      }
    }
    if (result.counterHpLost > 0) {
      this.addLog({ turn: t, actorName: target.name, action: "反击", targetName: source.name, type: "damage", value: result.counterHpLost, narrative: `${target.name}的反击对${source.name}造成${result.counterHpLost}点伤害`, team: target.team });
      if (result.counterKilled) {
        this.addLog({ turn: t, actorName: source.name, action: "阵亡", type: "death", narrative: `${source.name}被反击击败了！`, team: source.team });
      }
    }
    for (const sd of result.sharedDamages) {
      this.addLog({ turn: t, actorName: source.name, action: "分摊伤害", targetName: sd.targetName, type: "damage", value: sd.hpLost, narrative: `${sd.targetName}分摊了${sd.hpLost}点伤害`, team: target.team });
      if (sd.killed) {
        this.addLog({ turn: t, actorName: sd.targetName, action: "阵亡", type: "death", narrative: `${sd.targetName}被分摊伤害击败了！`, team: target.team });
      }
    }
  }

  findCombatant(id: string): BattleCombatant | undefined {
    return this.getAllCombatants().find(c => c.id === id);
  }

  getAllCombatants(): BattleCombatant[] {
    return [...this.state.allies, ...this.state.enemies];
  }

  applyMpChange(target: BattleCombatant, delta: number): number {
    const adjusted = delta > 0 ? Math.round(delta * (target.linggenHealMult ?? 1)) : delta;
    const before = target.mp;
    target.mp = Math.max(0, Math.min(target.stats.maxMp, target.mp + adjusted));
    const actual = target.mp - before;
    if (actual > 0) {
      this.pushFloat(target.id, `+${actual}`, "mp");
    }
    return actual;
  }

  applyHeal(target: BattleCombatant, rawHeal: number): number {
    const mult = target.linggenHealMult ?? 1;
    const totalHeal = Math.round(rawHeal * mult);
    const deficit = target.stats.maxHp - target.hp;
    const healed = Math.min(deficit, totalHeal);
    target.hp += healed;

    if (healed > 0) {
      this.pushFloat(target.id, `+${healed}`, "hp");
    }

    const overflow = totalHeal - healed;
    if (overflow > 0) {
      const convRatio = this.effectManager.getModifierTotal(target, "healOverflowToShield");
      if (convRatio > 0) {
        const shieldGain = Math.round(overflow * convRatio / 100);
        if (shieldGain > 0) {
          target.shield += shieldGain;
          this.pushFloat(target.id, `🛡${shieldGain}`, "hp");
          this.addLog({ turn: this.state.actionCount, actorName: target.name, action: "溢出转护盾", type: "shield", value: shieldGain, narrative: `${target.name}溢出的${overflow}点治疗转化为${shieldGain}点护盾`, team: target.team });
        }
      }
    }

    this.eventDispatcher.emit("heal", {
      event: "heal", target,
      allies: target.team === "ally" ? this.state.allies : this.state.enemies,
      enemies: target.team === "ally" ? this.state.enemies : this.state.allies,
      turn: this.state.actionCount,
    });

    return healed;
  }

  pushFloat(combatantId: string, text: string, kind: "hp" | "mp"): void {
    this.state.floatingTexts.push({
      id: this.floatId++,
      combatantId,
      text,
      kind,
    });
  }

  clearFloatingText(id: number): void {
    const idx = this.state.floatingTexts.findIndex(ft => ft.id === id);
    if (idx >= 0) this.state.floatingTexts.splice(idx, 1);
  }
}
