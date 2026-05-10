# UI 原型设计内置方法论

以下 7 大模块必须按顺序严格执行。产出的 HTML 必须包含所有模块。

## 1. 信息架构 (IA)
5 段式结构：
- **全局导航**：顶部固定，含产品名 + 主导航链接 + 命令面板入口 + 主题切换 + 语言切换 + 用户菜单
- **主操作区**：核心业务操作的按钮组（新建、搜索、筛选、批量操作）
- **次操作区**：表格/卡片/详情视图切换、排序控件
- **状态展示**：统计卡片、进度条、时间线
- **帮助说明**：底部固定或浮动的帮助按钮、快捷键提示

列出每个页面在 IA 中的位置和层级关系。

## 2. 设计令牌 (Design Tokens)
在 `:root` 中定义 CSS 变量：
- **色板**：primary / secondary / success / warning / danger / neutral 各 11 阶（50-950）
- **字号**：xs(12px) sm(14px) base(16px) lg(18px) xl(20px) 2xl(24px) 3xl(30px)
- **间距**：1(4px) 2(8px) 3(12px) 4(16px) 5(24px) 6(32px) 7(48px) 8(64px)
- **圆角**：sm(6px) md(10px) lg(14px) xl(20px)
- **阴影**：sm / md / lg / xl
- **动效**：timing-fast(150ms) timing-normal(300ms) timing-slow(500ms)

## 3. 组件库映射 (shadcn/ui 命名)
使用 Tailwind class + Alpine.js 行为模拟以下组件：
Button / Input / Select / Dialog / Drawer / Tabs / Table / Card / Badge / Toast / Skeleton / Tooltip / DropdownMenu / Pagination / EmptyState / ErrorBoundary

## 4. 页面模板
所有 list/detail 页必须套用：
```
PageHeader（标题 + 面包屑 + 主操作按钮）
  + Toolbar（筛选 + 搜索 + 视图切换）
  + Content（表格 / 卡片 / 详情）
  + Footer / Pagination
```

## 5. 可访问性 (a11y)
- 所有交互元素带 `aria-*` 属性
- 键盘可达（Tab / Esc / Enter）
- 对比度 ≥ 4.5:1
- 表单控件必须 `<label>` 关联

## 6. 响应式
- 4 断点：sm(640px) / md(768px) / lg(1024px) / xl(1280px)
- 表格 < md 转卡片视图
- 侧边栏 < md 折叠为抽屉

## 7. Mock 数据规范
- 从 PRD AC 中抽取实体名
- 生成 ≥ 12 条假数据
- 时间使用最近 30 天
- 包含正常 / 边界 / 异常三类样本
