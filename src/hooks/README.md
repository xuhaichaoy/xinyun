# Hooks 目录

- 存放所有自定义 React Hooks，例如 `useGameEngine`、`useMatchState`、`useCanvasController`。
- `useWasm` 负责加载/重试 WebAssembly 模块，初始化完成后将模块实例回调给调用方。
- `useGameState` 将 `GameEngineService` 与 React 状态同步，提供事件队列、回滚、增量更新等能力。
- 每个 Hook 应与业务领域对应的 `types/` 定义配套，并在必要时编写单元测试。
