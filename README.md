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

## 故障排查

### `max_tokens 参数错误 / 400 Bad Request`

原因：Agent 设置中 maxTokens 超出提供商范围。
解决：进入「设置 > Agent 配置 > 基础参数」，将 Max Tokens 调整到 256-16384 范围。系统已自动钳制越界值（K4）。

### 「阶段条件未满足」无法进入下一阶段

原因：当前阶段产物未全部锁定（G1 需 PRD 锁定，G2 需 5 项设计产物全锁定）。
解决：在对应页面点击「确认」或「一键确认全部」按钮锁定产物。设计页面右上角可一键锁定 5 项（K9）。

### UI 原型内容截断或不完整

原因：LLM 输出达到 max_tokens 上限。
解决：系统已内置连续续写 + selfCheckUi 自检（K7），UI 评分 < 70 自动补写。手动方案：增大 Agent 的 Max Tokens 设置。

### PRD 编辑器无法编辑

原因：PRD 已锁定（只读状态）。
解决：右上角会显示「PRD 已锁定（只读）」提示。如需解锁，管理员可通过 API 手动解锁。

### 使用本地 Ollama 模型

1. 启动 Ollama：`ollama serve`
2. 拉取模型：`ollama pull qwen2.5:14b`
3. 在 `.env.local` 中设置：`OLLAMA_BASE_URL=http://localhost:11434/v1`
4. 进入「设置 > LLM 提供商」启用 Ollama（K5）

### 找不到设置页面

顶部导航栏或左侧底部有「设置」入口（齿轮图标）。点击进入后左侧菜单可访问 LLM、Agent、HITL、沙箱和导出配置（K1）。

### 构建/类型检查不通过

```bash
pnpm typecheck  # TypeScript 类型检查
pnpm build      # Next.js 生产构建
pnpm smoke:e2e  # 端到端冒烟测试
```

## 种子项目

- **光伏电站监控系统**: 设备状态监测 + 告警 + 巡检
- **用电异常告警系统**: 多级阈值 + 通知 + 统计分析
