/**
 * 世界演变引擎（worldEvolution）升级后的 AI 输出类型。
 *
 * 后台世界按时间/条件门槛持续运转，输出按池组织的命名数组（结构固定、易解析）：
 * 活跃NPC动作 / 事件生命周期迁移 / 镜头 / 史册 / NPC位置迁移。
 */

import type { WorldLocation } from "../../role_core/types/worldLocation";
import type {
  后台NPC条目,
  世界事件条目,
  世界镜头条目,
  江湖史册条目,
} from "../../role_core/types/worldEvolution";

/** 更新一条已存在后台 NPC 的关键字段（按姓名匹配）。 */
export interface 后台NPC动作 {
  姓名: string;
  当前行动?: string;
  当前状态?: string;
  当前位置?: string;
  行动开始时间?: string;
  行动结束时间?: string;
}

/** 待执行 → 进行中。 */
export interface 事件启动操作 {
  事件名: string;
  当前进展: string;
  开始时间?: string;
}

/** 更新进行中事件的当前进展（单条摘要）。 */
export interface 事件推进操作 {
  事件名: string;
  当前进展: string;
}

/** 进行中 → 已结算（可升格进江湖史册）。 */
export interface 事件结算操作 {
  事件名: string;
  事件结果: string;
  长期影响?: string;
  是否进入史册?: boolean;
}

/** 更新一条世界镜头的可空字段（按镜头标题匹配）。 */
export interface 镜头更新 {
  镜头标题: string;
  镜头内容?: string;
  触发时间?: string;
  触发条件?: string[];
  关联人物?: string[];
  关联地点?: string[];
  沉淀内容?: string[];
  当前状态?: string;
}

/** 世界演变一次调用的完整输出（解析后）。 */
export interface 世界演变输出 {
  thinking: string;
  /** 更新已存在后台 NPC（按姓名匹配，不存在则忽略）。 */
  activeNpcActions: 后台NPC动作[];
  /** 新增后台 NPC（push 到活跃NPC列表）。 */
  activeNpcAdds: 后台NPC条目[];
  /** 停止跟踪的后台 NPC（按姓名删除）。 */
  activeNpcRemoves: string[];
  /** 新增待执行事件。 */
  eventPushes: 世界事件条目[];
  /** 待执行 → 进行中。 */
  eventStarts: 事件启动操作[];
  /** 更新进行中事件进展。 */
  eventAdvances: 事件推进操作[];
  /** 进行中 → 已结算（可升格史册）。 */
  eventSettles: 事件结算操作[];
  /** 事件失效（删除）。 */
  eventExpires: string[];
  /** 事件删除。 */
  eventDeletes: string[];
  /** 新增世界镜头。 */
  cameraPushes: 世界镜头条目[];
  /** 更新世界镜头。 */
  cameraUpdates: 镜头更新[];
  /** 删除世界镜头。 */
  cameraDeletes: string[];
  /** 追加到江湖史册。 */
  sagaAdds: 江湖史册条目[];
  /** 镜头外 NPC 位置迁移（沿用原轻量引擎，npcStore.applyNpcMigrations）。 */
  migrations: { npcId: string; toLocation: WorldLocation }[];
}
