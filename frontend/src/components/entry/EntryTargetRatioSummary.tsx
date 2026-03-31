import { Badge } from '../ui/badge';

type TargetRatioStatus = {
  label: '未达标' | '已达标' | '已超出';
  detail: string;
  badgeClassName: string;
  detailClassName: string;
};

type EntryTargetRatioSummaryProps = {
  hasLoadedHoldings: boolean;
  hasAssetHoldings: boolean;
  targetRatioStatus: TargetRatioStatus;
  totalAssetTargetRatioSummary: string;
  filteredAssetTargetRatioSummary: string;
};

export function EntryTargetRatioSummary({
  hasLoadedHoldings,
  hasAssetHoldings,
  targetRatioStatus,
  totalAssetTargetRatioSummary,
  filteredAssetTargetRatioSummary,
}: EntryTargetRatioSummaryProps) {
  if (!hasLoadedHoldings || !hasAssetHoldings) {
    return null;
  }

  return (
    <div className="mb-4 rounded-2xl border border-border/60 bg-muted/15 px-3 py-3 sm:px-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="text-xs font-medium tracking-[0.14em] text-muted-foreground">目标占比状态</div>
        <Badge
          className={`inline-flex h-8 items-center rounded-full border px-3 text-xs font-semibold ${targetRatioStatus.badgeClassName}`}
        >
          {targetRatioStatus.label}
        </Badge>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-border/70 bg-background/90 px-3 py-2.5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm text-muted-foreground">当前资产合计</div>
              <div className="mt-1 text-[2rem] font-semibold leading-none tracking-tight">
                {totalAssetTargetRatioSummary}
              </div>
            </div>
            <div className={`pt-0.5 text-xs font-semibold ${targetRatioStatus.detailClassName}`}>
              {targetRatioStatus.detail}
            </div>
          </div>
          <div className="mt-1.5 text-xs text-muted-foreground">
            全部资产目标占比求和，当前筛选资产 {filteredAssetTargetRatioSummary}
          </div>
        </div>

        <div className="rounded-xl border border-emerald-100/80 bg-emerald-50/40 px-3 py-2.5">
          <div className="text-sm text-muted-foreground">目标占比</div>
          <div className="mt-1 flex items-start justify-between gap-3">
            <div className="text-[2rem] font-semibold leading-none tracking-tight">100.0%</div>
            <div className="pt-0.5 text-xs font-medium text-muted-foreground">全部资产配平基准</div>
          </div>
        </div>
      </div>
    </div>
  );
}
