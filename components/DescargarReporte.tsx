import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ChevronDown, Download, FileSpreadsheet, FileText, FileType, Loader2 } from 'lucide-react';
import { descargarReportePagos, type FormatoReporte, type PagoEntrada, type TipoReporte } from '../utils/reportePagos';

// Botón "Descargar" de Pagos: arma el reporte en Excel, Word o PDF con los
// mismos números que se ven en pantalla. Las librerías de cada formato se
// cargan sólo cuando alguien pide el archivo.

const FORMATOS: Array<{ id: FormatoReporte; etiqueta: string; detalle: string; Icono: typeof FileText; color: string }> = [
  { id: 'excel', etiqueta: 'Excel (.xlsx)', detalle: 'Hojas con fórmulas, filtros y gráficas', Icono: FileSpreadsheet, color: 'text-emerald-700 bg-emerald-50' },
  { id: 'word', etiqueta: 'Word (.docx)', detalle: 'Documento editable con tablas y gráficas', Icono: FileText, color: 'text-blue-700 bg-blue-50' },
  { id: 'pdf', etiqueta: 'PDF', detalle: 'Listo para imprimir o enviar', Icono: FileType, color: 'text-red-700 bg-red-50' },
];

interface Props {
  tipo: TipoReporte;
  anio: number;
  usuario: string;
  /** Los renglones ya calculados del Resumen de pagos (lo que se ve en pantalla). */
  pagos: PagoEntrada[];
  deshabilitado?: boolean;
}

const DescargarReporte: React.FC<Props> = ({ tipo, anio, usuario, pagos, deshabilitado }) => {
  const [abierto, setAbierto] = useState(false);
  const [generando, setGenerando] = useState<FormatoReporte | null>(null);
  const [aviso, setAviso] = useState<{ tono: 'error' | 'alerta'; texto: string } | null>(null);
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => { if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false); };
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', esc); };
  }, [abierto]);

  const descargar = async (formato: FormatoReporte) => {
    if (generando) return;
    setGenerando(formato);
    setAviso(null);
    try {
      const reporte = await descargarReportePagos({ formato, tipo, pagos, anio, usuario });
      const malas = reporte.validaciones.filter((v) => !v.ok);
      if (malas.length) {
        setAviso({ tono: 'alerta', texto: `Se descargó, pero ${malas.length} control(es) de calidad piden revisión: ${malas.map((v) => v.concepto).join(', ')}. El detalle está al final del reporte.` });
      } else {
        setAbierto(false);
      }
    } catch (err: any) {
      console.error('No se pudo generar el reporte de pagos:', err);
      setAviso({ tono: 'error', texto: `No se pudo generar el archivo: ${err?.message ?? 'error desconocido'}` });
    } finally {
      setGenerando(null);
    }
  };

  const titulo = tipo === 'tabla' ? `Tabla de Pagos ${anio}` : `Resumen de pagos ${anio}`;

  return (
    <div className="relative" ref={caja}>
      <button
        type="button"
        onClick={() => { setAbierto((v) => !v); setAviso(null); }}
        disabled={deshabilitado || !pagos.length}
        aria-haspopup="menu"
        aria-expanded={abierto}
        title={pagos.length ? 'Descargar reporte en Excel, Word o PDF' : 'No hay pagos para el reporte'}
        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#0F4C3A] text-white hover:bg-[#0c3d2f] transition-colors text-sm font-medium shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {generando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        Descargar
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${abierto ? 'rotate-180' : ''}`} />
      </button>

      {abierto && (
        <div role="menu" className="absolute right-0 mt-2 w-80 z-[90] bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/70">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Reporte</p>
            <p className="text-sm font-semibold text-slate-800">{titulo}</p>
            <p className="text-xs text-slate-500 mt-0.5">
              {pagos.length} contratos · con gráficas y control de calidad de los datos
            </p>
          </div>
          <div className="p-1.5">
            {FORMATOS.map(({ id, etiqueta, detalle, Icono, color }) => (
              <button
                key={id}
                type="button"
                role="menuitem"
                onClick={() => descargar(id)}
                disabled={!!generando}
                className="w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-left hover:bg-slate-50 transition-colors disabled:cursor-wait disabled:opacity-60"
              >
                <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${color}`}>
                  {generando === id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icono className="h-4 w-4" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-slate-800">{etiqueta}</span>
                  <span className="block text-xs text-slate-500">{generando === id ? 'Generando…' : detalle}</span>
                </span>
              </button>
            ))}
          </div>
          {aviso && (
            <div className={`mx-2 mb-2 flex gap-2 rounded-lg px-3 py-2 text-xs ${aviso.tono === 'error' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800'}`}>
              <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span>{aviso.texto}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DescargarReporte;
