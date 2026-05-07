/**
 * @fileoverview 启动页组合式逻辑：OpenAI 兼容 API 表单、存档索引与读写、以及 localStorage / sessionStorage 键约定。
 *
 * 与主工程存档格式对齐时使用 `SAVE_PREFIX` 等常量，便于后续接入「开始新人生」与主界面。
 */

import { computed, onMounted, type ComputedRef, type Ref, ref } from "vue";
import { safeJsonParse, callChatCompletionNonStream } from "../ai/openAiChatBridge";

/**
 * `localStorage` 中保存的 OpenAI 兼容网关覆盖配置（URL / Key / 模型）的键名。
 */
export const API_OVERRIDE_KEY = "IMMORTAL_ST_BRIDGE_API_OVERRIDE_V1";

/**
 * `localStorage` 中存档**索引**（元数据对象数组）的键名。
 */
export const SAVE_INDEX_KEY = "MJ_SAVES_INDEX_V1";

/**
 * 单份存档 JSON 在 `localStorage` 中的键前缀；完整键为 `SAVE_PREFIX + id`。
 */
export const SAVE_PREFIX = "MJ_SAVE_V1:";

/**
 * 当前激活存档 id，在 `localStorage` 与 `sessionStorage` 中同步使用的键名。
 */
export const ACTIVE_SAVE_ID_KEY = "MJ_ACTIVE_SAVE_ID_V1";

/**
 * `sessionStorage` 中启动会话引导数据（读档后由主工程消费）的键名。
 */
export const BOOTSTRAP_KEY = "vue_splash_bootstrap_v1";

/**
 * `localStorage` 中「上次会话镜像」的键名；成功读档后会尝试清除。
 */
export const LAST_SESSION_MIRROR_KEY = "vue_splash_last_session_v1";

/** 持久化在 `API_OVERRIDE_KEY` 下的对象形状（字段均可选，读取时再归一化为字符串）。 */
export interface ApiOverrideStored {
  apiUrl?: string;
  apiKey?: string;
  model?: string;
}

/** 存档索引中的一条元数据，用于列表展示与按键查找完整存档 JSON。 */
export interface SaveIndexEntry {
  /** 存档唯一标识，对应 `SAVE_PREFIX + id`。 */
  id: string;
  /** 展示名称；缺省时界面可回退为 `id`。 */
  name?: string;
  /** 最近更新时间（Unix 毫秒）。 */
  updatedAt?: number;
  /** 创建时间（Unix 毫秒）。 */
  createdAt?: number;
}

/**
 * 从 `localStorage` 读取的存档正文的最小可接受形状；至少须含 `fateChoice` 才视为有效存档。
 */
interface SavePayload {
  fateChoice?: unknown;
  [key: string]: unknown;
}

/**
 * 判断 `localStorage` 中已保存的 API 配置是否允许进入游戏主流程。
 *
 * 规则包括：存在 URL 与模型、非示例域名、非本机 URL 时必须填写 Key等。
 *
 * @return 满足规则时为 `true`；缺字段、解析失败或违反规则时为 `false`。
 */
export function isApiConfigured(): boolean {
  try {
    const raw = localStorage.getItem(API_OVERRIDE_KEY);
    if (!raw) return false;
    const o = JSON.parse(raw) as unknown;
    if (!o || typeof o !== "object") return false;
    const rec = o as ApiOverrideStored;
    const apiUrl = rec.apiUrl != null ? String(rec.apiUrl).trim() : "";
    const model = rec.model != null ? String(rec.model).trim() : "";
    const apiKey = rec.apiKey != null ? String(rec.apiKey).trim() : "";
    if (!apiUrl || !model) return false;
    if (/example\.com/i.test(apiUrl)) return false;
    const isLocal =
      /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(apiUrl) ||
      /^https?:\/\/0\.0\.0\.0(:\d+)?(\/|$)/i.test(apiUrl);
    if (!isLocal && !apiKey) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * `useSplash()` 的返回值：弹窗开关、表单与状态文案、存档列表，以及用户操作回调。
 *
 * 供 `<script setup>` 解构绑定到模板；所有 `Ref` 与 `ComputedRef` 与 Vue 3 响应式语义一致。
 */
export interface UseSplashReturn {
  apiModalOpen: Ref<boolean>;
  saveModalOpen: Ref<boolean>;
  apiUrl: Ref<string>;
  apiKey: Ref<string>;
  apiModel: Ref<string>;
  apiStatus: Ref<string>;
  apiStatusOk: Ref<boolean>;
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
  openSaveLoad: () => void;
  closeSaveLoad: () => void;
  refreshSaveList: () => void;
  loadSave: (it: SaveIndexEntry) => void;
  deleteSave: (it: SaveIndexEntry) => void;
  deleteAllSaves: () => void;
}

/**
 * 创建启动页所需的组合式状态：API 设置弹窗、读档弹窗、本地持久化与一次非流式连通性探测。
 *
 * 在组件挂载时会从 `localStorage` 预填 API 表单（若存在）。
 *
 * @return 可在模板中解构的一组 `ref` / `computed` 与方法。
 */
export function useSplash(): UseSplashReturn {
  const apiModalOpen = ref(false);
  const saveModalOpen = ref(false);
  const apiUrl = ref("");
  const apiKey = ref("");
  const apiModel = ref("");
  const apiStatus = ref("");
  const apiStatusOk = ref(true);
  const saveStatus = ref("");
  const saveStatusOk = ref(true);
  const saves = ref<SaveIndexEntry[]>([]);

  const apiGateTick = ref(0);

  /**
   * 结合 `apiGateTick` 与 `isApiConfigured()`，得到「开始 / 读档」按钮是否可用。
   *
   * @return 本地 API 配置有效时为 `true`。
   */
  function computeCanStart(): boolean {
    void apiGateTick.value;
    return isApiConfigured();
  }

  const canStart = computed(computeCanStart);

  /**
   * 在写入 `localStorage` 后递增计数，强制 `canStart` 重新求值以刷新 UI。
   */
  function refreshApiGate(): void {
    apiGateTick.value++;
  }

  /**
   * 从 `API_OVERRIDE_KEY` 读取 JSON 并填充 `apiUrl` / `apiKey` / `apiModel`。
   *
   * 损坏或非对象时静默跳过。
   */
  function loadApiFormFromStorage(): void {
    try {
      const raw = localStorage.getItem(API_OVERRIDE_KEY);
      const data = raw ? (JSON.parse(raw) as unknown) : null;
      if (data && typeof data === "object") {
        const rec = data as ApiOverrideStored;
        apiUrl.value = rec.apiUrl != null ? String(rec.apiUrl) : "";
        apiKey.value = rec.apiKey != null ? String(rec.apiKey) : "";
        apiModel.value = rec.model != null ? String(rec.model) : "";
      }
    } catch {
      /* ignore corrupt storage */
    }
  }

  /**
   * 打开 API 设置弹窗，清空上次状态文案，预填表单，并禁止背景滚动。
   */
  function openApiSettings(): void {
    apiStatus.value = "";
    loadApiFormFromStorage();
    apiModalOpen.value = true;
    document.body.style.overflow = "hidden";
  }

  /**
   * 关闭 API 设置弹窗并恢复 `document.body` 滚动。
   */
  function closeApiSettings(): void {
    apiModalOpen.value = false;
    document.body.style.overflow = "";
  }

  /**
   * 设置 API 弹窗底部提示文案与成功 / 失败样式标记。
   *
   * @param msg 提示文本；`null` / `undefined` 视为空字符串。
   * @param ok 是否为成功态（影响样式类名）。
   */
  function setApiStatus(msg: string | null | undefined, ok: boolean): void {
    apiStatus.value = msg != null ? String(msg) : "";
    apiStatusOk.value = !!ok;
  }

  /**
   * 校验并保存当前表单中的 URL、Key、模型到 `localStorage`，并刷新「可开始」门闸。
   *
   * URL 与模型为空时仅更新错误提示，不写存储。
   */
  function saveApiSettings(): void {
    const u = String(apiUrl.value || "").trim();
    const k = String(apiKey.value || "").trim();
    const m = String(apiModel.value || "").trim();
    if (!u || !m) {
      setApiStatus("请填写 API URL 与模型。", false);
      return;
    }
    try {
      localStorage.setItem(API_OVERRIDE_KEY, JSON.stringify({ apiUrl: u, apiKey: k, model: m }));
      setApiStatus("已保存。", true);
      refreshApiGate();
    } catch (e) {
      const err = e instanceof Error ? e.message : "未知错误";
      setApiStatus("保存失败：" + err, false);
    }
  }

  /**
   * 移除 `API_OVERRIDE_KEY`、清空表单，并刷新门闸与成功提示。
   */
  function clearApiSettings(): void {
    try {
      localStorage.removeItem(API_OVERRIDE_KEY);
    } catch {
      /* ignore */
    }
    apiUrl.value = "";
    apiKey.value = "";
    apiModel.value = "";
    setApiStatus("已清除。", true);
    refreshApiGate();
  }

  /**
   * 使用当前表单值发起一次非流式 `ping` 请求，根据结果显示耗时与成功 / 失败文案。
   *
   * 未填 URL 或模型时不发请求。
   */
  function testApiSettings(): void {
    const u = String(apiUrl.value || "").trim();
    const k = String(apiKey.value || "").trim();
    const m = String(apiModel.value || "").trim();
    if (!u || !m) {
      setApiStatus("请先填写 API URL 与模型，再测试。", false);
      return;
    }
    setApiStatus("正在测试连接…", true);
    const started = Date.now();
    callChatCompletionNonStream({
      apiUrl: u,
      apiKey: k,
      model: m,
      messages: [{ role: "user", content: "ping" }],
      temperature: 0,
      max_tokens: 8,
    })
      .then((content) => {
        const ms = Date.now() - started;
        setApiStatus("测试成功（" + (ms / 1000).toFixed(2) + "s）：" + (content || "已收到响应"), true);
      })
      .catch((err: unknown) => {
        const ms2 = Date.now() - started;
        const msg = err instanceof Error ? err.message : "未知错误";
        setApiStatus("测试失败（" + (ms2 / 1000).toFixed(2) + "s）： " + msg.slice(0, 480), false);
      });
  }

  /**
   * 读取 `SAVE_INDEX_KEY` 下的 JSON 数组；损坏或非数组时返回空数组。
   *
   * @return 存档元数据列表（可能为空）。
   */
  function readSaveIndex(): SaveIndexEntry[] {
    try {
      const raw = localStorage.getItem(SAVE_INDEX_KEY);
      const arr = raw ? safeJsonParse<unknown>(raw, []) : [];
      return Array.isArray(arr) ? (arr as SaveIndexEntry[]) : [];
    } catch {
      return [];
    }
  }

  /**
   * 将存档索引数组序列化写入 `SAVE_INDEX_KEY`；非数组时写入 `[]`。
   *
   * @param arr 新的索引列表。
   */
  function writeSaveIndex(arr: SaveIndexEntry[]): void {
    try {
      localStorage.setItem(SAVE_INDEX_KEY, JSON.stringify(Array.isArray(arr) ? arr : []));
    } catch {
      /* ignore */
    }
  }

  /**
   * 将 Unix 毫秒时间戳格式化为 `YYYY-MM-DD HH:mm`（本地时区）。
   *
   * @param ts 时间戳；无效或非正数时返回全角破折号 `—`。
   * @return 格式化后的字符串或 `—`。
   */
  function fmtTime(ts: number | undefined): string {
    const n = Number(ts);
    if (!isFinite(n) || n <= 0) return "—";
    const d = new Date(n);
    /** 将一位数补零为两位字符串。 */
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

  /**
   * 根据 `readSaveIndex()` 刷新 `saves`：按 `updatedAt` 降序，并过滤掉缺少 `id` 的项。
   */
  function refreshSaveList(): void {
    const idx = readSaveIndex();
    idx.sort((a, b) => Number(b?.updatedAt) - Number(a?.updatedAt));
    saves.value = idx.filter((x): x is SaveIndexEntry => Boolean(x && x.id));
  }

  /**
   * 打开读档弹窗，清空上次状态文案，禁止背景滚动，并刷新列表。
   */
  function openSaveLoad(): void {
    saveStatus.value = "";
    saveModalOpen.value = true;
    document.body.style.overflow = "hidden";
    refreshSaveList();
  }

  /**
   * 关闭读档弹窗并恢复页面滚动。
   */
  function closeSaveLoad(): void {
    saveModalOpen.value = false;
    document.body.style.overflow = "";
  }

  /**
   * 设置读档弹窗底部提示与成功 / 失败样式。
   *
   * @param msg 提示文本；`null` / `undefined` 视为空。
   * @param ok 是否为成功态。
   */
  function setSaveStatus(msg: string | null | undefined, ok: boolean): void {
    saveStatus.value = msg != null ? String(msg) : "";
    saveStatusOk.value = !!ok;
  }

  /**
   * 读取指定存档：校验 JSON 与 `fateChoice`，写入 `BOOTSTRAP_KEY` 与当前激活 id。
   *
   * 成功时会尝试清除 `LAST_SESSION_MIRROR_KEY`。
   *
   * @param it 索引项，须含有效 `id`。
   */
  function loadSave(it: SaveIndexEntry): void {
    try {
      const raw = localStorage.getItem(SAVE_PREFIX + String(it.id));
      if (!raw) {
        setSaveStatus("读取失败：存档内容不存在。", false);
        return;
      }
      const data = safeJsonParse<SavePayload | null>(raw, null);
      if (!data || !data.fateChoice) {
        setSaveStatus("读取失败：存档内容损坏。", false);
        return;
      }
      try {
        localStorage.removeItem(LAST_SESSION_MIRROR_KEY);
      } catch {
        /* ignore */
      }
      sessionStorage.setItem(BOOTSTRAP_KEY, JSON.stringify(data));
      sessionStorage.setItem(ACTIVE_SAVE_ID_KEY, String(it.id));
      localStorage.setItem(ACTIVE_SAVE_ID_KEY, String(it.id));
      setSaveStatus("主界面尚未接入；已写入会话启动数据，后续接上主工程后可从此继续。", true);
    } catch (e) {
      const err = e instanceof Error ? e.message : "未知错误";
      setSaveStatus("读取失败：" + err, false);
    }
  }

  /**
   * 经 `window.confirm` 确认后删除单条存档及其索引项；若与当前激活 id 一致则一并清理相关键。
   *
   * @param it 索引项，使用 `name` 或 `id` 生成确认文案。
   */
  function deleteSave(it: SaveIndexEntry): void {
    const msg = "确定删除存档「" + String(it.name || it.id) + "」？\n此操作不可撤销。";
    if (!window.confirm(msg)) return;
    try {
      localStorage.removeItem(SAVE_PREFIX + String(it.id));
      const idx2 = readSaveIndex().filter((x) => x && String(x.id || "") !== String(it.id));
      writeSaveIndex(idx2);
      try {
        const curAct = localStorage.getItem(ACTIVE_SAVE_ID_KEY) || "";
        if (curAct && String(curAct) === String(it.id)) {
          localStorage.removeItem(ACTIVE_SAVE_ID_KEY);
          localStorage.removeItem(LAST_SESSION_MIRROR_KEY);
        }
      } catch {
        /* ignore */
      }
      refreshSaveList();
      setSaveStatus("已删除。", true);
    } catch (e) {
      const err = e instanceof Error ? e.message : "未知错误";
      setSaveStatus("删除失败：" + err, false);
    }
  }

  /**
   * 经确认后删除索引中全部条目及对应 `SAVE_PREFIX` 键，并清空索引。
   */
  function deleteAllSaves(): void {
    const msg = "确定清空全部存档？\n此操作不可撤销。";
    if (!window.confirm(msg)) return;
    try {
      const idx3 = readSaveIndex();
      for (let i = 0; i < idx3.length; i++) {
        if (idx3[i]?.id) localStorage.removeItem(SAVE_PREFIX + String(idx3[i].id));
      }
      writeSaveIndex([]);
      refreshSaveList();
      setSaveStatus("已清空。", true);
    } catch (e) {
      const err = e instanceof Error ? e.message : "未知错误";
      setSaveStatus("清空失败：" + err, false);
    }
  }

  /**
   * 使用本 composable 的组件挂载后，从存储预填 API 表单。
   */
  function onSplashMounted(): void {
    loadApiFormFromStorage();
  }

  onMounted(onSplashMounted);

  return {
    apiModalOpen,
    saveModalOpen,
    apiUrl,
    apiKey,
    apiModel,
    apiStatus,
    apiStatusOk,
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
    openSaveLoad,
    closeSaveLoad,
    refreshSaveList,
    loadSave,
    deleteSave,
    deleteAllSaves,
  };
}
