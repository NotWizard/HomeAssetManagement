# 三级分类选择器（CategoryTreePicker）设计

- 状态：已敲定，待实施
- 日期：2026-05-22
- 适用范围：前端 EntryHoldingFormDialog（资产负债录入对话框）

## 背景

方案 D 落地后，分类树规模变成「资产 10 一级 / 33 二级 / 88 三级」+「负债 6 一级 / 16 二级 / 34 三级」，合计 122 个三级叶子。

当前实现把全部 122 个 "L1 / L2 / L3" 路径平铺塞进一个 `SearchableSelect` 下拉，截图反馈非常拥挤、难选：所有条目都以 "现金存款类 /"、"权益与另类 /" 等少量前缀开头，视觉噪音大，用户即使心里清楚自己想录"现金"，也要在 122 行里上下扫。

另一个隐性问题：录入表单里有独立的「类型（资产/负债）」Select，但这个 type 实际上被所选的分类根（如「现金存款类」必然是 asset）唯一决定，是冗余字段——既要用户多做一次决策，又要在前端做"切类型清空分类选择"的联动校验。

本设计同时解决这两件事。

## 决策日志

| # | 决策 | 选项 | 拍定 | 理由 |
|---|---|---|---|---|
| 1 | 主交互重心 | A 优化「找」（搜索/拼音） · B 优化「逛」（分层引导） · C 优化「常用置顶」 | B | 用户回答："我只知道是哪个大类，需要看选项带出决定" |
| 2 | 分层形式 | A 面包屑三段下拉 · B 两列面板（左一级、右二三级嵌套树） · C macOS 级联菜单 | A | 决策面最小（每屏 ≤10 项）、易理解（跟填表一致）、不撑大 dialog、可叠加搜索短路；B 是 power-user 变体可延后 |
| 3 | 是否同时保留搜索短路 | 加 · 不加 | 加 | 覆盖偶发的"精确知道叫 BTC"场景，与逐步选择互不冲突 |
| 4 | 控件形态 | A 统一 popover · B 三个独立 Select 串联 · C 嵌套 dialog/侧滑面板 | A | 跟现有 SearchableSelect 一致、dialog 内只占一行、popover 内有充足空间塞面包屑+搜索+列表 |
| 5 | 二级仅含 1 个三级时 | A 自动穿透 · B 仍走三步 | A | 方案 D 中有多处（亲友借款的三个二级、退休账户/公积金/教育储备等），自动穿透避免"明显多余"的一击 |
| 6 | 面包屑已选段是否可点 | A 可点重选 · B 只读 | A | 跟"面包屑"的语义天然契合，选错任一段可定点修而不必从头走 |
| 7 | 搜索匹配范围 | A 三级名都匹配 · B 仅匹配三级叶子 | A | "我记不清三级叫什么，只记得是加密类的"也能命中；召回略高的代价可接受 |
| 8 | 「类型（资产/负债）」字段 | A 保留独立 Select · B 装进 popover 顶部 tab | B | type 被分类根唯一决定，独立字段是冗余；并入后从根上不可能不一致，主表单少一行 |
| 9 | 是否支持拼音首字母 | A 加 · B 不加 | B | YAGNI——增加 10-30KB bundle + 拼音库依赖，先看实际是否痛 |

## 用户旅程

### 主表单（精简后）

字段：成员 · 名称 · **分类** · 币种 · 金额 · 期望占比

`分类` 是一行宽的控件：

```
分类
┌──────────────────────────────────────────────────────┐
│ 资产 · 现金存款类 / 银行存款 / 活期               ▾  │
└──────────────────────────────────────────────────────┘
```

未选时 placeholder：`请选择资产或负债的三级分类`。

### Popover 展开

```
┌─ popover ──────────────────────────────────────┐
│ [ 资产 (10) ]  [ 负债 (6) ]                       │ ← 顶部 tab
│ ──────────────────────────────────────────────  │
│ 全部 › 现金存款类 › 银行存款                       │ ← 面包屑（每段可点回退）
│ ──────────────────────────────────────────────  │
│ 🔍 输入名字直接搜（匹配一级/二级/三级）            │
│ ──────────────────────────────────────────────  │
│  ● 活期            ✅                              │
│  ○ 定期                                            │
│  ○ 大额存单                                        │
│  ○ 通知存款                                        │
└────────────────────────────────────────────────┘
```

### 4 条核心交互规则

1. **逐层缩范围**：在第 N 层点一个项 → 列表切到 N+1 层；切到 L3 点项 → popover 关闭、主表单回填
2. **二级唯一三级 → 自动穿透**：选某个只含 1 个三级的二级时，直接拿到完整三段路径，少一次点击
3. **面包屑回退**：点任一段直接切回那层的列表（已选状态保持，可换）
4. **搜索短路**：输入即跳出面包屑模式，下方显示"匹配项 → 完整路径"列表；点一项直接落地；清空输入回面包屑

### Tab 切换规则

切换「资产 ↔ 负债」tab 会清空 breadcrumb + searchTerm。当 value 已存在时给一行 inline 提示「切换类型会清空已选的分类」；value 为 null 时无声切换。

## 组件契约

新增 `frontend/src/components/entry/CategoryTreePicker.tsx`：

```ts
type CategoryPickerValue = {
  type: 'asset' | 'liability';
  l1Id: number;
  l2Id: number;
  l3Id: number;
};

type CategoryTreePickerProps = {
  value: CategoryPickerValue | null;
  onChange: (value: CategoryPickerValue) => void;
  assetTree: CategoryNode[];      // 已经从 GET /api/v1/categories 加载好
  liabilityTree: CategoryNode[];
  disabled?: boolean;
};
```

内部状态：

```ts
{
  open: boolean,
  activeType: 'asset' | 'liability',
  breadcrumb: { l1Id?: number; l2Id?: number },
  searchTerm: string,
}
```

打开 popover 时：
- 若 value 已存在，自动 `activeType = value.type`、`breadcrumb = {l1Id, l2Id}`、列表停在 L3，已选项高亮 ✅
- 若 value 为 null，`activeType = 'asset'`（默认）、`breadcrumb = {}`、列表显示资产 L1

## 纯逻辑函数（独立 module 便于单测）

新增 `frontend/src/components/entry/categoryTreePicker.ts`：

```ts
// 把当前激活类型的整树拍平成搜索匹配项
export function buildFlatSearchResults(
  tree: CategoryNode[],
  searchTerm: string,
  type: 'asset' | 'liability',
): Array<{ type, l1Id, l2Id, l3Id, l1Name, l2Name, l3Name, matchedSegment: 'l1'|'l2'|'l3' }>;

// 给定一个二级节点，判断它是否只含 1 个三级（用于自动穿透）
export function shouldAutoPenetrate(l2Node: CategoryNode): boolean;

// 给定 value，反查 type/l1Name/l2Name/l3Name（用于面包屑/主表单显示）
export function resolvePathFromValue(
  value: CategoryPickerValue | null,
  assetTree: CategoryNode[],
  liabilityTree: CategoryNode[],
): { type: 'asset'|'liability', l1Name: string, l2Name: string, l3Name: string } | null;
```

## 数据契约（保持不变）

- 后端 `holdings` schema 不动（`type + l1Id + l2Id + l3Id` 四字段保留）
- `POST /api/v1/holdings` / `PUT /api/v1/holdings/{id}` 请求 payload 不动
- CSV 导入/导出格式不动
- 仅前端表单结构变化：`form.type` 字段移除，由 `CategoryTreePicker` 的 value 间接提供

## 受影响的现有文件

| 文件 | 改动 |
|---|---|
| `frontend/src/components/entry/EntryHoldingFormDialog.tsx` | 删「类型」Select + 删旧「三级分类路径」SearchableSelect，加新 `CategoryTreePicker` |
| `frontend/src/components/entry/entryPageController.ts` | `buildHoldingPayload` / `validateEntryForm` 从 picker value 读 type + category ids，不再从 `form.type` 与 pathKey 拼装 |
| `frontend/src/components/entry/entryPageLogic.ts` | 删 `buildPathOptions` 工具函数（不再被消费） |
| 任何调用方 | 同步删除 `pathOptions` 参数 |
| `frontend/src/components/ui/searchable-select.tsx` | 不动（成员等其他控件还在用） |

## 测试增量

废：
- `frontend/tests/entryPage.test.ts::buildPathOptions ...`
- `frontend/tests/entryPageController.test.ts` 里所有 `pathOptions` 相关 case

加 `frontend/tests/categoryTreePicker.test.ts`：
- `buildFlatSearchResults`：空查询返回空、L1/L2/L3 任一段命中、大小写、命中段标识正确
- `shouldAutoPenetrate`：1 个 child 返回 true、多个 child 返回 false
- `resolvePathFromValue`：value=null 返回 null、正常 value 拼出三段名、id 在树里找不到时返回 null
- `EntryHoldingFormDialog` / `entryPageController` 相关测试：补一两条新 case 验证 type 由 picker 间接提供

## 实施计划

按依赖顺序：

1. 写设计文档 + commit（本步骤）
2. 实现 `categoryTreePicker.ts` 纯逻辑 + `CategoryTreePicker.tsx` UI 组件
3. 加 `categoryTreePicker.test.ts` 纯逻辑单测
4. 替换 `EntryHoldingFormDialog` 字段 + 更新 `entryPageController` / `entryPageLogic`
5. 删/改旧测试，跑 `npm run build` + `node --test`、浏览器跑一遍新增/编辑回归
6. 更新 CHANGELOG + commit 实施

## 不在范围内的事

- 拼音首字母搜索（YAGNI）
- 模糊匹配 / fuzzy ranking（先 substring，看实际反馈）
- "常用/最近选过的"置顶（用户场景偏 explore，不是 frequent-recall）
- 编辑现有 holding 时跨 type 改类（先看是否真有这种需求；当前 Tab 切换可达到同样效果）
- 后端 / API / 导入导出任何改动
