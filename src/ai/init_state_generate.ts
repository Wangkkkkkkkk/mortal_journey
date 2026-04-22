import { INIT_STORY_SYSTEM_PRESET } from "./init_state";
import { completeChatWithMessagesJson, type JsonChatRequestPayload } from "../lib/openAiChatBridge";
import { formatLinggenElements, formatRealmLine } from "../lib/protagonistPanelDisplay";
import { ITEM_GRADE_ATTRI_TABLE, MAGIFICATION_TABLE } from "../config/item_grade_attri";
import {
  createSpiritStoneInventoryStack,
  SPIRIT_STONE_TABLE_KEYS_ORDERED,
  type SpiritStoneName,
} from "../types/spiritStone";
import type {
  ArmorItemDefinition,
  AttackGongfaDefinition,
  AssistGongfaDefinition,
  BreakthroughElixirDefinition,
  ElixirItemDefinition,
  FaqiItemDefinition,
  ItemGrade,
  MaterialItemDefinition,
  MiscItemDefinition,
  WeaponItemDefinition,
} from "../types/itemInfo";
import type { InventoryStackItem, ProtagonistPlayInfo, GongfaSlotsState, EquippedSlotsState } from "../types/playInfo";
import type { ZhPlayerStatBonusKey } from "../types/zhPlayerStats";
import { PLAYER_STAT_KEY_TO_ZH, type PlayerStatBonusKey, PLAYER_STAT_BONUS_KEYS } from "../types/zhPlayerStats";

export interface InitStateApiConfig {
  apiUrl: string;
  apiKey?: string;
  model: string;
  temperature?: number;
  max_tokens?: number;
  requestTimeoutMs?: number;
  signal?: AbortSignal;
}

export interface InitStateGenerateInput extends InitStateApiConfig {
  protagonist: ProtagonistPlayInfo;
  storyBody: string;
}

const DEFAULT_INIT_STATE_TEMPERATURE = 0.55;
const DEFAULT_INIT_STATE_MAX_TOKENS = 16384;

const GRADE_ORDER: readonly ItemGrade[] = ["下品", "中品", "上品", "极品", "仙品"];
const REALM_GRADE_MAP: Record<string, ItemGrade> = {
  "练气": "下品",
  "筑基": "中品",
  "结丹": "上品",
  "元婴": "极品",
  "化神": "仙品",
};

const ZH_TO_EN_KEY: Readonly<Record<string, PlayerStatBonusKey>> = (() => {
  const o: Record<string, PlayerStatBonusKey> = {};
  for (const en of Object.keys(PLAYER_STAT_KEY_TO_ZH) as PlayerStatBonusKey[]) {
    o[PLAYER_STAT_KEY_TO_ZH[en]] = en;
  }
  return o;
})();

const WEAPON_PRIMARY_STATS: ZhPlayerStatBonusKey[] = ["物攻"];
const ATTACK_GONGFA_PRIMARY_STATS: ZhPlayerStatBonusKey[] = ["法攻"];

function randomArmorPrimaryStat(): ZhPlayerStatBonusKey {
  return Math.random() < 0.5 ? "物防" : "法防";
}

function gradeIndexOf(grade: string): number {
  return GRADE_ORDER.indexOf(grade as ItemGrade);
}

function pickStatForEquipType(type: string): ZhPlayerStatBonusKey[] {
  switch (type) {
    case "武器": return WEAPON_PRIMARY_STATS;
    case "法器": return [];
    case "防具": return [randomArmorPrimaryStat()];
    default: return ["物攻"];
  }
}

function pickStatForGongfaType(type: string): ZhPlayerStatBonusKey[] {
  switch (type) {
    case "攻击功法": return ATTACK_GONGFA_PRIMARY_STATS;
    case "辅助功法": return [];
    default: return ["法攻"];
  }
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getGradeRow(grade: string) {
  return ITEM_GRADE_ATTRI_TABLE.find(r => r.grade === grade) ?? ITEM_GRADE_ATTRI_TABLE[0];
}

function generateBonusForGrade(grade: string, statKeys: ZhPlayerStatBonusKey[]): Record<string, number> {
  const row = getGradeRow(grade);
  const bonus: Record<string, number> = {};
  for (const zhKey of statKeys) {
    const enKey = ZH_TO_EN_KEY[zhKey];
    if (!enKey) continue;
    const range = row[enKey as keyof typeof row] as unknown as readonly [number, number] | undefined;
    if (range && Array.isArray(range) && range.length === 2) {
      bonus[zhKey] = randInt(range[0], range[1]);
    }
  }
  return bonus;
}

function generateMagnificationForGrade(grade: string, statKeys: ZhPlayerStatBonusKey[]): Record<string, number> {
  const row = MAGIFICATION_TABLE.find(r => r.grade === grade) ?? MAGIFICATION_TABLE[0];
  const [lo, hi] = row.magnification;
  const val = Math.round((lo + Math.random() * (hi - lo)) * 100) / 100;
  const mag: Record<string, number> = {};
  for (const key of statKeys) {
    mag[key] = val;
  }
  return mag;
}

function generateValueForGrade(grade: string): number {
  const idx = gradeIndexOf(grade);
  const bases = [50, 200, 1000, 5000, 30000];
  const base = bases[idx] ?? 50;
  return Math.round(base * (0.8 + Math.random() * 0.4));
}

interface AiEquipItem {
  type: string;
  name: string;
  intro: string;
  grade: string;
  bonus: string[] | Record<string, number>;
}

interface AiGongfaItem {
  type: string;
  name: string;
  intro: string;
  grade: string;
  bonus: string[] | Record<string, number>;
}

interface AiStorageItem {
  type: string;
  name: string;
  intro?: string;
  grade?: string;
  count: number;
}

function extractTagContent(raw: string, openTag: string, closeTag: string): string {
  const i = raw.indexOf(openTag);
  if (i < 0) return "";
  const from = i + openTag.length;
  const j = raw.indexOf(closeTag, from);
  if (j < 0) return raw.slice(from).trim();
  return raw.slice(from, j).trim();
}

function sanitizeJsonLike(text: string): string {
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

function tryParseJsonArray(text: string): unknown[] | null {
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

function safeStr(val: unknown, fallback: string): string {
  return typeof val === "string" && val.trim() ? val.trim() : fallback;
}

function safeGrade(val: unknown, fallback: ItemGrade): ItemGrade {
  if (typeof val === "string" && GRADE_ORDER.includes(val as ItemGrade)) return val as ItemGrade;
  return fallback;
}

function safeCount(val: unknown): number {
  const n = typeof val === "number" ? val : parseInt(String(val), 10);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 1;
}

const ALIAS_TO_STANDARD: Readonly<Record<string, ZhPlayerStatBonusKey>> = {
  "攻击": "物攻",
  "防御": "物防",
  "血量": "血量",
  "法力": "法力",
  "物攻": "物攻",
  "物防": "物防",
  "法攻": "法攻",
  "法防": "法防",
  "神识": "神识",
  "气运": "气运",
  "闪避": "闪避",
  "韧性": "韧性",
};

function normalizeStatName(raw: string): ZhPlayerStatBonusKey | null {
  const trimmed = raw.trim();
  if (ALIAS_TO_STANDARD[trimmed]) return ALIAS_TO_STANDARD[trimmed];
  return null;
}

function normalizeBonus(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(s => String(s)).filter(Boolean);
  if (typeof raw === "object" && raw !== null) return Object.keys(raw);
  return [];
}

const ALL_ZH_STATS: ZhPlayerStatBonusKey[] = PLAYER_STAT_BONUS_KEYS.map(k => PLAYER_STAT_KEY_TO_ZH[k]);

function pickRandomExcluding(exclude: Set<string>): ZhPlayerStatBonusKey {
  const candidates = ALL_ZH_STATS.filter(s => !exclude.has(s));
  if (candidates.length === 0) return ALL_ZH_STATS[0];
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function ensureTwoStats(primary: ZhPlayerStatBonusKey[], aiNames: string[]): ZhPlayerStatBonusKey[] {
  const seen = new Set<string>(primary);
  const merged = [...primary];
  for (const n of aiNames) {
    if (merged.length >= 2) break;
    const mapped = normalizeStatName(n);
    if (!mapped) continue;
    if (!seen.has(mapped)) {
      seen.add(mapped);
      merged.push(mapped);
    } else {
      const replacement = pickRandomExcluding(seen);
      seen.add(replacement);
      merged.push(replacement);
    }
  }
  while (merged.length < 2) {
    const extra = pickRandomExcluding(seen);
    seen.add(extra);
    merged.push(extra);
  }
  return merged.slice(0, 2);
}

function resolveEquipBonus(equip: AiEquipItem, primary: ZhPlayerStatBonusKey[]): Record<string, number> {
  const aiNames = normalizeBonus(equip.bonus);
  const merged = ensureTwoStats(primary, aiNames);
  return generateBonusForGrade(equip.grade, merged);
}

function buildWeapon(item: AiEquipItem): WeaponItemDefinition {
  const stats = pickStatForEquipType("武器");
  return {
    name: item.name,
    desc: item.intro,
    grade: item.grade as ItemGrade,
    value: generateValueForGrade(item.grade),
    count: 1,
    itemType: "装备",
    equipType: "武器",
    bonus: resolveEquipBonus(item, stats),
    magnification: generateMagnificationForGrade(item.grade, ["物攻"]),
  };
}

function buildFaqi(item: AiEquipItem): FaqiItemDefinition {
  const stats = pickStatForEquipType("法器");
  return {
    name: item.name,
    desc: item.intro,
    grade: item.grade as ItemGrade,
    value: generateValueForGrade(item.grade),
    count: 1,
    itemType: "装备",
    equipType: "法器",
    bonus: resolveEquipBonus(item, stats),
  };
}

function buildArmor(item: AiEquipItem): ArmorItemDefinition {
  const stats = pickStatForEquipType("防具");
  return {
    name: item.name,
    desc: item.intro,
    grade: item.grade as ItemGrade,
    value: generateValueForGrade(item.grade),
    count: 1,
    itemType: "装备",
    equipType: "防具",
    bonus: resolveEquipBonus(item, stats),
  };
}

function buildAttackGongfa(item: AiGongfaItem): AttackGongfaDefinition {
  const primary = pickStatForGongfaType("攻击功法");
  const aiNames = normalizeBonus(item.bonus);
  const merged = ensureTwoStats(primary, aiNames);
  return {
    name: item.name,
    desc: item.intro,
    grade: item.grade as ItemGrade,
    value: generateValueForGrade(item.grade),
    count: 1,
    itemType: "功法",
    subtype: "攻击",
    manacost: randInt(5, 20),
    bonus: generateBonusForGrade(item.grade, merged),
    magnification: generateMagnificationForGrade(item.grade, ["法攻"]),
  };
}

function buildAssistGongfa(item: AiGongfaItem): AssistGongfaDefinition {
  const primary = pickStatForGongfaType("辅助功法");
  const aiNames = normalizeBonus(item.bonus);
  const merged = ensureTwoStats(primary, aiNames);
  return {
    name: item.name,
    desc: item.intro,
    grade: item.grade as ItemGrade,
    value: generateValueForGrade(item.grade),
    count: 1,
    itemType: "功法",
    subtype: "辅助",
    bonus: generateBonusForGrade(item.grade, merged),
  };
}

function spiritStoneAllowedUpTo(realmMajor: string): SpiritStoneName {
  const mapping: Record<string, SpiritStoneName> = {
    "练气": "下品灵石",
    "筑基": "中品灵石",
    "结丹": "上品灵石",
    "元婴": "极品灵石",
    "化神": "仙品灵石",
  };
  return mapping[realmMajor] ?? "下品灵石";
}

function buildSpiritStone(name: string, count: number): InventoryStackItem | null {
  if (!SPIRIT_STONE_TABLE_KEYS_ORDERED.includes(name as SpiritStoneName)) return null;
  return createSpiritStoneInventoryStack(name as SpiritStoneName, count);
}

function buildElixir(item: AiStorageItem): ElixirItemDefinition {
  return {
    name: item.name,
    desc: item.intro ?? "",
    grade: (item.grade ?? "下品") as ItemGrade,
    value: generateValueForGrade(item.grade ?? "下品"),
    count: item.count,
    itemType: "丹药",
    effects: {
      recover: {
        hp: randInt(20, 80),
        mp: randInt(5, 30),
      },
    },
  };
}

function buildMaterial(item: AiStorageItem): MaterialItemDefinition {
  return {
    name: item.name,
    desc: item.intro ?? "",
    grade: (item.grade ?? "下品") as ItemGrade,
    value: generateValueForGrade(item.grade ?? "下品"),
    count: item.count,
    itemType: "材料",
  };
}

function buildMisc(item: AiStorageItem): MiscItemDefinition {
  return {
    name: item.name,
    desc: item.intro ?? "",
    grade: (item.grade ?? "下品") as ItemGrade,
    value: generateValueForGrade(item.grade ?? "下品"),
    count: item.count,
    itemType: "杂物",
  };
}

function buildStorageItem(item: AiStorageItem): InventoryStackItem | null {
  switch (item.type) {
    case "灵石":
      return buildSpiritStone(item.name, item.count);
    case "丹药":
      return buildElixir(item);
    case "材料":
      return buildMaterial(item);
    case "杂物":
      return buildMisc(item);
    default:
      return buildMisc({ ...item, type: "杂物" });
  }
}

export interface InitStateParsed {
  equips: AiEquipItem[];
  gongfas: AiGongfaItem[];
  storage: AiStorageItem[];
}

export function parseInitStateAiResponse(raw: string): InitStateParsed {
  const equipText = extractTagContent(raw, "<equip_body>", "</equip_body>");
  const magicText = extractTagContent(raw, "<magic_body>", "</magic_body>");
  const storageText = extractTagContent(raw, "<storage_body>", "</storage_body>");

  const equipArr = tryParseJsonArray(equipText) ?? [];
  const magicArr = tryParseJsonArray(magicText) ?? [];
  const storageArr = tryParseJsonArray(storageText) ?? [];

  const equips: AiEquipItem[] = equipArr.map((e: unknown) => {
    const obj = e as Record<string, unknown>;
    return {
      type: safeStr(obj.type, "武器"),
      name: safeStr(obj.name, "未命名装备"),
      intro: safeStr(obj.intro, ""),
      grade: safeGrade(obj.grade, "下品"),
      bonus: (Array.isArray(obj.bonus) || (typeof obj.bonus === "object" && obj.bonus !== null)) ? obj.bonus as string[] | Record<string, number> : [] as string[],
    };
  });

  const gongfas: AiGongfaItem[] = magicArr.map((e: unknown) => {
    const obj = e as Record<string, unknown>;
    return {
      type: safeStr(obj.type, "攻击功法"),
      name: safeStr(obj.name, "未命名功法"),
      intro: safeStr(obj.intro, ""),
      grade: safeGrade(obj.grade, "下品"),
      bonus: (Array.isArray(obj.bonus) || (typeof obj.bonus === "object" && obj.bonus !== null)) ? obj.bonus as string[] | Record<string, number> : [] as string[],
    };
  });

  const storage: AiStorageItem[] = storageArr.map((e: unknown) => {
    const obj = e as Record<string, unknown>;
    return {
      type: safeStr(obj.type, "杂物"),
      name: safeStr(obj.name, "未命名物品"),
      intro: typeof obj.intro === "string" ? obj.intro : undefined,
      grade: typeof obj.grade === "string" ? obj.grade : undefined,
      count: safeCount(obj.count),
    };
  });

  return { equips, gongfas, storage };
}

export function buildEquippedSlotsFromParsed(parsed: InitStateParsed): EquippedSlotsState {
  let weapon: WeaponItemDefinition | null = null;
  let faqi: FaqiItemDefinition | null = null;
  let armor: ArmorItemDefinition | null = null;

  for (const item of parsed.equips) {
    switch (item.type) {
      case "武器":
        if (!weapon) weapon = buildWeapon(item);
        break;
      case "法器":
        if (!faqi) faqi = buildFaqi(item);
        break;
      case "防具":
        if (!armor) armor = buildArmor(item);
        break;
    }
  }

  return { weapon, faqi, armor };
}

export function buildGongfaSlotsFromParsed(parsed: InitStateParsed): GongfaSlotsState {
  let attack: AttackGongfaDefinition | null = null;
  let assist: AssistGongfaDefinition | null = null;

  for (const item of parsed.gongfas) {
    switch (item.type) {
      case "攻击功法":
        if (!attack) attack = buildAttackGongfa(item);
        break;
      case "辅助功法":
        if (!assist) assist = buildAssistGongfa(item);
        break;
    }
  }

  return [
    attack,
    assist,
    null,
    null,
    null,
    null,
    null,
    null,
  ];
}

export function buildInventoryFromParsed(parsed: InitStateParsed, realmMajor: string, slotCount: number): Array<InventoryStackItem | null> {
  const maxStone = spiritStoneAllowedUpTo(realmMajor);
  const maxIdx = SPIRIT_STONE_TABLE_KEYS_ORDERED.indexOf(maxStone);

  const items: InventoryStackItem[] = [];

  for (const item of parsed.storage) {
    if (item.count <= 0) continue;
    if (item.type === "灵石") {
      const stoneIdx = SPIRIT_STONE_TABLE_KEYS_ORDERED.indexOf(item.name as SpiritStoneName);
      if (stoneIdx >= 0 && stoneIdx <= maxIdx) {
        const stack = buildSpiritStone(item.name, item.count);
        if (stack) items.push(stack);
      }
    } else {
      const stack = buildStorageItem(item);
      if (stack) items.push(stack);
    }
  }

  const rest = Math.max(0, slotCount - items.length);
  return [...items, ...Array.from({ length: rest }, () => null)];
}

function buildInitStateUserContent(protagonist: ProtagonistPlayInfo, storyBody: string): string {
  const p = protagonist;
  return [
    "【开局配置生成请求】",
    "",
    `姓名：${p.displayName}`,
    `性别：${p.gender || "—"}`,
    `境界：${formatRealmLine(p.realm)}`,
    `灵根：${formatLinggenElements(p.linggen)}`,
    `出身地点：${p.birthPlace?.trim() || "—"}`,
    "",
    "【出身情况】",
    p.originStory?.trim() || "—",
    "",
    "【开局剧情】",
    storyBody,
  ].join("\n");
}

export function buildInitStateRequestPayload(input: InitStateGenerateInput): JsonChatRequestPayload {
  const userContent = buildInitStateUserContent(input.protagonist, input.storyBody);
  return {
    apiUrl: input.apiUrl,
    apiKey: input.apiKey,
    model: input.model,
    messages: [
      { role: "system", content: INIT_STORY_SYSTEM_PRESET },
      { role: "user", content: userContent },
    ],
    temperature: DEFAULT_INIT_STATE_TEMPERATURE,
    max_tokens: DEFAULT_INIT_STATE_MAX_TOKENS,
    requestTimeoutMs: input.requestTimeoutMs,
    signal: input.signal,
  };
}

export async function generateInitState(input: InitStateGenerateInput): Promise<InitStateParsed> {
  const raw = await completeChatWithMessagesJson(buildInitStateRequestPayload(input));
  return parseInitStateAiResponse(raw);
}
