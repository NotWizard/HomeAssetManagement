// 图表布局常量：grid 决定绘图区相对容器的内边距，containLabel:true 时 ECharts 会
// 自动给 axis label 让位置（叠加在 grid 之上），所以 grid.left 不需要再额外预留 axis
// label 宽度，否则会形成"双重 padding"导致左右大块留白。
//
// 对没有 yAxis name 的折线/柱图，留白只需让 axis label 透出来 + 顶部给 legend 留 36px；
// 波动率柱图保留 yAxis name + 旋转标签所需的边距；桑基图按容器百分比给两侧节点 label 让出
// 空间即可，不必占到 9%。
export const TREND_CHART_GRID = {
  left: 8,
  right: 16,
  bottom: 8,
  top: 36,
  containLabel: true,
} as const;

export const VOLATILITY_CHART_GRID = {
  left: 64,
  right: 16,
  top: 8,
  bottom: 44,
  containLabel: true,
} as const;

export const VOLATILITY_Y_AXIS_NAME_GAP = 44;

export const CORRELATION_HEATMAP_Y_AXIS_LABEL = {
  color: '#8b90b7',
  width: 88,
  overflow: 'break',
  lineHeight: 14,
  margin: 14,
} as const;

export const CURRENCY_EXPOSURE_CHART_GRID = {
  left: 8,
  right: 16,
  top: 36,
  bottom: 8,
  containLabel: true,
} as const;

export const CURRENCY_BREAKDOWN_LABEL = {
  color: '#4b5070',
  width: 126,
  overflow: 'break',
  lineHeight: 16,
} as const;

export const CURRENCY_BREAKDOWN_LABEL_LINE = {
  length: 14,
  length2: 12,
  maxSurfaceAngle: 80,
} as const;

export const SANKEY_SERIES_FRAME = {
  left: '4%',
  right: '4%',
  top: '4%',
  bottom: '4%',
} as const;

export const SANKEY_MEMBER_NODE_COLOR = '#334155';
