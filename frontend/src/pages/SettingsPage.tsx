import { type ReactNode, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save } from 'lucide-react';

import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { fetchSettings, updateSettings } from '../services/settings';
import type { Settings } from '../types';

export function SettingsPage() {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({ queryKey: ['settings'], queryFn: fetchSettings });

  const [form, setForm] = useState<Settings>({
    base_currency: 'CNY',
    timezone: 'Asia/Shanghai',
    rebalance_threshold_pct: 5,
    fx_provider: 'frankfurter',
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (settingsQuery.data) {
      setForm(settingsQuery.data);
    }
  }, [settingsQuery.data]);

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
      setError('基准币不能为空');
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
    if (!form.fx_provider.trim()) {
      setError('汇率提供方不能为空');
      return;
    }
    mutation.mutate(form);
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold">系统设置</h2>
        <p className="text-sm text-muted-foreground">配置基准币、时区、再平衡阈值与汇率提供方</p>
      </div>

      <Card className="max-w-3xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">全局设置</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="基准币">
              <Input
                value={form.base_currency}
                onChange={(event) => setForm((prev) => ({ ...prev, base_currency: event.target.value.toUpperCase() }))}
              />
            </Field>
            <Field label="时区">
              <Input
                value={form.timezone}
                onChange={(event) => setForm((prev) => ({ ...prev, timezone: event.target.value }))}
              />
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
              <Input
                value={form.fx_provider}
                onChange={(event) => setForm((prev) => ({ ...prev, fx_provider: event.target.value }))}
              />
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
