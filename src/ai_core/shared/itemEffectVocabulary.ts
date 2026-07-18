/**
 * 兼容垫片：统一效果词汇表的旧导出名重新导出。
 * 真正实现在 effects.ts（池/类型）与 items.ts（解析器）。
 */
export { validateGrade, resolveGongfaEffect, resolveTreasureEffect, resolveElixirEffect } from "../../role_core/types/items";
export { buildUnifiedVocabularyPrompt as buildItemEffectVocabularyPrompt, buildStoryItemEffectHint } from "./effectVocabulary";
