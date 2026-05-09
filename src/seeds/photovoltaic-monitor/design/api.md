# 光伏电站监控系统 · API 设计

## RESTful API

### 设备管理
- `GET /api/devices` — 设备列表（分页、搜索、筛选）
- `GET /api/devices/:id` — 设备详情
- `POST /api/devices` — 注册新设备

### 实时数据
- `GET /api/devices/:id/realtime` — 设备实时数据
- `GET /api/dashboard/summary` — 仪表盘摘要

### 告警
- `GET /api/alerts` — 告警列表（分页、按级别/状态筛选）
- `POST /api/alerts/:id/acknowledge` — 确认告警
- `POST /api/alerts/:id/resolve` — 解决告警

### 巡检
- `GET /api/inspections` — 巡检记录列表
- `POST /api/inspections` — 提交巡检记录

### 报表
- `GET /api/reports/daily` — 日报
- `GET /api/reports/monthly` — 月报

## 数据格式

### 设备对象
```json
{
  "id": "inv-a01",
  "name": "逆变器 A-01",
  "type": "inverter",
  "status": "online",
  "power": 12.4,
  "temperature": 42,
  "updatedAt": "2024-01-15T14:32:00Z"
}
```

### 告警对象
```json
{
  "id": "alt-001",
  "deviceId": "inv-b01",
  "level": "warning",
  "message": "温度超过阈值 (58°C)",
  "status": "pending",
  "createdAt": "2024-01-15T14:32:00Z"
}
```
