import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save } from 'lucide-react';

import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Select } from '../components/ui/select';
import { fetchSettings, updateSettings } from '../services/settings';
import type { SettingsUpdatePayload } from '../types';

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

  const [form, setForm] = useState<SettingsUpdatePayload>({
    base_currency: 'CNY',
    timezone: browserTimezone,
    rebalance_threshold_pct: 5,
  });
  const [error, setError] = useState<string | null>(null);

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
        timezone: browserTimezone || settingsQuery.data.timezone,
        rebalance_threshold_pct: settingsQuery.data.rebalance_threshold_pct,
      });
    }
  }, [settingsQuery.data, browserTimezone]);

  const mutation = useMutation({
    mutationFn: updateSettings,
    onSuccess: async () => {
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ['settings'] });
      await queryClient.invalidateQueries({ queryKey: ['rebalance'] });
    },
    onError: (e) => setError(String(e)),
  });

  const submit = () => {
    if (!form.base_currency.trim()) {
      setError('基准币种不能为空');
      return;
    }
    if (!form.timezone.trim()) {
      setError('时区不能为空');
      return;
    }
    if (form.rebalance_threshold_pct <= 0 || form.rebalance_threshold_pct >= 100) {
      setError('再平衡阈值应在 0 到 100 之间');
      return;
    }
    mutation.mutate(form);
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold">系统设置</h2>
        <p className="text-sm text-muted-foreground">配置基准币种、时区、再平衡阈值与汇率提供方</p>
      </div>

      <Card className="max-w-3xl">
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
              <Input value={form.timezone} disabled readOnly />
              <p className="text-xs text-muted-foreground">默认读取本机时区，不支持手动修改</p>
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
