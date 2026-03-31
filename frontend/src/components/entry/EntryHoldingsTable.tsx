import { Pencil, Trash2 } from 'lucide-react';

import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import type { Holding } from '../../types';
import { formatCurrency } from '../../utils/format';

type EntryHoldingsTableProps = {
  filteredHoldings: Holding[];
  allHoldingsCount: number;
  allVisibleSelected: boolean;
  selectedIdSet: Set<number>;
  memberNameMap: Map<number, string>;
  baseCurrency: string;
  deletePending: boolean;
  onToggleSelectAllVisible: (checked: boolean) => void;
  onToggleHoldingSelection: (holdingId: number, checked: boolean) => void;
  onOpenEditDialog: (row: Holding) => void;
  onDeleteHolding: (holdingId: number) => void;
};

export function EntryHoldingsTable({
  filteredHoldings,
  allHoldingsCount,
  allVisibleSelected,
  selectedIdSet,
  memberNameMap,
  baseCurrency,
  deletePending,
  onToggleSelectAllVisible,
  onToggleHoldingSelection,
  onOpenEditDialog,
  onDeleteHolding,
}: EntryHoldingsTableProps) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12 px-3">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border"
                checked={allVisibleSelected}
                onChange={(event) => onToggleSelectAllVisible(event.target.checked)}
                aria-label="全选当前筛选结果"
              />
            </TableHead>
            <TableHead>名称</TableHead>
            <TableHead>类型</TableHead>
            <TableHead>成员</TableHead>
            <TableHead>币种</TableHead>
            <TableHead className="text-right">原币金额</TableHead>
            <TableHead className="text-right">折算金额</TableHead>
            <TableHead className="text-right">目标占比</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredHoldings.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="w-12 px-3">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border"
                  checked={selectedIdSet.has(row.id)}
                  onChange={(event) => onToggleHoldingSelection(row.id, event.target.checked)}
                  aria-label={`选择 ${row.name}`}
                />
              </TableCell>
              <TableCell className="font-medium">{row.name}</TableCell>
              <TableCell>
                <Badge variant={row.type === 'asset' ? 'default' : 'secondary'}>{row.type === 'asset' ? '资产' : '负债'}</Badge>
              </TableCell>
              <TableCell>{memberNameMap.get(row.member_id) ?? row.member_id}</TableCell>
              <TableCell>{row.currency}</TableCell>
              <TableCell className="text-right">{formatCurrency(row.amount_original, row.currency)}</TableCell>
              <TableCell className="text-right">{formatCurrency(row.amount_base, baseCurrency)}</TableCell>
              <TableCell className="text-right">{row.target_ratio == null ? '-' : `${row.target_ratio}%`}</TableCell>
              <TableCell>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="icon" onClick={() => onOpenEditDialog(row)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => onDeleteHolding(row.id)} disabled={deletePending}>
                    <Trash2 className="h-4 w-4 text-rose-500" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
          {filteredHoldings.length === 0 ? (
            <TableRow>
              <TableCell colSpan={9} className="text-center text-muted-foreground">
                {allHoldingsCount === 0 ? '暂无录入数据' : '当前筛选条件下暂无匹配数据'}
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  );
}
