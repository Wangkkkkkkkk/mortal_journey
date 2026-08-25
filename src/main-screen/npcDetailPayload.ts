import { Character } from "../role_core/Character";
import { Npc } from "../role_core/Npc";

function favorabilityLabel(f: number): string {
  if (f >= 80) return "生死之交";
  if (f >= 60) return "亲密无间";
  if (f >= 40) return "亲密";
  if (f >= 20) return "朋友";
  if (f >= -19) return "普通";
  if (f >= -39) return "疏离";
  if (f >= -59) return "厌恶";
  if (f >= -79) return "仇视";
  return "不死不休";
}

/** 好感度绝对值上限（与 `Npc.mergeFromAi` 的钳制范围一致）。 */
const FAVOR_MAX = 99;

/**
 * 好感度双向条的几何参数。
 *
 * 条形以中点为 0：正向好感向右填充，负向敌意向左填充，各占半幅。
 * 因此 `widthPct` 最大为 50（占整条的一半），`side` 决定从中点向哪侧延伸。
 */
export interface FavorBarGeometry {
  /** 填充宽度占整条的百分比（0–50）。 */
  widthPct: number;
  /** 填充方向：正向好感向右，负向敌意向左。 */
  side: "positive" | "negative";
}

/**
 * 计算好感度双向条的填充几何。
 *
 * @param favorability 好感度（-99~99）。
 * @return 填充宽度与方向；好感为 0 时宽度为 0（中点无填充）。
 */
export function favorBarGeometry(favorability: number): FavorBarGeometry {
  const f = Number.isFinite(favorability) ? favorability : 0;
  const clamped = Math.max(-FAVOR_MAX, Math.min(FAVOR_MAX, f));
  return {
    widthPct: (Math.abs(clamped) / FAVOR_MAX) * 50,
    side: clamped < 0 ? "negative" : "positive",
  };
}

export { favorabilityLabel };

export function buildNpcListEntryPayload(npc: Npc): {
  title: string;
  subtitle: string;
  hpPct: number;
  mpPct: number;
  isDead: boolean;
  favorability: number;
  favorLabel: string;
  relation: string;
} {
  return {
    title: npc.displayName,
    subtitle: `${npc.identity} · ${Character.formatRealm(npc.realm)}`,
    relation: npc.relation,
    hpPct: npc.maxHp > 0 ? Math.round((npc.currentHp / npc.maxHp) * 100) : 0,
    mpPct: npc.maxMp > 0 ? Math.round((npc.currentMp / npc.maxMp) * 100) : 0,
    isDead: npc.isDead,
    favorability: npc.favorability,
    favorLabel: favorabilityLabel(npc.favorability),
  };
}
