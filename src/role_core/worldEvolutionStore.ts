/**
 * 世界演变状态单例：后台世界（镜头外）的持续运转容器。
 * 活跃NPC列表 / 待执行事件 / 进行中事件 / 已结算事件 / 世界镜头规划 / 江湖史册。
 *
 * 对应 MoRanJiangHu 的 `世界.*` 动态引擎；由升级后的 worldEvolution pipeline
 * 输出 {@link 世界演变输出}，经 {@link 应用演变输出} 落库（含生命周期迁移与条数 clamp）。
 * 序列化随存档一并写入（见 gameSave.ts）。
 */

import { ref } from "vue";
import {
  创建空世界演变状态,
  活跃NPC峰值条数,
  进行中事件峰值条数,
  已结算事件峰值条数,
  type 世界演变状态,
  type 后台NPC条目,
  type 世界事件条目,
} from "./types/worldEvolution";
import type { 世界演变输出 } from "../ai_core/types/worldEvolutionOps";
import { gameLog } from "../log/gameLog";

/** 可序列化的世界演变载荷（存档分量）。 */
export interface WorldEvolutionSerialData {
  状态: 世界演变状态;
}

const 待执行事件峰值条数 = 12;

const 状态 = ref<世界演变状态>(创建空世界演变状态());

export function useWorldEvolutionStore() {
  /** 应用一次世界演变输出（含生命周期迁移、去重、条数 clamp）。 */
  function 应用演变输出(output: 世界演变输出, options?: { 当前时间?: string }): void {
    const s = 状态.value;
    const 当前时间 = String(options?.当前时间 || "").trim();
    const now = 当前时间 || "";

    // ── 1. 活跃 NPC：更新 / 新增 / 删除 ──
    for (const a of output.activeNpcActions) {
      const item = s.活跃NPC列表.find((x) => x.姓名 === a.姓名);
      if (!item) continue;
      if (a.当前行动) item.当前行动 = a.当前行动;
      if (a.当前状态) item.当前状态 = a.当前状态;
      if (a.当前位置) item.当前位置 = a.当前位置;
      if (a.行动开始时间) item.行动开始时间 = a.行动开始时间;
      if (a.行动结束时间) item.行动结束时间 = a.行动结束时间;
    }
    for (const n of output.activeNpcAdds) {
      if (!n || !String(n.姓名 || "").trim() || n.姓名 === "主角") continue;
      if (!s.活跃NPC列表.some((x) => x.姓名 === n.姓名)) {
        s.活跃NPC列表.push(n);
      }
    }
    for (const name of output.activeNpcRemoves) {
      const i = s.活跃NPC列表.findIndex((x) => x.姓名 === name);
      if (i >= 0) s.活跃NPC列表.splice(i, 1);
    }

    // ── 2. 事件池：push / 启动 / 推进 / 结算 / 失效 / 删除 ──
    for (const e of output.eventPushes) {
      if (!e || !String(e.事件名 || "").trim()) continue;
      const 已存在 =
        s.待执行事件.some((x) => x.事件名 === e.事件名) ||
        s.进行中事件.some((x) => x.事件名 === e.事件名) ||
        s.已结算事件.some((x) => x.事件名 === e.事件名);
      if (!已存在) {
        e.当前状态 = e.当前状态 || "待触发";
        s.待执行事件.push(e);
      }
    }
    for (const st of output.eventStarts) {
      const i = s.待执行事件.findIndex((x) => x.事件名 === st.事件名);
      if (i < 0) continue;
      const ev = s.待执行事件.splice(i, 1)[0];
      ev.当前进展 = String(st.当前进展 || ev.当前进展 || "").trim();
      ev.当前状态 = "进行中";
      if (st.开始时间) ev.最早触发时间 = st.开始时间;
      else if (now) ev.最早触发时间 = now;
      s.进行中事件.push(ev);
    }
    for (const adv of output.eventAdvances) {
      const item = s.进行中事件.find((x) => x.事件名 === adv.事件名);
      if (item && String(adv.当前进展 || "").trim()) item.当前进展 = adv.当前进展;
    }
    for (const se of output.eventSettles) {
      const i = s.进行中事件.findIndex((x) => x.事件名 === se.事件名);
      if (i < 0) continue;
      const ev = s.进行中事件.splice(i, 1)[0];
      ev.事件结果 = String(se.事件结果 || ev.事件结果 || "").trim();
      if (se.长期影响) ev.长期影响 = se.长期影响;
      ev.当前状态 = "已结算";
      s.已结算事件.push(ev);
      if (se.是否进入史册 === true && ev.长期影响) {
        if (!s.江湖史册.some((x) => x.标题 === ev.事件名)) {
          s.江湖史册.push({ 标题: ev.事件名, 内容: ev.事件结果, 记录时间: now });
        }
      }
    }
    const 从事件池删除 = (name: string): void => {
      const find = (池: 世界事件条目[]): number => 池.findIndex((x) => x.事件名 === name);
      for (const 池 of [s.待执行事件, s.进行中事件, s.已结算事件]) {
        const i = find(池);
        if (i >= 0) {
          池.splice(i, 1);
          return;
        }
      }
    };
    for (const name of output.eventExpires) 从事件池删除(name);
    for (const name of output.eventDeletes) 从事件池删除(name);

    // ── 3. 世界镜头：push / 更新 / 删除 ──
    for (const c of output.cameraPushes) {
      if (!c || !String(c.镜头标题 || "").trim()) continue;
      if (!s.世界镜头规划.some((x) => x.镜头标题 === c.镜头标题)) s.世界镜头规划.push(c);
    }
    for (const cu of output.cameraUpdates) {
      const item = s.世界镜头规划.find((x) => x.镜头标题 === cu.镜头标题);
      if (!item) continue;
      if (cu.镜头内容) item.镜头内容 = cu.镜头内容;
      if (cu.触发时间) item.触发时间 = cu.触发时间;
      if (cu.触发条件) item.触发条件 = cu.触发条件;
      if (cu.关联人物) item.关联人物 = cu.关联人物;
      if (cu.关联地点) item.关联地点 = cu.关联地点;
      if (cu.沉淀内容) item.沉淀内容 = cu.沉淀内容;
      if (cu.当前状态) item.当前状态 = cu.当前状态;
    }
    for (const t of output.cameraDeletes) {
      const i = s.世界镜头规划.findIndex((x) => x.镜头标题 === t);
      if (i >= 0) s.世界镜头规划.splice(i, 1);
    }

    // ── 4. 江湖史册 ──
    for (const sg of output.sagaAdds) {
      if (!sg || !String(sg.标题 || "").trim()) continue;
      if (!s.江湖史册.some((x) => x.标题 === sg.标题)) {
        s.江湖史册.push({ ...sg, 记录时间: sg.记录时间 || now });
      }
    }

    // ── 5. 条数 clamp（安全网；AI 已按阈值维护，这里兜底防膨胀）──
    if (s.活跃NPC列表.length > 活跃NPC峰值条数) {
      s.活跃NPC列表.splice(活跃NPC峰值条数);
      gameLog.warn(`[世界演变] 活跃NPC超峰值，已截断至 ${活跃NPC峰值条数} 条`);
    }
    if (s.进行中事件.length > 进行中事件峰值条数) {
      s.进行中事件.splice(进行中事件峰值条数);
      gameLog.warn(`[世界演变] 进行中事件超峰值，已截断至 ${进行中事件峰值条数} 条`);
    }
    if (s.已结算事件.length > 已结算事件峰值条数) {
      s.已结算事件.splice(已结算事件峰值条数);
      gameLog.warn(`[世界演变] 已结算事件超峰值，已截断至 ${已结算事件峰值条数} 条`);
    }
    if (s.待执行事件.length > 待执行事件峰值条数) {
      s.待执行事件.splice(待执行事件峰值条数);
    }
  }

  function serialize(): WorldEvolutionSerialData {
    return { 状态: JSON.parse(JSON.stringify(状态.value)) };
  }

  function restore(data: WorldEvolutionSerialData | null | undefined): void {
    状态.value = data?.状态
      ? JSON.parse(JSON.stringify(data.状态))
      : 创建空世界演变状态();
  }

  function clear(): void {
    状态.value = 创建空世界演变状态();
  }

  return {
    状态,
    应用演变输出,
    serialize,
    restore,
    clear,
  };
}

export const worldEvolutionStore = useWorldEvolutionStore();
