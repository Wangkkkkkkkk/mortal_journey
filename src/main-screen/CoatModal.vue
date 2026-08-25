<script setup lang="ts">
/**
 * 淬毒台：消耗 3 份「毒物」为指定法宝附加毒性涂层。
 *
 * 与精炼台的区别：淬毒属【毒术】（吃毒物、必定成功、涂层强度随毒术熟练度跃迁），
 * 精炼属【锻造】（吃器材、按词条数掷失败率）。重复淬毒会覆盖旧涂层。
 */
import { ref, computed, watch, onMounted, onUnmounted } from "vue";
import { protagonist, type RefineTarget } from "../role_core/Protagonist";
import type { MaterialItemDefinition } from "../role_core/types/itemInfo";
import type { TreasureItemDefinition } from "../role_core/types/treasure";
import { computeAlchemyGradeOdds } from "../role_core/alchemy";
import { craftUpgradeChance } from "../role_core/craft";
import { gradeToTraitRarity } from "./protagonistPanelDisplay";
import { useScrollLock } from "../composables/useScrollLock";
import { writeActiveSave } from "../save/gameSave";

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: [] }>();

const scrollLock = useScrollLock();

/** 当前选中的法宝位置。 */
const target = ref<RefineTarget | null>(null);
/** 已选毒物格下标（长度 0–3，允许重复以表示从同一堆取多份）。 */
const selected = ref<number[]>([]);
/** 上一次淬毒结果提示。 */
const lastResult = ref<string>("");

interface TreasureEntry {
  target: RefineTarget;
  treasure: TreasureItemDefinition;
  label: string;
}

/** 可淬毒的法宝：已装备的槽位 + 储物袋中的法宝。 */
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

/** 储物袋中所有「毒物」类材料（带格下标）；淬毒只吃毒物。 */
const materialEntries = computed(() => {
  const p = protagonist.value;
  if (!p) return [];
  const out: { slotIndex: number; material: MaterialItemDefinition }[] = [];
  p.inventorySlots.forEach((cell, i) => {
    if (cell && "itemType" in cell && cell.itemType === "材料" && cell.category === "毒物") {
      out.push({ slotIndex: i, material: cell as MaterialItemDefinition });
    }
  });
  return out;
});

/** 【毒术】熟练度与由此得到的品阶跃迁概率（决定涂层强度）。 */
const poisonProficiency = computed(() => protagonist.value?.craftSkills.poison ?? 0);
const upgradeChanceText = computed(
  () => `${Math.round(craftUpgradeChance(poisonProficiency.value) * 10) / 10}%`,
);

/** 已选毒物的品阶分布（涂层强度按此加权随机）。 */
const gradeOdds = computed(() => {
  const p = protagonist.value;
  if (!p) return [];
  return computeAlchemyGradeOdds(
    selected.value.map((i) => (p.inventorySlots[i] as MaterialItemDefinition).grade),
  );
});

function usageOf(slotIndex: number): number {
  return selected.value.filter((s) => s === slotIndex).length;
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
  if (selected.value.length >= 3) return;
  if (availableOf(slotIndex) <= 0) return;
  selected.value = [...selected.value, slotIndex];
}

function removeAt(i: number) {
  const next = selected.value.slice();
  next.splice(i, 1);
  selected.value = next;
}

/** 不可淬毒时的原因文案；空串表示可执行。 */
const blockReason = computed(() => {
  const tr = currentTreasure.value;
  if (!tr) return "请先选择法宝";
  if (!tr.function) return "该法宝无词条组，无法淬毒";
  if (selected.value.length !== 3) return "需投入 3 份毒物";
  return "";
});

const canCoat = computed(() => blockReason.value === "");

function selectTarget(entry: TreasureEntry) {
  target.value = entry.target;
  lastResult.value = "";
}

function doCoat() {
  if (!canCoat.value) return;
  const p = protagonist.value;
  const t = target.value;
  if (!p || !t) return;

  const coated = p.coatTreasureWithPoison(t, selected.value.slice());
  lastResult.value = coated
    ? `淬毒成功：${coated.function?.coating?.name ?? ""}`
    : "淬毒失败";
  selected.value = [];
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
      selected.value = [];
      lastResult.value = "";
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
            class="side-modal side-modal--alchemy side-modal--coat"
            role="dialog"
            aria-modal="true"
            @click.stop
          >
            <div class="side-modal__header">
              <h4 class="side-modal__title">淬毒台</h4>
              <button type="button" class="side-modal__close" aria-label="关闭" @click="onCloseClick">
                ×
              </button>
            </div>

            <div class="side-modal__body alchemy-body">
              <div class="alchemy-section-label">选择法宝</div>
              <div class="alchemy-material-list">
                <div v-if="treasureEntries.length === 0" class="alchemy-empty">暂无可淬毒的法宝</div>
                <button
                  v-for="(e, i) in treasureEntries"
                  :key="'tr-' + i"
                  type="button"
                  class="alchemy-material"
                  :class="{
                    'coat-target--active':
                      target && target.where === e.target.where && target.index === e.target.index,
                  }"
                  :data-rarity="gradeToTraitRarity(e.treasure.grade)"
                  @click="selectTarget(e)"
                >
                  <span class="alchemy-material__name">{{ e.treasure.name }}</span>
                  <span class="alchemy-material__grade">{{ e.treasure.grade }}</span>
                  <span class="alchemy-material__count">
                    {{ e.treasure.function?.coating ? "已淬毒" : e.label }}
                  </span>
                </button>
              </div>

              <template v-if="currentTreasure">
                <p v-if="currentTreasure.function?.coating" class="coat-current">
                  当前涂层：{{ currentTreasure.function.coating.name }}（命中叠层，每层每回合最大血量
                  {{ currentTreasure.function.coating.tickPercent }}%，停手后残留
                  {{ currentTreasure.function.coating.duration }} 回合）· 再次淬毒将覆盖
                </p>

                <div class="alchemy-section-label">投入毒物（三份）</div>
                <div class="alchemy-slots">
                  <div
                    v-for="(slotIdx, i) in selected"
                    :key="'sel-' + i"
                    class="alchemy-slot alchemy-slot--filled"
                    @click="removeAt(i)"
                  >
                    <span class="alchemy-slot__name">{{ materialNameAt(slotIdx) }}</span>
                    <span class="alchemy-slot__remove" title="移除">×</span>
                  </div>
                  <div
                    v-for="n in 3 - selected.length"
                    :key="'empty-' + n"
                    class="alchemy-slot alchemy-slot--empty"
                  >
                    <span class="alchemy-slot__placeholder">空槽</span>
                  </div>
                </div>

                <div v-if="gradeOdds.length > 0" class="alchemy-preview">
                  <div class="alchemy-section-label">涂层品阶概率</div>
                  <div class="alchemy-odds">
                    <span
                      v-for="o in gradeOdds"
                      :key="o.grade"
                      class="alchemy-odds-item"
                      :data-rarity="gradeToTraitRarity(o.grade)"
                      >{{ o.grade }} {{ o.percent }}%</span
                    >
                  </div>
                </div>

                <div class="alchemy-section-label">
                  毒术 {{ poisonProficiency }} · 品阶跃迁 {{ upgradeChanceText }} · 必定成功
                </div>

                <div class="alchemy-section-label">毒物储备</div>
                <div class="alchemy-material-list">
                  <div v-if="materialEntries.length === 0" class="alchemy-empty">储物袋中暂无毒物</div>
                  <button
                    v-for="e in materialEntries"
                    :key="'mat-' + e.slotIndex"
                    type="button"
                    class="alchemy-material"
                    :data-rarity="gradeToTraitRarity(e.material.grade)"
                    :disabled="availableOf(e.slotIndex) <= 0 || selected.length >= 3"
                    @click="pickMaterial(e.slotIndex)"
                  >
                    <span class="alchemy-material__name">{{ e.material.name }}</span>
                    <span class="alchemy-material__grade">{{ e.material.grade }}</span>
                    <span class="alchemy-material__count"
                      >余 {{ availableOf(e.slotIndex) }}/{{ e.material.count }}</span
                    >
                  </button>
                </div>

                <p v-if="lastResult" class="coat-result">{{ lastResult }}</p>

                <div class="alchemy-actions">
                  <button
                    type="button"
                    class="alchemy-btn alchemy-btn--primary"
                    :disabled="!canCoat"
                    @click="doCoat"
                  >
                    {{ canCoat ? "开始淬毒" : blockReason }}
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
.coat-target--active {
  outline: 1px solid currentColor;
}

.coat-current {
  margin: 4px 0;
  font-size: 12px;
  opacity: 0.85;
}

.coat-result {
  margin: 6px 0;
  text-align: center;
  font-size: 13px;
  color: #7fd18a;
}
</style>
