import { t } from "./i18n";
import { Component, lazy, Suspense, useState, type ComponentType, type ReactNode } from "react";

type PanelModule<Props> = { default: ComponentType<Props> };

class PanelErrorBoundary extends Component<{ children: ReactNode; onRetry: (error: unknown) => void }, { failed: boolean; error?: unknown }> {
  state: { failed: boolean; error?: unknown } = { failed: false };

  static getDerivedStateFromError(error: unknown) {
    return { failed: true, error };
  }

  render() {
    if (this.state.failed) {
      return <div className="deferred-panel panel" role="alert">
        <p>{t("Не удалось открыть раздел. Проверьте соединение и попробуйте снова.")}</p>
        <button type="button" onClick={() => this.props.onRetry(this.state.error)}>{t("Повторить загрузку")}</button>
      </div>;
    }
    return this.props.children;
  }
}

export function DeferredPanel<Props extends object>({ load, panelProps, label }: {
  load: (retryUrl?: string) => Promise<PanelModule<Props>>;
  panelProps: Props;
  label: string;
}) {
  const [Panel, setPanel] = useState(() => lazy(load));
  const [retry, setRetry] = useState(0);

  function retryLoad(error: unknown) {
    // A failed React.lazy instance retains its rejected promise. Make a new one for each retry.
    // Browsers also retain failed module URLs, so a network failure needs a fresh URL.
    const match = error instanceof Error ? error.message.match(/https?:\/\/[^\s)]+\.js(?:\?[^\s)]*)?/) : null;
    let retryUrl: string | undefined;
    if (match) {
      const url = new URL(match[0]);
      if (url.origin === window.location.origin && url.pathname.includes("/assets/")) {
        url.searchParams.set("panel-retry", String(retry + 1));
        retryUrl = url.href;
      }
    }
    setPanel(lazy(() => load(retryUrl)));
    setRetry((current) => current + 1);
  }

  return <PanelErrorBoundary key={retry} onRetry={retryLoad}>
    <Suspense fallback={<div className="deferred-panel panel" role="status" aria-live="polite">{t(`Загружаем ${label}…`)}</div>}>
      <Panel {...panelProps} />
    </Suspense>
  </PanelErrorBoundary>;
}
