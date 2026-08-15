<script setup lang="ts">
import { ref, watch, computed, nextTick } from "vue";
import type { OpeningStoryPhase } from "../ai_core";
import { useApiConfig } from "../ai_core";
import { generateStory, generateRecallStory, generateMemoryCompress, type StoryChatEntry } from "../ai_core";
import { generateWorldEvolution } from "../ai_core";
import { generateState, type StateParsed, type BattleTriggerEntry, npcEventsToLegacyFormat } from "../ai_core";
import { CULTIVATION_WORLD_BOOK } from "../ai_core/world_books/cultivationWorldBook";
import type { WorldBookEntry } from "../ai_core/world_books/types";
import { generateFinaleStory } from "../ai_core";
import { generateGrandSummary } from "../ai_core";
import { protagonist, Protagonist } from "../role_core/Protagonist";
import { npcStore } from "../role_core/npcStore";
import { worldMapStore, type WorldMapSerialData } from "../role_core/worldMapStore";
import { storyStore, type StorySerialData, type ChatMessage } from "../role_core/storyStore";
import { memoryArchiveStore } from "../role_core/memoryArchive";
import { writeActiveSave, getActiveDifficulty } from "../save/gameSave";
import type { NpcPlayInfo } from "../role_core/types/playInfo";
import type { InventoryStackItem } from "../role_core/types/items";
import { Character } from "../role_core/Character";
import { gameLog } from "../log/gameLog";
import {
  advanceWorldTime,
  formatWorldTimeZhDisplay,
  calendarYearsElapsed,
  cloneWorldTime,
  type WorldTime,
} from "../role_core/worldTime";
import type { BattleResult } from "../battle_engine/types";
import type { WorldLocation } from "../role_core/types/worldLocation";
import { formatWorldLocationDash, isEmptyWorldLocation, isWorldLocationEqual } from "../role_core/types/worldLocation";
import { reconcileLocation, flattenLocationTree } from "../role_core/worldLocationReconcile";
import { enforceTimeFloor } from "../ai_core/shared/timeFloor";
import type { Npc } from "../role_core/Npc";
import { formatNpcMemories } from "../role_core/npcMemory";
import { autoGeneratePortraits, autoGenerateLocationBackgrounds } from "../image_generate";
import { locationImageStore } from "../role_core/locationImageStore";
import {
  getStorySegments,
  resolveDialogAvatar,
  type DialogAvatarInfo,
  type StorySegment,
} from "./storyDialog";

const props = withDefaults(
  defineProps<{
    phase?: OpeningStoryPhase;
    errorMessage?: string;
    currentWorldLocation?: WorldLocation | null;
    worldTime?: WorldTime;
    battleResult?: BattleResult | null;
  }>(),
  {
    phase: "idle",
    errorMessage: "",
    currentWorldLocation: null,
    worldTime: undefined,
    battleResult: undefined,
  },
);

const { apiUrl, apiKey, apiModel } = useApiConfig();

const emit = defineEmits<{
  "update:worldLocation": [value: WorldLocation | null];
  "update:worldTime": [value: WorldTime];
  "battleTrigger": [value: BattleTriggerEntry];
  "consumeBattleResult": [];
  "generatingChange": [value: boolean];
  "gameOver": [reason: string];
}>();

const chatMessages = storyStore.chatMessages;
const grandSummary = storyStore.grandSummary;
const grandSummaryUpTo = storyStore.grandSummaryUpTo;
const gameOverReason = storyStore.gameOverReason;

const chatBgUrl = computed(() => {
  const loc = storyStore.worldLocation.value;
  if (!loc) return null;
  return locationImageStore.get(loc)?.avatarUrl ?? null;
});
/** 剧情对话段 → 头像展示信息（主角/NPC 头像，无图时首字彩色圆底兜底）。 */
function segAvatar(seg: StorySegment): DialogAvatarInfo {
  return resolveDialogAvatar(seg.sender, protagonist.value, (name) => npcStore.getNpc(name));
}
const inputText = ref("");
const generating = ref(false);
const generatingPhase = ref<"story" | "state" | "summary">("story");
const genError = ref("");
/** 当前显示的四个行动建议（来自状态 AI）。null 时隐藏按钮区。 */
const actionOptions = storyStore.actionOptions;

function beginGenerating(): void {
  generating.value = true;
  generatingPhase.value = "story";
  genError.value = "";
}
const textareaRef = ref<HTMLTextAreaElement | null>(null);
const pendingBattleTrigger = ref<BattleTriggerEntry | null>(null);
const battlePending = computed(() => pendingBattleTrigger.value !== null);

function autoResizeTextarea(): void {
  const el = textareaRef.value;
  if (!el) return;
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 120) + "px";
}

/** 点击快捷选项：填入输入框（玩家可编辑后手动发送），并触发 textarea 自适应高度。 */
function useActionOption(text: string): void {
  inputText.value = text;
  nextTick(() => autoResizeTextarea());
}

let abortCtl: AbortController | null = null;

function buildChatHistory(): StoryChatEntry[] {
  const msgs = chatMessages.value;
  const upTo = grandSummaryUpTo.value;
  const grand = grandSummary.value;

  let latestStoryIdx = -1;
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].type === "story") {
      latestStoryIdx = i;
      break;
    }
  }

  // summary 消息永远在 index 0（物理裁剪后置顶），只扫前几条即可判断是否已裁剪。
  let hasSummaryMsg = false;
  for (let i = 0; i < Math.min(msgs.length, 3); i++) {
    if (msgs[i].type === "summary") {
      hasSummaryMsg = true;
      break;
    }
  }

  const entries: StoryChatEntry[] = [];

  // index < upTo 的消息已被大总结覆盖，跳过；从 upTo 起纳入近期历史。
  // 注：物理裁剪后 upTo 通常归零，summary 消息作为首条纳入，替代旧版的合成前缀。
  for (let idx = Math.max(0, upTo); idx < msgs.length; idx++) {
    const m = msgs[idx];
    if (m.type === "summary") {
      entries.push({ role: "assistant", content: `【剧情总纲·截至早期】\n${m.content.trim()}` });
      continue;
    }
    const isStory = m.type === "story";
    const isLatest = isStory && idx === latestStoryIdx;
    const useSnapshot = isStory && !isLatest && m.snapshot;
    entries.push({
      role: isStory ? ("assistant" as const) : ("user" as const),
      content: useSnapshot ? m.snapshot! : m.content,
    });
  }

  // 兼容旧存档：grandSummary 已生成但尚未物理裁剪时（chatMessages 中无 summary 消息），
  // 沿用旧版合成前缀，避免 AI 在第一次裁剪触发前丢失早期记忆。
  // 一旦物理裁剪发生（summary 消息进入 chatMessages），此兜底自动失效。
  if (!hasSummaryMsg && grand.trim()) {
    entries.unshift({ role: "assistant", content: `【剧情总纲·截至早期】\n${grand.trim()}` });
  }

  return entries;
}

/** 滚动大总结：待总结区达阈值时，把旧快照压缩进约 1000 字总纲。 */
const GRAND_SUMMARY_THRESHOLD = 30;
const GRAND_SUMMARY_KEEP_RECENT = 30;

/** 世界演变：距上次触发至少间隔的回合数。 */
const WORLD_EVOLVE_ROUND_INTERVAL = 5;
/** 世界演变：距上次触发至少经过的年数（时间门控）。 */
const WORLD_EVOLVE_YEAR_THRESHOLD = 2;

/** 多层记忆压缩阈值：回忆档案未压缩区达此数 → 压一条中期记忆。 */
const MID_TERM_COMPRESS_THRESHOLD = 30;
/** 中期记忆条数达此数 → 取最旧一批压一条长期记忆。 */
const LONG_TERM_COMPRESS_THRESHOLD = 50;
/** 中期→长期时每批取多少条最旧中期记忆。 */
const LONG_TERM_COMPRESS_BATCH = 50;

async function maybeGenerateGrandSummary(
  url: string,
  model: string,
  apiKey: string | undefined,
  signal: AbortSignal,
): Promise<void> {
  const msgs = chatMessages.value;
  const storyIndices: number[] = [];
  for (let i = 0; i < msgs.length; i++) {
    if (msgs[i].type === "story") storyIndices.push(i);
  }
  // story 总数不足「保留窗口 + 触发阈值」时无需总结。
  if (storyIndices.length <= GRAND_SUMMARY_KEEP_RECENT + GRAND_SUMMARY_THRESHOLD) return;

  const upTo = grandSummaryUpTo.value;
  // 最近 KEEP_RECENT 条 story 的起始索引：其之前、尚未被总结的 story 构成待总结区。
  const recentStartIdx = storyIndices[storyIndices.length - GRAND_SUMMARY_KEEP_RECENT];

  const toSummarize: string[] = [];
  for (const idx of storyIndices) {
    if (idx < upTo || idx >= recentStartIdx) continue;
    const m = msgs[idx];
    const snap = (m.snapshot && m.snapshot.trim()) || m.content.trim();
    if (snap) toSummarize.push(snap);
  }
  if (toSummarize.length < GRAND_SUMMARY_THRESHOLD) return;

  generatingPhase.value = "summary";
  try {
    const result = await generateGrandSummary({
      apiUrl: url,
      apiKey,
      model,
      oldGrandSummary: grandSummary.value,
      snapshots: toSummarize,
      signal,
    });
    if (signal.aborted) return;
    const summary = result.grandSummary.trim();
    if (summary) {
      // 先用旧引用切片，再整体替换数组。newMsgs 构造完才赋值，避免引用失效。
      const kept = msgs.slice(recentStartIdx);
      const newMsgs: ChatMessage[] = [
        { type: "summary", content: summary },
        ...kept,
      ];
      chatMessages.value = newMsgs;
      grandSummary.value = summary;
      grandSummaryUpTo.value = 0;
      gameLog.info(`[StoryChat] 滚动大总结已更新并裁剪历史（压缩 ${toSummarize.length} 条快照，保留近期 ${kept.length} 条消息）。`);
    }
  } catch (e) {
    gameLog.error("[StoryChat] 大总结生成失败：" + (e instanceof Error ? e.message : String(e)));
  }
}

/**
 * 多层记忆压缩：在 memoryArchive 维度做分层压缩，产出 midTermMemory / longTermMemory，
 * 供统一剧情调用作为长期背景。失败不影响回合。
 *
 * 与 maybeGenerateGrandSummary 的区别：本函数压缩的是永不删除的回忆档案（按 archive 维度），
 * 而 grandSummary 压缩的是会被物理裁剪的 chatMessages。
 */
async function maybeCompressMemory(
  url: string,
  model: string,
  apiKey: string | undefined,
  signal: AbortSignal,
): Promise<void> {
  const archive = memoryArchiveStore.memoryArchive.value;
  const compressedUpTo = storyStore.archiveCompressedUpTo.value ?? 0;
  const uncompressedCount = Math.max(0, archive.length - compressedUpTo);

  // 短期→中期：未压缩回忆达阈值，取最早一批压成一条中期记忆。
  if (uncompressedCount >= MID_TERM_COMPRESS_THRESHOLD) {
    const batch = archive
      .slice(compressedUpTo, compressedUpTo + MID_TERM_COMPRESS_THRESHOLD)
      .map((m) => (m.summary && m.summary.trim()) || m.raw || `第${m.round}回合`)
      .filter(Boolean);
    if (batch.length > 0) {
      generatingPhase.value = "summary";
      try {
        const result = await generateMemoryCompress({
          apiUrl: url,
          apiKey,
          model,
          tier: "short2mid",
          existingSummary: "",
          batch,
          signal,
        });
        if (signal.aborted) return;
        const summary = result.summary.trim();
        if (summary) {
          storyStore.midTermMemory.value.push(summary);
          storyStore.archiveCompressedUpTo.value = compressedUpTo + batch.length;
          gameLog.info(`[StoryChat] 中期记忆压缩完成（压缩 ${batch.length} 回合，现有中期记忆 ${storyStore.midTermMemory.value.length} 条）。`);
        }
      } catch (e) {
        if (signal.aborted) return;
        gameLog.warn("[StoryChat] 中期记忆压缩失败：" + (e instanceof Error ? e.message : String(e)));
      }
    }
  }

  // 中期→长期：中期记忆条数达阈值，取最旧一批压成一条长期记忆。
  const midMem = storyStore.midTermMemory.value;
  if (midMem.length >= LONG_TERM_COMPRESS_THRESHOLD) {
    const batch = midMem.slice(0, LONG_TERM_COMPRESS_BATCH);
    const longExisting = storyStore.longTermMemory.value[storyStore.longTermMemory.value.length - 1] || "";
    generatingPhase.value = "summary";
    try {
      const result = await generateMemoryCompress({
        apiUrl: url,
        apiKey,
        model,
        tier: "mid2long",
        existingSummary: longExisting,
        batch,
        signal,
      });
      if (signal.aborted) return;
      const summary = result.summary.trim();
      if (summary) {
        // 丢弃被压缩的最旧中期记忆，追加新的长期记忆。
        storyStore.midTermMemory.value = midMem.slice(LONG_TERM_COMPRESS_BATCH);
        storyStore.longTermMemory.value.push(summary);
        gameLog.info(`[StoryChat] 长期记忆压缩完成（压缩 ${batch.length} 条中期，现有长期记忆 ${storyStore.longTermMemory.value.length} 条）。`);
      }
    } catch (e) {
      if (signal.aborted) return;
      gameLog.warn("[StoryChat] 长期记忆压缩失败：" + (e instanceof Error ? e.message : String(e)));
    }
  }
}

/** 上次世界演变触发的回合序号与时间（门控用）。 */
let lastWorldEvolveRound = 0;
let lastWorldEvolveTime: WorldTime | null = null;

/**
 * 世界演变（镜头外 NPC 迁移）：按时间/回合门控触发独立次级调用，
 * 把镜头外 NPC 的位置更新应用到 npcStore。失败静默降级，不影响主回合。
 */
async function maybeRunWorldEvolution(
  url: string,
  model: string,
  apiKey: string | undefined,
  signal: AbortSignal,
): Promise<void> {
  if (!url || !model) return;
  const round = memoryArchiveStore.memoryArchive.value.length;
  const curTime = storyStore.worldTime.value ?? null;
  const yearsSince = lastWorldEvolveTime && curTime
    ? calendarYearsElapsed(lastWorldEvolveTime, curTime)
    : 0;
  const roundsSince = round - lastWorldEvolveRound;
  if (!(yearsSince >= WORLD_EVOLVE_YEAR_THRESHOLD || roundsSince >= WORLD_EVOLVE_ROUND_INTERVAL)) return;

  lastWorldEvolveRound = round;
  if (curTime) lastWorldEvolveTime = cloneWorldTime(curTime);

  const loc = storyStore.worldLocation.value ?? null;
  const offscreen = npcStore.allNpcs().filter(
    (n) => n.presence !== "active" && n.presence !== "dead",
  );
  if (offscreen.length === 0) return;

  const registeredLocations = flattenLocationTree(worldMapStore.locationTree.value, {});
  const protagonistName = protagonist.value?.displayName ?? "";
  const protagonistRealm = protagonist.value
    ? `${protagonist.value.realm.major}${protagonist.value.realm.minor}`
    : "";
  try {
    const result = await generateWorldEvolution({
      apiUrl: url,
      apiKey,
      model,
      protagonistName,
      protagonistRealm,
      currentWorldLocation: loc,
      currentWorldTime: curTime ?? undefined,
      elapsedNote: yearsSince > 0 ? `约 ${yearsSince} 年` : `约 ${roundsSince} 回合`,
      offscreenNpcs: offscreen.map((n) => ({
        npcId: n.id,
        displayName: n.displayName,
        identity: n.identity,
        realm: n.realm,
        currentLocation: n.currentLocation,
        storySnapshot: n.storySnapshot,
        presence: n.presence,
      })),
      registeredLocations,
      signal,
    });
    if (signal.aborted) return;
    npcStore.applyNpcMigrations(result.migrations);
  } catch (err) {
    if (signal.aborted) return;
    gameLog.warn("[StoryChat] 世界演变失败：" + (err instanceof Error ? err.message : String(err)));
  }
}

type RoundKind = "chat" | "battle";

interface RoundContext {
  kind: RoundKind;
  userContent: string;
  worldBookEntries?: WorldBookEntry[];
}

/** 一轮「生成前」的完整状态快照，用于重试时回退该轮的全部副作用。 */
/**
 * 一轮「生成前」的状态快照，用于重试时回退该轮的副作用。
 *
 * 设计：重新生成只影响「剧情 + 储物袋 + NPC + 世界地图」，**不触碰**主角的
 * HP/MP/属性/装备/功法/丹药/修为/境界（这些是角色成长结果，不应因换剧情而回退）。
 * 因此只快照 inventorySlots（深拷贝），不快照整个 protagonist。
 */
interface PreGenSnapshot {
  inventorySlots: Array<InventoryStackItem | null>;
  npcs: NpcPlayInfo[];
  worldMap: WorldMapSerialData;
  story: StorySerialData;
  pendingBattleTrigger: BattleTriggerEntry | null;
  userContent: string;
}

/** 上一轮生成开始前的状态快照，供重试回退使用。null 表示当前无可重试的轮次。 */
let lastPreGenSnapshot: PreGenSnapshot | null = null;
/** 是否存在可重试的轮次（响应式，供模板控制重试按钮显隐）。 */
const hasRetryable = ref(false);

/** 捕获生成前的状态快照（在任何修改之前调用）。返回 null 表示主角未就绪。 */
function capturePreGenSnapshot(ctx: RoundContext): PreGenSnapshot | null {
  const p = protagonist.value;
  if (!p) return null;
  return {
    inventorySlots: p.inventorySlots.map(s => s ? JSON.parse(JSON.stringify(s)) as InventoryStackItem : null),
    npcs: npcStore.serializeNpcs(),
    worldMap: worldMapStore.serializeWorldMap(),
    story: storyStore.serializeStory(),
    pendingBattleTrigger: pendingBattleTrigger.value,
    userContent: ctx.userContent,
  };
}

/**
 * 从上一轮快照回退：只还原剧情、储物袋、NPC、世界地图，不触碰主角数值。
 *
 * 主角的 HP/MP/属性/装备(equippedSlots)/功法(gongfaSlots)/丹药(elixirBonuses)/修为/境界
 * 保持当前值不变。因此「上一轮新获得且已穿戴的法宝 / 已入槽的功法 / 已使用的丹药」
 * 不会被强制脱下或扣回——其加成保留，仅储物袋恢复到生成前内容。
 */
function restorePreGenSnapshot(): void {
  const snap = lastPreGenSnapshot;
  if (!snap) return;
  const p = protagonist.value;
  if (p) {
    p.inventorySlots = snap.inventorySlots.map(s => s ? JSON.parse(JSON.stringify(s)) as InventoryStackItem : null);
    Protagonist.notifyChanged();
  }
  npcStore.restoreNpcs(snap.npcs);
  worldMapStore.restoreWorldMap(snap.worldMap);
  storyStore.applyStorySnapshot(snap.story);
  pendingBattleTrigger.value = snap.pendingBattleTrigger;
}

watch(generating, (val) => {
  emit("generatingChange", val);
});

/**
 * 主角进入新地点时：唤醒该地点 dormant NPC 为 active。
 * NPC 的境界/装备/功法演进完全交由剧情 + 状态更新驱动（不再有单独的重评估模块）。
 */
function handleLocationEnter(
  newLocation: WorldLocation,
  worldTime: WorldTime,
): void {
  const dormantHere = npcStore.getDormantNpcsAt(newLocation);
  if (dormantHere.length === 0) return;
  npcStore.wakeDormantAtLocation(newLocation, worldTime);
}

async function applyStateResult(stateResult: StateParsed, linggen: string[], storyBody?: string): Promise<{ gameOverReason?: string }> {
  let gameOverReason: string | undefined;
  const oldLocation = props.currentWorldLocation ?? null;
  // 归并：把 AI 输出地点对齐到已注册地点树（归一化 + 包含匹配），避免重复分支。
  const rawLocation = stateResult.worldLocation && !isEmptyWorldLocation(stateResult.worldLocation)
    ? stateResult.worldLocation
    : null;
  const newLocation = rawLocation
    ? reconcileLocation(rawLocation, worldMapStore.locationTree.value)
    : oldLocation;
  const locationChanged = !isWorldLocationEqual(oldLocation, newLocation);

  // ① 地点切换：旧地点 active NPC 转入休眠。
  try {
    if (locationChanged && oldLocation) {
      npcStore.markDormantAtLocation(oldLocation);
    }
  } catch (e) {
    gameLog.error("[StoryChat] 地点休眠失败：" + (e instanceof Error ? e.message : String(e)));
  }

  try {
    if (newLocation && !isWorldLocationEqual(newLocation, oldLocation)) {
      emit("update:worldLocation", newLocation);
    }
  } catch (e) {
    gameLog.error("[StoryChat] 地点更新失败：" + (e instanceof Error ? e.message : String(e)));
  }

  // ③ 主角状态应用 + 时间推进 + 寿元检测（各步独立容错）。
  const current = protagonist.value;
  let newWorldTime: WorldTime | undefined = props.worldTime;
  if (current) {
    try {
      current.applyStateChanges(stateResult);
    } catch (e) {
      gameLog.error("[StoryChat] 主角状态更新失败：" + (e instanceof Error ? e.message : String(e)));
    }

    try {
      if (stateResult.timeAdvance && props.worldTime) {
        // 防时间冻结：扫描正文关键词，命中跨日/跨月等则强制抬升 delta 下限（只升不降）。
        const raw = stateResult.timeAdvance;
        const { delta: enforced, floorHit } = enforceTimeFloor(storyBody ?? "", raw);
        if (floorHit.length > 0) {
          gameLog.warn(
            `[StoryChat] 时间地板触发：正文命中 ${floorHit.join("，")}，delta ${JSON.stringify(raw)} → ${JSON.stringify(enforced)}`,
          );
        }
        newWorldTime = advanceWorldTime(props.worldTime, enforced);
        emit("update:worldTime", newWorldTime);

        // 寿元耗尽检查：当前年龄 = 开局档案年龄 + 自基线起经过的整年数。
        if (getActiveDifficulty() !== "简单" && newWorldTime) {
          const currentAge = current.age + calendarYearsElapsed(storyStore.worldTimeBaseline.value, newWorldTime);
          if (currentAge >= current.shouyuan) {
            gameLog.warn(`[StoryChat] 寿元耗尽！currentAge=${currentAge}, shouyuan=${current.shouyuan}`);
            gameOverReason = "寿元耗尽，坐化于世";
          }
        }
      }
    } catch (e) {
      gameLog.error("[StoryChat] 时间推进失败：" + (e instanceof Error ? e.message : String(e)));
    }
  }

  // ④ 地点切换：唤醒新地点 dormant NPC（NPC 演进完全交由剧情 + 状态更新驱动）。
  try {
    if (locationChanged && newLocation && newWorldTime) {
      handleLocationEnter(newLocation, newWorldTime);
    }
  } catch (e) {
    gameLog.error("[StoryChat] 地点进入处理失败：" + (e instanceof Error ? e.message : String(e)));
  }

  // ⑤ 在场 NPC 应用：位置由系统同步为主角 reconcile 后地点；离场声明单独应用。
  try {
    if (stateResult.nearbyNpcs.length > 0
      || stateResult.npcCoreChanges.length > 0
      || stateResult.npcSnapshots.length > 0
      || stateResult.npcMemories.length > 0
      || stateResult.npcFavorChanges.length > 0
      || stateResult.npcLeftEvents.length > 0) {
      const createdNpcs = npcStore.applyNpcUpdates(stateResult.nearbyNpcs, linggen, {
        coreChangeEvents: stateResult.npcCoreChanges,
        snapshots: stateResult.npcSnapshots,
        memoryEntries: stateResult.npcMemories,
        favorChanges: stateResult.npcFavorChanges,
        currentLocation: newLocation,
        currentWorldTime: newWorldTime ?? null,
        npcLeftEvents: stateResult.npcLeftEvents,
      });
      autoGeneratePortraits(createdNpcs);
    }
    // 系统权威：在场 NPC 位置 = 主角 reconcile 后地点（修复位置漂移）。
    npcStore.syncActiveLocations(newLocation);
  } catch (e) {
    gameLog.error("[StoryChat] NPC 更新失败：" + (e instanceof Error ? e.message : String(e)));
  }

  // ⑥ 登记新地点到世界地图（使用 reconcile 后的规范地点，避免树/背景 key 错位）。
  try {
    if (rawLocation && newLocation && !isEmptyWorldLocation(newLocation)) {
      worldMapStore.addLocation(newLocation);
      autoGenerateLocationBackgrounds(
        [newLocation],
        protagonist.value?.realm?.major,
      );
    }
  } catch (e) {
    gameLog.error("[StoryChat] 世界地图更新失败：" + (e instanceof Error ? e.message : String(e)));
  }

  // ⑦ 战斗触发校验。
  try {
    if (stateResult.battleTrigger) {
      const missing = findMissingBattleCombatants(stateResult.battleTrigger);
      if (missing.length > 0) {
        gameLog.warn(`[StoryChat] 战斗触发校验失败：${missing.join("、")} 未在 npcStore 中找到或已死亡，本次不触发战斗`);
      } else {
        pendingBattleTrigger.value = stateResult.battleTrigger;
      }
    }
  } catch (e) {
    gameLog.error("[StoryChat] 战斗触发处理失败：" + (e instanceof Error ? e.message : String(e)));
  }

  // <行动选项>：故事调用已设置时保留故事建议；仅当故事未产出时用状态 AI 的建议兜底。
  if (!actionOptions.value) {
    actionOptions.value = stateResult.actionOptions;
  }
  return { gameOverReason };
}

function enterBattle(): void {
  const entry = pendingBattleTrigger.value;
  if (!entry) return;
  pendingBattleTrigger.value = null;
  emit("battleTrigger", entry);
}

/**
 * 校验战斗触发条目：除主角外，所有参战者必须在 npcStore 中存在且未死亡。
 * 返回缺失（未找到或已死亡）的 displayName 列表；空数组表示全部就绪。
 */
function findMissingBattleCombatants(trigger: BattleTriggerEntry): string[] {
  const missing: string[] = [];
  const protagonistName = protagonist.value?.displayName;
  for (const ally of trigger.allies) {
    if (ally.roleHint === "主角") continue;
    if (protagonistName && ally.displayName === protagonistName) continue;
    const npc = npcStore.getNpc(ally.displayName);
    if (!npc || npc.isDead) missing.push(ally.displayName);
  }
  for (const enemy of trigger.enemies) {
    const npc = npcStore.getNpc(enemy.displayName);
    if (!npc || npc.isDead) missing.push(enemy.displayName);
  }
  return missing;
}

async function handleSend(): Promise<void> {
  const msg = inputText.value.trim();
  if (!msg || generating.value) return;

  const p = protagonist.value;
  if (!p) {
    genError.value = "主角数据未就绪，无法生成剧情。";
    return;
  }

  const url = String(apiUrl.value || "").trim();
  const model = String(apiModel.value || "").trim();
  if (!url || !model) {
    genError.value = "未配置 API URL 或模型。";
    return;
  }

  // 校验通过后才清空输入框（校验失败时保留文本供玩家修正）。
  inputText.value = "";
  if (textareaRef.value) textareaRef.value.style.height = "auto";

  await runStoryGenerationRound({ kind: "chat", userContent: msg, worldBookEntries: CULTIVATION_WORLD_BOOK });
}

/**
 * 通用生成管道：push 用户消息 → 生成剧情 → push 剧情消息 → 生成状态 → 应用状态 → 落盘。
 *
 * 两个入口共用此函数：
 * - handleSend（普通对话）：kind="chat"，用 generateStory。
 * - 战斗结果回写：kind="battle"，用 generateStory。
 *
 * 在 push 用户消息之前捕获完整快照到 `lastPreGenSnapshot`，供重试回退使用。
 */
async function runStoryGenerationRound(ctx: RoundContext): Promise<void> {
  const p = protagonist.value;
  if (!p) {
    genError.value = "主角数据未就绪，无法生成剧情。";
    return;
  }

  const url = String(apiUrl.value || "").trim();
  const model = String(apiModel.value || "").trim();
  if (!url || !model) {
    genError.value = "未配置 API URL 或模型。";
    return;
  }

  // 在任何修改之前捕获快照，供后续重试回退。
  const snapshot = capturePreGenSnapshot(ctx);
  if (snapshot) lastPreGenSnapshot = snapshot;

  actionOptions.value = null;
  chatMessages.value.push({ type: "user", content: ctx.userContent });
  beginGenerating();

  const chatHistory: StoryChatEntry[] = buildChatHistory();
  const npcSnapshot = buildNpcSnapshot();

  const ac = new AbortController();
  abortCtl = ac;

  try {
    // 阶段 0.5：剧情回忆检索（RAG）。达到阈值回合后，按玩家输入从回忆档案召回强/弱回忆，
    // 注入主剧情上下文。失败静默降级（空 tag），不打断回合。
    let recallTag = "";
    const recallRound = memoryArchiveStore.memoryArchive.value.length;
    const recallEnabled = storyStore.recallEnabled.value ?? true;
    const recallMinRound = storyStore.recallMinRound.value ?? 10;
    const recallFullN = storyStore.recallFullN.value ?? 20;
    if (recallEnabled && recallRound >= recallMinRound && ctx.userContent.trim()) {
      try {
        const recalled = await generateRecallStory({
          apiUrl: url,
          apiKey: String(apiKey.value || "").trim() || undefined,
          model,
          playerInput: ctx.userContent,
          archive: memoryArchiveStore.memoryArchive.value,
          fullN: recallFullN,
          signal: ac.signal,
        });
        if (abortCtl !== ac) return;
        recallTag = recalled.tagContent;
        gameLog.info(`[StoryChat] 剧情回忆检索完成：${recalled.previewText}`);
      } catch (recallErr) {
        if (ac.signal.aborted) return;
        gameLog.warn(
          "[StoryChat] 剧情回忆检索失败，静默降级：" +
            (recallErr instanceof Error ? recallErr.message : String(recallErr)),
        );
      }
    }

    // 阶段 1：统一剧情生成（MoRanJiangHu 风格，单次调用产出正文/短期记忆/变量规划/剧情规划/行动选项）。
    generatingPhase.value = "story";
    const storyResult = await generateStory({
      apiUrl: url,
      apiKey: String(apiKey.value || "").trim() || undefined,
      model,
      protagonist: p,
      grandSummary: storyStore.grandSummary.value || undefined,
      midTermMemory: storyStore.midTermMemory.value,
      longTermMemory: storyStore.longTermMemory.value,
      recallTag: recallTag || undefined,
      plotPlan: storyStore.plotPlan.value || undefined,
      recentHistory: chatHistory.slice(-5),
      sceneNpcSnapshot: buildSceneNpcSnapshot() || undefined,
      currentWorldLocation: props.currentWorldLocation ?? null,
      signal: ac.signal,
    });
    const storyBody = storyResult.storyBody;

    if (abortCtl !== ac) return;

    if (!storyBody.trim()) {
      genError.value = "模型返回的剧情正文为空。";
      return;
    }

    chatMessages.value.push({ type: "story", content: storyBody.trim() });

    // <短期记忆>：作为本回合剧情消息 snapshot（空时回退状态 AI 的 storySnapshot）。
    const shortTermMemory = storyResult.shortTermMemory.trim();
    if (shortTermMemory) {
      const last = chatMessages.value[chatMessages.value.length - 1];
      if (last && last.type === "story") last.snapshot = shortTermMemory;
    }

    // <剧情规划>：持久化为下回合承接摘要。
    storyStore.plotPlan.value = storyResult.plotPlan.trim();

    // <行动选项>：故事调用优先展示；状态 AI 的建议仅在故事未产出时兜底。
    if (storyResult.actionOptions) {
      actionOptions.value = storyResult.actionOptions;
    }

    try {
      generatingPhase.value = "state";
      const stateResult: StateParsed = await generateState({
        apiUrl: url,
        apiKey: String(apiKey.value || "").trim() || undefined,
        model,
        storyBody,
        protagonist: p,
        currentWorldLocation: props.currentWorldLocation ?? undefined,
        currentWorldTime: props.worldTime,
        registeredLocations: flattenLocationTree(worldMapStore.locationTree.value, {}),
        npcSnapshot: buildStateNpcSnapshot() || undefined,
        variablePlan: storyResult.variablePlan.trim() || undefined,
        signal: ac.signal,
      });

      if (abortCtl !== ac) return;

      const { gameOverReason } = await applyStateResult(stateResult, p.linggen, storyBody);

      // <短期记忆> 为空时，用状态 AI 的 storySnapshot 兜底填充消息快照。
      if (stateResult.storySnapshot.trim()) {
        const last = chatMessages.value[chatMessages.value.length - 1];
        if (last && last.type === "story" && !last.snapshot) {
          last.snapshot = stateResult.storySnapshot.trim();
        }
      }

      // 写入回忆档案（全量回合索引，供 RAG 剧情回忆检索）。summary 优先用故事调用产出的短期记忆。
      memoryArchiveStore.pushMemoryEntry({
        summary: shortTermMemory || stateResult.storySnapshot,
        raw: storyBody,
        worldTime: props.worldTime ?? storyStore.worldTime.value,
      });

      // 滚动大总结：当待总结区达阈值时同步压缩旧快照（失败不影响本轮）。
      await maybeGenerateGrandSummary(url, model, String(apiKey.value || "").trim() || undefined, ac.signal);

      // 多层记忆压缩：在回忆档案维度做分层压缩，产出中/长期记忆供统一剧情调用作长期背景（失败不影响本轮）。
      await maybeCompressMemory(url, model, String(apiKey.value || "").trim() || undefined, ac.signal);

      // 世界演变：按时间/回合门控推进镜头外 NPC 的位置（失败静默降级）。
      await maybeRunWorldEvolution(url, model, String(apiKey.value || "").trim() || undefined, ac.signal);

      if (gameOverReason) {
        // 寿元耗尽：生成走马灯结局叙事（不走状态 AI），然后触发 game over。
        await generateAndAppendFinale(gameOverReason);
      } else {
        writeActiveSave();
      }
    } catch (stateErr) {
      gameLog.error("[StoryChat] 状态更新失败：" + (stateErr instanceof Error ? stateErr.message : String(stateErr)));
    }
  } catch (e) {
    if (ac.signal.aborted) return;
    genError.value = e instanceof Error ? e.message : String(e);
    gameLog.error("[StoryChat] " + genError.value);
  } finally {
    if (abortCtl === ac) abortCtl = null;
    generating.value = false;
    hasRetryable.value = lastPreGenSnapshot !== null;
  }
}

/**
 * 生成走马灯结局叙事并追加到剧情栏，然后触发游戏结束（emit gameOver）。
 * 走马灯回顾主角一生，不走状态 AI（主角已死，无状态需更新）。
 * 无论生成成功与否都会 emit gameOver——主角已死，游戏必须结束。
 */
async function generateAndAppendFinale(reason: string, sceneContext?: string): Promise<void> {
  const p = protagonist.value;
  if (!p) {
    emit("gameOver", reason);
    return;
  }
  const url = String(apiUrl.value || "").trim();
  const model = String(apiModel.value || "").trim();
  if (!url || !model) {
    emit("gameOver", reason);
    return;
  }

  generatingPhase.value = "story";
  const chatHistory: StoryChatEntry[] = buildChatHistory();
  const npcSnapshot = buildNpcSnapshot();

  try {
    const result = await generateFinaleStory({
      apiUrl: url,
      apiKey: String(apiKey.value || "").trim() || undefined,
      model,
      protagonist: p,
      chatHistory,
      deathReason: reason,
      sceneContext,
      npcSnapshot: npcSnapshot || undefined,
    });
    if (result.storyBody.trim()) {
      chatMessages.value.push({ type: "story", content: result.storyBody.trim() });
    }
  } catch (e) {
    gameLog.error("[StoryChat] 走马灯生成失败：" + (e instanceof Error ? e.message : String(e)));
  }

  writeActiveSave();
  emit("gameOver", reason);
}

/**
 * 重试最近一轮：回退上一轮的剧情/储物袋/NPC/世界地图副作用，并把上次的用户消息
 * 填回输入框，供玩家编辑后手动重新发送（统一走普通对话管道）。
 */
function retryLastMessage(): void {
  if (generating.value) return;
  const snap = lastPreGenSnapshot;
  if (!snap) return;

  restorePreGenSnapshot();
  inputText.value = snap.userContent;
  if (textareaRef.value) textareaRef.value.style.height = "auto";
  nextTick(() => autoResizeTextarea());
  lastPreGenSnapshot = null;
  hasRetryable.value = false;
}

/**
 * 最近一条可重试的「用户消息」在 chatMessages 中的索引；-1 表示当前不可重试
 * （无快照 / 生成中 / phase 非 ready / 无用户消息）。
 */
const retryableUserIdx = computed(() => {
  if (!hasRetryable.value || generating.value || props.phase !== "ready") return -1;
  const msgs = chatMessages.value;
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].type === "user") return i;
  }
  return -1;
});

/**
 * 构建发给 AI 的 NPC 上下文快照（三段式精简注入）。
 *
 * - 【当前场景在场】主角所在地点的 active NPC，完整状态（境界/HP/MP/好感/npcId）。
 *   npcId 必须给出，AI 才能在 nearbyNpcs 和核心变更事件里正确引用。
 * - 【本地点休眠】归属本地点但当前不在场的 dormant NPC，简表（用于让 AI 知道这些人
 *   仍在该地点，可在剧情里自然提及）。
 * - 【重要羁绊】高好感或 boss 级 NPC，无论身在何方，简表（老熟人线索）。
 *
 * 已故 NPC 不再出现。token 开销相比「全表灌入」大幅下降，也杜绝了 AI 因看到无关
 * NPC 而误改其数据。
 */
function truncateText(s: string, max: number): string {
  const t = (s ?? "").trim();
  return t.length > max ? t.slice(0, max) + "…" : t;
}

/** 在场状态标签（供 AI 判断谁在场景/留守/已离场，以正确触发离场/迁移）。 */
function npcPresenceLabel(npc: Npc): string {
  switch (npc.presence) {
    case "active": return "在场";
    case "dormant": return "留守";
    case "departed": return "已离场";
    case "dead": return "已故";
    default: return npc.presence;
  }
}

function npcBaseLine(npc: Npc): string {
  const favor = npc.favorability;
  const hp = `${npc.currentHp}/${npc.maxHp}`;
  const mp = `${npc.currentMp}/${npc.maxMp}`;
  const dead = npc.isDead ? " [已故]" : "";
  const cur = npc.currentLocation ? formatWorldLocationDash(npc.currentLocation) : "未知";
  const race = npc.race && npc.race !== "修仙者" ? `，${npc.race}` : "";
  return `${npc.displayName}（npcId:${npc.id}，${npc.identity}${race}，${Character.formatRealm(npc.realm)}，当前:${cur}，状态:${npcPresenceLabel(npc)}，好感${favor}，HP ${hp}，MP ${mp}）${dead}`;
}

function formatNpcFullLine(npc: Npc): string {
  const parts: string[] = [];
  const snap = truncateText(npc.storySnapshot, 30);
  if (snap) parts.push(`近况:${snap}`);
  const mem = formatNpcMemories(npc.memories, 5);
  if (mem) parts.push(`互动记忆:${mem}`);
  return parts.length ? `${npcBaseLine(npc)} ${parts.join("，")}` : npcBaseLine(npc);
}

function formatNpcBriefLine(npc: Npc): string {
  const lastSeen = npc.lastSeenWorldTime ? formatWorldTimeZhDisplay(npc.lastSeenWorldTime) : "未知";
  const cur = npc.currentLocation ? formatWorldLocationDash(npc.currentLocation) : "未知";
  const base = `${npc.displayName}（npcId:${npc.id}，${npc.identity}，${Character.formatRealm(npc.realm)}，当前:${cur}，好感${npc.favorability}，上次见面:${lastSeen}）`;
  const snap = truncateText(npc.storySnapshot, 30);
  return snap ? `${base} 近况:${snap}` : base;
}

function joinSlotNames(slots: ReadonlyArray<{ name?: string } | null> | undefined): string {
  if (!slots) return "";
  return slots
    .map((s) => (s && typeof s.name === "string" ? s.name : ""))
    .filter(Boolean)
    .join("、");
}

/**
 * 状态更新专用：在场 NPC 的完整现状——含储物袋/装备/功法的物品名 + 完整近况。
 * 让状态 AI 知道每个 NPC 现有什么，从而能准确按 itemName 输出 equipment_lost，
 * 并延续其近况快照。
 */
function formatNpcStateLine(npc: Npc): string {
  const extra: string[] = [];
  const equip = joinSlotNames(npc.equippedSlots);
  const gongfa = joinSlotNames(npc.gongfaSlots);
  const inventory = joinSlotNames(npc.inventorySlots);
  if (equip) extra.push(`法宝:${equip}`);
  if (gongfa) extra.push(`功法:${gongfa}`);
  if (inventory) extra.push(`储物:${inventory}`);
  const snap = npc.storySnapshot.trim();
  if (snap) extra.push(`近况:${snap}`);
  const mem = formatNpcMemories(npc.memories, 5);
  if (mem) extra.push(`互动记忆:${mem}`);
  const fbc = npc.favorBreakthroughCondition.trim();
  if (fbc) extra.push(`好感突破条件:${fbc}`);
  return extra.length ? `${npcBaseLine(npc)} ${extra.join("，")}` : npcBaseLine(npc);
}

function buildNpcSnapshot(): string {
  const loc = props.currentWorldLocation ?? null;
  const activeNpcs = loc ? npcStore.getActiveNpcsAt(loc) : [];
  const dormantNpcs = loc ? npcStore.getDormantNpcsAt(loc) : [];
  const activeSet = new Set<Npc>(activeNpcs);
  const dormantSet = new Set<Npc>(dormantNpcs);
  const bondedNpcs = npcStore.getBondedNpcs().filter(n =>
    !activeSet.has(n) && !dormantSet.has(n) && n.presence !== "dead",
  );

  const sections: string[] = [];

  if (activeNpcs.length > 0) {
    sections.push("【当前场景在场NPC】\n" + activeNpcs.map(formatNpcFullLine).join("\n"));
  }
  if (dormantNpcs.length > 0) {
    sections.push("【本地点休眠NPC（曾在此地见过，当前不在场）】\n" + dormantNpcs.map(formatNpcBriefLine).join("\n"));
  }
  if (bondedNpcs.length > 0) {
    sections.push("【重要羁绊NPC（高好感或boss级，可能身在别处）】\n" + bondedNpcs.map(formatNpcBriefLine).join("\n"));
  }

  return sections.join("\n\n");
}

/**
 * 仅当前场景在场 NPC 的快照（给剧情 AI，让它描写与场景 NPC 行为一致）。
 * 比三段式更精简——剧情 AI 只需关心在场者，不需要休眠/羁绊 NPC。
 */
function buildSceneNpcSnapshot(): string {
  const loc = props.currentWorldLocation ?? null;
  const activeNpcs = loc ? npcStore.getActiveNpcsAt(loc) : [];
  return activeNpcs.map(formatNpcFullLine).join("\n");
}

/**
 * 状态更新专用 NPC 现状快照：在场者用 formatNpcStateLine（含储物/装备/功法名 + 完整近况），
 * 休眠/羁绊 NPC 用简表。供 generateState 据此准确输出 NPC 核心变更与近况。
 */
function buildStateNpcSnapshot(): string {
  const loc = props.currentWorldLocation ?? null;
  const activeNpcs = loc ? npcStore.getActiveNpcsAt(loc) : [];
  const dormantNpcs = loc ? npcStore.getDormantNpcsAt(loc) : [];
  const activeSet = new Set<Npc>(activeNpcs);
  const dormantSet = new Set<Npc>(dormantNpcs);
  const bondedNpcs = npcStore.getBondedNpcs().filter(n =>
    !activeSet.has(n) && !dormantSet.has(n) && n.presence !== "dead",
  );

  const sections: string[] = [];
  if (activeNpcs.length > 0) {
    sections.push("【当前场景在场NPC】\n" + activeNpcs.map(formatNpcStateLine).join("\n"));
  }
  if (dormantNpcs.length > 0) {
    sections.push("【本地点休眠NPC（曾在此地见过，当前不在场）】\n" + dormantNpcs.map(formatNpcBriefLine).join("\n"));
  }
  if (bondedNpcs.length > 0) {
    sections.push("【重要羁绊NPC（高好感或boss级，可能身在别处）】\n" + bondedNpcs.map(formatNpcBriefLine).join("\n"));
  }
  return sections.join("\n\n");
}

function onInputKeydown(e: KeyboardEvent): void {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    handleSend();
  }
}

function formatBattleResultMessage(r: BattleResult): string {
  const outcomeMap: Record<string, string> = {
    victory: "胜",
    defeat: "败",
    fled: "撤退",
  };
  const outcomeText = outcomeMap[r.outcome];
  const enemyText = r.enemyNames.join("、");

  const parts: string[] = [];
  parts.push(`与${enemyText}的战斗结束，${outcomeText}。`);

  if (r.enemiesKilled.length > 0) {
    parts.push(`${r.enemiesKilled.join("、")}已被击杀。`);
  }

  if (r.protagonistDied) {
    parts.push("主角不幸陨落，魂归天地。");
  }

  return parts.join("");
}

watch(
  () => props.battleResult,
  async (result) => {
    if (!result) return;
    emit("consumeBattleResult");
    if (result.protagonistDied) {
      // 战败身亡：先展示战斗结算气泡（与非死亡战斗一致），再生成走马灯结局叙事，完成后触发 game over。
      chatMessages.value.push({ type: "user", content: formatBattleResultMessage(result) });
      beginGenerating();
      try {
        await generateAndAppendFinale("战败身亡，魂归天地", formatBattleResultMessage(result));
      } finally {
        generating.value = false;
        hasRetryable.value = false;
      }
    } else {
      await runStoryGenerationRound({
        kind: "battle",
        userContent: formatBattleResultMessage(result),
      });
    }
  },
);
</script>

<template>
  <section class="main-panel main-panel--story" aria-label="剧情对话">
    <header class="main-panel__head">
      <h2 class="main-panel__title">剧情</h2>
      <div v-if="currentWorldLocation" class="main-panel__location-breadcrumb">
        <span v-if="currentWorldLocation.region" class="mj-breadcrumb-seg">{{ currentWorldLocation.region }}</span>
        <template v-if="currentWorldLocation.country">
          <span class="mj-breadcrumb-sep">›</span>
          <span class="mj-breadcrumb-seg">{{ currentWorldLocation.country }}</span>
        </template>
        <template v-if="currentWorldLocation.area">
          <span class="mj-breadcrumb-sep">›</span>
          <span class="mj-breadcrumb-seg">{{ currentWorldLocation.area }}</span>
        </template>
        <template v-if="currentWorldLocation.detail">
          <span class="mj-breadcrumb-sep">›</span>
          <span class="mj-breadcrumb-seg mj-breadcrumb-seg--detail">{{ currentWorldLocation.detail }}</span>
        </template>
      </div>
    </header>
    <div class="main-panel__body">
      <div
        class="main-panel__chat-messages"
        :class="{ 'main-panel__chat-messages--has-bg': chatBgUrl }"
        :style="chatBgUrl ? { backgroundImage: `linear-gradient(rgba(10, 16, 12, 0.82), rgba(10, 16, 12, 0.82)), url(${chatBgUrl})` } : {}"
        aria-label="剧情正文区域"
        aria-live="polite"
      >
         <p v-if="phase === 'loading' && chatMessages.length === 0" class="main-panel__placeholder">
           完成命运抉择并进入主界面后，开局剧情将显示于此。
         </p>
        <p
          v-else-if="phase === 'error' && chatMessages.length === 0"
          class="main-panel__story-status main-panel__story-status--error"
        >
          {{ errorMessage || "开局剧情生成失败。" }}
        </p>
        <p
          v-else-if="phase === 'idle' && chatMessages.length === 0"
          class="main-panel__placeholder"
        >
          完成命运抉择并进入主界面后，开局剧情将显示于此。
        </p>
        <template v-else>
          <div
            v-for="(msg, idx) in chatMessages"
            :key="idx"
            :class="['main-panel__chat-item', `main-panel__chat-item--${msg.type}`]"
          >
            <template v-if="msg.type === 'summary'">
              <div class="main-panel__chat-bubble main-panel__chat-bubble--summary">
                <div class="main-panel__summary-title">【剧情总纲·早期经历】</div>
                <div class="main-panel__story-prose">{{ msg.content }}</div>
              </div>
            </template>
            <template v-else-if="msg.type === 'story'">
              <div
                v-for="(seg, segIdx) in getStorySegments(msg)"
                :key="`story-${idx}-${segIdx}`"
                class="main-panel__dialog"
              >
                <div v-if="seg.kind === 'narration'" class="main-panel__dialog-narration">
                  <div class="main-panel__story-prose">{{ seg.text }}</div>
                </div>
                <div
                  v-else
                  :class="[
                    'main-panel__dialog-row',
                    segAvatar(seg).isProtagonist
                      ? 'main-panel__dialog-row--right'
                      : 'main-panel__dialog-row--left',
                  ]"
                >
                  <div class="main-panel__dialog-avatar-col">
                    <div
                      class="main-panel__dialog-avatar"
                      :class="{ 'main-panel__dialog-avatar--img': segAvatar(seg).avatarUrl }"
                      :style="
                        segAvatar(seg).avatarUrl
                          ? { backgroundImage: `url(${segAvatar(seg).avatarUrl})` }
                          : { backgroundColor: segAvatar(seg).color }
                      "
                    >
                      <span
                        v-if="!segAvatar(seg).avatarUrl"
                        class="main-panel__dialog-avatar-initial"
                      >
                        {{ segAvatar(seg).name.slice(0, 1) }}
                      </span>
                    </div>
                    <div class="main-panel__dialog-name">{{ segAvatar(seg).name }}</div>
                  </div>
                  <div class="main-panel__dialog-bubble">
                    <div class="main-panel__story-prose">{{ seg.text }}</div>
                  </div>
                </div>
              </div>
            </template>
            <template v-else>
              <button
                v-if="idx === retryableUserIdx"
                type="button"
                class="main-panel__retry-btn"
                title="重新生成本轮剧情与状态"
                @click="retryLastMessage"
              >
                <i class="fa-solid fa-rotate-left" aria-hidden="true"></i>
              </button>
              <div class="main-panel__chat-bubble main-panel__chat-bubble--user">
                {{ msg.content }}
              </div>
            </template>
          </div>
        </template>
      </div>
      <div class="main-panel__composer-area">
        <div v-if="generating || phase === 'loading'" class="main-panel__composer-status main-panel__composer-status--loading">
          <span class="main-panel__status-pulse"></span>
          {{ phase === 'loading' && chatMessages.length > 0 ? 'AI 正在更新开局状态…' : phase === 'loading' ? 'AI 正在生成剧情…' : (generatingPhase === 'state' ? 'AI 正在更新状态…' : (generatingPhase === 'summary' ? 'AI 正在整理过往经历…' : 'AI 正在生成剧情…')) }}
        </div>
        <div v-else-if="genError" class="main-panel__composer-status main-panel__composer-status--error">
          <i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i>{{ genError }}
        </div>
        <div v-if="battlePending" class="main-panel__battle-entry main-panel__battle-entry--inline">
          <button type="button" class="main-panel__battle-entry-btn" @click="enterBattle">
            <i class="fa-solid fa-swords" aria-hidden="true"></i>
            进入战斗
          </button>
        </div>
        <div v-else-if="phase === 'ended'" class="main-panel__gameover-banner">
          <i class="fa-solid fa-skull" aria-hidden="true"></i>
          <span>游戏结束 · {{ gameOverReason }}</span>
        </div>
        <div v-else class="main-panel__composer">
          <div
            v-if="actionOptions && phase === 'ready'"
            class="main-panel__action-options"
            aria-label="快捷行动选项"
          >
            <button
              type="button"
              class="action-option"
              @click="useActionOption(actionOptions.aggressive)"
              :title="actionOptions.aggressive"
            >
              <span class="action-option__text">{{ actionOptions.aggressive }}</span>
            </button>
            <button
              type="button"
              class="action-option"
              @click="useActionOption(actionOptions.moderate)"
              :title="actionOptions.moderate"
            >
              <span class="action-option__text">{{ actionOptions.moderate }}</span>
            </button>
            <button
              type="button"
              class="action-option"
              @click="useActionOption(actionOptions.cautious)"
              :title="actionOptions.cautious"
            >
              <span class="action-option__text">{{ actionOptions.cautious }}</span>
            </button>
            <button
              type="button"
              class="action-option"
              @click="useActionOption(actionOptions.veryCautious)"
              :title="actionOptions.veryCautious"
            >
              <span class="action-option__text">{{ actionOptions.veryCautious }}</span>
            </button>
          </div>
          <textarea
            ref="textareaRef"
            class="main-panel__input"
            :readonly="generating"
            :disabled="phase !== 'ready'"
            placeholder="输入你的行动…"
            aria-label="消息输入"
            v-model="inputText"
            @input="autoResizeTextarea"
            @keydown="onInputKeydown"
            rows="1"
          />
          <button
            type="button"
            class="main-screen__btn"
            :disabled="generating || phase !== 'ready' || !inputText.trim()"
            @click="handleSend"
          >
            {{ generating ? "生成中…" : "发送" }}
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
