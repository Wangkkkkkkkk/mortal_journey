/**
 * 物品解析工具（从现有 ai/parseAiItem.ts 迁移）。
 *
 * parseEquipObject / parseGongfaObject / parseStorageObject 用于把 AI 输出的
 * 原始物品对象转换为结构化的 ItemDefinition，品阶由系统按境界自动分配。
 */

import {
  rollGradeAttriValue,
  GONGFA_GRADE_ATTRI_TABLE,
} from "../../role_core/types/playInfo";
import type { InventoryStackItem } from "../../role_core/types/playInfo";
import { createSpiritStoneInventoryStack } from "../../role_core/types/spiritStone";
import type {
  GongfaItemDefinition,
  ItemGrade,
  TreasureItemDefinition,
  MaterialItemDefinition,
  MiscItemDefinition,
  CategorizedItemDefinition,
  GradeDropRate,
} from "../../role_core/types/itemInfo";
import { GRADE_DROP_TABLE } from "../../role_core/types/itemInfo";
import { rollTreasureFunction, rollTreasureSpecialEffect } from "../../role_core/types/treasure";
import { rollGongfaFunction, normalizeGongfaSystem, normalizeGongfaRole } from "../../role_core/types/gongfa";
import { parseElixirEffectType, rollElixirValue, isElixirPercent } from "../../role_core/types/elixir";
import { safeStr, safeCount } from "./parseJson";

export const VALID_BONUS_NAMES: ReadonlySet<string> = new Set(Object.keys(GONGFA_GRADE_ATTRI_TABLE));

export function parseBonusField(raw: unknown, grade: string): Record<string, number> {
  if (typeof raw !== "string") return {};
  const name = raw.trim();
  if (!VALID_BONUS_NAMES.has(name)) return {};
  return { [name]: rollGradeAttriValue(name, grade, GONGFA_GRADE_ATTRI_TABLE) };
}

export const GRADE_KEYS: readonly (keyof GradeDropRate)[] = ["下品", "中品", "上品", "极品", "仙品", "神品"];

export function rollGrade(realmMajor: string, realmMinor: string): ItemGrade {
  const stage = GRADE_DROP_TABLE[realmMajor]?.[realmMinor];
  if (!stage) return "下品";
  const total = stage.下品 + stage.中品 + stage.上品 + stage.极品 + stage.仙品 + stage.神品;
  if (total <= 0) return "下品";
  let roll = Math.random() * total;
  for (const key of GRADE_KEYS) {
    roll -= stage[key];
    if (roll <= 0) return key;
  }
  return "下品";
}

export const TYPE_TO_ITEM_TYPE: Record<string, CategorizedItemDefinition["itemType"]> = {
  "法宝": "法宝",
  "功法": "功法",
  "丹药": "丹药",
  "材料": "材料",
  "杂物": "杂物",
};

export function parseEquipObject(e: unknown, realmMajor: string, realmMinor: string): TreasureItemDefinition {
  const obj = e as Record<string, unknown>;
  const grade = rollGrade(realmMajor, realmMinor);
  return {
    itemType: "法宝",
    name: safeStr(obj.name, "未命名法宝"),
    desc: safeStr(obj.intro, ""),
    grade,
    count: 1,
    function: rollTreasureFunction(grade),
    specialEffect: rollTreasureSpecialEffect(grade),
  };
}

export function parseGongfaObject(
  e: unknown,
  realmMajor: string,
  realmMinor: string,
  _playerLinggen?: readonly string[] | null,
): GongfaItemDefinition {
  const obj = e as Record<string, unknown>;
  const grade = rollGrade(realmMajor, realmMinor);
  const system = normalizeGongfaSystem(obj.system);
  const role = normalizeGongfaRole(obj.role);
  return {
    itemType: "功法",
    name: safeStr(obj.name, "未命名功法"),
    desc: safeStr(obj.intro, ""),
    grade,
    count: 1,
    bonus: parseBonusField(obj.bonus, grade),
    system,
    role,
    mastery: 1,
    function: rollGongfaFunction(system, grade, role),
  };
}

export function parseStorageObject(
  e: unknown,
  realmMajor: string,
  realmMinor: string,
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
  const grade = rollGrade(realmMajor, realmMinor);
  const count = safeCount(obj.count);
  const itemType = TYPE_TO_ITEM_TYPE[typeStr] ?? "杂物";

  if (itemType === "功法") {
    const system = normalizeGongfaSystem(obj.system);
    const role = normalizeGongfaRole(obj.role);
    return {
      itemType: "功法", name, desc, grade, count,
      system, role, mastery: 1,
      bonus: parseBonusField(obj.bonus, grade),
      function: rollGongfaFunction(system, grade, role),
    } as GongfaItemDefinition;
  }

  switch (itemType) {
    case "法宝":
      return {
        itemType: "法宝", name, desc, grade, count,
        function: rollTreasureFunction(grade),
        specialEffect: rollTreasureSpecialEffect(grade),
      } as TreasureItemDefinition;
    case "丹药": {
      const effectType = parseElixirEffectType(obj.effectType);
      const value = rollElixirValue(effectType, grade);
      return {
        itemType: "丹药" as const, name, desc, grade, count, effectType,
        effects: { value, isPercent: isElixirPercent(effectType, grade) },
      };
    }
    case "材料":
      return { itemType: "材料", name, desc, grade, count } as MaterialItemDefinition;
    case "杂物":
    default:
      return { itemType: "杂物", name, desc, grade, count } as MiscItemDefinition;
  }
}
