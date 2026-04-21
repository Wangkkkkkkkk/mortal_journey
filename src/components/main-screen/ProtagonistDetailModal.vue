<script setup lang="ts">
/**
 * 主角详情弹窗：结构与 `mortal_journey/main.html` 中 `mj-item-detail-root` / `mj-trait-detail-root` 一致。
 */
import { onMounted, onUnmounted, ref, watch } from "vue";
import type { ProtagonistDetailAction, ProtagonistDetailPayload } from "../../lib/protagonistDetailPayload";

const props = defineProps<{
  open: boolean;
  payload: ProtagonistDetailPayload | null;
}>();

const emit = defineEmits<{
  close: [];
  action: [a: ProtagonistDetailAction];
}>();

const cultivateInput = ref("");
const sellConfirmOpen = ref(false);
const sellCountInput = ref("1");

watch(
  () => props.payload?.spiritStoneCultivation?.bagIndex,
  () => {
    cultivateInput.value = "";
  },
);

watch(
  () => [props.open, props.payload?.sellInventoryItem?.bagIndex, props.payload?.sellInventoryItem?.maxCount],
  () => {
    sellConfirmOpen.value = false;
    const m = props.payload?.sellInventoryItem?.maxCount;
    sellCountInput.value = typeof m === "number" && m > 0 ? String(m) : "1";
  },
);

function onActionClick(a: ProtagonistDetailAction) {
  emit("action", a);
}

function onSpiritStoneCultivate() {
  const sc = props.payload?.spiritStoneCultivation;
  if (!sc) return;
  const raw = parseFloat(String(cultivateInput.value).trim());
  const n = Math.round(raw);
  if (!Number.isFinite(n) || n <= 0) return;
  emit("action", { id: "absorbSpiritStones", bagIndex: sc.bagIndex, count: n, consumeAll: false });
}

function onSpiritStoneCultivateAll() {
  const sc = props.payload?.spiritStoneCultivation;
  if (!sc) return;
  emit("action", { id: "absorbSpiritStones", bagIndex: sc.bagIndex, count: 0, consumeAll: true });
}

function onUseElixirFromBag() {
  const u = props.payload?.useElixirFromBag;
  if (!u) return;
  emit("action", { id: "useElixirFromBag", bagIndex: u.bagIndex });
}

function onSellInventoryClick() {
  const s = props.payload?.sellInventoryItem;
  if (!s) return;
  sellCountInput.value = String(s.maxCount);
  sellConfirmOpen.value = true;
}

function onSellConfirmCancel() {
  sellConfirmOpen.value = false;
}

function onSellConfirmSubmit() {
  const s = props.payload?.sellInventoryItem;
  if (!s) return;
  const raw = parseFloat(String(sellCountInput.value).trim());
  const n = Math.round(raw);
  if (!Number.isFinite(n) || n < 1 || n > s.maxCount) return;
  sellConfirmOpen.value = false;
  emit("action", { id: "sellInventoryItem", bagIndex: s.bagIndex, count: n });
}

function onBackdropClick() {
  if (sellConfirmOpen.value) {
    sellConfirmOpen.value = false;
    return;
  }
  emit("close");
}

function onCloseClick() {
  if (sellConfirmOpen.value) {
    sellConfirmOpen.value = false;
    return;
  }
  emit("close");
}

function onKeydown(ev: KeyboardEvent) {
  if (ev.key === "Escape" && props.open) {
    ev.preventDefault();
    if (sellConfirmOpen.value) {
      sellConfirmOpen.value = false;
    } else {
      emit("close");
    }
  }
}

watch(
  () => props.open,
  (v) => {
    if (v) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
  },
);

onMounted(() => {
  document.addEventListener("keydown", onKeydown, true);
});
onUnmounted(() => {
  document.removeEventListener("keydown", onKeydown, true);
  document.body.style.overflow = "";
});
</script>

<template>
  <Teleport to="body">
    <template v-if="open && payload">
    <div
      class="mj-trait-modal-root mj-protagonist-detail-root"
      role="presentation"
      aria-hidden="false"
    >
      <div
        class="mj-trait-modal-backdrop"
        tabindex="-1"
        aria-label="关闭"
        @click="onBackdropClick"
      />
      <div
        class="mj-trait-modal mj-item-detail-panel"
        role="dialog"
        aria-modal="true"
        :data-rarity="payload.dataRarity"
        @click.stop
      >
        <button type="button" class="mj-trait-modal-close" aria-label="关闭" @click="onCloseClick">
          ×
        </button>
        <h4 class="mj-trait-modal-title">{{ payload.title }}</h4>
        <div class="mj-trait-modal-rarity">{{ payload.subtitle }}</div>
        <div class="mj-trait-modal-body">
          <div v-for="(s, si) in payload.sections" :key="si" class="mj-trait-modal-section">
            <span class="mj-trait-modal-k">{{ s.label }}</span>
            <div class="mj-trait-modal-v">{{ s.text }}</div>
          </div>
        </div>
        <template v-if="payload.spiritStoneCultivation">
          <div class="mj-item-detail-cultivate-row">
            <div class="mj-item-detail-cultivate-field">
              <span class="mj-item-detail-cultivate-label">修炼数量</span>
              <input
                v-model="cultivateInput"
                class="mj-item-detail-cultivate-input"
                type="number"
                :min="1"
                :max="payload.spiritStoneCultivation.maxCount"
                step="1"
                :placeholder="`1～${payload.spiritStoneCultivation.maxCount}`"
                inputmode="numeric"
              />
            </div>
            <button
              type="button"
              class="mj-item-detail-action-btn mj-item-detail-action-btn--primary"
              @click="onSpiritStoneCultivate"
            >
              修炼
            </button>
          </div>
          <div class="mj-item-detail-actions mj-item-detail-actions--stack">
            <button
              type="button"
              class="mj-item-detail-action-btn mj-item-detail-action-btn--primary"
              @click="onSpiritStoneCultivateAll"
            >
              尽数修炼
            </button>
          </div>
        </template>
        <div v-if="payload.actions?.length" class="mj-item-detail-actions">
          <button
            v-for="(ab, ai) in payload.actions"
            :key="ai"
            type="button"
            class="mj-item-detail-action-btn"
            :class="{ 'mj-item-detail-action-btn--primary': ab.primary }"
            @click="onActionClick(ab.action)"
          >
            {{ ab.label }}
          </button>
        </div>
        <div v-if="payload.useElixirFromBag" class="mj-item-detail-use-elixir">
          <button
            type="button"
            class="mj-item-detail-action-btn mj-item-detail-action-btn--primary mj-item-detail-action-btn--use-elixir"
            @click="onUseElixirFromBag"
          >
            使用
          </button>
        </div>
        <div v-if="payload.sellInventoryItem" class="mj-item-detail-sell">
          <button type="button" class="mj-item-detail-action-btn mj-item-detail-action-btn--sell" @click="onSellInventoryClick">
            售卖
          </button>
        </div>
      </div>
    </div>
    <div
      v-if="sellConfirmOpen && payload.sellInventoryItem"
      class="mj-sell-confirm-overlay mj-protagonist-detail-root"
      role="presentation"
      aria-hidden="false"
      @click.self="onSellConfirmCancel"
    >
      <div class="mj-sell-confirm-panel" role="dialog" aria-modal="true" aria-labelledby="mj-sell-confirm-title" @click.stop>
        <h5 id="mj-sell-confirm-title" class="mj-sell-confirm-title">确认售卖</h5>
        <div class="mj-sell-confirm-field">
          <span class="mj-sell-confirm-label">数量</span>
          <input
            v-model="sellCountInput"
            class="mj-sell-confirm-input"
            type="number"
            :min="1"
            :max="payload.sellInventoryItem.maxCount"
            step="1"
            :placeholder="`1～${payload.sellInventoryItem.maxCount}`"
            inputmode="numeric"
          />
        </div>
        <div class="mj-sell-confirm-actions">
          <button type="button" class="mj-item-detail-action-btn" @click="onSellConfirmCancel">取消</button>
          <button type="button" class="mj-item-detail-action-btn mj-item-detail-action-btn--primary" @click="onSellConfirmSubmit">
            确认售卖
          </button>
        </div>
      </div>
    </div>
    </template>
  </Teleport>
</template>
