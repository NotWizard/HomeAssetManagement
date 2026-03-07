# Migration Package Design

## 背景

当前项目已经具备成员、资产负债、每日快照与系统设置等核心能力，但缺少面向“跨环境迁移”的系统级导出/导入机制。现有 `CSV 导入` 属于业务录入工具，不能完整恢复家庭资产管理环境，也无法保证历史快照与分析口径的完整继承。

本次设计目标不是临时的 V1 备份功能，而是一套可以长期演进的 **迁移包（Migration Package）机制**，用于：

1. 一键导出当前环境中的核心业务数据。
2. 在新环境中一键恢复，并保证关键关系不丢失。
3. 为未来扩展更多迁移域与大体量数据预留兼容空间。

## 设计目标

### 必须覆盖的数据域

- `family`
- `settings`
- `members`
- `holdings`
- `daily_snapshots`

### 导入恢复原则

- 导入时默认采用“**先清空旧数据，再恢复迁移包**”模式。
- 导入必须是事务性的：
  - 成功时完整恢复。
  - 失败时原环境保持不变。
- 不要求恢复导出环境中的 `family.id`，但必须保证导出家庭信息能完整落到目标环境的默认家庭上。
- 不允许因为目标环境中不存在成员或已有残留数据而导致迁移失败或数据丢失。

### 长期演进原则

- 包格式必须支持版本化。
- 包内容必须支持增量扩展新的数据域。
- 大数据域必须支持流式导入与较低内存占用。

## 迁移包格式

迁移能力正式定义为 **HAM Migration Package**。

### 外层格式

- 文件类型：`zip`
- 文件名建议：`ham-migration-YYYY-MM-DDTHH-mm-ss.zip`

### 包内结构

```text
ham-migration-2026-03-07T23-40-00.zip
├── manifest.json
├── family.json
├── settings.json
├── members.json
├── holdings.ndjson
└── daily_snapshots.ndjson
```

### 文件格式选择

- 小数据域使用普通 JSON：
  - `family.json`
  - `settings.json`
  - `members.json`
- 大数据域使用 NDJSON：
  - `holdings.ndjson`
  - `daily_snapshots.ndjson`

这样设计的原因：

1. JSON 对小表可读性强，便于调试。
2. NDJSON 对大表更适合逐行导出与流式导入。
3. zip 天然带压缩，能降低快照类数据的包体积。
4. 后续扩展新的数据域时，不需要推翻整个格式。

## manifest 设计

`manifest.json` 只描述迁移包本身，不直接存业务主数据。

建议结构：

```json
{
  "package_type": "ham_migration",
  "schema_version": 1,
  "minimum_supported_version": 1,
  "exported_at": "2026-03-07T23:40:00Z",
  "app_version": "0.1.0",
  "domains": [
    {
      "name": "family",
      "file": "family.json",
      "format": "json",
      "row_count": 1,
      "checksum": "sha256:..."
    },
    {
      "name": "settings",
      "file": "settings.json",
      "format": "json",
      "row_count": 1,
      "checksum": "sha256:..."
    },
    {
      "name": "members",
      "file": "members.json",
      "format": "json",
      "row_count": 3,
      "checksum": "sha256:..."
    },
    {
      "name": "holdings",
      "file": "holdings.ndjson",
      "format": "ndjson",
      "row_count": 42,
      "checksum": "sha256:..."
    },
    {
      "name": "daily_snapshots",
      "file": "daily_snapshots.ndjson",
      "format": "ndjson",
      "row_count": 365,
      "checksum": "sha256:..."
    }
  ]
}
```

### manifest 职责

- 声明包格式与版本。
- 声明包中包含哪些数据域。
- 声明每个文件的格式、行数和校验值。
- 为未来新增迁移域提供兼容入口。

## 数据域设计

### family.json

建议导出字段：

- `name`
- `created_at`
- `updated_at`

说明：

- 迁移包中包含家庭信息，但导入时不强制恢复原始主键。
- 导入到新环境时，使用目标环境默认家庭作为承载容器，并将其业务属性更新为迁移包中的家庭信息。

### settings.json

建议导出字段：

- `base_currency`
- `timezone`
- `rebalance_threshold_pct`

说明：

- `fx_provider` 不作为可变迁移字段恢复。
- 导入时仍由现有系统规则强制固定为 `frankfurter`。

### members.json

建议导出字段：

- `id`
- `name`
- `created_at`
- `updated_at`

说明：

- 导入时保留 `member.id`，确保后续 `holding.member_id` 以及快照 payload 中对成员的引用一致。

### holdings.ndjson

每行一条持仓记录，建议导出字段：

- `id`
- `member_id`
- `type`
- `name`
- `currency`
- `amount_original`
- `amount_base`
- `target_ratio`
- `source`
- `is_deleted`
- `created_at`
- `updated_at`
- `category_l1_name`
- `category_l2_name`
- `category_l3_name`

说明：

- 不直接导出 `category_l1_id/l2_id/l3_id`，避免跨环境分类主键不一致。
- 导入时通过分类路径名称重新解析到目标环境的分类 ID。
- `amount_base` 作为历史值保留，避免导入时重新按新汇率回算造成历史失真。

### daily_snapshots.ndjson

每行一条日快照记录，建议导出字段：

- `snapshot_date`
- `created_at`
- `payload`

说明：

- `payload` 尽量原样保留，保证趋势、分析与历史口径稳定。
- 导入时保留快照内容，不重新生成历史快照。

## 导出流程

新增独立资源域：`migration`。

### 接口

- `POST /api/v1/migration/export`

### 服务流程

1. 读取默认家庭。
2. 读取并序列化 `family`、`settings`、`members`。
3. 流式写出 `holdings.ndjson` 与 `daily_snapshots.ndjson`。
4. 计算每个文件的 `row_count` 与 `checksum`。
5. 生成 `manifest.json`。
6. 将所有文件打成 zip。
7. 以下载流形式返回给前端。

### 前端行为

- 在“设置”页新增“数据迁移/备份”卡片。
- 用户点击“导出迁移包”后，直接触发下载。

## 导入流程

### 接口

- `POST /api/v1/migration/import`

### 导入总体流程

1. 上传 zip 文件。
2. 解压到临时目录。
3. 校验 zip 结构、必须文件、`manifest` 字段、checksum、数据格式。
4. 做引用一致性检查。
5. 全部通过后进入数据库事务。
6. 清空旧数据并恢复迁移包内容。
7. 提交事务，返回导入摘要。

### 校验阶段

至少检查：

- 包中是否存在 `manifest.json`。
- `package_type` 是否为 `ham_migration`。
- `schema_version` 是否受支持。
- 每个声明的数据域文件是否存在。
- 每个文件实际 checksum 是否与 `manifest` 一致。
- `holdings.member_id` 是否都能在 `members` 中找到。
- 每条持仓的分类路径名称是否都能解析到当前环境分类树。
- 快照数据结构是否完整。

### 恢复阶段

导入时默认采用“先清空，再恢复”的策略。

#### 清空顺序

1. `snapshot_daily`
2. `holding_item`
3. `member`
4. `settings`

`family`、`category` 不清空。

#### 恢复顺序

1. 更新默认家庭信息
2. 恢复 `settings`
3. 恢复 `members`
4. 恢复 `holdings`
5. 恢复 `daily_snapshots`

### 无丢失策略

- 只有在所有校验通过后才允许进入清空阶段。
- 清空与恢复放在单事务中执行。
- 任一步失败都回滚，原环境保持不变。

## 前端交互设计

迁移功能放在 `设置` 页，不放在现有 `CSV 导入` 页。

原因：

- `CSV 导入` 是业务录入能力。
- `Migration Package` 是系统级备份/迁移能力。
- 两者语义不同，分开更清晰。

### 设置页新增内容

新增“数据迁移 / 备份”卡片，包含：

1. **导出迁移包**
   - 一键下载 zip 包。
2. **导入迁移包**
   - 上传 zip 文件。
   - 强提示“将清空当前环境中的成员、资产负债、系统设置和日快照数据”。
   - 二次确认后执行导入。

### 导入成功后前端失效查询

- `settings`
- `members`
- `holdings`
- `trend`
- `rebalance`
- `volatility`
- `correlation`
- `sankey`

## 错误处理

导入错误分为三类：

1. **包结构错误**
   - 缺少 `manifest.json`
   - 缺少必须数据文件
   - 文件名或格式不符合规范
2. **版本/格式错误**
   - `schema_version` 不支持
   - `package_type` 不匹配
   - checksum 不一致
3. **数据一致性错误**
   - 成员引用缺失
   - 分类路径无法解析
   - 快照结构损坏

建议统一走现有 `AppError` 响应模型，继续保持 code-based 错误风格。

## 兼容与演进

本设计从第一版就考虑未来演进：

- 通过 `schema_version` 管理格式升级。
- 通过 `domains` 扩展新的迁移域。
- 后续可追加：
  - `event_snapshots`
  - `fx_rates`
  - `import_logs`
- 即使未来追加新域，也不影响当前包格式主体。

## 测试策略

至少覆盖以下测试：

1. **导出结构测试**
   - zip 是否包含全部必须文件。
   - `manifest` 是否正确记录域信息与行数。
2. **导入成功测试**
   - 空环境中可完整恢复。
   - 已有数据环境中可先清空再恢复。
3. **导入失败回滚测试**
   - checksum 错误时回滚。
   - 成员引用缺失时回滚。
4. **兼容性测试**
   - 不支持的 `schema_version` 能正确拒绝。
   - 缺少文件时给出明确错误。

## 决策结论

本次迁移能力最终采用：

- **ZIP 迁移包**
- **manifest + 分域文件**
- **小域 JSON + 大域 NDJSON**
- **导入前完整校验**
- **事务性清空并恢复**
- **`family` 纳入迁移包，但按业务语义恢复，不强制恢复旧主键**

这套方案可以同时满足当前“一键导出/导入迁移”的需求，也为未来更大规模数据和更多迁移域保留清晰的扩展空间。
