<script setup lang="ts">
import { watch, onMounted, onUnmounted } from "vue";
import { storyStore } from "../role_core/storyStore";
import { useScrollLock } from "../composables/useScrollLock";

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();

const scrollLock = useScrollLock();

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
    if (v) scrollLock.acquire();
    else scrollLock.release();
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
      <div v-if="open" class="side-modal-overlay" role="presentation" aria-hidden="false">
        <div class="side-modal-overlay__backdrop" tabindex="-1" aria-label="关闭" @click="onBackdropClick" />
        <Transition name="mj-modal" appear>
          <div class="side-modal side-modal--chapter" role="dialog" aria-modal="true" @click.stop>
            <div class="side-modal__header">
              <h4 class="side-modal__title">章节卷宗</h4>
              <button type="button" class="side-modal__close" aria-label="关闭" @click="onCloseClick">
                ×
              </button>
            </div>
            <div class="side-modal__body chapter-panel">
              <section class="chapter-block">
                <h5 class="chapter-block__title">当前章节</h5>
                <template v-if="storyStore.章节状态.value.当前章节.标题">
                  <div class="chapter-row">
                    <span class="chapter-row__label">标题</span>
                    <span class="chapter-row__value">{{ storyStore.章节状态.value.当前章节.标题 }}</span>
                    <span class="chapter-badge">{{ storyStore.章节状态.value.当前章节.推进状态 }}</span>
                  </div>
                  <div v-if="storyStore.章节状态.value.当前章节.已完成摘要.length" class="chapter-list">
                    <div class="chapter-list__label">已完成</div>
                    <ul class="chapter-list__ul">
                      <li v-for="(t, i) in storyStore.章节状态.value.当前章节.已完成摘要" :key="i">{{ t }}</li>
                    </ul>
                  </div>
                  <div v-if="storyStore.章节状态.value.当前章节.当前待解问题.length" class="chapter-list">
                    <div class="chapter-list__label">待解问题</div>
                    <ul class="chapter-list__ul">
                      <li v-for="(t, i) in storyStore.章节状态.value.当前章节.当前待解问题" :key="i">{{ t }}</li>
                    </ul>
                  </div>
                  <div v-if="storyStore.章节状态.value.当前章节.切章后沉淀要点.length" class="chapter-list">
                    <div class="chapter-list__label">切章沉淀要点</div>
                    <ul class="chapter-list__ul">
                      <li v-for="(t, i) in storyStore.章节状态.value.当前章节.切章后沉淀要点" :key="i">{{ t }}</li>
                    </ul>
                  </div>
                </template>
                <div v-else class="chapter-empty">尚未初始化章节</div>
              </section>

              <section class="chapter-block">
                <h5 class="chapter-block__title">下一章预告</h5>
                <template v-if="storyStore.章节状态.value.下一章预告.标题">
                  <div class="chapter-row">
                    <span class="chapter-row__label">标题</span>
                    <span class="chapter-row__value">{{ storyStore.章节状态.value.下一章预告.标题 }}</span>
                  </div>
                  <div v-if="storyStore.章节状态.value.下一章预告.大纲.length" class="chapter-list">
                    <div class="chapter-list__label">大纲</div>
                    <ul class="chapter-list__ul">
                      <li v-for="(t, i) in storyStore.章节状态.value.下一章预告.大纲" :key="i">{{ t }}</li>
                    </ul>
                  </div>
                  <div v-if="storyStore.章节状态.value.下一章预告.进入条件.length" class="chapter-list">
                    <div class="chapter-list__label">进入条件</div>
                    <ul class="chapter-list__ul">
                      <li v-for="(t, i) in storyStore.章节状态.value.下一章预告.进入条件" :key="i">{{ t }}</li>
                    </ul>
                  </div>
                  <div v-if="storyStore.章节状态.value.下一章预告.风险提示.length" class="chapter-list">
                    <div class="chapter-list__label">风险提示</div>
                    <ul class="chapter-list__ul">
                      <li v-for="(t, i) in storyStore.章节状态.value.下一章预告.风险提示" :key="i">{{ t }}</li>
                    </ul>
                  </div>
                </template>
                <div v-else class="chapter-empty">暂无预告</div>
              </section>

              <section class="chapter-block">
                <h5 class="chapter-block__title">
                  历史卷宗
                  <span v-if="storyStore.章节状态.value.历史卷宗.length" class="chapter-block__count">
                    {{ storyStore.章节状态.value.历史卷宗.length }}
                  </span>
                </h5>
                <template v-if="storyStore.章节状态.value.历史卷宗.length">
                  <div v-for="(h, i) in storyStore.章节状态.value.历史卷宗" :key="i" class="chapter-archive">
                    <div class="chapter-archive__head">
                      <span class="chapter-archive__title">{{ h.标题 }}</span>
                      <span v-if="h.记录时间" class="chapter-archive__time">{{ h.记录时间 }}</span>
                    </div>
                    <div v-if="h.章节总结.length" class="chapter-list__ul">
                      <li v-for="(t, j) in h.章节总结" :key="j">{{ t }}</li>
                    </div>
                    <div v-if="h.延续事项.length" class="chapter-archive__meta">延续：{{ h.延续事项.join("；") }}</div>
                    <div v-if="h.关系变化.length" class="chapter-archive__meta">关系：{{ h.关系变化.join("；") }}</div>
                    <div v-if="h.势力变化.length" class="chapter-archive__meta">势力：{{ h.势力变化.join("；") }}</div>
                    <div v-if="h.地点变化.length" class="chapter-archive__meta">地点：{{ h.地点变化.join("；") }}</div>
                    <div v-if="h.资源变化.length" class="chapter-archive__meta">资源：{{ h.资源变化.join("；") }}</div>
                  </div>
                </template>
                <div v-else class="chapter-empty">暂无已归档章节</div>
              </section>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>
