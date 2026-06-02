import { Component, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw, AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  isChunkError: boolean;
  message: string;
}

const CHUNK_ERROR_RX =
  /Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError|Loading chunk \d+ failed/i;

/**
 * Catches errors thrown by lazy-loaded route chunks and shows a French-friendly
 * fallback with a "Recharger" button instead of a blank preview.
 */
export class ChunkErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, isChunkError: false, message: '' };

  static getDerivedStateFromError(error: Error): State {
    const msg = error?.message ?? String(error);
    return {
      hasError: true,
      isChunkError: CHUNK_ERROR_RX.test(msg),
      message: msg,
    };
  }

  componentDidCatch(error: Error) {
    // Surface a global event so the in-app banner can react too.
    if (CHUNK_ERROR_RX.test(error?.message ?? '')) {
      window.dispatchEvent(new CustomEvent('lovable:chunk-error', { detail: error.message }));
    }
    // eslint-disable-next-line no-console
    console.error('[ChunkErrorBoundary]', error);
  }

  private handleReload = () => {
    try {
      sessionStorage.removeItem('lovable:chunk-reload');
    } catch {
      /* noop */
    }
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center space-y-4">
          <div className="mx-auto w-12 h-12 rounded-full bg-warning/10 flex items-center justify-center">
            <AlertTriangle className="w-6 h-6 text-warning" />
          </div>
          <h1 className="text-xl font-semibold">
            {this.state.isChunkError ? 'Mise à jour disponible' : 'Une erreur est survenue'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {this.state.isChunkError
              ? "L'application a été mise à jour. Rechargez pour obtenir la dernière version."
              : "Quelque chose s'est mal passé. Rechargez la page pour réessayer."}
          </p>
          <Button onClick={this.handleReload} className="gap-2">
            <RefreshCw className="w-4 h-4" /> Recharger
          </Button>
        </div>
      </div>
    );
  }
}
