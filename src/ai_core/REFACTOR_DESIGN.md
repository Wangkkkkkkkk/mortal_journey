# AI 修仙 RPG — 架构设计文档

> 本文档是 `src/ai/` 及相关模块的完整架构蓝图。文档分为三圈：近期重构（G1–G6）、架构演进（G7–G11）、远期增强（G12–G15）。具体代码实现以本文档为权威来源。

---

## 目录

| 章节 | 内容 |
|---|---|
| [§1 目标与愿景](#1-目标与愿景) | 核心痛点 + 最终架构形态 |
| [§2 当前架构现状](#2-当前架构现状) | 文件清单、调用链、输出契约 |
| [§3 业界参考基准](#3-业界参考基准) | SillyTavern / Generative Agents / AI Town / Voyager / ChoiceScript |
| [§4 核心问题清单](#4-核心问题清单) | 15 个已识别问题 |
| [§5 目标架构总览](#5-目标架构总览) | 最终形态架构图 + 数据流 |
| [§6 重构子目标](#6-重构子目标) | G1–G15 统一编号，分三圈 |
| [§7 实施路线图](#7-实施路线图) | 分阶段执行计划 |
| [§8 关键决策](#8-关键决策) | |
| [§9 风险与缓解](#9-风险与缓解) | |
| [§10 目标目录结构](#10-目标目录结构) | |
| [§11 变更日志](#11-变更日志) | |

---

## 1. 目标与愿景

### 1.1 核心痛点

| # | 痛点 | 表现 |
|---|---|---|
| 1 | **剧情与状态不对齐** | Story AI 写"气血饱满"，State AI 推断 HP=12% |
| 2 | **状态更新不准确** | 灵石与境界不匹配、境界跨越式跃迁、NPC 立绘不稳定、时间推进失真 |
| 3 | **历史稀释 / token 爆炸** | 全量 chatHistory 线性灌入，长局后细节丢失 |
| 4 | **NPC 状态冻结** | NPC 修为永远为 0、功法熟练度永不提升、年龄不随时间增长 |
| 5 | **NPC 关系扁平** | 只有好感度一个维度，无法表达信任/敬畏/恐惧/债务等复合关系 |
| 6 | **叙事无节奏控制** | Story AI 只看当前情境，没有主线/支线/冲突进度，容易无限闲聊 |
| 7 | **世界不运转** | 世界只在玩家行动时推进，NPC 不会自己修炼/突破/死亡，秘境不会自动开启 |

### 1.2 最终架构愿景

```
Narrative Manager ─── Goal Tree / Quest Graph / Story Stage
        │
        ▼
┌─────────────────────────────────────────────┐
│  Layered Context Builder                     │
│  (Stable: world_lore / rules)                │
│  (Semi:   NPC / Quest / Location / Relationship)│
│  (Dynamic: recent chat / current scene)      │
└──────────────────┬──────────────────────────┘
                   │
             Story AI ──→ Intent
                   │
             Rule Engine ──→ State Diff
                   │
      ┌────────────┼────────────┐
      ▼            ▼            ▼
 Protagonist    NPC Store   WorldBook
   State          State      + Knowledge
                   │
            Event Sourcing
            (全局事件流)
                   │
            World Simulation
            (Scheduler + NPC Agent)
```

**核心理念**：LLM 负责叙事，程序负责规则。Story AI 输出 Intent（意图），Rule Engine 计算 State（状态），Event Sourcing 记录变更，World Simulation 驱动世界持续运转。

### 1.3 范围划分

| 圈层 | 阶段 | 目标 | 状态 |
|---|---|---|---|
| **第一圈** | 阶段一~五 | G1–G6 近期重构 | 设计完成，待实施 |
| **第二圈** | 阶段六~十 | G7–G11 架构演进 | 框架设计，待细化 |
| **第三圈** | 阶段十一+ | G12–G15 远期增强 | 方向性规划 |

---

## 2. 当前架构现状

### 2.1 文件清单

`src/ai/` 共 22 个文件，3,869 行：

| 类别 | 文件 |
|---|---|
| 桥接层 | `openAiChatBridge.ts`(351L)、`useApiConfig.ts`(138L) |
| 共享 | `preset.ts`(66L)、`parseAiItem.ts`(188L) |
| 编排 | `useOpeningStory.ts`(229L) |
| 8 条管线 | init_story / init_state / story / **state(661L,上帝文件)** / cultivation_story / finale_story / grand_summary / npc_reevaluation |

### 2.2 调用链

```
新游戏：FateChoice → useOpeningStory → generateInitStory → generateInitState → applyInitState
主回合：StoryChatPanel → generateStory → generateState → applyStateChanges → (可能 Battle)
```

### 2.3 输出契约现状

State AI 一次输出 13 段 XML-like 标签。解析靠 `safeJsonParse` + 正则修补 + 字段级 `typeof` 兜底，失败静默。**单次输出过载**：13 段标签混在一个 prompt，主角状态与 NPC 状态关注点不同、变化频率不同却互相干扰。

### 2.4 NPC 状态管理现状

NPC 有三条更新路径：

| 路径 | 触发 | 更新内容 | 方式 |
|---|---|---|---|
| 每回合合并 `mergeFromAi` | 主回合 | identity / favorability / hp / mp / location | 白名单覆盖 |
| 核心变更事件 `applyCoreChange` | AI 显式声明 | realm_breakthrough / equipment_acquired / lost / damage / death | 精确单点 |
| 重评估 `applyReevaluation` | 地点进入 + 间隔≥1年 | realm / 装备 / 功法 / 储物袋 / 外貌 | **整体替换** |

**主角 vs NPC 差距**：

| 维度 | 主角 | NPC |
|---|---|---|
| 修为 | 完整状态机（积累→上限→可突破） | **永远为 0**，突破是 AI 跳跃式决定 |
| 功法熟练度 | 每回合可增，1-10 层 | 创建时按境界推算，**之后永不变化** |
| 年龄 | 随时间推进 | **从不更新** |
| 突破状态机 | realmComplete + breakthroughStatus | **没有** |
| 灵石 | 有增减 + 修炼消耗 | 有但**从不消耗** |

---

## 3. 业界参考基准

### 3.1 SillyTavern World Info / Lorebook

关键词触发的 lorebook 注入系统。核心机制：Entry（key + content + order + constant）、关键词触发、递归激活、Token Budget、Scan Depth、Insertion Order/Position、Vector Storage（语义检索补充）、Author's Note。

**启发**：全量历史灌入是 token 爆炸的根源。把历史拆解为结构化 entry，按情境关键词触发注入——AI 看到"相关"而非"全部"。

### 3.2 Generative Agents (Park et al., 2023, arXiv:2304.03442)

Memory Stream（带 importance 打分）+ Retrieval（recency×importance×relevance）+ Reflection + Planning。25 个 NPC 自治沙盒。

**启发**：NPC 应有独立记忆、目标、计划。NPC 核心字段稳定应是数据模型层属性而非 prompt 嘱咐。

### 3.3 AI Town (a16z-infra/ai-town)

TypeScript/Convex 实现的 Generative Agents。LLM 只是组件之一，世界模型（事务化数据库）才是架构核心。状态变更是事务化原子操作。

### 3.4 Voyager (Skill Library + Automatic Curriculum)

**Skill Library**：不要每次重新生成相同行为，复用已验证的"技能"（条件→流程→结果→失败处理）。长期运行越来越稳定。

**Automatic Curriculum**：自动生成下一步探索目标（Goal Tree），驱动 agent 持续进步而非无限闲逛。

### 3.5 ChoiceScript / Ink

关键状态由游戏机制层确定性计算，LLM 只负责叙述。显式 story state graph，分支受控。

### 3.6 现代 LLM 应用工程

Function Calling / Structured Output（DeepSeek 原生支持）+ Zod runtime 校验 + 失败抛错。Prompt as Code（结构化模板 + 版本号）。

---

## 4. 核心问题清单

| # | 问题 | 严重度 | 解决目标 |
|---|---|---|---|
| A | 双阶段强耦合：story AI 不知道数值，state AI 不知道 story 推理 | ★★★★★ | G1+G2 |
| B | 无检索机制：全量历史线性灌入 | ★★★★★ | G6 |
| C | NPC 模型复杂：nearbyNpcs 三角色混用 + displayName 错配 | ★★★★ | G4 |
| D | 战斗触发脆：横跨两 prompt 协同 | ★★★ | G4 |
| E | 无 Schema：自由文本 + sanitize 兜底 + 静默失败 | ★★★★ | G3 |
| F | 状态摘要三不一致 | ★★★★ | G1 |
| G | 无 Reflection / 长期叙事管理 | ★★★ | G9 |
| H | 时间靠 LLM 估 | ★★★ | G5+G11 |
| I | 730+ 行自然语言规则 | ★★ | G3 |
| J | 无评估 / fixtures / 可观测性 | ★★ | 每阶段录 fixtures |
| K | NPC 修为/功法/年龄冻结 | ★★★★ | G7 |
| L | NPC 关系只有好感度一个维度 | ★★★★ | G8 |
| M | 叙事无节奏控制，容易无限闲聊 | ★★★★ | G9 |
| N | 世界不运转，NPC 不会自己行动 | ★★★ | G10 |
| O | LLM 直接改数值，规则不透明 | ★★★ | G11 |

---

## 5. 目标架构总览

### 5.1 最终架构图

```
                    ┌─────────────────────┐
                    │  Narrative Manager   │
                    │  (Arc / Stage /      │
                    │   Goal Tree / Quest) │
                    └─────────┬───────────┘
                              │ 注入叙事方向
                    ┌─────────▼───────────┐
                    │ Layered Context      │
                    │ Builder              │
                    │                      │
                    │ Stable:  world_lore  │
                    │          rules       │
                    │ Semi:    NPC / Quest │
                    │          Location    │
                    │          Relationship│
                    │ Dynamic: recent chat │
                    │          current     │
                    └─────────┬───────────┘
                              │
                    ┌─────────▼───────────┐
                    │   Story AI           │
                    │   (输出 Intent)      │
                    └─────────┬───────────┘
                              │ Intent
                    ┌─────────▼───────────┐
                    │   Rule Engine        │
                    │   (Intent → State)   │
                    └─────────┬───────────┘
                              │ State Diff + Events
           ┌──────────────────┼──────────────────┐
           ▼                  ▼                  ▼
  ┌────────────┐    ┌────────────┐    ┌────────────┐
  │Protagonist │    │  NPC Store │    │ WorldBook  │
  │   State    │    │ +Relation  │    │+Knowledge  │
  │            │    │ +Emotion   │    │  Graph     │
  └─────┬──────┘    └─────┬──────┘    └─────┬──────┘
        │                 │                 │
        └─────────────────┼─────────────────┘
                          │
                ┌─────────▼───────────┐
                │  Event Sourcing      │
                │  (全局事件流)         │
                └─────────┬───────────┘
                          │
                ┌─────────▼───────────┐
                │  World Simulation    │
                │  (Scheduler +        │
                │   NPC Agent +        │
                │   Skill Library)     │
                └─────────────────────┘
```

### 5.2 数据流

```
玩家输入
  │
  ├─→ Narrative Manager 判断当前叙事阶段，注入方向性提示
  │
  ├─→ Layered Context Builder 按 Stable/Semi/Dynamic 三层组装 prompt
  │     ├─ Stable:  world_lore entries + 规则（constant，始终注入）
  │     ├─ Semi:    NPC/Quest/Location entries（关键词触发 + 在场常驻）
  │     └─ Dynamic: 最近 N 轮对话 + 当前场景快照
  │
  ├─→ Story AI 生成剧情正文 + 输出 Intent（行动意图）
  │
  ├─→ Rule Engine 按 Intent 查表计算 State Diff
  │     ├─ 修为增量、时间消耗、灵石消耗 → 系统算
  │     ├─ 突破判定 → 系统查条件
  │     ├─ NPC 关系/情绪变化 → AI 声明，系统校验范围
  │     └─ 装备/物品变化 → AI 声明，系统校验合法性
  │
  ├─→ Event Sourcing 记录所有变更为事件流
  │
  ├─→ State Update 应用到 Protagonist / NPC / WorldBook
  │
  └─→ World Simulation 在时间推进时触发世界事件
        ├─ NPC 后台修炼/突破/衰老/死亡
        ├─ 定时事件（宗门大比/秘境开启/拍卖会）
        └─ Skill Library 复用已验证的行为模板
```

### 5.3 Intent 驱动模式（G11 核心思想）

当前：State AI 直接输出数值（hpPercent=72, xiuweiIncrease=150）

目标：Story AI 输出 Intent，Rule Engine 算数值

```
Story AI 输出:
  intent: { type: "battle", target: "墨牙狼", allies: [...] }
  intent: { type: "cultivate", gongfa: "紫阳混元功", duration: "3个月" }
  intent: { type: "trade", action: "buy", item: "回春丹", count: 3 }

Rule Engine 计算:
  battle   → 查战斗引擎，结果由战斗系统决定
  cultivate→ 查表: 3个月 × 境界速度 × 灵根系数 = 修为增量; 灵石消耗 = 3月 × 消耗率
  trade    → 查物品价格表, 扣灵石, 加物品
```

LLM 负责叙事，程序负责规则。

---

## 6. 重构子目标

### 第一圈：近期重构（G1–G6）

| # | 子目标 | 解决问题 | 阶段 |
|---|---|---|---|
| **G1** | 共享主角状态契约（canonical brief） | F、A | 一 |
| **G2** | State AI 消费 Story AI 的完整 `<thinking>` | A | 一 |
| **G6** | SillyTavern 风格世界书 + 分层上下文，取代全量灌入 | B | 二 |
| **G3** | 拆分 state 为 protagonistState + npcState 并行 pipeline + function calling + Zod | E、I、过载 | 三 |
| **G4** | NPC 状态从 nearby+补丁迁到事件流 | C、D | 四 |
| **G5** | 行动类型查表驱动时间/资源消耗 | H | 五 |

### 第二圈：架构演进（G7–G11）

| # | 子目标 | 解决问题 | 阶段 |
|---|---|---|---|
| **G7** | NPC 自主状态演进（修为积累/功法提升/年龄增长/灵石消耗/寿终） | K | 六 |
| **G8** | NPC 关系与情绪系统（多维度关系 + 短期情绪） | L | 七 |
| **G9** | 叙事管理器（Arc/Stage/Goal Tree/Quest Graph） | M、G | 八 |
| **G10** | 世界模拟（Event Scheduler + NPC Agent 后台行动） | N | 九 |
| **G11** | 意图驱动 + 规则引擎（Story AI 输出 Intent，Rule Engine 算 State） | H、O | 十 |

### 第三圈：远期增强（G12–G15）

| # | 子目标 | 解决问题 | 阶段 |
|---|---|---|---|
| **G12** | 技能库（Skill Library，复用已验证行为模板） | 生成一致性 | 十一+ |
| **G13** | 全局事件溯源（Event Sourcing，状态全部来自 Replay） | 回滚/Debug/存档 | 十一+ |
| **G14** | 知识图谱（Knowledge Graph，实体关系网络） | 检索效率 | 十一+ |
| **G15** | NPC Agent 化（Goal/Plan/Memory/Schedule 完整自治） | NPC 自治 | 十一+ |

### 依赖关系

```
第一圈（G1-G6 近期重构）:
  G1 ─┐
      ├─► G6（主角 brief 是世界书常驻 entry）
  G2 ─┘
  G6 ─► G3（世界书注入需要结构化输出配合）
  G3 ─► G4（事件流需要 schema 校验）
  G3 ─► G5（时间查表需要 schema）

第二圈（G7-G11 架构演进）:
  G4 ─► G7（事件流是 NPC 演进的载体）
  G7 ─► G8（NPC 状态完善后才有关系系统）
  G6 ─► G9（世界书是叙事管理器的数据源）
  G7+G9 ─► G10（世界模拟需要 NPC 演进 + 叙事方向）
  G5+G3 ─► G11（查表是规则引擎的雏形，结构化输出是 Intent 的载体）

第三圈（G12-G15 远期）:
  G11 ─► G12（规则引擎稳定后才能提取 Skill）
  G4+G7 ─► G13（事件流 + NPC 演进是 Event Sourcing 的基础）
  G6+G8 ─► G14（世界书 + 关系系统是知识图谱的数据源）
  G7+G8+G10 ─► G15（NPC 演进 + 关系 + 世界模拟 = NPC Agent 化）
```

---

## 7. 实施路线图

### 第一圈：近期重构

#### 阶段一：信息对齐（G1 + G2）

**G1**：新建 `shared/protagonistBrief.ts`，唯一序列化器 `buildProtagonistBrief(p, ctx, opts)`。消灭 3 份重复的 format 函数。story AI 改 `revealNumbers: true`（让剧情 AI 知道 HP=12）。preset 加"数值禁显规则"。

**G2**：`StoryParsed` 加 `reasoningTrace`（从 `<thinking>` 抽取）；`StateGenerateInput` 加 `reasoningTrace`；`buildStateUserContent` 注入推理链 + `truncateReasoning(2000)`。

**影响**：story_generate / state_generate / cultivation_story_generate / finale_story_generate / story_preset / StoryChatPanel

#### 阶段二：世界书 + 分层上下文（G6）★

**设计思路**：把游戏状态与历史拆解为结构化 WorldBookEntry，按关键词触发注入。形成三层上下文：Stable（world_lore / rules，常驻）、Semi（NPC / Quest / Location，关键词触发）、Dynamic（recent chat / current scene，最近 N 轮）。

**Entry 数据模型**：

| 字段 | 说明 |
|---|---|
| `id` / `category` / `keys` / `content` | 基础字段 |
| `constant` | 是否常驻（Stable 层 + 在场 NPC） |
| `order` | 注入优先级 |
| `enabled` | 归档时设 false 但保留 |
| `lastActivated` / `activationCount` | recency 衰减 + 动态重要性 |
| `source` | system / ai_generated / manual |
| `ttl` | 生命周期：snapshot → summary → archive |

**Entry 分类**：

| category | 层 | 触发 | 示例 |
|---|---|---|---|
| `protagonist` | Stable | 常驻 | 主角 brief |
| `world_lore` | Stable | 常驻 | 境界体系/灵石经济/称呼规则 |
| `grand_summary` | Stable | 常驻 | 剧情总纲 |
| `npc` | Semi | 关键词/在场常驻 | 每个 NPC 一条 |
| `location` | Semi | 关键词 | 地点描述/势力/特产 |
| `quest` | Semi | 关键词 | 任务/伏笔/承诺 |
| `relationship` | Semi | 关键词 | 重要关系里程碑 |
| `snapshot` | Dynamic | 关键词 + recency 衰减 | 每回合快照 |

**注入流程**：收集扫描文本 → 匹配 keys → 常驻激活 → 递归激活（≤2 层）→ 按 order + recency 排序 → Token Budget 裁剪 → 按 Stable/Semi/Dynamic 分层拼接 → 注入 system prompt。

**Keyword 优化**：程序从结构化数据生成 keys（NPC: displayName + 外号 + 身份；地点: 名称 + 别名），AI 仅补充事件性关键词，避免垃圾 key。

**生命周期管理**：snapshot 按 recency 自动衰减 → 超过阈值压缩为 summary → 已完成任务/已解决伏笔 archive（`enabled=false` 但保留）。

**维护机制**：entry 的 `content` 由前端模板化生成（从 NPC/地点/物品数据拼装），AI 只输出"声明"（新增/更新/归档），避免偏离实际状态。每回合 storySnapshot 自动建为 snapshot entry。

**影响**：新建 worldBookStore / worldBookInject / worldBookBuild；4 个 pipeline 改用 `injectWorldBook`；storyStore 移除全量灌入；gameSave 加序列化。

#### 阶段三：状态拆分 + 结构化输出（G3）

**拆分设计**：

| pipeline | 职责 | 输出字段 | 变化频率 |
|---|---|---|---|
| protagonistState | 主角数值/物品/时间/突破/快照/行动建议 | worldLocation / hpMp / cultivation / timeAdvance / breakthrough / spiritStone / itemAdds / itemRemoves / storySnapshot / actionOptions / worldbookUpdates | 每回合都变 |
| npcState | NPC 事件流/战斗触发 | npcEvents / battleTrigger | 多数回合不变 |

共享输入（storyBody + reasoningTrace + 世界书注入），`Promise.all` 并行调用，先主角后 NPC 应用。battleTrigger 归 npcState（战斗是 NPC 交互产物，应用时能拿到主角最新状态）。

**结构化输出**：引入 zod。两套 schema（ProtagonistStateDiffSchema + NpcStateDiffSchema）+ 两个 tool。`useApiConfig` 加 `outputMode: "tool" | "xml-tags"` 开关。tool 模式砍掉 preset 的"输出格式/示例"段（schema 自描述），prompt 持续瘦身。

**影响**：state_generate 拆为 protagonistState + npcState；state_preset 拆为两份；openAiChatBridge 扩展 tool calling；StoryChatPanel 改 Promise.all。

#### 阶段四：NPC 事件流（G4）

新建 `NpcEvent` 联合类型（npc_appeared / npc_present / npc_left / npc_breakthrough / npc_equipment_acquired / npc_equipment_lost / npc_damaged / npc_died）。所有事件除 npc_appeared 外用 npcId 定位。核心字段稳定变成数据模型天然属性（event kind 决定能改什么）。BattleTriggerEntry 加 npcId。存档 `_V1→_V2` 迁移。

#### 阶段五：行动类型查表（G5）

新建 `actionTimeline.ts`，行动类型 → 基础时间 delta 查表 + 境界倍率。story AI 在正文末尾输出 `[ACTION:类型]`。protagonistState 查表得 baseTime + LLM 输出 modifier。

---

### 第二圈：架构演进

#### 阶段六：NPC 自主状态演进（G7）

**核心问题**：NPC 修为永远为 0、功法熟练度永不提升、年龄不增长、灵石不消耗。

**方案：系统驱动的后台模拟**

给 NPC 补齐主角已有的状态机：

| 机制 | 主角已有 | NPC 需补 | 实现方式 |
|---|---|---|---|
| 修为积累 | `addXiuwei()` → 上限 → `realmComplete` | 加 `npc.addXiuwei()` + `realmComplete` + `breakthroughStatus` | 复用 `realmUtils` |
| 功法熟练度 | `applyGongfaMasteryExpChanges()` | 加 `npc.applyGongfaMasteryExp()` | 复用 `addGongfaMasteryExp()` |
| 年龄增长 | 随时间推进 | 加 `npc.advanceAge(years)` | 时间差 × 1 |
| 寿终判定 | 突破时查表 | 加 `npc.checkLifespan()` → age > shouyuan → 死亡 | 系统判定 + AI 叙事 |
| 灵石消耗 | 修炼时扣 | 后台模拟时按消耗率扣 | 查表 |
| 突破状态机 | idle/ready/in_quest | 加同款状态机 | 复用主角逻辑 |

**触发时机**：重评估时（地点进入 + 间隔≥N 年）。系统按时间差计算：
1. 年龄 += 间隔年数
2. 若 age > shouyuan → 坐化死亡（系统判定，AI 下一回合叙事交代）
3. 修为 += 间隔 × 修炼速度（境界 × 灵根 × 灵石系数）
4. 功法熟练度 += 间隔 × 修炼速度
5. 灵石 -= 间隔 × 消耗率
6. 若修为到上限 → realmComplete=true
7. 突破判定：realmComplete + 机缘概率 → 突破
8. AI 只负责：为新突破的 NPC 生成新装备/新功法/外貌变化（叙事性输出）

**重评估从"整体替换"改为"增量应用"**：系统算数值增量，AI 补叙事。装备/功法从"全换"改为"追加/移除"。

**影响**：Npc.ts 加状态机方法；npcStore 加 `simulateNpcEvolution(npc, yearsElapsed)`；npc_reevaluation 改为增量模式。

#### 阶段七：NPC 关系与情绪系统（G8）

**当前问题**：只有 `favorability` 一个维度，无法表达"信任但不尊重"或"恐惧但服从"。

**Relationship Store（长期状态）**：

| 维度 | 范围 | 含义 |
|---|---|---|
| `trust` | 0-100 | 信任（愿不愿意托付后背） |
| `respect` | 0-100 | 尊敬（认可对方实力/地位） |
| `favor` | 0-100 | 恩情（欠过的人情债） |
| `fear` | 0-100 | 恐惧（害怕对方报复/实力压制） |
| `hostility` | 0-100 | 敌意（主动敌对倾向） |
| `debt` | 0-N | 债务（灵石/物品/承诺欠账） |

每个 NPC 对主角维护一组关系维度。保留 `favorability` 作为兼容/总览字段（由其他维度加权派生）。

**Emotion Store（短期状态）**：

| 情绪 | 持续 | 影响 |
|---|---|---|
| `happy` / `angry` / `fear` / `excited` / `embarrassed` / `neutral` | 1-3 回合 | 影响当回合 NPC 行为倾向 |

情绪每回合可变，由 npcState AI 输出；关系为长期积累，需重大事件才变。

**更新方式**：npcState AI 输出 `relationshipChanges`（增量）和 `emotion`（当前状态）。Rule Engine 校验范围（如 trust 单次增量 ≤ 20，防跳变）。

**影响**：新建 `relationshipStore.ts` + `emotionStore.ts`（或合入 Npc 字段）；npcStateSchema 加字段；npcStatePreset 加关系/情绪规则。

#### 阶段八：叙事管理器（G9）

**当前问题**：Story AI 只看当前情境，没有主线/支线/冲突进度，容易无限闲聊或无限修炼。

**Narrative Manager 维护**：

| 字段 | 说明 | 示例 |
|---|---|---|
| `currentArc` | 当前篇章 | "宗门篇" / "散修篇" / "秘境篇" |
| `storyStage` | 篇章内阶段 | "入门" / "成长" / "冲突" / "高潮" / "收束" |
| `mainQuest` | 主线任务 | "突破筑基" |
| `sideQuests` | 支线任务列表 | ["寻找灵药", "帮师兄办事"] |
| `conflictLevel` | 当前冲突强度 0-100 | 25（低）/ 75（高） |
| `foreshadowCount` | 未回收伏笔数 | 3 |
| `paceGuidance` | 节奏建议 | "推进主线" / "放缓节奏" / "制造冲突" |

**Narrative Goal Tree**：

```
加入内门（主线）
  ├─ 获得资格
  │   ├─ 通过外门考核 ✓
  │   └─ 获得师叔推荐 ✓
  ├─ 通过试炼
  │   └─ 准备丹药 ← 进行中
  └─ 拜师成功
      └─ 未开始
```

Goal Tree 由 Narrative Manager 维护，Story AI 每回合可推进/阻塞/新增目标。Story AI prompt 中注入"当前应推进的目标"，防止无限闲聊。

**Quest Graph**：任务间有依赖关系（获得灵药 → 进入秘境 → 获得资格 → 打败守卫），DAG 结构，Story AI 按拓扑序推进。

**更新方式**：Narrative Manager 是独立 store（`narrativeStore.ts`），由 protagonistState AI 或独立的 narrative pipeline 输出更新。Story AI 的 Layered Context 中注入"叙事方向"段落。

**影响**：新建 `narrativeStore.ts` + Goal Tree / Quest Graph 数据结构；story_preset 加"叙事方向"注入；protagonistStateSchema 或独立 pipeline 加 narrative 更新字段。

#### 阶段九：世界模拟（G10）

**当前问题**：世界只在玩家行动时推进。主角离开 10 年回来，NPC 都"冻结"了，秘境不会自动开启，宗门大比不会自动举办。

**Event Scheduler**：

定时事件在世界时间推进时检查触发：

| 事件类型 | 触发条件 | 示例 |
|---|---|---|
| `scheduled` | 固定世界时间 | 宗门大比（每 5 年）、拍卖会（每半年） |
| `conditional` | 状态满足 | NPC 修为到上限 → 可突破；NPC age > shouyuan → 寿终 |
| `random` | 概率 | 妖兽袭扰、灵药成熟、路人结缘 |

```
Time Advance
  ↓
Scheduler 检查所有定时事件
  ↓
触发的世界事件 → 注入 Story AI prompt（"近期发生了…"）
  ↓
Story AI 叙事性描述世界事件
```

**World Simulation**：

主角离开期间的世界后台模拟：

1. NPC 后台修炼（G7 的 simulateNpcEvolution）
2. NPC 突破/衰老/死亡（G7）
3. 定时事件触发（Scheduler）
4. 势力格局变化（可选，AI 批量推演）

**NPC Agent 化基础**：

重要 NPC（高好感 / boss 级 / 主线相关）拥有：
- `goal`：当前目标（"突破筑基" / "寻找仇人" / "保护主角"）
- `plan`：近期计划（简化版，非完整 Generative Agents）
- `schedule`：日程（修炼/探索/休息）

NPC 的 goal/plan 影响其在剧情中的行为倾向，注入 Story AI prompt。

**影响**：新建 `eventScheduler.ts` + `worldSimulation.ts`；Npc 加 goal/plan 字段；storyStore 加世界事件队列；story_preset 加"世界事件"注入段。

#### 阶段十：意图驱动 + 规则引擎（G11）

**当前问题**：State AI 直接输出数值（hpPercent=72, xiuweiIncrease=150），LLM 算数值不可靠。时间/修为/灵石应该由程序算。

**Story Intent**：

Story AI 输出 Intent（行动意图），不直接输出数值：

```
intent: {
  type: "cultivate",
  gongfa: "紫阳混元功",
  duration: { years: 3 },
  useSpiritStones: true
}

intent: {
  type: "trade",
  action: "buy",
  item: "回春丹",
  count: 3,
  expectedPrice: 10
}

intent: {
  type: "battle",
  target: "墨牙狼",
  allies: ["韩立"]
}
```

**Rule Engine**：

按 Intent 类型查表计算 State Diff：

| Intent 类型 | Rule Engine 计算 | AI 只负责 |
|---|---|---|
| `cultivate` | 修为增量 = duration × 境界速度 × 灵根系数；灵石消耗 = duration × 消耗率；功法熟练度 += duration × 速度 | 叙事描述 |
| `trade` | 查物品价格表，扣灵石，加物品 | 物品名称/介绍 |
| `battle` | 查战斗引擎，结果由战斗系统决定 | 战备段叙事 |
| `travel` | 查距离表，算时间消耗 | 旅途叙事 |
| `breakthrough` | 查突破条件（修为/丹药/灵根），满足才允许 | 突破叙事 |
| `social` | 关系/情绪变化（AI 声明，系统校验范围） | 对话叙事 |

**与 G5 的关系**：G5（行动查表）是 G11（规则引擎）的雏形。G5 只算时间，G11 把所有数值计算都收归程序。

**迁移策略**：G5 完成后，protagonistState AI 已经输出 `[ACTION:]` 标记。G11 把 `[ACTION:]` 升级为结构化 Intent 对象，Rule Engine 从只算时间扩展到算所有数值。State AI 从"输出数值"退化为"输出意图 + 叙事"。

**影响**：新建 `ruleEngine.ts` + `intentSchema.ts`；protagonistState pipeline 改为输出 Intent 而非 State Diff；protagonistStatePreset 大幅瘦身（规则交给 schema + rule engine，prompt 只留角色/任务/文风）。

---

### 第三圈：远期增强

#### G12: Skill Library（技能库）

参考 Voyager。第一次"炼制聚气丹"生成完整剧情 + 验证流程，保存为 Skill（条件/流程/结果/失败处理）。以后遇到相同行为直接 Retrieve，无需重新思考。长期运行越来越稳定。

**实现**：每个 Skill 是一个 `{ trigger, preconditions, steps, expectedResult, failureHandling }` 模板。Rule Engine 遇到匹配 Intent 时先查 Skill Library，命中则按模板执行。

#### G13: 全局 Event Sourcing（完整事件流）

当前只有 NPC 事件流。目标：整个游戏全部事件驱动。

```
GainItem / LoseItem / BattleWin / BattleLose / Travel / Cultivation
Breakthrough / QuestComplete / RelationshipChange / WorldEvent
```

状态全部来自 Replay Event。优点：回滚、Debug、存档恢复、Replay。

**实现**：所有 State Update 都先产出 Event → 存入 EventStore → 再 Apply。存档 = EventStore 快照。读档 = Replay Events。

#### G14: Knowledge Graph（知识图谱）

长期 WorldBook 的进化方向。实体（NPC/地点/物品/势力）作为节点，关系（属于/敌对/师父/仇人）作为边。

```
林清雪 ─属于→ 青云宗 ─敌对→ 玄天宗
林清雪 ─师父→ 李玄
林清雪 ─信任→ 主角(85)
```

Graph 查询效率远高于文本检索。WorldBook 的关键词触发是"模糊匹配"，Knowledge Graph 是"精确查询"。

#### G15: NPC Agent 化

重要 NPC 完整自治（参考 Generative Agents）：
- `goal`：长期目标 + 短期目标
- `plan`：日程计划
- `memory`：个体记忆流（与主角的交互历史）
- `relationship`：多维度关系（G8）
- `emotion`：当前情绪（G8）
- `schedule`：每日安排

即使玩家不参与，NPC 也持续行动（修炼/探索/社交/突破）。NPC 的行动通过 World Simulation（G10）在后台推进，玩家再次遇到时能看到 NPC 的变化。

#### Prompt 持续瘦身（贯穿所有阶段）

随着 Function Calling + Schema + Rule Engine 成熟，prompt 逐渐只保留 `Role / Task / Style`。所有格式交给 Schema，所有规则交给 Rule Engine，所有历史交给 WorldBook。Prompt 越来越短，输出越来越稳定。

---

## 8. 关键决策

| 决策项 | 选择 | 理由 |
|---|---|---|
| 整体架构 | 保留 story/state 两步调用 | 实测单步合并不稳定 |
| 状态更新拆分 | protagonistState + npcState 并行 | 13 段标签过载；主角/NPC 变化频率不同 |
| 后端 | DeepSeek 官方 API | 支持 OpenAI 兼容 tool calling |
| 历史灌入 | 世界书关键词触发 + 分层上下文 | 取代全量线性灌入 |
| 世界书 entry 内容 | 前端模板化生成 | 避免 AI 偏离实际状态 |
| 输出模式 | 默认 tool calling，xml 兼容回退 | 双模式开关 |
| G4 范围 | 一次性全量迁移，含存档迁移 | 避免双写过渡期 |
| NPC 演进 | 系统驱动（查表算数值）+ AI 补叙事 | 数值准确不依赖 AI |
| NPC 寿终 | 系统标记死亡 + AI 下回合叙事交代 | 确定性 + 叙事性 |
| battleTrigger 归属 | npcState pipeline | 战斗是 NPC 交互产物 |
| 数值计算归属 | Rule Engine（程序算），LLM 只输出 Intent | LLM 负责叙事，程序负责规则 |
| 叙事控制 | Narrative Manager 注入方向 | 防止无限闲聊 |
| 世界运转 | Event Scheduler + World Simulation | 世界不等待玩家 |

---

## 9. 风险与缓解

| 风险 | 等级 | 缓解 |
|---|---|---|
| 世界书 entry 爆炸 | 中 | snapshot 按 recency 归档；quest 完成后 archive；token budget 裁剪 |
| 关键词触发漏激活 | 中 | 主角 + 在场 NPC 常驻；keys 含别名/外号；未来加 vector 检索 |
| entry content 与 AI 输出脱节 | 中 | content 前端模板化；AI 只声明变更 |
| 状态拆分后两步不一致 | 中 | 应用顺序先主角后 NPC；npcState 共享 protagonistBrief |
| DeepSeek tool calling 复杂 schema 不稳 | 中 | outputMode 开关；xml 路径保留；schema 复杂时手写简化版 |
| 存档迁移破坏老存档 | 高 | `_V1→_V2` + 自动备份；失败降级 |
| NPC 演进数值偏差 | 中 | 修炼速度/消耗率查表可调；监控并迭代 |
| 关系维度过多 AI 输出不全 | 中 | 关系为可选字段，缺省保留旧值；只要求 AI 声明"变化" |
| Narrative Manager 过度控场限制自由度 | 中 | paceGuidance 是建议非强制；玩家可偏离主线 |
| Rule Engine 规则与修仙世界观不符 | 中 | 规则表可配置；初版参考现有 preset 里的数值表 |
| 世界模拟开销大 | 中 | 只对 dormant NPC 批量算；重要 NPC 精细模拟，普通 NPC 简化 |
| 无自动化测试 | 中 | 每阶段录 fixtures |
| 第二圈改动范围大 | 高 | 每个子目标独立可验证；不强制一次性完成所有 |

---

## 10. 目标目录结构

```
src/ai/
├── bridge/
│   ├── openAiChatBridge.ts
│   └── apiConfig.ts
├── presets/                       # 全部 *_preset.ts
├── shared/
│   ├── apiTypes.ts                # 统一 AiRequestConfig
│   ├── runPipeline.ts             # 统一 payload + 调用 + retry
│   ├── protagonistBrief.ts        # G1
│   ├── storyBodyExtract.ts
│   ├── worldBookInject.ts         # G6 注入引擎
│   ├── worldBookBuild.ts          # G6 content 模板化
│   ├── protagonistStateSchema.ts  # G3
│   ├── npcStateSchema.ts          # G3
│   ├── stateTool.ts               # G3
│   ├── intentSchema.ts            # G11 Intent 定义
│   ├── ruleEngine.ts              # G11 规则引擎
│   ├── actionTimeline.ts          # G5
│   ├── npcEvolution.ts            # G7 NPC 演进计算
│   ├── relationshipSchema.ts      # G8
│   ├── emotionSchema.ts           # G8
│   ├── narrativeSchema.ts         # G9
│   ├── eventScheduler.ts          # G10
│   ├── worldSimulation.ts         # G10
│   ├── skillLibrary.ts            # G12
│   ├── eventStore.ts              # G13
│   ├── knowledgeGraph.ts          # G14
│   └── ...
├── pipelines/
│   ├── protagonistState.ts        # G3
│   ├── npcState.ts                # G3
│   ├── narrative.ts               # G9 叙事管理 pipeline
│   └── ...
├── composables/
│   └── useOpeningStory.ts
├── types/
└── __fixtures__/

src/role_core/
├── worldBookStore.ts              # G6
├── relationshipStore.ts           # G8
├── emotionStore.ts                # G8
├── narrativeStore.ts              # G9
├── eventStore.ts                  # G13
├── knowledgeGraphStore.ts         # G14
├── Npc.ts                         # G4/G7/G8 加状态机/关系/情绪
├── npcStore.ts                    # G4/G7 加事件流/演进
├── Protagonist.ts
└── types/
    ├── worldBook.ts
    ├── npcEvents.ts               # G4
    ├── relationship.ts            # G8
    ├── emotion.ts                 # G8
    ├── narrative.ts               # G9
    ├── quest.ts                   # G9
    ├── intent.ts                  # G11
    ├── skill.ts                   # G12
    └── ...
```

---

## 11. 变更日志

| 日期 | 变更 |
|---|---|
| 2026-07-13 | v1：初版，5 子目标 + 4 阶段方案 |
| 2026-07-13 | v2：加入世界书（G6），6 子目标 + 5 阶段 |
| 2026-07-13 | v3：状态拆分为 protagonistState + npcState 并行 pipeline |
| 2026-07-13 | v4：精简文档，去除具体代码示例，聚焦框架设计 |
| 2026-07-13 | v5：合并 18 项架构演进建议，扩展为 15 子目标（G1-G15）三圈体系；新增 NPC 自主演进/关系情绪/叙事管理器/世界模拟/意图驱动+规则引擎/技能库/事件溯源/知识图谱/NPC Agent 化；加入最终架构总览图与数据流 |
