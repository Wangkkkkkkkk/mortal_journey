import type { BattleState, BattleResult, BattleCombatant, BattleOutcome, LootEntry } from "./types";
import { protagonist } from "../role_core/Protagonist";
import { npcStore } from "../role_core/npcStore";
import type { Npc } from "../role_core/Npc";
import type { InventoryStackItem, GongfaItemDefinition } from "../role_core/types/items";
import type { BattleTriggerEntry } from "../ai_core";
import { gameLog } from "../log/gameLog";

/**
 * 收集 NPC 的全部战利品：法宝（equippedSlots）+ 功法（gongfaSlots）+ 储物袋（inventorySlots）。
 *
 * 纯游戏性掉落，不经过 AI。返回全部非空物品的浅拷贝，避免共享引用污染 NPC 数据
 * （NPC 槽位不移除）。功法重置 mastery=1/masteryExp=0，储物袋物品保留原 count。
 */
function collectNpcLoot(npc: Npc): Array<{ item: InventoryStackItem; kind: string }> {
  const loot: Array<{ item: InventoryStackItem; kind: string }> = [];

  for (const tr of npc.equippedSlots) {
    if (tr) loot.push({ item: { ...tr, count: 1 }, kind: "法宝" });
  }
  for (const gf of npc.gongfaSlots) {
    if (gf) {
      const g = { ...gf, count: 1, mastery: 1, masteryExp: 0 } as GongfaItemDefinition;
      loot.push({ item: g, kind: "功法" });
    }
  }
  for (const cell of npc.inventorySlots) {
    if (cell) {
      const kind = "itemType" in cell && cell.itemType ? cell.itemType : ("type" in cell ? cell.type : "物品");
      loot.push({ item: { ...cell }, kind });
    }
  }

  return loot;
}

export interface SettleBattleOptions {
  /** 主角战败是否身亡（正常/困难=true；简单=false，主角不会死亡）。 */
  protagonistCanDie?: boolean;
  /** 队友战败是否身亡（正常/困难=true；简单=false，队友不会死亡）。 */
  companionsCanDie?: boolean;
}

export function settleBattle(state: BattleState, opts?: SettleBattleOptions): BattleResult {
  const trigger = state.triggerEntry as BattleTriggerEntry;
  const protagonistCombatant = state.allies.find(a => a.isProtagonist);
  const enemiesKilled: string[] = [];
  const protagonistCanDie = opts?.protagonistCanDie ?? true;
  const companionsCanDie = opts?.companionsCanDie ?? true;

  for (const enemy of state.enemies) {
    if (enemy.isDead && enemy.sourceNpcName) {
      enemiesKilled.push(enemy.sourceNpcName);
    }
  }

  const p = protagonist.value;
  let protagonistDied = false;
  if (p && protagonistCombatant) {
    if (state.phase === "defeat") {
      if (protagonistCanDie) {
        // 正常/困难：主角身亡。HP 归零，标记死亡（由 App.vue 路由到结局页）。
        p.setCurrentHpMp(0, 0);
        protagonistDied = true;
      } else {
        // 简单：主角不会死亡，侥幸生还（保留原有 1 HP 复活语义）。
        p.setCurrentHpMp(1, Math.max(0, Math.round(p.maxMp * 0.1)));
      }
    } else {
      const hpPct = protagonistCombatant.stats.maxHp > 0
        ? Math.round(protagonistCombatant.hp / protagonistCombatant.stats.maxHp * 100)
        : 0;
      const mpPct = protagonistCombatant.stats.maxMp > 0
        ? Math.round(protagonistCombatant.mp / protagonistCombatant.stats.maxMp * 100)
        : 0;
      p.setCurrentHpMp(
        Math.round(p.maxHp * hpPct / 100),
        Math.round(p.maxMp * mpPct / 100),
      );
    }
  }



  // 消耗型技能（符箓/阵法）结算：将战斗中剩余次数写回主角背包
  if (p && protagonistCombatant) {
    const consumables = protagonistCombatant.consumableSkills ?? [];
    for (const cs of consumables) {
      if (!cs || cs.inventorySlotIndex < 0) continue;
      if (cs.remainingCount <= 0) {
        p.setInventorySlot(cs.inventorySlotIndex, null);
      } else {
        const slot = p.inventorySlots[cs.inventorySlotIndex];
        if (slot && "itemType" in slot) {
          slot.count = cs.remainingCount;
        }
      }
    }
  }

  const loot: LootEntry[] = [];
  const lootRecipient = p;
  for (const enemy of state.enemies) {
    if (enemy.isDead && enemy.sourceNpcName) {
      const npc = npcStore.getNpc(enemy.sourceNpcName);
      if (npc) {
        // 战斗结算是受控的程序逻辑，直接赋值（不构成数据漂移）。
        // 与 applyCoreChange 的 death 事件语义保持一致：死亡时清零 HP。
        npc.isDead = true;
        npc.currentHp = 0;

        // 战利品掉落：缴获该阵亡敌人的全部法宝/功法/储物袋物品（纯游戏性，不经 AI；只给副本，不清尸体）。
        if (state.phase === "victory" && lootRecipient) {
          const dropped = collectNpcLoot(npc);
          for (const rolled of dropped) {
            const idx = lootRecipient.addToInventory(rolled.item);
            if (idx >= 0) {
              const count = rolled.item.count ?? 1;
              loot.push({
                enemyName: enemy.sourceNpcName,
                itemKind: rolled.kind,
                itemName: rolled.item.name,
                ...(count > 1 ? { count } : {}),
              });
            } else {
              gameLog.warn(`[settleBattle] 储物袋已满，无法收取战利品「${rolled.item.name}」（来自 ${enemy.sourceNpcName}）`);
            }
          }
        }
      }
    }
  }

  for (const ally of state.allies) {
    if (ally.isProtagonist || !ally.sourceNpcName) continue;
    const npc = npcStore.getNpc(ally.sourceNpcName);
    if (!npc) continue;

    if (ally.isDead) {
      if (companionsCanDie) {
        npc.isDead = true;
        npc.currentHp = 0;
      } else {
        // 简单模式：队友不会死亡，勉强生还（HP 保底 1）。
        npc.setCurrentHpMp(1, npc.currentMp);
      }
    } else {
      const hpPct = ally.stats.maxHp > 0 ? Math.round(ally.hp / ally.stats.maxHp * 100) : 0;
      const mpPct = ally.stats.maxMp > 0 ? Math.round(ally.mp / ally.stats.maxMp * 100) : 0;
      npc.setCurrentHpMp(
        Math.round(npc.maxHp * hpPct / 100),
        Math.round(npc.maxMp * mpPct / 100),
      );
    }
  }

  const outcome: BattleOutcome = state.phase === "victory" ? "victory"
    : state.phase === "defeat" ? "defeat"
    : state.phase === "fled" ? "fled"
    : "fled";

  return {
    outcome,
    actionCount: state.actionCount,
    protagonistHpPercent: protagonistCombatant ? Math.round(protagonistCombatant.hp / Math.max(1, protagonistCombatant.stats.maxHp) * 100) : 0,
    protagonistMpPercent: protagonistCombatant ? Math.round(protagonistCombatant.mp / Math.max(1, protagonistCombatant.stats.maxMp) * 100) : 0,
    elixirsUsed: [],
    enemiesKilled,
    triggerReason: trigger.triggerReason,
    allyNames: trigger.allies.map(a => a.displayName),
    enemyNames: trigger.enemies.map(e => e.displayName),
    triggerKind: trigger.triggerKind,
    loot,
    protagonistDied,
  };
}
