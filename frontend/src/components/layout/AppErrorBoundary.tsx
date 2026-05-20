import { Component, type ErrorInfo, type ReactNode } from 'react';

type AppErrorBoundaryProps = {
  children: ReactNode;
};

type AppErrorBoundaryState = {
  error: Error | null;
};

/**
 * 全局错误边界。
 *
 * 主要解决两类问题：
 * 1. `React.lazy` 在网络抖动 / 桌面 hash 路由切换时 chunk 加载失败 → 默认会让整个 React 树白屏不可恢复
 * 2. 渲染期间的同步异常导致 AppShell 一并崩溃
 *
 * 提供"重试"按钮以重置状态，让用户在不重启应用的情况下恢复。
 */
export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  constructor(props: AppErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // 仅记录，避免错误信息打到 UI 之前再次触发渲染崩溃
    console.error('[AppErrorBoundary]', error, info.componentStack);
  }

  private handleRetry = (): void => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    if (this.state.error) {
      const message =
        this.state.error.message?.length > 0
          ? this.state.error.message
          : '页面渲染出错';
      return (
        <div className="flex min-h-[80vh] flex-col items-center justify-center gap-4 px-6 text-center">
          <div className="text-base font-medium text-foreground">页面出现问题</div>
          <div className="max-w-xl text-sm text-muted-foreground break-words">
            {message}
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={this.handleRetry}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              重试
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
            >
              重新加载应用
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
