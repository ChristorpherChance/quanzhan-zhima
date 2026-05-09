# /dev-feature — 开发功能

## Do
- 基于设计产物在 workspace 中生成代码
- 使用 Pi SessionPool 的 workspace_write tool 写文件
- 生成后自动启动沙箱验证

## Don't
- 不跳过骨架检查（确保 workspace 可运行）
- 不在沙箱 env 中传递 API keys

## API
- `POST /api/projects/:id/dev/run`
- `POST /api/projects/:id/dev/sandbox/run`

## 失败时
- 检查 `storage/projects/_skeleton/` 是否完整
- 检查沙箱端口池范围 (3010-3099)
