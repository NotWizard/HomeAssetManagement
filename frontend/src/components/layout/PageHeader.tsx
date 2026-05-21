import type { ReactNode } from 'react';

import { cn } from '../../lib/cn';

type PageHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  /** 顶部小标签（面包屑 / 分组名） */
  eyebrow?: ReactNode;
  /** 右侧操作区，例如刷新、导出按钮 */
  actions?: ReactNode;
  className?: string;
};

/**
 * 页面顶部统一标题区。
 *
 * 视觉特征：
 * - eyebrow（小写灰字）+ 主标题（24px 半粗）+ 描述（muted）
 * - 主标题与右侧操作区两端对齐
 * - 与设计图一致的 spacing：mb-6 / mb-8
 */
export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        'mb-6 flex flex-col gap-3 md:mb-8 md:flex-row md:items-end md:justify-between',
        className
      )}
    >
      <div className="space-y-1.5">
        {eyebrow ? (
          <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/80">
            {eyebrow}
          </div>
        ) : null}
        <h1 className="text-[22px] font-semibold tracking-tight text-foreground md:text-2xl">
          {title}
        </h1>
        {description ? (
          <p className="max-w-3xl text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
