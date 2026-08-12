/**
 * ai_core — AI 架构核心模块 barrel 导出。
 *
 * 设计文档：src/ai/REFACTOR_DESIGN.md
 * 子目标：G1-G15，分三圈（近期重构 / 架构演进 / 远期增强）。
 */

// ── Types ──
export type {
  NpcEvent,
  NpcAppearedEvent,
  NpcPresentEvent,
  NpcLeftEvent,
  NpcBreakthroughEvent,
  NpcEquipmentAcquiredEvent,
  NpcEquipmentLostEvent,
  NpcDamagedEvent,
  NpcDiedEvent,
  NpcFullCard,
  NpcNearbyEntry,
  BattleCombatant,
  BattleTriggerEntry,
} from "./types/npcEvents";

export type {
  HpMpState,
  BreakthroughState,
  UserStateChange,
  SpiritStoneChange,
  ItemAddEntry,
  ItemRemoveEntry,
  ActionSuggestions,
  StateParsed,
  NpcSnapshotEntry,
  NpcMemoryEntry,
  NpcFavorChangeEntry,
  StateGenerateInput,
} from "./types/stateDiff";



// ── Shared ──
export { runPipeline, type RunPipelineOptions, type RunPipelineResult } from "./shared/runPipeline";
export { type AiRequestConfig, type ChatMessage, type JsonChatRequestPayload } from "./shared/apiTypes";
export { extractTagContent, extractTaggedBody, hasCompleteTaggedBody, extractThinking, truncateReasoning, parseActionTag } from "./shared/tagSpec";
export {
  MJ_WORLD_BODY_OPEN, MJ_WORLD_BODY_CLOSE,
  TAG_USER_STATE_OPEN, TAG_USER_STATE_CLOSE,
  TAG_HP_MP_OPEN, TAG_HP_MP_CLOSE,
  TAG_TIME_OPEN, TAG_TIME_CLOSE,
  TAG_BREAKTHROUGH_OPEN, TAG_BREAKTHROUGH_CLOSE,
  TAG_SPIRIT_STONE_OPEN, TAG_SPIRIT_STONE_CLOSE,
  TAG_ITEM_ADD_OPEN, TAG_ITEM_ADD_CLOSE,
  TAG_ITEM_REMOVE_OPEN, TAG_ITEM_REMOVE_CLOSE,
  TAG_NPC_NEARBY_OPEN, TAG_NPC_NEARBY_CLOSE,
  TAG_NPC_CORE_CHANGE_OPEN, TAG_NPC_CORE_CHANGE_CLOSE,
  TAG_BATTLE_TRIGGER_OPEN, TAG_BATTLE_TRIGGER_CLOSE,
  TAG_STORY_SNAPSHOT_OPEN, TAG_STORY_SNAPSHOT_CLOSE,
  TAG_ACTION_OPTIONS_OPEN, TAG_ACTION_OPTIONS_CLOSE,
  MJ_STORY_BODY_OPEN, MJ_STORY_BODY_CLOSE,
  MJ_CULTIVATION_BODY_OPEN, MJ_CULTIVATION_BODY_CLOSE,
  MJ_FINALE_BODY_OPEN, MJ_FINALE_BODY_CLOSE,
  MJ_EQUIP_BODY_OPEN, MJ_EQUIP_BODY_CLOSE,
  MJ_MAGIC_BODY_OPEN, MJ_MAGIC_BODY_CLOSE,
  MJ_STORAGE_BODY_OPEN, MJ_STORAGE_BODY_CLOSE,
  TAG_AGE_OPEN, TAG_AGE_CLOSE,
  MJ_NARRATIVE_BODY_OPEN, MJ_NARRATIVE_BODY_CLOSE,
  MJ_SHORT_TERM_MEMORY_OPEN, MJ_SHORT_TERM_MEMORY_CLOSE,
  MJ_VAR_PLAN_OPEN, MJ_VAR_PLAN_CLOSE,
  MJ_PLOT_PLAN_OPEN, MJ_PLOT_PLAN_CLOSE,
  MJ_STORY_ACTION_OPTIONS_OPEN, MJ_STORY_ACTION_OPTIONS_CLOSE,
} from "./shared/tagSpec";
export { safeJsonParse, tryParseJsonArray, sanitizeJsonLike, safeStr, safeCount } from "./shared/parseJson";
export {
  parseEquipObject, parseGongfaObject, parseStorageObject,
  parseBonusField, VALID_BONUS_NAMES, TYPE_TO_ITEM_TYPE,
} from "./shared/parseItems";
export { buildProtagonistBrief, formatEquippedSlots, formatGongfaSlots, formatInventorySlots, type BriefContext, type BriefOptions } from "./shared/protagonistBrief";
export {
  sanitizeRace, sanitizePowerTier, sanitizeRealm, sanitizeLinggen, sanitizePercent, sanitizeSlot, sanitizeNpcCurrentLocation,
  VALID_MAJOR_SET, VALID_MINOR_SET, VALID_RACE_SET, VALID_POWER_TIERS, VALID_CORE_SLOTS,
} from "./shared/sanitizeDomain";

// ── Bridge ──
export { useApiConfig, isApiConfigured, type UseApiConfigReturn, type ApiOverrideStored, API_OVERRIDE_KEY } from "./bridge/apiConfig";
export { callChatCompletions, extractResponse, extractOpenAiNonStreamMessageText, normalizeBaseUrl, type ChatCompletionResponse, DEFAULT_NON_STREAM_TIMEOUT_MS } from "./bridge/openAiBridge";

// ── Pipelines ──
export { generateStory, type StoryInput, type StoryParsed, type StoryChatEntry } from "./pipelines/story";
export { generateInitStory, type InitStoryInput, type InitStoryParsed } from "./pipelines/initStory";
export { generateInitState, parseInitStateAiResponse, buildEquippedSlotsFromParsed, buildGongfaSlotsFromParsed, buildInventoryFromParsed, type InitStateInput, type InitStateParsed } from "./pipelines/initState";

export { generateFinaleStory, type FinaleStoryInput, type FinaleStoryParsed } from "./pipelines/finaleStory";
export { generateGrandSummary, type GrandSummaryInput, type GrandSummaryParsed } from "./pipelines/grandSummary";
export { generateRecallStory, type RecallStoryInput, type RecallStoryParsed } from "./pipelines/recallStory";
export { generateMemoryCompress, type MemoryCompressInput, type MemoryCompressParsed } from "./pipelines/memoryCompress";
export { generateState, npcEventsToLegacyFormat, type StateGenerateInput as StateGenInput } from "./pipelines/state";

// ── Presets ──
export { STORY_SYSTEM_PRESET } from "./presets/storyPreset";
export { PRESET } from "./presets/globalPreset";
export { INIT_STORY_SYSTEM_PRESET } from "./presets/initStoryPreset";
export { INIT_STATE_SYSTEM_PRESET } from "./presets/initStatePreset";
export { CULTIVATION_STORY_SYSTEM_PRESET } from "./presets/cultivationStoryPreset";
export { FINALE_STORY_SYSTEM_PRESET } from "./presets/finaleStoryPreset";
export { GRAND_SUMMARY_SYSTEM_PRESET } from "./presets/grandSummaryPreset";
export { RECALL_STORY_SYSTEM_PRESET } from "./presets/recallStoryPreset";
export { buildMemoryCompressSystemPreset, MEMORY_COMPRESS_SHORT2MID_SYSTEM_PRESET, MEMORY_COMPRESS_MID2LONG_SYSTEM_PRESET, type MemoryCompressPresetOptions } from "./presets/memoryCompressPreset";

// ── Composables ──
export { useOpeningStoryFromFateChoice, type OpeningStoryPhase, type OpeningStoryApiSlice } from "./composables/useOpeningStory";
