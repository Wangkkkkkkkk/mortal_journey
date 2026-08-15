/**
 * @fileoverview 地点背景图像状态管理（单例 store）。
 *
 * 与 NPC 立绘管理对齐：每个地点（以 dash-format WorldLocation 为 key）维护
 * 当前背景图（avatarUrl）和候选池（avatarCandidates），支持生成/上传/切换/删除。
 * 存档序列化通过 gameSave 模块统一处理。
 */

import { ref, triggerRef } from "vue";
import type { WorldLocation } from "./types/worldLocation";
import { formatWorldLocationDash } from "./types/worldLocation";
import { registerImage } from "../save/imageBlobStore";

/** 单个地点的图像数据。 */
export interface LocationImageData {
  avatarUrl: string;
  avatarCandidates: string[];
}

/** 序列化格式：Map → JSON-safe 的 Record。 */
export type LocationImagesSerialData = Record<string, LocationImageData>;

function useLocationImageStore() {
  const images = ref(new Map<string, LocationImageData>());

  // ── key 工具 ─────────────────────────────────────────────────────────────

  function locKey(loc: WorldLocation): string {
    return formatWorldLocationDash(loc);
  }

  // ── 读写 ─────────────────────────────────────────────────────────────────

  function get(loc: WorldLocation): LocationImageData | undefined {
    return images.value.get(locKey(loc));
  }

  function getByKey(key: string): LocationImageData | undefined {
    return images.value.get(key);
  }

  // ── 候选池操作 ────────────────────────────────────────────────────────────

  function addCandidate(loc: WorldLocation, url: string): void {
    const u = url != null ? String(url) : "";
    if (!u) return;
    registerImage(u);
    const key = locKey(loc);
    let data = images.value.get(key);
    if (!data) {
      data = { avatarUrl: u, avatarCandidates: [u] };
    } else {
      if (data.avatarCandidates.includes(u)) {
        data.avatarUrl = u;
      } else {
        data.avatarCandidates = [...data.avatarCandidates, u];
        data.avatarUrl = u;
      }
    }
    images.value.set(key, data);
  }

  function selectCandidate(loc: WorldLocation, url: string): void {
    const data = images.value.get(locKey(loc));
    if (!data) return;
    if (data.avatarCandidates.includes(url)) {
      data.avatarUrl = url;
    }
  }

  function removeCandidate(loc: WorldLocation, url: string): void {
    const data = images.value.get(locKey(loc));
    if (!data) return;
    data.avatarCandidates = data.avatarCandidates.filter((u) => u !== url);
    if (data.avatarUrl === url) {
      data.avatarUrl = data.avatarCandidates[0] ?? "";
    }
    if (data.avatarCandidates.length === 0 && !data.avatarUrl) {
      images.value.delete(locKey(loc));
    } else {
      images.value.set(locKey(loc), data);
    }
  }

  function hasAnyCandidate(loc: WorldLocation): boolean {
    const data = images.value.get(locKey(loc));
    return !!data && data.avatarCandidates.length > 0;
  }

  /** 强制触发所有读取 images 的渲染更新（异步背景生成后调用，见 autoPortrait）。 */
  function refresh(): void {
    triggerRef(images);
  }

  // ── 序列化 ─────────────────────────────────────────────────────────────────

  function serialize(): LocationImagesSerialData {
    const out: LocationImagesSerialData = {};
    for (const [key, data] of images.value) {
      out[key] = {
        avatarUrl: data.avatarUrl,
        avatarCandidates: [...data.avatarCandidates],
      };
    }
    return out;
  }

  function restore(data: LocationImagesSerialData | null | undefined): void {
    images.value.clear();
    if (!data || typeof data !== "object") return;
    for (const key of Object.keys(data)) {
      const entry = data[key];
      if (!entry || !Array.isArray(entry.avatarCandidates)) continue;
      images.value.set(key, {
        avatarUrl: typeof entry.avatarUrl === "string" ? entry.avatarUrl : "",
        avatarCandidates: entry.avatarCandidates.filter((u): u is string => typeof u === "string"),
      });
    }
  }

  function clearAll(): void {
    images.value.clear();
  }

  return {
    images,
    get,
    getByKey,
    addCandidate,
    selectCandidate,
    removeCandidate,
    hasAnyCandidate,
    refresh,
    serialize,
    restore,
    clearAll,
  };
}

export const locationImageStore = useLocationImageStore();
