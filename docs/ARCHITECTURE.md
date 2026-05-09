# 全栈智码 v2.0 架构总览

```mermaid
graph TB
    subgraph "前端 (Next.js 14)"
        Shell[NavSidebar + Workbench + ChatDock]
        AgentChat[AgentChat · 流式渲染]
        StageBar[StageBar · 关卡流转]
        CodeBrowser[Code Browser · Monaco]
    end

    subgraph "API 层"
        Projects[Projects API]
        Artifacts[Artifacts API]
        Jobs[Jobs API · SSE]
        Sessions[Sessions API · WS]
        Gates[Gates API · HITL]
    end

    subgraph "Agent 矩阵"
        Req[RequirementAgent]
        Design[DesignAgent]
        Dev[DevAgent]
        Review[ReviewAgent]
    end

    subgraph "Pi SDK 0.73"
        SessionPool[PiSessionPool]
        Registry[ModelRegistry]
        Tools[Custom Tools]
        SessionManager[SessionManager]
    end

    subgraph "数据层"
        Prisma[Prisma · SQLite]
        Skeleton[Sandbox Skeleton]
        Workspace[Project Workspace]
    end

    Shell --> Projects
    AgentChat --> Jobs
    StageBar --> Gates
    Req & Design & Dev & Review --> SessionPool
    SessionPool --> Registry
    SessionPool --> Tools
    SessionPool --> SessionManager
    Dev --> Workspace
    Review --> Workspace
    Workspace --> Skeleton
    Prisma --> Projects & Artifacts & Gates & PiSession
```

## 核心数据流

1. **用户输入一句话需求** → RequirementAgent 生成 PRD → G1 锁定 → 进入设计
2. **设计阶段** → DesignAgent 生成 5 个子产物 → G2 锁定 → 进入开发
3. **开发阶段** → DevAgent 基于 Pi SessionPool 在 workspace 生成代码 → 沙箱启动验证 → G3 锁定
4. **审查阶段** → ReviewAgent 跑 eslint/tsc → 生成缺陷报告 → fixReview 闭环修复 → G4 锁定
5. **导出阶段** → Export 生成 zip/docx → G5/G6 锁定 → 完成交付

## 技术栈

- **框架**: Next.js 14 (App Router) + React 18
- **语言**: TypeScript 5
- **数据库**: SQLite (Prisma ORM 5.18)
- **AI**: Pi SDK 0.73 + DeepSeek API
- **沙箱**: Node.js child_process (Windows: shell mode)
- **前端**: Tailwind CSS + Alpine.js + shadcn/ui
