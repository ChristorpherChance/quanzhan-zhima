# 用电异常告警系统 · 数据库设计

## 表结构

### monitoring_points
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | 监测点ID |
| name | TEXT | 名称 |
| location | TEXT | 位置(车间/产线) |
| ratedVoltage | REAL | 额定电压(V) |
| ratedCurrent | REAL | 额定电流(A) |
| warnThreshold | REAL | 预警阈值(百分比) |
| criticalThreshold | REAL | 严重阈值(百分比) |
| enabled | INTEGER | 是否启用 |

### alerts
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | 告警ID |
| pointId | TEXT FK | 监测点 |
| level | TEXT | L1/L2/L3 |
| metric | TEXT | 超限指标(voltage/current/power) |
| currentValue | REAL | 当前值 |
| thresholdValue | REAL | 阈值 |
| message | TEXT | 告警描述 |
| status | TEXT | pending/acknowledged/resolved |
| acknowledgedBy | TEXT | 确认人 |
| createdAt | DATETIME | 创建时间 |

### notifications
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | 通知ID |
| alertId | TEXT FK | 关联告警 |
| channel | TEXT | in_app/email/sms |
| recipient | TEXT | 接收人 |
| sent | INTEGER | 是否已发送 |
| read | INTEGER | 是否已读 |
| createdAt | DATETIME | 发送时间 |

### power_data
| 字段 | 类型 | 说明 |
|------|------|------|
| time | DATETIME PK | 时间戳 |
| pointId | TEXT PK | 监测点 |
| voltage | REAL | 电压 |
| current | REAL | 电流 |
| power | REAL | 功率 |
| powerFactor | REAL | 功率因数 |
