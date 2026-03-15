import type { QueryClient } from '@tanstack/react-query';

export const HOLDING_RELATED_QUERY_KEYS = [
  ['holdings'],
  ['trend'],
  ['rebalance'],
  ['sankey'],
  ['volatility'],
  ['correlation'],
  ['currency-overview'],
] as const;

type HoldingRelatedQueryClient = Pick<QueryClient, 'invalidateQueries'>;

export async function invalidateHoldingRelatedQueries(queryClient: HoldingRelatedQueryClient) {
  await Promise.all(
    HOLDING_RELATED_QUERY_KEYS.map((queryKey) =>
      queryClient.invalidateQueries({ queryKey })
    )
  );
}
