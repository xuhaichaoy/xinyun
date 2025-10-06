# WASM 接口封装目录

- 集中管理与 `rust-core` 编译产物的交互逻辑（`createGameState`、`playCard`、`attack`、`startTurn`、`endTurn`、`computeAiMove` 等）。
- `index.ts` 持有初始化与单例缓存，避免重复加载 `.wasm`，并为规则引擎 API 返回 `RuleResolution`（状态 + 事件 + 胜利信息）。
- 可按职责拆分：
  - `engine.ts`：对游戏引擎导出的 API 进行类型安全封装。
  - `workers/`：基于 Web Worker 的消息桥接。
  - `adapters/`：JSON 协议编解码、Diff 处理。
