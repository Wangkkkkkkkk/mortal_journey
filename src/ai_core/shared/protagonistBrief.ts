/**
 * G1 共享主角状态契约（canonical brief）。
 *
 * 所有 pipeline 使用同一份序列化器，通过 opts 区分 revealNumbers / highlightGongfa / includeOrigin。
 * 消灭 story/state/cultivation/finale 四份重复的 format 函数。
 */

import type {
  ProtagonistPlayInfo,
  EquippedSlotsState,
  GongfaSlotsState,
  InventoryStackItem,
  NarrationPerson,
} from "../../role_core/types/playInfo";
import type { WorldLocation } from "../../role_core/types/worldLocation";
import type { WorldTime } from "../../role_core/worldTime";
import { formatWorldLocationDash } from "../../role_core/types/worldLocation";
import { formatWorldTimeZhDisplay } from "../../role_core/worldTime";
import { describeNextBreakthrough } from "../../role_core/realmUtils";

export interface BriefContext {
  worldLocation?: WorldLocation | null;
  worldTime?: WorldTime;
  npcSnapshot?: string;
}

export interface BriefOptions {
  revealNumbers: boolean;
  highlightGongfa?: string;
  includeOrigin?: boolean;
}

function narrationPersonLine(person: NarrationPerson): string {
  switch (person) {
    case "first":
      return "叙事人称：第一人称——以主角口吻，用「我」「我们」等叙述。";
    case "third":
      return "叙事人称：第三人称——以旁观视角写主角，用「他/她」或其姓名指代主角。";
    case "second":
    default:
      return "叙事人称：第二人称——面向玩家，将主角作为「你」「您」书写。";
  }
}

export function formatEquippedSlots(slots: EquippedSlotsState): string {
  const lines: string[] = [];
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    if (!slot) {
      lines.push(`法宝${i + 1}：无`);
    } else {
      lines.push(`法宝${i + 1}：${slot.name}（${slot.grade}）${slot.desc ? "—" + slot.desc : ""}`);
    }
  }
  return lines.join("\n");
}

export function formatGongfaSlots(
  slots: GongfaSlotsState,
  opts: { highlight?: string; revealMastery?: boolean } = {},
): string {
  const lines: string[] = [];
  for (let i = 0; i < slots.length; i++) {
    const g = slots[i];
    if (!g) continue;
    const mastery = g.mastery ?? 1;
    const marker = opts.highlight && g.name === opts.highlight ? " ← 当前修炼" : "";
    if (opts.revealMastery) {
      const exp = g.masteryExp ?? 0;
      const expStr = mastery < 10 ? `，熟练度${exp}` : "";
      lines.push(`功法：${g.name}（${g.grade}，第${mastery}层/10层${expStr}）${marker}`);
    } else {
      lines.push(`功法：${g.name}（${g.grade}）${marker}`);
    }
  }
  return lines.length > 0 ? lines.join("\n") : "无";
}

export function formatInventorySlots(slots: Array<InventoryStackItem | null>): string {
  const items = slots.filter((s): s is InventoryStackItem => s !== null);
  if (items.length === 0) return "无";
  return items
    .map((item) => {
      if ("type" in item && item.type === "灵石") {
        return `${item.name}×${item.count}`;
      }
      const d = item as { name?: string; grade?: string; count?: number; desc?: string };
      const grade = d.grade ? `（${d.grade}）` : "";
      return `${d.name || "未知物品"}${grade}×${d.count || 1}`;
    })
    .join("、");
}

export function buildProtagonistBrief(
  p: ProtagonistPlayInfo,
  ctx: BriefContext,
  opts: BriefOptions,
): string {
  const locationLine = ctx.worldLocation
    ? `\n当前所在地点：${formatWorldLocationDash(ctx.worldLocation)}`
    : "";
  const timeLine = ctx.worldTime
    ? `\n当前世界时间：${formatWorldTimeZhDisplay(ctx.worldTime)}`
    : "";

  const lines: string[] = [
    `姓名：${p.displayName}`,
    `性别：${p.gender || "—"}`,
    narrationPersonLine(p.narrationPerson),
    `境界：${p.realm.major}${p.realm.minor}${p.realmComplete ? "·圆满" : ""}`,
    `修为状态：${p.realmComplete ? "修为已圆满" : "修为未圆满"}`,
  ];

  if (opts.revealNumbers) {
    lines.push(
      `突破状态：${p.realmComplete ? (p.breakthroughStatus === "in_quest" ? "突破任务进行中" : describeNextBreakthrough(p.realm.major, p.realm.minor)) : "修为未圆满"}`,
      `当前血量：${p.currentHp}/${p.maxHp}`,
      `当前法力：${p.currentMp}/${p.maxMp}`,
      `灵根：${p.linggen.join("") || "无"}`,
    );
    if (p.age > 0) lines.push(`年龄：${p.age} / 寿元：${p.shouyuan}`);
  } else {
    lines.push(`灵根：${p.linggen.join("") || "无"}`);
    if (p.age > 0) lines.push(`年龄：${p.age}岁`);
  }

  lines.push(locationLine, timeLine);

  if (opts.includeOrigin) {
    const origin = p.originStory?.trim() || "—";
    const birthPlace = p.birthPlace ? formatWorldLocationDash(p.birthPlace) : "—";
    lines.push(
      "",
      "【出身背景】",
      `出身地点：${birthPlace}`,
      origin,
    );
  }

  lines.push(
    "",
    "【装备】",
    formatEquippedSlots(p.equippedSlots),
    "",
    "【功法】",
    formatGongfaSlots(p.gongfaSlots, {
      highlight: opts.highlightGongfa,
      revealMastery: opts.revealNumbers,
    }),
    "",
    "【储物袋】",
    formatInventorySlots(p.inventorySlots),
  );

  if (ctx.npcSnapshot?.trim()) {
    lines.push("", "【当前场景NPC】", ctx.npcSnapshot.trim());
  }

  return lines.join("\n");
}
