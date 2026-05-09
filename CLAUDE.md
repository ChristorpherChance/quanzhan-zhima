# 全栈智码 (QuanZhan ZhiMa) v2.0 · 项目宪法

> AI 驱动的全栈开发平台，提供从需求→设计→开发→审查→导出的端到端自动化链路。

## 目录约定

- `src/` — Next.js 14 App Router 源码
- `src/app/api/` — API 路由（SSE / REST）
- `src/agents/` — 4 个 Agent（requirement / design / dev / review）
- `src/components/workbench/` — 前端工作台组件
- `src/lib/pi/` — Pi SDK 0.73 集成（session / registry / tools / event-map）
- `storage/projects/` — 项目工作区与制品存储
- `storage/projects/_skeleton/` — 沙箱骨架模板
- `prisma/` — 数据库 Schema 与迁移
- `scripts/` — 冒烟测试与工具脚本
- `doc/` — 设计文档与修复指南
- `docs/` — 架构文档与 Cheatsheet

## 命名规范

- **Agent 文件**: `<stage>-agent.ts` (requirement-agent / design-agent / dev-agent / review-agent)
- **API 路由**: `src/app/api/projects/[id]/<resource>/route.ts`
- **Pi 事件**: 统一使用下划线事件名 (`text_delta` / `tool_start` / `tool_end`)
- **组件**: PascalCase `.tsx`
- **数据库模型**: PascalCase (Project / Artifact / PiSession / Message)

## 严禁事项

- **禁止**在代码中硬编码 API key
- **禁止**创建新的全局 `process.env` 读取——使用 `getRuntimeConfig()`
- **禁止**偏离 Pi SDK 0.73 API——参见 `docs/pi-sdk-cheatsheet.md`
- **禁止**在 agent 中直接调用 `chat()` / `stream()`——必须走 `piSessionPool`
- **禁止**向子进程传递完整环境变量——沙箱使用 env 白名单

## 必须运行的脚本

| 脚本 | 用途 |
|------|------|
| `pnpm typecheck` | TypeScript 编译检查（提交前必跑） |
| `pnpm build` | 生产构建验证 |
| `pnpm tsx scripts/verify-env.ts` | 环境变量检查 |
| `pnpm tsx scripts/smoke-pi.ts` | Pi SDK 连接验证 |
| `pnpm prisma migrate dev` | Schema 变更后执行 |

## 提交前 Checklist

- [ ] `pnpm typecheck` 零错误
- [ ] `pnpm build` 通过
- [ ] 无新增 `process.env` 直接读取
- [ ] 无硬编码端口/URL
- [ ] 涉及 Schema 变更已生成 migration
- [ ] API key 未泄漏到任何文件
