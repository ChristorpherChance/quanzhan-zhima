# 光伏电站监控系统 · 数据库设计

## 表结构

### devices
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | 设备ID |
| name | TEXT | 设备名称 |
| type | TEXT | 类型(inverter/combiner/meter) |
| location | TEXT | 安装位置 |
| ratedPower | REAL | 额定功率(kW) |
| status | TEXT | online/offline/warning |
| updatedAt | DATETIME | 最后更新时间 |

### alerts
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | 告警ID |
| deviceId | TEXT FK | 关联设备 |
| level | TEXT | info/warning/error/critical |
| message | TEXT | 告警内容 |
| status | TEXT | pending/acknowledged/resolved |
| createdAt | DATETIME | 告警时间 |

### inspections
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | 巡检ID |
| deviceId | TEXT FK | 巡检设备 |
| inspector | TEXT | 巡检人 |
| type | TEXT | 日常/季度/故障 |
| result | TEXT | normal/abnormal |
| notes | TEXT | 备注 |
| createdAt | DATETIME | 巡检时间 |

### device_data (时序)
| 字段 | 类型 | 说明 |
|------|------|------|
| time | DATETIME PK | 时间戳 |
| deviceId | TEXT PK | 设备ID |
| power | REAL | 功率 |
| voltage | REAL | 电压 |
| current | REAL | 电流 |
| temperature | REAL | 温度 |
