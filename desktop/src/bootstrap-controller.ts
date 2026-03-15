export interface BootstrapWindow {
  showLoading: () => Promise<void>;
  showApp: (url: string) => Promise<void>;
  showError: (message: string) => Promise<void>;
  focus: () => void;
}

interface BackendStartupResult {
  appUrl: string;
}

interface BootstrapControllerDependencies {
  ensureWindow: () => BootstrapWindow;
  startBackend: () => Promise<BackendStartupResult>;
  showErrorDialog?: (message: string) => void;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '未知错误';
}

export function createBootstrapController(
  dependencies: BootstrapControllerDependencies
) {
  let bootstrapPromise: Promise<void> | null = null;

  async function runBootstrap(): Promise<void> {
    const window = dependencies.ensureWindow();
    const loadingPromise = window.showLoading();
    window.focus();
    const backendPromise = dependencies.startBackend();

    await loadingPromise;

    try {
      const { appUrl } = await backendPromise;
      await window.showApp(appUrl);
    } catch (error) {
      const message = getErrorMessage(error);
      dependencies.showErrorDialog?.(message);
      await window.showError(message);
    }
  }

  return {
    bootstrap(): Promise<void> {
      if (!bootstrapPromise) {
        bootstrapPromise = runBootstrap().finally(() => {
          bootstrapPromise = null;
        });
      }

      return bootstrapPromise;
    },
  };
}
