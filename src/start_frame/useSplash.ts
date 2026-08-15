import { computed, onMounted, type ComputedRef, type Ref, ref } from "vue";
import {
  useApiConfig,
  isApiConfigured,
  API_OVERRIDE_KEY,
} from "../ai_core/bridge/apiConfig";
import type { ApiOverrideStored } from "../ai_core/bridge/apiConfig";
import { useImageApiConfig } from "../image_generate/useImageApiConfig";
import {
  readSaveIndex as readIndexFromGameSave,
  readSave,
  importSave as importSaveFromGameSave,
  removeSave as removeSaveFromGameSave,
  clearAllSaves as clearAllSavesFromGameSave,
  embedPayloadImages,
  type MjSavePayload,
  type SaveIndexEntry,
} from "../save/gameSave";
import { downloadJson, readJsonFile } from "../save/saveFileTransfer";

export { API_OVERRIDE_KEY } from "../ai_core/bridge/apiConfig";
export type { ApiOverrideStored } from "../ai_core/bridge/apiConfig";
export { isApiConfigured } from "../ai_core/bridge/apiConfig";
export { IMAGE_API_OVERRIDE_KEY } from "../image_generate/useImageApiConfig";
export { SAVE_INDEX_KEY, SAVE_PREFIX } from "../save/gameSave";
export type { SaveIndexEntry, MjSavePayload } from "../save/gameSave";

export interface UseSplashReturn {
  apiModalOpen: Ref<boolean>;
  saveModalOpen: Ref<boolean>;
  helpModalOpen: Ref<boolean>;
  apiUrl: Ref<string>;
  apiKey: Ref<string>;
  apiModel: Ref<string>;
  apiStatus: Ref<string>;
  apiStatusOk: Ref<boolean>;
  imageBaseUrl: Ref<string>;
  imageApiKey: Ref<string>;
  imageModel: Ref<string>;
  imageAutoGenerate: Ref<boolean>;
  imageStatus: Ref<string>;
  imageStatusOk: Ref<boolean>;
  saveStatus: Ref<string>;
  saveStatusOk: Ref<boolean>;
  saves: Ref<SaveIndexEntry[]>;
  canStart: ComputedRef<boolean>;
  fmtTime: (ts: number | undefined) => string;
  openApiSettings: () => void;
  closeApiSettings: () => void;
  saveApiSettings: () => void;
  clearApiSettings: () => void;
  testApiSettings: () => void;
  saveImageApiSettings: () => void;
  clearImageApiSettings: () => void;
  testImageApiSettings: () => void;
  toggleImageAutoGenerate: () => void;
  openSaveLoad: () => void;
  closeSaveLoad: () => void;
  openHelp: () => void;
  closeHelp: () => void;
  refreshSaveList: () => void;
  loadSave: (it: SaveIndexEntry) => { id: string; payload: MjSavePayload } | null;
  exportSave: (it: SaveIndexEntry) => Promise<void>;
  importSaveFromFile: (file: File) => Promise<void>;
  deleteSave: (it: SaveIndexEntry) => void;
  deleteAllSaves: () => void;
}

export function useSplash(): UseSplashReturn {
  const { apiUrl, apiKey, apiModel, loadFromStorage, save, clear, test } = useApiConfig();
  const {
    baseUrl: imageBaseUrl,
    apiKey: imageApiKey,
    model: imageModel,
    autoGenerate: imageAutoGenerate,
    loadFromStorage: imageLoadFromStorage,
    save: imageSave,
    clear: imageClear,
    test: imageTest,
    setAutoGenerate: imageSetAutoGenerate,
  } = useImageApiConfig();

  const apiModalOpen = ref(false);
  const saveModalOpen = ref(false);
  const helpModalOpen = ref(false);
  const apiStatus = ref("");
  const apiStatusOk = ref(true);
  const imageStatus = ref("");
  const imageStatusOk = ref(true);
  const saveStatus = ref("");
  const saveStatusOk = ref(true);
  const saves = ref<SaveIndexEntry[]>([]);

  const canStart = computed(() => isApiConfigured());

  function setApiStatus(msg: string | null | undefined, ok: boolean): void {
    apiStatus.value = msg != null ? String(msg) : "";
    apiStatusOk.value = !!ok;
  }

  function openApiSettings(): void {
    apiStatus.value = "";
    imageStatus.value = "";
    loadFromStorage();
    imageLoadFromStorage();
    apiModalOpen.value = true;
  }

  function closeApiSettings(): void {
    apiModalOpen.value = false;
  }

  function saveApiSettings(): void {
    const result = save();
    const ok = result === "已保存。";
    setApiStatus(result, ok);
  }

  function clearApiSettings(): void {
    clear();
    setApiStatus("已清除。", true);
  }

  function testApiSettings(): void {
    setApiStatus("正在测试连接…", true);
    test().then((result) => {
      const ok = result.startsWith("测试成功");
      setApiStatus(result, ok);
    });
  }

  function setImageStatus(msg: string | null | undefined, ok: boolean): void {
    imageStatus.value = msg != null ? String(msg) : "";
    imageStatusOk.value = !!ok;
  }

  function saveImageApiSettings(): void {
    const result = imageSave();
    const ok = result === "已保存。";
    setImageStatus(result, ok);
  }

  function clearImageApiSettings(): void {
    imageClear();
    setImageStatus("已清除。", true);
  }

  function testImageApiSettings(): void {
    setImageStatus("正在测试连接…", true);
    imageTest().then((result) => {
      const ok = result.startsWith("测试成功");
      setImageStatus(result, ok);
    });
  }

  function toggleImageAutoGenerate(): void {
    imageSetAutoGenerate(!imageAutoGenerate.value);
  }

  function fmtTime(ts: number | undefined): string {
    const n = Number(ts);
    if (!isFinite(n) || n <= 0) return "—";
    const d = new Date(n);
    const pad = (x: number): string => (x < 10 ? "0" + x : String(x));
    return (
      d.getFullYear() +
      "-" +
      pad(d.getMonth() + 1) +
      "-" +
      pad(d.getDate()) +
      " " +
      pad(d.getHours()) +
      ":" +
      pad(d.getMinutes())
    );
  }

  function refreshSaveList(): void {
    saves.value = readIndexFromGameSave();
  }

  function openSaveLoad(): void {
    saveStatus.value = "";
    saveModalOpen.value = true;
    refreshSaveList();
  }

  function closeSaveLoad(): void {
    saveModalOpen.value = false;
  }

  function openHelp(): void {
    helpModalOpen.value = true;
  }

  function closeHelp(): void {
    helpModalOpen.value = false;
  }

  function setSaveStatus(msg: string | null | undefined, ok: boolean): void {
    saveStatus.value = msg != null ? String(msg) : "";
    saveStatusOk.value = !!ok;
  }

  /** 读取存档；成功返回 {id, payload} 供上层（App）恢复游戏，失败返回 null 并设置状态。 */
  function loadSave(it: SaveIndexEntry): { id: string; payload: MjSavePayload } | null {
    try {
      const payload = readSave(it.id);
      if (!payload || !payload.fateChoice) {
        setSaveStatus("读取失败：存档内容不存在或已损坏。", false);
        return null;
      }
      return { id: it.id, payload };
    } catch (e) {
      const err = e instanceof Error ? e.message : "未知错误";
      setSaveStatus("读取失败：" + err, false);
      return null;
    }
  }

  /** 导出存档为本地 JSON 文件（玩家可分享给开发者复现问题）。内嵌图片数据，文件自包含。 */
  async function exportSave(it: SaveIndexEntry): Promise<void> {
    try {
      const payload = readSave(it.id);
      if (!payload || !payload.fateChoice) {
        setSaveStatus("导出失败：存档内容不存在或已损坏。", false);
        return;
      }
      const embedded = await embedPayloadImages(payload);
      const name = (payload.fateChoice.basics?.playerName || it.id).trim() || it.id;
      downloadJson(`${name}-${it.id}.json`, embedded);
      setSaveStatus("已导出存档文件。", true);
    } catch (e) {
      const err = e instanceof Error ? e.message : "未知错误";
      setSaveStatus("导出失败：" + err, false);
    }
  }

  /** 从用户选择的 JSON 文件导入存档（开发者复现问题用）。 */
  async function importSaveFromFile(file: File): Promise<void> {
    try {
      const data = await readJsonFile(file);
      if (!data || typeof data !== "object") {
        setSaveStatus("导入失败：不是合法的存档文件。", false);
        return;
      }
      const id = await importSaveFromGameSave(data as MjSavePayload);
      if (!id) {
        setSaveStatus("导入失败：存档内容不合法（缺少命运抉择数据）。", false);
        return;
      }
      refreshSaveList();
      setSaveStatus("已导入存档。", true);
    } catch (e) {
      const err = e instanceof Error ? e.message : "未知错误";
      setSaveStatus("导入失败：" + err, false);
    }
  }

  function deleteSave(it: SaveIndexEntry): void {
    const msg = "确定删除存档「" + String(it.name || it.id) + "」？\n此操作不可撤销。";
    if (!window.confirm(msg)) return;
    try {
      removeSaveFromGameSave(it.id);
      refreshSaveList();
      setSaveStatus("已删除。", true);
    } catch (e) {
      const err = e instanceof Error ? e.message : "未知错误";
      setSaveStatus("删除失败：" + err, false);
    }
  }

  function deleteAllSaves(): void {
    const msg = "确定清空全部存档？\n此操作不可撤销。";
    if (!window.confirm(msg)) return;
    try {
      clearAllSavesFromGameSave();
      refreshSaveList();
      setSaveStatus("已清空。", true);
    } catch (e) {
      const err = e instanceof Error ? e.message : "未知错误";
      setSaveStatus("清空失败：" + err, false);
    }
  }

  onMounted(() => {
    loadFromStorage();
    imageLoadFromStorage();
  });

  return {
    apiModalOpen,
    saveModalOpen,
    apiUrl,
    apiKey,
    apiModel,
    apiStatus,
    apiStatusOk,
    imageBaseUrl,
    imageApiKey,
    imageModel,
    imageAutoGenerate,
    imageStatus,
    imageStatusOk,
    saveStatus,
    saveStatusOk,
    saves,
    canStart,
    fmtTime,
    openApiSettings,
    closeApiSettings,
    saveApiSettings,
    clearApiSettings,
    testApiSettings,
    saveImageApiSettings,
    clearImageApiSettings,
    testImageApiSettings,
    toggleImageAutoGenerate,
    openSaveLoad,
    closeSaveLoad,
    openHelp,
    closeHelp,
    helpModalOpen,
    refreshSaveList,
    loadSave,
    exportSave,
    importSaveFromFile,
    deleteSave,
    deleteAllSaves,
  };
}
