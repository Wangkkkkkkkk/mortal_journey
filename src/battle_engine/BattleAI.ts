import type { BattleCombatant, BattleState, BattleAction, BattleEngineLike } from "./types";
import { ELIXIR_COST } from "./constants";

export class BattleAI {
  decide(actor: BattleCombatant, state: BattleState, engine: BattleEngineLike): BattleAction | null {
    const enemies = actor.team === "ally" ? state.enemies : state.allies;
    const aliveEnemies = enemies.filter(e => !e.isDead);
    if (aliveEnemies.length === 0) return null;

    if (!engine.effectManager.canAct(actor)) return null;

    const canUseSkills = engine.effectManager.canUseSkills(actor);

    if (canUseSkills) {
      const skillAction = this.trySelectSkill(actor, state, aliveEnemies);
      if (skillAction) return skillAction;
    }

    // 低血量：尝试使用消耗品回血
    if (actor.hp < actor.stats.maxHp * 0.3) {
      const idx = (actor.consumableSkills ?? []).findIndex(cs =>
        cs.remainingCount > 0 && cs.skill.effects.some(e => e.type === "heal")
      );
      if (idx >= 0) {
        return { type: "consumableSkill", consumableIndex: idx, targetId: actor.id };
      }
    }

    // 低法力：尝试使用消耗品回蓝（healMp 目前不经过 SkillEffect 管线，暂不支持 AI 使用）

    const target = this.selectTarget(aliveEnemies);
    if (target) return { type: "normalAttack", targetId: target.id };

    return null;
  }

  private trySelectSkill(actor: BattleCombatant, state: BattleState, aliveEnemies: BattleCombatant[]): BattleAction | null {
    for (let i = 0; i < actor.skills.length; i++) {
      const skill = actor.skills[i];
      if (actor.cooldowns[i] > 0) continue;
      if (skill.mpCost > actor.mp) continue;
      if (Math.random() > 0.4) continue;

      if (skill.needTarget && aliveEnemies.length > 0) {
        const target = this.selectTarget(aliveEnemies);
        if (target) return { type: "skill", skillIndex: i, targetId: target.id };
      } else if (!skill.needTarget) {
        const allies = actor.team === "ally" ? state.allies : state.enemies;
        const self = allies.find(a => a.id === actor.id);
        return { type: "skill", skillIndex: i, targetId: self?.id ?? actor.id };
      }
    }
    return null;
  }

  private selectTarget(aliveEnemies: BattleCombatant[]): BattleCombatant | null {
    if (aliveEnemies.length === 0) return null;
    const lowestHp = aliveEnemies.reduce((a, b) => a.hp < b.hp ? a : b);
    if (Math.random() < 0.6) return lowestHp;
    return aliveEnemies[Math.floor(Math.random() * aliveEnemies.length)];
  }
}
