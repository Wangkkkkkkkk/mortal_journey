/**
 * Pipeline: 世界演变（worldEvolution）
 *
 * 独立次级调用，维护「镜头外 NPC」的位置。按时间间隔审计后，把确有依据的
 * 镜头外 NPC 迁移以 <MJ_NPC_MIGRATE_TAG> 输出，交由 npcStore.applyNpcMigrations 应用。
 * 失败静默降级（返回空迁移），不影响主回合。
 */

import type { AiRequestConfig } from "../shared/apiTypes";
import type { WorldLocation } from "../../role_core/types/worldLocation";
import { parseWorldLocationFromDash, isEmptyWorldLocation, formatWorldLocationDash } from "../../role_core/types/worldLocation";
import type { WorldTime } from "../../role_core/worldTime";
import { formatWorldTimeZhDisplay } from "../../role_core/worldTime";
import type { NpcMigrateEvent } from "../types/npcEvents";
import { runPipeline, type RunPipelineOptions } from "../shared/runPipeline";
import { callChatCompletions } from "../bridge/openAiBridge";
import { WORLD_EVOLUTION_SYSTEM_PRESET } from "../presets/worldEvolutionPreset";
import { extractTagContent, TAG_NPC_MIGRATE_OPEN, TAG_NPC_MIGRATE_CLOSE } from "../shared/tagSpec";
import { tryParseJsonArray } from "../shared/parseJson";
import { block } from "../shared/promptBlock";
import { gameLog } from "../../log/gameLog";

/** 镜头外 NPC 简报（供世界演变判断迁移）。 */
export interface WorldEvolutionNpcBrief {
  npcId: string;
  displayName: string;
  identity: string;
  realm: { major: string; minor: string };
  currentLocation: WorldLocation | null;
  storySnapshot: string;
  /** presence：dormant / departed 等。 */
  presence: string;
}

export interface WorldEvolutionInput extends AiRequestConfig {
  protagonistName: string;
  protagonistRealm: string;
  currentWorldLocation: WorldLocation | null;
  currentWorldTime?: WorldTime;
  /** 距上次演变的间隔说明（供 AI 判断迁移合理性）。 */
  elapsedNote: string;
  offscreenNpcs: WorldEvolutionNpcBrief[];
  registeredLocations: string[];
}

export interface WorldEvolutionParsed {
  migrations: NpcMigrateEvent[];
}

// ─────────────────────────────────────────────────────────────────────────────
// prompt 分节
// ─────────────────────────────────────────────────────────────────────────────

function sceneProtagonist(name: string, realm: string, loc: WorldLocation | null): string {
  return block("【当前主角】", `姓名：${name}\n境界：${realm}\n当前地点：${formatWorldLocationDash(loc) || "未知"}`);
}

function sceneWorldTime(worldTime?: WorldTime, elapsedNote?: string): string {
  const lines: string[] = [];
  if (worldTime) lines.push(`当前时间：${formatWorldTimeZhDisplay(worldTime)}`);
  if (elapsedNote) lines.push(`距上次演变：${elapsedNote}`);
  return block("【世界时间与间隔】", lines.join("\n"));
}

function sceneOffscreenNpcs(npcs: WorldEvolutionNpcBrief[]): string {
  if (!npcs || npcs.length === 0) return "";
  const lines = npcs.map((n) => {
    const realm = `${n.realm?.major || ""}${n.realm?.minor || ""}`;
    const cur = n.currentLocation ? formatWorldLocationDash(n.currentLocation) : "未知";
    const snap = (n.storySnapshot || "").trim();
    const base = `${n.displayName}（npcId:${n.npcId}，${n.identity || ""}，${realm}，当前:${cur}，状态:${n.presence}）`;
    return snap ? `${base} 近况:${snap}` : base;
  });
  return block("【镜头外 NPC 名单】", lines.join("\n"));
}

function sceneRegisteredLocations(registeredLocations?: string[]): string {
  const registered = (registeredLocations ?? []).filter((s) => s && s.trim());
  return block("【既往到访地点·返回时沿用；抵达全新地点请生成新名】", registered.join("\n"));
}

function buildWorldEvolutionUserContent(input: WorldEvolutionInput): string {
  let msg = "";
  msg += sceneProtagonist(input.protagonistName, input.protagonistRealm, input.currentWorldLocation);
  msg += sceneWorldTime(input.currentWorldTime, input.elapsedNote);
  msg += sceneOffscreenNpcs(input.offscreenNpcs);
  msg += sceneRegisteredLocations(input.registeredLocations);
  return msg;
}

// ─────────────────────────────────────────────────────────────────────────────
// 解析
// ─────────────────────────────────────────────────────────────────────────────

function resolveToLocation(v: unknown): WorldLocation | null {
  if (typeof v === "string") {
    const loc = parseWorldLocationFromDash(v);
    return loc && !isEmptyWorldLocation(loc) ? loc : null;
  }
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    const region = typeof o.region === "string" ? o.region.trim() : "";
    const country = typeof o.country === "string" ? o.country.trim() : "";
    const area = typeof o.area === "string" ? o.area.trim() : "";
    const detail = typeof o.detail === "string" ? o.detail.trim() : "";
    if (!region && !country && !area && !detail) return null;
    return { region, country, area, detail };
  }
  return null;
}

function parseMigrations(raw: string): NpcMigrateEvent[] {
  const text = extractTagContent(raw, TAG_NPC_MIGRATE_OPEN, TAG_NPC_MIGRATE_CLOSE);
  const arr = tryParseJsonArray(text) ?? [];
  const out: NpcMigrateEvent[] = [];
  for (const e of arr) {
    if (!e || typeof e !== "object") continue;
    const o = e as Record<string, unknown>;
    const npcId = typeof o.npcId === "string" ? o.npcId.trim() : "";
    if (!npcId) continue;
    const toLocation = resolveToLocation(o.toLocation);
    if (!toLocation) continue;
    out.push({ kind: "npc_migrate", npcId, toLocation });
  }
  return out;
}

export async function generateWorldEvolution(input: WorldEvolutionInput): Promise<WorldEvolutionParsed> {
  const opts: RunPipelineOptions = {
    defaultTemperature: 0.2,
    defaultMaxTokens: 1024,
    system: WORLD_EVOLUTION_SYSTEM_PRESET,
    user: buildWorldEvolutionUserContent(input),
    logTag: "世界演变",
  };

  try {
    const result = await runPipeline(input, opts, callChatCompletions);
    const migrations = parseMigrations(result.raw);
    if (migrations.length > 0) {
      gameLog.info(`[世界演变] 镜头外 NPC 迁移 ${migrations.length} 条`);
    }
    return { migrations };
  } catch (e) {
    gameLog.warn("[世界演变] 调用失败，静默降级：" + (e instanceof Error ? e.message : String(e)));
    return { migrations: [] };
  }
}
