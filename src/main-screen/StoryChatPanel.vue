<script setup lang="ts">
import { ref, watch, computed, nextTick } from "vue";
import type { OpeningStoryPhase } from "../ai/useOpeningStory";
import { useApiConfig } from "../ai/useApiConfig";
import { generateStory, type StoryChatEntry } from "../ai/story_generate";
import { generateState, type StateParsed, type BattleTriggerEntry } from "../ai/state_generate";
import { generateCultivationStory } from "../ai/cultivation_story_generate";
import { generateFinaleStory } from "../ai/finale_story_generate";
import { generateGrandSummary } from "../ai/grand_summary_generate";
import { generateNpcReevaluation } from "../ai/npc_reevaluation_generate";
import type { CultivationInput } from "../ai/cultivation_types";
import { protagonist, Protagonist } from "../role_core/Protagonist";
import { npcStore } from "../role_core/npcStore";
import { worldMapStore, type WorldMapSerialData } from "../role_core/worldMapStore";
import { storyStore, type StorySerialData, type ChatMessage } from "../role_core/storyStore";
import { writeActiveSave, getActiveDifficulty } from "../save/gameSave";
import type { NpcPlayInfo } from "../role_core/types/playInfo";
import type { InventoryStackItem } from "../role_core/types/itemInfo";
import { Character } from "../role_core/Character";
import { gameLog } from "../log/gameLog";
import {
  advanceWorldTime,
  formatWorldTimeZhDisplay,
  worldTimeYearsBetween,
  calendarYearsElapsed,
  NPC_REEVALUATION_THRESHOLD_YEARS,
  type WorldTime,
} from "../role_core/worldTime";
import type { BattleResult } from "../battle_engine/types";
import type { WorldLocation } from "../role_core/types/worldLocation";
import { formatWorldLocationDash, isEmptyWorldLocation, isWorldLocationEqual } from "../role_core/types/worldLocation";
import type { Npc } from "../role_core/Npc";
import { autoGeneratePortraits, autoGenerateLocationBackgrounds } from "../image_generate";
import { locationImageStore } from "../role_core/locationImageStore";

const props = withDefaults(
  defineProps<{
    phase?: OpeningStoryPhase;
    errorMessage?: string;
    currentWorldLocation?: WorldLocation | null;
    worldTime?: WorldTime;
    battleResult?: BattleResult | null;
    cultivationInput?: CultivationInput | null;
  }>(),
  {
    phase: "idle",
    errorMessage: "",
    currentWorldLocation: null,
    worldTime: undefined,
    battleResult: undefined,
    cultivationInput: null,
  },
);

const { apiUrl, apiKey, apiModel } = useApiConfig();

const emit = defineEmits<{
  "update:worldLocation": [value: WorldLocation | null];
  "update:worldTime": [value: WorldTime];
  "battleTrigger": [value: BattleTriggerEntry];
  "consumeBattleResult": [];
  "consumeCultivation": [];
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

type RoundKind = "chat" | "battle" | "cultivation";

interface RoundContext {
  kind: RoundKind;
  userContent: string;
  cultivationInput?: CultivationInput;
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
 * 主角进入新地点时：唤醒该地点 dormant NPC，并对长期未见的（≥ NPC_REEVALUATION_THRESHOLD_YEARS）
 * 批量触发 AI 核心层重评估。低频、批量、整体性更新，是「严格事件驱动」的受控例外。
 */
async function handleLocationEnter(
  newLocation: WorldLocation,
  worldTime: WorldTime,
  linggen: string[],
): Promise<void> {
  // wake 前先收集 dormant 列表（此时 lastSeen 仍是旧值，用于算 gap）。
  const dormantHere = npcStore.getDormantNpcsAt(newLocation);
  if (dormantHere.length === 0) return;

  // 计算每个 dormant NPC 的间隔年数，筛出需重评估者。
  const reevaluationBatch: Array<{ npc: Npc; gap: number }> = [];
  let maxGap = 0;
  for (const npc of dormantHere) {
    const gap = worldTimeYearsBetween(npc.lastSeenWorldTime, worldTime);
    if (gap >= NPC_REEVALUATION_THRESHOLD_YEARS) {
      reevaluationBatch.push({ npc, gap });
      if (gap > maxGap) maxGap = gap;
    }
  }

  // 唤醒（更新 presence + lastSeen=now）。
  npcStore.wakeDormantAtLocation(newLocation, worldTime);

  if (reevaluationBatch.length === 0) return;

  const url = String(apiUrl.value || "").trim();
  const model = String(apiModel.value || "").trim();
  if (!url || !model) return;

  const p = protagonist.value;
  try {
    gameLog.info(`[StoryChat] 重评估 ${reevaluationBatch.length} 名长期未见的 NPC（间隔约 ${maxGap.toFixed(1)} 年）…`);
    const results = await generateNpcReevaluation({
      apiUrl: url,
      apiKey: String(apiKey.value || "").trim() || undefined,
      model,
      yearsElapsed: maxGap,
      currentWorldTime: worldTime,
      protagonistRealm: p ? { major: p.realm.major, minor: p.realm.minor } : { major: "练气", minor: "初期" },
      npcs: reevaluationBatch.map(b => b.npc),
      signal: undefined,
    });
    npcStore.applyReevaluation(results, linggen);
  } catch (e) {
    gameLog.error("[StoryChat] NPC 重评估失败：" + (e instanceof Error ? e.message : String(e)));
  }
}

async function applyStateResult(stateResult: StateParsed, linggen: string[]): Promise<{ gameOverReason?: string }> {
  let gameOverReason: string | undefined;
  const oldLocation = props.currentWorldLocation ?? null;
  const newLocation = stateResult.worldLocation && !isEmptyWorldLocation(stateResult.worldLocation)
    ? stateResult.worldLocation
    : oldLocation;
  const locationChanged = !isWorldLocationEqual(oldLocation, newLocation);

  // ① 快照旧地点 active 集合（在 markDormant 之前），用于后续判定跨地点跟随的合法性。
  const oldActiveSet = locationChanged && oldLocation
    ? new Set(npcStore.getActiveNpcsAt(oldLocation))
    : new Set<Npc>();

  // ② 地点切换：旧地点 active NPC 转入休眠。
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
        const delta = stateResult.timeAdvance;
        newWorldTime = advanceWorldTime(props.worldTime, delta);
        emit("update:worldTime", newWorldTime);
        // 时间推进后清理已到期的限时增益（餐食等）。到期判定本身是惰性的，
        // 此处只做物理移除，避免失效项在存档中无限堆积。
        current.purgeExpiredBuffs();

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

  // ④ 地点切换：唤醒新地点 dormant NPC，并对长期未见的批量重评估。
  try {
    if (locationChanged && newLocation && newWorldTime) {
      await handleLocationEnter(newLocation, newWorldTime, linggen);
    }
  } catch (e) {
    gameLog.error("[StoryChat] 地点进入处理失败：" + (e instanceof Error ? e.message : String(e)));
  }

  // ⑤ nearbyNpcs 一致性校正 + 跨地点迁移合法性过滤 + NPC 更新。
  try {
    let nearbyNpcsToApply = stateResult.nearbyNpcs;
    if (nearbyNpcsToApply.length > 0) {
      nearbyNpcsToApply = nearbyNpcsToApply.map(entry => {
        if (newLocation && (!entry.currentLocation || !isWorldLocationEqual(entry.currentLocation, newLocation))) {
          if (entry.currentLocation) {
            gameLog.warn(`[StoryChat] NPC「${entry.displayName}」的 currentLocation 与主角地点不符，已强制校正`);
          }
          return { ...entry, currentLocation: { ...newLocation } };
        }
        return entry;
      });

      if (locationChanged && oldLocation) {
        nearbyNpcsToApply = nearbyNpcsToApply.filter(entry => {
          const existing = entry.npcId
            ? npcStore.getNpcById(entry.npcId)
            : (entry.displayName ? npcStore.getNpc(entry.displayName) : undefined);
          // 新 NPC 或无位置信息：保留
          if (!existing || !existing.currentLocation) return true;
          // 上一回合在旧地点 active：合法跟随主角迁移
          if (oldActiveSet.has(existing)) return true;
          // 上一回合就在新地点（被唤醒的 dormant 或本就在场）：保留
          if (isWorldLocationEqual(existing.currentLocation, newLocation)) return true;
          // 上一回合在第三地 dormant：不可能瞬间跨地点，剔除并告警
          gameLog.warn(`[StoryChat] 地点切换兜底：剔除 NPC「${existing.displayName}」误入新地点 nearbyNpcs（上一回合在 ${formatWorldLocationDash(existing.currentLocation)}，不可能瞬间跨地点）`);
          return false;
        });
      }
    }

    if (nearbyNpcsToApply.length > 0 || stateResult.npcCoreChanges.length > 0) {
      const createdNpcs = npcStore.applyNpcUpdates(nearbyNpcsToApply, linggen, {
        coreChangeEvents: stateResult.npcCoreChanges,
        currentLocation: newLocation,
        currentWorldTime: newWorldTime ?? null,
      });
      autoGeneratePortraits(createdNpcs);
    }
  } catch (e) {
    gameLog.error("[StoryChat] NPC 更新失败：" + (e instanceof Error ? e.message : String(e)));
  }

  // ⑥ 登记新地点到世界地图。
  try {
    if (stateResult.worldLocation && !isEmptyWorldLocation(stateResult.worldLocation)) {
      worldMapStore.addLocation(stateResult.worldLocation);
      autoGenerateLocationBackgrounds(
        [stateResult.worldLocation],
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

  actionOptions.value = stateResult.actionOptions;
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

  await runStoryGenerationRound({ kind: "chat", userContent: msg });
}

/**
 * 通用生成管道：push 用户消息 → 生成剧情 → push 剧情消息 → 生成状态 → 应用状态 → 落盘。
 *
 * 三个入口共用此函数：
 * - handleSend（普通对话）：kind="chat"，用 generateStory。
 * - 战斗结果回写：kind="battle"，用 generateStory。
 * - 修炼回写：kind="cultivation"，用 generateCultivationStory（需要 cultivationInput）。
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
    // 阶段 1：生成剧情正文（修炼走 generateCultivationStory，其余走 generateStory）。
    let storyBody: string;
    if (ctx.kind === "cultivation" && ctx.cultivationInput) {
      const ci = ctx.cultivationInput;
      const cultResult = await generateCultivationStory({
        apiUrl: url,
        apiKey: String(apiKey.value || "").trim() || undefined,
        model,
        gongfaName: ci.gongfaName,
        gongfaGrade: ci.gongfaGrade,
        gongfaSystem: ci.gongfaSystem,
        currentMastery: ci.currentMastery,
        currentMasteryExp: ci.currentMasteryExp,
        masteryThreshold: ci.masteryThreshold,
        spiritStoneCount: ci.spiritStoneCount,
        estimatedMonths: ci.estimatedMonths,
        protagonist: p,
        currentWorldLocation: props.currentWorldLocation ?? undefined,
        npcSnapshot: npcSnapshot || undefined,
        chatHistory,
        signal: ac.signal,
      });
      storyBody = cultResult.storyBody;
    } else {
      const storyResult = await generateStory({
        apiUrl: url,
        apiKey: String(apiKey.value || "").trim() || undefined,
        model,
        protagonist: p,
        chatHistory,
        sceneNpcSnapshot: buildSceneNpcSnapshot() || undefined,
        currentWorldLocation: props.currentWorldLocation ? formatWorldLocationDash(props.currentWorldLocation) : undefined,
        signal: ac.signal,
      });
      storyBody = storyResult.storyBody;
    }

    if (abortCtl !== ac) return;

    if (!storyBody.trim()) {
      genError.value = "模型返回的剧情正文为空。";
      return;
    }

    chatMessages.value.push({ type: "story", content: storyBody.trim() });

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
        npcSnapshot: npcSnapshot || undefined,
        signal: ac.signal,
      });

      if (abortCtl !== ac) return;

      const { gameOverReason } = await applyStateResult(stateResult, p.linggen);

      if (stateResult.storySnapshot.trim()) {
        const last = chatMessages.value[chatMessages.value.length - 1];
        if (last && last.type === "story") {
          last.snapshot = stateResult.storySnapshot.trim();
        }
      }

      // 滚动大总结：当待总结区达阈值时同步压缩旧快照（失败不影响本轮）。
      await maybeGenerateGrandSummary(url, model, String(apiKey.value || "").trim() || undefined, ac.signal);

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
function formatNpcFullLine(npc: Npc): string {
  const favor = npc.favorability;
  const hp = `${npc.currentHp}/${npc.maxHp}`;
  const mp = `${npc.currentMp}/${npc.maxMp}`;
  const dead = npc.isDead ? " [已故]" : "";
  const cur = npc.currentLocation ? formatWorldLocationDash(npc.currentLocation) : "未知";
  const race = npc.race && npc.race !== "修仙者" ? `，${npc.race}` : "";
  const rel = npc.relation ? `，关系:${npc.relation}` : "";
  return `${npc.displayName}（npcId:${npc.id}，${npc.identity}${race}${rel}，${Character.formatRealm(npc.realm)}，当前:${cur}，好感${favor}，HP ${hp}，MP ${mp}）${dead}`;
}

function formatNpcBriefLine(npc: Npc): string {
  const lastSeen = npc.lastSeenWorldTime ? formatWorldTimeZhDisplay(npc.lastSeenWorldTime) : "未知";
  const cur = npc.currentLocation ? formatWorldLocationDash(npc.currentLocation) : "未知";
  const rel = npc.relation ? `，关系:${npc.relation}` : "";
  return `${npc.displayName}（npcId:${npc.id}，${npc.identity}${rel}，${Character.formatRealm(npc.realm)}，当前:${cur}，好感${npc.favorability}，上次见面:${lastSeen}）`;
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

function formatCultivationMessage(input: CultivationInput): string {
  const years = Math.floor(input.estimatedMonths / 12);
  const months = input.estimatedMonths % 12;
  const timeParts: string[] = [];
  if (years > 0) timeParts.push(`${years}年`);
  if (months > 0) timeParts.push(`${months}个月`);
  const timeStr = timeParts.join("") || "数日";

  return `取出${input.spiritStoneCount}枚灵石，开始闭关修炼${input.gongfaName}，预计需要${timeStr}。`;
}

watch(
  () => props.cultivationInput,
  async (input) => {
    if (!input) return;
    emit("consumeCultivation");
    await runStoryGenerationRound({
      kind: "cultivation",
      userContent: formatCultivationMessage(input),
      cultivationInput: input,
    });
  },
);

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
        <p v-if="phase === 'loading' && chatMessages.length === 0" class="main-panel__story-status main-panel__story-status--loading">
          正在生成开局剧情…
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
              <div class="main-panel__chat-bubble main-panel__chat-bubble--story">
                <div class="main-panel__story-prose">{{ msg.content }}</div>
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
        <div v-if="generating || (phase === 'loading' && chatMessages.length > 0)" class="main-panel__composer-status main-panel__composer-status--loading">
          <span class="main-panel__status-pulse"></span>
          {{ phase === 'loading' && chatMessages.length > 0 ? 'AI 正在更新开局状态…' : (generatingPhase === 'state' ? 'AI 正在更新状态…' : (generatingPhase === 'summary' ? 'AI 正在整理过往经历…' : 'AI 正在生成剧情…')) }}
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
