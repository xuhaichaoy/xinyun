# Scripts 目录说明

- `dev-wasm.sh`：在开发模式下触发 `wasm-pack build --watch`，自动降级为 `cargo watch` 并提示缺失依赖。
- `build-wasm.sh`（可选）：封装 `npm run wasm:build` 的 shell 脚本。
- `sync-types.ts`（可选）：将 Rust 结构同步为 TypeScript 类型。
- `ci/`：存放持续集成相关脚本，如打包、部署、检查。

> 当前为空目录，后续根据实际自动化需求补充。
