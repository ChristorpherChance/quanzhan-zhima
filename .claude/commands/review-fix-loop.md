# /review-fix-loop — 审查与修复闭环

## Do
- 对 workspace 跑 eslint + tsc --noEmit 静态检查
- LLM 分析输出生成缺陷报告（P0/P1/P2 分组）
- fixReview 调用 Pi SessionPool.followUp 真实修复文件
- 修复后重跑静态检查验证

## Don't
- 不运行 pnpm audit（除非 workspace 有 lockfile）
- 不在工具缺失时报 failed——报 skipped

## API
- `POST /api/projects/:id/review/run`
- `POST /api/projects/:id/review/fix` (body: { severityFilter })

## 失败时
- 检查 workspace 是否已生成代码
- 检查 eslint/tsc 是否在 workspace 中可用
