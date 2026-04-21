# 凡人修仙传 · Vue3 启动页

独立 Vue 3 + Vite 项目：启动闪屏、API 设置、存档列表（读取时写入 `sessionStorage`，主界面后续再接）。

## 运行

```bash
cd vue
npm install
npm run dev
```

默认开发地址：`http://localhost:5173`。

## 构建

```bash
npm run build
npm run preview
```

## 说明

- 启动页背景图为 `public/splash-bg.png`（与 `mortal_journey/assets/splash-bg.png` 一致），由 `src/styles/start_frame.css` 中 `#splash-bg` 引用。
- 存档仍使用浏览器 `localStorage` 中 `MJ_SAVES_INDEX_V1` / `MJ_SAVE_V1:*` 等键（与旧版存档格式兼容，便于日后对接主工程）。
