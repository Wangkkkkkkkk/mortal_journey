/**
 * @fileoverview 图片 Blob 外置存储（IndexedDB）。
 *
 * 目的：把主角/NPC/地点的 base64 图片移出 localStorage（配额 ~5-10MB），存入
 * IndexedDB（配额数百 MB），存档 JSON 里只留短引用 id（`img_...`）。
 *
 * 设计要点：
 * - **运行态仍是 dataURL**：`avatarUrl` / `avatarCandidates` 在内存里保持 base64，
 *   所有 UI 消费方无需改动；本模块只负责"注册 / 解析 / 序列化映射"。
 * - **写档保持同步**：`writeActiveSave()` 被大量同步调用，不能改异步。因此图片在
 *   创建时（生成/上传进入 store 方法那一刻）就 fire-and-forget 写入 IDB，并同步登记
 *   `dataURL → id` 反向映射；序列化时只需同步查表。
 * - **读档异步水合**：`restoreSave` 同步填充运行时（此时图片字段是 id），随后
 *   `hydrateRuntimeImages()` 异步把 id 解析回 dataURL 写回运行时对象。
 *
 * id 判定：`data:` / `http(s):` 开头视为内联图片（保持原样），其余视为引用 id。
 */

import { gameLog } from "../log/gameLog";

const DB_NAME = "mj_image_blobs";
const DB_VERSION = 1;
const STORE = "blobs";

let _dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("当前环境不支持 IndexedDB"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  _dbPromise.catch(() => {
    _dbPromise = null;
  });
  return _dbPromise;
}

/** 内存映射：dataURL → id（写档查表用）。 */
const dataUrlToId = new Map<string, string>();
/** 内存映射：id → dataURL（水合命中缓存用）。 */
const idToDataUrl = new Map<string, string>();

let idCounter = 0;

function generateId(): string {
  idCounter += 1;
  return `img_${Date.now().toString(36)}_${idCounter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** 是否内联图片 URL（data:/http）；否则视为引用 id。 */
export function isInlineImageUrl(u: string): boolean {
  const s = (u || "").trim();
  if (!s) return false;
  return s.startsWith("data:") || s.startsWith("http:") || s.startsWith("https:");
}

/** 是否可注册的 base64 dataURL（仅 data: 需要/值得写入 IndexedDB）。 */
function isRegistrableDataUrl(u: string): boolean {
  const s = (u || "").trim();
  return s.startsWith("data:");
}

function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return fetch(dataUrl).then((r) => r.blob());
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function putBlob(id: string, dataUrl: string): Promise<void> {
  return dataUrlToBlob(dataUrl).then((blob) => {
    return openDb().then((db) => {
      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put(blob, id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    });
  });
}

function getBlob(id: string): Promise<Blob | undefined> {
  return openDb().then((db) => {
    return new Promise<Blob | undefined>((resolve, reject) => {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result as Blob | undefined);
      req.onerror = () => reject(req.error);
    });
  });
}

/**
 * 注册一张 dataURL：同步生成 id 并登记双向映射，IDB 写入 fire-and-forget。
 * 幂等：同一 dataURL 返回同一 id。返回 id（内联图片专用；非内联输入原样返回）。
 */
export function registerImage(dataUrl: string): string {
  const u = (dataUrl || "").trim();
  if (!u) return u;
  if (!isRegistrableDataUrl(u)) return u;
  const existing = dataUrlToId.get(u);
  if (existing) return existing;

  const id = generateId();
  dataUrlToId.set(u, id);
  idToDataUrl.set(id, u);
  putBlob(id, u).catch((err) => {
    gameLog.warn(`[图片存储] Blob 写入失败 ${id}：` + (err instanceof Error ? err.message : String(err)));
  });
  return id;
}

/**
 * 注册一张 dataURL 并等待 IDB 写入完成（导入/旧档迁移等需要保证持久化的场景）。
 * 幂等：已注册则直接返回既有 id。
 */
export function registerImageAwait(dataUrl: string): Promise<string> {
  const u = (dataUrl || "").trim();
  if (!u) return Promise.resolve(u);
  if (!isRegistrableDataUrl(u)) return Promise.resolve(u);
  const existing = dataUrlToId.get(u);
  if (existing) return Promise.resolve(existing);

  const id = generateId();
  dataUrlToId.set(u, id);
  idToDataUrl.set(id, u);
  return putBlob(id, u)
    .then(() => id)
    .catch((err) => {
      gameLog.warn(`[图片存储] Blob 写入失败 ${id}：` + (err instanceof Error ? err.message : String(err)));
      return id;
    });
}

/**
 * 解析图片字段：id → dataURL（缓存优先，未命中查 IDB）。缺失返回 ""。
 * 内联图片原样返回；空串原样返回。
 */
export async function resolveImageField(u: string): Promise<string> {
  const s = (u || "").trim();
  if (!s) return s;
  if (isInlineImageUrl(s)) {
    registerImage(s);
    return s;
  }
  const cached = idToDataUrl.get(s);
  if (cached) return cached;
  try {
    const blob = await getBlob(s);
    if (!blob) {
      gameLog.warn(`[图片存储] 引用 ${s} 无对应图片数据，置空（将显示占位头像）。`);
      return "";
    }
    const dataUrl = await blobToDataUrl(blob);
    idToDataUrl.set(s, dataUrl);
    dataUrlToId.set(dataUrl, s);
    return dataUrl;
  } catch (err) {
    gameLog.warn(`[图片存储] 解析失败 ${s}：` + (err instanceof Error ? err.message : String(err)));
    return "";
  }
}

/** 写档用：把运行时的图片字段转为引用 id（dataURL→id；已是 id 原样返回）。 */
export function imageRefOf(u: string): string {
  const s = (u || "").trim();
  if (!s) return s;
  if (isInlineImageUrl(s)) {
    return dataUrlToId.get(s) || s;
  }
  return s;
}

/** 列出当前会话已注册的所有引用 id（供清理统计用）。 */
export function registeredImageIds(): Set<string> {
  return new Set(idToDataUrl.keys());
}

/**
 * 清理 IDB 中不在 `keep` 集合内的 Blob。
 * @param keep 仍需保留的 id 集合（通常为当前所有存档引用的并集）。
 */
export async function pruneBlobs(keep: Set<string>): Promise<void> {
  try {
    const db = await openDb();
    const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).getAllKeys();
      req.onsuccess = () => resolve((req.result as IDBValidKey[]) || []);
      req.onerror = () => reject(req.error);
    });
    const toDelete = keys.filter((k) => !keep.has(String(k)));
    if (toDelete.length === 0) return;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      for (const k of toDelete) tx.objectStore(STORE).delete(k);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    gameLog.warn(`[图片存储] 清理 Blob 失败：` + (err instanceof Error ? err.message : String(err)));
  }
}

/** 清空全部 Blob（清空所有存档时使用）。 */
export async function clearAllBlobs(): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    dataUrlToId.clear();
    idToDataUrl.clear();
  } catch (err) {
    gameLog.warn(`[图片存储] 清空 Blob 失败：` + (err instanceof Error ? err.message : String(err)));
  }
}
