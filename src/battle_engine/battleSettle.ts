import type { BattleState, BattleResult, BattleCombatant, BattleOutcome, LootEntry } from "./types";
import { protagonist } from "../role_core/Protagonist";
import { npcStore } from "../role_core/npcStore";
import type { Npc } from "../role_core/Npc";
import type { InventoryStackItem, TreasureItemDefinition, GongfaItemDefinition } from "../role_core/types/items";
import type { BattleTriggerEntry } from "../ai_core";
import { gameLog } from "../log/gameLog";

/**
 * 从 NPC 的 equippedSlots（法宝）+ gongfaSlots（功法）中随机抽取一件作为战利品。
 *
 * 纯游戏性掉落，不经过 AI。候选池为空（敌人既无法宝也无功法）返回 null。
 * 采用浅拷贝 + 重置 count/mastery，避免共享引用污染 NPC 数据（NPC 槽位不移除）。
 */
function rollLootFromNpc(npc: Npc): { item: InventoryStackItem; kind: "法宝" | "功法" } | null {
  const candidates: Array<{ item: InventoryStackItem; kind: "法宝" | "功法" }> = [];
  for (const tr of npc.equippedSlots) {
    if (tr) candidates.push({ item: tr as TreasureItemDefinition, kind: "法宝" });
  }
  for (const gf of npc.gongfaSlots) {
    if (gf) candidates.push({ item: gf as GongfaItemDefinition, kind: "功法" });
  }
  if (candidates.length === 0) return null;

  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  const loot = { ...pick.item, count: 1 } as InventoryStackItem;
  if (pick.kind === "功法") {
    const g = loot as GongfaItemDefinition;
    g.mastery = 1;
    g.masteryExp = 0;
  }
  return { item: loot, kind: pick.kind };
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
  const elixirsUsed: { name: string; count: number }[] = [];
  const enemiesKilled: string[] = [];
  const protagonistCanDie = opts?.protagonistCanDie ?? true;
  const companionsCanDie = opts?.companionsCanDie ?? true;

  const elixirMap = new Map<string, number>();
  for (const ally of state.allies) {
    for (const el of ally.elixirs) {
      const original = el.count;
      if (original <= 0) continue;
      const used = (elixirMap.get(el.name) ?? 0) + (original > el.count ? original - el.count : 0);
      elixirMap.set(el.name, used);
    }
  }
  for (const [name, count] of elixirMap) {
    if (count > 0) elixirsUsed.push({ name, count });
  }

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

  if (elixirsUsed.length > 0 && p) {
    for (const used of elixirsUsed) {
      let remaining = used.count;
      for (let i = 0; i < p.inventorySlots.length && remaining > 0; i++) {
        const slot = p.inventorySlots[i];
        if (!slot || !("name" in slot) || slot.name !== used.name) continue;
        const take = Math.min(remaining, slot.count);
        slot.count -= take;
        remaining -= take;
        if (slot.count <= 0) p.setInventorySlot(i, null);
      }
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

        // 战利品掉落：每个被击杀敌人随机掉落一件法宝/功法（纯游戏性，不经 AI）。
        if (state.phase === "victory" && lootRecipient) {
          const rolled = rollLootFromNpc(npc);
          if (rolled) {
            const idx = lootRecipient.addToInventory(rolled.item);
            if (idx >= 0) {
              loot.push({
                enemyName: enemy.sourceNpcName,
                itemKind: rolled.kind,
                itemName: rolled.item.name,
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
    elixirsUsed,
    enemiesKilled,
    triggerReason: trigger.triggerReason,
    allyNames: trigger.allies.map(a => a.displayName),
    enemyNames: trigger.enemies.map(e => e.displayName),
    triggerKind: trigger.triggerKind,
    loot,
    protagonistDied,
  };
}
