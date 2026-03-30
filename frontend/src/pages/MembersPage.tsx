import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, UsersRound } from 'lucide-react';

import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { invalidateMemberHoldingRelatedQueries, invalidateMemberQueries, queryKeys } from '../services/holdingRelatedQueries';
import { createMember, deleteMember, fetchMembers } from '../services/members';

function formatError(error: unknown) {
  if (error instanceof Error) return error.message;
  return '操作失败，请稍后重试';
}

export function MembersPage() {
  const queryClient = useQueryClient();
  const [newMemberName, setNewMemberName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const membersQuery = useQuery({ queryKey: queryKeys.members.all(), queryFn: fetchMembers });
  const members = membersQuery.data ?? [];
  const membersUnavailable = membersQuery.isError && !membersQuery.data;
  const membersErrorMessage = membersQuery.isError ? formatError(membersQuery.error) : null;

  const createMutation = useMutation({
    mutationFn: createMember,
    onSuccess: async () => {
      setError(null);
      setNewMemberName('');
      await invalidateMemberQueries(queryClient);
    },
    onError: (err) => setError(formatError(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteMember,
    onSuccess: async () => {
      setError(null);
      await invalidateMemberHoldingRelatedQueries(queryClient);
    },
    onError: (err) => setError(formatError(err)),
  });

  const handleCreate = () => {
    const value = newMemberName.trim();
    if (!value) {
      setError('成员名称不能为空');
      return;
    }
    createMutation.mutate(value);
  };

  const handleDelete = (memberId: number, memberName: string) => {
    if (!window.confirm(`确定删除成员“${memberName}”吗？`)) return;
    deleteMutation.mutate(memberId);
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold">成员管理</h2>
        <p className="text-sm text-muted-foreground">独立维护家庭成员，便于后续资产与负债归属录入</p>
      </div>

      <Card className="max-w-3xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">新增成员</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={newMemberName}
              onChange={(event) => setNewMemberName(event.target.value)}
              placeholder="输入成员名称，如：配偶"
              className="sm:max-w-xs"
            />
            <Button onClick={handleCreate} disabled={createMutation.isPending}>
              <Plus className="mr-2 h-4 w-4" />
              添加成员
            </Button>
          </div>
          {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">成员列表</CardTitle>
        </CardHeader>
        <CardContent>
          {membersQuery.isError ? (
            <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50/60 p-3 text-sm text-rose-700">
              <p className="font-medium">{membersUnavailable ? '成员加载失败' : '成员刷新失败'}</p>
              <p className="mt-1 text-xs text-rose-700/90">
                {membersUnavailable ? membersErrorMessage : `当前展示最近一次成功结果：${membersErrorMessage}`}
              </p>
            </div>
          ) : null}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>成员名称</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {membersUnavailable ? (
                <TableRow>
                  <TableCell colSpan={2} className="py-8 text-center text-rose-600">
                    成员加载失败，请稍后重试
                  </TableCell>
                </TableRow>
              ) : (
                members.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell className="font-medium">{member.name}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(member.id, member.name)}>
                        <Trash2 className="h-4 w-4 text-rose-500" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
              {!membersQuery.isError && (membersQuery.data ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={2} className="py-8 text-center text-muted-foreground">
                    <UsersRound className="mx-auto mb-2 h-5 w-5" />
                    还没有成员，先添加一个吧
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
