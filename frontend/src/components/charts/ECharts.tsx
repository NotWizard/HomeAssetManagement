import { useCallback, useEffect, useRef } from 'react';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import type { EChartsReactProps } from 'echarts-for-react/lib/types';
import * as echarts from 'echarts/core';

// 注意：顶层不再 echarts.use 任何 chart / component / renderer。
// 各 chart 组件（TrendChart/VolatilityChart/...）在自己模块按需 echarts.use
// 让 tree-shaking 能识别真正用到的子集；多个组件 use 同一类型时 echarts 内部会去重。

type Props = Omit<EChartsReactProps, 'echarts'>;

export function ECharts(props: Props) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<ReactEChartsCore | null>(null);

  const setRef = useCallback((node: ReactEChartsCore | null) => {
    chartRef.current = node;
  }, []);

  // echarts-for-react 默认仅监听 window resize；当父容器因 tab 切换、布局回流改变宽高时，
  // 图表会保留首次挂载尺寸导致绘制区被截断。这里追加 ResizeObserver，让图表跟随容器自适应。
  // 用 rAF 合批避免多图同屏时多次串联 resize 抖动。
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper || typeof ResizeObserver === 'undefined') {
      return undefined;
    }

    let rafId: number | null = null;
    const observer = new ResizeObserver(() => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        chartRef.current?.getEchartsInstance().resize();
      });
    });
    observer.observe(wrapper);
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, []);

  return (
    <div ref={wrapperRef} style={{ width: '100%', height: '100%' }}>
      <ReactEChartsCore
        ref={setRef}
        echarts={echarts}
        lazyUpdate
        {...props}
      />
    </div>
  );
}
