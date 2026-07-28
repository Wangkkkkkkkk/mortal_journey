/**
 * Composable: useOpeningStory
 *
 * 命运抉择确认后：创建主角 → 请求开局剧情 AI → 请求开局状态 AI →
 * 应用装备/功法/储物袋/HP → 创建 NPC → 注册地点 → 结算天赋 → 注入聊天 → 保存。
 *
 * 全部持久化状态写入 storyStore 单例；返回 storyStore 的 ref 给 MainScreen/StoryChatPanel。
 */

import { ref, watch, type Ref, type ComputedRef } from "vue";
import { generateInitStory, type InitStoryInput } from "../pipelines/initStory";
import { generateInitState, type InitStateInput, type InitStateParsed } from "../pipelines/initState";
import { generatePlotOutline } from "../pipelines/plotOutline";
import type { ActionSuggestions } from "../types/stateDiff";
import type { WorldTime } from "../../role_core/worldTime";
import {
  cloneWorldTime,
  createDefaultWorldTime,
} from "../../role_core/worldTime";
import type { WorldLocation } from "../../role_core/types/worldLocation";
import { isEmptyWorldLocation } from "../../role_core/types/worldLocation";
import { Protagonist, protagonist } from "../../role_core/Protagonist";
import { npcStore } from "../../role_core/npcStore";
import { worldMapStore } from "../../role_core/worldMapStore";
import { storyStore } from "../../role_core/storyStore";
import { writeActiveSave } from "../../save/gameSave";
import { autoGeneratePortraits } from "../../image_generate";
import type { FateChoiceResult } from "../../fate_choice/types";
import type { NpcNearbyEntry } from "../types/npcEvents";
import type { NpcEvent } from "../types/npcEvents";
import { gameLog } from "../../log/gameLog";

export type OpeningStoryPhase = "idle" | "loading" | "ready" | "error" | "ended";

export interface OpeningStoryApiSlice {
  apiUrl: string;
  apiKey: string;
  apiModel: string;
}

/**
 * 把 InitStateParsed.npcEvents (NpcEvent[]) 转换为 NpcNearbyEntry[]，
 * 供 npcStore.applyNpcUpdates 使用。
 */
function npcEventsToNearbyEntries(events: NpcEvent[]): NpcNearbyEntry[] {
  const entries: NpcNearbyEntry[] = [];
  for (const event of events) {
    if (event.kind === "npc_appeared") {
      const n = event.npc;
      entries.push({
        npcId: n.npcId,
        displayName: n.displayName,
        identity: n.identity,
        isDead: false,
        favorability: n.favorability,
        race: n.race,
        appearance: n.appearance,
        clothing: n.clothing,
        gender: n.gender,
        age: n.age,
        linggen: n.linggen,
        realm: n.realm,
        hpPercent: n.hpPercent,
        mpPercent: n.mpPercent,
        currentLocation: n.currentLocation ?? undefined,
        equippedSlots: n.equippedSlots,
        gongfaSlots: n.gongfaSlots,
        inventorySlots: n.inventorySlots,
      });
    }
  }
  return entries;
}

export function useOpeningStoryFromFateChoice(
  fateChoice: Ref<FateChoiceResult | null | undefined>,
  api: Ref<OpeningStoryApiSlice> | ComputedRef<OpeningStoryApiSlice>,
): {
  storyBody: Ref<string>;
  phase: Ref<OpeningStoryPhase>;
  errorMessage: Ref<string>;
  worldTime: Ref<WorldTime>;
  worldTimeBaseline: Ref<WorldTime>;
  worldLocation: Ref<WorldLocation | null>;
  initSnapshot: Ref<string>;
  initActionOptions: Ref<ActionSuggestions | null>;
} {
  const errorMessage = ref("");

  let abortCtl: AbortController | null = null;

  function resetWorldClock(): void {
    const w = createDefaultWorldTime();
    storyStore.worldTime.value = w;
    storyStore.worldTimeBaseline.value = cloneWorldTime(w);
    storyStore.worldLocation.value = null;
    storyStore.initSnapshot.value = "";
    storyStore.actionOptions.value = null;
  }

  function resetStoryOnly(): void {
    storyStore.storyBody.value = "";
    errorMessage.value = "";
    storyStore.phase.value = "idle";
    storyStore.chatMessages.value = [];
    storyStore.plotOutline.value = "";
    storyStore.outlineTurnCounter.value = 0;
    storyStore.outlineWorldLocation.value = null;
    resetWorldClock();
  }

  function seedOpeningChatMessage(): void {
    const body = storyStore.storyBody.value.trim();
    if (!body) return;
    if (storyStore.chatMessages.value.length > 0) return;
    storyStore.chatMessages.value.push({
      type: "story",
      content: body,
      snapshot: storyStore.initSnapshot.value.trim() || undefined,
    });
  }

  watch(
    fateChoice,
    async (fc) => {
      abortCtl?.abort();
      abortCtl = null;

      // 读档会话：storyStore 已由 restoreSave 灌满，既不清空也不重跑 AI。
      if (storyStore.restored.value) return;

      if (!fc) {
        Protagonist.clear();
        resetStoryOnly();
        return;
      }

      Protagonist.loadFromFateChoice(fc);
      storyStore.storyBody.value = "";
      errorMessage.value = "";
      storyStore.chatMessages.value = [];
      resetWorldClock();

      const { apiUrl, apiKey, apiModel } = api.value;
      const url = String(apiUrl || "").trim();
      const model = String(apiModel || "").trim();
      if (!url || !model) {
        storyStore.phase.value = "error";
        errorMessage.value = "未配置 API URL 或模型，无法生成开局剧情。";
        gameLog.warn("[OpeningStory] " + errorMessage.value);
        return;
      }

      const p = protagonist.value;
      if (!p) {
        storyStore.phase.value = "error";
        errorMessage.value = "主角数据未就绪。";
        return;
      }

      const ac = new AbortController();
      abortCtl = ac;
      storyStore.phase.value = "loading";

      try {
        // ── 1. 开局剧情 ──
        const storyInput: InitStoryInput = {
          apiUrl: url,
          apiKey: String(apiKey || "").trim() || undefined,
          model,
          signal: ac.signal,
          protagonist: p,
        };

        const storyResult = await generateInitStory(storyInput);
        if (abortCtl !== ac) return;

        if (!storyResult.storyBody.trim()) {
          storyStore.phase.value = "error";
          errorMessage.value = "模型返回的开局正文为空。";
          return;
        }

        storyStore.storyBody.value = storyResult.storyBody;

        // 剧情生成后立即显示，不等状态
        seedOpeningChatMessage();

        // ── 2. 开局状态 ──
        try {
          const stateInput: InitStateInput = {
            apiUrl: url,
            apiKey: String(apiKey || "").trim() || undefined,
            model,
            signal: ac.signal,
            storyBody: storyResult.storyBody,
            protagonist: p,
          };

          const stateResult: InitStateParsed = await generateInitState(stateInput);
          if (abortCtl !== ac) return;

          // 写入 storyStore
          if (stateResult.worldLocation && !isEmptyWorldLocation(stateResult.worldLocation)) {
            storyStore.worldLocation.value = stateResult.worldLocation;
          }
          if (stateResult.storySnapshot.trim()) {
            storyStore.initSnapshot.value = stateResult.storySnapshot.trim();
            // 更新已显示的开局消息的 snapshot（种子时尚未拿到）
            const msg = storyStore.chatMessages.value[0];
            if (msg && msg.type === "story") {
              msg.snapshot = storyStore.initSnapshot.value;
            }
          }
          if (stateResult.actionOptions) {
            storyStore.actionOptions.value = stateResult.actionOptions;
          }

          // ── 3. 应用开局状态到主角（装备/功法/储物袋/HP/年龄）──
          const current = protagonist.value;
          if (current) {
            current.applyInitState(stateResult);
          }

          // ── 4. 创建 NPC ──
          const nearbyEntries = npcEventsToNearbyEntries(stateResult.npcEvents);
          if (nearbyEntries.length > 0) {
            const createdNpcs = npcStore.applyNpcUpdates(nearbyEntries, p.linggen, {
              currentLocation: stateResult.worldLocation ?? null,
              currentWorldTime: storyStore.worldTime.value,
            });
            autoGeneratePortraits(createdNpcs);
          }

          // ── 5. 注册地点到世界地图 ──
          if (stateResult.worldLocation && !isEmptyWorldLocation(stateResult.worldLocation)) {
            worldMapStore.addLocation(stateResult.worldLocation);
          }

          gameLog.info("[OpeningStory] 开局状态生成完成");
        } catch (stateErr) {
          gameLog.error("[OpeningStory] 状态生成失败：" + (stateErr instanceof Error ? stateErr.message : String(stateErr)));
        }

        // ── 6. 结算天赋效果（无论状态生成成功与否）──
        const traitsOwner = protagonist.value;
        if (traitsOwner) {
          traitsOwner.applyTraitEffects();
        }

        // ── 6.5 生成首条路线大纲（开局即关键节点）──
        try {
          const owner = protagonist.value;
          if (owner) {
            const openingLoc = storyStore.worldLocation.value;
            const outlineInput = {
              apiUrl: url,
              apiKey: String(apiKey || "").trim() || undefined,
              model,
              signal: ac.signal,
              protagonist: owner,
              grandSummary: storyStore.grandSummary.value || undefined,
              recentSnapshots: [storyStore.initSnapshot.value.trim() || storyStore.storyBody.value.trim()].filter(Boolean),
              currentWorldLocation: openingLoc,
              sceneNpcSnapshot: undefined,
            };
            const outlineResult = await generatePlotOutline(outlineInput);
            if (abortCtl !== ac) return;
            const outline = outlineResult.outline.trim();
            if (outline) {
              storyStore.plotOutline.value = outline;
              storyStore.outlineTurnCounter.value = 0;
              storyStore.outlineWorldLocation.value = openingLoc ? { ...openingLoc } : null;
              gameLog.info("[OpeningStory] 首条路线大纲已生成。");
            }
          }
        } catch (outlineErr) {
          gameLog.error("[OpeningStory] 路线大纲生成失败：" + (outlineErr instanceof Error ? outlineErr.message : String(outlineErr)));
        }

        // ── 7. 设为 ready ──
        storyStore.phase.value = "ready";

        // ── 8. 保存 ──
        writeActiveSave();
      } catch (e) {
        if (ac.signal.aborted) return;
        storyStore.phase.value = "error";
        errorMessage.value = e instanceof Error ? e.message : String(e);
        gameLog.error("[OpeningStory] " + errorMessage.value);
      } finally {
        if (abortCtl === ac) abortCtl = null;
      }
    },
    { immediate: true },
  );

  return {
    storyBody: storyStore.storyBody,
    phase: storyStore.phase,
    errorMessage,
    worldTime: storyStore.worldTime,
    worldTimeBaseline: storyStore.worldTimeBaseline,
    worldLocation: storyStore.worldLocation,
    initSnapshot: storyStore.initSnapshot,
    initActionOptions: storyStore.actionOptions,
  };
}
