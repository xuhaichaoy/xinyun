# card-game-wasm 项目结构规范

```
card-game-wasm/
├── rust-core/
│   ├── src/
│   │   ├── lib.rs
│   │   ├── game/
│   │   ├── ai/
│   │   └── utils/
│   ├── Cargo.toml
│   ├── rust-toolchain.toml
│   └── pkg/
├── src/
│   ├── components/
│   ├── hooks/
│   ├── canvas/
│   ├── wasm/
│   └── types/
├── public/
└── scripts/
```

## rust-core/

- **定位**：游戏核心逻辑的权威实现，编译为 WebAssembly 并通过 `wasm-bindgen` 暴露接口。
- **子目录**：
  - `src/lib.rs`：crate 入口，定义导出 API、初始化逻辑、feature 开关。
  - `src/game/`：核心游戏状态、规则引擎、战斗流程。推荐按领域拆分（`state.rs`、`effects.rs`、`rules.rs` 等）。`state.rs` 提供卡牌、玩家、游戏状态与事件的数据结构；`effects.rs` 实现 Effect trait、触发器、效果栈与组合条件；`rules.rs` 负责规则校验、攻击解析、回合切换与胜负判定。
  - `src/ai/`：AI 策略与搜索算法，当前 `minimax.rs` 实现多难度极小极大 + Alpha-Beta 搜索、局面评估与决策限时。
  - `src/ai/`：AI/自动对战相关算法，例如 MCTS、启发式策略、脚本执行器。
  - `src/utils/`：跨模块复用的工具（序列化、随机数、配置加载、错误类型）。
  - `pkg/`：`wasm-pack` 编译输出目录（`wasm_game_bg.wasm`、JS 绑定等），应通过 `.gitignore` 排除。
- **模块规范**：
  - 所有对外可见的类型/函数经由 `lib.rs` 再导出，避免直接访问实现细节。
  - 逻辑单元应拥有对应的 `tests` 模块或 `wasm-bindgen-test` 覆盖。
  - 与前端通信的数据结构需实现 `serde::Serialize`/`Deserialize`，并在 `types/` 中同步 TypeScript 定义。

## src/

- **定位**：React + TypeScript 前端，负责状态管理、UI 表达与宿主集成。
- **子目录**：
  - `components/`：纯视图组件和容器组件，建议再按页面/领域划分子目录，例如 `components/match/`, `components/deck/`。
  - `hooks/`：自定义 Hook，封装状态管理、事件订阅、与 WASM 交互的复用逻辑。
  - `canvas/`：画布渲染层实现（2D Canvas、WebGL、WebGPU 等），包含渲染控制器、动画队列、命中测试工具。
  - `wasm/`：WASM 接口封装与生命周期管理，例如 `initGameCore()`、消息编解码、Diff 合并器。
  - `types/`：TypeScript 类型定义与声明文件，如 `wasm.d.ts`（绑定）、`domain.ts`（领域状态）、`messages.ts`（通信协议）。
  - 根目录下的 `main.tsx` 负责应用启动、Provider 注入，`styles.css` 可替换为更细分的样式组织模式（CSS Modules、Tailwind 等）。
- **命名建议**：
  - Hook 使用 `use` 前缀 (`useGameEngine`, `useCanvasController`)。
  - 组件使用 PascalCase，并在 `index.ts` 中集中导出。
  - 类型文件使用明确领域名（`player.ts`, `battle.ts`）。

## public/

- **定位**：静态资源（图标、字体、预加载配置）。
- **规范**：
  - 通过 `public/assets/` 分类管理卡面图片、音效等大文件。
  - 非打包依赖的 JSON 配置（如初始卡组）可放在此处，并在运行时通过网络请求加载。

## scripts/

- **定位**：可执行脚本和自动化工具。
- **建议内容**：
  - `build-wasm.[sh|ps1]`：封装 `wasm-pack build` 的平台脚本。
  - `sync-types.ts`：将 Rust `serde` 结构同步为 TypeScript 类型（可结合 `typeshare` / `quicktype`）。
  - `ci/` 子目录：存放 CI/CD 工作流辅助脚本。

## 组织与协作准则

- 使用 `docs/` 目录编写架构、协议、设计决策等文档，在 PR 中保持同步。
- 所有新模块需伴随最小文档/示例，说明与上下游的接口约定。
- 通过统一的 JSON 消息 schema（参见 `architecture.md`）保证跨层通信兼容。
- 在引入新依赖或目录时，更新本文件以保证团队共享同一 mental model。
