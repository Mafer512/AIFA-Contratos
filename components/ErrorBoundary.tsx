import React from 'react';
import { AlertTriangle, RefreshCw, RotateCcw } from 'lucide-react';

// Red de seguridad contra la pantalla en blanco.
//
// React desmonta TODO el árbol cuando una excepción escapa de un render. Sin un
// límite de error eso deja la ventana completamente vacía: ni mensaje, ni
// manera de volver, y el error sólo aparece si a alguien se le ocurre abrir la
// consola del navegador. Con 19 mil líneas de tablas y celdas editables, un
// dato inesperado en una sola celda bastaba para borrar la aplicación entera.
//
// Este componente atrapa esa excepción, deja el resto de la aplicación en pie y
// enseña qué pasó. El botón "Reintentar" vuelve a montar sólo la parte que
// falló, que casi siempre basta cuando el fallo vino de un filtro o de una
// celda concreta.

interface Props {
  children: React.ReactNode;
  /** Nombre de la zona protegida; aparece en el mensaje y en la consola. */
  nombre?: string;
  /** Se llama al pulsar "Reintentar", para deshacer lo que disparó el fallo. */
  onReintentar?: () => void;
}

interface State {
  error: Error | null;
  componentStack: string | null;
  intento: number;
}

class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, componentStack: null, intento: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    this.setState({ componentStack: info.componentStack ?? null });

    // console.error a propósito: en desarrollo, Vite reenvía la consola del
    // navegador a la terminal, así que el fallo queda registrado donde se puede
    // leer sin pedirle a nadie que copie nada a mano.
    const zona = this.props.nombre ? ` · ${this.props.nombre}` : '';
    console.error(`[ErrorBoundary${zona}] ${error.message}`);
    console.error('[ErrorBoundary] Stack:', error.stack);
    console.error('[ErrorBoundary] Componentes:', info.componentStack);
  }

  private reintentar = () => {
    this.props.onReintentar?.();
    this.setState((prev) => ({ error: null, componentStack: null, intento: prev.intento + 1 }));
  };

  render() {
    const { error, componentStack } = this.state;
    if (!error) return <React.Fragment key={this.state.intento}>{this.props.children}</React.Fragment>;

    return (
      <div className="p-6">
        <div className="max-w-3xl mx-auto bg-white border border-red-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-start gap-3 p-6 border-b border-red-100 bg-red-50">
            <span className="flex h-10 w-10 rounded-xl bg-red-100 text-red-600 items-center justify-center flex-shrink-0">
              <AlertTriangle className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-red-900">
                No se pudo mostrar {this.props.nombre ?? 'esta sección'}
              </h2>
              <p className="text-sm text-red-800 mt-1 leading-relaxed">
                El resto de la aplicación sigue funcionando. Puedes reintentar; si vuelve a
                fallar, deshaz lo último que hiciste (por ejemplo, borra el texto de un buscador).
              </p>
            </div>
          </div>

          <div className="p-6 space-y-4">
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                Detalle técnico
              </p>
              <p className="text-sm font-mono text-slate-700 break-words">{error.message}</p>
            </div>

            {(error.stack || componentStack) && (
              <details className="rounded-xl bg-slate-50 border border-slate-200 p-4">
                <summary className="cursor-pointer text-xs font-semibold text-slate-600">
                  Ver traza completa
                </summary>
                <pre className="mt-3 whitespace-pre-wrap break-all font-mono text-[11px] text-slate-600 max-h-72 overflow-y-auto">
                  {error.stack}
                  {componentStack}
                </pre>
              </details>
            )}

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={this.reintentar}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-bold rounded-xl bg-[#0F4C3A] text-white hover:bg-[#0d3f30] transition-colors"
              >
                <RotateCcw className="h-4 w-4" />
                Reintentar
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
              >
                <RefreshCw className="h-4 w-4" />
                Recargar la página
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
