# /prd-draft — 生成 PRD 文档

## Do
- 分析用户输入的一句话需求
- 调用 RequirementAgent.clarify 生成澄清问题
- 用户回答后调用 RequirementAgent.draft 生成完整 PRD
- PRD 包含: 背景/目标/用户角色/功能列表(F1..Fn)/AC 验收条件/非功能需求

## Don't
- 不跳过澄清步骤直接生成 PRD
- 不新增用户未提及的功能

## API
- `POST /api/projects/:id/requirement/clarify`
- `POST /api/projects/:id/requirement/draft`

## 失败时
- 检查 DEEPSEEK_API_KEY 是否配置
- 运行 `pnpm tsx scripts/smoke-pi.ts` 验证 Pi 连接
