<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useFateChoice } from "./useFateChoice";
import type { CustomBirthPayload, FateChoiceResult, NarrationPerson } from "./types";
import { parseRealmFromCustomText, type TraitOption } from "./useFateChoice";

const props = defineProps<{ visible: boolean }>();

const emit = defineEmits<{
  close: [];
  complete: [payload: FateChoiceResult];
}>();

const {
  CREATION_BIRTHS,
  CREATION_GENDERS,
  CUSTOM_REALM_MAJORS,
  CUSTOM_REALM_MINORS,
  birthKeysOrdered,
  selectedBirth,
  customBirth,
  selectedGender,
  narrationPerson,
  playerName,
  currentTraitOptions,
  selectedLinggen,
  statusMessage,
  isReady,
  traitRandomizeDisabled,
  traitRandomizeTitle,
  reset,
  prepareInitialRolls,
  randomizeTraits,
  toggleTraitLock,
  applyRandomLinggen,
  buildPayload,
  selectBirth,
  applyCustomBirth,
  resolveBirthLocationDescFromDef,
} = useFateChoice();

function birthCardBlurb(birthKey: string): string {
  const bd = CREATION_BIRTHS[birthKey];
  return bd ? resolveBirthLocationDescFromDef(bd) : "";
}

const traitDetailTrait = ref<TraitOption | null>(null);
const customModalOpen = ref(false);
const customLoc = ref("");
const customRealmMajor = ref<string>(CUSTOM_REALM_MAJORS[0]!);
const customRealmMinor = ref<string>(CUSTOM_REALM_MINORS[0]!);
const customBg = ref("");

const linggenParts = computed(() => {
  const name = selectedLinggen.value;
  if (!name) return { type: "", elements: [] as string[] };
  const parts = name.split(/\s+/);
  const type = parts[0] || "";
  const elements = parts.slice(1).map((el) => el.replace(/,/g, ""));
  return { type, elements };
});

const customBirthFormValid = computed(
  () =>
    String(customLoc.value || "").trim() !== "" && String(customBg.value || "").trim() !== "",
);

watch(
  () => props.visible,
  (v) => {
    if (v) {
      reset();
      prepareInitialRolls();
      traitDetailTrait.value = null;
      customModalOpen.value = false;
      statusMessage.value = "";
    }
  },
  { immediate: true },
);

function onBackdropKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") {
    if (traitDetailTrait.value) {
      traitDetailTrait.value = null;
      e.preventDefault();
      return;
    }
    if (customModalOpen.value) {
      customModalOpen.value = false;
      e.preventDefault();
      return;
    }
  }
}

function openCustomModal(): void {
  const cb = customBirth.value;
  const fill = selectedBirth.value === "自定义" && cb && !cb.presetBirthKey;
  customLoc.value = fill && cb && cb.location != null ? String(cb.location) : "";
  let maj: string = CUSTOM_REALM_MAJORS[0]!;
  let mino: string = CUSTOM_REALM_MINORS[0]!;
  const cb0 = fill ? cb : null;
  if (cb0 && cb0.realmMajor && (CUSTOM_REALM_MAJORS as readonly string[]).includes(cb0.realmMajor)) {
    maj = cb0.realmMajor;
    if (cb0.realmMinor && (CUSTOM_REALM_MINORS as readonly string[]).includes(cb0.realmMinor)) {
      mino = cb0.realmMinor;
    }
  } else if (cb0?.realmText) {
    const parsed = parseRealmFromCustomText(cb0.realmText);
    if (parsed?.major) {
      maj = parsed.major;
      if (parsed.minor && (CUSTOM_REALM_MINORS as readonly string[]).includes(parsed.minor)) mino = parsed.minor;
    }
  }
  customRealmMajor.value = maj;
  customRealmMinor.value = mino;
  customBg.value = fill && cb0 && cb0.background != null ? String(cb0.background) : "";
  customModalOpen.value = true;
}

function confirmCustomBirth(): void {
  if (!customBirthFormValid.value) return;
  const loc = String(customLoc.value || "").trim();
  const maj = String(customRealmMajor.value || "").trim();
  const bg = String(customBg.value || "").trim();
  const mino = String(customRealmMinor.value || "").trim();
  const realmTxt = maj + mino;
  const payload: CustomBirthPayload = {
    tag: loc,
    name: loc,
    location: loc,
    realmMajor: maj,
    realmMinor: mino,
    realmText: realmTxt,
    background: bg,
  };
  applyCustomBirth(payload);
  customModalOpen.value = false;
}

function onBirthCardClick(name: string): void {
  if (name === "自定义") {
    openCustomModal();
    return;
  }
  selectBirth(name);
}

function onConfirm(): void {
  if (!isReady.value) {
    statusMessage.value = "请完成姓名、叙事人称、性别、出身、灵根与天赋词条。";
    return;
  }
  const payload = buildPayload();
  emit("complete", payload);
}

function narrationDesc(key: string): string {
  if (key === "first") return "我";
  if (key === "second") return "你";
  return String(playerName.value || "韩立");
}

function setNarrationPerson(key: string): void {
  if (key === "first" || key === "second" || key === "third") {
    narrationPerson.value = key as NarrationPerson;
  }
}

function customBirthSummary(): string {
  if (selectedBirth.value !== "自定义" || !customBirth.value) {
    return "点击填写出身地点、境界与背景";
  }
  const c = customBirth.value;
  const a = String(c.location || c.tag || "").slice(0, 40);
  const b = String(c.realmText || "").slice(0, 16);
  return a + " · " + b;
}
</script>

<template>
  <Teleport to="body">
    <div
      v-show="visible"
      id="fc-character-screen"
      class="fc-screen"
      role="dialog"
      aria-modal="true"
      aria-labelledby="fc-step-title"
      @keydown="onBackdropKeydown"
    >
      <div class="creation-container" tabindex="-1">
        <div class="creation-content">
          <div class="creation-step-header">
            <div>
              <div id="fc-step-title" class="creation-step-title">
                <i class="fas fa-scroll" aria-hidden="true"></i>
                <span>命运抉择</span>
              </div>
              <div class="creation-step-subtitle">完成配置后点击「确认选择」生成开局 JSON（属性由后续流程计算）</div>
            </div>
          </div>

          <div class="creation-section-title"><i class="fas fa-user"></i> 姓名</div>
          <div style="max-width: 620px">
            <input
              v-model="playerName"
              type="text"
              maxlength="24"
              placeholder="请输入姓名"
              class="fc-name-input"
            />
          </div>

          <div class="creation-section-title"><i class="fas fa-pen-fancy"></i> 叙事人称</div>
          <div class="creation-grid">
            <div
              v-for="row in [
                { key: 'first', title: '第一人称' },
                { key: 'second', title: '第二人称' },
                { key: 'third', title: '第三人称' },
              ]"
              :key="row.key"
              class="creation-card"
              :class="{ selected: narrationPerson === row.key }"
              role="button"
              tabindex="0"
              @click="setNarrationPerson(row.key)"
              @keydown.enter="setNarrationPerson(row.key)"
            >
              <h4>{{ row.title }}</h4>
              <p>{{ narrationDesc(row.key) }}</p>
            </div>
          </div>

          <div class="creation-section-title"><i class="fas fa-venus-mars"></i> 性别</div>
          <div class="creation-grid">
            <div
              v-for="name in CREATION_GENDERS"
              :key="name"
              class="creation-card"
              :class="{ selected: selectedGender === name }"
              role="button"
              tabindex="0"
              @click="selectedGender = name"
              @keydown.enter="selectedGender = name"
            >
              <h4>{{ name }}</h4>
            </div>
          </div>

          <div class="creation-section-title"><i class="fas fa-baby"></i> 选择出身</div>
          <div class="creation-grid">
            <template v-for="name in birthKeysOrdered" :key="name">
              <div
                v-if="name === '自定义'"
                class="creation-card"
                :class="{ selected: selectedBirth === '自定义' }"
                role="button"
                tabindex="0"
                @click="onBirthCardClick('自定义')"
                @keydown.enter="onBirthCardClick('自定义')"
              >
                <h4><span>自定义出身</span></h4>
                <p>{{ customBirthSummary() }}</p>
              </div>
              <div
                v-else-if="CREATION_BIRTHS[name]"
                class="creation-card"
                :class="{ selected: selectedBirth === name }"
                role="button"
                tabindex="0"
                @click="onBirthCardClick(name)"
                @keydown.enter="onBirthCardClick(name)"
              >
                <h4><span>{{ name }}</span></h4>
                <p v-if="birthCardBlurb(name)">{{ birthCardBlurb(name) }}</p>
              </div>
            </template>
          </div>

          <div class="creation-section-title"><i class="fas fa-star"></i> 天赋词条</div>
          <div class="fc-trait-stack">
            <div class="action-buttons-grid" style="width: 100%; max-width: 620px; margin: 0 auto">
              <button
                type="button"
                class="major-action-button"
                :disabled="traitRandomizeDisabled"
                :title="traitRandomizeTitle || undefined"
                @click="randomizeTraits()"
              >
                <i class="fas fa-dice"></i> 逆天改命
              </button>
            </div>
            <div id="trait-options-container">
              <template v-if="currentTraitOptions.length">
                <div
                  v-for="trait in currentTraitOptions"
                  :key="trait.name"
                  class="trait-card"
                  :class="['rarity-' + trait.rarity, { selected: trait.locked }]"
                  :data-trait-name="trait.name"
                  role="button"
                  tabindex="0"
                  @click="toggleTraitLock(trait.name)"
                  @keydown.enter="toggleTraitLock(trait.name)"
                >
                  <div class="trait-rarity">{{ trait.rarity }}</div>
                  <div class="trait-name">{{ trait.name }}</div>
                  <button
                    type="button"
                    class="trait-detail-btn"
                    title="查看详情"
                    @click.stop="traitDetailTrait = trait"
                  >
                    <i class="fas fa-info-circle"></i>
                  </button>
                  <div v-if="trait.locked" class="selected-indicator"><i class="fas fa-lock"></i></div>
                </div>
              </template>
              <div v-else class="muted" style="text-align: center; opacity: 0.7">尚未刷新候选词条，点击「逆天改命」。</div>
            </div>
            <div
              v-if="currentTraitOptions.length"
              class="creation-trait-bonus-summary muted"
              style="text-align: center; font-size: 12px; opacity: 0.75; padding: 4px 8px 0"
            >
              点击词条可锁定；此处仅记录选择，不计算属性。
            </div>
          </div>

          <div class="creation-section-title"><i class="fas fa-bolt"></i> 灵根</div>
          <div class="fc-linggen-block">
            <div id="linggen-result-display" style="transform: scale(1.08)">
              <div
                v-if="linggenParts.type"
                class="linggen-orb"
                :class="'orb-type-' + linggenParts.type"
              >
                <div class="linggen-tag" :class="'tag-type-' + linggenParts.type">{{ linggenParts.type }}</div>
                <div class="linggen-elements">{{ linggenParts.elements.join(" ") }}</div>
              </div>
              <div v-else style="color: #aaa">请点击「随机灵根」。</div>
            </div>
            <div class="action-buttons-grid fc-linggen-random-row">
              <button type="button" class="major-action-button" @click="applyRandomLinggen()">
                <i class="fas fa-dice-d20"></i> 随机灵根
              </button>
            </div>
            <p class="muted creation-linggen-hint">
              金灵根提升物攻；木灵根提升法攻；水灵根提升法力；火灵根提升血量；土灵根提升物防与法防。灵根越多，修炼越慢。
            </p>
          </div>

          <div
            v-if="statusMessage"
            class="fc-status"
            style="margin: 10px 0 0; font-size: 13px; color: #e0b15a"
          >
            {{ statusMessage }}
          </div>
        </div>

        <div class="creation-nav">
          <div class="creation-nav-enhanced">
            <button type="button" class="major-action-button nav-btn nav-btn-back" @click="emit('close')">
              <i class="fas fa-home"></i>
              <span>返回</span>
            </button>
            <button
              type="button"
              class="major-action-button nav-btn nav-btn-next"
              :disabled="!isReady"
              @click="onConfirm"
            >
              <span>确认选择</span>
              <i class="fas fa-check"></i>
            </button>
          </div>
        </div>
      </div>

      <div
        v-show="traitDetailTrait"
        class="mj-trait-modal-root"
        :aria-hidden="traitDetailTrait ? 'false' : 'true'"
      >
        <div class="mj-trait-modal-backdrop" @click="traitDetailTrait = null"></div>
        <div
          v-if="traitDetailTrait"
          class="mj-trait-modal"
          :data-rarity="traitDetailTrait.rarity"
          role="dialog"
          aria-modal="true"
        >
          <button type="button" class="mj-trait-modal-close" aria-label="关闭" @click="traitDetailTrait = null">
            ×
          </button>
          <h3 class="mj-trait-modal-title">{{ traitDetailTrait.name }}</h3>
          <div class="mj-trait-modal-rarity">品质：{{ traitDetailTrait.rarity }}</div>
          <div class="mj-trait-modal-body">
            <div class="mj-trait-modal-section">
              <span class="mj-trait-modal-k">简述</span>
              <div class="mj-trait-modal-v">{{ traitDetailTrait.desc }}</div>
            </div>
          </div>
        </div>
      </div>

      <div
        v-show="customModalOpen"
        class="mj-trait-modal-root"
        :aria-hidden="customModalOpen ? 'false' : 'true'"
      >
        <div class="mj-trait-modal-backdrop" @click="customModalOpen = false"></div>
        <div class="mj-trait-modal mj-custom-birth-dialog" role="dialog" aria-modal="true">
          <button type="button" class="mj-trait-modal-close" aria-label="关闭" @click="customModalOpen = false">
            ×
          </button>
          <h3 class="mj-trait-modal-title">自定义出身</h3>
          <div class="mj-trait-modal-body mj-custom-birth-body">
            <label class="mj-custom-birth-label" for="fc-custom-loc">出身地点</label>
            <input id="fc-custom-loc" v-model="customLoc" class="mj-custom-birth-input" type="text" />
            <span class="mj-custom-birth-label">境界</span>
            <div class="mj-custom-birth-realm-row">
              <select id="fc-custom-major" v-model="customRealmMajor" class="mj-custom-birth-select">
                <option v-for="m in CUSTOM_REALM_MAJORS" :key="m" :value="m">{{ m }}</option>
              </select>
              <div class="mj-custom-birth-realm-minor-wrap">
                <select id="fc-custom-minor" v-model="customRealmMinor" class="mj-custom-birth-select">
                  <option v-for="m in CUSTOM_REALM_MINORS" :key="m" :value="m">{{ m }}</option>
                </select>
              </div>
            </div>
            <label class="mj-custom-birth-label" for="fc-custom-bg">出身背景</label>
            <textarea id="fc-custom-bg" v-model="customBg" class="mj-custom-birth-textarea"></textarea>
            <div class="mj-custom-birth-actions">
              <button type="button" class="major-action-button mj-custom-birth-btn-cancel" @click="customModalOpen = false">
                取消
              </button>
              <button
                type="button"
                class="major-action-button"
                :disabled="!customBirthFormValid"
                :title="customBirthFormValid ? undefined : '请填写出身地点与出身背景'"
                @click="confirmCustomBirth"
              >
                确定
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
