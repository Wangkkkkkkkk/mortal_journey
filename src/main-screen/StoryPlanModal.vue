<script setup lang="ts">
import { watch, onMounted, onUnmounted } from "vue";
import { plotPlanStore } from "../role_core/plotPlanStore";
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
          <div class="side-modal side-modal--plan" role="dialog" aria-modal="true" @click.stop>
            <div class="side-modal__header">
              <h4 class="side-modal__title">剧情规划</h4>
              <button type="button" class="side-modal__close" aria-label="关闭" @click="onCloseClick">
                ×
              </button>
            </div>
            <div class="side-modal__body plan-panel">
              <section class="plan-block">
                <h5 class="plan-block__title">当前章目标</h5>
                <template v-if="plotPlanStore.规划树.value.当前章目标.length">
                  <ul class="plan-ul">
                    <li v-for="(g, i) in plotPlanStore.规划树.value.当前章目标" :key="i">{{ g }}</li>
                  </ul>
                </template>
                <div v-else class="plan-empty">暂无目标</div>
              </section>

              <section class="plan-block">
                <h5 class="plan-block__title">
                  当前章任务
                  <span v-if="plotPlanStore.规划树.value.当前章任务.length" class="plan-block__count">
                    {{ plotPlanStore.规划树.value.当前章任务.length }}
                  </span>
                </h5>
                <template v-if="plotPlanStore.规划树.value.当前章任务.length">
                  <div v-for="t in plotPlanStore.规划树.value.当前章任务" :key="t.id" class="plan-card">
                    <div class="plan-card__head">
                      <span class="plan-card__title">{{ t.标题 }}</span>
                      <span class="plan-card__status" :class="`plan-card__status--${t.当前状态}`">{{ t.当前状态 || "未触发" }}</span>
                    </div>
                    <div v-if="t.任务说明" class="plan-card__desc">{{ t.任务说明 }}</div>
                    <div v-if="t.计划执行时间" class="plan-card__meta">计划：{{ t.计划执行时间 }}</div>
                    <div v-if="t.完成判定.length" class="plan-card__meta">完成判定：{{ t.完成判定.join("；") }}</div>
                  </div>
                </template>
                <div v-else class="plan-empty">暂无任务</div>
              </section>

              <section class="plan-block">
                <h5 class="plan-block__title">
                  待触发事件
                  <span v-if="plotPlanStore.规划树.value.待触发事件.length" class="plan-block__count">
                    {{ plotPlanStore.规划树.value.待触发事件.length }}
                  </span>
                </h5>
                <template v-if="plotPlanStore.规划树.value.待触发事件.length">
                  <div v-for="e in plotPlanStore.规划树.value.待触发事件" :key="e.id" class="plan-card">
                    <div class="plan-card__head">
                      <span class="plan-card__title">{{ e.事件名 }}</span>
                      <span class="plan-card__status" :class="`plan-card__status--${e.当前状态}`">{{ e.当前状态 || "待触发" }}</span>
                    </div>
                    <div v-if="e.事件说明" class="plan-card__desc">{{ e.事件说明 }}</div>
                    <div class="plan-card__meta">
                      <span v-if="e.最早触发时间">最早 {{ e.最早触发时间 }}</span>
                      <span v-if="e.最晚触发时间">｜最晚 {{ e.最晚触发时间 }}</span>
                    </div>
                    <div v-if="e.前置条件.length" class="plan-card__meta">前置：{{ e.前置条件.join("；") }}</div>
                  </div>
                </template>
                <div v-else class="plan-empty">暂无待触发事件</div>
              </section>

              <section class="plan-block">
                <h5 class="plan-block__title">
                  镜头规划
                  <span v-if="plotPlanStore.规划树.value.镜头规划.length" class="plan-block__count">
                    {{ plotPlanStore.规划树.value.镜头规划.length }}
                  </span>
                </h5>
                <template v-if="plotPlanStore.规划树.value.镜头规划.length">
                  <div v-for="c in plotPlanStore.规划树.value.镜头规划" :key="c.id" class="plan-card">
                    <div class="plan-card__head">
                      <span class="plan-card__title">{{ c.镜头标题 }}</span>
                      <span class="plan-card__status" :class="`plan-card__status--${c.当前状态}`">{{ c.当前状态 || "未触发" }}</span>
                    </div>
                    <div v-if="c.镜头内容" class="plan-card__desc">{{ c.镜头内容 }}</div>
                    <div v-if="c.触发时间" class="plan-card__meta">触发：{{ c.触发时间 }}</div>
                  </div>
                </template>
                <div v-else class="plan-empty">暂无镜头</div>
              </section>

              <section class="plan-block">
                <h5 class="plan-block__title">
                  跨章延续事项
                  <span v-if="plotPlanStore.规划树.value.跨章延续事项.length" class="plan-block__count">
                    {{ plotPlanStore.规划树.value.跨章延续事项.length }}
                  </span>
                </h5>
                <template v-if="plotPlanStore.规划树.value.跨章延续事项.length">
                  <div v-for="l in plotPlanStore.规划树.value.跨章延续事项" :key="l.id" class="plan-card">
                    <div class="plan-card__head">
                      <span class="plan-card__title">{{ l.标题 }}</span>
                      <span v-if="l.延续到何时" class="plan-card__meta">至 {{ l.延续到何时 }}</span>
                    </div>
                    <div v-if="l.延续原因.length" class="plan-card__desc">{{ l.延续原因.join("；") }}</div>
                  </div>
                </template>
                <div v-else class="plan-empty">暂无延续事项</div>
              </section>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>
