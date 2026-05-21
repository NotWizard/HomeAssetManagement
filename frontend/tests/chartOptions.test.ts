import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CORRELATION_HEATMAP_Y_AXIS_LABEL,
  CURRENCY_BREAKDOWN_LABEL,
  CURRENCY_BREAKDOWN_LABEL_LINE,
  CURRENCY_EXPOSURE_CHART_GRID,
  SANKEY_MEMBER_NODE_COLOR,
  SANKEY_SERIES_FRAME,
  TREND_CHART_GRID,
  VOLATILITY_CHART_GRID,
  VOLATILITY_Y_AXIS_NAME_GAP,
} from '../src/components/charts/chartOptionLayout.ts';

test('折线图和币种柱状图收紧 grid，避免与 containLabel 形成双重 padding', () => {
  assert.deepEqual(TREND_CHART_GRID, {
    left: 8,
    right: 16,
    bottom: 8,
    top: 36,
    containLabel: true,
  });
  assert.deepEqual(CURRENCY_EXPOSURE_CHART_GRID, {
    left: 8,
    right: 16,
    top: 36,
    bottom: 8,
    containLabel: true,
  });
});

test('热力图和桑基图不会继续默认截断左侧文本', () => {
  assert.deepEqual(CORRELATION_HEATMAP_Y_AXIS_LABEL, {
    color: '#8b90b7',
    width: 88,
    overflow: 'break',
    lineHeight: 14,
    margin: 14,
  });
  assert.deepEqual(SANKEY_SERIES_FRAME, {
    left: '4%',
    right: '4%',
    top: '4%',
    bottom: '4%',
  });
  assert.equal(SANKEY_MEMBER_NODE_COLOR, '#334155');
});

test('波动率图遇到样本不足（volatility=null）不会强转 0，tooltip 显示 N/A', async () => {
  // 直接 import 工具函数，避免触发 chartOptions.ts 整文件的 ECharts 间接依赖
  const { buildVolatilityValues, formatVolatilityTooltip } = await import(
    '../src/components/charts/volatilityValues.ts'
  );

  const values = buildVolatilityValues([
    { asset: '现金', volatility: 0.0, sample_size: 250, insufficient_data: false },
    { asset: '新加资产', volatility: null, sample_size: 3, insufficient_data: true },
    { asset: 'A 股', volatility: 0.18, sample_size: 220, insufficient_data: false },
  ]);

  assert.equal(values[0], 0, '真零波动应保留 0');
  assert.equal(
    values[1],
    null,
    '样本不足必须保持 null，不可强转为 0；零波动与样本不足在 UI 上必须可区分',
  );
  assert.equal(values[2], 18);

  assert.match(formatVolatilityTooltip('新加资产', null), /样本不足/);
  assert.match(formatVolatilityTooltip('A 股', 18), /18%/);
});

test('波动率图和币种拆分图为长标签保留可读布局', () => {
  assert.deepEqual(VOLATILITY_CHART_GRID, {
    left: 64,
    right: 16,
    top: 8,
    bottom: 44,
    containLabel: true,
  });
  assert.equal(VOLATILITY_Y_AXIS_NAME_GAP, 44);
  assert.deepEqual(CURRENCY_BREAKDOWN_LABEL, {
    color: '#4b5070',
    width: 126,
    overflow: 'break',
    lineHeight: 16,
  });
  assert.deepEqual(CURRENCY_BREAKDOWN_LABEL_LINE, {
    length: 14,
    length2: 12,
    maxSurfaceAngle: 80,
  });
});
