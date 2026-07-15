<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useSplash, type SaveIndexEntry, type MjSavePayload } from "./useSplash";
import { useScrollLock } from "../composables/useScrollLock";
import splashBgVideo from "./splash-bg.mp4";
import splashBgPoster from "./splash-bg.png";
import "./start_frame.css";

const props = defineProps<{
  mainScreenVisible: boolean;
}>();

const emit = defineEmits<{
  (e: "start-new-life"): void;
  (e: "save-loaded", value: { id: string; payload: MjSavePayload }): void;
}>();

const scrollLock = useScrollLock();

const {
  apiModalOpen,
  saveModalOpen,
  helpModalOpen,
  apiUrl,
  apiKey,
  apiModel,
  apiStatus,
  apiStatusOk,
  imageBaseUrl,
  imageApiKey,
  imageModel,
  imageAutoGenerate,
  imageStatus,
  imageStatusOk,
  saveStatus,
  saveStatusOk,
  saves,
  canStart,
  fmtTime,
  openApiSettings,
  closeApiSettings,
  saveApiSettings,
  clearApiSettings,
  testApiSettings,
  saveImageApiSettings,
  clearImageApiSettings,
  testImageApiSettings,
  toggleImageAutoGenerate,
  openSaveLoad,
  closeSaveLoad,
  openHelp,
  closeHelp,
  refreshSaveList,
  loadSave,
  exportSave,
  importSaveFromFile,
  deleteSave,
  deleteAllSaves,
} = useSplash();

watch(
  [apiModalOpen, saveModalOpen, helpModalOpen],
  ([am, sm, hm]) => {
    if (am || sm || hm) scrollLock.acquire();
    else scrollLock.release();
  },
);

const apiTab = ref<"story" | "image">("story");
watch(apiModalOpen, (open) => {
  if (open) apiTab.value = "story";
});

const startDisabledTitle = computed(() =>
  canStart.value
    ? undefined
    : "请先在「API设置」中配置 API URL / Key / 模型（本地代理可不填 Key）。",
);

function onStartNewLife() {
  emit("start-new-life");
}

function onLoadSave(it: SaveIndexEntry) {
  const res = loadSave(it);
  if (res) emit("save-loaded", res);
}

const importInput = ref<HTMLInputElement | null>(null);

function onExportSave(it: SaveIndexEntry) {
  exportSave(it);
}

function triggerImport() {
  importInput.value?.click();
}

function onImportFilePicked(e: Event) {
  const target = e.target as HTMLInputElement;
  const file = target.files && target.files[0];
  target.value = "";
  if (!file) return;
  importSaveFromFile(file);
}
</script>

<template>
  <div id="splash-screen">
    <div id="splash-bg" aria-hidden="true">
      <video
        class="splash-bg-video"
        :src="splashBgVideo"
        :poster="splashBgPoster"
        autoplay
        muted
        loop
        playsinline
        preload="auto"
      ></video>
    </div>

    <div id="splash-content">
      <div id="splash-formation" aria-hidden="true"></div>

      <div id="splash-header">
        <h1 id="splash-title">无限仙途</h1>
      </div>

      <button
        id="splash-start-btn"
        type="button"
        :disabled="!canStart"
        :title="startDisabledTitle"
        @click="onStartNewLife"
      >
        开始游戏
      </button>

      <nav id="splash-nav">
        <button
          class="splash-nav-item"
          type="button"
          :disabled="!canStart"
          :title="startDisabledTitle"
          @click="openSaveLoad"
        >
          读取人生
        </button>
        <button
          class="splash-nav-item"
          type="button"
          @click="openHelp"
        >
          游玩说明
        </button>
        <button
          class="splash-nav-item"
          type="button"
          @click="openApiSettings"
        >
          API设置
        </button>
      </nav>

      <p id="splash-info">作者: KAI · Version: 2.1.0</p>
    </div>
  </div>

  <Transition name="mj-backdrop">
    <div
      v-if="apiModalOpen"
      id="api-settings-root"
      class="splash-modal-root"
      aria-hidden="false"
      @keydown="(e: KeyboardEvent) => { if (e.key === 'Escape') { closeApiSettings(); e.preventDefault(); } }"
    >
      <div class="splash-modal-backdrop" tabindex="-1" @click="closeApiSettings"></div>
      <Transition name="mj-modal" appear>
        <div class="splash-modal" role="dialog" aria-modal="true" aria-labelledby="api-settings-title">
      <button type="button" class="splash-modal-close" aria-label="关闭" @click="closeApiSettings">×</button>
      <h3 id="api-settings-title" class="splash-modal-title">API 设置</h3>
      <div class="splash-tabs" role="tablist" aria-label="API 设置分类">
        <button
          type="button"
          class="splash-tab"
          :class="{ 'is-active': apiTab === 'story' }"
          role="tab"
          :aria-selected="apiTab === 'story'"
          @click="apiTab = 'story'"
        >
          剧情生成
        </button>
        <button
          type="button"
          class="splash-tab"
          :class="{ 'is-active': apiTab === 'image' }"
          role="tab"
          :aria-selected="apiTab === 'image'"
          @click="apiTab = 'image'"
        >
          文生图
        </button>
      </div>

      <div v-show="apiTab === 'story'" role="tabpanel">
        <p class="splash-modal-sub">目前仅支持 OpenAI 格式的 API。</p>

        <div class="splash-form">
          <label class="splash-field">
            <span class="splash-field-k">API URL</span>
            <input
              v-model="apiUrl"
              class="splash-field-input"
              type="text"
              placeholder="https://api.example.com/v1"
            />
          </label>
          <label class="splash-field">
            <span class="splash-field-k">API Key</span>
            <input
              v-model="apiKey"
              class="splash-field-input"
              type="password"
              placeholder="sk-..."
            />
          </label>
          <label class="splash-field">
            <span class="splash-field-k">模型</span>
            <input
              v-model="apiModel"
              class="splash-field-input"
              type="text"
              placeholder="gpt-4.1-mini"
            />
          </label>
        </div>

        <div class="splash-modal-actions splash-modal-actions--3">
          <button type="button" class="splash-modal-btn splash-modal-btn--secondary" @click="clearApiSettings">
            清除
          </button>
          <button type="button" class="splash-modal-btn splash-modal-btn--secondary" @click="testApiSettings">
            测试
          </button>
          <button type="button" class="splash-modal-btn" @click="saveApiSettings">保存</button>
        </div>
        <div
          class="splash-modal-status"
          :class="{
            'splash-modal-status--ok': apiStatusOk && apiStatus,
            'splash-modal-status--bad': !apiStatusOk && apiStatus,
          }"
          aria-live="polite"
        >
          {{ apiStatus }}
        </div>
      </div>

      <div v-show="apiTab === 'image'" role="tabpanel">
        <p class="splash-modal-sub">
          仅支持火山方舟（Ark）文生图，模型为 doubao-seedream 系列。地址可为 Ark 直连、自建 CORS 代理或网关。
        </p>

        <div class="splash-form">
          <label class="splash-field">
            <span class="splash-field-k">地址</span>
            <input
              v-model="imageBaseUrl"
              class="splash-field-input"
              type="text"
              placeholder="https://ark.cn-beijing.volces.com/api/v3"
            />
          </label>
          <label class="splash-field">
            <span class="splash-field-k">API Key</span>
            <input
              v-model="imageApiKey"
              class="splash-field-input"
              type="password"
              placeholder="ark-..."
            />
          </label>
          <label class="splash-field">
            <span class="splash-field-k">模型</span>
            <input
              v-model="imageModel"
              class="splash-field-input"
              type="text"
              placeholder="doubao-seedream-4-0-..."
            />
          </label>
        </div>

        <div class="splash-modal-actions splash-modal-actions--3">
          <button type="button" class="splash-modal-btn splash-modal-btn--secondary" @click="clearImageApiSettings">
            清除
          </button>
          <button type="button" class="splash-modal-btn splash-modal-btn--secondary" @click="testImageApiSettings">
            测试
          </button>
          <button type="button" class="splash-modal-btn" @click="saveImageApiSettings">保存</button>
        </div>
        <div
          class="splash-modal-status"
          :class="{
            'splash-modal-status--ok': imageStatusOk && imageStatus,
            'splash-modal-status--bad': !imageStatusOk && imageStatus,
          }"
          aria-live="polite"
        >
          {{ imageStatus }}
        </div>

        <div class="splash-switch-row">
          <div class="splash-switch-label">
            <span class="splash-field-k">立绘生成方式</span>
            <span class="splash-toggle-hint">
              {{ imageAutoGenerate ? '新 NPC 出现时自动生成立绘，建议手动生成' : '在 NPC 详情中手动生成，推荐' }}
            </span>
          </div>
          <button
            type="button"
            class="splash-switch"
            :class="{ 'is-on': imageAutoGenerate }"
            role="switch"
            :aria-checked="imageAutoGenerate"
            @click="toggleImageAutoGenerate"
          >
            <span class="splash-switch-knob"></span>
          </button>
        </div>
      </div>
    </div>
      </Transition>
    </div>
  </Transition>

  <Transition name="mj-backdrop">
    <div
      v-if="saveModalOpen"
      id="save-load-root"
      class="splash-modal-root"
      aria-hidden="false"
    @keydown="(e: KeyboardEvent) => { if (e.key === 'Escape') { closeSaveLoad(); e.preventDefault(); } }"
  >
    <div class="splash-modal-backdrop" tabindex="-1" @click="closeSaveLoad"></div>
    <Transition name="mj-modal" appear>
      <div class="splash-modal splash-modal--wide" role="dialog" aria-modal="true" aria-labelledby="save-load-title">
      <button type="button" class="splash-modal-close" aria-label="关闭" @click="closeSaveLoad">×</button>
      <h3 id="save-load-title" class="splash-modal-title">读取人生</h3>
      <p class="splash-modal-sub">选择一个存档继续修行（存档保存在本机浏览器中）。</p>
      <div class="save-load-list">
        <p v-if="!saves.length" class="save-load-empty">暂无存档。请先在「开始游戏」里创建一个存档。</p>
        <div v-for="it in saves" :key="it.id" class="save-load-row">
          <div class="save-load-info">
            <p class="save-load-name">
              {{ it.name || it.id }}
              <span v-if="it.ended" class="save-load-badge save-load-badge--ended">已殒落</span>
              <span v-if="it.imported" class="save-load-badge save-load-badge--imported">导入</span>
            </p>
            <p v-if="it.realm || it.location" class="save-load-meta">{{ it.realm }}<template v-if="it.realm && it.location"> · </template>{{ it.location }}</p>
            <p class="save-load-meta">创建：{{ fmtTime(it.createdAt) }} · 更新：{{ fmtTime(it.updatedAt) }}<template v-if="it.importedAt"> · 导入：{{ fmtTime(it.importedAt) }}</template></p>
          </div>
          <div class="save-load-actions">
            <button type="button" class="splash-modal-btn" @click="onLoadSave(it)">读取</button>
            <button type="button" class="splash-modal-btn splash-modal-btn--secondary" @click="onExportSave(it)">
              导出
            </button>
            <button type="button" class="splash-modal-btn splash-modal-btn--secondary" @click="deleteSave(it)">
              删除
            </button>
          </div>
        </div>
      </div>
      <div class="splash-modal-actions splash-modal-actions--3">
        <button type="button" class="splash-modal-btn splash-modal-btn--secondary" @click="refreshSaveList">
          刷新
        </button>
        <button type="button" class="splash-modal-btn" @click="triggerImport">导入</button>
        <button type="button" class="splash-modal-btn splash-modal-btn--secondary" @click="deleteAllSaves">清空</button>
      </div>
      <input
        ref="importInput"
        type="file"
        accept=".json,application/json"
        class="hidden"
        @change="onImportFilePicked"
      />
      <div
        class="splash-modal-status"
        :class="{
          'splash-modal-status--ok': saveStatusOk && saveStatus,
          'splash-modal-status--bad': !saveStatusOk && saveStatus,
        }"
        aria-live="polite"
      >
        {{ saveStatus }}
      </div>
      </div>
      </Transition>
    </div>
  </Transition>

  <Transition name="mj-backdrop">
    <div
      v-if="helpModalOpen"
      id="help-root"
      class="splash-modal-root"
      aria-hidden="false"
      @keydown="(e: KeyboardEvent) => { if (e.key === 'Escape') { closeHelp(); e.preventDefault(); } }"
    >
      <div class="splash-modal-backdrop" tabindex="-1" @click="closeHelp"></div>
      <Transition name="mj-modal" appear>
        <div class="splash-modal splash-modal--wide" role="dialog" aria-modal="true" aria-labelledby="help-title">
          <button type="button" class="splash-modal-close" aria-label="关闭" @click="closeHelp">×</button>
          <h3 id="help-title" class="splash-modal-title">游玩说明</h3>
          <div class="help-content">
            <section class="help-section">
              <h4 class="help-h">游戏目标</h4>
              <p class="help-p">
                你将扮演一名修仙者，在有限的寿元内不断突破境界，追寻长生大道。开局可选难度：
                <span class="help-em">简单</span>（休闲，不会真正死亡）/
                <span class="help-em">正常</span>（寿命有限，可能战死）/
                <span class="help-em">困难</span>（敌人远超常人）。
              </p>
            </section>
            <section class="help-section">
              <h4 class="help-h">境界之路</h4>
              <p class="help-p">
                5 大境界：练气 → 筑基 → 结丹 → 元婴 → 化神；每个大境界分 初期 / 中期 / 后期，共 15 阶。
                每提升一阶，主属性、HP/MP 上限、寿元上限都会重置刷新。
              </p>
            </section>
            <section class="help-section">
              <h4 class="help-h">修为与突破</h4>
              <p class="help-p">
                修为是数值（不是百分比），每境界有固定门槛（如练气初期需 1000）。修为攒满后会触发
                「突破任务」（由剧情推动），完成后境界提升、修为归零。突破失败不会损失修为，但可能折损气血、灵石或时间。
              </p>
            </section>
            <section class="help-section">
              <h4 class="help-h">功法 —— 核心提升方式</h4>
              <p class="help-p">
                功法有 8 个槽位，每门功法可修炼到 1-10 层熟练度。消耗灵石闭关修炼，每颗灵石约换 100 熟练度经验。
              </p>
              <p class="help-p help-highlight">
                ★ 关键规则：功法熟练度的提升会等额加到修为上 —— 修炼功法就是提升修为，是中后期成长的核心。
              </p>
              <p class="help-p">
                功法分下品 → 中品 → 上品 → 极品 → 仙品 → 神品 6 级品阶，以及 剑修 / 体修 / 法修 / 毒修 / 通用 五种体系，
                影响修炼速度与战斗效果。
              </p>
            </section>
            <section class="help-section">
              <h4 class="help-h">灵根与属性</h4>
              <p class="help-p">
                灵根越少越好：天灵根（1 根）修炼最快，伪灵根（5 根）最慢。金木水火土五行各自提供独立加成
                （暴击伤 / 丹药效 / 冷却 / 恢复 / 护盾）。
              </p>
              <p class="help-p">
                八项主属性：体魄 / 灵力 / 劲力 / 神识 / 护体 / 灵御 / 身法 / 悟性；悟性影响修炼速度，体魄与灵力决定 HP/MP 上限。
              </p>
            </section>
            <section class="help-section">
              <h4 class="help-h">剧情 · 战斗 · 存档</h4>
              <ul class="help-list">
                <li>对话框自由输入推进剧情，每回合由 AI 生成故事与状态；底部有「激进 / 中庸 / 谨慎 / 最谨慎」四档快捷行动建议。</li>
                <li>战斗由剧情触发，采用回合制 + 行动条，含暴击、闪避、护盾、反伤等机制。</li>
                <li>每回合自动存档到本机浏览器，刷新页面可续玩；也可在标题界面用「读取人生」加载历史存档。</li>
              </ul>
            </section>
          </div>
        </div>
      </Transition>
    </div>
  </Transition>
</template>
