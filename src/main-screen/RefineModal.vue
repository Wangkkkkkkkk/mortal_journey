<script setup lang="ts">
/**
 * 精炼台：在已有法宝上提升词条数值、增添随机词条、剔除指定词条。
 *
 * 与炼丹/锻造/烹饪不同，精炼是「先选目标法宝、再选操作」的两段式流程；
 * 提升/增添消耗 3 份器材并按现有词条数掷失败率，剔除只耗 1 份且必定成功。
 */
import { ref, computed, watch, onMounted, onUnmounted } from "vue";
import { protagonist, type RefineTarget, type RefineOp } from "../role_core/Protagonist";
import type { MaterialItemDefinition } from "../role_core/types/itemInfo";
import type { TreasureItemDefinition } from "../role_core/types/treasure";
import { TREASURE_MODIFIER_NAMES } from "../role_core/types/treasure";
import {
  refineFailureChance,
  refineModifierCap,
  modifierValueCap,
  isFullyBoosted,
} from "../role_core/refine";
import { gradeToTraitRarity } from "./protagonistPanelDisplay";
import { useScrollLock } from "../composables/useScrollLock";
import { writeActiveSave } from "../save/gameSave";

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: [] }>();

const scrollLock = useScrollLock();

/** 当前选中的精炼目标。 */
const target = ref<RefineTarget | null>(null);
/** 已选器材格下标。 */
const selectedMaterials = ref<number[]>([]);
/** 当前操作。 */
const op = ref<RefineOp>("boost");
/** 待剔除的词条下标。 */
const removeIndex = ref(-1);
/** 上一次精炼结果提示。 */
const lastResult = ref<{ success: boolean; text: string } | null>(null);

interface TreasureEntry {
  target: RefineTarget;
  treasure: TreasureItemDefinition;
  label: string;
}

/** 可精炼的法宝：已装备的槽位 + 储物袋中的法宝。 */
const treasureEntries = computed<TreasureEntry[]>(() => {
  const p = protagonist.value;
  if (!p) return [];
  const out: TreasureEntry[] = [];
  p.equippedSlots.forEach((cell, i) => {
    if (cell) out.push({ target: { where: "equipped", index: i }, treasure: cell, label: "已装备" });
  });
  p.inventorySlots.forEach((cell, i) => {
    if (cell && "itemType" in cell && cell.itemType === "法宝") {
      out.push({
        target: { where: "inventory", index: i },
        treasure: cell as TreasureItemDefinition,
        label: "储物袋",
      });
    }
  });
  return out;
});

/** 当前选中的法宝（随库存变化实时读取）。 */
const currentTreasure = computed<TreasureItemDefinition | null>(() => {
  const p = protagonist.value;
  const t = target.value;
  if (!p || !t) return null;
  const cell = t.where === "equipped" ? p.equippedSlots[t.index] : p.inventorySlots[t.index];
  if (!cell || !("itemType" in cell) || cell.itemType !== "法宝") return null;
  return cell as TreasureItemDefinition;
});

/** 当前法宝的词条行（含是否已达数值上限）。 */
const modifierRows = computed(() => {
  const tr = currentTreasure.value;
  if (!tr) return [];
  return (tr.function?.modifiers ?? []).map((m, i) => {
    const cap = modifierValueCap(m.modifierType, tr.grade);
    return {
      index: i,
      name: TREASURE_MODIFIER_NAMES[m.modifierType],
      value: m.value,
      cap,
      maxed: m.value >= cap,
    };
  });
});

/** 本次操作需要的器材份数。 */
const requiredMaterials = computed(() => (op.value === "remove" ? 1 : 3));

/** 储物袋中的器材（带格下标）。 */
const materialEntries = computed(() => {
  const p = protagonist.value;
  if (!p) return [];
  const out: { slotIndex: number; material: MaterialItemDefinition }[] = [];
  p.inventorySlots.forEach((cell, i) => {
    if (cell && "itemType" in cell && cell.itemType === "材料" && cell.category === "器材") {
      out.push({ slotIndex: i, material: cell as MaterialItemDefinition });
    }
  });
  return out;
});

function usageOf(slotIndex: number): number {
  return selectedMaterials.value.filter((s) => s === slotIndex).length;
}

function availableOf(slotIndex: number): number {
  const e = materialEntries.value.find((x) => x.slotIndex === slotIndex);
  return e ? e.material.count - usageOf(slotIndex) : 0;
}

function materialNameAt(slotIndex: number): string {
  const p = protagonist.value;
  if (!p) return "—";
  const cell = p.inventorySlots[slotIndex];
  if (!cell || !("itemType" in cell)) return "—";
  return (cell as MaterialItemDefinition).name;
}

function pickMaterial(slotIndex: number) {
  if (selectedMaterials.value.length >= requiredMaterials.value) return;
  if (availableOf(slotIndex) <= 0) return;
  selectedMaterials.value = [...selectedMaterials.value, slotIndex];
}

function removeMaterialAt(i: number) {
  const next = selectedMaterials.value.slice();
  next.splice(i, 1);
  selectedMaterials.value = next;
}

/** 当前失败率文案（剔除必定成功）。 */
const failureText = computed(() => {
  const tr = currentTreasure.value;
  if (!tr) return "";
  if (op.value === "remove") return "必定成功";
  const n = tr.function?.modifiers.length ?? 0;
  return `失败率 ${refineFailureChance(n, protagonist.value?.craftSkills.forging ?? 0)}%`;
});

/** 当前操作是否可执行；不可执行时给出原因文案。 */
const blockReason = computed(() => {
  const tr = currentTreasure.value;
  if (!tr) return "请先选择法宝";
  const mods = tr.function?.modifiers ?? [];
  if (op.value === "boost" && isFullyBoosted(tr)) return "全部词条已达数值上限";
  if (op.value === "add" && mods.length >= refineModifierCap(tr.grade)) {
    return `词条已满（${tr.grade}上限 ${refineModifierCap(tr.grade)} 条）`;
  }
  if (op.value === "remove" && removeIndex.value < 0) return "请选择要剔除的词条";
  if (selectedMaterials.value.length !== requiredMaterials.value) {
    return `需投入 ${requiredMaterials.value} 份器材`;
  }
  return "";
});

const canRefine = computed(() => blockReason.value === "");

function selectTarget(entry: TreasureEntry) {
  target.value = entry.target;
  removeIndex.value = -1;
  lastResult.value = null;
}

function setOp(next: RefineOp) {
  op.value = next;
  removeIndex.value = -1;
  lastResult.value = null;
  // 切换操作后所需份数可能变化，一律清空重选。
  selectedMaterials.value = [];
}

function doRefine() {
  if (!canRefine.value) return;
  const p = protagonist.value;
  const t = target.value;
  if (!p || !t) return;

  const res = p.refineTreasure(
    t,
    op.value,
    selectedMaterials.value.slice(),
    op.value === "remove" ? removeIndex.value : undefined,
  );
  if (!res) return;
  lastResult.value = res.success
    ? { success: true, text: "精炼成功" }
    : { success: false, text: "精炼失败，器材已耗尽" };
  selectedMaterials.value = [];
  removeIndex.value = -1;
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
      target.value = null;
      selectedMaterials.value = [];
      op.value = "boost";
      removeIndex.value = -1;
      lastResult.value = null;
      scrollLock.acquire();
    } else {
      scrollLock.release();
    }
  },
);

onMounted(() => document.addEventListener("keydown", onKeydown, true));
onUnmounted(() => document.removeEventListener("keydown", onKeydown, true));
</script>

<template>
  <Teleport to="body">
    <Transition name="mj-backdrop">
      <div v-if="open" class="side-modal-overlay" role="presentation" aria-hidden="false">
        <div
          class="side-modal-overlay__backdrop"
          tabindex="-1"
          aria-label="关闭"
          @click="onBackdropClick"
        />
        <Transition name="mj-modal" appear>
          <div
            class="side-modal side-modal--alchemy side-modal--refine"
            role="dialog"
            aria-modal="true"
            @click.stop
          >
            <div class="side-modal__header">
              <h4 class="side-modal__title">精炼台</h4>
              <button type="button" class="side-modal__close" aria-label="关闭" @click="onCloseClick">
                ×
              </button>
            </div>

            <div class="side-modal__body alchemy-body">
              <div class="alchemy-section-label">选择法宝</div>
              <div class="alchemy-material-list">
                <div v-if="treasureEntries.length === 0" class="alchemy-empty">暂无可精炼的法宝</div>
                <button
                  v-for="(e, i) in treasureEntries"
                  :key="'tr-' + i"
                  type="button"
                  class="alchemy-material"
                  :class="{
                    'refine-target--active':
                      target && target.where === e.target.where && target.index === e.target.index,
                  }"
                  :data-rarity="gradeToTraitRarity(e.treasure.grade)"
                  @click="selectTarget(e)"
                >
                  <span class="alchemy-material__name">{{ e.treasure.name }}</span>
                  <span class="alchemy-material__grade">{{ e.treasure.grade }}</span>
                  <span class="alchemy-material__count">{{ e.label }}</span>
                </button>
              </div>

              <template v-if="currentTreasure">
                <div class="alchemy-section-label">
                  当前词条（{{ modifierRows.length }}/{{ refineModifierCap(currentTreasure.grade) }}）
                </div>
                <div class="alchemy-material-list">
                  <div v-if="modifierRows.length === 0" class="alchemy-empty">该法宝无词条</div>
                  <button
                    v-for="row in modifierRows"
                    :key="'mod-' + row.index"
                    type="button"
                    class="alchemy-material"
                    :class="{ 'refine-mod--selected': op === 'remove' && removeIndex === row.index }"
                    :disabled="op !== 'remove'"
                    @click="removeIndex = row.index"
                  >
                    <span class="alchemy-material__name">{{ row.name }}</span>
                    <span class="alchemy-material__grade">+{{ row.value }}%</span>
                    <span class="alchemy-material__count">{{
                      row.maxed ? "已满" : "上限 " + row.cap + "%"
                    }}</span>
                  </button>
                </div>

                <div class="alchemy-section-label">精炼方式 · {{ failureText }}</div>
                <div class="refine-ops">
                  <button
                    type="button"
                    class="alchemy-btn"
                    :class="{ 'alchemy-btn--primary': op === 'boost' }"
                    @click="setOp('boost')"
                  >
                    提升数值
                  </button>
                  <button
                    type="button"
                    class="alchemy-btn"
                    :class="{ 'alchemy-btn--primary': op === 'add' }"
                    @click="setOp('add')"
                  >
                    增添词条
                  </button>
                  <button
                    type="button"
                    class="alchemy-btn"
                    :class="{ 'alchemy-btn--primary': op === 'remove' }"
                    @click="setOp('remove')"
                  >
                    剔除词条
                  </button>
                </div>
                <p v-if="currentTreasure.function?.coating" class="refine-coating">
                  当前涂层：{{ currentTreasure.function.coating.name }}（命中叠层，每层每回合最大血量
                  {{ currentTreasure.function.coating.tickPercent }}%，停手后残留
                  {{ currentTreasure.function.coating.duration }} 回合）
                </p>

                <div class="alchemy-section-label">
                  投入器材（{{ selectedMaterials.length }}/{{ requiredMaterials }}）
                </div>
                <div class="alchemy-slots">
                  <div
                    v-for="(slotIdx, i) in selectedMaterials"
                    :key="'sel-' + i"
                    class="alchemy-slot alchemy-slot--filled"
                    @click="removeMaterialAt(i)"
                  >
                    <span class="alchemy-slot__name">{{ materialNameAt(slotIdx) }}</span>
                    <span class="alchemy-slot__remove" title="移除">×</span>
                  </div>
                  <div
                    v-for="n in requiredMaterials - selectedMaterials.length"
                    :key="'empty-' + n"
                    class="alchemy-slot alchemy-slot--empty"
                  >
                    <span class="alchemy-slot__placeholder">空槽</span>
                  </div>
                </div>

                <div class="alchemy-section-label">器材储备</div>
                <div class="alchemy-material-list">
                  <div v-if="materialEntries.length === 0" class="alchemy-empty">储物袋中暂无器材</div>
                  <button
                    v-for="e in materialEntries"
                    :key="'mat-' + e.slotIndex"
                    type="button"
                    class="alchemy-material"
                    :data-rarity="gradeToTraitRarity(e.material.grade)"
                    :disabled="
                      availableOf(e.slotIndex) <= 0 || selectedMaterials.length >= requiredMaterials
                    "
                    @click="pickMaterial(e.slotIndex)"
                  >
                    <span class="alchemy-material__name">{{ e.material.name }}</span>
                    <span class="alchemy-material__grade">{{ e.material.grade }}</span>
                    <span class="alchemy-material__count"
                      >余 {{ availableOf(e.slotIndex) }}/{{ e.material.count }}</span
                    >
                  </button>
                </div>

                <p
                  v-if="lastResult"
                  class="refine-result"
                  :class="lastResult.success ? 'refine-result--ok' : 'refine-result--fail'"
                >
                  {{ lastResult.text }}
                </p>

                <div class="alchemy-actions">
                  <button
                    type="button"
                    class="alchemy-btn alchemy-btn--primary"
                    :disabled="!canRefine"
                    @click="doRefine"
                  >
                    {{ canRefine ? "开始精炼" : blockReason }}
                  </button>
                </div>
              </template>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.refine-ops {
  display: flex;
  gap: 6px;
  margin-bottom: 6px;
}

.refine-ops .alchemy-btn {
  flex: 1;
}

.refine-target--active,
.refine-mod--selected {
  outline: 1px solid currentColor;
}

.refine-coating {
  margin: 4px 0;
  font-size: 12px;
  opacity: 0.85;
}

.refine-result {
  margin: 6px 0;
  text-align: center;
  font-size: 13px;
}

.refine-result--ok {
  color: #7fd18a;
}

.refine-result--fail {
  color: #d18a7f;
}
</style>
