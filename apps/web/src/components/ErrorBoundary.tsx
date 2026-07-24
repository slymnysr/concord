import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { t } from '../i18n';

interface Props {
  children: ReactNode;
  // Hatayı saran bağlamın adı (loglarda ve UI'da gösterilir)
  scope?: string;
  // Sağlanırsa varsayılan ekran yerine bu render edilir; reset ile sıfırlanabilir
  fallback?: (error: Error, reset: () => void) => ReactNode;
  // Boundary sıfırlandığında çağrılır (örn. crash eden alt sistemi temizlemek için)
  onReset?: () => void;
}

interface State {
  error: Error | null;
}

// Render sırasında oluşan hataları yakalar; tüm uygulamanın boş sayfaya
// dönmesini engeller. Hem kök seviyede hem alt bölümlerde (ör. VoiceStage)
// kullanılır ki bir panelin çökmesi diğerlerini etkilemesin.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      `[ErrorBoundary${this.props.scope ? `:${this.props.scope}` : ''}]`,
      error,
      info.componentStack,
    );
  }

  reset = () => {
    this.props.onReset?.();
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (this.props.fallback) return this.props.fallback(error, this.reset);

    return (
      <div className="h-full w-full flex items-center justify-center p-6 bg-bg text-ink-primary">
        <div className="max-w-md w-full bg-surface-1 border border-line rounded-2xl p-6 text-center">
          <div className="w-12 h-12 rounded-xl bg-accent-500/15 mx-auto flex items-center justify-center mb-3">
            <AlertTriangle size={24} className="text-accent-500" />
          </div>
          <h2 className="text-lg font-bold mb-1">{t('error.title')}</h2>
          <p className="text-sm text-ink-secondary mb-3">
            {this.props.scope
              ? t('error.inScope', { scope: this.props.scope })
              : t('error.unexpected')}
          </p>
          <pre className="text-left text-xs bg-surface-2 border border-line rounded-lg p-3 mb-4 overflow-auto max-h-40 text-accent-400 whitespace-pre-wrap">
            {error.message}
          </pre>
          <div className="flex gap-2 justify-center">
            <button
              onClick={this.reset}
              className="px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-400 text-white text-sm font-semibold flex items-center gap-2"
            >
              <RotateCcw size={14} /> {t('error.retry')}
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-lg bg-surface-3 hover:bg-surface-2 text-ink-primary text-sm font-semibold"
            >
              {t('error.reload')}
            </button>
          </div>
        </div>
      </div>
    );
  }
}
