# silly_tarven 兼容层

这个目录提供一个最小的“酒馆兼容桥接层”，用于让 `legacy/index.html` 在非酒馆环境下也能运行。

## 提供的能力

- `window.parent.TavernHelper.generate(params)` / `stopAllGeneration()`
- `eventOn` / `eventEmit` / `eventRemoveListener` 事件总线
- 世界书接口：
  - `getWorldbookNames()`
  - `getWorldbook(name)`
  - `replaceWorldbook(name, entries)`
- 预设管理接口（给外部脚本或控制台使用）：
  - `window.SillyTavernBridge.getPresets()`
  - `window.SillyTavernBridge.upsertPreset(preset)`
  - `window.SillyTavernBridge.setActivePreset(id)`
  - `window.SillyTavernBridge.removePreset(id)`
  - `window.SillyTavernBridge.fetchModels(apiUrl, apiKey)`

## 快速配置

在浏览器控制台执行：

```js
window.SillyTavernBridge.upsertPreset({
  id: "my-main",
  name: "本地主API",
  apiUrl: "https://api.openai.com/v1",
  apiKey: "sk-xxxx",
  model: "gpt-4o-mini",
  systemPrompt: "",
  temperature: 0.7
});
window.SillyTavernBridge.setActivePreset("my-main");
```

## 数据存储

使用 `localStorage`：

- `IMMORTAL_ST_BRIDGE_PRESETS_V1`
- `IMMORTAL_ST_BRIDGE_WORLDBOOKS_V1`

## 说明

- 该桥接层优先保障 `legacy` 主流程可运行（主模型调用、世界书读取/保存、流式 token 回传）。
- `generate-image-request` 目前只返回“未实现后端”的错误回调；如果你需要生图，可在 `bridge.js` 的 `handleGenerateImageRequest` 内接入你自己的服务。

