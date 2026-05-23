import { useMemo } from 'react';

import { cn } from '../../lib/cn';

type Props = {
  dates: string[];
  totalAsset: number[];
  totalLiability: number[];
  netAsset: number[];
  className?: string;
};

// 纯 SVG 迷你趋势图：用在 OverviewPage 首页替代 ECharts TrendChart，
// 让首屏（LCP 路径）不再付出 ~600 KB 的 echarts-core + zrender 下载。
// 设计意图：信号传达「这几天净资产怎么走」即可，不需要 tooltip / axes /
// 复杂交互（用户想看细节会去分析看板）。
//
// - 三条折线（净资产 / 总资产 / 总负债），用同样的归一化把每条独立映射到
//   ~10% 顶部边距 + 80% 高度的画布，互相不重叠
// - 端点圆点 + 渐变填充强化"最新一刻"
// - 长边自动撑满父容器（preserveAspectRatio="none"）以匹配父布局
const VIEW_BOX_WIDTH = 600;
const VIEW_BOX_HEIGHT = 200;
const TOP_PADDING_RATIO = 0.1;
const USABLE_HEIGHT_RATIO = 0.8;

type SeriesStyle = {
  stroke: string;
  fill: string;
  label: string;
};

const SERIES_STYLES: Record<'net' | 'asset' | 'liability', SeriesStyle> = {
  net: { stroke: '#2563eb', fill: 'rgba(37, 99, 235, 0.10)', label: '净资产' },
  asset: { stroke: '#16a34a', fill: 'rgba(22, 163, 74, 0.06)', label: '总资产' },
  liability: { stroke: '#dc2626', fill: 'rgba(220, 38, 38, 0.06)', label: '总负债' },
};

function buildPath(values: number[]): { line: string; area: string; endpoint: { x: number; y: number } | null } {
  if (values.length === 0) {
    return { line: '', area: '', endpoint: null };
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = values.length === 1 ? VIEW_BOX_WIDTH : VIEW_BOX_WIDTH / (values.length - 1);
  const points = values.map((value, index) => {
    const x = values.length === 1 ? VIEW_BOX_WIDTH / 2 : index * step;
    const normalized = (value - min) / range;
    const y = VIEW_BOX_HEIGHT * TOP_PADDING_RATIO + (1 - normalized) * VIEW_BOX_HEIGHT * USABLE_HEIGHT_RATIO;
    return { x, y };
  });
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
  const area = `${line} L ${points[points.length - 1].x.toFixed(2)} ${VIEW_BOX_HEIGHT} L ${points[0].x.toFixed(2)} ${VIEW_BOX_HEIGHT} Z`;
  const endpoint = points[points.length - 1];
  return { line, area, endpoint };
}

export function SparklineTrend({ dates, totalAsset, totalLiability, netAsset, className }: Props) {
  const series = useMemo(
    () => ({
      net: buildPath(netAsset),
      asset: buildPath(totalAsset),
      liability: buildPath(totalLiability),
    }),
    [netAsset, totalAsset, totalLiability]
  );

  if (netAsset.length === 0) {
    return (
      <div className={cn('flex h-72 items-center justify-center text-sm text-muted-foreground', className)}>
        暂无趋势数据
      </div>
    );
  }

  const firstDate = dates[0];
  const lastDate = dates[dates.length - 1];

  return (
    <div className={cn('w-full', className)}>
      <svg
        viewBox={`0 0 ${VIEW_BOX_WIDTH} ${VIEW_BOX_HEIGHT}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="资产总览趋势迷你图"
        className="h-60 w-full"
      >
        {(['liability', 'asset', 'net'] as const).map((key) => {
          const style = SERIES_STYLES[key];
          const path = series[key];
          if (!path.line) return null;
          return (
            <g key={key}>
              <path d={path.area} fill={style.fill} />
              <path d={path.line} fill="none" stroke={style.stroke} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
              {path.endpoint ? (
                <circle cx={path.endpoint.x} cy={path.endpoint.y} r={3.5} fill={style.stroke} />
              ) : null}
            </g>
          );
        })}
      </svg>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          {(['net', 'asset', 'liability'] as const).map((key) => (
            <span key={key} className="inline-flex items-center gap-1.5 text-muted-foreground">
              <span className="h-2 w-2 rounded-full" style={{ background: SERIES_STYLES[key].stroke }} />
              {SERIES_STYLES[key].label}
            </span>
          ))}
        </div>
        <div className="text-muted-foreground">
          {firstDate} → {lastDate}
        </div>
      </div>
    </div>
  );
}
