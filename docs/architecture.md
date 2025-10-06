# WebAssembly 卡牌游戏三层架构设计

## 总览

项目按照“逻辑 → 状态/UI → 渲染”分层，Rust/WASM 层负责权威游戏状态与规则判定，React 层负责界面状态管理与交互编排，Canvas 层聚焦高性能渲染与动画。各层通过结构化的 JSON 消息协议通信，既便于调试又方便在 Tauri、Web 等多种宿主环境中复用。

```
+--------------+        +-----------------+        +-------------------+
|  Rust / WASM  | <----> |  React State/UI | <----> |  Canvas Renderer  |
|  (Game Core)  |        |  (app-shell)    |        |  (2D / WebGL)     |
+--------------+        +-----------------+        +-------------------+
```

## 1. Rust / WASM 层

- **职责**：维护权威游戏状态、执行卡牌规则、提供回放与日志、输出增量状态 diff。
- **接口设计**：

```rust
use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};

#[wasm_bindgen]
pub struct Engine(GameCore);

#[wasm_bindgen]
impl Engine {
    #[wasm_bindgen(constructor)]
    pub fn new(config: JsValue) -> Result<Engine, JsValue>;

    #[wasm_bindgen]
    pub fn apply_action(&mut self, action: JsValue) -> Result<JsValue, JsValue>;

    #[wasm_bindgen]
    pub fn query_state(&self) -> Result<JsValue, JsValue>;

    #[wasm_bindgen]
    pub fn undo(&mut self) -> Result<JsValue, JsValue>;

    #[wasm_bindgen]
    pub fn redo(&mut self) -> Result<JsValue, JsValue>;
}

#[derive(Serialize, Deserialize)]
pub struct EngineAction { /* ... */ }

#[derive(Serialize, Deserialize)]
pub struct EngineEvent { /* ... */ }
```

- **关键模块**：
  - `state`: 描述玩家、卡组、战场等领域模型。
  - `rules`: 出牌/攻击合法性、回合阶段流转、胜负判定与状态一致性检查。
  - `effects`: `EffectTrigger`、`EffectKind`、效果栈与条件解析，支持组合与动态优先级。
  - `reducers`: 接收 `EngineAction` 并返回 `EngineEvent` 或 `StateDiff`。
  - `log`: 结构化战斗日志，供 UI 或调试使用。

- **导出函数**：所有导出必须返回 `Result<JsValue, JsValue>`，错误统一映射为 JSON（详见“错误处理”部分）。当前通过 `serde-wasm-bindgen` 实现 `GameState` 等结构的序列化/反序列化，并提供 `applyCardEffects`/`playCard`/`attack`/`startTurn`/`endTurn` 等规则 API。封装层 `GameEngine` 使用 `serde_json` 返回字符串以便调试，同时通过 `future_to_promise` + `TimeoutFuture` 暴露异步 AI 接口。

## 2. React 层

- **职责**：
  - 管理会话/玩家配置、全局 UI 状态（音量、皮肤、快捷键）。
  - 将 WASM 的 `EngineEvent` 映射成可渲染的 `ViewModel`。
  - 编排多路页面（大厅、组牌、对局、回放）与 URL 状态（TanStack Router）。

- **状态管理**：
  - `Jotai` 原子：
    - `engineAtom`：持有 `Engine` 实例引用与版本号。
    - `matchStateAtom`：缓存最近一次查询的权威状态。
    - `viewModelAtom`：Canvas 层需要的投影数据。
    - `uiAtom`：弹窗、悬浮提示、设置等。
  - 使用 `atomWithObservable` 将 `EngineEvent` 流映射为 UI 更新，支持监听实时 diff。

- **组件结构**：
  - `AppShell`：布局与路由边界。
  - `MatchProvider`：封装 WASM 初始化、事件订阅、错误边界。
  - `LobbyView` / `DeckBuilder` / `MatchView` / `ReplayView`：路由页面。
  - `HudPanel`、`HandZone`、`StackZone`、`LogTimeline`：组合 Canvas 层渲染与 UI 控件。

- **与 Canvas 层交互**：通过 `RendererController` 类封装消息流，React 只发送高层指令（例如“播放动画队列”、“更新手牌排序”），不直接操作 `CanvasRenderingContext2D`。

## 3. Canvas 渲染层

- **职责**：以高帧率渲染战场、动画和特效，提供与 WASM 状态同步的视觉输出，并捕获命中测试事件反馈给 React。

- **接口设计**（TypeScript）：

```ts
interface RenderFrame {
  stateVersion: number;
  board: BoardSnapshot;
  animations: AnimationCommand[];
}

interface RendererController {
  init(canvas: HTMLCanvasElement | OffscreenCanvas, options: RenderOptions): void;
  update(frame: RenderFrame): void;
  handleInput(event: CanvasPointerEvent): void;
  resize(size: { width: number; height: number }): void;
  dispose(): void;
}

type CanvasMessage =
  | { type: "init"; payload: InitPayload }
  | { type: "frame"; payload: RenderFrame }
  | { type: "interaction"; payload: InteractionEvent }
  | { type: "metrics"; payload: PerfMetrics };
```

- **实现要点**：
  - 推荐 `OffscreenCanvas + Worker` 渲染以减轻主线程压力。
  - `InteractionEvent` 通过 React 层回传给 WASM，引导后续逻辑。
  - 可插拔渲染 backend：2D Canvas、WebGL2、WebGPU。

## 4. 层间通信协议

- **传输介质**：
  - React ↔ WASM：`wasm-bindgen` 暴露的同步函数 + 异步回调（通过 `EngineEvent` 流）。
  - React ↔ Canvas：`postMessage` / 直接方法调用（视 Worker 架构而定）。

- **消息格式**：统一采用 JSON，字段包含 `type`、`ts`（毫秒时间戳）、`requestId`（可选）、`payload`。

```json
{
  "type": "engine.applyAction",
  "ts": 1728032456123,
  "requestId": "action-42",
  "payload": {
    "playerId": "p1",
    "cardId": "spell_fireball",
    "target": "p2"
  }
}
```

- **主要消息族**：
  - `engine.*`：React 向 WASM 发起的命令（`applyAction`、`undo`、`redo`、`query`）。
  - `event.*`：WASM 返回的结果或异步事件（`stateDiff`、`turnStart`、`cardResolved`）。
  - `render.*`：React 下发给 Canvas 的绘制指令（`frame`、`highlight`、`layout`）。
  - `ui.*`：Canvas 反馈的交互事件（`pointer.over`、`drag.start`）。

- **版本与兼容性**：`payload` 内嵌 `schemaVersion`。React 层维护兼容矩阵，可在收到未知版本时请求 WASM 进行降级或热更新。

## 5. 错误处理与调试

- **统一错误结构**：

```json
{
  "type": "error",
  "source": "wasm",
  "code": "INVALID_TARGET",
  "message": "Card cannot target ally units",
  "details": { "cardId": "spell_fireball", "playerId": "p1" }
}
```

  - `source` 取值：`wasm`、`react`、`canvas`、`transport`。
  - 所有 `JsValue` 错误以该结构序列化，React 层统一展示。

- **调试机制**：
  - WASM 层：启用 `console_error_panic_hook`，提供 `Engine::export_debug_state()` 导出完整状态快照。
  - React 层：使用 `@tanstack/router-devtools` 与自定义 `DevOverlay` 展示当前 action 队列、消息日志。
  - Canvas 层：`metrics` 消息上报帧率、批次数、绘制耗时，可在 DevTools 中可视化。
  - 日志采集：各层以 `structured logging` 输出到 Tauri `plugin-log` 或浏览器 console，并附带 `requestId` 便于串联。

- **容错策略**：
  - 当 WASM 返回错误时，React 层回滚到最近一次成功的 `stateVersion` 并提示用户。
  - Canvas 若出现渲染异常，可降级为静态 UI（隐藏动画），保证交互可继续。
  - 支持热重载：`wasm:dev` 触发增量编译后发送 `engine.reload`，React 层自动重新初始化并复用最新状态快照。

---

该架构确保逻辑层与渲染层解耦，可独立迭代或替换实现；同时利用 JSON 协议与统一错误模型，方便在调试、录制回放、网络对战等场景中扩展。
