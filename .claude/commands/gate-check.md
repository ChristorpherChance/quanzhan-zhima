# /gate-check — 关卡检查与流转

## Do
- 6 级关卡: G0 立项 → G1 需求 → G2 设计 → G3 开发 → G4 审查 → G5 导出 → G6 交付
- 每关条件满足后锁定，自动推进 project.currentStage
- 支持手动锁、手动重开、auto-evaluate

## API
- `POST /api/projects/:id/gates/:gate/lock`
- `POST /api/projects/:id/gates/:gate/reopen`
- `POST /api/projects/:id/gates/auto-evaluate`

## 关卡条件
- G0: oneLiner ≥ 8 字
- G1: PRD 已生成并锁定
- G2: 5 个设计子产物全部锁定
- G3: workspace 有 package.json + 沙箱启动成功
- G4: 审查报告无 P0 缺陷
- G5: 至少一个 export 成功
- G6: G0-G5 全部锁定
