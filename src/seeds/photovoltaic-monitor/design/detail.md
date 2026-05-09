# 光伏电站监控系统 · 详细设计

## 页面路由

| 路由 | 页面 | 描述 |
|------|------|------|
| `/` | 实时仪表盘 | 电站概览大屏 |
| `/devices` | 设备列表 | 设备查询与状态 |
| `/devices/:id` | 设备详情 | 单设备数据曲线 |
| `/alerts` | 告警列表 | 告警记录与处理 |
| `/inspection` | 巡检管理 | 计划与记录 |
| `/reports` | 报表中心 | 日报/月报查看 |

## 组件树

```
App
├── Layout
│   ├── Sidebar (导航)
│   └── Header (用户信息)
├── Dashboard
│   ├── StatCard × 4 (关键指标)
│   ├── PowerChart (功率曲线)
│   └── AlertSummary (最近告警)
├── DeviceList
│   ├── SearchBar
│   ├── FilterDropdown
│   ├── DeviceTable
│   └── Pagination
└── AlertList
    ├── AlertFilter
    ├── AlertTable
    └── AlertDetailModal
```
