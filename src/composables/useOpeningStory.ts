/**
 * 命运抉择确认后：同步写入主角、请求开局剧情 AI、维护剧情正文与阶段状态。
 */

import { ref, watch, type ComputedRef, type Ref } from "vue";
import { generateInitStory } from "../ai/init_story_generate";
import { generateInitState } from "../ai/init_state_generate";
import { generateState } from "../ai/state_generate";
import { applyInitStateToProtagonist } from "../lib/protagonistFromFateChoice";
import { mergeNearbyNpcs } from "../lib/npcManager";
import { gameLog } from "../log/gameLog";
import {
  cloneWorldTime,
  createDefaultWorldTime,
  type WorldTime,
} from "../lib/worldTime";
import { clearProtagonist, loadFromFateChoice, protagonist } from "../lib/protagonistManager";
import type { FateChoiceResult } from "../fate_choice/types";

export type OpeningStoryPhase = "idle" | "loading" | "ready" | "error";

/** 与启动页 API 表单对应的网关参数（空串表示未填）。 */
export interface OpeningStoryApiSlice {
  apiUrl: string;
  apiKey: string;
  apiModel: string;
}

/**
 * 监听 `fateChoice`：非空时 `loadFromFateChoice` 并拉取开局剧情；空时清空主角与剧情 UI。
 *
 * @param fateChoice - 通常 `toRef(props, "fateChoice")`
 * @param api - 通常 `computed(() => ({ apiUrl, apiKey, apiModel }))`，在发起请求时读取最新值
 */
export function useOpeningStoryFromFateChoice(
  fateChoice: Ref<FateChoiceResult | null | undefined>,
  api: Ref<OpeningStoryApiSlice> | ComputedRef<OpeningStoryApiSlice>,
): {
  storyBody: Ref<string>;
  phase: Ref<OpeningStoryPhase>;
  errorMessage: Ref<string>;
  worldTime: Ref<WorldTime>;
  worldTimeBaseline: Ref<WorldTime>;
  worldLocation: Ref<string>;
} {
  const storyBody = ref("");
  const phase = ref<OpeningStoryPhase>("idle");
  const errorMessage = ref("");
  const worldTime = ref<WorldTime>(createDefaultWorldTime());
  /** 开局锁定：年龄增量 = `calendarYearsElapsed(baseline, worldTime)` */
  const worldTimeBaseline = ref<WorldTime>(cloneWorldTime(worldTime.value));
  const worldLocation = ref("");

  let abortCtl: AbortController | null = null;

  function resetWorldClock(): void {
    const w = createDefaultWorldTime();
    worldTime.value = w;
    worldTimeBaseline.value = cloneWorldTime(w);
    worldLocation.value = "";
  }

  function resetStoryOnly(): void {
    storyBody.value = "";
    errorMessage.value = "";
    phase.value = "idle";
    resetWorldClock();
  }

  watch(
    fateChoice,
    async (fc) => {
      abortCtl?.abort();
      abortCtl = null;

      if (!fc) {
        clearProtagonist();
        resetStoryOnly();
        return;
      }

      loadFromFateChoice(fc);
      storyBody.value = "";
      errorMessage.value = "";
      resetWorldClock();

      const { apiUrl, apiKey, apiModel } = api.value;
      const url = String(apiUrl || "").trim();
      const model = String(apiModel || "").trim();
      if (!url || !model) {
        phase.value = "error";
        errorMessage.value = "未配置 API URL 或模型，无法生成开局剧情。";
        gameLog.warn("[OpeningStory] " + errorMessage.value);
        return;
      }

      const p = protagonist.value;
      if (!p) {
        phase.value = "error";
        errorMessage.value = "主角数据未就绪。";
        return;
      }

      const ac = new AbortController();
      abortCtl = ac;
      phase.value = "loading";

      try {
        const parsed = await generateInitStory({
          apiUrl: url,
          apiKey: String(apiKey || "").trim() || undefined,
          model,
          protagonist: p,
          signal: ac.signal,
        });
        if (abortCtl !== ac) return;
        storyBody.value = parsed.storyBody;
        worldLocation.value = parsed.worldLocation.trim();
        if (parsed.storyBody.trim()) {
          try {
            const stateParsed = await generateInitState({
              apiUrl: url,
              apiKey: String(apiKey || "").trim() || undefined,
              model,
              protagonist: p,
              storyBody: parsed.storyBody,
              signal: ac.signal,
            });
            if (abortCtl !== ac) return;
            const current = protagonist.value;
            if (current) {
              applyInitStateToProtagonist(current, stateParsed);
              protagonist.value = { ...current };
            }
          } catch (e2) {
            gameLog.warn("[OpeningStory] 开局状态生成失败（不影响剧情显示）：" + (e2 instanceof Error ? e2.message : String(e2)));
          }
          try {
            const latest = protagonist.value;
            if (latest) {
              const stateResult = await generateState({
                apiUrl: url,
                apiKey: String(apiKey || "").trim() || undefined,
                model,
                protagonist: latest,
                storyBody: parsed.storyBody,
                signal: ac.signal,
              });
              if (abortCtl !== ac) return;
              mergeNearbyNpcs(stateResult.nearbyNpcs, worldLocation.value);
            }
          } catch (e3) {
            gameLog.warn("[OpeningStory] 开局NPC状态更新失败（不影响剧情显示）：" + (e3 instanceof Error ? e3.message : String(e3)));
          }
          phase.value = "ready";
        } else {
          phase.value = "error";
          errorMessage.value = "模型返回的开局正文为空。";
        }
      } catch (e) {
        if (ac.signal.aborted) return;
        phase.value = "error";
        errorMessage.value = e instanceof Error ? e.message : String(e);
        gameLog.error("[OpeningStory] " + errorMessage.value);
      } finally {
        if (abortCtl === ac) abortCtl = null;
      }
    },
    { immediate: true },
  );

  return { storyBody, phase, errorMessage, worldTime, worldTimeBaseline, worldLocation };
}
