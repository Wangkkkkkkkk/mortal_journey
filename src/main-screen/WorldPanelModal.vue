<script setup lang="ts">
import { watch, onMounted, onUnmounted } from "vue";
import { worldEvolutionStore } from "../role_core/worldEvolutionStore";
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
          <div class="side-modal side-modal--world" role="dialog" aria-modal="true" @click.stop>
            <div class="side-modal__header">
              <h4 class="side-modal__title">江湖动态</h4>
              <button type="button" class="side-modal__close" aria-label="关闭" @click="onCloseClick">
                ×
              </button>
            </div>
            <div class="side-modal__body world-panel">
              <section class="world-block">
                <h5 class="world-block__title">
                  后台活跃 NPC
                  <span v-if="worldEvolutionStore.状态.value.活跃NPC列表.length" class="world-block__count">
                    {{ worldEvolutionStore.状态.value.活跃NPC列表.length }}
                  </span>
                </h5>
                <template v-if="worldEvolutionStore.状态.value.活跃NPC列表.length">
                  <div v-for="n in worldEvolutionStore.状态.value.活跃NPC列表" :key="n.姓名" class="world-card">
                    <div class="world-card__head">
                      <span class="world-card__title">{{ n.姓名 }}</span>
                      <span v-if="n.所属势力" class="world-card__tag">{{ n.所属势力 }}</span>
                    </div>
                    <div class="world-card__action">{{ n.当前行动 || "…" }}</div>
                    <div class="world-card__meta">
                      <span v-if="n.当前位置">位置：{{ n.当前位置 }}</span>
                      <span v-if="n.当前状态">｜{{ n.当前状态 }}</span>
                    </div>
                    <div v-if="n.行动开始时间 || n.行动结束时间" class="world-card__meta">
                      <span v-if="n.行动开始时间">开始 {{ n.行动开始时间 }}</span>
                      <span v-if="n.行动结束时间">｜结束 {{ n.行动结束时间 }}</span>
                    </div>
                  </div>
                </template>
                <div v-else class="world-empty">镜头外暂无活跃 NPC</div>
              </section>

              <section class="world-block">
                <h5 class="world-block__title">
                  进行中事件
                  <span v-if="worldEvolutionStore.状态.value.进行中事件.length" class="world-block__count">
                    {{ worldEvolutionStore.状态.value.进行中事件.length }}
                  </span>
                </h5>
                <template v-if="worldEvolutionStore.状态.value.进行中事件.length">
                  <div v-for="e in worldEvolutionStore.状态.value.进行中事件" :key="e.id" class="world-card">
                    <div class="world-card__head">
                      <span class="world-card__title">{{ e.事件名 }}</span>
                      <span class="world-card__tag world-card__tag--go">进行中</span>
                    </div>
                    <div v-if="e.当前进展" class="world-card__action">{{ e.当前进展 }}</div>
                    <div v-if="e.最晚触发时间" class="world-card__meta">最晚：{{ e.最晚触发时间 }}</div>
                  </div>
                </template>
                <div v-else class="world-empty">暂无进行中事件</div>
              </section>

              <section class="world-block">
                <h5 class="world-block__title">
                  待执行事件
                  <span v-if="worldEvolutionStore.状态.value.待执行事件.length" class="world-block__count">
                    {{ worldEvolutionStore.状态.value.待执行事件.length }}
                  </span>
                </h5>
                <template v-if="worldEvolutionStore.状态.value.待执行事件.length">
                  <div v-for="e in worldEvolutionStore.状态.value.待执行事件" :key="e.id" class="world-card">
                    <div class="world-card__head">
                      <span class="world-card__title">{{ e.事件名 }}</span>
                      <span class="world-card__tag world-card__tag--wait">待执行</span>
                    </div>
                    <div v-if="e.事件说明" class="world-card__action">{{ e.事件说明 }}</div>
                    <div class="world-card__meta">
                      <span v-if="e.最早触发时间">最早 {{ e.最早触发时间 }}</span>
                      <span v-if="e.最晚触发时间">｜最晚 {{ e.最晚触发时间 }}</span>
                    </div>
                  </div>
                </template>
                <div v-else class="world-empty">暂无待执行事件</div>
              </section>

              <section class="world-block">
                <h5 class="world-block__title">
                  已结算事件
                  <span v-if="worldEvolutionStore.状态.value.已结算事件.length" class="world-block__count">
                    {{ worldEvolutionStore.状态.value.已结算事件.length }}
                  </span>
                </h5>
                <template v-if="worldEvolutionStore.状态.value.已结算事件.length">
                  <div v-for="e in worldEvolutionStore.状态.value.已结算事件" :key="e.id" class="world-card">
                    <div class="world-card__head">
                      <span class="world-card__title">{{ e.事件名 }}</span>
                      <span class="world-card__tag world-card__tag--done">已结算</span>
                    </div>
                    <div v-if="e.事件结果" class="world-card__action">{{ e.事件结果 }}</div>
                  </div>
                </template>
                <div v-else class="world-empty">暂无已结算事件</div>
              </section>

              <section class="world-block">
                <h5 class="world-block__title">
                  世界镜头
                  <span v-if="worldEvolutionStore.状态.value.世界镜头规划.length" class="world-block__count">
                    {{ worldEvolutionStore.状态.value.世界镜头规划.length }}
                  </span>
                </h5>
                <template v-if="worldEvolutionStore.状态.value.世界镜头规划.length">
                  <div v-for="c in worldEvolutionStore.状态.value.世界镜头规划" :key="c.镜头标题" class="world-card">
                    <div class="world-card__head">
                      <span class="world-card__title">{{ c.镜头标题 }}</span>
                      <span v-if="c.当前状态" class="world-card__tag">{{ c.当前状态 }}</span>
                    </div>
                    <div v-if="c.镜头内容" class="world-card__action">{{ c.镜头内容 }}</div>
                  </div>
                </template>
                <div v-else class="world-empty">暂无世界镜头</div>
              </section>

              <section class="world-block">
                <h5 class="world-block__title">
                  江湖史册
                  <span v-if="worldEvolutionStore.状态.value.江湖史册.length" class="world-block__count">
                    {{ worldEvolutionStore.状态.value.江湖史册.length }}
                  </span>
                </h5>
                <template v-if="worldEvolutionStore.状态.value.江湖史册.length">
                  <div v-for="g in worldEvolutionStore.状态.value.江湖史册" :key="g.标题" class="world-card">
                    <div class="world-card__head">
                      <span class="world-card__title">{{ g.标题 }}</span>
                      <span v-if="g.记录时间" class="world-card__tag">{{ g.记录时间 }}</span>
                    </div>
                    <div v-if="g.内容" class="world-card__action">{{ g.内容 }}</div>
                  </div>
                </template>
                <div v-else class="world-empty">史册暂无记载</div>
              </section>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>
