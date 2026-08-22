/**
 * Pipeline: 世界演变（worldEvolution）—— 完整版
 *
 * 独立次级调用，在主剧情 + 状态落库之后审计「后台世界」：
 * 活跃NPC行动、事件生命周期（待执行→进行中→已结算→史册）、世界镜头规划、江湖史册，
 * 以及镜头外 NPC 的位置迁移。输出 <mj_world_evolve_update> JSON，由调用方
 * 交给 worldEvolutionStore.apply演变输出 + npcStore.applyNpcMigrations 应用。
 * 失败静默降级（返回空输出），不影响主回合。
 */

import type { AiRequestConfig } from "../shared/apiTypes";
import type { WorldLocation } from "../../role_core/types/worldLocation";
import { parseWorldLocationFromDash, isEmptyWorldLocation, formatWorldLocationDash } from "../../role_core/types/worldLocation";
import type { WorldTime } from "../../role_core/worldTime";
import { formatWorldTimeZhDisplay } from "../../role_core/worldTime";
import { runPipeline, type RunPipelineOptions } from "../shared/runPipeline";
import { callChatCompletions } from "../bridge/openAiBridge";
import { WORLD_EVOLUTION_SYSTEM_PRESET } from "../presets/worldEvolutionPreset";
import {
  extractTagContent,
  MJ_WORLD_EVOLVE_UPDATE_OPEN,
  MJ_WORLD_EVOLVE_UPDATE_CLOSE,
} from "../shared/tagSpec";
import { safeJsonParse } from "../shared/parseJson";
import { block } from "../shared/promptBlock";
import { gameLog } from "../../log/gameLog";
import type { 世界演变输出, 后台NPC动作, 事件启动操作, 事件推进操作, 事件结算操作, 镜头更新 } from "../types/worldEvolutionOps";
import type { 后台NPC条目, 世界事件条目, 世界镜头条目, 江湖史册条目 } from "../../role_core/types/worldEvolution";

/** 镜头外 NPC 简报（供世界演变判断迁移与后台行动）。 */
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
  /** 当前后台世界状态摘要（活跃NPC/事件池/镜头/史册）。 */
  currentWorldState: string;
  /** 本回合前台事实摘要（短期记忆/正文摘要）。 */
  本回合事实: string;
  /** 本回合剧情规划摘要（story AI 输出）。 */
  本回合剧情规划: string;
  /** 第0回合开局后的首次世界初始化模式：从开局正文初始化后台世界结构。 */
  initMode?: boolean;
}

/** 兼容旧导出名：世界演变输出。 */
export type WorldEvolutionParsed = 世界演变输出;

// ── prompt 分节 ──

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

function 构建世界演变用户内容(input: WorldEvolutionInput): string {
  const initBlock = input.initMode
    ? [
        "【初始化模式·第0回合开局世界初始化】",
        "- 这是第0回合开局完成后的首次世界初始化，不是普通回合后的例行维护。",
        "- 请基于【本回合前台事实】与当前状态，建立第1回合即可持续运转的后台世界结构：",
        "- 初始化活跃NPC列表（只放确有后台行动价值的镜头外人物，主角绝不写入）、待执行事件、进行中事件（常态5峰值7）、世界镜头规划、江湖史册。",
        "- 每条后台对象都要具备时间门槛与条件门槛；没有依据就保持空数组。",
        "- 本回合不处理到期结算；若开局正文已明确给出到期节点再按需处理。",
      ].join("\n")
    : "";
  return [
    sceneProtagonist(input.protagonistName, input.protagonistRealm, input.currentWorldLocation),
    sceneWorldTime(input.currentWorldTime, input.elapsedNote),
    sceneOffscreenNpcs(input.offscreenNpcs),
    sceneRegisteredLocations(input.registeredLocations),
    block("【当前后台世界状态】", input.currentWorldState || "（空）"),
    block("【本回合前台事实】", input.本回合事实 || "无"),
    block("【本回合剧情规划】", input.本回合剧情规划 || "无"),
    initBlock,
  ].join("\n");
}

// ── 解析与净化 ──

function s(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function sArr(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => s(x)).filter(Boolean) : [];
}

function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function resolveToLocation(v: unknown): WorldLocation | null {
  if (typeof v === "string") {
    const loc = parseWorldLocationFromDash(v);
    return loc && !isEmptyWorldLocation(loc) ? loc : null;
  }
  const o = obj(v);
  if (!o) return null;
  const region = s(o.region);
  const country = s(o.country);
  const area = s(o.area);
  const detail = s(o.detail);
  if (!region && !country && !area && !detail) return null;
  return { region, country, area, detail };
}

function 净化后台NPC条目(v: unknown): 后台NPC条目 | null {
  const o = obj(v);
  if (!o || !s(o.姓名)) return null;
  return {
    姓名: s(o.姓名),
    所属势力: s(o.所属势力),
    当前位置: s(o.当前位置),
    当前状态: s(o.当前状态),
    当前行动: s(o.当前行动),
    行动开始时间: s(o.行动开始时间),
    行动结束时间: s(o.行动结束时间),
  };
}

function 净化后台NPC动作(v: unknown): 后台NPC动作 | null {
  const o = obj(v);
  if (!o || !s(o.姓名)) return null;
  return {
    姓名: s(o.姓名),
    当前行动: s(o.当前行动) || undefined,
    当前状态: s(o.当前状态) || undefined,
    当前位置: s(o.当前位置) || undefined,
    行动开始时间: s(o.行动开始时间) || undefined,
    行动结束时间: s(o.行动结束时间) || undefined,
  };
}

function 净化事件条目(v: unknown): 世界事件条目 | null {
  const o = obj(v);
  if (!o || !s(o.事件名)) return null;
  return {
    id: s(o.id),
    事件名: s(o.事件名),
    事件说明: s(o.事件说明),
    计划触发时间: s(o.计划触发时间),
    最早触发时间: s(o.最早触发时间),
    最晚触发时间: s(o.最晚触发时间),
    前置条件: sArr(o.前置条件),
    当前进展: s(o.当前进展),
    事件结果: s(o.事件结果),
    长期影响: s(o.长期影响),
    当前状态: s(o.当前状态),
  };
}

function 净化镜头条目(v: unknown): 世界镜头条目 | null {
  const o = obj(v);
  if (!o || !s(o.镜头标题)) return null;
  return {
    镜头标题: s(o.镜头标题),
    镜头内容: s(o.镜头内容),
    触发时间: s(o.触发时间),
    触发条件: sArr(o.触发条件),
    关联人物: sArr(o.关联人物),
    关联地点: sArr(o.关联地点),
    沉淀内容: sArr(o.沉淀内容),
    当前状态: s(o.当前状态),
  };
}

function 净化史册条目(v: unknown): 江湖史册条目 | null {
  const o = obj(v);
  if (!o || !s(o.标题)) return null;
  return { 标题: s(o.标题), 内容: s(o.内容), 记录时间: s(o.记录时间) };
}

function 净化事件名(v: unknown): string {
  return s(v);
}

export function parseWorldEvolutionUpdate(raw: string): 世界演变输出 {
  const text = extractTagContent(raw, MJ_WORLD_EVOLVE_UPDATE_OPEN, MJ_WORLD_EVOLVE_UPDATE_CLOSE);
  const data = safeJsonParse<unknown>(text, null);
  const o = obj(data) ?? {};
  const arrOf = <T,>(v: unknown, fn: (x: unknown) => T | null): T[] => {
    const out: T[] = [];
    for (const e of Array.isArray(v) ? v : []) {
      const item = fn(e);
      if (item) out.push(item);
    }
    return out;
  };
  return {
    thinking: extractTagContent(raw, "<thinking>", "</thinking>"),
    activeNpcActions: arrOf(o.activeNpcActions, 净化后台NPC动作),
    activeNpcAdds: arrOf(o.activeNpcAdds, 净化后台NPC条目),
    activeNpcRemoves: arrOf(o.activeNpcRemoves, 净化事件名),
    eventPushes: arrOf(o.eventPushes, 净化事件条目),
    eventStarts: arrOf(o.eventStarts, (v): 事件启动操作 | null => {
      const x = obj(v);
      if (!x || !s(x.事件名)) return null;
      return { 事件名: s(x.事件名), 当前进展: s(x.当前进展), 开始时间: s(x.开始时间) || undefined };
    }),
    eventAdvances: arrOf(o.eventAdvances, (v): 事件推进操作 | null => {
      const x = obj(v);
      if (!x || !s(x.事件名)) return null;
      return { 事件名: s(x.事件名), 当前进展: s(x.当前进展) };
    }),
    eventSettles: arrOf(o.eventSettles, (v): 事件结算操作 | null => {
      const x = obj(v);
      if (!x || !s(x.事件名)) return null;
      return {
        事件名: s(x.事件名),
        事件结果: s(x.事件结果),
        长期影响: s(x.长期影响) || undefined,
        是否进入史册: x.是否进入史册 === true,
      };
    }),
    eventExpires: arrOf(o.eventExpires, 净化事件名),
    eventDeletes: arrOf(o.eventDeletes, 净化事件名),
    cameraPushes: arrOf(o.cameraPushes, 净化镜头条目),
    cameraUpdates: arrOf(o.cameraUpdates, (v): 镜头更新 | null => {
      const x = obj(v);
      if (!x || !s(x.镜头标题)) return null;
      const out: 镜头更新 = { 镜头标题: s(x.镜头标题) };
      if (s(x.镜头内容)) out.镜头内容 = s(x.镜头内容);
      if (s(x.触发时间)) out.触发时间 = s(x.触发时间);
      const 条件 = sArr(x.触发条件);
      if (条件.length) out.触发条件 = 条件;
      const 人物 = sArr(x.关联人物);
      if (人物.length) out.关联人物 = 人物;
      const 地点 = sArr(x.关联地点);
      if (地点.length) out.关联地点 = 地点;
      const 沉淀 = sArr(x.沉淀内容);
      if (沉淀.length) out.沉淀内容 = 沉淀;
      if (s(x.当前状态)) out.当前状态 = s(x.当前状态);
      return out;
    }),
    cameraDeletes: arrOf(o.cameraDeletes, 净化事件名),
    sagaAdds: arrOf(o.sagaAdds, 净化史册条目),
    migrations: arrOf(o.migrations, (v): { npcId: string; toLocation: WorldLocation } | null => {
      const x = obj(v);
      const npcId = x ? s(x.npcId) : "";
      const toLocation = x ? resolveToLocation(x.toLocation) : null;
      if (!npcId || !toLocation) return null;
      return { npcId, toLocation };
    }),
  };
}

export async function generateWorldEvolution(input: WorldEvolutionInput): Promise<世界演变输出> {
  const opts: RunPipelineOptions = {
    defaultTemperature: 0.2,
    defaultMaxTokens: 4096,
    system: WORLD_EVOLUTION_SYSTEM_PRESET,
    user: 构建世界演变用户内容(input),
    logTag: "世界演变",
  };

  try {
    const result = await runPipeline(input, opts, callChatCompletions);
    const parsed = parseWorldEvolutionUpdate(result.raw);
    if (
      parsed.activeNpcActions.length + parsed.activeNpcAdds.length + parsed.eventPushes.length +
      parsed.eventStarts.length + parsed.eventSettles.length + parsed.migrations.length > 0
    ) {
      gameLog.info("[世界演变] 本轮产生后台更新");
    }
    return parsed;
  } catch (e) {
    gameLog.warn("[世界演变] 调用失败，静默降级：" + (e instanceof Error ? e.message : String(e)));
    return {
      thinking: "",
      activeNpcActions: [],
      activeNpcAdds: [],
      activeNpcRemoves: [],
      eventPushes: [],
      eventStarts: [],
      eventAdvances: [],
      eventSettles: [],
      eventExpires: [],
      eventDeletes: [],
      cameraPushes: [],
      cameraUpdates: [],
      cameraDeletes: [],
      sagaAdds: [],
      migrations: [],
    };
  }
}
