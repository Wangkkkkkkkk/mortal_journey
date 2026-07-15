<script setup lang="ts">
import { toRef, computed, ref } from "vue";
import { useOpeningStoryFromFateChoice } from "../ai_core";
import { useApiConfig } from "../ai_core";
import { protagonist } from "../role_core/Protagonist";
import { Npc } from "../role_core/Npc";
import { npcStore } from "../role_core/npcStore";
import { getRow } from "../role_core/realmUtils";
import type { NpcPlayInfo } from "../role_core/types/playInfo";
import type { FateChoiceResult } from "../fate_choice/types";
import type { BattleTriggerEntry } from "../ai_core";
import type { CultivationInput } from "../ai_core";
import type { BattleResult } from "../battle_engine/types";
import type { WorldLocation } from "../role_core/types/worldLocation";
import SideToolbarPanel from "./SideToolbarPanel.vue";
import PlayerInfoPanel from "./PlayerInfoPanel.vue";
import StoryChatPanel from "./StoryChatPanel.vue";
import { TEST_ALLY_DUMMY_NAMES, TEST_ENEMY_DUMMY_NAMES, ALL_TEST_DUMMY_NAMES } from "./testBattle";
import kuileiAvatar from "../assets/kuilei.png";

const props = defineProps<{
  visible: boolean;
  fateChoice?: FateChoiceResult | null;
  battleResult?: BattleResult | null;
}>();

const { apiUrl, apiKey, apiModel } = useApiConfig();

const fateChoiceRef = toRef(props, "fateChoice");
const apiSlice = computed(() => ({
  apiUrl: apiUrl.value,
  apiKey: apiKey.value,
  apiModel: apiModel.value,
}));

const { phase, errorMessage, worldTime, worldTimeBaseline, worldLocation } =
  useOpeningStoryFromFateChoice(fateChoiceRef, apiSlice);

const emit = defineEmits<{
  back: [];
  battleTrigger: [value: BattleTriggerEntry];
  consumeBattleResult: [];
  cultivate: [value: CultivationInput];
  gameOver: [reason: string];
}>();

const pendingCultivation = ref<CultivationInput | null>(null);
const chatGenerating = ref(false);

const isBusy = computed(() => phase.value !== "ready" || chatGenerating.value);

function onCultivate(input: CultivationInput) {
  pendingCultivation.value = input;
}

function consumeCultivation() {
  pendingCultivation.value = null;
}

function onBack() {
  emit("back");
}

function startTestBattle() {
  const p = protagonist.value;
  if (!p) return;

  // 清掉上一次测试残留的假人。
  for (const n of ALL_TEST_DUMMY_NAMES) {
    npcStore.removeNpc(n);
  }

  // 假人 HP/MP/属性全部取自主角境界的纯净基准值（境界表），不受主角丹药/天赋/装备加成影响。
  const realmRow = getRow(p.realm.major, p.realm.minor)
    ?? getRow("练气", "初期")
    ?? { hp: 200, mp: 100, physique: 5, spirit: 5, strength: 25, perception: 25, guard: 3, resistance: 3, agility: 2, insight: 2 };

  const dummyMaxHp = realmRow.hp * 10;
  const dummyMaxMp = realmRow.mp * 10;
  const dummyRealm = { major: p.realm.major, minor: p.realm.minor };

  /** 构建一个战斗测试假人（属性全部一致，取自主角境界表基准）。 */
  function makeDummy(displayName: string, id: string): NpcPlayInfo {
    return {
      id,
      displayName,
      realm: { ...dummyRealm },
      primaryStats: {
        physique: realmRow.physique,
        spirit: realmRow.spirit,
        strength: realmRow.strength,
        perception: realmRow.perception,
        guard: realmRow.guard,
        resistance: realmRow.resistance,
        agility: realmRow.agility,
        insight: realmRow.insight,
      },
      maxHp: dummyMaxHp,
      maxMp: dummyMaxMp,
      currentHp: dummyMaxHp,
      currentMp: dummyMaxMp,
      avatarUrl: kuileiAvatar,
      gender: "无",
      linggen: [],
      age: 0,
      ageConfirmed: true,
      shouyuan: 9999,
      inventorySlots: [],
      gongfaSlots: [null, null, null, null, null, null, null, null],
      equippedSlots: [],
      role: "npc",
      identity: "战斗测试人偶",
      favorability: 0,
      isDead: false,
      powerTier: "小怪",
      race: "修仙者",
      appearance: "",
      clothing: "",
      traits: [],
      xiuwei: 0,
    };
  }

  // 注册 2 友方 + 3 敌方假人（属性完全相同）。
  TEST_ALLY_DUMMY_NAMES.forEach((name, i) => {
    npcStore.setNpc(Npc.fromData(makeDummy(name, `test-ally-${i}`)));
  });
  TEST_ENEMY_DUMMY_NAMES.forEach((name, i) => {
    npcStore.setNpc(Npc.fromData(makeDummy(name, `test-enemy-${i}`)));
  });

  emit("battleTrigger", {
    shouldEnterBattle: true,
    triggerKind: "active" as const,
    triggerReason: "战斗测试",
    allies: [
      { displayName: p.displayName, roleHint: "主角" },
      ...TEST_ALLY_DUMMY_NAMES.map((n) => ({ displayName: n, roleHint: "友方" })),
    ],
    enemies: TEST_ENEMY_DUMMY_NAMES.map((n) => ({ displayName: n, roleHint: "敌人" })),
    isTestBattle: true,
  });
}
</script>

<template>
  <div
    class="main-screen"
    role="application"
    aria-label="无限仙途主界面"
  >
    <header class="main-screen__toolbar">
      <h1 class="main-screen__title">无限仙途</h1>
      <div class="main-screen__toolbar-actions">
        <button type="button" class="main-screen__btn" @click="onBack">返回标题</button>
      </div>
    </header>
    <div class="main-screen__body">
      <aside class="main-screen__pane main-screen__pane--player" aria-label="左栏：主角与世界时间">
        <PlayerInfoPanel
          :protagonist="protagonist"
          :world-time="worldTime"
          :world-time-baseline="worldTimeBaseline"
          @update:world-time="worldTime = $event"
          @cultivate="onCultivate"
        />
      </aside>
      <main class="main-screen__pane main-screen__pane--chat" aria-label="中栏：剧情">
        <StoryChatPanel
          :phase="phase"
          :error-message="errorMessage"
          :current-world-location="worldLocation"
          :battle-result="props.battleResult"
          :cultivation-input="pendingCultivation"
          v-model:world-time="worldTime"
          @update:world-location="worldLocation = $event"
          @battle-trigger="emit('battleTrigger', $event)"
          @consume-battle-result="emit('consumeBattleResult')"
          @consume-cultivation="consumeCultivation"
          @generating-change="chatGenerating = $event"
          @game-over="emit('gameOver', $event)"
        />
      </main>
      <aside class="main-screen__pane main-screen__pane--side" aria-label="右栏：功能面板">
        <SideToolbarPanel :current-location="worldLocation" :test-disabled="isBusy" @test-battle="startTestBattle" />
      </aside>
    </div>
  </div>
</template>
