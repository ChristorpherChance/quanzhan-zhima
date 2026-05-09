# 用电异常告警系统 · API 设计

## RESTful API

### 监测点
- `GET /api/monitoring-points` — 监测点列表
- `GET /api/monitoring-points/:id` — 监测点详情+实时数据
- `POST /api/monitoring-points` — 注册监测点
- `PATCH /api/monitoring-points/:id/thresholds` — 更新阈值

### 实时数据
- `GET /api/data/realtime?points=mp1,mp2` — 批量实时数据
- `GET /api/data/history?point=mp1&from=&to=` — 历史数据查询

### 告警
- `GET /api/alerts?level=&status=&from=&to=` — 告警列表
- `POST /api/alerts/:id/acknowledge` — 确认
- `POST /api/alerts/:id/resolve` — 解决
- `GET /api/alerts/stats?period=daily|weekly|monthly` — 告警统计

### 通知
- `GET /api/notifications` — 未读通知
- `POST /api/notifications/:id/read` — 标为已读

## 告警级别定义

| 级别 | 名称 | 触发条件示例 | 通知方式 |
|------|------|-------------|---------|
| L1 | 预警 | 超过额定值 80% | 站内信 |
| L2 | 警告 | 超过额定值 95% | 站内信 + 邮件 |
| L3 | 严重 | 超过额定值 110% 或持续超限 | 站内信 + 邮件 + 短信 |
