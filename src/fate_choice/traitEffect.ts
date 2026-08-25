/**
 * @fileoverview 天赋具体效果：类型 + 纯数据解析器 + 命名池 + 展示文案。
 *
 * 解析器只 import `role_core` 的类型与 roll 函数，**不 import `Protagonist` 类**，
 * 故 `Protagonist.fromFateChoice` 反向调用本模块不会产生循环依赖。
 *
 * 设计要点：
 *   - 天赋稀有度 → 物品品阶一一映射（见 `traits.ts` 的 `TRAIT_RARITY_TO_GRADE`），
 *     每条天赋的 `effect` 已直接写明 `grade`，解析器无需再查稀有度。
 *   - 法宝/功法/丹药均复用现有 roll 函数与命名表，与 AI 掉落行为一致。
 *   - 仙品/神品法宝取命名法宝（`rollTreasureSpecialEffect`）；下品~极品取通用命名池。
 */

import type {
  ItemGrade,
  ItemCategory,
  InventoryStackItem,
  TreasureItemDefinition,
  GongfaItemDefinition,
  ElixirItemDefinition,
  MaterialItemDefinition,
} from "../role_core/types/itemInfo";
import type { MaterialCategory } from "../role_core/craft";
import type { PrimaryStatKey } from "../role_core/types/playInfo";
import { PRIMARY_STAT_KEY_TO_ZH } from "../role_core/types/playInfo";
import type { ElixirEffectType } from "../role_core/types/elixir";
import { rollElixirValue, isElixirPercent } from "../role_core/types/elixir";
import type { GongfaSystem, GongfaSpecialEffect } from "../role_core/types/gongfa";
import { rollGongfaFunction } from "../role_core/types/gongfa";
import { rollTreasureFunction, rollTreasureSpecialEffect } from "../role_core/types/treasure";
import { GONGFA_GRADE_ATTRI_TABLE, rollGradeAttriValue } from "../role_core/types/gameConstants";
import { ELIXIR_NAME_TABLE } from "../role_core/alchemy";

// ---------------------------------------------------------------------------
// 效果类型（判别联合）
// ---------------------------------------------------------------------------

export type TraitEffect =
  | { kind: "spiritStones"; count: number }
  | { kind: "materials"; category: ItemCategory; grade: ItemGrade; count: number }
  | { kind: "elixir"; grade: ItemGrade; count: number; effectType: ElixirEffectType }
  | { kind: "statBonus"; stats: Partial<Record<PrimaryStatKey, number>> }
  | { kind: "treasure"; grade: ItemGrade }
  | { kind: "gongfa"; system: GongfaSystem; grade: ItemGrade };

/** 解析后的聚合结果：调用方据此写入主角。 */
export interface ResolvedTraitEffect {
  /** 进储物袋的法宝/功法/丹药/材料。 */
  items: InventoryStackItem[];
  /** 直接加到主属性上的加成。 */
  statBonus: Partial<Record<PrimaryStatKey, number>>;
  /** 灵石数量。 */
  spiritStones: number;
}

// ---------------------------------------------------------------------------
// 命名池
// ---------------------------------------------------------------------------

function pickRandom<T>(pool: readonly T[]): T {
  return pool[Math.floor(Math.random() * pool.length)];
}

/** 材料命名池的一行。 */
type MaterialNameEntry = { name: string; desc: string };

/**
 * 材料命名池（先按分类、再按品阶；目前材料只由 AI 命名，此表为天赋授予专用）。
 *
 * 「药材」一列为原有词条。毒物 / 器材 / 食材三列为占位，每个品阶各先给一条通用名，
 * 补词条时照着药材列的写法往对应品阶的数组里加即可（同一格可以放多条，随机取一条）。
 */
const MATERIAL_NAME_TABLE: Readonly<
  Record<MaterialCategory, Readonly<Record<ItemGrade, readonly MaterialNameEntry[]>>>
> = {
  药材: {
    下品: [
      { name: "百年灵芝", desc: "生于深山的低阶灵草，蕴含稀薄灵气，炼丹常用辅料。" },
      { name: "铁木枝", desc: "铁木所生枝条，坚韧如铁，是炼制低阶丹药的常用材料。" },
      { name: "赤炎草", desc: "生于向阳坡地的灵草，性温，入药可温养经脉。" },
    ],
    中品: [
      { name: "千年灵芝", desc: "吸纳百年灵气的中阶灵药，药性醇厚，炼丹价值颇高。" },
      { name: "寒铁精", desc: "万载寒铁凝炼的精华，寒气逼人，是上佳的炼丹辅材。" },
      { name: "紫叶兰", desc: "叶脉泛紫的珍稀灵兰，入药可助凝练真元。" },
    ],
    上品: [
      { name: "万年灵芝", desc: "历经万载岁月的珍稀灵芝，灵气氤氲，炼丹名材。" },
      { name: "玄铁精", desc: "上古玄铁凝炼的精华，坚逾金玉，炼丹炼器皆宜。" },
      { name: "九叶兰", desc: "一株九叶的稀世灵兰，叶含灵光，入药功效非凡。" },
    ],
    极品: [
      { name: "天地灵果", desc: "吸纳天地灵气而结的灵果，服之可通灵窍，炼丹极品。" },
      { name: "太乙精金", desc: "蕴含太乙之气的精金，光彩夺目，万金难求。" },
      { name: "九转灵芝", desc: "经九转而成的极品灵芝，灵气凝实，炼丹圣物。" },
    ],
    仙品: [
      { name: "仙界灵根", desc: "自仙界坠落的灵根碎片，仙气流转，非凡间之物。" },
      { name: "混元金精", desc: "混元之气凝炼的金精，光辉灿烂，仙家炼丹至宝。" },
      { name: "造化灵芝", desc: "夺天地造化而生的仙品灵芝，一株可抵凡间百草。" },
    ],
    神品: [
      { name: "神界天材", desc: "源自神界的稀世天材，神韵流转，近乎不朽。" },
      { name: "混沌神金", desc: "混沌初开时凝炼的神金，万劫不坏，举世罕见。" },
      { name: "造化神根", desc: "造化之神遗留的灵根，神光内蕴，炼丹可夺天工。" },
    ],
  },
  毒物: {
    下品: [
      { name: "腐骨草", desc: "生于阴湿乱坟旁的低阶毒草，汁液具微弱腐蚀性，常用于配制基础毒散。" },
      { name: "青斑蛇胆", desc: "普通毒蛇的胆囊，腥臭刺鼻，是炼制麻痹与活血毒药的常用辅料。" },
      { name: "黑磷砂", desc: "地表浅层采出的毒性矿砂，遇火微燃生烟，微毒且易溶于水。" }
    ],
    中品: [
      { name: "七步断肠草", desc: "叶生七瓣的中阶剧毒灵植，采摘时泛幽光，汁液入血可迅速阻滞经络。" },
      { name: "赤目蝎尾钩", desc: "百年毒蝎的尾部毒刺，淬有灼烈火毒，乃炼制破罡毒丹的上好材料。" },
      { name: "阴风寒石", desc: "终年吹拂阴风的古洞中凝结的毒石，散发刺骨寒毒，善损修士肉身血气。" }
    ],
    上品: [
      { name: "万毒幽兰", desc: "生长于极凶毒沼的珍稀灵花，花香惑人心神，叶片蕴藏强效蚀灵之毒。" },
      { name: "九节碧灵蛇蜕", desc: "异种灵蛇蜕下的外皮，附着浓郁阴寒毒素，是炼制破法毒药的名材。" },
      { name: "冥煞毒晶", desc: "地煞阴脉汇聚凝结的晶石，内蕴霸道死煞，触碰即能侵蚀修士护体罡气。" }
    ],
    极品: [
      { name: "九幽绝命芝", desc: "汲取九幽地脉阴煞而生的极品毒灵芝，通体墨黑，服之断人泥丸神念。" },
      { name: "天罗万毒髓", desc: "万年毒窟深处萃取的万毒精髓，一滴可化大江水体，为极品毒道圣物。" },
      { name: "蚀骨化生果", desc: "生于凶煞古战场尸骸之上的奇果，散发诡异甜香，入药可化去一切护体免伤。" }
    ],
    仙品: [
      { name: "黄泉仙陨花", desc: "黄泉彼岸汲取仙人陨落道韵而开的花朵，仙人沾染亦难逃三魂溃散、五衰降临。" },
      { name: "大罗绝灵蛊蜕", desc: "上古奇蛊留下的金蝉遗壳，蕴含绝法仙毒，触之仙家法力尽失、归于沉寂。" },
      { name: "幽冥玄阴毒露", desc: "仙界极阴天渊凝结的无上仙露，无色无味，能从根基瓦解不灭仙体。" }
    ],
    神品: [
      { name: "混沌寂灭煞", desc: "开天辟地前混沌残存的寂灭死煞，神光寂灭，沾染分毫可令诸天神明道果崩解。" },
      { name: "太古噬道花", desc: "太古神墟中伴随大道残骸而生的神草，专噬天地法则，服之万般神通皆化虚无。" },
      { name: "造化灭度髓", desc: "逆转天地造化而生的因果神毒精髓，因果相连，可隔空诛杀神魂本源。" }
    ],
  },
  器材: {
    下品: [
      { name: "百炼粗铁", desc: "凡铁经百次锻打而成的基础材料，质地坚硬，多用于炼制低阶刀剑。" },
      { name: "风磨铜", desc: "受山风侵蚀的轻质铜矿，分量轻盈，适合打造暗器与轻便兵刃。" },
      { name: "坚纹青木", desc: "生于灵气贫瘠处的坚韧木料，木纹密实，常作枪柄或法杖骨架。" }
    ],
    中品: [
      { name: "沉金灵矿", desc: "深埋地底的中阶矿石，比寻常精铁沉重数倍，可增强兵刃与重甲的破甲沉稳之势。" },
      { name: "赤血精铜", desc: "蕴含一丝地火灵力的红铜，导灵性佳，是炼制中阶法器与炎属性法宝的上佳胚料。" },
      { name: "寒蚕韧丝", desc: "雪山寒蚕吐出的灵丝，水火难伤且极为柔韧，常用于编织软甲或法袍内衬。" }
    ],
    上品: [
      { name: "星宿陨铁", desc: "天外流星坠落留下的陨铁，自带星辰锐气，锋利异常，铸器可引动星煞之力。" },
      { name: "凤栖灵木", desc: "灵禽常年栖息的古木心材，灵气充沛且坚不可摧，炼制上品法宝与灵弓的神材。" },
      { name: "深海寒魄玉", desc: "万丈海沟深处的极寒灵玉，质地通透，镶嵌于佩饰或阵盘上可极大幅提升灵力流转。" }
    ],
    极品: [
      { name: "玄天精金", desc: "天脉灵矿历经万载孕育的极品矿材，金光内蕴、破万法，是铸造极品神兵的基石。" },
      { name: "真龙逆鳞", desc: "大妖蛟龙蜕变时褪下的本命硬鳞，防御极强，乃打造传世极品护甲与重盾的核心。" },
      { name: "空冥灵石", desc: "内含一丝空间道韵的透明晶石，极难采掘，是开辟极品储物法宝与阵旗的圣物。" }
    ],
    仙品: [
      { name: "大罗仙金", desc: "仙界九重天雷反复淬炼而生的仙金，万劫不磨，自带仙道纹理，可铸造传世仙器。" },
      { name: "九天建木心", desc: "通天古木的极尽核心碎片，蕴含磅礴生机与天道法则，仙家炼器至宝。" },
      { name: "混元乾坤玉", desc: "天然蕴含小世界雏形的仙玉，能容纳诸天万象，炼制洞天仙宝的无上主材。" }
    ],
    神品: [
      { name: "鸿蒙神铁", desc: "诞生于太初鸿蒙之中的先天神铁，自成造化，挥舞间引动开天伟力，举世无双。" },
      { name: "混沌创世石", desc: "混沌初开时支撑乾坤的大道基石碎屑，不堕轮回，可铸就镇压诸天的大道神器。" },
      { name: "不灭神髓晶", desc: "太古神明神躯本源凝炼而成的至高晶石，神韵恒古不灭，铸甲可抵挡天地大劫。" }
    ],
  },
  食材: {
    下品: [
      { name: "灵泉甘露", desc: "山间灵泉清晨汇聚的露水，入口清凉甘润，可作为烹茶煮羹的清润灵水。" },
      { name: "翠玉灵米", desc: "低阶灵田种植的晶莹灵米，蒸熟后香气扑鼻，凡人服之亦能强身健体、驱除杂秽。" },
      { name: "刚鬃野彘肉", desc: "吸收些许山野灵气的野猪肉，肉质紧实嚼劲十足，食用可增补少许血气气力。" }
    ],
    中品: [
      { name: "云雾雾茶嫩芽", desc: "终年笼罩在云雾灵气中的古茶嫩叶，烘干后冲泡灵香四溢，烹制茶点能生发身法灵动。" },
      { name: "地灵翡翠笋", desc: "深山地脉滋养出的翡翠竹笋，鲜嫩爽脆，烹煮素菜可大幅固本培元、壮实体魄。" },
      { name: "赤炎斑虎里脊", desc: "中阶妖兽身上最细嫩的精肉，蕴含浓厚阳气，大火炙烤食用能激发周身爆裂力道。" }
    ],
    上品: [
      { name: "冰蚕灵雪粉", desc: "雪山异蚕食寒露后产出的精粹细粉，细腻如雪，制成点心食后体轻如燕、步履生风。" },
      { name: "七彩九叶芝", desc: "吸纳天地灵气长成的七色肉芝，药香浓烈，入羹炖汤可令体魄防御强若玄金。" },
      { name: "金鳞蛟龙髓", desc: "深潭恶蛟脊骨中抽取的精髓，鲜美无比且血气旺盛，烹饪后食之膂力通神、气血如沸。" }
    ],
    极品: [
      { name: "万年灵地乳", desc: "大地深处万载方凝聚一滴的地乳琼浆，入口醇厚回甘，烹煮神馔可洗涤肉身周身经络。" },
      { name: "通天朱果", desc: "三百年一开花、三百年一结果的极品灵果，汁液甘甜如蜜，食之神念大开、施法威能骤增。" },
      { name: "覆海狂暴巨兽精肉", desc: "深海万载巨兽的命门精肉，蕴藏排山倒海般的气力，食后可爆发拔山扛鼎之绝世巨力。" }
    ],
    仙品: [
      { name: "瑶池蟠桃果肉", desc: "仙界瑶池灵根结出的三千年仙桃，肉质如凝脂美玉，仙香扑鼻，食之一口仙气环绕、固若金汤。" },
      { name: "九霄金羽鸾肉", desc: "九天神禽褪落的灵肉精粹，仙灵之力内聚，佐以仙酒烹调可令人法术通神、瞬息百里。" },
      { name: "太虚九叶灵茸", desc: "生长在太虚边缘的仙品肉灵芝，蕴含不灭仙机，烹制仙膳可令仙体与天地法理彻底相合。" }
    ],
    神品: [
      { name: "混沌大道神果", desc: "大道法则自然凝结而成的先天神果，蕴含混沌本源，食之明悟天地大道、身化天地至法。" },
      { name: "太古祖龙髓", desc: "开天辟地第一条真龙留存的神髓，蕴藏开天辟地的肉身极致神力，吞服可拥碎灭诸天之霸力。" },
      { name: "造化玄黄母气晶", desc: "天地始成时第一缕玄黄母气凝成的神物，烹调入味则身化不灭神体，与寰宇同寿、万劫不坏。" }
    ],
  },
};

/**
 * 通用法宝命名池（仅下品~极品使用）。
 * 仙品/神品法宝直接采用 `rollTreasureSpecialEffect` 返回的命名法宝。
 */
const GENERIC_TREASURE_NAME_TABLE: Readonly<Record<ItemGrade, readonly { name: string; desc: string }[]>> = {
  下品: [
    { name: "玄铁剑", desc: "以玄铁粗炼而成的低阶法器，锋刃尚可，聊胜于无。" },
    { name: "灵纹甲", desc: "刻有粗浅灵纹的护身甲胄，可挡寻常刀剑。" },
    { name: "青木环", desc: "青木所制的法环，灵气微弱，初学者常用。" },
  ],
  中品: [
    { name: "寒霜剑", desc: "寒霜之气凝于剑身，挥动间寒意逼人。" },
    { name: "金丝甲", desc: "以金丝灵线织就的软甲，轻便而坚韧。" },
    { name: "聚灵环", desc: "可汇聚灵气的中阶法环，辅助修行颇有奇效。" },
  ],
  上品: [
    { name: "紫电剑", desc: "剑身紫电缠绕，出鞘时电光乍现，威能不俗。" },
    { name: "玄龟甲", desc: "取玄龟背甲炼制的上品护甲，坚逾金石。" },
    { name: "纳灵环", desc: "能纳藏灵气的上品法环，攻守兼备。" },
  ],
  极品: [
    { name: "天星剑", desc: "以陨星之铁炼就的极品法剑，剑光如星河倾泻。" },
    { name: "龙鳞甲", desc: "真龙遗鳞拼合而成的极品宝甲，万法难伤。" },
    { name: "乾坤环", desc: "暗合乾坤之理的极品法环，灵韵深远。" },
  ],
  仙品: [
    { name: "仙品法宝", desc: "仙家遗落人间的法宝，仙韵流转。" },
  ],
  神品: [
    { name: "神品法宝", desc: "神界流传的至宝，神光万丈。" },
  ],
};

// ---------------------------------------------------------------------------
// 解析器
// ---------------------------------------------------------------------------

/** 从功法品阶属性表的主属性键中随机取一个（用于功法被动加成）。 */
function pickRandomBonusName(): string {
  const keys = Object.keys(GONGFA_GRADE_ATTRI_TABLE);
  return keys[Math.floor(Math.random() * keys.length)];
}

/** 根据功法战斗效果的 scalingStat 决定属性加成；效果无属性加成时回退随机。 */
function pickGongfaBonusName(fn: GongfaSpecialEffect): string {
  for (const e of fn.battleEffects) {
    if ("scalingStat" in e && e.scalingStat) {
      return PRIMARY_STAT_KEY_TO_ZH[e.scalingStat];
    }
  }
  return pickRandomBonusName();
}

/**
 * 将一条 {@link TraitEffect} 解析为可写入主角的聚合结果。
 *
 * 涉及随机 roll（法宝词条、功法效果、丹药数值、命名）均在此时一次性结算，
 * 调用方（`Protagonist.fromFateChoice`）通常只在开局调用一次。
 *
 * @param effect 天赋效果。
 * @returns 聚合结果（items / statBonus / spiritStones）。
 */
export function resolveTraitEffect(effect: TraitEffect): ResolvedTraitEffect {
  const empty: ResolvedTraitEffect = { items: [], statBonus: {}, spiritStones: 0 };

  switch (effect.kind) {
    case "spiritStones":
      return { ...empty, spiritStones: Math.max(0, Math.floor(effect.count)) };

    case "materials": {
      const count = Math.max(1, Math.floor(effect.count));
      const byGrade = MATERIAL_NAME_TABLE[effect.category] ?? MATERIAL_NAME_TABLE.药材;
      const entry = pickRandom(byGrade[effect.grade] ?? byGrade.下品);
      const item: MaterialItemDefinition = {
        itemType: "材料",
        name: entry.name,
        desc: entry.desc,
        grade: effect.grade,
        count,
        category: effect.category,
      };
      return { ...empty, items: [item] };
    }

    case "elixir": {
      const count = Math.max(1, Math.floor(effect.count));
      const entry = ELIXIR_NAME_TABLE[effect.effectType]?.[effect.grade];
      const value = rollElixirValue(effect.effectType, effect.grade);
      const isPercent = isElixirPercent(effect.effectType, effect.grade);
      const item: ElixirItemDefinition = {
        itemType: "丹药",
        name: entry?.name ?? "未命名丹药",
        desc: entry?.desc ?? "",
        grade: effect.grade,
        count,
        effectType: effect.effectType,
        effects: { value, isPercent },
      };
      return { ...empty, items: [item] };
    }

    case "statBonus":
      return { ...empty, statBonus: { ...effect.stats } };

    case "treasure": {
      const grade = effect.grade;
      const fn = rollTreasureFunction(grade);
      const se = rollTreasureSpecialEffect(grade);
      // 仙品 / 神品：取命名法宝的 name/intro；其余品阶用通用命名池。
      const nameDesc = se != null
        ? { name: se.name, desc: se.intro }
        : pickRandom(GENERIC_TREASURE_NAME_TABLE[grade] ?? GENERIC_TREASURE_NAME_TABLE.下品);
      const item: TreasureItemDefinition = {
        itemType: "法宝",
        name: nameDesc.name,
        desc: nameDesc.desc,
        grade,
        count: 1,
        function: fn,
        ...(se != null ? { specialEffect: se } : {}),
      };
      return { ...empty, items: [item] };
    }

    case "gongfa": {
      const grade = effect.grade;
      const fn = rollGongfaFunction(effect.system, grade);
      // 根据战斗效果的 scalingStat 决定属性加成；效果无属性加成时回退随机。
      const bonusName = pickGongfaBonusName(fn);
      const bonus = { [bonusName]: rollGradeAttriValue(bonusName, grade, GONGFA_GRADE_ATTRI_TABLE) };
      const item: GongfaItemDefinition = {
        itemType: "功法",
        name: fn.name,
        desc: fn.intro,
        grade,
        count: 1,
        bonus,
        system: effect.system,
        mastery: 1,
        function: fn,
      };
      return { ...empty, items: [item] };
    }
  }
}

// ---------------------------------------------------------------------------
// 展示文案（供 TraitDetailModal 等UI使用）
// ---------------------------------------------------------------------------

/**
 * 生成天赋效果的中文展示文案（说明类别与量级，不含随机 roll 结果）。
 *
 * @param effect 天赋效果；为空时返回空串。
 * @returns 展示文案。
 */
export function describeTraitEffect(effect: TraitEffect | undefined | null): string {
  if (!effect) return "";
  switch (effect.kind) {
    case "spiritStones":
      return `开局获得 ${effect.count} 灵石`;
    case "materials":
      return `开局获得 ${effect.grade}${effect.category} ×${effect.count}`;
    case "elixir": {
      const name = ELIXIR_NAME_TABLE[effect.effectType]?.[effect.grade]?.name ?? effect.effectType;
      return `开局获得 ${effect.grade}丹药「${name}」×${effect.count}`;
    }
    case "statBonus": {
      const parts = Object.entries(effect.stats).map(
        ([k, v]) => `${PRIMARY_STAT_KEY_TO_ZH[k as PrimaryStatKey] ?? k}+${v}`,
      );
      return `主属性加成：${parts.join("、")}`;
    }
    case "treasure": {
      const named = effect.grade === "仙品" || effect.grade === "神品";
      return `开局获得一把${effect.grade}法宝`;
    }
    case "gongfa":
      return `开局获得一本${effect.system}·${effect.grade}功法`;
  }
}
