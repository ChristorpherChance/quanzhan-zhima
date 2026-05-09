# /design-suite — 生成完整设计套件

## Do
- 基于已锁定的 PRD 依次生成: summary → api → db → detail → ui
- 每个子产物写完确认 END 标记: `<!-- END:design-{type} -->`
- UI 原型必须使用 Tailwind CDN + Alpine.js，至少 5 页面 + 8 类交互

## Don't
- 不跳过任何子产物
- 不在设计阶段决定技术栈（UI 除外）
- 不在 ui 中使用 React/Vue

## API
- `POST /api/projects/:id/design/generate` (body: { subtype })
- `POST /api/projects/:id/design/edit` (body: { subtype, instruction })

## 失败时
- 检查 PRD 是否已生成并锁定
- 检查 END 标记是否出现（截断则自动续写最多 3 次）
