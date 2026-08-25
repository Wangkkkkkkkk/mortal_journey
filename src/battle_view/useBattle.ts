import { ref, triggerRef, type Ref } from "vue";
import type {
  BattleState,
  BattleAction,
  BattleResult,
  ActionOptions,
} from "../battle_engine/types";

import type { BattleTriggerEntry } from "../ai/state_generate";
import { BattleEngine } from "../battle_engine/BattleEngine";
import { createBattleCombatants } from "../battle_engine/battleInit";
import { settleBattle } from "../battle_engine/battleSettle";
import { gameLog } from "../log/gameLog";
import { BASE_GAUGE_TIME_MS, AGILITY_DIVISOR, GAUGE_MAX, ACTION_DELAY_MS } from "../battle_engine/constants";
import { getActiveDifficulty } from "../save/gameSave";

export function useBattle() {
  const engine: Ref<BattleEngine | null> = ref(null);
  const state: Ref<BattleState | null> = ref(null);
  const result: Ref<BattleResult | null> = ref(null);
  const resolving = ref(false);

  let rafId: number | null = null;
  let lastFrameTime = 0;
  let active = false;
  let isTestBattle = false;

  /** 由当前难度推导战斗参数：简单=无人死亡；困难=敌人主属性 ×1.5；正常=标准。 */
  function difficultyBattleOpts(): { enemyStatMult: number; protagonistCanDie: boolean; companionsCanDie: boolean } {
    const diff = getActiveDifficulty();
    if (diff === "简单") {
      return { enemyStatMult: 1, protagonistCanDie: false, companionsCanDie: false };
    }
    return {
      enemyStatMult: diff === "困难" ? 1.5 : 1,
      protagonistCanDie: true,
      companionsCanDie: true,
    };
  }

  function startBattle(triggerEntry: BattleTriggerEntry): void {
    stopGaugeLoop();
    active = true;
    isTestBattle = triggerEntry.isTestBattle ?? false;

    const { enemyStatMult } = difficultyBattleOpts();
    const { allies, enemies } = createBattleCombatants(triggerEntry, { enemyStatMult });
    gameLog.info(`[useBattle] createBattleCombatants 完成: allies=${allies.length}, enemies=${enemies.length}` + (enemyStatMult !== 1 ? `, 敌方主属性×${enemyStatMult}` : ""));

    if (enemies.length === 0) {
      throw new Error(`战斗初始化失败：未找到敌方参战者。triggerEntry.enemies=${JSON.stringify(triggerEntry.enemies.map(e => e.displayName))}，请检查 NPC 是否已写入 npcStore`);
    }
    if (allies.length === 0) {
      throw new Error("战斗初始化失败：未找到主角参战者");
    }

    const e = new BattleEngine();
    e.init(allies, enemies, triggerEntry);
    engine.value = e;
    state.value = e.state;
    result.value = null;

    gameLog.info(`[useBattle] BattleEngine.init 完成: phase=${e.state.phase}, actionCount=${e.state.actionCount}`);

    startGaugeLoop();
  }

  function getPlayerActionOptions(): ActionOptions {
    const e = engine.value;
    if (!e) return { canNormalAttack: false, normalAttackCost: 50, normalAttackDamage: 0, skillActionCost: 100, elixirActionCost: 30, fleeActionCost: 100, canFlee: false, skills: [], elixirs: [], poisons: [] };
    return e.getPlayerActionOptions();
  }

  function selectAction(action: BattleAction): void {
    const s = state.value;
    const e = engine.value;
    if (!s || s.phase !== "playerAction") return;
    s.pendingAction = action;

    if (action.type === "normalAttack" || action.type === "skill") {
      if (e) {
        const actor = e.findCombatant(s.activeCombatantId ?? "");
        if (actor && e.effectManager.isFeared(actor)) {
          const allTargets = e.getAllCombatants().filter(c => !c.isDead && c.id !== actor.id);
          if (allTargets.length > 0) {
            const randomTarget = allTargets[Math.floor(Math.random() * allTargets.length)];
            s.phase = "targetSelection";
            selectTarget(randomTarget.id);
            return;
          }
        }
      }
    }

    if (action.type === "flee" || action.type === "elixir") {
      s.phase = "targetSelection";
      if (action.type === "elixir") {
        const currentActorId = s.activeCombatantId;
        if (currentActorId) selectTarget(currentActorId);
      } else {
        selectTarget("");
      }
      return;
    }

    if (action.type === "skill") {
      const opts = getPlayerActionOptions();
      const skillItem = opts.skills.find(sk => sk.skillIndex === action.skillIndex);
      if (skillItem && (!skillItem.needTarget || skillItem.isAoE)) {
        s.phase = "targetSelection";
        const currentActorId = s.activeCombatantId;
        if (currentActorId) {
          selectTarget(currentActorId);
          return;
        }
      }
    }

    s.phase = "targetSelection";
  }

  function selectTarget(targetId: string): void {
    const s = state.value;
    const e = engine.value;
    if (!s || !e || s.phase !== "targetSelection" || !s.pendingAction || resolving.value) return;
    s.selectedTargetId = targetId;

    const action = s.pendingAction;
    if (action.type !== "flee" && action.type !== "elixir") {
      (action as { targetId: string }).targetId = targetId;
    }

    resolving.value = true;
    executePlayerAction(action);
  }

  function executePlayerAction(action: BattleAction): void {
    const e = engine.value;
    if (!e) {
      resolving.value = false;
      return;
    }

    e.submitPlayerAction(action);
    triggerRef(state);

    if (isBattleOver()) {
      finishBattle();
      resolving.value = false;
      return;
    }

    resolving.value = false;

    window.setTimeout(() => {
      if (!active) return;
      if (e.checkBattleEnd()) return;
      resumeAfterAction();
    }, ACTION_DELAY_MS);
  }

  function isBattleOver(): boolean {
    const phase = state.value?.phase;
    return phase === "victory" || phase === "defeat" || phase === "fled";
  }

  function finishBattle(): void {
    stopGaugeLoop();
    const e = engine.value;
    const s = state.value;
    if (!e || !s) return;
    if (isTestBattle) {
      result.value = null;
    } else {
      const { protagonistCanDie, companionsCanDie } = difficultyBattleOpts();
      result.value = settleBattle(s, { protagonistCanDie, companionsCanDie });
    }
  }

  function clearBattle(): void {
    stopGaugeLoop();
    active = false;
    engine.value = null;
    state.value = null;
    result.value = null;
    resolving.value = false;
  }

  // ─── rAF gauge loop ───

  function startGaugeLoop(): void {
    stopGaugeLoop();
    lastFrameTime = performance.now();
    rafId = requestAnimationFrame(gaugeLoop);
  }

  function stopGaugeLoop(): void {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  function gaugeLoop(now: number): void {
    const s = state.value;
    const e = engine.value;
    if (!s || !e || !active) return;

    const dt = now - lastFrameTime;
    lastFrameTime = now;

    const baseRate = GAUGE_MAX / BASE_GAUGE_TIME_MS;
    for (const c of s.allies) {
      if (!c.isDead) {
        const spd = e.gaugeManager.getEffectiveSpeed(c);
        const rate = baseRate * (1 + spd / AGILITY_DIVISOR);
        c.actionGauge = Math.min(200, c.actionGauge + rate * dt);
      }
    }
    for (const c of s.enemies) {
      if (!c.isDead) {
        const spd = e.gaugeManager.getEffectiveSpeed(c);
        const rate = baseRate * (1 + spd / AGILITY_DIVISOR);
        c.actionGauge = Math.min(200, c.actionGauge + rate * dt);
      }
    }

    if (e.checkFleeSuccess()) {
      triggerRef(state);
      finishBattle();
      return;
    }

    const actor = e.checkActorReady();
    if (actor) {
      stopGaugeLoop();
      s.activeCombatantId = actor.id;
      onActorReady();
      return;
    }

    rafId = requestAnimationFrame(gaugeLoop);
  }

  async function onActorReady(): Promise<void> {
    const e = engine.value;
    const s = state.value;
    if (!e || !s || !active) return;

    e.executeTurn();
    triggerRef(state);

    if (e.checkBattleEnd()) {
      finishBattle();
      return;
    }

    if (s.phase === "playerAction") return;

    await delay(ACTION_DELAY_MS);
    if (!active) return;
    if (e.checkBattleEnd()) {
      finishBattle();
      return;
    }

    resumeAfterAction();
  }

  function resumeAfterAction(): void {
    const e = engine.value;
    if (!e || !active) return;

    const next = e.checkActorReady();
    if (next) {
      e.state.activeCombatantId = next.id;
      onActorReady();
    } else {
      startGaugeLoop();
    }
  }

  function delay(ms: number): Promise<void> {
    return new Promise(resolve => window.setTimeout(resolve, ms));
  }

  return {
    engine,
    state,
    result,
    resolving,
    startBattle,
    selectAction,
    selectTarget,
    getPlayerActionOptions,
    clearBattle,
    isBattleOver,
  };
}
