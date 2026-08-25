# AI 管线拆解

本文档描述游戏的 AI 管线组装方式：每条管线的触发时机、向 AI 请求哪些数据更新，以及哪些数据是硬编码的。细节以源码为准，此处只给框架。

## 一、底层通道

所有 AI 调用走同一个桥接层 `openAiChatBridge.ts`：

- OpenAI 兼容 `/chat/completions`，**非流式**，默认超时 300 秒；Base URL 缺 `/vN` 后缀自动补 `/v1`。
- 纯文本进出，不用 function calling。结构化数据靠提示词约定的**自定义 XML 标签**承载，前端用字符串定位 + 容错 JSON 解析提取（`parseAiItem.ts` 的 `extractTagContent` / `tryParseJsonArray` / `sanitizeJsonLike`）。
- 解析失败一律**静默降级**：字段丢弃或回退默认值，不中断游戏（战斗触发、行动建议等可选标签缺失就当没有）。

每条管线 = 一个 `xxx_preset.ts`（system 提示词）+ 一个 `xxx_generate.ts`（拼 user 消息、调桥接、解析标签）。

## 二、管线清单

### 开局（`useOpeningStory.ts` 串联，命运抉择确认后跑一次）

1. **开局剧情** `init_story_generate` —— 输入主角档案（命格/天赋/出身），输出 `<mj_story_body>` 开局正文。
2. **开局状态** `init_state_generate` —— 输入开局正文 + 主角，输出：出生地点 `<mj_world_body>`、初始法宝 `<mj_equip_body>`、功法 `<mj_magic_body>`、储物袋 `<mj_storage_body>`、修为 `<USER_STATE_TAG>`、在场 NPC `<NPC_NEARBY_TAG>`、剧情快照 `<mj_story_snapshot>`、年龄 `<mj_protagonist_age>`。

### 每回合（`StoryChatPanel.vue` 驱动，玩家每次输入走"两跳"）

3. **剧情生成** `story_generate` —— 第一跳，只管写故事。system = 文风预设（`preset.ts` + `story_preset.ts`）+ 之前剧情正文拼接；user = 主角摘要 + 场景 NPC 快照 + 玩家输入。输出仅 `<mj_story_body>`（另有 `<thinking>` 被剥离）。标签不完整会自动重试一次。
4. **状态生成** `state_generate` —— 第二跳，读第一跳的正文，把"故事里发生了什么"翻译成状态变更。这是最大的一条管线，输出标签：

   | 标签 | 内容 |
   |---|---|
   | `<mj_world_body>` | 主角当前位置（四级地点） |
   | `<MJ_HP_MP_TAG>` | 血量/法力百分比 |
   | `<MJ_TIME_TAG>` | 时间推进量（年/月/日/时） |
   | `<USER_STATE_TAG>` | 修为增量、功法熟练度增量 |
   | `<MJ_BREAKTHROUGH_TAG>` | 突破/突破任务/突破失败标志 |
   | `<SPIRIT_STONE_TAG>` | 灵石增减 |
   | `<ITEM_ADD_TAG>` / `<ITEM_REMOVE_TAG>` | 物品获得/失去 |
   | `<NPC_NEARBY_TAG>` | 在场 NPC 全量软信息（好感/外貌/位置…） |
   | `<MJ_NPC_CORE_CHANGE_TAG>` | NPC 核心层变更**事件**（见下） |
   | `<BATTLE_TRIGGER_TAG>` | 是否进战斗 + 敌我名单 |
   | `<mj_story_snapshot>` | 本轮压缩快照（喂后续上下文） |
   | `<MJ_ACTION_OPTIONS_TAG>` | 四档行动建议按钮 |

   解析结果由 `applyStateResult` 分发到各 store（Protagonist / npcStore / worldMapStore / storyStore），然后 `writeActiveSave()`。

### 按需触发

5. **修炼剧情** `cultivation_story_generate` —— 闭关修炼确认后替代第一跳（第二跳照走）。
6. **结局剧情** `finale_story_generate` —— 寿元耗尽或战败，生成终章。
7. **滚动大总结** `grand_summary_generate` —— story 消息数超过"保留 30 + 阈值 30"时，把旧快照压成约 1000 字总纲，物理裁剪聊天历史（`storyStore.grandSummary`）。这是记忆压缩机制。
8. **NPC 重评估** `npc_reevaluation_generate` —— 主角进入新地点时，把该地点休眠且 ≥N 年未见的 NPC 批量交给 AI 整体更新（境界成长、际遇等）。是"核心层冻结"的受控例外。

### 独立管线

9. **文生图** `image_generate/` —— 火山引擎图片接口，生成主角/NPC 立绘。`promptBuilder` 用种族/外貌/服装字段拼提示词，与文字管线互不依赖。

## 三、重试与回退

每轮生成前 `capturePreGenSnapshot` 深拷贝储物袋 + NPC + 世界地图 + 剧情状态；重试时只回退这四样，**不回退**主角 HP/MP/属性/装备/功法/境界（成长结果不因换剧情而丢）。

## 四、AI 决定什么 vs 硬编码什么

原则：**AI 输出"定性"（发生了什么、东西叫什么、什么品阶），数值由硬编码表决定**，防止模型随口报数导致数值膨胀。

AI 说了算的：

- 全部叙事文本、剧情快照、行动建议文案
- 事件本身：去了哪、过了多久、血蓝百分比、修为/熟练度**增量**、得失了什么物品（名称/类型/品阶/描述）、NPC 名单与软字段、是否开战
- NPC 核心层（境界/装备/功法/生死）默认**冻结**，只接受 `<MJ_NPC_CORE_CHANGE_TAG>` 里显式声明的事件（`realm_breakthrough` / `equipment_acquired` / `equipment_lost` / `combat_damage` / `death`），防止 NPC 被叙事顺手改强

硬编码说了算的（AI 输出一律过白名单校验，非法回退默认值）：

- `role_core/types/gameConstants.ts`：境界序列 `REALM_ORDER`/`SUB_STAGES`、各境界主属性/HP/MP/寿元表、品阶→属性范围表、灵根战斗加成、功法熟练度倍率
- `treasure.ts` / `gongfa.ts` / `elixir.ts`：词条类型池 + 每品阶数值区间——AI 给出物品名和品阶后，具体数值由 `rollXxx` 系列在区间内**随机滚动**（`parseAiItem.ts`）
- `itemInfo.ts` 的 `GRADE_DROP_TABLE`：品阶掉落概率
- `fate_choice/traits.ts`：天赋池全静态，效果结算不经过 AI
- `battle_engine/`：战斗全程纯本地逻辑（公式、`BASE_CRIT_DMG` 等常量），AI 只负责触发战斗和事后把战报写回剧情
