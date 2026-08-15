/**
 * @fileoverview 新 NPC 自动生成立绘编排（受 useImageApiConfig 的 autoGenerate 开关控制）。
 *
 * 由 npcStore.applyNpcUpdates 的调用方在拿到「新建 NPC 列表」后调用：fire-and-forget，
 * 串行生成（模块级 Promise 链，避免并发触发 Ark 限流），成功即回写 avatarUrl 并落盘，
 * 失败仅 gameLog.warn，绝不阻塞剧情 / 状态管线。
 */

import { gameLog } from "../log/gameLog";
import { npcStore } from "../role_core/npcStore";
import { locationImageStore } from "../role_core/locationImageStore";
import { writeActiveSave } from "../save/gameSave";
import { generateNpcPortrait, generateLocationBackground } from "./imageGenerate";
import { isAutoGenerateEnabled, isImageApiConfigured } from "./useImageApiConfig";
import type { Npc } from "../role_core/Npc";
import type { WorldLocation } from "../role_core/types/worldLocation";
import { formatWorldLocation } from "../role_core/types/worldLocation";

/** 串行执行队列，保证任意时刻只有一张立绘在生成。 */
let _queue: Promise<void> = Promise.resolve();

/**
 * 为「本次新建的 NPC」按需自动生成立绘。
 *
 * 守卫：未配置文生图 / 未开启自动生成 / 列表为空 → 直接返回。
 * 仅处理尚无 avatarUrl 的新 NPC；逐个串行生成，成功后 setAvatarUrl + setNpc + writeActiveSave。
 *
 * @param created 本次 applyNpcUpdates 中新建的 NPC 列表。
 */
export function autoGeneratePortraits(created: Npc[]): void {
  if (!created || created.length === 0) return;
  if (!isImageApiConfigured() || !isAutoGenerateEnabled()) return;
  const targets = created.filter((n) => !n.avatarUrl);
  if (targets.length === 0) return;

  _queue = _queue
    .then(() => runPortraitBatch(targets))
    .catch((err) => {
      gameLog.warn("[图 自动] 批次异常：" + (err instanceof Error ? err.message : String(err)));
    });
}

async function runPortraitBatch(list: Npc[]): Promise<void> {
  for (const npc of list) {
    try {
      const dataUrl = await generateNpcPortrait(npc);
      npc.addPortraitCandidate(dataUrl);
      npcStore.setNpc(npc);
      npcStore.refresh();
      writeActiveSave();
      gameLog.info(`[图 自动] 已为「${npc.displayName}」生成立绘`);
    } catch (err) {
      gameLog.warn(
        `[图 自动]「${npc.displayName}」立绘生成失败：` +
          (err instanceof Error ? err.message : String(err)),
      );
    }
  }
}

// ── 地点背景自动生成 ─────────────────────────────────────────────────────────

/** 串行执行队列，与 NPC 立绘共享同一队列避免并发。 */

/**
 * 为「新发现的地点」按需自动生成背景图。
 *
 * 守卫：未配置文生图 / 未开启自动生成 / 列表为空 → 直接返回。
 * 仅处理尚无背景图的地点；逐个串行生成。
 *
 * @param locations 新出现的地点列表。
 * @param realmMajor 当前主角境界（用于 prompt 氛围）。
 */
export function autoGenerateLocationBackgrounds(
  locations: WorldLocation[],
  realmMajor?: string,
): void {
  if (!locations || locations.length === 0) return;
  if (!isImageApiConfigured() || !isAutoGenerateEnabled()) return;
  const targets = locations.filter((loc) => !locationImageStore.hasAnyCandidate(loc));
  if (targets.length === 0) return;

  _queue = _queue
    .then(() => runLocationBatch(targets, realmMajor))
    .catch((err) => {
      gameLog.warn("[图 自动] 地点批次异常：" + (err instanceof Error ? err.message : String(err)));
    });
}

async function runLocationBatch(
  list: WorldLocation[],
  realmMajor?: string,
): Promise<void> {
  for (const loc of list) {
    try {
      const dataUrl = await generateLocationBackground(loc, realmMajor);
      locationImageStore.addCandidate(loc, dataUrl);
      locationImageStore.refresh();
      writeActiveSave();
      gameLog.info(`[图 自动] 已为地点「${formatWorldLocation(loc)}」生成背景`);
    } catch (err) {
      gameLog.warn(
        `[图 自动] 地点「${formatWorldLocation(loc)}」背景生成失败：` +
          (err instanceof Error ? err.message : String(err)),
      );
    }
  }
}
