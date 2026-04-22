/**
 * NPC 状态管理：存储附近 NPC 列表，提供合并/更新/查询能力。
 * NPC 属性计算与主角一致：境界表底数 + 装备/功法加成 + 灵根倍率。
 */

import { ref, type Ref } from "vue";
import { getBaseStats } from "../config/realm_state";
import { getDerivedStats } from "./protagonistDerivedStats";
import type {
  NpcPlayInfo,
  PlayerBaseStats,
  WeaponItemDefinition,
  FaqiItemDefinition,
  ArmorItemDefinition,
  GongfaItemDefinition,
  InventoryStackItem,
} from "../types/playInfo";
import type { ItemBonusMap, ItemGrade } from "../types/itemInfo";
import type { NpcNearbyEntry } from "../ai/state_generate";

export const nearbyNpcs: Ref<NpcPlayInfo[]> = ref([]);

export interface WorldLocationSnapshot {
  name: string;
  npcs: NpcPlayInfo[];
}

export const worldLocationSnapshots: Ref<WorldLocationSnapshot[]> = ref([]);

function linggenParse(raw: string[] | string): string[] {
  const arr = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split("") : [];
  return arr.filter((c) => "金木水火土".includes(c));
}

function normalizeBonus(raw: unknown): ItemBonusMap | undefined {
  if (!raw) return undefined;
  if (typeof raw === "object" && !Array.isArray(raw)) return raw as ItemBonusMap;
  if (Array.isArray(raw)) {
    const map: Record<string, number> = {};
    for (const key of raw) {
      if (typeof key === "string") map[key] = 10;
    }
    return map;
  }
  return undefined;
}

function parseEquippedSlots(raw: unknown): NpcPlayInfo["equippedSlots"] {
  const slots: NpcPlayInfo["equippedSlots"] = { weapon: null, faqi: null, armor: null };
  if (!raw) return slots;
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const o = item as Record<string, unknown>;
      const type = String(o.type || "");
      const def = {
        name: String(o.name || ""),
        desc: String(o.intro || ""),
        grade: (o.grade as ItemGrade) || "下品",
        value: 0,
        count: 1,
        bonus: normalizeBonus(o.bonus) || {},
        magnification: {},
      };
      if (type === "武器") slots.weapon = { ...def, itemType: "装备", equipType: "武器" } as WeaponItemDefinition;
      else if (type === "法器") slots.faqi = { ...def, itemType: "装备", equipType: "法器" } as FaqiItemDefinition;
      else if (type === "防具") slots.armor = { ...def, itemType: "装备", equipType: "防具" } as ArmorItemDefinition;
    }
  }
  return slots;
}

function parseGongfaSlots(raw: unknown): NpcPlayInfo["gongfaSlots"] {
  const slots: NpcPlayInfo["gongfaSlots"] = new Array(8).fill(null) as any;
  if (!Array.isArray(raw)) return slots;
  let idx = 0;
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    if (idx >= 8) break;
    const o = item as Record<string, unknown>;
    slots[idx] = {
      name: String(o.name || ""),
      desc: String(o.intro || ""),
      grade: (o.grade as ItemGrade) || "下品",
      value: 0,
      count: 1,
      bonus: normalizeBonus(o.bonus) || {},
      subtype: String(o.type || "").includes("辅助") ? "辅助" : "攻击",
    } as GongfaItemDefinition;
    idx++;
  }
  return slots;
}

function parseInventorySlots(raw: unknown): Array<InventoryStackItem | null> {
  const slots: Array<InventoryStackItem | null> = new Array(12).fill(null);
  if (!Array.isArray(raw)) return slots;
  let idx = 0;
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    if (idx >= 12) break;
    const o = item as Record<string, unknown>;
    const type = String(o.type || "");
    if (type === "灵石") {
      slots[idx] = { type: "灵石", name: String(o.name || "下品灵石"), count: typeof o.count === "number" ? o.count : 1 } as InventoryStackItem;
    } else {
      slots[idx] = {
        name: String(o.name || ""),
        desc: String(o.intro || ""),
        grade: (o.grade as ItemGrade) || "下品",
        value: 0,
        count: typeof o.count === "number" ? o.count : 1,
        itemType: type,
      } as InventoryStackItem;
    }
    idx++;
  }
  return slots;
}

export function getNpcDerivedStats(npc: NpcPlayInfo): PlayerBaseStats | null {
  return getDerivedStats(npc);
}

export function mergeNearbyNpcs(entries: NpcNearbyEntry[], worldLocation?: string): void {
  const result: NpcPlayInfo[] = [];

  for (const entry of entries) {
    if (entry.isDead) continue;

    const existing = nearbyNpcs.value.find(
      (n) => n.displayName === entry.displayName,
    );

    if (existing) {
      existing.favorability = entry.favorability;
      existing.isDead = entry.isDead;
      if (typeof entry.currentHp === "number") existing.currentHp = entry.currentHp;
      if (typeof entry.currentMp === "number") existing.currentMp = entry.currentMp;
      if (entry.realm) existing.realm = entry.realm;
      if (entry.identity) existing.identity = entry.identity;
      result.push(existing);
    } else {
      const base = getBaseStats(entry.realm.major, entry.realm.minor);
      const rowHp = base ? (base as any).hp : 100;
      const rowMp = base ? (base as any).mp : 50;
      const hp = entry.maxHp > 0 ? entry.maxHp : rowHp || 100;
      const mp = entry.maxMp > 0 ? entry.maxMp : rowMp || 50;

      result.push({
        role: "npc",
        id: `npc_${entry.displayName}`,
        displayName: entry.displayName,
        identity: entry.identity || "",
        isVisible: true,
        isDead: false,
        favorability: entry.favorability || 0,
        currentStageGoal: entry.currentStageGoal || "",
        longTermGoal: entry.longTermGoal || "",
        hobby: entry.hobby || "",
        fear: entry.fear || "",
        personality: entry.personality || "",
        gender: entry.gender || "男",
        age: entry.age || 0,
        shouyuan: 0,
        linggen: linggenParse(entry.linggen),
        realm: entry.realm,
        playerBase: base ? { ...base } : ({ patk: 0, pdef: 0, matk: 0, mdef: 0, sense: 0, luck: 0, dodge: 0, tenacity: 0 } as PlayerBaseStats),
        maxHp: hp,
        maxMp: mp,
        currentHp: entry.currentHp > 0 ? entry.currentHp : hp,
        currentMp: entry.currentMp > 0 ? entry.currentMp : mp,
        avatarUrl: "",
        inventorySlots: parseInventorySlots(entry.inventorySlots),
        gongfaSlots: parseGongfaSlots(entry.gongfaSlots),
        equippedSlots: parseEquippedSlots(entry.equippedSlots),
      } as NpcPlayInfo);
    }
  }

  nearbyNpcs.value = result;

  if (worldLocation) {
    const locName = worldLocation.trim();
    if (locName) {
      const existing = worldLocationSnapshots.value.find((s) => s.name === locName);
      const npcCopy = result.map((n) => ({ ...n }));
      if (existing) {
        existing.npcs = npcCopy;
      } else {
        worldLocationSnapshots.value.push({
          name: locName,
          npcs: npcCopy,
        });
      }
    }
  }
}

export function clearNearbyNpcs(): void {
  nearbyNpcs.value = [];
  worldLocationSnapshots.value = [];
}
