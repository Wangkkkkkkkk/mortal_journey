/**
 * AI 提示词构建器（效果词汇表层）。
 *
 * 效果类型、效果池、解析器都在 role_core/types/effects.ts 与 items.ts。
 * 本文件仅负责把效果池渲染为 AI 提示词文本（状态/开局/剧情 AI 用）。
 */
import { EFFECT_VOCABULARY, TREASURE_MODIFIER_TYPES, TREASURE_MODIFIER_NAMES, DAMAGE_TYPES, STATUS_TYPES, CC_TYPES, SUMMON_TRIGGERS, SCALING_STATS, type EffectApplicability } from "../../role_core/types/effects";

function paramHint(p?: string): string {
  switch (p) {
    case "damageType": return `damageType(${DAMAGE_TYPES.join("/")})`;
    case "statusType": return `statusType(${STATUS_TYPES.join("/")})`;
    case "ccType": return `ccType(${CC_TYPES.join("/")})`;
    case "modifierType": return `modifierType(${TREASURE_MODIFIER_TYPES.map(t => `${t}:${TREASURE_MODIFIER_NAMES[t]}`).join(", ")})`;
    case "scalingStat": return `scalingStat(${SCALING_STATS.map(s => `${s}`).join(", ")}, 可省略按伤害类型默认)`;
    case "summonTrigger": return `summonTrigger(${SUMMON_TRIGGERS.join("/")})`;
    case "statKey": return `statKey(${SCALING_STATS.join("/")})`;
    default: return "";
  }
}

/** 状态/开局 AI 用：完整词汇表（含 kind id 与参数枚举）。 */
export function buildUnifiedVocabularyPrompt(): string {
  const sections: string[] = ["[物品效果词汇表·重要]", "所有物品（功法/法宝/丹药/符箓/阵法）的具体效果由你从下表选 kind 决定，系统按品阶自动填数值。效果须与物品名称/介绍/剧情描写一致。", ""];
  const groups: { title: string; app: EffectApplicability }[] = [
    { title: "一、功法效果（主动：可施放，消耗法力，有冷却）", app: "active" },
    { title: "二、功法被动 / 法宝效果（常驻生效）", app: "passive" },
    { title: "三、消耗品效果（丹药/符箓/阵法：使用后生效，可多条组合）", app: "elixir" },
  ];
  for (const g of groups) {
    sections.push(g.title);
    for (const k of EFFECT_VOCABULARY.filter(e => e.applicability === g.app)) {
      const params = k.params ? Object.keys(k.params).map(pk => paramHint(pk)).filter(Boolean).join("；") : "无";
      sections.push(`  - ${k.kind}（${k.label}）：${k.desc}。参数：${params}`);
    }
    sections.push("");
  }
  sections.push('输出格式：物品 JSON 中加 effects 字段（数组），每项 {kind, ...参数}，可列多条自由组合。例如：');
  sections.push('  灼烧功法：{"effects":[{"kind":"dealDamage","damageType":"magical","scalingStat":"perception"},{"kind":"applyStatus","statusType":"burn"}]}');
  sections.push('  增伤法宝：{"effects":[{"kind":"applyModifier","modifierType":"damageDealt"}]}');
  sections.push('  回血丹药：{"effects":[{"kind":"healHp"}]}');
  sections.push('  火符箓：{"effects":[{"kind":"dealDamage","damageType":"magical"},{"kind":"applyStatus","statusType":"burn"}]}');
  sections.push('  迷魂阵：{"effects":[{"kind":"applyCc","ccType":"confusion"}]}（阵法效果默认群体：增益=友方全体，减益/伤害=敌方全体）');
  sections.push('说明：一件物品的 effects 可包含任意多条原语组合（如伤害+灼烧、护盾+反击）。功法建议同类（全主动或全被动），消耗品建议 1~3 条。可选 isAoE:true 表示群体（阵法默认已是群体，无需额外标）。');
  return sections.join("\n");
}

/** 剧情 AI 用：轻量常识（无 id，仅类别描述）。 */
export function buildStoryItemEffectHint(): string {
  return [
    "[物品效果常识]",
    "剧情中描写的法宝/功法/丹药效果会直接决定其真实效果（系统据此匹配战斗引擎效果），故描写威力时应落在以下类别内，避免叙事与实际效果脱节：",
    "- 伤害类：直接伤害、斩杀、破防、吸血、灼烧/中毒/流血持续。",
    "- 控制类：眩晕、冰冻、沉默、嘲讽、恐惧、混乱。",
    "- 辅助类：治疗、净化、驱散、隐匿、召唤、复活、操纵行动。",
    "- 被动类（法宝/被动功法）：增减伤、暴击、速度、穿透、恢复、护盾、反击、反伤、分摊、免死、连击。",
    "- 丹药：恢复血量/法力、提升修为/寿元、永久提升体魄/灵力/劲力/护体/灵御/神识/身法/悟性。",
    "描写时让物品名称、外观、来历与其效果语义自洽即可，不必列出数值。",
    "",
    "以下是一些物品效果在剧情中的表述参考：",
    "- dealDamage：符箓激发，一道烈焰剑气破空而去，灼烧前方三丈之地",
    "- applyStatus：毒丹化入水中，无色无味，中者三日之内灵力溃散",
    "- healHp：吞下疗伤丹，伤势以肉眼可见的速度愈合，断骨续接如初",
    "- shield：金甲符化作一道淡金光罩，将周身护得密不透风",
    "- dealDamage + applyStatus：火符出手，化作一条火龙席卷而去，所过之处草木焦枯，附着的磷火持续灼烧",
  ].join("\n");
}
