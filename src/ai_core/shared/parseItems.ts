/**
 * 物品解析工具。
 *
 * parseEquipObject / parseGongfaObject / parseStorageObject 把 AI 输出的原始物品
 * 对象转换为结构化 ItemDefinition。物品效果由 AI 从统一效果词汇表选一个 kind 决定，
 * 程序按品阶填充数值。品阶信任 AI 输出（合法即保留），缺失/非法时确定性兜底为
 * 境界参照下限（realmFloorGrade），不再随机生成。
 */

import {
  rollGradeAttriValue,
  GONGFA_GRADE_ATTRI_TABLE,
} from "../../role_core/types/playInfo";
import type { InventoryStackItem } from "../../role_core/types/items";
import type {
  GongfaItemDefinition,
  TreasureItemDefinition,
  MaterialItemDefinition,
  MiscItemDefinition,
  CategorizedItemDefinition,
} from "../../role_core/types/items";
import { validateGrade, realmFloorGrade, resolveGongfaEffect, resolveTreasureEffect, resolveElixirEffect, type EffectParams, type EffectEntry } from "../../role_core/types/items";
import { createSpiritStoneInventoryStack } from "../../role_core/types/spiritStone";
import { safeStr, safeCount } from "./parseJson";

export const VALID_BONUS_NAMES: ReadonlySet<string> = new Set(Object.keys(GONGFA_GRADE_ATTRI_TABLE));

export function parseBonusField(raw: unknown, grade: string): Record<string, number> {
  if (typeof raw !== "string") return {};
  const name = raw.trim();
  if (!VALID_BONUS_NAMES.has(name)) return {};
  return { [name]: rollGradeAttriValue(name, grade, GONGFA_GRADE_ATTRI_TABLE) };
}

export const TYPE_TO_ITEM_TYPE: Record<string, CategorizedItemDefinition["itemType"]> = {
  "法宝": "法宝",
  "功法": "功法",
  "丹药": "丹药",
  "符箓": "符箓",
  "阵法": "阵法",
  "炼丹材料": "炼丹材料",
  "炼器材料": "炼器材料",
  "杂物": "杂物",
};

/** 从原始对象的一条 effect 提取 kind + params。 */
function readOneEntry(raw: unknown): { kind: string | undefined; params: EffectParams } | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;
  const kind = typeof e.kind === "string" ? e.kind.trim() : undefined;
  if (!kind) return null;
  return {
    kind,
    params: {
      damageType: typeof e.damageType === "string" ? e.damageType : undefined,
      statusType: typeof e.statusType === "string" ? e.statusType : undefined,
      ccType: typeof e.ccType === "string" ? e.ccType : undefined,
      modifierType: typeof e.modifierType === "string" ? e.modifierType : undefined,
      scalingStat: typeof e.scalingStat === "string" ? e.scalingStat : undefined,
      summonTrigger: typeof e.summonTrigger === "string" ? e.summonTrigger : undefined,
      statKey: typeof e.statKey === "string" ? e.statKey : undefined,
      isAoE: e.isAoE === true,
    },
  };
}

/**
 * 从 AI 原始对象读取效果列表：
 *   - 优先 effects（数组，每项 {kind, ...params}）
 *   - 兼容单个 effect / effectKind + 顶层参数
 */
function readEffectEntries(obj: Record<string, unknown>): EffectEntry[] {
  const entries: EffectEntry[] = [];
  if (Array.isArray(obj.effects)) {
    for (const raw of obj.effects) {
      const r = readOneEntry(raw);
      if (r && r.kind) entries.push({ kind: r.kind, params: r.params });
    }
  }
  if (entries.length === 0) {
    // 兼容单 effect 对象
    const single = readOneEntry(obj.effect);
    if (single && single.kind) entries.push({ kind: single.kind, params: single.params });
  }
  if (entries.length === 0 && typeof obj.effectKind === "string") {
    // 兼容旧顶层字段
    entries.push({
      kind: obj.effectKind.trim(),
      params: readOneEntry(obj)?.params ?? {},
    });
  }
  return entries;
}

export function parseEquipObject(e: unknown, realmMajor: string, _realmMinor: string): TreasureItemDefinition {
  const obj = e as Record<string, unknown>;
  const grade = validateGrade(obj.grade) ?? realmFloorGrade(realmMajor);
  return {
    itemType: "法宝",
    name: safeStr(obj.name, "未命名法宝"),
    desc: safeStr(obj.intro, ""),
    grade,
    count: 1,
    effect: resolveTreasureEffect(readEffectEntries(obj), grade),
  };
}

export function parseGongfaObject(
  e: unknown,
  realmMajor: string,
  _realmMinor: string,
  _playerLinggen?: readonly string[] | null,
): GongfaItemDefinition {
  const obj = e as Record<string, unknown>;
  const grade = validateGrade(obj.grade) ?? realmFloorGrade(realmMajor);
  return {
    itemType: "功法",
    name: safeStr(obj.name, "未命名功法"),
    desc: safeStr(obj.intro, ""),
    grade,
    count: 1,
    bonus: parseBonusField(obj.bonus, grade),
    effect: resolveGongfaEffect(readEffectEntries(obj), grade),
  };
}

export function parseStorageObject(
  e: unknown,
  realmMajor: string,
  _realmMinor: string,
  _playerLinggen?: readonly string[] | null,
): InventoryStackItem | null {
  const obj = e as Record<string, unknown>;
  const typeStr = safeStr(obj.type, "杂物");

  if (typeStr === "灵石") {
    const count = safeCount(obj.count);
    if (count <= 0) return null;
    return createSpiritStoneInventoryStack(count);
  }

  const name = safeStr(obj.name, "未命名物品");
  const desc = safeStr(obj.intro, "");
  const grade = validateGrade(obj.grade) ?? realmFloorGrade(realmMajor);
  const count = safeCount(obj.count);
  const itemType = TYPE_TO_ITEM_TYPE[typeStr] ?? "杂物";
  const entries = readEffectEntries(obj);

  if (itemType === "功法") {
    return {
      itemType: "功法", name, desc, grade, count,
      bonus: parseBonusField(obj.bonus, grade),
      effect: resolveGongfaEffect(entries, grade),
    } as GongfaItemDefinition;
  }

  switch (itemType) {
    case "法宝":
      return {
        itemType: "法宝", name, desc, grade, count,
        effect: resolveTreasureEffect(entries, grade),
      } as TreasureItemDefinition;
    case "丹药":
      return {
        itemType: "丹药" as const, name, desc, grade, count,
        effect: resolveElixirEffect(entries, grade),
      };
    case "符箓":
      return {
        itemType: "符箓" as const, name, desc, grade, count,
        effect: resolveElixirEffect(entries, grade),
      } as import("../../role_core/types/items").TalismanItemDefinition;
    case "阵法":
      return {
        itemType: "阵法" as const, name, desc, grade, count,
        effect: resolveElixirEffect(entries, grade),
      } as import("../../role_core/types/items").FormationItemDefinition;
    case "炼丹材料":
      return { itemType: "炼丹材料", name, desc, grade, count } as import("../../role_core/types/items").AlchemyMaterialItemDefinition;
    case "炼器材料":
      return { itemType: "炼器材料", name, desc, grade, count } as import("../../role_core/types/items").ForgingMaterialItemDefinition;
    case "杂物":
    default:
      return { itemType: "杂物", name, desc, grade, count } as MiscItemDefinition;
  }
}
