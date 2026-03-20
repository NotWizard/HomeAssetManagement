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
  prepare?: () => Promise<void>;
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
    let window: BootstrapWindow | null = null;
    let loadingPromise: Promise<void> | null = null;
    try {
      const preparePromise = dependencies.prepare?.();
      if (preparePromise) {
        await preparePromise;
      }

      window = dependencies.ensureWindow();
      loadingPromise = window.showLoading();
      window.focus();
      const backendPromise = dependencies.startBackend();

      await loadingPromise;
      const { appUrl } = await backendPromise;
      await window.showApp(appUrl);
    } catch (error) {
      const message = getErrorMessage(error);
      dependencies.showErrorDialog?.(message);
      const errorWindow = window ?? dependencies.ensureWindow();
      if (!window) {
        errorWindow.focus();
      }
      await loadingPromise?.catch(() => undefined);
      await errorWindow.showError(message);
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
