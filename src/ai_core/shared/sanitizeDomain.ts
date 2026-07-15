/**
 * 领域校验工具（从 state_generate.ts / init_state_generate.ts / npc_reevaluation_generate.ts 迁移）。
 *
 * 消灭三份重复的 sanitizeRealm / sanitizeRace / VALID_*_SET。
 */

import { REALM_ORDER, SUB_STAGES, type NpcRace, type PowerTier } from "../../role_core/types/playInfo";
import type { WorldLocation } from "../../role_core/types/worldLocation";
import { parseWorldLocationFromDash } from "../../role_core/types/worldLocation";

export const VALID_MAJOR_SET = new Set<string>(REALM_ORDER as readonly string[]);
export const VALID_MINOR_SET = new Set<string>(SUB_STAGES as readonly string[]);
export const VALID_RACE_SET = new Set<string>(["修仙者", "人形妖兽", "妖兽"]);
export const VALID_POWER_TIERS = new Set<string>(["小怪", "精英怪", "小boss", "大boss", "普通NPC"]);
export const VALID_CORE_SLOTS = new Set<string>(["equipped", "gongfa", "inventory"]);

export function sanitizeRace(raw: unknown): NpcRace {
  if (typeof raw === "string" && VALID_RACE_SET.has(raw)) return raw as NpcRace;
  return "修仙者";
}

export function sanitizePowerTier(raw: unknown): PowerTier {
  if (typeof raw === "string" && VALID_POWER_TIERS.has(raw)) return raw as PowerTier;
  return "普通NPC";
}

export function sanitizeRealm(realm: unknown): { major: string; minor: string } {
  if (!realm || typeof realm !== "object") return { major: "练气", minor: "初期" };
  const r = realm as { major?: unknown; minor?: unknown };
  const major = typeof r.major === "string" ? r.major.trim() : "";
  const minor = typeof r.minor === "string" ? r.minor.trim() : "";
  return {
    major: VALID_MAJOR_SET.has(major) ? major : "练气",
    minor: VALID_MINOR_SET.has(minor) ? minor : "初期",
  };
}

export function sanitizeLinggen(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((x: unknown) => String(x).trim()).filter(Boolean);
  }
  if (typeof raw === "string") {
    return raw.split("").filter((c: string) => "金木水火土".includes(c));
  }
  return [];
}

export function sanitizePercent(raw: unknown, fallback: number = 100): number {
  return typeof raw === "number" ? Math.max(0, Math.min(100, Math.round(raw))) : fallback;
}

export function sanitizeSlot(raw: unknown): "equipped" | "gongfa" | "inventory" {
  return typeof raw === "string" && VALID_CORE_SLOTS.has(raw)
    ? raw as "equipped" | "gongfa" | "inventory"
    : "inventory";
}

export function sanitizeNpcCurrentLocation(raw: unknown): WorldLocation | null {
  if (!raw) return null;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    return parseWorldLocationFromDash(trimmed);
  }
  if (typeof raw === "object") {
    const cl = raw as { region?: unknown; country?: unknown; area?: unknown; detail?: unknown };
    const region = typeof cl.region === "string" ? cl.region.trim() : "";
    if (!region) return null;
    return {
      region,
      country: typeof cl.country === "string" ? cl.country.trim() : "",
      area: typeof cl.area === "string" ? cl.area.trim() : "",
      detail: typeof cl.detail === "string" ? cl.detail.trim() : "",
    };
  }
  return null;
}
