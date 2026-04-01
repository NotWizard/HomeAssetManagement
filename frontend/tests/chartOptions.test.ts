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

test('折线图和币种柱状图会为纵坐标标签预留空间', () => {
  assert.deepEqual(TREND_CHART_GRID, {
    left: 72,
    right: 28,
    bottom: 44,
    top: 56,
    containLabel: true,
  });
  assert.deepEqual(CURRENCY_EXPOSURE_CHART_GRID, {
    left: 72,
    right: 28,
    top: 56,
    bottom: 44,
    containLabel: true,
  });
});

test('热力图和桑基图不会继续默认截断左侧文本', () => {
  assert.deepEqual(CORRELATION_HEATMAP_Y_AXIS_LABEL, {
    color: '#8b90b7',
    width: 112,
    overflow: 'break',
    lineHeight: 14,
    margin: 14,
  });
  assert.deepEqual(SANKEY_SERIES_FRAME, {
    left: '9%',
    right: '9%',
    top: '4%',
    bottom: '4%',
  });
  assert.equal(SANKEY_MEMBER_NODE_COLOR, '#334155');
});

test('波动率图和币种拆分图为长标签保留可读布局', () => {
  assert.deepEqual(VOLATILITY_CHART_GRID, {
    left: 92,
    right: 28,
    top: 28,
    bottom: 76,
    containLabel: true,
  });
  assert.equal(VOLATILITY_Y_AXIS_NAME_GAP, 72);
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
