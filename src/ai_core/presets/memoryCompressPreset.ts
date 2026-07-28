/**
 * Preset: 记忆压缩（memoryCompress）
 *
 * 用于把一批较早的记忆条目压缩成一条更凝练的摘要。
 * 同时服务两档压缩：短期(回合摘要)→中期、中期→长期。
 * 移植自 MoRanJiangHu 的滚动压缩思路，适配本项目。
 */

export interface MemoryCompressPresetOptions {
  /** 压缩档位：short2mid 一批单回合摘要压成中期；mid2long 一批中期压成长期。 */
  tier: "short2mid" | "mid2long";
}

/** 按 tier 生成压缩 system prompt。 */
export function buildMemoryCompressSystemPreset(options: MemoryCompressPresetOptions): string {
  const isMid2Long = options.tier === "mid2long";
  const sourceLabel = isMid2Long ? "中期记忆条目（每条已是一段较早期的压缩摘要）" : "逐轮剧情摘要（每条为单回合核心事件简述）";
  const targetLen = isMid2Long ? "800-1000 字" : "300-500 字";
  const coverage = isMid2Long ? "约 50 条中期记忆" : "约 30 回合";

  return `
[职责]
你是修仙文字 RPG 的「记忆压缩器」。你会收到两部分材料：
1. 既有摘要（可能为空，表示首次压缩该档位）；
2. 一批按时间顺序排列的${sourceLabel}。
你的任务：把既有摘要与这批材料融合，重新压缩为一段${targetLen}的连贯摘要，覆盖${coverage}的关键信息。

[撰写要求]
1. 以时间线为骨架，按因果顺序串联关键事件：主角去了哪里、做了什么、与谁结交或结怨、获得或失去了哪些关键物品、境界与功法的重要进展、重要 NPC 的关系演变。
2. 优先保留对后续剧情有持续影响的信息：未解决的伏笔、重要人际关系、关键物品与机缘、境界突破节点、敌对势力与恩怨。
3. 丢弃一次性的环境描写、琐碎对话细节、已被后续事件覆盖或已了结的过渡情节。
4. 当存在既有摘要时：保留旧摘要中仍有价值的主线脉络，把新材料中的事件接续到时间线末尾，再整体压缩到${targetLen}。不要简单拼接，必须重新组织为连贯叙事。
5. 语言：简体中文，第三人称叙述（用主角姓名或「主角」指代），平实叙事，追求信息密度而非文采。
6. 字数：${targetLen}。

[输出契约·必须遵守]
仅输出一对标签：<mj_memory_compress> 压缩摘要 </mj_memory_compress>。
标签外禁止写任何内容；不得省略标签；禁止用 Markdown 代码围栏包裹标签。
`;
}

/** 便捷常量：两档各自的 system prompt。 */
export const MEMORY_COMPRESS_SHORT2MID_SYSTEM_PRESET = buildMemoryCompressSystemPreset({ tier: "short2mid" });
export const MEMORY_COMPRESS_MID2LONG_SYSTEM_PRESET = buildMemoryCompressSystemPreset({ tier: "mid2long" });
