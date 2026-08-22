/**
 * XML-like 标签常量与抽取工具（xml-tags 兼容模式用）。
 *
 * 包含全部 13 段状态标签常量 + 通用抽取函数。
 */

// ── 13 段状态标签常量（从 state_generate.ts 迁移）──

export const MJ_WORLD_BODY_OPEN = "<mj_world_body>";
export const MJ_WORLD_BODY_CLOSE = "</mj_world_body>";
export const TAG_USER_STATE_OPEN = "<USER_STATE_TAG>";
export const TAG_USER_STATE_CLOSE = "</USER_STATE_TAG>";
export const TAG_SPIRIT_STONE_OPEN = "<SPIRIT_STONE_TAG>";
export const TAG_SPIRIT_STONE_CLOSE = "</SPIRIT_STONE_TAG>";
export const TAG_ITEM_ADD_OPEN = "<ITEM_ADD_TAG>";
export const TAG_ITEM_ADD_CLOSE = "</ITEM_ADD_TAG>";
export const TAG_ITEM_REMOVE_OPEN = "<ITEM_REMOVE_TAG>";
export const TAG_ITEM_REMOVE_CLOSE = "</ITEM_REMOVE_TAG>";
export const TAG_NPC_NEARBY_OPEN = "<NPC_NEARBY_TAG>";
export const TAG_NPC_NEARBY_CLOSE = "</NPC_NEARBY_TAG>";
export const TAG_NPC_CORE_CHANGE_OPEN = "<MJ_NPC_CORE_CHANGE_TAG>";
export const TAG_NPC_CORE_CHANGE_CLOSE = "</MJ_NPC_CORE_CHANGE_TAG>";
/** NPC 离场声明（npcId + 可选目的地）。 */
export const TAG_NPC_DEPART_OPEN = "<MJ_NPC_DEPART_TAG>";
export const TAG_NPC_DEPART_CLOSE = "</MJ_NPC_DEPART_TAG>";
/** 镜头外 NPC 迁移（世界演变输出）。 */
export const TAG_NPC_MIGRATE_OPEN = "<MJ_NPC_MIGRATE_TAG>";
export const TAG_NPC_MIGRATE_CLOSE = "</MJ_NPC_MIGRATE_TAG>";
export const TAG_BATTLE_TRIGGER_OPEN = "<BATTLE_TRIGGER_TAG>";
export const TAG_BATTLE_TRIGGER_CLOSE = "</BATTLE_TRIGGER_TAG>";
export const TAG_NPC_SNAPSHOTS_OPEN = "<mj_npc_snapshots>";
export const TAG_NPC_SNAPSHOTS_CLOSE = "</mj_npc_snapshots>";
export const TAG_NPC_MEMORIES_OPEN = "<mj_npc_memories>";
export const TAG_NPC_MEMORIES_CLOSE = "</mj_npc_memories>";
export const TAG_NPC_FAVOR_CHANGES_OPEN = "<mj_npc_favor_changes>";
export const TAG_NPC_FAVOR_CHANGES_CLOSE = "</mj_npc_favor_changes>";
export const TAG_STORY_SNAPSHOT_OPEN = "<mj_story_snapshot>";
export const TAG_STORY_SNAPSHOT_CLOSE = "</mj_story_snapshot>";
export const TAG_ACTION_OPTIONS_OPEN = "<MJ_ACTION_OPTIONS_TAG>";
export const TAG_ACTION_OPTIONS_CLOSE = "</MJ_ACTION_OPTIONS_TAG>";
export const TAG_HP_MP_OPEN = "<MJ_HP_MP_TAG>";
export const TAG_HP_MP_CLOSE = "</MJ_HP_MP_TAG>";
export const TAG_TIME_OPEN = "<MJ_TIME_TAG>";
export const TAG_TIME_CLOSE = "</MJ_TIME_TAG>";
export const TAG_BREAKTHROUGH_OPEN = "<MJ_BREAKTHROUGH_TAG>";
export const TAG_BREAKTHROUGH_CLOSE = "</MJ_BREAKTHROUGH_TAG>";

// ── Story / Cultivation / Finale body 标签 ──

export const MJ_STORY_BODY_OPEN = "<mj_story_body>";
export const MJ_STORY_BODY_CLOSE = "</mj_story_body>";
export const MJ_CULTIVATION_BODY_OPEN = "<mj_cultivation_body>";
export const MJ_CULTIVATION_BODY_CLOSE = "</mj_cultivation_body>";
export const MJ_FINALE_BODY_OPEN = "<mj_finale_body>";
export const MJ_FINALE_BODY_CLOSE = "</mj_finale_body>";

// ── 统一剧情调用（MoRanJiangHu 风格）标签 ──

export const MJ_NARRATIVE_BODY_OPEN = "<正文>";
export const MJ_NARRATIVE_BODY_CLOSE = "</正文>";
export const MJ_SHORT_TERM_MEMORY_OPEN = "<短期记忆>";
export const MJ_SHORT_TERM_MEMORY_CLOSE = "</短期记忆>";
export const MJ_VAR_PLAN_OPEN = "<变量规划>";
export const MJ_VAR_PLAN_CLOSE = "</变量规划>";
export const MJ_PLOT_PLAN_OPEN = "<剧情规划>";
export const MJ_PLOT_PLAN_CLOSE = "</剧情规划>";
export const MJ_STORY_ACTION_OPTIONS_OPEN = "<行动选项>";
export const MJ_STORY_ACTION_OPTIONS_CLOSE = "</行动选项>";

// ── 规划分析链路（planningAnalysis）输出 ──

export const MJ_PLAN_ANALYSIS_OPEN = "<mj_plan_analysis>";
export const MJ_PLAN_ANALYSIS_CLOSE = "</mj_plan_analysis>";

// ── 世界演变引擎（worldEvolution）输出 ──

export const MJ_WORLD_EVOLVE_UPDATE_OPEN = "<mj_world_evolve_update>";
export const MJ_WORLD_EVOLVE_UPDATE_CLOSE = "</mj_world_evolve_update>";

// ── Init state 标签 ──

export const MJ_EQUIP_BODY_OPEN = "<mj_equip_body>";
export const MJ_EQUIP_BODY_CLOSE = "</mj_equip_body>";
export const MJ_MAGIC_BODY_OPEN = "<mj_magic_body>";
export const MJ_MAGIC_BODY_CLOSE = "</mj_magic_body>";
export const MJ_STORAGE_BODY_OPEN = "<mj_storage_body>";
export const MJ_STORAGE_BODY_CLOSE = "</mj_storage_body>";
export const TAG_AGE_OPEN = "<mj_protagonist_age>";
export const TAG_AGE_CLOSE = "</mj_protagonist_age>";

// ── 通用抽取函数 ──

export function extractTagContent(raw: string, openTag: string, closeTag: string): string {
  const i = raw.indexOf(openTag);
  if (i < 0) return "";
  const from = i + openTag.length;
  const j = raw.indexOf(closeTag, from);
  if (j < 0) return raw.slice(from).trim();
  return raw.slice(from, j).trim();
}

/**
 * 抽取标签正文（跳过 <thinking> 推理块）。用于 story body / cultivation body / finale body。
 */
export function extractTaggedBody(
  raw: string,
  openTag: string,
  closeTag: string,
  opts: { skipThinking?: boolean } = {},
): string {
  const s = raw == null ? "" : String(raw);
  let searchFrom = 0;
  if (opts.skipThinking) {
    const tOpen = s.indexOf("<thinking>");
    if (tOpen >= 0) {
      const tClose = s.indexOf("</thinking>", tOpen);
      if (tClose >= 0) {
        searchFrom = tClose + "</thinking>".length;
      }
    }
  }
  const i = s.indexOf(openTag, searchFrom);
  if (i < 0) return s.trim();
  const start = i + openTag.length;
  const j = s.indexOf(closeTag, start);
  if (j < 0) return s.slice(start).trim();
  return s.slice(start, j).trim();
}

export function hasCompleteTaggedBody(raw: string, openTag: string, closeTag: string): boolean {
  const s = raw == null ? "" : String(raw);
  const i = s.indexOf(openTag);
  if (i < 0) return false;
  return s.indexOf(closeTag, i + openTag.length) >= 0;
}

export function extractThinking(raw: string): string {
  const s = raw == null ? "" : String(raw);
  const tOpen = s.indexOf("<thinking>");
  if (tOpen < 0) return "";
  const tClose = s.indexOf("</thinking>", tOpen);
  if (tClose < 0) return s.slice(tOpen + "<thinking>".length).trim();
  return s.slice(tOpen + "<thinking>".length, tClose).trim();
}

export function truncateReasoning(trace: string, maxChars: number): string {
  if (trace.length <= maxChars) return trace;
  return trace.slice(0, maxChars) + "\n…（推理链已截断）";
}

export function parseActionTag(storyBody: string): string | null {
  const m = storyBody.match(/\[ACTION:([a-z_]+)\]/i);
  return m ? m[1].toLowerCase() : null;
}
