# React + TypeScript + Rust WebAssembly 开发环境

针对“创建 React + TypeScript 项目并集成 WebAssembly”的需求，本仓库已经完成以下配置：

1. Vite 初始化的 React + TypeScript 前端工程，原生支持 `.wasm` 加载。
2. `rust-core/` 目录内的 wasm 库项目，预置 `wasm-bindgen`、`console_error_panic_hook`、`wee_alloc` 等依赖。
3. `wasm-pack --watch` 与 Vite 开发服务器并行，Rust 侧增量编译后自动刷新浏览器。
4. TypeScript 类型声明覆盖 wasm-pack 生成的 JS 包装模块与 `.wasm` 资源。
5. VS Code 推荐扩展、Rust Analyzer 配置、常用任务和格式化规则。

## 先决条件

- Node.js ≥ 18（附带 npm）。
- Rust 工具链与 WebAssembly 目标：

  ```bash
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
  source "$HOME/.cargo/env"
  rustup toolchain install stable
  rustup component add rustfmt clippy
  rustup target add wasm32-unknown-unknown
  ```

- `wasm-pack` ≥ 0.12.1：

  ```bash
  curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh
  wasm-pack --version
  ```

## 项目结构

```
card-game-wasm/
├── README.md
├── docs/
│   └── architecture.md
├── index.html
├── package.json
├── public/
│   └── vite.svg
├── rust-core/
│   ├── Cargo.toml
│   ├── rust-toolchain.toml
│   └── src/
│       ├── lib.rs
│       ├── game/
│       ├── ai/
│       └── utils/
├── scripts/
├── src/
│   ├── components/
│   │   └── App.tsx
│   ├── hooks/
│   ├── canvas/
│   ├── wasm/
│   │   └── index.ts
│   ├── types/
│   │   └── wasm.d.ts
│   ├── main.tsx
│   └── styles.css
├── tsconfig.json
├── vite.config.ts
└── .vscode/
    ├── extensions.json
    ├── settings.json
    └── tasks.json
```

- `rust-core/`：Rust wasm 库，划分 `game/`、`ai/`、`utils/` 子模块，统一从 `lib.rs` 导出。
- `src/`：React + TS 客户端，`components/` 放 UI，`wasm/` 封装 WebAssembly 接口，`canvas/` 预留渲染引擎实现，`types/` 收纳 `.d.ts` 与领域类型。
- `src/canvas/`：包含 `Renderer`、`Camera2D`、`SceneGraph` 以及卡牌渲染模块（`CardRenderer`、手牌扇形/战场网格布局、LOD 支持）。
- `rust-core/pkg/`：运行 `npm run dev` 或 `npm run wasm:build` 后由 `wasm-pack` 生成，未纳入版本控制。
- `public/`：静态资源目录，将原样拷贝至 `dist/`。
- `scripts/`：存放构建、集成等辅助脚本。

## Rust 核心数据结构

- `rust-core/src/game/state.rs` 定义了 `Card`、`Player`、`GameState`、`GameEvent` 等核心实体，全部派生 `Clone`/`Serialize`/`Deserialize`，便于深拷贝与跨语言序列化。
- `rust-core/src/game/effects.rs` 提供 `Effect` 系统：`EffectTrigger`、`EffectKind`、`EffectCondition`、效果栈及解析顺序，支持组合与条件效果。
- 支持 `Composite`/`Conditional` 等动态组合，条件检查可根据生命、法力、随从数量等维度扩展，满足复杂卡牌机制需求。
- `GameEvent` 使用 `#[serde(tag = "type")]` 导出 JSON，包含伤害、治疗、摧毁等事件；`GameState::sample()` 调用效果引擎插入示例事件便于调试。
- `rust-core/src/game/rules.rs` 实现规则引擎：出牌验证、攻击解析、回合流程与胜负判定均在后端执行，无法被前端绕过；同时暴露 `IntegrityError` 确保状态一致性。
- `rust-core/src/ai/minimax.rs` 实现基于极小极大 + Alpha-Beta 剪枝的多策略 AI，内置 Aggressive / Control / Combo / Random / Adaptive 五种权重模式，可按难度自动选择或通过 `computeAiMove` 自定义；同时提供时间限制与随机扰动，便于实时调试。
- `wasm-bindgen` 在 `lib.rs` 中导出 `createGameState`、`cloneGameState`、`applyCardEffects`、`playCard`、`attack`、`startTurn`、`endTurn`、`advancePhase`、`checkVictory` 与 `validateState`，通过 `serde-wasm-bindgen` 与 JS 互转，以便在前端模拟并校验规则执行。
- `GameEngine` wasm 类（`lib.rs`）提供更高层的状态管理：`state_json`/`set_state_json`、`play_card_json`、`attack_json`、`apply_ai_move`、`think_ai` 等方法，采用 `serde_json` 序列化并通过 `future_to_promise` 支持异步 AI 思考。

示例（前端）调用：

```ts
import { applyCardEffects, playCard } from "@/wasm";

const result = await applyCardEffects(state, card, {
  trigger: "OnPlay",
  source_player: 0,
  current_player: state.current_player,
});

console.log(result.events);

const playOutcome = await playCard(state, {
  player_id: 0,
  card_id: 1,
  target_player: 1
});
console.log(playOutcome.victory);

const aiDecision = await computeAiMove(state, 1, "hard", "aggressive");
console.log(aiDecision.action, aiDecision.resolution?.state);

const engine = new wasm.GameEngine();
const playResultJson = engine.play_card_json(JSON.stringify({ player_id: 0, card_id: 1 }));
console.log(JSON.parse(playResultJson));
const aiJson = await engine.think_ai(1, "expert", "adaptive", 150);
console.log(JSON.parse(aiJson).strategy);

const { state, playCard, rollback } = useGameState({ service: gameEngineService, updateMode: "incremental" });
await playCard({ player_id: 0, card_id: 2 });
rollback();
```

## 快速开始

```bash
npm install
npm run dev
# 浏览器将自动打开 http://localhost:5173
```

开发模式下会同时启动两个进程：

- `npm run wasm:dev`（并行触发）：在 `rust-core/` 下执行 `wasm-pack build --dev --target web --out-dir pkg --watch`，增量编译 Rust 代码。
- `vite`：监听 `rust-core/pkg/` 目录变化，通过自定义插件触发整页刷新，确保最新 `.wasm` 被加载。

修改 `rust-core/src/lib.rs` 或 `src/components/App.tsx`/`src/main.tsx` 后保存，即可体验 Rust ↔ React 双向热重载。

## 构建与脚本

- `npm run dev`：并行运行 `wasm-pack --watch` 与 Vite，提供 Rust + React 双向热重载。
- `npm run build`：先执行 `npm run wasm:build`，再运行 `vite build`，最终产物写入 `dist/`。
- `npm run preview`：在本地预览生产版本。
- `npm run wasm:dev`：调用 `scripts/dev-wasm.sh`，自动检测 `wasm-pack --watch` 支持；若版本较低则提示安装 `cargo watch` 并降级为轮询。
- `npm run wasm:build`：仅执行 Rust → Wasm 编译（发布模式）。
- `npm run check:rust`：`cargo check --target wasm32-unknown-unknown`，用于验证链接配置。
- `npm run lint:rust`：`cargo fmt` + `cargo clippy`（Wasm 目标），保证 Rust 代码质量。
- `npm run test:rust`：`wasm-pack test --headless --chrome`，运行浏览器端单元测试。
- `npm run lint` / `npm run lint:fix`：使用 Biome 校验或修复 React/TypeScript 代码。

## TypeScript 与 WebAssembly 支持

- `tsconfig.json`：开启 `jsx: react-jsx`、`isolatedModules`、`paths` alias（`@/*`）等设置。
- `src/types/wasm.d.ts`：为 `rust-core/pkg/wasm_game.js` 及任意 `*.wasm` 添加声明，避免类型错误。
- `src/wasm/index.ts`：统一封装 wasm 初始化、`createGameState` 等接口，避免重复加载。
- `src/wasm/GameEngineService.ts`：提供高层 `GameEngine` 服务类，支持重试、调试挂载、AI 处理等；`src/hooks/useWasm.ts` 负责加载与重试逻辑。
- `src/hooks/useGameState.ts` & `useGamePersistence.ts`：前者同步 React ↔ WASM 状态（事件队列、增量合并、回滚），后者管理本地存档（多槽位、成就、设置、备份/恢复、版本迁移）。
- `vite.config.ts`：
  - 启用 `@vitejs/plugin-react`。
  - 通过自定义插件监听 `rust-core/pkg/`，在 `.wasm`/JS 绑定更新时发送 `full-reload`。
  - 将 `@` 映射到 `src/`，开发体验更友好。

## 事件集成三层架构

- `src/events/EventBus.ts`：实现带历史记录的轻量事件总线，支持 `on`/`once`/`onAny` 订阅与调试输出。
- `src/events/GameEvents.ts`：定义 Game → React → Canvas 全链路消息类型，并暴露全局 `gameEventBus` 与工具函数。
- `GameEngineService`：调用 WASM 前后自动发出 `wasm:request` / `wasm:response` / `wasm:error` 等事件，提供结果摘要，便于调试与追踪。
- `useGameState`：将 WASM 解析结果映射到 React 状态，同时广播 `state:updated`、`state:eventsAppended`、`canvas:invalidate` 等通知；监听 `canvas:interaction`，将 Canvas 交互反馈回 WASM。
- `GameCanvasBridge`：监听 `state:updated` / `canvas:invalidate`，确保 Canvas 覆盖层在 React 状态变化后刷新，实现渲染层与状态层的解耦。
- `EventDebugger` 组件结合 `useEventLog` Hook 展示最近事件历史，支持在设置面板中快速调试全局事件流。
- 开发模式新增 `DebugOverlay` 面板，可实时查看游戏状态、AI 决策、Canvas 调试开关、事件流与性能统计。

## 性能优化

- `src/wasm/moduleLoader.ts` 引入全局缓存与空闲预取（`prefetchGameCore`），减少 WASM 初始化开销；`clearWasmCache` 可在资源受限时主动释放。
- React 层对高频组件（GameBoard、ActionPanel、GameLog）应用 `useMemo`/`useCallback` 与 `React.memo`，降低状态更新引起的重复渲染。
- Canvas `Renderer` 支持脏矩形、按需渲染与自动暂停空帧；`EffectComposer`/`ParticleSystem` 汇报活跃状态，避免无效 `clearRect`。
- 新增 `attachRendererMonitor`（`src/utils/performance.ts`）定时采样 FPS、帧耗时及可选 JS Heap，结果统一通过 `GameEventBus` 输出，可在 `EventDebugger` 观察。
- `GameEngineService` 支持按需释放 wasm 模块（`retainModuleInstance: false`），降低低端设备内存压力。

## VS Code 优化

- `extensions.json` 推荐安装 `rust-analyzer`、`even-better-toml`、`crates`、`vscode-lldb`、`prettier`、`vscode-wasm` 等扩展。
- `settings.json`：
  - `rust-analyzer.linkedProjects = ["./rust-core/Cargo.toml"]`，直接识别独立的 Rust 子项目。
  - 保存时对 Rust / TypeScript / TSX / JSONC 自动格式化。
- `tasks.json`：提供 `npm: dev`（热重载）与 `npm: test:rust`（wasm-pack 测试）快捷任务。

## 架构参考

- `docs/architecture.md` 描述了 Rust/WASM、React 状态/UI 与 Canvas 渲染三层架构、消息协议以及调试机制，可作为后续模块拆分与团队协作的蓝图。
- `docs/project-structure.md` 总结了各目录的职责与命名规范，新增模块或脚本时请同步更新。

## 调试与常见问题

- **Rust panic 信息缺失**：默认启用 `console_error_panic_hook`，请在浏览器控制台查看栈信息。
- **浏览器仍加载旧 `.wasm`**：在 DevTools 勾选 *Disable cache* 或手动清空缓存；热重载插件会在 `rust-core/pkg/` 发生任何改动时强制刷新。
- **`wasm-pack` 未找到**：确认 `$HOME/.cargo/bin` 已加入 `PATH`。
- **VS Code 无法索引依赖**：执行 `npm run check:rust` 以初始化编译缓存。
- **需要更快的增量编译**：可选安装 `cargo-watch`，将 `npm run wasm:dev` 替换为 `cargo watch -s "wasm-pack build --dev --target web --out-dir pkg"`。

祝编码顺利，享受 React + Rust WebAssembly 的开发体验！
