export const ROUTER_FUTURE_FLAGS = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;

export type RouterKind = 'hash' | 'browser';

export function resolveRouterKind(isDesktop: boolean): RouterKind {
  return isDesktop ? 'hash' : 'browser';
}
