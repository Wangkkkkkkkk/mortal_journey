<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import type { GongfaItemDefinition } from "../role_core/types/itemInfo";
import { GONGFA_GRADE_CULTIVATION_MULT, LINGGEN_CULTIVATION_MULT } from "../role_core/types/gameConstants";
import { getGongfaMasteryProgress } from "./protagonistPanelDisplay";
import { useScrollLock } from "../composables/useScrollLock";
import type { CultivationConfirmPayload } from "../ai_core";

const EXP_PER_STONE = 100;

const props = defineProps<{
  open: boolean;
  gongfa: GongfaItemDefinition | null;
  spiritStoneCount: number;
  linggenCount: number;
  insight: number;
}>();

const emit = defineEmits<{
  close: [];
  confirm: [payload: CultivationConfirmPayload];
}>();

const scrollLock = useScrollLock();
const inputCount = ref(1);

const masteryProgress = computed(() => getGongfaMasteryProgress(props.gongfa));

const expNeeded = computed(() => {
  const mp = masteryProgress.value;
  if (mp.isMax) return 0;
  return mp.threshold - mp.exp;
});

const maxStones = computed(() => {
  if (expNeeded.value <= 0) return 0;
  return Math.min(
    props.spiritStoneCount,
    Math.ceil(expNeeded.value / EXP_PER_STONE),
  );
});

const clampedCount = computed(() => {
  const v = inputCount.value;
  if (!Number.isFinite(v) || v < 1) return 1;
  if (v > maxStones.value) return maxStones.value;
  return Math.floor(v);
});

const totalExp = computed(() => clampedCount.value * EXP_PER_STONE);

const cultivationTimeMult = computed(() => {
  const gradeMult = props.gongfa ? (GONGFA_GRADE_CULTIVATION_MULT[props.gongfa.grade] ?? 1.0) : 1.0;
  const linggenMult = LINGGEN_CULTIVATION_MULT[props.linggenCount] ?? 0.7;
  const insightMult = 1 + props.insight * 0.01;
  return gradeMult * linggenMult * insightMult;
});

const monthsNeeded = computed(() => {
  if (clampedCount.value <= 0 || cultivationTimeMult.value <= 0) return 0;
  return Math.ceil(clampedCount.value / cultivationTimeMult.value);
});

const resultExp = computed(() => {
  const mp = masteryProgress.value;
  if (mp.isMax) return 0;
  return Math.min(mp.exp + totalExp.value, mp.threshold);
});

const resultPercent = computed(() => {
  const mp = masteryProgress.value;
  if (mp.isMax) return 100;
  return Math.min(100, Math.round(resultExp.value / mp.threshold * 100));
});

const timePreview = computed(() => {
  const m = monthsNeeded.value;
  if (m <= 0) return "";
  const years = Math.floor(m / 12);
  const months = m % 12;
  const parts: string[] = [];
  if (years > 0) parts.push(`${years}年`);
  if (months > 0) parts.push(`${months}个月`);
  return `修炼时间：${parts.join("")}`;
});

const canConfirm = computed(() => clampedCount.value > 0 && maxStones.value > 0);

watch(
  () => props.open,
  (v) => {
    if (v) {
      inputCount.value = maxStones.value > 0 ? 1 : 0;
      scrollLock.acquire();
    } else {
      scrollLock.release();
    }
  },
);

function clampAndSet(v: number) {
  if (!Number.isFinite(v) || v < 1) {
    inputCount.value = 1;
  } else if (v > maxStones.value) {
    inputCount.value = maxStones.value;
  } else {
    inputCount.value = Math.floor(v);
  }
}

function onInput(e: Event) {
  const raw = parseInt((e.target as HTMLInputElement).value, 10);
  if (Number.isNaN(raw)) {
    inputCount.value = 1;
    return;
  }
  clampAndSet(raw);
}

function decrease() {
  if (inputCount.value > 1) inputCount.value--;
}

function increase() {
  if (inputCount.value < maxStones.value) inputCount.value++;
}

function setMax() {
  inputCount.value = maxStones.value;
}

function onConfirm() {
  if (!canConfirm.value) return;
  emit("confirm", {
    spiritStoneCount: clampedCount.value,
    estimatedMonths: monthsNeeded.value,
  });
}

function onBackdropClick() {
  emit("close");
}

function onCloseClick() {
  emit("close");
}

function onKeydown(ev: KeyboardEvent) {
  if (ev.key === "Escape" && props.open) {
    ev.preventDefault();
    emit("close");
  }
}

onMounted(() => {
  document.addEventListener("keydown", onKeydown, true);
});

onUnmounted(() => {
  document.removeEventListener("keydown", onKeydown, true);
});
</script>

<template>
  <Teleport to="body">
    <Transition name="mj-backdrop">
      <div
        v-if="open && gongfa && !masteryProgress.isMax"
        class="mj-trait-modal-root mj-protagonist-detail-root mj-cultivate-root"
        role="presentation"
        aria-hidden="false"
      >
        <div
          class="mj-trait-modal-backdrop"
          tabindex="-1"
          aria-label="关闭"
          @click="onBackdropClick"
        />
        <Transition name="mj-modal" appear>
          <div
            class="mj-trait-modal mj-cultivate-panel"
            role="dialog"
            aria-modal="true"
            @click.stop
          >
            <button type="button" class="mj-trait-modal-close" aria-label="关闭" @click="onCloseClick">
              ×
            </button>
            <h4 class="mj-trait-modal-title">修炼功法</h4>
            <div class="mj-trait-modal-rarity">{{ gongfa.name }}</div>

            <div class="mj-trait-modal-body">
              <div class="mj-trait-modal-section">
                <span class="mj-trait-modal-k">当前熟练度</span>
                <div class="mj-trait-modal-v">
                  <div class="mj-mastery-row">
                    <span class="mj-mastery-layer">第{{ masteryProgress.mastery }}/10层</span>
                    <span class="mj-mastery-exp">{{ masteryProgress.exp }}/{{ masteryProgress.threshold }}</span>
                  </div>
                  <div class="mj-mastery-progress">
                    <div class="mj-mastery-progress-bar">
                      <div class="mj-mastery-progress-fill" :style="{ width: masteryProgress.percent + '%' }" />
                    </div>
                    <span class="mj-mastery-progress-pct">{{ masteryProgress.percent }}%</span>
                  </div>
                </div>
              </div>

              <div class="mj-trait-modal-section">
                <span class="mj-trait-modal-k">消耗灵石</span>
                <div class="mj-trait-modal-v">
                  <div class="mj-cultivate-stone-control">
                    <button type="button" class="mj-cultivate-stepper" :disabled="clampedCount <= 1" @click="decrease">−</button>
                    <input
                      type="number"
                      class="mj-cultivate-input"
                      :value="clampedCount"
                      min="1"
                      :max="maxStones"
                      @input="onInput"
                    />
                    <button type="button" class="mj-cultivate-stepper" :disabled="clampedCount >= maxStones" @click="increase">+</button>
                    <button type="button" class="mj-cultivate-max-btn" @click="setMax">最大</button>
                  </div>
                  <div class="mj-cultivate-hint">
                    持有灵石：{{ spiritStoneCount }}　最多消耗：{{ maxStones }}
                  </div>
                </div>
              </div>

              <div class="mj-trait-modal-section">
                <span class="mj-trait-modal-k">修炼预览</span>
                <div class="mj-trait-modal-v">
                  <div class="mj-cultivate-preview">
                    <div>{{ timePreview }}</div>
                    <div>获得熟练度：+{{ totalExp }}</div>
                    <div class="mj-cultivate-preview-progress">
                      <span>修炼后：{{ resultExp }}/{{ masteryProgress.threshold }}</span>
                      <span>{{ resultPercent }}%</span>
                    </div>
                    <div class="mj-mastery-progress">
                      <div class="mj-mastery-progress-bar">
                        <div class="mj-mastery-progress-fill" :style="{ width: resultPercent + '%' }" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="mj-item-detail-actions">
              <button
                type="button"
                class="mj-item-detail-action-btn"
                @click="onCloseClick"
              >
                取消
              </button>
              <button
                type="button"
                class="mj-item-detail-action-btn mj-item-detail-action-btn--primary"
                :disabled="!canConfirm"
                @click="onConfirm"
              >
                开始修炼
              </button>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>
