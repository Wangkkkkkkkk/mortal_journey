/**
 * @fileoverview 存档服务：自动存档的写入/读取/恢复/重置。
 *
 * 设计要点：
 *   - **自包含纯 JSON 载荷**：单 id 对应单个 blob，聚合四个数据源
 *     （主角 / NPC / 世界地图 / 剧情），无类实例、无 Map，天然可作云端「文档」。
 *   - **存储后端抽象** `SaveBackend`：默认 localStorage，日后云存档只需替换实现。
 *   - **自动存档**：本模块不提供 UI，仅暴露 `createSave` / `writeActiveSave` /
 *     `restoreSave` / `resetAllGameState`，由 `App.vue`、`useOpeningStory`、
 *     `StoryChatPanel` 在关键节点调用。
 *
 * 存档唯一标识：`${主角名}-${YYYYMMDD-HHMMSS}`。同一存档在会话中原地更新；
 * 开新人生才生成新存档。
 */

import type { FateChoiceResult, DifficultyLevel } from "../fate_choice/types";
import type { NpcPlayInfo, ProtagonistPlayInfo } from "../role_core/types/playInfo";
import type { WorldMapSerialData } from "../role_core/worldMapStore";
import type { WorldLocation } from "../role_core/types/worldLocation";
import { formatWorldLocation } from "../role_core/types/worldLocation";
import { Protagonist, protagonist } from "../role_core/Protagonist";
import { npcStore } from "../role_core/npcStore";
import { worldMapStore } from "../role_core/worldMapStore";
import { locationImageStore, type LocationImagesSerialData } from "../role_core/locationImageStore";
import { storyStore, type StorySerialData } from "../role_core/storyStore";
import { memoryArchiveStore, type MemoryArchiveSerialData } from "../role_core/memoryArchive";
import { plotPlanStore, type PlotPlanSerialData } from "../role_core/plotPlanStore";
import { worldEvolutionStore, type WorldEvolutionSerialData } from "../role_core/worldEvolutionStore";
import { gameLog } from "../log/gameLog";
import {
  imageRefOf,
  isInlineImageUrl,
  registerImageAwait,
  resolveImageField,
  pruneBlobs,
  clearAllBlobs,
} from "./imageBlobStore";

export const SAVE_VERSION = 1;
export const SAVE_INDEX_KEY = "MJ_SAVES_INDEX_V1";
export const SAVE_PREFIX = "MJ_SAVE_V1:";
/** 当前活动存档 id 的本地持久化键——用于刷新网页后自动恢复到当前存档。 */
export const ACTIVE_SAVE_ID_KEY = "MJ_ACTIVE_SAVE_ID_V1";

// ---------------------------------------------------------------------------
// 活动存档 id 的持久化（刷新续玩）
// ---------------------------------------------------------------------------

function persistActiveId(id: string): void {
  try {
    localStorage.setItem(ACTIVE_SAVE_ID_KEY, id);
  } catch {
    /* ignore */
  }
}

/** 清除本地持久化的活动存档指针（返回标题=退出当前存档时调用）。 */
export function clearActiveId(): void {
  try {
    localStorage.removeItem(ACTIVE_SAVE_ID_KEY);
  } catch {
    /* ignore */
  }
}

/** 读取本地持久化的活动存档 id（无则 null）。 */
export function getPersistedActiveId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_SAVE_ID_KEY);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 存储后端抽象（云存档替换点）
// ---------------------------------------------------------------------------

export interface SaveBackend {
  read(id: string): string | null;
  write(id: string, blob: string): void;
  remove(id: string): void;
}

const localStorageBackend: SaveBackend = {
  read(id) {
    try {
      return localStorage.getItem(SAVE_PREFIX + id);
    } catch {
      return null;
    }
  },
  write(id, blob) {
    try {
      localStorage.setItem(SAVE_PREFIX + id, blob);
    } catch (e) {
      gameLog.error("[GameSave] 写入存档失败：" + (e instanceof Error ? e.message : String(e)));
    }
  },
  remove(id) {
    try {
      localStorage.removeItem(SAVE_PREFIX + id);
    } catch {
      /* ignore */
    }
  },
};

let backend: SaveBackend = localStorageBackend;

/** 替换存储后端（云存档接入点）。 */
export function setSaveBackend(b: SaveBackend): void {
  backend = b;
}

// ---------------------------------------------------------------------------
// 存档载荷与索引
// ---------------------------------------------------------------------------

/**
 * 完整存档载荷。占位存档（开局 AI 尚未完成）仅含 `fateChoice` 并标记 `incomplete`，
 * 其余字段缺省；读档时由 {@link isCompleteSave} 判定是否直接恢复。
 */
export interface MjSavePayload {
  version: number;
  fateChoice: FateChoiceResult;
  createdAt: number;
  updatedAt: number;
  /** 占位标记：开局 AI 未完成时写入；完整存档不带此字段。 */
  incomplete?: true;
  /** 终结标记：主角死亡（寿尽/战败）后写入；该存档不可继续游玩。 */
  ended?: { reason: string; at: number };
  protagonist?: ProtagonistPlayInfo;
  npcs?: NpcPlayInfo[];
  worldMap?: WorldMapSerialData;
  locationImages?: LocationImagesSerialData;
  story?: StorySerialData;
  /** 回忆档案（全量回合索引）；懒回填：老存档缺省视为空。 */
  memoryArchive?: MemoryArchiveSerialData;
  /** 剧情规划树（当前章任务/事件/镜头/延续）；懒回填：老存档缺省视为空。 */
  plotPlan?: PlotPlanSerialData;
  /** 世界演变状态（后台世界事件池）；懒回填：老存档缺省视为空。 */
  worldEvolution?: WorldEvolutionSerialData;
}

export interface SaveIndexEntry {
  id: string;
  /** 主角名。 */
  name: string;
  updatedAt: number;
  createdAt: number;
  /** 预览：境界（如「练气初期」）。 */
  realm?: string;
  /** 预览：当前地点。 */
  location?: string;
  /** 终结标记：主角已死亡，存档不可继续。 */
  ended?: boolean;
  /** 导入标记：从外部 JSON 导入的存档；游玩一次后由 writeActiveSave 重写即消失。 */
  imported?: boolean;
  /** 导入时刻（ms）。 */
  importedAt?: number;
}

// ---------------------------------------------------------------------------
// 会话内的「活动存档」记账（模块级，供各处无入参调用 writeActiveSave）
// ---------------------------------------------------------------------------

let activeSaveId: string | null = null;
let activeCreatedAt: number = 0;
let activeFateChoice: FateChoiceResult | null = null;
/** 活动存档是否已终结。终结后禁止任何自动存档覆盖 ended 标记。 */
let activeEnded = false;

/** 设置当前会话的活动存档（读档时调用）。 */
export function setActiveSave(id: string, fateChoice: FateChoiceResult, createdAt: number): void {
  activeSaveId = id;
  activeFateChoice = fateChoice;
  activeCreatedAt = createdAt;
  activeEnded = isEndedSave(readSave(id));
  persistActiveId(id);
}

export function hasActiveSave(): boolean {
  return activeSaveId !== null;
}

/** 读取当前活动存档的难度等级；无活动存档或缺省时回退为「正常」。 */
export function getActiveDifficulty(): DifficultyLevel {
  return activeFateChoice?.basics?.difficulty ?? "正常";
}

// ---------------------------------------------------------------------------
// 索引读写
// ---------------------------------------------------------------------------

function readIndexRaw(): SaveIndexEntry[] {
  try {
    const raw = localStorage.getItem(SAVE_INDEX_KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(arr) ? (arr as SaveIndexEntry[]) : [];
  } catch {
    return [];
  }
}

function writeIndexRaw(arr: SaveIndexEntry[]): void {
  try {
    localStorage.setItem(SAVE_INDEX_KEY, JSON.stringify(Array.isArray(arr) ? arr : []));
  } catch {
    /* ignore */
  }
}

/** 读取存档索引（按 updatedAt 倒序），供 UI 列表使用。 */
export function readSaveIndex(): SaveIndexEntry[] {
  const idx = readIndexRaw().filter((x) => x && x.id);
  idx.sort((a, b) => Number(b?.updatedAt) - Number(a?.updatedAt));
  return idx;
}

function upsertIndex(entry: SaveIndexEntry): void {
  const idx = readIndexRaw();
  const i = idx.findIndex((e) => e && e.id === entry.id);
  if (i >= 0) idx[i] = entry;
  else idx.push(entry);
  writeIndexRaw(idx);
}

// ---------------------------------------------------------------------------
// 序列化 / 反序列化
// ---------------------------------------------------------------------------

function realmPreview(p: ProtagonistPlayInfo): string {
  return (p.realm?.major || "") + (p.realm?.minor || "");
}

function locationPreview(loc: WorldLocation | null | undefined): string {
  return loc ? formatWorldLocation(loc) : "";
}

/** 聚合四个数据源构建完整存档载荷。protagonist 缺省时返回 null。 */
export function serializeAll(now = Date.now()): MjSavePayload | null {
  const p = protagonist.value;
  if (!p || !activeFateChoice) return null;
  return refPayloadImages({
    version: SAVE_VERSION,
    fateChoice: activeFateChoice,
    createdAt: activeCreatedAt || now,
    updatedAt: now,
    protagonist: p.toData(),
    npcs: npcStore.serializeNpcs(),
    worldMap: worldMapStore.serializeWorldMap(),
    locationImages: locationImageStore.serialize(),
    story: storyStore.serializeStory(),
    memoryArchive: memoryArchiveStore.serializeArchive(),
    plotPlan: plotPlanStore.serialize(),
    worldEvolution: worldEvolutionStore.serialize(),
  });
}

// ---------------------------------------------------------------------------
// 图片引用：运行态 dataURL ⇄ 持久化 id（图片 Blob 存 IndexedDB，见 imageBlobStore）
// ---------------------------------------------------------------------------

function refImageField(u: string | undefined): string | undefined {
  return typeof u === "string" ? imageRefOf(u) : u;
}

function refImageList(list: string[] | undefined): string[] | undefined {
  return Array.isArray(list) ? list.map(imageRefOf) : list;
}

function refLocationImages(d: LocationImagesSerialData | undefined): LocationImagesSerialData | undefined {
  if (!d || typeof d !== "object") return d;
  const out: LocationImagesSerialData = {};
  for (const k of Object.keys(d)) {
    const e = d[k];
    out[k] = {
      avatarUrl: imageRefOf(e?.avatarUrl || ""),
      avatarCandidates: Array.isArray(e?.avatarCandidates) ? e.avatarCandidates.map(imageRefOf) : [],
    };
  }
  return out;
}

/** 把载荷中的内联图片字段统一转为引用 id（写档 / 导入用）。 */
function refPayloadImages(payload: MjSavePayload): MjSavePayload {
  return {
    ...payload,
    protagonist: payload.protagonist
      ? {
          ...payload.protagonist,
          avatarUrl: refImageField(payload.protagonist.avatarUrl) as string,
          avatarCandidates: refImageList(payload.protagonist.avatarCandidates),
        }
      : payload.protagonist,
    npcs: payload.npcs?.map((n) => ({
      ...n,
      avatarUrl: refImageField(n.avatarUrl) as string,
      avatarCandidates: refImageList(n.avatarCandidates),
    })),
    locationImages: refLocationImages(payload.locationImages),
  };
}

/** 收集载荷引用的全部图片 id（供清理孤儿 Blob 用）。 */
function collectPayloadImageIds(payload: MjSavePayload): Set<string> {
  const ids = new Set<string>();
  const feed = (u: string | undefined): void => {
    if (typeof u === "string" && u && !isInlineImageUrl(u)) ids.add(u);
  };
  const feedList = (list: string[] | undefined): void => {
    if (Array.isArray(list)) list.forEach(feed);
  };
  feed(payload.protagonist?.avatarUrl);
  feedList(payload.protagonist?.avatarCandidates);
  for (const n of payload.npcs ?? []) {
    feed(n.avatarUrl);
    feedList(n.avatarCandidates);
  }
  for (const k of Object.keys(payload.locationImages ?? {})) {
    const e = payload.locationImages![k];
    feed(e?.avatarUrl);
    feedList(e?.avatarCandidates);
  }
  return ids;
}

/** 载荷中是否仍含内联 dataURL 图片（旧格式存档判断，用于决定是否重写迁移）。 */
export function payloadHasInlineImages(payload: MjSavePayload): boolean {
  const has = (u: string | undefined): boolean => typeof u === "string" && u.startsWith("data:");
  const hasList = (l: string[] | undefined): boolean => !!l && l.some((u) => has(u));
  if (has(payload.protagonist?.avatarUrl) || hasList(payload.protagonist?.avatarCandidates)) return true;
  for (const n of payload.npcs ?? []) {
    if (has(n.avatarUrl) || hasList(n.avatarCandidates)) return true;
  }
  for (const k of Object.keys(payload.locationImages ?? {})) {
    const e = payload.locationImages![k];
    if (has(e?.avatarUrl) || hasList(e?.avatarCandidates)) return true;
  }
  return false;
}

/** 把载荷中内联 dataURL 全部注册进 IndexedDB（导入 / 旧档迁移用）。 */
async function registerPayloadImages(payload: MjSavePayload): Promise<void> {
  const jobs: Promise<unknown>[] = [];
  const feed = (u: string | undefined): void => {
    if (typeof u === "string" && isInlineImageUrl(u)) jobs.push(registerImageAwait(u));
  };
  const feedList = (list: string[] | undefined): void => {
    if (Array.isArray(list)) list.forEach(feed);
  };
  feed(payload.protagonist?.avatarUrl);
  feedList(payload.protagonist?.avatarCandidates);
  for (const n of payload.npcs ?? []) {
    feed(n.avatarUrl);
    feedList(n.avatarCandidates);
  }
  for (const k of Object.keys(payload.locationImages ?? {})) {
    const e = payload.locationImages![k];
    feed(e?.avatarUrl);
    feedList(e?.avatarCandidates);
  }
  await Promise.all(jobs);
}

/**
 * 异步水合：把运行时对象中的图片引用 id 解析回 dataURL。
 * 在 `restoreSave` 之后、挂载主界面之前调用（App.vue）。
 * 兼容旧档：发现内联 dataURL 时注册进 IDB（幂等）。
 */
export async function hydrateRuntimeImages(): Promise<void> {
  const p = protagonist.value;
  if (p) {
    p.avatarUrl = await resolveImageField(p.avatarUrl);
    const cands: string[] = [];
    for (const c of p.avatarCandidates) cands.push(await resolveImageField(c));
    p.avatarCandidates = cands;
    Protagonist.notifyChanged();
  }
  for (const npc of npcStore.allNpcs()) {
    npc.avatarUrl = await resolveImageField(npc.avatarUrl);
    const cands: string[] = [];
    for (const c of npc.avatarCandidates) cands.push(await resolveImageField(c));
    npc.avatarCandidates = cands;
  }
  const images = locationImageStore.images.value;
  for (const [key, data] of [...images.entries()]) {
    const avatarUrl = await resolveImageField(data.avatarUrl);
    const cands: string[] = [];
    for (const c of data.avatarCandidates) cands.push(await resolveImageField(c));
    images.set(key, { avatarUrl, avatarCandidates: cands });
  }
}

/** 导出用：把载荷中的引用 id 解析回内联 dataURL，使导出文件自包含。 */
export async function embedPayloadImages(payload: MjSavePayload): Promise<MjSavePayload> {
  const field = async (u: string | undefined): Promise<string | undefined> =>
    typeof u === "string" ? resolveImageField(u) : u;
  const list = async (arr: string[] | undefined): Promise<string[] | undefined> =>
    Array.isArray(arr) ? Promise.all(arr.map((u) => resolveImageField(u))) : arr;

  const protagonistInfo = payload.protagonist
    ? {
        ...payload.protagonist,
        avatarUrl: (await field(payload.protagonist.avatarUrl)) as string,
        avatarCandidates: await list(payload.protagonist.avatarCandidates),
      }
    : payload.protagonist;

  const npcs = payload.npcs
    ? await Promise.all(
        payload.npcs.map(async (n) => ({
          ...n,
          avatarUrl: (await field(n.avatarUrl)) as string,
          avatarCandidates: await list(n.avatarCandidates),
        })),
      )
    : undefined;

  const locationImages: LocationImagesSerialData | undefined =
    payload.locationImages && typeof payload.locationImages === "object"
      ? Object.fromEntries(
          await Promise.all(
            Object.entries(payload.locationImages).map(async ([k, e]) => [
              k,
              {
                avatarUrl: (await field(e?.avatarUrl)) as string,
                avatarCandidates: (await list(e?.avatarCandidates)) ?? [],
              },
            ]),
          ),
        )
      : payload.locationImages;

  return {
    ...payload,
    protagonist: protagonistInfo,
    npcs,
    locationImages,
  };
}

/**
 * 写入当前活动存档（原地更新）。在 `phase !== "ready"`、无活动存档、无主角时跳过，
 * 避免存入战斗中或半成品状态。
 */
export function writeActiveSave(): void {
  if (!activeSaveId || !activeFateChoice) return;
  if (storyStore.phase.value !== "ready") return;
  if (activeEnded) return; // 已终结存档不再覆盖 ended 标记
  const payload = serializeAll();
  if (!payload || !payload.protagonist || !payload.story) return;
  backend.write(activeSaveId, JSON.stringify(payload));
  upsertIndex({
    id: activeSaveId,
    name: payload.fateChoice.basics.playerName || activeSaveId,
    createdAt: payload.createdAt,
    updatedAt: payload.updatedAt,
    realm: realmPreview(payload.protagonist),
    location: locationPreview(payload.story.worldLocation),
  });
}

/**
 * 标记当前活动存档为已终结（主角死亡：寿尽/战败）。
 * 绕过 `phase === "ready"` 门控——死亡必须落盘。在最近一次完整存档上叠加 `ended`
 * 标记（不重写运行时状态，避免在战斗/生成中途写入半成品数据）。
 */
export function markActiveSaveEnded(reason: string): void {
  if (!activeSaveId) return;
  const existing = readSave(activeSaveId);
  if (!existing) {
    gameLog.warn(`[GameSave] markActiveSaveEnded: 找不到存档 ${activeSaveId}，跳过`);
    return;
  }
  const payload: MjSavePayload = {
    ...existing,
    ended: { reason, at: Date.now() },
  };
  backend.write(activeSaveId, JSON.stringify(payload));
  activeEnded = true;
  const idx = readIndexRaw();
  const i = idx.findIndex((e) => e && e.id === activeSaveId);
  if (i >= 0) {
    idx[i] = { ...idx[i], ended: true };
    writeIndexRaw(idx);
  }
  gameLog.info(`[GameSave] 存档已标记终结：${activeSaveId}（${reason}）`);
}

/**
 * 命运抉择确认时创建存档：生成 id（名+时间），写入占位载荷并登记索引。
 * 开局 AI 完成后由 `writeActiveSave` 写入完整载荷。
 *
 * @returns 新建存档 id。
 */
export function createSave(fc: FateChoiceResult): string {
  const name = (fc.basics?.playerName || "").trim() || "未命名";
  const id = composeSaveId(name);
  const now = Date.now();
  activeSaveId = id;
  activeCreatedAt = now;
  activeFateChoice = fc;
  activeEnded = false;
  const placeholder: MjSavePayload = {
    version: SAVE_VERSION,
    fateChoice: fc,
    createdAt: now,
    updatedAt: now,
    incomplete: true,
  };
  backend.write(id, JSON.stringify(placeholder));
  upsertIndex({
    id,
    name,
    createdAt: now,
    updatedAt: now,
    realm: (fc.basics?.realmMajor || "") + (fc.basics?.realmMinor || ""),
    location: locationPreview(fc.basics?.birthPlace),
  });
  gameLog.info("[GameSave] 创建存档：" + id);
  persistActiveId(id);
  return id;
}

/**
 * 从外部 JSON 载荷导入存档：校验后生成新 id（不覆盖现有存档），注册内嵌图片到
 * IndexedDB，把载荷规范为 id 形态后写入 blob 并登记索引。
 * 不会设为活动存档——导入后需在列表点「读取」才进入。
 * @returns 新存档 id；载荷非法（缺少 fateChoice）返回 null。
 */
export async function importSave(payload: MjSavePayload): Promise<string | null> {
  if (!payload || typeof payload !== "object" || !payload.fateChoice) return null;
  await registerPayloadImages(payload);
  const normalized = refPayloadImages(payload);
  const name = (normalized.fateChoice.basics?.playerName || "").trim() || "未命名";
  const id = uniqueSaveId(name);
  const now = Date.now();
  backend.write(id, JSON.stringify(normalized));
  upsertIndex({
    id,
    name,
    createdAt: payload.createdAt || now,
    updatedAt: payload.updatedAt || now,
    realm: payload.protagonist ? realmPreview(payload.protagonist) : "",
    location: locationPreview(payload.story?.worldLocation),
    ended: isEndedSave(payload),
    imported: true,
    importedAt: now,
  });
  gameLog.info("[GameSave] 导入存档：" + id);
  return id;
}

/** 读取并存档载荷（不恢复到运行时状态）。损坏或不存在返回 null。 */
export function readSave(id: string): MjSavePayload | null {
  const raw = backend.read(id);
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw) as unknown;
    if (!obj || typeof obj !== "object") return null;
    const p = obj as MjSavePayload;
    if (!p.fateChoice) return null;
    return p;
  } catch {
    return null;
  }
}

/** 判定存档是否为可直接恢复的完整存档。 */
export function isCompleteSave(p: MjSavePayload | null | undefined): boolean {
  return (
    !!p &&
    !p.incomplete &&
    !!p.protagonist &&
    !!p.story &&
    Array.isArray(p.story.chatMessages) &&
    p.story.chatMessages.length > 0
  );
}

/** 判定存档是否已终结（主角死亡，不可继续游玩）。 */
export function isEndedSave(p: MjSavePayload | null | undefined): boolean {
  return !!p?.ended;
}

/**
 * 从完整存档恢复全部运行时状态（主角 / NPC / 世界地图 / 剧情）。
 * 调用前应先 `resetAllGameState()` 清场；恢复后 `storyStore.restored=true`。
 */
export function restoreSave(payload: MjSavePayload): void {
  if (payload.protagonist) {
    Protagonist.loadFromJson(payload.protagonist);
  }
  npcStore.restoreNpcs(payload.npcs ?? []);
  worldMapStore.restoreWorldMap(payload.worldMap ?? null);
  locationImageStore.restore(payload.locationImages ?? null);
  storyStore.restoreStory(payload.story ?? null);
  memoryArchiveStore.restoreArchive(payload.memoryArchive ?? null);
  plotPlanStore.restore(payload.plotPlan ?? null);
  worldEvolutionStore.restore(payload.worldEvolution ?? null);
  activeFateChoice = payload.fateChoice;
}

/**
 * 清空全部游戏状态（主角 / NPC / 世界地图 / 剧情）与活动存档记账。
 * 开新人生、读档前清场均应调用。
 */
export function resetAllGameState(): void {
  Protagonist.clear();
  npcStore.clearNpcs();
  worldMapStore.clearWorldMap();
  locationImageStore.clearAll();
  storyStore.clearStory();
  memoryArchiveStore.clearArchive();
  plotPlanStore.clear();
  worldEvolutionStore.clear();
  activeSaveId = null;
  activeCreatedAt = 0;
  activeFateChoice = null;
  clearActiveId();
}

/** 删除一个存档（blob + 索引条目）。若为当前活动存档，一并清空活动记账。 */
export function removeSave(id: string): void {
  backend.remove(id);
  const idx = readIndexRaw().filter((e) => e && e.id !== id);
  writeIndexRaw(idx);
  if (activeSaveId === id) {
  activeSaveId = null;
  activeCreatedAt = 0;
  activeFateChoice = null;
  activeEnded = false;
  clearActiveId();
}
  // 异步清理孤儿图片 Blob：保留其余存档仍引用的 id。
  const keep = new Set<string>();
  for (const e of idx) {
    const p = readSave(e.id);
    if (p) for (const i of collectPayloadImageIds(p)) keep.add(i);
  }
  void pruneBlobs(keep);
}

/** 清空全部存档（不动运行时游戏状态）。 */
export function clearAllSaves(): void {
  const idx = readIndexRaw();
  for (const e of idx) {
    if (e?.id) backend.remove(e.id);
  }
  writeIndexRaw([]);
  activeSaveId = null;
  activeCreatedAt = 0;
  activeFateChoice = null;
  clearActiveId();
  // 全部存档已清空，图片 Blob 一并清空。
  void clearAllBlobs();
}

// ---------------------------------------------------------------------------
// 工具
// ---------------------------------------------------------------------------

/** 生成存档 id：`${name}-${YYYYMMDD-HHMMSS}`。 */
function composeSaveId(name: string): string {
  const d = new Date();
  const pad = (x: number): string => (x < 10 ? "0" + x : String(x));
  const ts =
    d.getFullYear() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    "-" +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds());
  return name + "-" + ts;
}

/** 生成不与现有索引冲突的存档 id（同名时追加 -2/-3…）。 */
function uniqueSaveId(name: string): string {
  const idx = readIndexRaw();
  const base = composeSaveId(name);
  if (!idx.some((e) => e && e.id === base)) return base;
  let n = 2;
  while (idx.some((e) => e && e.id === `${base}-${n}`)) n++;
  return `${base}-${n}`;
}
