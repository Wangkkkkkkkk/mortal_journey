import {
  rollGradeAttriValue,
  GONGFA_GRADE_ATTRI_TABLE,
} from "../role_core/types/playInfo";
import type { InventoryStackItem } from "../role_core/types/playInfo";
import {
  createSpiritStoneInventoryStack,
} from "../role_core/types/spiritStone";
import type {
  GongfaItemDefinition,
  ItemGrade,
  TreasureItemDefinition,
  MaterialItemDefinition,
  MiscItemDefinition,
  CategorizedItemDefinition,
  GradeDropRate,
} from "../role_core/types/itemInfo";
import { GRADE_DROP_TABLE } from "../role_core/types/itemInfo";
import { rollTreasureFunction, rollTreasureSpecialEffect } from "../role_core/types/treasure";
import { parseMaterialCategory } from "../role_core/craft";
import { rollGongfaFunction, normalizeGongfaSystem, normalizeGongfaRole, type GongfaRole } from "../role_core/types/gongfa";
import {
  parseElixirEffectType,
  rollElixirValue,
  isElixirPercent,
  type ElixirEffectType,
} from "../role_core/types/elixir";

export const VALID_BONUS_NAMES: ReadonlySet<string> = new Set(Object.keys(GONGFA_GRADE_ATTRI_TABLE));

export function parseBonusField(raw: unknown, grade: string): Record<string, number> {
  if (typeof raw !== "string") return {};
  const name = raw.trim();
  if (!VALID_BONUS_NAMES.has(name)) return {};
  return { [name]: rollGradeAttriValue(name, grade, GONGFA_GRADE_ATTRI_TABLE) };
}

export function extractTagContent(raw: string, openTag: string, closeTag: string): string {
  const i = raw.indexOf(openTag);
  if (i < 0) return "";
  const from = i + openTag.length;
  const j = raw.indexOf(closeTag, from);
  if (j < 0) return raw.slice(from).trim();
  return raw.slice(from, j).trim();
}

export function sanitizeJsonLike(text: string): string {
  let s = text;
  s = s.replace(/\{"([^"]*)"\s*(?:,\s*"[^"]*")*\}/g, (m) => {
    const items: string[] = [];
    const re = /"([^"]*)"/g;
    let r: RegExpExecArray | null;
    while ((r = re.exec(m)) !== null) items.push('"' + r[1] + '"');
    return "[" + items.join(",") + "]";
  });
  s = s.replace(/,\s*([}\]])/g, "$1");
  return s;
}

export function tryParseJsonArray(text: string): unknown[] | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const tryParse = (src: string): unknown[] | null => {
    try {
      const parsed = JSON.parse(src);
      if (Array.isArray(parsed)) return parsed;
      return null;
    } catch {
      return null;
    }
  };
  let result = tryParse(trimmed);
  if (result) return result;
  const start = trimmed.indexOf("[");
  const end = trimmed.lastIndexOf("]");
  if (start >= 0 && end > start) {
    const segment = trimmed.slice(start, end + 1);
    result = tryParse(segment);
    if (result) return result;
    result = tryParse(sanitizeJsonLike(segment));
    if (result) return result;
  }
  result = tryParse(sanitizeJsonLike(trimmed));
  if (result) return result;
  return null;
}

export function safeStr(val: unknown, fallback: string): string {
  return typeof val === "string" && val.trim() ? val.trim() : fallback;
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

export function safeCount(val: unknown): number {
  const n = typeof val === "number" ? val : parseInt(String(val), 10);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 1;
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

export function parseGongfaObject(e: unknown, realmMajor: string, realmMinor: string, _playerLinggen?: readonly string[] | null): GongfaItemDefinition {
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

export function parseStorageObject(e: unknown, realmMajor: string, realmMinor: string, _playerLinggen?: readonly string[] | null): InventoryStackItem | null {
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
    return { itemType: "功法", name, desc, grade, count, system, role, mastery: 1, bonus: parseBonusField(obj.bonus, grade), function: rollGongfaFunction(system, grade, role) } as GongfaItemDefinition;
  }

  switch (itemType) {
    case "法宝": {
      return { itemType: "法宝", name, desc, grade, count, function: rollTreasureFunction(grade), specialEffect: rollTreasureSpecialEffect(grade) } as TreasureItemDefinition;
    }
    case "丹药": {
      const effectType = parseElixirEffectType(obj.effectType);
      const value = rollElixirValue(effectType, grade);
      return { itemType: "丹药" as const, name, desc, grade, count, effectType, effects: { value, isPercent: isElixirPercent(effectType, grade) } };
    }
    case "材料":
      return { itemType: "材料", name, desc, grade, count, category: parseMaterialCategory(obj.category) } as MaterialItemDefinition;
    case "杂物":
    default:
      return { itemType: "杂物", name, desc, grade, count } as MiscItemDefinition;
  }
}
