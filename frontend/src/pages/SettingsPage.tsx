import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Download, Save, Upload } from 'lucide-react';

import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Select } from '../components/ui/select';
import { invalidateHoldingRelatedQueries } from '../services/holdingRelatedQueries';
import { exportMigrationPackage, importMigrationPackage } from '../services/migration';
import { fetchSettings, updateSettings } from '../services/settings';
import type { MigrationImportResult, SettingsUpdatePayload } from '../types';

const COMMON_CURRENCY_OPTIONS = [
  { value: 'CNY', label: 'CNY 人民币' },
  { value: 'USD', label: 'USD 美元' },
  { value: 'EUR', label: 'EUR 欧元' },
  { value: 'JPY', label: 'JPY 日元' },
  { value: 'GBP', label: 'GBP 英镑' },
  { value: 'HKD', label: 'HKD 港币' },
  { value: 'AUD', label: 'AUD 澳元' },
  { value: 'CAD', label: 'CAD 加拿大元' },
  { value: 'CHF', label: 'CHF 瑞士法郎' },
  { value: 'SGD', label: 'SGD 新加坡元' },
];

export function SettingsPage() {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({ queryKey: ['settings'], queryFn: fetchSettings });
  const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const timezoneDisplay = settingsQuery.data?.timezone
    ? settingsQuery.data.timezone
    : `${browserTimezone}（本机默认，未从服务端读取到）`;

  const [form, setForm] = useState<SettingsUpdatePayload>({
    base_currency: 'CNY',
    rebalance_threshold_pct: 5,
  });
  const [error, setError] = useState<string | null>(null);
  const [migrationFile, setMigrationFile] = useState<File | null>(null);
  const [migrationInputKey, setMigrationInputKey] = useState(0);
  const [migrationError, setMigrationError] = useState<string | null>(null);
  const [migrationMessage, setMigrationMessage] = useState<string | null>(null);

  const baseCurrencyOptions = useMemo(() => {
    const current = form.base_currency.toUpperCase();
    if (COMMON_CURRENCY_OPTIONS.some((option) => option.value === current)) {
      return COMMON_CURRENCY_OPTIONS;
    }
    return [{ value: current, label: `${current} 当前币种` }, ...COMMON_CURRENCY_OPTIONS];
  }, [form.base_currency]);

  useEffect(() => {
    if (settingsQuery.data) {
      setForm({
        base_currency: settingsQuery.data.base_currency,
        rebalance_threshold_pct: settingsQuery.data.rebalance_threshold_pct,
      });
    }
  }, [settingsQuery.data]);

  const mutation = useMutation({
    mutationFn: updateSettings,
    onSuccess: async () => {
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ['settings'] });
      await queryClient.invalidateQueries({ queryKey: ['rebalance'] });
    },
    onError: (e) => setError(formatError(e)),
  });

  const exportMutation = useMutation({
    mutationFn: exportMigrationPackage,
    onSuccess: (filename) => {
      setMigrationError(null);
      setMigrationMessage(`迁移包已开始下载：${filename}`);
    },
    onError: (e) => {
      setMigrationMessage(null);
      setMigrationError(formatError(e));
    },
  });

  const importMutation = useMutation({
    mutationFn: importMigrationPackage,
    onSuccess: async (result: MigrationImportResult) => {
      setMigrationError(null);
      setMigrationFile(null);
      setMigrationMessage(
        `导入完成：已恢复 ${result.members_count} 位成员、${result.holdings_count} 条资产负债、${result.daily_snapshots_count} 条日快照。`
      );
      setMigrationInputKey((prev) => prev + 1);
      await queryClient.invalidateQueries({ queryKey: ['settings'] });
      await queryClient.invalidateQueries({ queryKey: ['members'] });
      await invalidateHoldingRelatedQueries(queryClient);
    },
    onError: (e) => {
      setMigrationMessage(null);
      setMigrationError(formatError(e));
    },
  });

  const submit = () => {
    if (!form.base_currency.trim()) {
      setError('基准币种不能为空');
      return;
    }
    if (form.rebalance_threshold_pct <= 0 || form.rebalance_threshold_pct >= 100) {
      setError('再平衡阈值应在 0 到 100 之间');
      return;
    }
    mutation.mutate(form);
  };

  const handleImport = () => {
    if (!migrationFile) {
      setMigrationError('请先选择迁移包 zip 文件');
      return;
    }
    const confirmed = window.confirm(
      '导入迁移包将清空当前环境中的系统设置、成员、资产负债与每日快照数据，并恢复为迁移包内容。是否继续？'
    );
    if (!confirmed) return;
    importMutation.mutate(migrationFile);
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold">系统设置</h2>
        <p className="text-sm text-muted-foreground">配置基准币种、时区、再平衡阈值、汇率提供方与迁移备份能力</p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">全局设置</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="基准币种">
              <Select
                value={form.base_currency}
                onChange={(event) => setForm((prev) => ({ ...prev, base_currency: event.target.value.toUpperCase() }))}
                options={baseCurrencyOptions}
              />
            </Field>
            <Field label="时区">
              <Input value={timezoneDisplay} disabled readOnly />
              <p className="text-xs text-muted-foreground">优先显示服务端时区；未读取到时回退为本机时区，不支持手动修改</p>
            </Field>
            <Field label="再平衡阈值(%)">
              <Input
                type="number"
                min="0.01"
                max="99.99"
                step="0.1"
                value={form.rebalance_threshold_pct}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    rebalance_threshold_pct: Number(event.target.value || 0),
                  }))
                }
              />
            </Field>
            <Field label="汇率提供方">
              <Input value={settingsQuery.data?.fx_provider ?? 'frankfurter'} disabled />
            </Field>
          </div>

          {error ? <p className="text-sm text-rose-600">{error}</p> : null}

          <Button onClick={submit} disabled={mutation.isPending}>
            <Save className="mr-2 h-4 w-4" />
            保存设置
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">数据迁移 / 备份</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-900">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="space-y-1">
                <p className="font-medium">导入迁移包会覆盖当前环境核心数据</p>
                <p className="text-xs leading-5 text-amber-800">
                  导入时会清空当前环境中的系统设置、成员、资产负债和每日快照数据，然后恢复迁移包内容。
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3 rounded-xl border p-4">
              <div>
                <p className="text-sm font-medium">导出迁移包</p>
                <p className="mt-1 text-xs text-muted-foreground">导出当前环境的家庭信息、系统设置、成员、资产负债和每日快照。</p>
              </div>
              <Button variant="secondary" onClick={() => exportMutation.mutate()} disabled={exportMutation.isPending}>
                <Download className="mr-2 h-4 w-4" />
                {exportMutation.isPending ? '正在导出...' : '导出迁移包'}
              </Button>
            </div>

            <div className="space-y-3 rounded-xl border p-4">
              <div>
                <p className="text-sm font-medium">导入迁移包</p>
                <p className="mt-1 text-xs text-muted-foreground">上传 zip 迁移包，在确认后恢复到当前环境。</p>
              </div>
              <Input
                key={migrationInputKey}
                type="file"
                accept=".zip,application/zip"
                onChange={(event) => {
                  const nextFile = event.target.files?.[0] ?? null;
                  setMigrationFile(nextFile);
                  setMigrationError(null);
                  setMigrationMessage(null);
                }}
              />
              <p className="text-xs text-muted-foreground">
                {migrationFile ? `已选择：${migrationFile.name}` : '请选择一个 `.zip` 迁移包文件'}
              </p>
              <Button onClick={handleImport} disabled={!migrationFile || importMutation.isPending}>
                <Upload className="mr-2 h-4 w-4" />
                {importMutation.isPending ? '正在导入...' : '导入迁移包'}
              </Button>
            </div>
          </div>

          {migrationError ? <p className="text-sm text-rose-600">{migrationError}</p> : null}
          {migrationMessage ? <p className="text-sm text-emerald-600">{migrationMessage}</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="space-y-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function formatError(error: unknown) {
  if (error instanceof Error) return error.message;
  return '操作失败，请稍后重试';
}
