# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

## 5. Detailed Commit Messages

**A commit message is the manual for the code, not a复读机 of the diff.**

Readers should understand what changed and why without reading the code.

### Language

- **All commit messages (subject and body) must be written in Chinese.**
- Keep Conventional Commit English `type` and `scope` (e.g. `feat(ui):`).
- Technical terms (API names, SQL keywords, CSS properties, etc.) remain in English.

### Subject Line

```
type(scope): what was done
```

- **type**: `feat` | `fix` | `refactor` | `docs` | `test` | `perf` | `chore`
- **scope**: `ui` | `api` | `scheduler` | `storage` | `web` | `database` | `core` | `frontend` etc.
- **description**: Chinese, max 50 characters, no trailing period.
- Example: `feat(ui): 重构 Alerts 页面，对齐 React 版极客表格设计`

### Body Depth: Scale by Change Size

Not every commit needs an essay. Choose depth based on scope:

| Size | Criteria | Body Requirement |
|------|----------|------------------|
| **Small** | ≤2 files, single-line/ single-function fix, pure formatting | Body optional if subject is clear; otherwise one sentence |
| **Medium** | 3-5 files, logic changes, new standalone functions/components | **Required**: opening summary (what + why) + bullet list |
| **Large** | >5 files, page refactor, cross-stack feature, architecture change | **Required**: opening summary + **structured sections** (see below) |

### Body Structure

**Paragraph 1: Summary (what + why) — required for Medium and above**

1-3 sentences stating what was done and why. This is the most important part. Answer:
- What problem does this change solve / what goal does it achieve?
- Why was this approach chosen over alternatives?

> Do not jump straight into a bullet list. Give the reader context first.

**From Paragraph 2: Structured Sections — required for Large changes**

Split content into clearly titled sections with `##`. Section titles are **not rigidly fixed**; pick the structure that best matches the nature of the change:

- **UI refactor**: `## 页面结构` + `## 移除` + `## 新增`
- **Cross-stack feature**: `## 后端` + `## 前端`
- **Design-system / config**: `## 设计系统变更` + `### sub-file / sub-module`
- **Bug fix**: `## 修复` + `## 根因` (root-cause section is mandatory)
- **Before/after fix**: `## 修复前` + `## 修复后`
- **Performance**: `## 优化点` + `## 验证`

### Examples

All examples below demonstrate the **Chinese output format** that must be used in actual commits.

**Example A: UI Refactor (`## 页面结构` + `## 移除` + `## 新增`)**

```
feat(ui): 重构 Alerts 页面，对齐 React 版极客表格设计

简化为纯 HTML 表格 + glass-card 容器，去掉 Tab 切换、筛选区、
柱状图、详情抽屉等复杂功能，完全对齐 Gemini React 参考设计。

## 页面结构
- 标题区："历史告警记录"（text-3xl font-black uppercase）+ 描述
- glass-card 包裹的纯 HTML 表格：
  - 表头：bg-surface/50 border-b，小字 uppercase
  - 列：触发时间 / 饰品名称 / 警报详情 / 类型
  - 类型标签：price_drop(绿) / price_surge(红) / quantity_change(琥珀)
  - 行悬停：hover:bg-white/5
- 分页保留

## 移除
- Tab 切换（普通/极致告警）
- 筛选区（类型/日期/名称筛选）
- 告警趋势柱状图（ECharts）
- 详情抽屉（价格上下文表）
- 按日期分组显示
- PageHeader/SkeletonCard/SkeletonChart/SkeletonTable 组件
- @vicons/ionicons5 图标

## 新增
- lucide-vue-next 图标：Bell/TrendingDown/TrendingUp/AlertCircle/Zap
- getTypeIcon/getTypeBadgeClass 函数
- 完整浅色模式适配
```

**Example B: Cross-Stack Feature (`## 后端` + `## 前端`)**

```
feat: 实现饰品图片获取功能，通过 Steam 社区市场 API 获取图标

新增完整的饰品图片获取链路：后端代理 Steam API → 数据库缓存 → 前端展示。

## 后端

### api/steam_images.py（新建）
- fetch_icon_url()：通过 Steam 社区市场搜索 API 获取饰品图标 URL
- fetch_icon_urls_batch()：批量获取
- 使用 httpx 异步调走 TELEGRAM_PROXY 代理，15 秒超时
- CDN 格式：https://community.akamai.steamstatic.com/economy/image/<path>

### storage/database.py
- _migrate_items_table()：新增 icon_url TEXT 列迁移
- bulk_upsert_items()：SQL 增加 icon_url 字段
- 新增 update_item_icon_url() / get_item_icon_url()

### web/routers/prices.py
- GET /items/{name}/icon：获取饰品图标（优先数据库缓存）
- POST /items/icons/sync：批量同步缺少图标的饰品

## 前端

### SteamItemImage.vue（新建）
- 通用饰品图片组件，支持 iconUrl 直传或 marketHashName 自动获取
- 加载失败 fallback 到 emoji 显示

### Watchlist.vue / ExtremeTrack.vue / ItemDetail.vue
- 图片区从 emoji 替换为 SteamItemImage 组件
```

**Example C: Bug Fix (`## 修复` + `## 根因`)**

```
fix: 修复 alerts API 带 market_hash_name 过滤时 SQL 列名歧义导致 500

get_alerts() 函数中 JOIN watchlist 表后，WHERE 子句的
market_hash_name 列未加表别名前缀，SQLite 报 ambiguous column name。

## 修复
- conditions 中 market_hash_name LIKE ? 改为 a.market_hash_name LIKE ?
- COUNT 查询也加上表别名 a

## 根因
alert_logs 和 watchlist 表都有 market_hash_name 列，
LEFT JOIN 后未限定表别名导致歧义。
```

**Example D: Before/After Fix (`## 修复前` + `## 修复后`)**

```
fix(auth): 修复 /me 端点认证失效问题 — B-04

/me 端点使用 Depends(lambda r: None) 作为依赖，完全无效，
任何人未登录也能命中该端点。

## 修复前
- /me 端点使用 Depends(lambda r: None) 作为依赖，完全无效
- 函数永远硬编码返回 {"username": "admin", "role": "admin"}
- 前端无法通过 /api/auth/me 判断真实登录状态

## 修复后
- 改用 Depends(require_auth) 进行 JWT 认证
- 从 JWT payload 中读取 sub 字段返回真实用户名
- 未认证用户访问将返回 401 Unauthorized
```

**Example E: Small Change (one sentence is enough)**

```
fix(core): extreme_tracker 平台名称大小写不敏感比较

平台名称从 SteamDT API 返回时大小写不一致（如 "buff" vs "BUFF"），
导致同一平台被当作不同平台处理。
```

### Key Principles

| Principle | Rule |
|-----------|------|
| **Why before what** | The opening paragraph must explain *why* the change was made. Never jump straight into a bullet list. |
| **Scale by change size** | A one-line fix gets one sentence; a page refactor gets structured sections. Do not write a novel for a single-line change. |
| **Refactors must list removed and added items** | Let readers see the scope of change at a glance. |
| **Bug fixes must include root cause** | Prevents future regressions and is the core of code review. |
| **Section titles are flexible** | Do not force `## 移除` / `## 新增`; pick the structure that matches the change. |
| **Max 72 chars per line** | `git log` folds at this width; avoid auto-wrapping. |

### Bad Example (do not write like this)

```
fix(ui): ItemDetail 平台价格排序与红色高亮特效

- 平台价格按有价格优先、高价在前、无价格置后的规则排序
- 最高价标签添加科技脉搏特效（呼吸光晕 + LED 指示点）
- 修复 item-hero 卡片在深色模式下背景泄漏为白色的问题
- 弃用 n-tag 硬编码 default/primary 背景，改用透明底 + 细边框
```

**Problems**:
1. No opening summary; jumps straight into flat bullet list. Reader has no context.
2. No structured sections; low information density.
3. The background-color bug has no root-cause explanation.

### Good Example (write like this)

```
fix(ui): ItemDetail 平台价格排序与红色高亮特效

平台价格标签在深色模式下背景与卡片冲突导致难以阅读，
且价格为 0 的平台被错误地标记为最低价高亮。
同时 item-hero 卡片使用了未定义的 CSS 变量，在深色模式下 fallback 到白色背景。

## 核心改动
- 平台价格排序：有价格按降序排前面，价格为 0 的按平台名排后面
- 最高价高亮：弃用 n-tag 的 default/primary 硬编码背景，改用透明底细边框 + 红色呼吸光晕

## 移除
- n-tag 的 `:type="p.price === minPlatformPrice ? 'primary' : 'default'"` 逻辑
- item-hero 的 `background: var(--n-card-color, #fff)`（变量未定义导致白色泄漏）

## 新增
- `sortedPlatformPrices` / `maxPlatformPrice` computed 属性
- `.platform-tag--highest` 红色科技脉搏特效（呼吸光晕 + LED 指示点动画）
- item-hero 深色模式毛玻璃背景 `rgba(15, 15, 18, 0.6)`

## 根因
`--n-card-color` 在 item-hero 的 DOM 作用域内未定义，CSS fallback 到 `#fff`，
导致深色模式下卡片背景为纯白色，与深灰色的 n-tag 形成强烈反差。
```

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
