# 全栈智码 (Stack Coder)

AI 驱动的全栈开发平台 — 从需求到代码，全程自动编排。

## 简介

全栈智码覆盖完整软件开发生命周期的 5 个阶段：

| 阶段 | 说明 | Gate |
|------|------|------|
| 需求分析 | 澄清需求 → 起草 PRD → 编辑锁定 | G1 |
| 设计 | 概要/详细/API/数据库/UI 原型 5 子产物 | G2 |
| 开发 | Pi SDK 驱动代码生成 + 沙箱预览 | G3 |
| 审查 | Lint/Types/Audit/Unit 自动审查 + 修复 | — |
| 导出 | md/docx/xlsx/zip 多格式导出 | — |

## 快速开始

### 环境要求

- Node.js >= 20
- pnpm >= 8
- git (for zip export)

### 安装

```bash
# 安装依赖
pnpm install

# 初始化数据库
pnpm prisma migrate dev -n init

# 启动 dev server
pnpm dev
```

### 环境变量

在 `.env.local` 中配置：

```env
DEEPSEEK_API_KEY="sk-xxxxx"  # 必填，主 LLM
ANTHROPIC_API_KEY=""          # 可选，备选
KIMI_API_KEY=""               # 可选
XIAOMI_API_KEY=""             # 可选
OPENAI_API_KEY=""             # 可选
DATABASE_URL="file:./data/app.db"
```

## 技术栈

- **前端**: Next.js 14 App Router + Tailwind CSS + shadcn/ui
- **后端**: Next.js Route Handlers (REST + SSE)
- **数据库**: Prisma ORM + SQLite
- **AI**: Deepseek V4 Pro (主) + 多 Provider 降级链
- **代码生成**: Pi SDK (@mariozechner/pi-coding-agent v0.73.0)
- **导出**: pandoc (docx) / ExcelJS (xlsx) / simple-git (zip)

## 项目结构

```
src/
├── app/                    # Next.js App Router
│   ├── api/               # REST API Route Handlers
│   ├── projects/          # 项目页面
│   └── settings/          # 设置页面
├── agents/                # AI Agent 编排层
│   ├── orchestrator.ts    # Job 状态机
│   ├── requirement-agent.ts
│   ├── design-agent.ts
│   ├── dev-agent.ts
│   └── review-agent.ts
├── components/            # UI 组件
│   ├── ui/               # shadcn 基础组件
│   ├── workbench/        # 业务组件
│   └── marketing/        # 彩蛋组件
├── config/               # 配置 (LLM/路径/端口/提示词)
├── lib/                  # 基础设施
│   ├── llm/              # LLM 网关
│   ├── pi/               # Pi SDK 集成
│   ├── sandbox/          # 沙箱
│   ├── hitl/             # Gate 关卡
│   ├── export/           # 导出引擎
│   └── db/               # 数据库
├── seeds/                # 种子项目
│   ├── photovoltaic-monitor/
│   ├── power-anomaly-alert/
│   └── egg/
└── scripts/              # 工具脚本
```

## 命令

| 命令 | 说明 |
|------|------|
| `pnpm dev` | 启动开发服务器 |
| `pnpm build` | 生产构建 |
| `pnpm lint` | ESLint 检查 |
| `pnpm test` | 运行 vitest 测试 |
| `pnpm verify` | 环境验证 |
| `pnpm smoke:llm` | LLM 连通性测试 |
| `pnpm smoke:pi` | Pi SDK 测试 |
| `pnpm seed-cache` | 写入种子项目 |

## HITL 模式

| 模式 | 说明 |
|------|------|
| 手动 (manual) | 每个 Gate 需人工点击锁定 |
| 全自动 (auto) | Gate 自动流转 |
| 混合 (hybrid) | AI 自评分 >= 阈值自动通过，否则需人工 |

## 种子项目

- **光伏电站监控系统**: 设备状态监测 + 告警 + 巡检
- **用电异常告警系统**: 多级阈值 + 通知 + 统计分析
