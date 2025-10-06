# Types 目录

- 存放 TypeScript 类型、接口和声明文件。
- 命名约定：
  - `*.d.ts`：第三方或跨层绑定声明。
  - `domain/*.ts`：领域模型（玩家、卡牌、战斗状态）。
  - `messages/*.ts`：层间通信协议（与 `docs/architecture.md` 对应）。
- 建议结合代码生成（`scripts/sync-types.ts`）保持与 Rust `serde` 结构同步。
