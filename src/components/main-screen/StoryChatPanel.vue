<script setup lang="ts">
/**
 * 中栏：剧情与对话 — 展示开局剧情，支持玩家输入并调用 AI 继续生成后续剧情。
 */
import { ref, watch } from "vue";
import type { OpeningStoryPhase } from "../../composables/useOpeningStory";
import { generateStory, type StoryChatEntry, type StoryParsed } from "../../ai/story_generate";
import { generateState, type StateParsed } from "../../ai/state_generate";
import {
  protagonist,
  setCurrentHpMp,
  addToInventory,
  setInventorySlot,
} from "../../lib/protagonistManager";
import type { ProtagonistPlayInfo } from "../../types/playInfo";
import { createSpiritStoneInventoryStack, mjDescribeSpiritStones, type SpiritStoneName, SPIRIT_STONE_TABLE_KEYS_ORDERED } from "../../types/spiritStone";
import { mergeNearbyNpcs } from "../../lib/npcManager";
import { gameLog } from "../../lib/gameLog";

const props = withDefaults(
  defineProps<{
    storyText?: string;
    phase?: OpeningStoryPhase;
    errorMessage?: string;
    apiUrl?: string;
    apiKey?: string;
    apiModel?: string;
    currentWorldLocation?: string;
  }>(),
  {
    storyText: "",
    phase: "idle",
    errorMessage: "",
    apiUrl: "",
    apiKey: "",
    apiModel: "",
    currentWorldLocation: "",
  },
);

const emit = defineEmits<{
  "update:worldLocation": [value: string];
}>();

interface ChatMessage {
  type: "story" | "user";
  content: string;
}

const chatMessages = ref<ChatMessage[]>([]);
const inputText = ref("");
const generating = ref(false);
const genError = ref("");
const textareaRef = ref<HTMLTextAreaElement | null>(null);

function autoResizeTextarea(): void {
  const el = textareaRef.value;
  if (!el) return;
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 120) + "px";
}

let abortCtl: AbortController | null = null;

function mergeOrAddStone(p: ProtagonistPlayInfo, name: SpiritStoneName, count: number): void {
  for (let i = 0; i < p.inventorySlots.length; i++) {
    const cell = p.inventorySlots[i];
    if (!cell || !("type" in cell) || cell.type !== "灵石" || cell.name !== name) continue;
    cell.count += count;
    return;
  }
  addToInventory(createSpiritStoneInventoryStack(name, count));
}

function grantChangeStones(p: ProtagonistPlayInfo, changeValue: number): void {
  let remaining = Math.floor(changeValue);
  if (remaining < 10) return;
  const namesDesc = [...SPIRIT_STONE_TABLE_KEYS_ORDERED].reverse();
  for (const name of namesDesc) {
    if (remaining <= 0) break;
    const v = mjDescribeSpiritStones[name].value;
    if (v <= 0) continue;
    const count = Math.floor(remaining / v);
    if (count <= 0) continue;
    mergeOrAddStone(p, name, count);
    remaining -= count * v;
  }
}

function applyStateChanges(state: StateParsed): void {
  const p = protagonist.value;
  if (!p) return;

  if (state.userState) {
    setCurrentHpMp(state.userState.currentHp, state.userState.currentMp);
  }

  for (const change of state.spiritStoneChanges) {
    if (!SPIRIT_STONE_TABLE_KEYS_ORDERED.includes(change.name as SpiritStoneName)) continue;
    if (change.op === "add") {
      mergeOrAddStone(p, change.name as SpiritStoneName, change.count);
    } else if (change.op === "remove") {
      const targetValue = mjDescribeSpiritStones[change.name as SpiritStoneName]?.value;
      if (!targetValue) continue;
      let neededValue = targetValue * change.count;

      for (const stoneName of SPIRIT_STONE_TABLE_KEYS_ORDERED) {
        if (neededValue <= 0) break;
        const stoneValue = mjDescribeSpiritStones[stoneName as SpiritStoneName].value;
        for (let i = 0; i < p.inventorySlots.length && neededValue > 0; i++) {
          const cell = p.inventorySlots[i];
          if (!cell || !("type" in cell) || cell.type !== "灵石" || cell.name !== stoneName) continue;
          const cellTotalValue = cell.count * stoneValue;
          if (cellTotalValue <= neededValue) {
            neededValue -= cellTotalValue;
            setInventorySlot(i, null);
          } else {
            const takeCount = Math.ceil(neededValue / stoneValue);
            const takeValue = takeCount * stoneValue;
            const changeValue = takeValue - neededValue;
            neededValue = 0;
            cell.count -= takeCount;
            if (cell.count <= 0) setInventorySlot(i, null);
            if (changeValue >= 10) {
              grantChangeStones(p, changeValue);
            }
          }
        }
      }

      if (neededValue > 0) {
        gameLog.warn(`[StoryChat] 灵石不足：还需 ${neededValue} 点等值灵石`);
      }
    }
  }

  const stackableTypes = new Set(["材料", "杂物"]);

  for (const item of state.itemAdds) {
    if (item.type === "灵石") continue;
    if (stackableTypes.has(item.type)) {
      let merged = false;
      for (let i = 0; i < p.inventorySlots.length; i++) {
        const cell = p.inventorySlots[i];
        if (!cell || !("name" in cell) || cell.name !== item.name) continue;
        if (!("itemType" in cell) || !stackableTypes.has(cell.itemType)) continue;
        cell.count += item.count;
        merged = true;
        break;
      }
      if (!merged) {
        addToInventory({
          name: item.name,
          desc: item.intro,
          grade: item.grade as "下品" | "中品" | "上品" | "极品" | "仙品",
          value: 0,
          count: item.count,
          itemType: "杂物",
        } as any);
      }
    } else {
      addToInventory({
        name: item.name,
        desc: item.intro,
        grade: item.grade as "下品" | "中品" | "上品" | "极品" | "仙品",
        value: 0,
        count: item.count,
        itemType: "杂物",
      } as any);
    }
  }

  for (const item of state.itemRemoves) {
    let remaining = item.count;
    for (let i = 0; i < p.inventorySlots.length && remaining > 0; i++) {
      const cell = p.inventorySlots[i];
      if (!cell || !("name" in cell) || cell.name !== item.name) continue;
      const take = Math.min(remaining, cell.count);
      cell.count -= take;
      remaining -= take;
      if (cell.count <= 0) setInventorySlot(i, null);
    }
  }
}

watch(
  () => props.storyText,
  (text) => {
    if (text?.trim() && chatMessages.value.length === 0) {
      chatMessages.value.push({ type: "story", content: text.trim() });
    }
  },
  { immediate: true },
);

async function handleSend(): Promise<void> {
  const msg = inputText.value.trim();
  if (!msg || generating.value) return;

  const p = protagonist.value;
  if (!p) {
    genError.value = "主角数据未就绪，无法生成剧情。";
    return;
  }

  const url = String(props.apiUrl || "").trim();
  const model = String(props.apiModel || "").trim();
  if (!url || !model) {
    genError.value = "未配置 API URL 或模型。";
    return;
  }

  chatMessages.value.push({ type: "user", content: msg });
  inputText.value = "";
  if (textareaRef.value) textareaRef.value.style.height = "auto";
  generating.value = true;
  genError.value = "";

  const chatHistory: StoryChatEntry[] = chatMessages.value.map((m) => ({
    role: m.type === "user" ? "user" as const : "assistant" as const,
    content: m.content,
  }));

  const ac = new AbortController();
  abortCtl = ac;

  try {
    const parsed: StoryParsed = await generateStory({
      apiUrl: url,
      apiKey: String(props.apiKey || "").trim() || undefined,
      model,
      protagonist: p,
      chatHistory,
      currentWorldLocation: props.currentWorldLocation || undefined,
      signal: ac.signal,
    });

    if (abortCtl !== ac) return;

    if (parsed.storyBody.trim()) {
      chatMessages.value.push({ type: "story", content: parsed.storyBody.trim() });
      if (parsed.worldLocation.trim()) {
        emit("update:worldLocation", parsed.worldLocation.trim());
      }
      try {
        const current = protagonist.value;
        if (current) {
          const stateResult = await generateState({
            apiUrl: url,
            apiKey: String(props.apiKey || "").trim() || undefined,
            model,
            protagonist: current,
            storyBody: parsed.storyBody.trim(),
            signal: ac.signal,
          });
          if (abortCtl !== ac) return;
          applyStateChanges(stateResult);
          mergeNearbyNpcs(stateResult.nearbyNpcs, props.currentWorldLocation);
        }
      } catch (se) {
        gameLog.warn("[StoryChat] 状态更新失败（不影响剧情显示）：" + (se instanceof Error ? se.message : String(se)));
      }
    } else {
      genError.value = "模型返回的剧情正文为空。";
    }
  } catch (e) {
    if (ac.signal.aborted) return;
    genError.value = e instanceof Error ? e.message : String(e);
    gameLog.error("[StoryChat] " + genError.value);
  } finally {
    if (abortCtl === ac) abortCtl = null;
    generating.value = false;
  }
}

function onInputKeydown(e: KeyboardEvent): void {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    handleSend();
  }
}
</script>

<template>
  <section class="main-panel main-panel--story" aria-label="剧情对话">
    <header class="main-panel__head">
      <h2 class="main-panel__title">剧情</h2>
    </header>
    <div class="main-panel__body">
      <div class="main-panel__chat-messages" aria-label="剧情正文区域" aria-live="polite">
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
            :class="['main-panel__chat-bubble', msg.type === 'user' ? 'main-panel__chat-bubble--user' : 'main-panel__chat-bubble--story']"
          >
            <template v-if="msg.type === 'story'">
              <div class="main-panel__story-prose">{{ msg.content }}</div>
            </template>
            <template v-else>
              {{ msg.content }}
            </template>
          </div>
        </template>
        <p v-if="generating" class="main-panel__story-status main-panel__story-status--loading">
          正在生成后续剧情…
        </p>
        <p v-if="genError" class="main-panel__story-status main-panel__story-status--error">
          {{ genError }}
        </p>
      </div>
      <div class="main-panel__composer">
        <textarea
          ref="textareaRef"
          class="main-panel__input"
          :readonly="generating"
          :disabled="phase !== 'ready' && chatMessages.length === 0"
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
          :disabled="generating || !inputText.trim() || (phase !== 'ready' && chatMessages.length === 0)"
          @click="handleSend"
        >
          {{ generating ? "生成中…" : "发送" }}
        </button>
      </div>
    </div>
  </section>
</template>
