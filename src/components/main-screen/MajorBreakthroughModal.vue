<script setup lang="ts">
/**
 * 大境界突破弹窗：与 `mortal_journey/main.html` 中 `mj-major-breakthrough-root` 行为一致。
 */
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import type { ProtagonistPlayInfo } from "../../types/playInfo";
import {
  computeMajorBreakModalTotalP,
  formatMajorBreakthroughPctForUi,
  getMajorBreakthroughReadyContext,
  getPillBreakthroughBonusDelta,
  type MajorBreakModalSlotSelection,
} from "../../lib/majorBreakthrough";
import { performMajorBreakthroughRoll } from "../../lib/protagonistManager";

const props = defineProps<{
  open: boolean;
  protagonist: ProtagonistPlayInfo | null;
}>();

const emit = defineEmits<{
  close: [];
}>();

const slots = ref<[MajorBreakModalSlotSelection, MajorBreakModalSlotSelection, MajorBreakModalSlotSelection]>([
  null,
  null,
  null,
]);
/** 正在选择丹药的槽位 0–2，或 -1 表示未展开 */
const pickSlotIndex = ref(-1);

const ctx = computed(() => getMajorBreakthroughReadyContext(props.protagonist));

const totalP = computed(() => {
  const c = ctx.value;
  const p = props.protagonist;
  if (!c || !p) return 0;
  return computeMajorBreakModalTotalP(c.baseP, c.major, c.nextMaj, slots.value, (idx) => p.inventorySlots[idx] ?? null);
});

const chanceLine = computed(() => "突破概率：" + formatMajorBreakthroughPctForUi(totalP.value));

function closePick() {
  pickSlotIndex.value = -1;
}

function resetModalState() {
  slots.value = [null, null, null];
  pickSlotIndex.value = -1;
}

watch(
  () => props.open,
  (v) => {
    if (v) {
      resetModalState();
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
  },
);

watch(
  () => [props.open, props.protagonist?.xiuwei, props.protagonist?.realm],
  () => {
    if (props.open && !getMajorBreakthroughReadyContext(props.protagonist)) {
      emit("close");
    }
  },
);

function onBackdropClose() {
  closePick();
  emit("close");
}

function countUsesOfBagIdx(excludeSlotIndex: number, bagIdx: number): number {
  let n = 0;
  for (let j = 0; j < 3; j++) {
    if (j === excludeSlotIndex) continue;
    const s = slots.value[j];
    if (s && s.bagIdx === bagIdx) n++;
  }
  return n;
}

interface PickOption {
  bagIdx: number;
  name: string;
  avail: number;
  bonusPct: string;
}

const pickOptions = computed((): PickOption[] => {
  const c = ctx.value;
  const p = props.protagonist;
  const si = pickSlotIndex.value;
  if (!c || !p || si < 0 || si > 2) return [];
  const out: PickOption[] = [];
  for (let b = 0; b < p.inventorySlots.length; b++) {
    const it = p.inventorySlots[b];
    const bonus = getPillBreakthroughBonusDelta(it, c.major, c.nextMaj);
    if (bonus <= 0) continue;
    const cnt =
      it && typeof (it as { count?: number }).count === "number" && Number.isFinite((it as { count: number }).count)
        ? Math.max(1, Math.floor((it as { count: number }).count))
        : 1;
    const reserved = countUsesOfBagIdx(si, b);
    const avail = cnt - reserved;
    if (avail <= 0) continue;
    const nm = String((it as { name?: string }).name || "").trim();
    out.push({
      bagIdx: b,
      name: nm,
      avail,
      bonusPct: (Math.round(bonus * 10000) / 100).toString(),
    });
  }
  return out;
});

function onSlotClick(index: number) {
  const c = ctx.value;
  if (!c) return;
  const cur = slots.value[index];
  if (cur && cur.name) {
    slots.value[index] = null;
    closePick();
    return;
  }
  pickSlotIndex.value = index;
}

function selectPill(slotIndex: number, bagIdx: number, name: string) {
  const p = props.protagonist;
  if (!p) return;
  const it = p.inventorySlots[bagIdx];
  const cap =
    it && typeof (it as { count?: number }).count === "number" && Number.isFinite((it as { count: number }).count)
      ? Math.max(1, Math.floor((it as { count: number }).count))
      : 1;
  if (countUsesOfBagIdx(slotIndex, bagIdx) >= cap) return;
  slots.value[slotIndex] = { bagIdx, name };
  closePick();
}

function onConfirm() {
  performMajorBreakthroughRoll([...slots.value]);
  emit("close");
}

function onKeydown(ev: KeyboardEvent) {
  if (ev.key === "Escape" && props.open) {
    ev.preventDefault();
    onBackdropClose();
  }
}

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
    <div
      v-if="open && ctx"
      class="mj-major-breakthrough-root mj-protagonist-detail-root mj-trait-modal-root"
      role="presentation"
      aria-hidden="false"
    >
      <div class="mj-trait-modal-backdrop" tabindex="-1" aria-label="关闭" @click="onBackdropClose" />
      <div
        class="mj-trait-modal mj-major-break-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mj-major-break-title"
        @click.stop
      >
        <button type="button" class="mj-trait-modal-close" aria-label="关闭" @click="onBackdropClose">×</button>
        <h4 id="mj-major-break-title" class="mj-trait-modal-title">大境界突破</h4>
        <div class="mj-major-break-subtitle">「{{ ctx.major }}」→「{{ ctx.nextMaj }}」</div>
        <div class="mj-major-break-chance">{{ chanceLine }}</div>
        <div class="mj-major-break-slots" role="group" aria-label="突破辅助丹药，最多三格">
          <button
            v-for="slotIndex in [0, 1, 2]"
            :key="slotIndex"
            type="button"
            class="mj-major-break-slot"
            :class="{ 'mj-major-break-slot--filled': !!(slots[slotIndex] && slots[slotIndex]!.name) }"
            :aria-label="`丹药格 ${slotIndex + 1}`"
            @click="onSlotClick(slotIndex)"
          >
            <span class="mj-major-break-slot-k">丹药</span>
            <span class="mj-major-break-slot-name">{{ slots[slotIndex]?.name || "空" }}</span>
          </button>
        </div>
        <div v-if="pickSlotIndex >= 0" class="mj-major-break-pick">
          <div class="mj-major-break-pick-hint">
            选择放入本格的丹药（须对「{{ ctx.major }}→{{ ctx.nextMaj }}」有效）：
          </div>
          <button
            v-for="(opt, oi) in pickOptions"
            :key="oi"
            type="button"
            class="mj-major-break-pick-btn"
            @click="selectPill(pickSlotIndex, opt.bagIdx, opt.name)"
          >
            {{ opt.name }} 可用 ×{{ opt.avail }}（格 {{ opt.bagIdx + 1 }}），+{{ opt.bonusPct }}%
          </button>
          <div v-if="!pickOptions.length" class="mj-major-break-pick-empty">
            没有可放入本格的丹药（储物袋无对应丹药，或其余两格已占满该格堆叠）。
          </div>
        </div>
        <button
          type="button"
          class="mj-major-break-confirm mj-item-detail-action-btn mj-item-detail-action-btn--primary"
          @click="onConfirm"
        >
          确认突破
        </button>
      </div>
    </div>
  </Teleport>
</template>
