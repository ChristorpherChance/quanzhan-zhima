# 编码 Playbook

以下 12 条为硬性约束。违反任意一条必须在 `SELF_REVIEW.md` 中标注 Fail 并说明原因。

---

## 1. 项目结构

- `package.json` 必须包含 `name`、`private: true`、`scripts.dev`、`scripts.build`、`scripts.start`
- `tsconfig.json` 必须配置 `strict: true`、`paths.@/* → ./*`
- `next.config.mjs` 不允许引入已知不兼容插件
- `.gitignore` 至少包含 `node_modules`、`.next`、`*.db`

**反例**：`package.json` 缺少 `scripts.build` → `npm start` 报 404。

---

## 2. 命名

- React 组件文件名与组件名一致，PascalCase
- 路由目录 kebab-case：`app/user-profile/` 而非 `app/userProfile/`
- API route handler 命名：`export const GET/POST/PUT/DELETE`
- 数据库表名小写下划线复数：`user_profiles`

**反例**：组件文件 `myButton.tsx` 但导出 `export function Btn()`；路由 `app/UserProfile/page.tsx` URL 为 `/UserProfile` 不符合规范。

---

## 3. 类型安全

- 禁止 `any`，除非有注释说明为什么
- API 入参/出参必有 `interface` 或 `z.infer<>`
- `useState` 无初始值时显式标注泛型：`useState<User | null>(null)`
- `fetch` 返回值必须类型守卫后使用

**反例**：`const data = await res.json()` 随后直接 `data.items.map(...)` 无类型断言 → 运行时 `undefined.map`。

---

## 4. 错误处理

- 所有 `fetch` 调用检查 `res.ok`，非 2xx 抛错
- 数据库操作 try-catch，出错返回 500 而非崩溃
- UI 必须有 ErrorBoundary 包裹或 error.tsx 页面
- 用户可见错误信息不得暴露内部路径或堆栈

**反例**：`const data = await fetch('/api/x').then(r => r.json())` 未检查 `r.ok`，API 返回 500 HTML 时 `r.json()` 抛 `SyntaxError`。

---

## 5. 数据校验

- 服务端 API 入参用 zod schema 校验
- 数据库写入前校验必填字段、字段长度、外键存在性
- 前端表单提交前校验 + 服务端再次校验（双重保险）
- 校验失败返回 400 而非 500

**反例**：`app.post('/api/users', (req, res) => { db.users.create(req.body) })` 无校验 → 空 name、超长 email 直接入库。

---

## 6. 数据库

- 仅使用 better-sqlite3，不得引入 PostgreSQL/MySQL 驱动
- 连接串从环境变量或 `DATABASE_URL` 读取，不得硬编码
- 迁移用 `db.exec(SCHEMA_SQL)` 在首次连接时执行
- 查询参数化，禁止字符串拼接 SQL

**反例**：`db.exec(\`SELECT * FROM users WHERE name = '\${username}'\`)` → SQL 注入。

---

## 7. API 设计

- 路由为 Next.js 14 Route Handler：`export async function GET()`
- URL 路径与 design-api 一一对应：方法、路径、参数、响应结构一致
- 统一错误响应格式：`{ error: { code: string; message: string } }`
- 非 GET 请求检查 `Content-Type: application/json`

**反例**：design-api 定义 `GET /api/items?page=1` 但实现为 `GET /api/items/list` → 前端调用 404。

---

## 8. UI 组件

- 优先使用 shadcn/ui 组件：Button、Input、Card、Dialog、Select 等
- 自定义组件放 `components/` 目录，命名导出
- 页面级 loading.tsx / error.tsx 必须存在
- 空态（无数据）、加载态（骨架屏）、错误态（重试按钮）三态齐全

**反例**：列表页无 loading.tsx → 数据加载时白屏；无 error.tsx → API 失败时页面崩溃。

---

## 9. 可访问性

- 交互元素（按钮/链接/输入框）必须有可读文本或 aria-label
- 表单元素关联 `<label htmlFor={id}>`
- 颜色对比度 ≥ 4.5:1（文本）或 3:1（大文本）
- 图标按钮必须设 aria-label

**反例**：`<button onClick={close}><XIcon /></button>` 无 aria-label → 屏幕阅读器读"按钮"。

---

## 10. 安全

- 不得在前端代码中暴露 API Key、数据库密码等凭据
- API 路由不做客户端 IP 信任；鉴权逻辑不放前端
- `dangerouslySetInnerHTML` 必须先用 DOMPurify 清洗
- 禁止 `eval()`、`new Function()`、`fs.writeFile` 以用户输入为路径

**反例**：`<div dangerouslySetInnerHTML={{ __html: userBio }} />` 无清洗 → XSS。

---

## 11. 性能

- 图片使用 Next.js `<Image>` 组件自动优化
- 列表超过 50 项使用虚拟滚动或分页
- 禁止在 render 中创建新对象/函数并作为 deps 传给 useEffect
- 数据库查询加索引：WHERE / ORDER BY / JOIN 字段

**反例**：首页 `getServerSideProps` 无缓存查全表 10 万行 → TTFB 3s+。

---

## 12. 测试

- 测试框架 vitest，写 `tests/` 目录
- 至少覆盖 3 条核心 AC 的测试用例
- 测试文件命名：`{模块名}.test.ts`
- 数据库测试使用 `:memory:` 模式，测试后自动清理

**反例**：`test('works', () => { expect(1+1).toBe(2) })` → 假覆盖率，未测任何业务逻辑。
