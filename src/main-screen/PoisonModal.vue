<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from "vue";
import { protagonist } from "../role_core/Protagonist";
import type { MaterialItemDefinition, ItemGrade } from "../role_core/types/itemInfo";
import type { PoisonItemDefinition } from "../role_core/poison";
import { formatPoisonEffect } from "../role_core/poison";
import { computeAlchemyGradeOdds } from "../role_core/alchemy";
import { craftUpgradeChance } from "../role_core/craft";
import { gradeToTraitRarity } from "./protagonistPanelDisplay";
import { useScrollLock } from "../composables/useScrollLock";
import { writeActiveSave } from "../save/gameSave";

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();

const scrollLock = useScrollLock();

/** 已选毒物格下标（长度 0–3，允许重复以表示从同一堆取多份）。 */
const selected = ref<number[]>([]);
/** 最近一次炼制产出的毒药（用于结果展示）。 */
const result = ref<PoisonItemDefinition | null>(null);

interface MaterialEntry {
  slotIndex: number;
  material: MaterialItemDefinition;
}

/** 储物袋中所有「毒物」类材料（带格下标）；制毒只吃毒物。 */
const materialEntries = computed<MaterialEntry[]>(() => {
  const p = protagonist.value;
  if (!p) return [];
  const out: MaterialEntry[] = [];
  p.inventorySlots.forEach((cell, i) => {
    if (cell && "itemType" in cell && cell.itemType === "材料" && cell.category === "毒物") {
      out.push({ slotIndex: i, material: cell as MaterialItemDefinition });
    }
  });
  return out;
});

/** 【毒术】熟练度与由此得到的品阶跃迁概率（用于界面提示）。 */
const poisonProficiency = computed(() => protagonist.value?.craftSkills.poison ?? 0);
const upgradeChanceText = computed(
  () => `${Math.round(craftUpgradeChance(poisonProficiency.value) * 10) / 10}%`,
);

/** 指定格已被选中的次数。 */
function usageOf(slotIndex: number): number {
  let n = 0;
  for (const s of selected.value) if (s === slotIndex) n++;
  return n;
}

/** 指定格还能再被选几次（= 剩余 count）。 */
function availableOf(slotIndex: number): number {
  const entry = materialEntries.value.find((e) => e.slotIndex === slotIndex);
  if (!entry) return 0;
  return entry.material.count - usageOf(slotIndex);
}

/** 是否还能再选一份材料（未满 3 且至少有一格有余量）。 */
const canSelectMore = computed(() => {
  if (selected.value.length >= 3) return false;
  return materialEntries.value.some((e) => availableOf(e.slotIndex) > 0);
});

/** 已选材料的品阶列表（用于计算品阶概率）。 */
const selectedGrades = computed<ItemGrade[]>(() => {
  const p = protagonist.value;
  if (!p) return [];
  return selected.value.map((i) => {
    const cell = p.inventorySlots[i];
    return (cell as MaterialItemDefinition).grade;
  });
});

const gradeOdds = computed(() => computeAlchemyGradeOdds(selectedGrades.value));

const isReady = computed(() => selected.value.length === 3);

/** 取指定下标处当前的材料名/品阶（直接读 protagonist，随库存变化而更新）。 */
function slotName(slotIndex: number): string {
  const p = protagonist.value;
  if (!p) return "—";
  const cell = p.inventorySlots[slotIndex];
  if (!cell || !("itemType" in cell)) return "—";
  return (cell as MaterialItemDefinition).name;
}
function slotGrade(slotIndex: number): string {
  const p = protagonist.value;
  if (!p) return "";
  const cell = p.inventorySlots[slotIndex];
  if (!cell || !("itemType" in cell)) return "";
  return (cell as MaterialItemDefinition).grade;
}

function pickMaterial(slotIndex: number) {
  if (result.value) return;
  if (selected.value.length >= 3) return;
  if (availableOf(slotIndex) <= 0) return;
  selected.value = [...selected.value, slotIndex];
}

function removeAt(idx: number) {
  if (result.value) return;
  if (idx < 0 || idx >= selected.value.length) return;
  const next = selected.value.slice();
  next.splice(idx, 1);
  selected.value = next;
}

function clearSelection() {
  selected.value = [];
  result.value = null;
}

function doCraft() {
  if (!isReady.value || result.value) return;
  const p = protagonist.value;
  if (!p) return;
  const poison = p.craftPoisonFromMaterials(selected.value.slice());
  if (!poison) return;
  result.value = poison;
  writeActiveSave();
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

watch(
  () => props.open,
  (v) => {
    if (v) {
      selected.value = [];
      result.value = null;
      scrollLock.acquire();
    } else {
      scrollLock.release();
    }
  },
);

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
        v-if="open"
        class="side-modal-overlay"
        role="presentation"
        aria-hidden="false"
      >
        <div
          class="side-modal-overlay__backdrop"
          tabindex="-1"
          aria-label="关闭"
          @click="onBackdropClick"
        />
        <Transition name="mj-modal" appear>
          <div
            class="side-modal side-modal--alchemy side-modal--poison"
            role="dialog"
            aria-modal="true"
            @click.stop
          >
            <div class="side-modal__header">
              <h4 class="side-modal__title">毒鼎</h4>
              <button type="button" class="side-modal__close" aria-label="关闭" @click="onCloseClick">
                ×
              </button>
            </div>

            <div class="side-modal__body alchemy-body">
              <!-- 结果展示 -->
              <template v-if="result">
                <div class="alchemy-result" :data-rarity="gradeToTraitRarity(result.grade)">
                  <div class="alchemy-result__title">{{ result.name }}</div>
                  <div class="alchemy-result__grade">{{ result.grade }} · 毒药 · {{ result.poisonType }}</div>
                  <div class="alchemy-result__effect">{{ formatPoisonEffect(result) }}</div>
                  <div class="alchemy-result__desc">{{ result.desc }}</div>
                </div>
                <div class="alchemy-result__hint">毒药已放入储物袋（战斗中可对敌施用）</div>
                <div class="alchemy-actions">
                  <button type="button" class="alchemy-btn" @click="clearSelection">再炼一剂</button>
                  <button type="button" class="alchemy-btn alchemy-btn--primary" @click="onCloseClick">关闭</button>
                </div>
              </template>

              <!-- 制毒选择界面 -->
              <template v-else>
                <div class="alchemy-section-label">投入毒物（三份）</div>
                <div class="alchemy-slots">
                  <div
                    v-for="(slotIdx, idx) in selected"
                    :key="'sel-' + idx"
                    class="alchemy-slot alchemy-slot--filled"
                    @click="removeAt(idx)"
                  >
                    <span class="alchemy-slot__name">{{ slotName(slotIdx) }}</span>
                    <span class="alchemy-slot__grade">{{ slotGrade(slotIdx) }}</span>
                    <span class="alchemy-slot__remove" title="移除">×</span>
                  </div>
                  <div
                    v-for="n in (3 - selected.length)"
                    :key="'empty-' + n"
                    class="alchemy-slot alchemy-slot--empty"
                    :class="{ 'alchemy-slot--disabled': !canSelectMore }"
                  >
                    <span class="alchemy-slot__placeholder">空槽</span>
                  </div>
                </div>

                <!-- 品阶概率预览 -->
                <div v-if="gradeOdds.length > 0" class="alchemy-preview">
                  <div class="alchemy-section-label">品阶概率</div>
                  <div class="alchemy-odds">
                    <span
                      v-for="o in gradeOdds"
                      :key="o.grade"
                      class="alchemy-odds-item"
                      :data-rarity="gradeToTraitRarity(o.grade)"
                    >{{ o.grade }} {{ o.percent }}%</span>
                  </div>
                </div>

                <div class="alchemy-section-label">
                  毒术 {{ poisonProficiency }} · 品阶跃迁 {{ upgradeChanceText }}
                </div>

                <!-- 材料列表 -->
                <div class="alchemy-section-label">毒物储备</div>
                <div class="alchemy-material-list">
                  <template v-if="materialEntries.length === 0">
                    <div class="alchemy-empty">储物袋中暂无毒物</div>
                  </template>
                  <template v-else>
                    <button
                      v-for="entry in materialEntries"
                      :key="'mat-' + entry.slotIndex"
                      type="button"
                      class="alchemy-material"
                      :data-rarity="gradeToTraitRarity(entry.material.grade)"
                      :disabled="availableOf(entry.slotIndex) <= 0 || selected.length >= 3"
                      @click="pickMaterial(entry.slotIndex)"
                    >
                      <span class="alchemy-material__name">{{ entry.material.name }}</span>
                      <span class="alchemy-material__grade">{{ entry.material.grade }}</span>
                      <span class="alchemy-material__count">余 {{ availableOf(entry.slotIndex) }}/{{ entry.material.count }}</span>
                    </button>
                  </template>
                </div>

                <div class="alchemy-actions">
                  <button type="button" class="alchemy-btn" :disabled="selected.length === 0" @click="clearSelection">清空</button>
                  <button
                    type="button"
                    class="alchemy-btn alchemy-btn--primary"
                    :disabled="!isReady"
                    @click="doCraft"
                  >起鼎炼毒</button>
                </div>
              </template>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

