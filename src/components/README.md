# Components 目录

- 包含 React 组件，按页面或功能拆分子目录（例如 `layout/`、`match/`、`deck-building/`）。
- UI 组件应保持纯展示；复杂业务逻辑拆分到 `hooks/` 或 `wasm/` 封装。
- 对外统一在 `src/components/index.ts` 导出，方便按需引用。
