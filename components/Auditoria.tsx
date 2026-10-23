import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle, ArrowUpDown, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ClipboardCheck, Database, Download,
  FileSpreadsheet, HelpCircle, History, Keyboard, Loader2, Lock, MousePointerClick, Pencil, Plus, RefreshCw, Search, Trash2, Undo2, Upload, X,
} from 'lucide-react';
import { supabase } from '../services/supabaseClient';
import { User } from '../types';
import {
  ESTADOS, ESTADO_INFO, MESES, MESES_CORTOS, contar, mesesEnVigencia, ultimoMesCerrado, mesesPorRegistrar,
  llaveContrato, limpiarContrato, compararContratos, leerHojaAuditoria, planearImportacion, leerPegado,
  fuentesDelAnio, fuenteDe, pendientesDelAnio,
  type Estado, type Conteo, type HojaLeida, type FuenteServicio, type EstatusEntrada, type PendientesDelAnio,
} from '../utils/auditoria';
import { parseFechaFlexible } from '../utils/fichaServicio';

// Auditoría: la hoja de control mensual de entregables. Un renglón por
// contrato del año y, por mes, una letra: C completo, R revisado, E en
// revisión, N no aplica. Se captura como en Excel: se elige una celda (o se
// arrastra para elegir varias) y se escribe la letra; también se puede pegar
// un bloque copiado de Excel o importar la hoja completa.

// ── Tipos ───────────────────────────────────────────────────────────────────

interface Servicio {
  id: number;
  anio: number;
  /** null = todavía no tiene contrato (un servicio de Estatus en proceso). */
  contrato: string | null;
  descripcion: string | null;
  proveedor: string | null;
  observacion: string | null;
  orden: number | null;
  /** "ID" de su renglón en estatus_<anio>, si viene de ahí. */
  estatus_id?: number | null;
}

interface Marca {
  estado: Estado;
  actualizado_nombre: string | null;
  updated_at: string;
}

interface PagoAnio {
  contrato: string;
  descripcion: string | null;
  proveedor: string | null;
  inicio: Date | null;
  fin: Date | null;
}

interface Fila {
  s: Servicio;
  /** Lo que dicen Estatus y Pagos de este servicio hoy. */
  fuente: FuenteServicio | undefined;
  /** El de Auditoría o, si aún no tiene, el que ya le puso Estatus/Pagos. */
  contrato: string | null;
  vigencia: Set<number> | null;
  letras: Record<number, Estado | undefined>;
  conteo: Conteo;
  faltan: number[];
}

type Cambio = { servicioId: number; mes: number; estado: Estado | null };
type Filtro = Estado | 'P' | null;
type Columna = 'orden' | 'contrato' | 'proveedor' | Estado | 'total' | 'faltan';

interface Seleccion { r0: number; m0: number; r1: number; m1: number }

const clave = (servicioId: number, mes: number) => `${servicioId}-${mes}`;

// ── Colores de cada letra ───────────────────────────────────────────────────

const ESTILO: Record<Estado, { pill: string; boton: string; color: string; claro: string; kpi: string }> = {
  C: { pill: 'bg-emerald-100 text-emerald-800 ring-emerald-300', boton: 'hover:bg-emerald-50 hover:border-emerald-300', color: '#10b981', claro: '#a7f3d0', kpi: 'text-emerald-700' },
  R: { pill: 'bg-sky-100 text-sky-800 ring-sky-300', boton: 'hover:bg-sky-50 hover:border-sky-300', color: '#0ea5e9', claro: '#bae6fd', kpi: 'text-sky-700' },
  E: { pill: 'bg-yellow-100 text-yellow-800 ring-yellow-300', boton: 'hover:bg-yellow-50 hover:border-yellow-300', color: '#eab308', claro: '#fef08a', kpi: 'text-yellow-700' },
  N: { pill: 'bg-rose-100 text-rose-700 ring-rose-300', boton: 'hover:bg-rose-50 hover:border-rose-300', color: '#f43f5e', claro: '#fecdd3', kpi: 'text-rose-700' },
};
const COLOR_PENDIENTE = '#f97316';

const Pill: React.FC<{ estado: Estado; grande?: boolean }> = ({ estado, grande }) => (
  <span className={`inline-flex items-center justify-center rounded-md font-black ring-1 ring-inset ${ESTILO[estado].pill} ${grande ? 'h-9 w-9 text-base' : 'h-7 w-8 text-[12px]'}`}>
    {estado}
  </span>
);

const FUERA_VIGENCIA: React.CSSProperties = {
  backgroundImage: 'repeating-linear-gradient(135deg, #f1f5f9 0, #f1f5f9 3px, transparent 3px, transparent 7px)',
};

const fechaCorta = (iso: string | null | undefined) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).replace('.', '');
};

const nServicios = (n: number) => `${n} servicio${n !== 1 ? 's' : ''}`;

/** Cómo se nombra un servicio en avisos y títulos. */
const nombreServicio = (s: { contrato: string | null; descripcion: string | null }) =>
  s.contrato ?? s.descripcion ?? 'Servicio sin nombre';

const normalizar = (v: unknown) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const faltaTablaError = (e: any) =>
  e?.code === '42P01' || e?.code === 'PGRST205' || /does not exist|schema cache/i.test(String(e?.message ?? ''));

// ── Ventana base ────────────────────────────────────────────────────────────

const Ventana: React.FC<{ titulo: string; subtitulo?: string; onCerrar: () => void; children: React.ReactNode; ancho?: string }> = ({
  titulo, subtitulo, onCerrar, children, ancho = 'max-w-lg',
}) => {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onCerrar]);
  return createPortal(
    <div className="fixed inset-0 z-[9997] flex items-center justify-center p-3 sm:p-4" style={{ backgroundColor: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(3px)' }} onClick={onCerrar}>
      <div role="dialog" aria-modal="true" aria-label={titulo} className={`bg-white rounded-3xl shadow-2xl w-full ${ancho} max-h-[92vh] flex flex-col overflow-hidden`} onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 text-white flex items-start justify-between gap-3" style={{ background: 'linear-gradient(120deg, #0F4C3A, #1B3A5E)' }}>
          <div className="min-w-0">
            <h3 className="text-base font-bold leading-snug">{titulo}</h3>
            {subtitulo && <p className="text-xs text-emerald-100/80 mt-0.5 leading-snug">{subtitulo}</p>}
          </div>
          <button onClick={onCerrar} aria-label="Cerrar" className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5 overflow-y-auto">{children}</div>
      </div>
    </div>,
    document.body,
  );
};

const etiqueta = 'block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5';
const campo = 'w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#0F4C3A]/25 focus:border-[#0F4C3A]';
const botonPrimario = 'inline-flex items-center justify-center gap-2 rounded-xl bg-[#0F4C3A] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#0a3528] disabled:opacity-50 disabled:cursor-not-allowed transition-colors';
const botonSecundario = 'inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors';

// ── Ficha del servicio (alta y edición) ─────────────────────────────────────

const VentanaServicio: React.FC<{
  anio: number;
  inicial: Servicio | null;
  /** Contratos del año que aún no están en Auditoría. */
  sugerencias: FuenteServicio[];
  existentes: Servicio[];
  marcasDelServicio: number;
  puedeBorrar: boolean;
  onGuardar: (datos: Pick<Servicio, 'contrato' | 'descripcion' | 'proveedor' | 'observacion'>) => Promise<string | null>;
  onBorrar: () => Promise<string | null>;
  onCerrar: () => void;
}> = ({ anio, inicial, sugerencias, existentes, marcasDelServicio, puedeBorrar, onGuardar, onBorrar, onCerrar }) => {
  const [contrato, setContrato] = useState(inicial?.contrato ?? '');
  const [descripcion, setDescripcion] = useState(inicial?.descripcion ?? '');
  const [proveedor, setProveedor] = useState(inicial?.proveedor ?? '');
  const [observacion, setObservacion] = useState(inicial?.observacion ?? '');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [confirmarBorrado, setConfirmarBorrado] = useState(false);

  const repetido = useMemo(() => {
    const k = contrato.trim() ? llaveContrato(contrato) : '';
    return k ? existentes.find((s) => s.id !== inicial?.id && !!s.contrato && llaveContrato(s.contrato) === k) : undefined;
  }, [contrato, existentes, inicial?.id]);

  // Al elegir un contrato de Pagos se llenan solos descripción y proveedor.
  const alCambiarContrato = (v: string) => {
    setContrato(v);
    const p = v.trim() ? sugerencias.find((x) => !!x.contrato && llaveContrato(x.contrato) === llaveContrato(v)) : undefined;
    if (p) {
      if (!descripcion.trim() && p.descripcion) setDescripcion(p.descripcion);
      if (!proveedor.trim() && p.proveedor) setProveedor(p.proveedor);
    }
  };

  const guardar = async () => {
    const c = limpiarContrato(contrato);
    if (!c && !descripcion.trim()) { setError('Escribe el número de contrato o, si todavía no tiene, la descripción del servicio.'); return; }
    if (repetido) { setError(`Ese contrato ya está en Auditoría ${anio}.`); return; }
    setGuardando(true);
    setError(null);
    const e = await onGuardar({ contrato: c || null, descripcion: descripcion.trim() || null, proveedor: proveedor.trim() || null, observacion: observacion.trim() || null });
    setGuardando(false);
    if (e) setError(e); else onCerrar();
  };

  const borrar = async () => {
    setGuardando(true);
    const e = await onBorrar();
    setGuardando(false);
    if (e) setError(e); else onCerrar();
  };

  return (
    <Ventana titulo={inicial ? 'Editar servicio' : `Agregar servicio a ${anio}`} subtitulo={inicial ? nombreServicio(inicial) : 'Contrato, pedido o servicio que se audita mes con mes'} onCerrar={onCerrar}>
      <div className="space-y-4">
        <div>
          <label className={etiqueta} htmlFor="aud-contrato">No. contrato o pedido <span className="normal-case font-semibold text-slate-400">(si ya tiene)</span></label>
          <input id="aud-contrato" list="aud-contratos-pagos" className={campo} value={contrato} autoFocus
            placeholder={`AIFA-C-LPN-DO-SVS-000/${anio}`} onChange={(e) => alCambiarContrato(e.target.value)} />
          <datalist id="aud-contratos-pagos">
            {sugerencias.map((p) => <option key={p.contrato!} value={p.contrato!}>{p.proveedor ?? ''}</option>)}
          </datalist>
          {repetido && <p className="mt-1.5 text-xs font-semibold text-rose-600">Ya existe en {anio}: {repetido.contrato}</p>}
          {!inicial && sugerencias.length > 0 && !contrato && (
            <p className="mt-1.5 text-xs text-slate-500">Escribe o elige uno de los {sugerencias.length} contratos de {anio} que aún no están aquí. Si el servicio todavía no tiene contrato, déjalo vacío y escribe la descripción.</p>
          )}
        </div>
        <div>
          <label className={etiqueta} htmlFor="aud-desc">Descripción</label>
          <textarea id="aud-desc" rows={2} className={campo} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Servicio de mantenimiento…" />
        </div>
        <div>
          <label className={etiqueta} htmlFor="aud-prov">Proveedor</label>
          <input id="aud-prov" className={campo} value={proveedor} onChange={(e) => setProveedor(e.target.value)} />
        </div>
        <div>
          <label className={etiqueta} htmlFor="aud-obs">Observación</label>
          <input id="aud-obs" className={campo} value={observacion} maxLength={500} onChange={(e) => setObservacion(e.target.value)} placeholder="Ej. Realiza entregas de forma semanal" />
        </div>
        {error && <p className="rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">{error}</p>}

        {confirmarBorrado ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
            <p className="text-sm font-semibold text-rose-800">¿Quitar este servicio de Auditoría {anio}?</p>
            <p className="text-xs text-rose-700 mt-1">
              {marcasDelServicio ? `Se borran también sus ${marcasDelServicio} letra${marcasDelServicio !== 1 ? 's' : ''}. ` : ''}
              Los cambios quedan en la bitácora, pero el renglón no se puede recuperar desde aquí.
            </p>
            <div className="flex gap-2 mt-3">
              <button className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-50" disabled={guardando} onClick={borrar}>
                {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Sí, quitar
              </button>
              <button className={botonSecundario} onClick={() => setConfirmarBorrado(false)}>Cancelar</button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2 pt-1">
            {inicial && puedeBorrar ? (
              <button className="inline-flex items-center gap-1.5 text-sm font-semibold text-rose-600 hover:text-rose-700" onClick={() => setConfirmarBorrado(true)}>
                <Trash2 className="h-4 w-4" /> Quitar
              </button>
            ) : <span />}
            <div className="flex gap-2">
              <button className={botonSecundario} onClick={onCerrar}>Cancelar</button>
              <button className={botonPrimario} disabled={guardando || !!repetido} onClick={guardar}>
                {guardando && <Loader2 className="h-4 w-4 animate-spin" />} Guardar
              </button>
            </div>
          </div>
        )}
      </div>
    </Ventana>
  );
};

// ── Traer los servicios del año (Estatus + Pagos) ──────────────────────────

const FaseChip: React.FC<{ fase: string | null }> = ({ fase }) => (fase ? (
  <span className="inline-flex max-w-[180px] items-center truncate rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-700 ring-1 ring-inset ring-violet-200" title={`Estatus: ${fase}`}>{fase}</span>
) : null);

const VentanaTraer: React.FC<{
  anio: number;
  pendientes: PendientesDelAnio;
  servicios: Servicio[];
  onTraer: (nuevos: FuenteServicio[], actualizar: PendientesDelAnio['actualizar']) => Promise<string | null>;
  onCerrar: () => void;
}> = ({ anio, pendientes, servicios, onTraer, onCerrar }) => {
  const conContrato = pendientes.nuevos.filter((f) => f.contrato && !f.cancelado);
  const enProceso = pendientes.nuevos.filter((f) => !f.contrato && !f.cancelado);
  const cancelados = pendientes.nuevos.filter((f) => f.cancelado);
  const ganan = pendientes.actualizar.filter((a) => a.ganaContrato);
  const soloLiga = pendientes.actualizar.filter((a) => !a.ganaContrato);
  // Los que todavía no tienen contrato se proponen cuando el año aún no tiene
  // contratos (como un anteproyecto); en un año ya contratado, se eligen a mano.
  const anioSinContratos = !conContrato.length && !servicios.some((x) => x.contrato);
  const [elegidos, setElegidos] = useState<Set<FuenteServicio>>(() => new Set([...conContrato, ...(anioSinContratos ? enProceso : [])]));
  const [actualizar, setActualizar] = useState(true);
  const [verCancelados, setVerCancelados] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const alternar = (lista: FuenteServicio[], si: boolean) => setElegidos((prev) => {
    const n = new Set(prev);
    lista.forEach((f) => (si ? n.add(f) : n.delete(f)));
    return n;
  });

  const traer = async () => {
    setGuardando(true);
    const e = await onTraer(pendientes.nuevos.filter((f) => elegidos.has(f)), [...(actualizar ? ganan : []), ...soloLiga]);
    setGuardando(false);
    if (e) setError(e); else onCerrar();
  };

  const seccion = (titulo: string, detalle: string, lista: FuenteServicio[]) => lista.length > 0 && (
    <div className="rounded-2xl border border-slate-200 overflow-hidden">
      <label className="flex items-center gap-3 bg-slate-50 px-4 py-2.5 cursor-pointer">
        <input type="checkbox" className="accent-[#0F4C3A]" checked={lista.every((f) => elegidos.has(f))}
          ref={(el) => { if (el) el.indeterminate = lista.some((f) => elegidos.has(f)) && !lista.every((f) => elegidos.has(f)); }}
          onChange={(e) => alternar(lista, e.target.checked)} />
        <span className="flex-1">
          <span className="text-sm font-bold text-slate-800">{titulo}</span>
          <span className="ml-2 text-xs text-slate-400">{detalle}</span>
        </span>
        <span className="text-xs font-bold tabular-nums text-slate-500">{lista.filter((f) => elegidos.has(f)).length}/{lista.length}</span>
      </label>
      <div className="max-h-56 overflow-y-auto divide-y divide-slate-100">
        {lista.map((f, k) => (
          <label key={`${f.estatusId ?? 'p'}-${f.contrato ?? k}`} className="flex items-start gap-3 px-4 py-2.5 hover:bg-slate-50 cursor-pointer">
            <input type="checkbox" className="mt-1 accent-[#0F4C3A]" checked={elegidos.has(f)} onChange={(e) => alternar([f], e.target.checked)} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 flex-wrap">
                <span className={`text-sm font-bold ${f.contrato ? 'text-slate-800' : 'text-slate-400 italic'}`}>{f.contrato ?? 'Sin contrato'}</span>
                <FaseChip fase={f.fase} />
              </span>
              <span className="block text-xs text-slate-600 truncate">{f.descripcion ?? '—'}</span>
              {f.proveedor && <span className="block text-xs text-slate-400 truncate">{f.proveedor}</span>}
            </span>
          </label>
        ))}
      </div>
    </div>
  );

  const total = elegidos.size + (actualizar ? ganan.length : 0);

  return (
    <Ventana titulo={`Servicios de ${anio}`} subtitulo={`De Estatus ${anio} y Pagos ${anio} que todavía no están en Auditoría`} onCerrar={onCerrar} ancho="max-w-2xl">
      <div className="space-y-3">
        {seccion('Con contrato', 'contratados o con pagos', conContrato)}
        {seccion('Todavía sin contrato', 'en proceso de contratación', enProceso)}
        {anioSinContratos && enProceso.length > 0 && (
          <p className="text-xs text-slate-500">Ningún servicio de {anio} tiene contrato todavía. Se agregan con su nombre y, en cuanto Estatus les ponga número de contrato, Auditoría lo mostrará solo.</p>
        )}
        {ganan.length > 0 && (
          <label className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 cursor-pointer">
            <input type="checkbox" className="mt-1 accent-[#0F4C3A]" checked={actualizar} onChange={(e) => setActualizar(e.target.checked)} />
            <span>
              <span className="block text-sm font-bold text-emerald-900">Guardar el contrato de {ganan.length} servicio{ganan.length !== 1 ? 's' : ''} que ya lo tiene{ganan.length !== 1 ? 'n' : ''}</span>
              <span className="block text-xs text-emerald-800">
                {ganan.slice(0, 3).map((a) => a.cambios.contrato).join(' · ')}{ganan.length > 3 ? ` y ${ganan.length - 3} más` : ''}
              </span>
            </span>
          </label>
        )}
        {cancelados.length > 0 && (
          <div>
            <button type="button" onClick={() => setVerCancelados((v) => !v)} className="text-xs font-semibold text-slate-400 hover:text-slate-600">
              {verCancelados ? 'Ocultar' : 'Ver'} {cancelados.length} cancelado{cancelados.length !== 1 ? 's' : ''} en Estatus {anio}
            </button>
            {verCancelados && <div className="mt-2">{seccion('Cancelados', 'normalmente no se auditan', cancelados)}</div>}
          </div>
        )}
        {!conContrato.length && !enProceso.length && !ganan.length && !cancelados.length && (
          <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">Todos los servicios de {anio} ya están en Auditoría.</p>
        )}
        {error && <p className="rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <button className={botonSecundario} onClick={onCerrar}>Cancelar</button>
          <button className={botonPrimario} disabled={guardando || (!total && !soloLiga.length)} onClick={traer}>
            {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {elegidos.size ? `Agregar ${elegidos.size}` : 'Guardar'}{actualizar && ganan.length ? ` y actualizar ${ganan.length}` : ''}
          </button>
        </div>
      </div>
    </Ventana>
  );
};

// ── Importar la hoja de Excel ───────────────────────────────────────────────

const VentanaImportar: React.FC<{
  anio: number;
  anios: number[];
  cargando: boolean;
  existentes: Servicio[];
  letraActual: (servicioId: number, mes: number) => Estado | null;
  onCambiarAnio: (a: number) => void;
  onImportar: (hoja: HojaLeida) => Promise<string | null>;
  onCerrar: () => void;
}> = ({ anio, anios, cargando, existentes, letraActual, onCambiarAnio, onImportar, onCerrar }) => {
  const [archivo, setArchivo] = useState<string | null>(null);
  const [hoja, setHoja] = useState<HojaLeida | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [importando, setImportando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [arrastrando, setArrastrando] = useState(false);

  const leer = async (f: File) => {
    setArchivo(f.name);
    setHoja(null);
    setError(null);
    setLeyendo(true);
    try {
      const { leerLibro } = await import('../utils/auditoriaExcel');
      const hojas = await leerLibro(await f.arrayBuffer());
      // La primera hoja que tenga contratos; si ninguna, la primera con su aviso.
      const leidas = hojas.map((h) => leerHojaAuditoria(h.celdas));
      const buena = leidas.find((h) => h.filas.length) ?? leidas[0];
      if (!buena) throw new Error('El archivo no tiene hojas.');
      setHoja(buena);
    } catch (e: any) {
      console.error('No se pudo leer el Excel de Auditoría:', e);
      setError(`No pude leer el archivo. ¿Es un .xlsx? (${e?.message ?? 'error'})`);
    } finally {
      setLeyendo(false);
    }
  };

  const plan = useMemo(() => (hoja && !cargando ? planearImportacion(hoja.filas, existentes, letraActual) : null), [hoja, cargando, existentes, letraActual]);
  const otroAnio = hoja?.anio && hoja.anio !== anio ? hoja.anio : null;

  const importar = async () => {
    if (!hoja) return;
    setImportando(true);
    setError(null);
    const e = await onImportar(hoja);
    setImportando(false);
    if (e) setError(e); else onCerrar();
  };

  return (
    <Ventana titulo={`Importar Excel a Auditoría ${anio}`} subtitulo="La misma hoja de control que ya llevan: contrato, descripción, proveedor y las letras de cada mes" onCerrar={onCerrar} ancho="max-w-2xl">
      <div className="space-y-4">
        <label
          onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={(e) => { e.preventDefault(); setArrastrando(false); const f = e.dataTransfer.files?.[0]; if (f) leer(f); }}
          className={`flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-7 text-center cursor-pointer transition-colors ${arrastrando ? 'border-[#0F4C3A] bg-emerald-50' : 'border-slate-200 hover:border-[#0F4C3A]/40 hover:bg-slate-50'}`}
        >
          {leyendo ? <Loader2 className="h-7 w-7 text-[#0F4C3A] animate-spin" /> : <FileSpreadsheet className="h-7 w-7 text-[#0F4C3A]" />}
          <span className="text-sm font-bold text-slate-700">{archivo ?? 'Arrastra aquí el archivo o haz clic para elegirlo'}</span>
          <span className="text-xs text-slate-400">.xlsx · se busca el encabezado “No. Contrato o Pedido” y los meses enero a diciembre</span>
          <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) leer(f); e.target.value = ''; }} />
        </label>

        {hoja && hoja.avisos.length > 0 && (
          <ul className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 space-y-1">
            {hoja.avisos.slice(0, 6).map((a) => (
              <li key={a} className="flex gap-2 text-xs text-amber-800"><AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />{a}</li>
            ))}
            {hoja.avisos.length > 6 && <li className="text-xs text-amber-700 pl-5">…y {hoja.avisos.length - 6} aviso(s) más.</li>}
          </ul>
        )}

        {otroAnio && (
          <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm text-sky-800">Los contratos del archivo son de <b>{otroAnio}</b> y estás en <b>{anio}</b>.</p>
            {anios.includes(otroAnio) && (
              <button className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-sky-700" onClick={() => onCambiarAnio(otroAnio)}>
                Importar en {otroAnio}
              </button>
            )}
          </div>
        )}

        {hoja && hoja.filas.length > 0 && (cargando || !plan ? (
          <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Comparando con {anio}…</div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { n: plan.nuevos.length, t: 'servicios nuevos' },
                { n: plan.actualizados.length, t: 'servicios con datos nuevos' },
                { n: plan.letrasNuevas, t: 'letras nuevas' },
                { n: plan.letrasQueCambian, t: 'letras que cambian' },
              ].map((x) => (
                <div key={x.t} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                  <p className="text-xl font-black text-[#0F4C3A] tabular-nums">{x.n}</p>
                  <p className="text-[11px] font-semibold text-slate-500 leading-tight">{x.t}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-500">
              {hoja.filas.length} contratos en el archivo · {plan.letrasIguales} letras ya estaban igual.
              Las celdas vacías del archivo <b>no borran</b> lo que ya está capturado.
            </p>
            {plan.letrasQueCambian > 0 && (
              <div className="rounded-xl border border-slate-200 max-h-40 overflow-y-auto text-xs divide-y divide-slate-100">
                {plan.letras.filter((l) => l.antes).slice(0, 40).map((l) => (
                  <div key={`${l.contrato}-${l.mes}`} className="flex items-center gap-2 px-3 py-1.5">
                    <span className="font-semibold text-slate-700 truncate flex-1">{l.contrato}</span>
                    <span className="text-slate-400 w-20">{MESES[l.mes - 1]}</span>
                    <Pill estado={l.antes!} /><span className="text-slate-400">→</span><Pill estado={l.estado} />
                  </div>
                ))}
              </div>
            )}
          </>
        ))}

        {error && <p className="rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">{error}</p>}

        <div className="flex justify-end gap-2">
          <button className={botonSecundario} onClick={onCerrar}>Cancelar</button>
          <button className={botonPrimario} onClick={importar}
            disabled={importando || cargando || !plan || (!plan.nuevos.length && !plan.actualizados.length && !plan.letras.length)}>
            {importando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Importar a {anio}
          </button>
        </div>
      </div>
    </Ventana>
  );
};

// ── Ayuda ──────────────────────────────────────────────────────────────────

type TemaAyuda = 'letras' | 'capturar' | 'servicios' | 'tablero';

const Tecla: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <kbd className="inline-flex min-w-[1.6rem] items-center justify-center rounded-md border border-slate-300 border-b-2 bg-white px-1.5 py-0.5 font-sans text-[11px] font-bold text-slate-700">{children}</kbd>
);

const Paso: React.FC<{ icono: React.ElementType; titulo: React.ReactNode; children: React.ReactNode }> = ({ icono: Icono, titulo, children }) => (
  <div className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-3.5">
    <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-[#0F4C3A]/8 text-[#0F4C3A]" style={{ background: 'rgba(15,76,58,0.08)' }}>
      <Icono className="h-4.5 w-4.5" />
    </span>
    <div className="min-w-0">
      <p className="text-sm font-bold text-slate-800">{titulo}</p>
      <div className="mt-0.5 text-xs leading-relaxed text-slate-600">{children}</div>
    </div>
  </div>
);

const VentanaAyuda: React.FC<{ inicial: TemaAyuda; puedeEditar: boolean; onCerrar: () => void }> = ({ inicial, puedeEditar, onCerrar }) => {
  const [tema, setTema] = useState<TemaAyuda>(inicial);
  const temas: { id: TemaAyuda; etiqueta: string }[] = [
    { id: 'letras', etiqueta: 'Las letras' },
    { id: 'capturar', etiqueta: 'Capturar' },
    { id: 'servicios', etiqueta: 'Servicios y Excel' },
    { id: 'tablero', etiqueta: 'Leer el tablero' },
  ];
  const SIGNIFICADO: Record<Estado, string> = {
    C: 'La entrega de ese mes está completa.',
    R: 'La entrega de ese mes ya fue revisada.',
    E: 'La entrega de ese mes se está revisando.',
    N: 'Ese mes no aplica para el contrato.',
  };
  return (
    <Ventana titulo="¿Cómo se usa Auditoría?" subtitulo="El control mensual de entregables: un renglón por contrato y una letra por mes" onCerrar={onCerrar} ancho="max-w-3xl">
      <div className="space-y-4">
        <div className="flex gap-1 rounded-xl bg-slate-100 p-1 overflow-x-auto" role="tablist" aria-label="Temas de ayuda">
          {temas.map((t) => (
            <button key={t.id} role="tab" aria-selected={tema === t.id} onClick={() => setTema(t.id)}
              className={`flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-sm transition-all ${tema === t.id ? 'bg-white font-bold text-[#0F4C3A] shadow-sm ring-1 ring-slate-200' : 'font-medium text-slate-500 hover:bg-white/70 hover:text-slate-800'}`}>
              {t.etiqueta}
            </button>
          ))}
        </div>

        {tema === 'letras' && (
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              {ESTADOS.map((e) => (
                <div key={e} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3">
                  <Pill estado={e} grande />
                  <div>
                    <p className="text-sm font-bold text-slate-800">{ESTADO_INFO[e].etiqueta}</p>
                    <p className="text-xs text-slate-500">{SIGNIFICADO[e]}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3">
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md border border-dashed border-orange-300 bg-orange-50"><span className="h-2 w-2 rounded-full bg-orange-400" /></span>
                <div>
                  <p className="text-sm font-bold text-slate-800">Por registrar</p>
                  <p className="text-xs text-slate-500">El mes ya terminó, el contrato estaba vigente y todavía no tiene letra.</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3">
                <span className="h-9 w-9 flex-shrink-0 rounded-md border border-slate-200" style={FUERA_VIGENCIA} />
                <div>
                  <p className="text-sm font-bold text-slate-800">Fuera de vigencia</p>
                  <p className="text-xs text-slate-500">El contrato no estaba vigente ese mes (fechas de Pagos). Se puede capturar igual.</p>
                </div>
              </div>
            </div>
            <p className="text-xs text-slate-500">Una celda vacía en un mes que todavía no termina no es un pendiente: simplemente aún no toca.</p>
          </div>
        )}

        {tema === 'capturar' && (puedeEditar ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <Paso icono={MousePointerClick} titulo="Clic en una celda">
              Se abre una ventanita con las cuatro letras, quién puso la actual y cuándo, y el <b>historial</b> de esa celda.
            </Paso>
            <Paso icono={Keyboard} titulo={<>Escribe la letra: <Tecla>C</Tecla> <Tecla>R</Tecla> <Tecla>E</Tecla> <Tecla>N</Tecla></>}>
              Con una celda elegida, escribe la letra y el cursor pasa solo al mes siguiente, como en Excel.{' '}
              <Tecla>Supr</Tecla> la borra; las <Tecla>←</Tecla><Tecla>→</Tecla><Tecla>↑</Tecla><Tecla>↓</Tecla> y <Tecla>Tab</Tecla> mueven.
            </Paso>
            <Paso icono={Plus} titulo="Varias celdas a la vez">
              <b>Arrastra</b> sobre la tabla (o usa <Tecla>Shift</Tecla> + flechas) y elige la letra en la barra que aparece abajo,
              o escríbela con el teclado.
            </Paso>
            <Paso icono={FileSpreadsheet} titulo={<>Copiar y pegar: <Tecla>Ctrl</Tecla>+<Tecla>C</Tecla> / <Tecla>Ctrl</Tecla>+<Tecla>V</Tecla></>}>
              Copia un bloque de letras en Excel, elige la celda de inicio y pega. Una sola letra pegada sobre varias celdas las llena todas.
            </Paso>
            <Paso icono={Undo2} titulo={<>Deshacer: <Tecla>Ctrl</Tecla>+<Tecla>Z</Tecla></>}>
              Regresa la última captura. También aparece el botón <b>Deshacer</b> en el aviso de abajo después de cada cambio.
            </Paso>
            <Paso icono={Pencil} titulo="Observaciones y datos del contrato">
              Clic en la columna <b>Observaciones</b> para escribir (Enter guarda). El lápiz junto al contrato corrige número, descripción o proveedor, o lo quita.
            </Paso>
          </div>
        ) : (
          <div className="flex gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <Lock className="h-5 w-5 flex-shrink-0 text-slate-400" />
            <div className="text-sm text-slate-600">
              <p className="font-bold text-slate-800">Tienes Auditoría en consulta</p>
              <p className="mt-1">Sólo el <b>área de Auditoría</b> captura y corrige aquí. Tú puedes ver todo, filtrar, revisar el historial de cada celda (clic en ella) y descargar el Excel.</p>
              <p className="mt-1">Si te toca capturar, pide a un administrador que te marque como parte del área en Accesos → Usuarios.</p>
            </div>
          </div>
        ))}

        {tema === 'servicios' && (
          <div className="grid gap-2 sm:grid-cols-2">
            {puedeEditar && (
              <>
                <Paso icono={RefreshCw} titulo="Traer servicios del año">
                  Junta los servicios de <b>Estatus</b> del año (también los que aún no tienen contrato, como en un anteproyecto) con los contratos de <b>Pagos</b>.
                  El botón verde dice cuántos faltan; eliges cuáles se agregan. Cuando Estatus le pone contrato a un servicio, aquí aparece solo.
                </Paso>
                <Paso icono={Plus} titulo="Agregar servicio">
                  Para un contrato, pedido o servicio que no está en Estatus ni en Pagos (el contrato es opcional). Al escribir el número te sugiere los de Pagos y llena solos los demás datos.
                </Paso>
                <Paso icono={Upload} titulo="Importar Excel">
                  Sube la hoja de control que ya llevan (encabezado “No. Contrato o Pedido” y los meses). Antes de importar te enseña qué cambia.
                  Las celdas vacías del archivo <b>no borran</b> lo que ya está capturado.
                </Paso>
              </>
            )}
            <Paso icono={Download} titulo="Descargar Excel">
              Baja lo que ves en pantalla (con búsqueda y filtros aplicados) con el formato de la hoja original: colores, conteos con fórmula y leyenda.
              {puedeEditar && ' Ese mismo archivo se puede volver a importar.'}
            </Paso>
            <Paso icono={History} titulo="Cada año por separado">
              Arriba a la derecha eliges el año. Cada año tiene sus propios servicios y letras; el punto dorado marca el año en curso.
            </Paso>
          </div>
        )}

        {tema === 'tablero' && (
          <div className="grid gap-2 sm:grid-cols-2">
            <Paso icono={ClipboardCheck} titulo="El avance del año">
              La barra de arriba dice qué parte de los meses ya terminados tiene letra y cuántos están completos.
            </Paso>
            <Paso icono={Search} titulo="Tarjetas y búsqueda">
              Clic en una tarjeta (Completo, En revisión, <b>Por registrar</b>…) para ver sólo esos servicios; otro clic quita el filtro.
              La búsqueda encuentra por contrato, descripción, proveedor u observación.
            </Paso>
            <Paso icono={ArrowUpDown} titulo="Ordenar">
              Clic en el encabezado de Contrato, Proveedor o en los conteos (Completo, Revisado…) para ordenar; otro clic invierte el orden.
            </Paso>
            <Paso icono={History} titulo="Quién y cuándo">
              Pasa el cursor sobre una letra para ver quién la puso y cuándo; en la ventanita de la celda está su historial completo.
              La columna dorada <b>HOY</b> es el mes en curso, y abajo están los completos de cada mes.
            </Paso>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
          <p className="text-[11px] text-slate-400">Abre esta ayuda cuando quieras con el botón <b>?</b> o la tecla <Tecla>?</Tecla></p>
          <button className={botonPrimario} onClick={onCerrar}>Entendido</button>
        </div>
      </div>
    </Ventana>
  );
};

// ── Ventanita de una celda ──────────────────────────────────────────────────

interface Movimiento { antes: string | null; despues: string | null; por_nombre: string | null; created_at: string }

const PopoverCelda: React.FC<{
  rect: DOMRect;
  fila: Fila;
  mes: number;
  anio: number;
  marca: Marca | undefined;
  puedeEditar: boolean;
  onElegir: (estado: Estado | null) => void;
  onCerrar: () => void;
}> = ({ rect, fila, mes, anio, marca, puedeEditar, onElegir, onCerrar }) => {
  const caja = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: rect.bottom + 6, left: rect.left });
  const [historial, setHistorial] = useState<Movimiento[] | null>(null);
  const [verHistorial, setVerHistorial] = useState(false);

  useLayoutEffect(() => {
    const el = caja.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let top = rect.bottom + 6;
    if (top + h > window.innerHeight - 8) top = Math.max(8, rect.top - h - 6);
    let left = rect.left + rect.width / 2 - w / 2;
    left = Math.min(Math.max(8, left), window.innerWidth - w - 8);
    setPos({ top, left });
  }, [rect, verHistorial, historial]);

  useEffect(() => {
    const fuera = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (caja.current?.contains(t) || t.closest?.('[data-celda]')) return;
      onCerrar();
    };
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, [onCerrar]);

  useEffect(() => {
    if (!verHistorial || historial) return;
    let vivo = true;
    supabase.from('auditoria_bitacora').select('antes,despues,por_nombre,created_at')
      .eq('servicio_id', fila.s.id).eq('mes', mes).order('created_at', { ascending: false }).limit(8)
      .then(({ data }) => { if (vivo) setHistorial((data as Movimiento[]) ?? []); });
    return () => { vivo = false; };
  }, [verHistorial, historial, fila.s.id, mes]);

  const fuera = fila.vigencia && !fila.vigencia.has(mes);

  return createPortal(
    <div ref={caja} role="dialog" aria-label={`${fila.contrato ?? fila.s.descripcion ?? ''}, ${MESES[mes - 1]}`}
      className="fixed z-[9996] w-[300px] rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/15 p-3"
      style={{ top: pos.top, left: pos.left }}>
      <div className="flex items-start justify-between gap-2 mb-2.5">
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-wider text-[#B38E5D]">{MESES[mes - 1]} {anio}</p>
          <p className="text-xs font-bold text-slate-700 truncate" title={fila.contrato ?? fila.s.descripcion ?? ''}>{fila.contrato ?? fila.s.descripcion}</p>
        </div>
        <button onClick={onCerrar} aria-label="Cerrar" className="h-6 w-6 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100"><X className="h-3.5 w-3.5" /></button>
      </div>
      {fuera && <p className="mb-2 rounded-lg bg-slate-50 px-2 py-1.5 text-[11px] text-slate-500">Este mes está fuera de la vigencia del contrato.</p>}
      {puedeEditar ? (
        <div className="grid grid-cols-2 gap-1.5">
          {ESTADOS.map((e) => (
            <button key={e} onClick={() => onElegir(e)}
              className={`flex items-center gap-2 rounded-xl border px-2 py-1.5 text-left transition-colors ${marca?.estado === e ? 'border-[#0F4C3A] bg-[#0F4C3A]/5 ring-1 ring-[#0F4C3A]' : `border-slate-200 ${ESTILO[e].boton}`}`}>
              <Pill estado={e} />
              <span className="text-xs font-semibold text-slate-700 leading-tight flex-1">{ESTADO_INFO[e].etiqueta}</span>
              <kbd className="text-[9px] font-bold text-slate-300">{e}</kbd>
            </button>
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2">
          {marca ? <><Pill estado={marca.estado} /><span className="text-sm font-semibold text-slate-700">{ESTADO_INFO[marca.estado].etiqueta}</span></> : <span className="text-sm text-slate-500">Sin registrar</span>}
        </div>
      )}
      {marca && (
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="text-[11px] text-slate-400 truncate">{marca.actualizado_nombre ?? 'Alguien'} · {fechaCorta(marca.updated_at)}</p>
          {puedeEditar && (
            <button onClick={() => onElegir(null)} className="text-[11px] font-bold text-rose-600 hover:text-rose-700 flex-shrink-0">Quitar letra</button>
          )}
        </div>
      )}
      <div className="mt-2 border-t border-slate-100 pt-2">
        <button onClick={() => setVerHistorial((v) => !v)} className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 hover:text-[#0F4C3A]">
          <History className="h-3.5 w-3.5" /> {verHistorial ? 'Ocultar historial' : 'Historial de esta celda'}
        </button>
        {verHistorial && (
          <div className="mt-2 space-y-1.5 max-h-40 overflow-y-auto">
            {!historial ? <Loader2 className="h-4 w-4 animate-spin text-slate-300" />
              : !historial.length ? <p className="text-[11px] text-slate-400">Sin cambios registrados.</p>
                : historial.map((h, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-[11px]">
                    <span className="font-bold text-slate-500 w-4 text-center">{h.antes ?? '·'}</span>
                    <span className="text-slate-300">→</span>
                    <span className="font-bold text-slate-700 w-4 text-center">{h.despues ?? '·'}</span>
                    <span className="text-slate-500 truncate flex-1">{h.por_nombre ?? '—'}</span>
                    <span className="text-slate-400 flex-shrink-0">{fechaCorta(h.created_at)}</span>
                  </div>
                ))}
          </div>
        )}
      </div>
      {puedeEditar && <p className="mt-2 text-[10px] text-slate-300">Tip: con la celda elegida, escribe la letra.</p>}
    </div>,
    document.body,
  );
};

// ── Barra con número (como las barras de datos de Excel) ────────────────────

const Barra: React.FC<{ n: number; max: number; color: string; claro: string; fuerte?: boolean }> = ({ n, max, color, claro, fuerte }) => (
  <div className="relative h-6 w-full overflow-hidden rounded-md bg-slate-100/80">
    {n > 0 && (
      <div className="absolute inset-y-0 left-0 rounded-md transition-[width] duration-300"
        style={{ width: `${Math.min(100, (n / Math.max(max, 1)) * 100)}%`, background: `linear-gradient(90deg, ${color}, ${claro})` }} />
    )}
    <span className={`relative z-10 flex h-full items-center justify-center tabular-nums ${n ? `font-bold ${fuerte ? 'text-slate-900' : 'text-slate-800'}` : 'text-slate-300'}`}>{n}</span>
  </div>
);

// ── Módulo ──────────────────────────────────────────────────────────────────

interface Props { user: User }

const Auditoria: React.FC<Props> = ({ user }) => {
  // Sólo el área de Auditoría captura, sin importar su rol en el resto del
  // sistema (la base lo exige igual: puede_capturar_auditoria()).
  const puedeEditar = user.areaAuditoria === true;
  const hoy = useMemo(() => new Date(), []);
  const anioHoy = hoy.getFullYear();

  const [anio, setAnio] = useState(anioHoy);
  const [aniosConDatos, setAniosConDatos] = useState<number[]>([]);
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [marcas, setMarcas] = useState<Record<string, Marca>>({});
  const [pagos, setPagos] = useState<PagoAnio[]>([]);
  // Los servicios del año en Estatus <año> (si existe la tabla de ese año).
  const [estatusAnio, setEstatusAnio] = useState<EstatusEntrada[]>([]);
  const [cargando, setCargando] = useState(true);
  const [faltaTabla, setFaltaTabla] = useState(false);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<Filtro>(null);
  const [orden, setOrden] = useState<{ por: Columna; asc: boolean }>({ por: 'orden', asc: true });

  const [sel, setSel] = useState<Seleccion | null>(null);
  const [popover, setPopover] = useState<{ r: number; m: number; rect: DOMRect } | null>(null);
  const [editandoObs, setEditandoObs] = useState<{ id: number; valor: string } | null>(null);
  const [ventana, setVentana] = useState<null | { tipo: 'servicio'; servicio: Servicio | null } | { tipo: 'pagos' } | { tipo: 'importar' }>(null);
  const [aviso, setAviso] = useState<{ texto: string; tono: 'ok' | 'error'; deshacer?: boolean } | null>(null);
  const [guardando, setGuardando] = useState(0);
  const [ayuda, setAyuda] = useState<TemaAyuda | null>(null);
  // Un punto en el botón de ayuda hasta que la persona la abre la primera vez.
  const [ayudaNueva, setAyudaNueva] = useState(() => {
    try { return localStorage.getItem('auditoria.ayudaVista') !== '1'; } catch { return false; }
  });
  const abrirAyuda = (tema: TemaAyuda = 'letras') => {
    setAyuda(tema);
    setAyudaNueva(false);
    try { localStorage.setItem('auditoria.ayudaVista', '1'); } catch { /* sin almacenamiento: no pasa nada */ }
  };

  const deshacerRef = useRef<Cambio[][]>([]);
  const arrastrando = useRef<{ r: number; m: number; movio: boolean } | null>(null);
  const rejilla = useRef<HTMLDivElement>(null);
  const peticion = useRef(0);
  const ultimaCarga = useRef(0);

  const anios = useMemo(() => {
    const s = new Set<number>([2025, anioHoy, anioHoy + 1, ...aniosConDatos]);
    return [...s].sort((a, b) => a - b);
  }, [anioHoy, aniosConDatos]);

  // ── Carga ────────────────────────────────────────────────────────────────

  const cargar = useCallback(async (a: number, silencioso = false) => {
    const n = ++peticion.current;
    if (!silencioso) setCargando(true);
    setErrorCarga(null);
    const servicios = (columnas: string) => supabase.from('auditoria_servicios')
      .select(`${columnas},auditoria_marcas(mes,estado,actualizado_nombre,updated_at)`)
      .eq('anio', a);
    let [sv, pg, an, es] = await Promise.all([
      servicios('id,anio,contrato,descripcion,proveedor,observacion,orden,estatus_id'),
      supabase.from('pagos').select('*').eq('anio', a),
      supabase.from('auditoria_servicios').select('anio'),
      // No todos los años tienen tabla de Estatus (2025 no): sin ella, sólo Pagos.
      supabase.from(`estatus_${a}`).select('*'),
    ]);
    // Sin la migración 20261022020000 no existe estatus_id: se lee sin él.
    if (sv.error?.code === '42703') sv = await servicios('id,anio,contrato,descripcion,proveedor,observacion,orden');
    if (n !== peticion.current) return;
    ultimaCarga.current = Date.now();
    if (sv.error) {
      if (faltaTablaError(sv.error)) setFaltaTabla(true);
      else setErrorCarga('No se pudo cargar Auditoría. Revisa tu conexión e intenta de nuevo.');
      console.error('Auditoría:', sv.error);
      setCargando(false);
      return;
    }
    setFaltaTabla(false);
    const nuevasMarcas: Record<string, Marca> = {};
    const lista: Servicio[] = (sv.data ?? []).map((row: any) => {
      (row.auditoria_marcas ?? []).forEach((m: any) => {
        nuevasMarcas[clave(row.id, m.mes)] = { estado: m.estado, actualizado_nombre: m.actualizado_nombre, updated_at: m.updated_at };
      });
      const { auditoria_marcas: _omit, ...s } = row;
      return s as Servicio;
    });
    setServicios(lista);
    setMarcas(nuevasMarcas);
    setPagos((pg.data ?? [])
      .filter((p: any) => limpiarContrato(p['No. Contrato']))
      .map((p: any) => ({
        contrato: limpiarContrato(p['No. Contrato']),
        descripcion: String(p['Objeto del contrato'] ?? '').replace(/\s+/g, ' ').trim() || null,
        proveedor: String(p['Proveedor'] ?? '').replace(/\s+/g, ' ').trim() || null,
        inicio: parseFechaFlexible(p['Fecha de inicio']),
        fin: parseFechaFlexible(p['Fecha de termino']),
      })));
    setEstatusAnio(es.error ? [] : (es.data ?? []).map((e: any) => ({
      id: Number(e.ID ?? e.id),
      nombre: e['Nombre del Servicio.'] ?? e['Nombre del Servicio'] ?? null,
      contrato: e['No. de contrato'] ?? null,
      proveedor: e['Proveedor'] ?? null,
      inicio: parseFechaFlexible(e['Vigencia de inicio']),
      fin: parseFechaFlexible(e['Vigencia de Término'] ?? e['Vigencia de termino']),
      fase: e['Estatus'] ?? null,
    })).filter((e: EstatusEntrada) => Number.isFinite(e.id)));
    if (!an.error) setAniosConDatos([...new Set((an.data ?? []).map((x: any) => Number(x.anio)))]);
    setCargando(false);
  }, []);

  useEffect(() => {
    setSel(null);
    setPopover(null);
    setAviso(null);
    deshacerRef.current = [];
    cargar(anio);
  }, [anio, cargar]);

  // Al volver a la pestaña se trae lo que otros hayan capturado.
  useEffect(() => {
    const alVolver = () => {
      if (document.visibilityState === 'visible' && Date.now() - ultimaCarga.current > 30_000 && !guardando) cargar(anio, true);
    };
    document.addEventListener('visibilitychange', alVolver);
    window.addEventListener('focus', alVolver);
    return () => { document.removeEventListener('visibilitychange', alVolver); window.removeEventListener('focus', alVolver); };
  }, [anio, cargar, guardando]);

  useEffect(() => {
    if (!aviso) return;
    const t = window.setTimeout(() => setAviso(null), aviso.deshacer ? 6000 : 3500);
    return () => window.clearTimeout(t);
  }, [aviso]);

  // ── Renglones ────────────────────────────────────────────────────────────

  const cerrado = ultimoMesCerrado(anio, hoy);
  const mesActual = anio === anioHoy ? hoy.getMonth() + 1 : null;

  // Estatus + Pagos del año, ya ligados: de aquí salen la vigencia de cada
  // renglón, el contrato de los que aún no lo tenían y lo que falta traer.
  const fuentes = useMemo(() => fuentesDelAnio(pagos, estatusAnio), [pagos, estatusAnio]);

  const todas: Fila[] = useMemo(() => servicios.map((s) => {
    const fuente = fuenteDe({ id: s.id, contrato: s.contrato, proveedor: s.proveedor, estatus_id: s.estatus_id ?? null }, fuentes);
    const contrato = s.contrato ?? fuente?.contrato ?? null;
    const vigencia = fuente ? mesesEnVigencia(fuente.inicio, fuente.fin, anio) : null;
    const letras: Record<number, Estado | undefined> = {};
    for (let m = 1; m <= 12; m++) letras[m] = marcas[clave(s.id, m)]?.estado;
    return { s, fuente, contrato, vigencia, letras, conteo: contar(Object.values(letras)), faltan: mesesPorRegistrar(letras, vigencia, cerrado) };
  }), [servicios, marcas, fuentes, anio, cerrado]);

  const filas = useMemo(() => {
    const q = normalizar(busqueda.trim());
    const lista = todas.filter((f) => {
      if (filtro === 'P' && !f.faltan.length) return false;
      if (filtro && filtro !== 'P' && !f.conteo[filtro]) return false;
      if (!q) return true;
      return normalizar(`${f.contrato ?? 'sin contrato'} ${f.s.descripcion ?? ''} ${f.s.proveedor ?? f.fuente?.proveedor ?? ''} ${f.s.observacion ?? ''} ${f.fuente?.fase ?? ''}`).includes(q);
    });
    const dir = orden.asc ? 1 : -1;
    // Los que aún no tienen contrato van al final, por nombre.
    const porContrato = (a: Fila, b: Fila) => {
      if (a.contrato && b.contrato) return compararContratos(a.contrato, b.contrato);
      if (a.contrato || b.contrato) return a.contrato ? -1 : 1;
      return (a.s.descripcion ?? '').localeCompare(b.s.descripcion ?? '', 'es');
    };
    lista.sort((a, b) => {
      switch (orden.por) {
        case 'orden': {
          const oa = a.s.orden ?? Infinity;
          const ob = b.s.orden ?? Infinity;
          return oa !== ob ? (oa < ob ? -1 : 1) * dir : porContrato(a, b) * dir;
        }
        case 'contrato': return porContrato(a, b) * dir;
        case 'proveedor': return (a.s.proveedor ?? '').localeCompare(b.s.proveedor ?? '', 'es') * dir || porContrato(a, b);
        case 'faltan': return (a.faltan.length - b.faltan.length) * dir || porContrato(a, b);
        default: return (a.conteo[orden.por] - b.conteo[orden.por]) * dir || porContrato(a, b);
      }
    });
    return lista;
  }, [todas, busqueda, filtro, orden]);

  useEffect(() => { setSel(null); setPopover(null); }, [busqueda, filtro, orden]);

  // ── Totales ──────────────────────────────────────────────────────────────

  const totales = useMemo(() => {
    const c = contar([]);
    let esperados = 0;
    let conLetra = 0;
    let faltan = 0;
    todas.forEach((f) => {
      (['C', 'R', 'E', 'N'] as Estado[]).forEach((e) => { c[e] += f.conteo[e]; });
      c.total += f.conteo.total;
      faltan += f.faltan.length;
      for (let m = 1; m <= cerrado; m++) {
        if (f.vigencia && !f.vigencia.has(m)) continue;
        esperados++;
        if (f.letras[m]) conLetra++;
      }
    });
    const porMes = Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      const activos = todas.filter((f) => !f.vigencia || f.vigencia.has(m)).length;
      return { m, activos, conteo: contar(filas.map((f) => f.letras[m])) };
    });
    return { c, esperados, conLetra, faltan, porMes };
  }, [todas, filas, cerrado]);

  const pendientes = useMemo(
    () => pendientesDelAnio(fuentes, servicios.map((x) => ({ id: x.id, contrato: x.contrato, proveedor: x.proveedor, estatus_id: x.estatus_id ?? null }))),
    [fuentes, servicios],
  );
  // Lo que el botón verde ofrece: servicios nuevos (sin los cancelados) y los
  // auditados que ya ganaron contrato.
  const porTraer = pendientes.nuevos.filter((f) => !f.cancelado).length + pendientes.actualizar.filter((a) => a.ganaContrato).length;
  const sugerenciasContrato = useMemo(
    () => pendientes.nuevos.filter((f) => f.contrato && !f.cancelado).sort((a, b) => compararContratos(a.contrato!, b.contrato!)),
    [pendientes],
  );

  // ── Guardar letras ───────────────────────────────────────────────────────

  const letraActual = useCallback((servicioId: number, mes: number) => marcas[clave(servicioId, mes)]?.estado ?? null, [marcas]);

  const marcasRef = useRef(marcas);
  marcasRef.current = marcas;

  const guardar = useCallback(async (cambiosBrutos: Cambio[], opciones: { deshacer?: boolean; mensaje?: string } = {}) => {
    if (!puedeEditar) return;
    const actuales = marcasRef.current;
    const cambios = cambiosBrutos.filter((c) => (actuales[clave(c.servicioId, c.mes)]?.estado ?? null) !== c.estado);
    if (!cambios.length) return;
    const previos: Cambio[] = cambios.map((c) => ({ ...c, estado: actuales[clave(c.servicioId, c.mes)]?.estado ?? null }));
    const previosMarca = Object.fromEntries(cambios.map((c) => [clave(c.servicioId, c.mes), actuales[clave(c.servicioId, c.mes)]]));

    const aplicar = (lista: Cambio[], base: Record<string, Marca | undefined> | null) => setMarcas((prev) => {
      const n = { ...prev };
      lista.forEach((c) => {
        const k = clave(c.servicioId, c.mes);
        if (base) { if (base[k]) n[k] = base[k]!; else delete n[k]; return; }
        if (c.estado) n[k] = { estado: c.estado, actualizado_nombre: user.name, updated_at: new Date().toISOString() };
        else delete n[k];
      });
      return n;
    });

    aplicar(cambios, null);
    setGuardando((g) => g + 1);
    try {
      const poner = cambios.filter((c) => c.estado);
      const quitar = cambios.filter((c) => !c.estado);
      if (poner.length) {
        const { data, error } = await supabase.from('auditoria_marcas')
          .upsert(poner.map((c) => ({ servicio_id: c.servicioId, mes: c.mes, estado: c.estado })), { onConflict: 'servicio_id,mes' })
          .select('servicio_id,mes,estado,actualizado_nombre,updated_at');
        if (error) throw error;
        setMarcas((prev) => {
          const n = { ...prev };
          (data ?? []).forEach((m: any) => { n[clave(m.servicio_id, m.mes)] = { estado: m.estado, actualizado_nombre: m.actualizado_nombre, updated_at: m.updated_at }; });
          return n;
        });
      }
      if (quitar.length) {
        const porServicio = new Map<number, number[]>();
        quitar.forEach((c) => porServicio.set(c.servicioId, [...(porServicio.get(c.servicioId) ?? []), c.mes]));
        const res = await Promise.all([...porServicio].map(([id, meses]) =>
          supabase.from('auditoria_marcas').delete().eq('servicio_id', id).in('mes', meses)));
        const err = res.find((r) => r.error)?.error;
        if (err) throw err;
      }
      if (opciones.deshacer !== false) {
        deshacerRef.current = [...deshacerRef.current.slice(-29), previos];
        const n = cambios.length;
        setAviso({
          texto: opciones.mensaje ?? (n === 1
            ? (cambios[0].estado ? `${ESTADO_INFO[cambios[0].estado].etiqueta} · ${MESES[cambios[0].mes - 1]}` : `Letra quitada · ${MESES[cambios[0].mes - 1]}`)
            : `${n} celdas actualizadas`),
          tono: 'ok', deshacer: true,
        });
      }
    } catch (e: any) {
      console.error('Auditoría: no se guardó', e);
      aplicar(cambios, previosMarca);
      setAviso({ texto: e?.code === '42501' ? 'Sólo el área de Auditoría puede capturar aquí.' : 'No se guardó el cambio. Revisa tu conexión.', tono: 'error' });
    } finally {
      setGuardando((g) => g - 1);
    }
  }, [puedeEditar, user.name]);

  const deshacer = useCallback(() => {
    const ultimo = deshacerRef.current.pop();
    if (!ultimo) { setAviso({ texto: 'No hay nada que deshacer.', tono: 'ok' }); return; }
    guardar(ultimo, { deshacer: false }).then(() => setAviso({ texto: 'Cambio deshecho', tono: 'ok' }));
  }, [guardar]);

  // "?" abre la ayuda desde cualquier parte del módulo.
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key !== '?' || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement;
      if (t?.tagName === 'INPUT' || t?.tagName === 'TEXTAREA' || t?.isContentEditable || document.querySelector('[aria-modal="true"]')) return;
      e.preventDefault();
      abrirAyuda();
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Ctrl+Z deshace la última captura mientras se esté en el módulo (no dentro
  // de un campo de texto, donde deshace lo escrito).
  useEffect(() => {
    if (!puedeEditar) return;
    const k = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.key.toLowerCase() !== 'z') return;
      const t = e.target as HTMLElement;
      if (t?.tagName === 'INPUT' || t?.tagName === 'TEXTAREA' || t?.isContentEditable || document.querySelector('[aria-modal="true"]')) return;
      e.preventDefault();
      deshacer();
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [puedeEditar, deshacer]);

  // ── Selección ────────────────────────────────────────────────────────────

  const rango = sel ? {
    rMin: Math.min(sel.r0, sel.r1), rMax: Math.max(sel.r0, sel.r1),
    mMin: Math.min(sel.m0, sel.m1), mMax: Math.max(sel.m0, sel.m1),
  } : null;
  const celdasElegidas = rango ? (rango.rMax - rango.rMin + 1) * (rango.mMax - rango.mMin + 1) : 0;

  const celdasDeRango = (): { servicioId: number; mes: number }[] => {
    if (!rango) return [];
    const out: { servicioId: number; mes: number }[] = [];
    for (let r = rango.rMin; r <= rango.rMax; r++) {
      const f = filas[r];
      if (!f) continue;
      for (let m = rango.mMin; m <= rango.mMax; m++) out.push({ servicioId: f.s.id, mes: m });
    }
    return out;
  };

  // ¿Hay columnas fuera de la vista a la izquierda o a la derecha?
  const [desborde, setDesborde] = useState({ izq: false, der: false });
  const medirDesborde = useCallback(() => {
    const el = rejilla.current;
    if (!el) return;
    const izq = el.scrollLeft > 4;
    const der = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
    setDesborde((d) => (d.izq === izq && d.der === der ? d : { izq, der }));
  }, []);
  useEffect(() => {
    medirDesborde();
    const el = rejilla.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(medirDesborde);
    ro.observe(el);
    return () => ro.disconnect();
  }, [medirDesborde, cargando, servicios.length, filas.length]);
  const desplazar = (dir: 1 | -1) => rejilla.current?.scrollBy({ left: dir * Math.max(240, (rejilla.current.clientWidth - 244) * 0.8), behavior: 'smooth' });

  const rectDe = (r: number, m: number) =>
    rejilla.current?.querySelector<HTMLElement>(`[data-celda="${r}-${m}"]`)?.getBoundingClientRect() ?? null;

  const enfocar = (r: number, m: number, extender = false) => {
    const rr = Math.max(0, Math.min(filas.length - 1, r));
    const mm = Math.max(1, Math.min(12, m));
    setSel((s) => (extender && s ? { ...s, r1: rr, m1: mm } : { r0: rr, m0: mm, r1: rr, m1: mm }));
    setPopover(null);
    requestAnimationFrame(() => {
      rejilla.current?.querySelector<HTMLElement>(`[data-celda="${rr}-${mm}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
  };

  const ponerLetra = (estado: Estado | null) => {
    if (!sel || !puedeEditar) return;
    const celdas = celdasDeRango();
    guardar(celdas.map((c) => ({ ...c, estado })));
    setPopover(null);
    // Una sola celda: avanza al mes siguiente para seguir capturando.
    if (celdas.length === 1 && estado && sel.m1 < 12) enfocar(sel.r1, sel.m1 + 1);
  };

  useEffect(() => {
    const soltar = () => {
      const a = arrastrando.current;
      arrastrando.current = null;
      if (!a || a.movio) return;
      // Clic sin arrastrar: abre (o cierra) la ventanita de la celda.
      setPopover((p) => {
        if (p && p.r === a.r && p.m === a.m) return null;
        const rect = rectDe(a.r, a.m);
        return rect ? { r: a.r, m: a.m, rect } : null;
      });
    };
    window.addEventListener('mouseup', soltar);
    return () => window.removeEventListener('mouseup', soltar);
  }, []);

  const alPresionarCelda = (e: React.MouseEvent, r: number, m: number) => {
    if (e.button !== 0) return;
    e.preventDefault();
    rejilla.current?.focus({ preventScroll: true });
    if (e.shiftKey && sel) {
      setSel({ ...sel, r1: r, m1: m });
      setPopover(null);
      return;
    }
    setSel({ r0: r, m0: m, r1: r, m1: m });
    arrastrando.current = { r, m, movio: false };
  };

  const alEntrarCelda = (r: number, m: number) => {
    const a = arrastrando.current;
    if (!a) return;
    if (a.r !== r || a.m !== m) a.movio = true;
    setPopover(null);
    setSel((s) => (s ? { ...s, r1: r, m1: m } : s));
  };

  const alTeclear = (e: React.KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return;
    if (!sel) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    const letra = k.length === 1 ? k.toUpperCase() : '';
    if ((ESTADOS as string[]).includes(letra)) { e.preventDefault(); ponerLetra(letra as Estado); return; }
    switch (k) {
      case 'Delete': case 'Backspace': e.preventDefault(); ponerLetra(null); return;
      case 'ArrowRight': e.preventDefault(); enfocar(sel.r1, sel.m1 + 1, e.shiftKey); return;
      case 'ArrowLeft': e.preventDefault(); enfocar(sel.r1, sel.m1 - 1, e.shiftKey); return;
      case 'ArrowDown': e.preventDefault(); enfocar(sel.r1 + 1, sel.m1, e.shiftKey); return;
      case 'ArrowUp': e.preventDefault(); enfocar(sel.r1 - 1, sel.m1, e.shiftKey); return;
      case 'Tab':
        e.preventDefault();
        if (e.shiftKey) enfocar(sel.m1 > 1 ? sel.r1 : sel.r1 - 1, sel.m1 > 1 ? sel.m1 - 1 : 12);
        else enfocar(sel.m1 < 12 ? sel.r1 : sel.r1 + 1, sel.m1 < 12 ? sel.m1 + 1 : 1);
        return;
      case 'Enter': {
        e.preventDefault();
        const rect = rectDe(sel.r1, sel.m1);
        setPopover((p) => (p ? null : rect ? { r: sel.r1, m: sel.m1, rect } : null));
        return;
      }
      case 'Escape': e.preventDefault(); if (popover) setPopover(null); else setSel(null); return;
    }
  };

  const alCopiar = (e: React.ClipboardEvent) => {
    if (!rango || (e.target as HTMLElement).tagName === 'INPUT') return;
    const lineas: string[] = [];
    for (let r = rango.rMin; r <= rango.rMax; r++) {
      const f = filas[r];
      const celdas: string[] = [];
      for (let m = rango.mMin; m <= rango.mMax; m++) celdas.push(f?.letras[m] ?? '');
      lineas.push(celdas.join('\t'));
    }
    e.clipboardData.setData('text/plain', lineas.join('\n'));
    e.preventDefault();
    setAviso({ texto: `${celdasElegidas} celda${celdasElegidas !== 1 ? 's' : ''} copiada${celdasElegidas !== 1 ? 's' : ''}`, tono: 'ok' });
  };

  const alPegar = (e: React.ClipboardEvent) => {
    if (!rango || !puedeEditar || (e.target as HTMLElement).tagName === 'INPUT') return;
    const bloque = leerPegado(e.clipboardData.getData('text/plain'));
    if (!bloque.length) return;
    e.preventDefault();
    const cambios: Cambio[] = [];
    // Una sola celda pegada sobre varias: llena todas (como Excel).
    if (bloque.length === 1 && bloque[0].length === 1) {
      const v = bloque[0][0];
      if (v === undefined) return;
      celdasDeRango().forEach((c) => cambios.push({ ...c, estado: v }));
    } else {
      bloque.forEach((linea, i) => linea.forEach((v, j) => {
        const f = filas[rango.rMin + i];
        const m = rango.mMin + j;
        if (!f || m > 12 || v === undefined) return;
        cambios.push({ servicioId: f.s.id, mes: m, estado: v });
      }));
    }
    guardar(cambios, { mensaje: `Pegado: ${cambios.length} celda${cambios.length !== 1 ? 's' : ''}` });
  };

  // ── Servicios ────────────────────────────────────────────────────────────

  const guardarServicio = async (inicial: Servicio | null, datos: Pick<Servicio, 'contrato' | 'descripcion' | 'proveedor' | 'observacion'>) => {
    const q = inicial
      ? supabase.from('auditoria_servicios').update(datos).eq('id', inicial.id).select('*').single()
      : supabase.from('auditoria_servicios').insert({ ...datos, anio }).select('*').single();
    const { data, error } = await q;
    if (error) {
      console.error('Auditoría: servicio', error);
      if (error.code === '23505') return `Ese contrato ya está en Auditoría ${anio}.`;
      if (error.code === '42501') return 'Sólo el área de Auditoría puede modificar este módulo.';
      if (error.code === '23502') return 'Para guardar un servicio sin contrato falta aplicar la migración 20261022020000_auditoria_servicios_del_anio.sql.';
      return 'No se pudo guardar. Intenta de nuevo.';
    }
    setServicios((prev) => (inicial ? prev.map((s) => (s.id === inicial.id ? (data as Servicio) : s)) : [...prev, data as Servicio]));
    if (!inicial) setAniosConDatos((a) => (a.includes(anio) ? a : [...a, anio]));
    setAviso({ texto: inicial ? 'Servicio actualizado' : `${nombreServicio(datos)} agregado`, tono: 'ok' });
    return null;
  };

  const borrarServicio = async (s: Servicio) => {
    const { error } = await supabase.from('auditoria_servicios').delete().eq('id', s.id);
    if (error) {
      console.error('Auditoría: borrar', error);
      return error.code === '42501' ? 'Sólo el área de Auditoría puede quitar servicios.' : 'No se pudo quitar. Intenta de nuevo.';
    }
    setServicios((prev) => prev.filter((x) => x.id !== s.id));
    setMarcas((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => !k.startsWith(`${s.id}-`))));
    deshacerRef.current = deshacerRef.current.map((l) => l.filter((c) => c.servicioId !== s.id)).filter((l) => l.length);
    setAviso({ texto: `${nombreServicio(s)} quitado de ${anio}`, tono: 'ok' });
    return null;
  };

  const guardarObservacion = async () => {
    if (!editandoObs) return;
    const s = servicios.find((x) => x.id === editandoObs.id);
    const valor = editandoObs.valor.trim() || null;
    setEditandoObs(null);
    if (!s || (s.observacion ?? null) === valor) return;
    setServicios((prev) => prev.map((x) => (x.id === s.id ? { ...x, observacion: valor } : x)));
    const { error } = await supabase.from('auditoria_servicios').update({ observacion: valor }).eq('id', s.id);
    if (error) {
      setServicios((prev) => prev.map((x) => (x.id === s.id ? { ...x, observacion: s.observacion } : x)));
      setAviso({ texto: 'No se guardó la observación.', tono: 'error' });
    }
  };

  const traerDelAnio = async (nuevos: FuenteServicio[], actualizar: PendientesDelAnio['actualizar']) => {
    const faltaMigracion = (e: any) => e?.code === '23502' || e?.code === '42703' || e?.code === 'PGRST204';
    if (nuevos.length) {
      const { error } = await supabase.from('auditoria_servicios').insert(nuevos.map((f) => ({
        anio, contrato: f.contrato, descripcion: f.descripcion, proveedor: f.proveedor,
        ...(f.estatusId != null ? { estatus_id: f.estatusId } : {}),
      })));
      if (error) {
        console.error('Auditoría: traer servicios del año', error);
        if (faltaMigracion(error)) return 'Para traer servicios de Estatus falta aplicar la migración 20261022020000_auditoria_servicios_del_anio.sql.';
        return error.code === '23505' ? 'Alguno de esos servicios ya estaba; recarga e intenta de nuevo.' : 'No se pudieron agregar. Intenta de nuevo.';
      }
    }
    if (actualizar.length) {
      const res = await Promise.all(actualizar.map((a) => supabase.from('auditoria_servicios').update(a.cambios).eq('id', a.id)));
      const err = res.find((r) => r.error && !faltaMigracion(r.error))?.error;
      if (err) console.error('Auditoría: actualizar desde Estatus', err);
    }
    await cargar(anio, true);
    const ganaron = actualizar.filter((a) => a.ganaContrato).length;
    setAviso({
      texto: [nuevos.length ? `${nuevos.length} servicio${nuevos.length !== 1 ? 's' : ''} agregado${nuevos.length !== 1 ? 's' : ''}` : '',
        ganaron ? `${ganaron} con contrato nuevo` : ''].filter(Boolean).join(' · ') || 'Servicios al día',
      tono: 'ok',
    });
    return null;
  };

  const importar = async (hoja: HojaLeida) => {
    const plan = planearImportacion(hoja.filas, servicios, letraActual);
    const ordenDe = new Map(hoja.filas.map((f, i) => [llaveContrato(f.contrato), i + 1]));
    const ids = new Map<string, number>(servicios.filter((x) => x.contrato).map((x) => [llaveContrato(x.contrato), x.id]));
    try {
      if (plan.nuevos.length) {
        const { data, error } = await supabase.from('auditoria_servicios').insert(plan.nuevos.map((f) => ({
          anio, contrato: f.contrato, descripcion: f.descripcion, proveedor: f.proveedor, observacion: f.observacion,
          orden: ordenDe.get(llaveContrato(f.contrato)) ?? null,
        }))).select('id,contrato');
        if (error) throw error;
        (data ?? []).forEach((s: any) => ids.set(llaveContrato(s.contrato), s.id));
      }
      if (plan.actualizados.length) {
        const res = await Promise.all(plan.actualizados.map((a) => supabase.from('auditoria_servicios').update(a.cambios).eq('id', a.id)));
        const err = res.find((r) => r.error)?.error;
        if (err) throw err;
      }
      const letras = plan.letras
        .map((l) => ({ servicio_id: l.servicioId ?? ids.get(llaveContrato(l.contrato)), mes: l.mes, estado: l.estado }))
        .filter((l) => l.servicio_id);
      for (let i = 0; i < letras.length; i += 500) {
        const { error } = await supabase.from('auditoria_marcas').upsert(letras.slice(i, i + 500), { onConflict: 'servicio_id,mes' });
        if (error) throw error;
      }
      await cargar(anio, true);
      deshacerRef.current = [];
      setAviso({ texto: `Importado: ${plan.nuevos.length} servicios nuevos, ${letras.length} letras`, tono: 'ok' });
      return null;
    } catch (e: any) {
      console.error('Auditoría: importar', e);
      await cargar(anio, true);
      return e?.code === '42501' ? 'Sólo el área de Auditoría puede importar.' : `La importación se quedó a medias (${e?.message ?? 'error'}). Lo que alcanzó a guardarse ya se ve en la tabla; vuelve a importar el archivo para completar.`;
    }
  };

  const [exportando, setExportando] = useState(false);
  const exportar = async () => {
    setExportando(true);
    try {
      const [{ generarExcelAuditoria }, { descargarArchivo }] = await Promise.all([
        import('../utils/auditoriaExcel'),
        import('../utils/reportePagos'),
      ]);
      const blob = await generarExcelAuditoria({
        anio,
        usuario: user.name,
        renglones: filas.map((f) => ({
          contrato: f.contrato ?? 'Sin contrato', descripcion: f.s.descripcion, proveedor: f.s.proveedor ?? f.fuente?.proveedor ?? null, observacion: f.s.observacion,
          letras: f.letras,
          fueraDeVigencia: f.vigencia ? new Set(Array.from({ length: 12 }, (_, i) => i + 1).filter((m) => !f.vigencia!.has(m))) : undefined,
        })),
      });
      descargarArchivo(blob, `Auditoria_${anio}.xlsx`);
    } catch (e) {
      console.error('Auditoría: exportar', e);
      setAviso({ texto: 'No se pudo generar el Excel.', tono: 'error' });
    } finally {
      setExportando(false);
    }
  };

  const alternarOrden = (por: Columna) => setOrden((o) => (o.por === por ? { por, asc: !o.asc } : { por, asc: por === 'contrato' || por === 'proveedor' || por === 'orden' }));

  // ── Vista ────────────────────────────────────────────────────────────────

  const pctRegistrado = totales.esperados ? Math.round((totales.conLetra / totales.esperados) * 100) : 0;
  const baseCompletos = totales.c.total - totales.c.N;
  const pctCompleto = baseCompletos ? Math.round((totales.c.C / baseCompletos) * 100) : 0;
  const maxConteo = 12;

  const tarjetas: { id: Filtro; titulo: string; valor: number; detalle: string; color: string }[] = [
    { id: 'C', titulo: 'Completo', valor: totales.c.C, detalle: totales.c.total ? `${Math.round((totales.c.C / totales.c.total) * 100)}% de las letras` : 'sin letras aún', color: ESTILO.C.color },
    { id: 'R', titulo: 'Revisado', valor: totales.c.R, detalle: nServicios(todas.filter((f) => f.conteo.R).length), color: ESTILO.R.color },
    { id: 'E', titulo: 'En revisión', valor: totales.c.E, detalle: nServicios(todas.filter((f) => f.conteo.E).length), color: ESTILO.E.color },
    { id: 'N', titulo: 'No aplica', valor: totales.c.N, detalle: nServicios(todas.filter((f) => f.conteo.N).length), color: ESTILO.N.color },
    { id: 'P', titulo: 'Por registrar', valor: totales.faltan, detalle: cerrado ? `meses cerrados sin letra` : 'el año aún no cierra meses', color: COLOR_PENDIENTE },
  ];

  const segmentos = [
    ...ESTADOS.map((e) => ({ id: e, n: totales.c[e], color: ESTILO[e].color, t: ESTADO_INFO[e].etiqueta })),
    { id: 'P', n: totales.faltan, color: COLOR_PENDIENTE, t: 'Por registrar' },
  ];
  const totalSegmentos = segmentos.reduce((a, s) => a + s.n, 0);

  const encabezado = (col: Columna, texto: React.ReactNode, className = '', titulo?: string) => (
    <button type="button" title={titulo} onClick={() => alternarOrden(col)} className={`group/h inline-flex items-center gap-1 uppercase tracking-wide hover:text-white ${className}`}>
      {texto}
      {orden.por === col
        ? (orden.asc ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)
        : <ArrowUpDown className="h-3 w-3 opacity-0 group-hover/h:opacity-60" />}
    </button>
  );

  const filaPopover = popover ? filas[popover.r] : undefined;
  // Año sin servicios: sólo la invitación a empezar, sin tarjetas en cero.
  const vacio = !cargando && !errorCarga && !servicios.length;

  return (
    <div className="space-y-5">
      {/* ── Encabezado ── */}
      <div className="rounded-2xl bg-gradient-to-br from-[#0D2B1E] via-[#0F4C3A] to-[#1B3A5E] px-5 sm:px-6 py-5 text-white">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15">
              <ClipboardCheck className="h-6 w-6 text-[#E2C799]" />
            </span>
            <div>
              <h1 className="text-2xl font-black leading-tight">Auditoría</h1>
              <p className="text-white/60 text-sm">Control mensual de entregables por contrato · {anio}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
          <button type="button" onClick={() => abrirAyuda()} aria-label="Ayuda: cómo se usa Auditoría" title="¿Cómo se usa? (tecla ?)"
            className="relative inline-flex h-10 items-center gap-1.5 rounded-xl bg-white/10 px-3 text-sm font-bold text-white/85 ring-1 ring-white/10 hover:bg-white/20 hover:text-white transition-colors">
            <HelpCircle className="h-5 w-5 text-[#E2C799]" />
            <span className="hidden sm:inline">Ayuda</span>
            {ayudaNueva && (
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#E2C799] opacity-75" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-[#E2C799] ring-2 ring-[#0F4C3A]" />
              </span>
            )}
          </button>
          <div className="flex items-center gap-1 rounded-xl bg-white/10 p-1 ring-1 ring-white/10" role="tablist" aria-label="Año">
            {anios.map((a) => (
              <button key={a} role="tab" aria-selected={a === anio} onClick={() => setAnio(a)}
                className={`relative rounded-lg px-3.5 py-1.5 text-sm font-bold transition-all ${a === anio ? 'bg-white text-[#0F4C3A] shadow' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}>
                {a}
                {a === anioHoy && <span className={`absolute -top-1 -right-1 h-2 w-2 rounded-full ring-2 ${a === anio ? 'bg-[#B38E5D] ring-white' : 'bg-[#E2C799] ring-[#0F4C3A]'}`} />}
              </button>
            ))}
          </div>
          </div>
        </div>

        {!faltaTabla && !cargando && servicios.length > 0 && (
          <div className="mt-5">
            <div className="flex items-end justify-between gap-3 flex-wrap mb-2">
              <p className="text-sm text-white/80">
                {cerrado === 0 ? (
                  <>El año aún no cierra ningún mes.</>
                ) : (
                  <>
                    <span className="text-2xl font-black text-white tabular-nums">{pctRegistrado}%</span>
                    <span className="ml-2">de los meses cerrados ya tienen letra</span>
                    <span className="mx-2 text-white/30">·</span>
                    <span className="font-bold text-emerald-300 tabular-nums">{pctCompleto}%</span> completos
                  </>
                )}
              </p>
              <p className="text-xs text-white/50">{servicios.length} servicios · {totales.c.total} letras capturadas</p>
            </div>
            <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-white/10">
              {totalSegmentos > 0 && segmentos.map((s) => s.n > 0 && (
                <div key={s.id} title={`${s.t}: ${s.n}`} className="h-full transition-all duration-500" style={{ width: `${(s.n / totalSegmentos) * 100}%`, background: s.color }} />
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              {segmentos.map((s) => (
                <span key={s.id} className="inline-flex items-center gap-1.5 text-[11px] text-white/70">
                  <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />{s.t} <b className="text-white tabular-nums">{s.n}</b>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {faltaTabla ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 flex gap-4">
          <Database className="h-8 w-8 text-amber-600 flex-shrink-0" />
          <div>
            <p className="font-bold text-amber-900">Falta preparar la base de datos para Auditoría</p>
            <p className="text-sm text-amber-800 mt-1">
              Hay que aplicar la migración <code className="rounded bg-amber-100 px-1">20261021000000_auditoria.sql</code>. Crea las tablas de servicios, letras y bitácora, y carga los contratos de Pagos 2026.
            </p>
          </div>
        </div>
      ) : (
        <>
          {!vacio && (
            <>
          {/* ── Tarjetas (filtran la tabla) ── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Servicios</p>
              <p className="text-3xl font-black text-slate-800 tabular-nums mt-1">{cargando ? '—' : servicios.length}</p>
              <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                {mesActual ? `${totales.porMes[mesActual - 1]?.activos ?? 0} vigentes en ${MESES[mesActual - 1]}` : `en ${anio}`}
              </p>
            </div>
            {tarjetas.map((t) => {
              const activa = filtro === t.id;
              return (
                <button key={t.id} type="button" onClick={() => setFiltro(activa ? null : t.id)} aria-pressed={activa}
                  className={`group relative overflow-hidden rounded-2xl border bg-white p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${activa ? 'border-transparent ring-2' : 'border-slate-200'}`}
                  style={activa ? { boxShadow: `0 0 0 2px ${t.color}` } : undefined}>
                  <span className="absolute inset-x-0 top-0 h-1" style={{ background: t.color }} />
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{t.titulo}</p>
                    {t.id !== 'P'
                      ? <Pill estado={t.id as Estado} />
                      : <span className="flex h-7 w-8 items-center justify-center rounded-md bg-orange-50 ring-1 ring-inset ring-orange-200"><span className="h-2 w-2 rounded-full" style={{ background: COLOR_PENDIENTE }} /></span>}
                  </div>
                  <p className="text-3xl font-black tabular-nums mt-1" style={{ color: t.id === 'P' && t.valor ? '#c2410c' : '#1e293b' }}>{cargando ? '—' : t.valor}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5 truncate">{activa ? 'Filtrando · clic para quitar' : t.detalle}</p>
                </button>
              );
            })}
          </div>

          {/* ── Barra de herramientas ── */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[220px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar contrato, descripción, proveedor…"
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F4C3A]/25 focus:border-[#0F4C3A]" />
              {busqueda && <button onClick={() => setBusqueda('')} aria-label="Limpiar búsqueda" className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100"><X className="h-3.5 w-3.5" /></button>}
            </div>
            {filtro && (
              <button onClick={() => setFiltro(null)} className="inline-flex items-center gap-1.5 rounded-full bg-slate-800 px-3 py-1.5 text-xs font-bold text-white">
                {filtro === 'P' ? 'Por registrar' : ESTADO_INFO[filtro].etiqueta} <X className="h-3 w-3" />
              </button>
            )}
            <span className="text-xs text-slate-400">{filas.length !== servicios.length ? `${filas.length} de ${servicios.length}` : ''}</span>
            {!puedeEditar && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-500" title="Para capturar, un administrador debe marcarte como parte del área de Auditoría en Accesos → Usuarios.">
                <Lock className="h-3.5 w-3.5" /> Consulta · sólo el área de Auditoría captura
              </span>
            )}

            <div className="ml-auto flex items-center gap-2 flex-wrap">
              {guardando > 0 ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Guardando…</span>
              ) : null}
              {puedeEditar && porTraer > 0 && (
                <button onClick={() => setVentana({ tipo: 'pagos' })} title={`Servicios de Estatus ${anio} y Pagos ${anio} que aún no están aquí`} className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100">
                  <RefreshCw className="h-4 w-4" /> Traer servicios del año
                  <span className="rounded-full bg-emerald-600 px-1.5 text-[11px] font-black text-white">{porTraer}</span>
                </button>
              )}
              {puedeEditar && (
                <button onClick={() => setVentana({ tipo: 'importar' })} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  <Upload className="h-4 w-4" /> Importar Excel
                </button>
              )}
              <button onClick={exportar} disabled={exportando || !filas.length} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                {exportando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Excel
              </button>
              {puedeEditar && (
                <button onClick={() => setVentana({ tipo: 'servicio', servicio: null })} className="inline-flex items-center gap-2 rounded-xl bg-[#0F4C3A] px-3.5 py-2 text-sm font-bold text-white hover:bg-[#0a3528] shadow-sm">
                  <Plus className="h-4 w-4" /> Agregar servicio
                </button>
              )}
            </div>
          </div>

          {/* ── Leyenda y atajos ── */}
          <div className="flex items-center gap-x-4 gap-y-2 flex-wrap rounded-2xl border border-slate-200 bg-white px-4 py-2.5">
            {ESTADOS.map((e) => (
              <span key={e} className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600"><Pill estado={e} />{ESTADO_INFO[e].etiqueta}</span>
            ))}
            <span className="inline-flex items-center gap-2 text-xs text-slate-500">
              <span className="h-7 w-8 rounded-md border border-slate-200" style={FUERA_VIGENCIA} /> Fuera de vigencia
            </span>
            <span className="inline-flex items-center gap-2 text-xs text-slate-500">
              <span className="flex h-7 w-8 items-center justify-center rounded-md border border-dashed border-orange-300"><span className="h-1.5 w-1.5 rounded-full bg-orange-400" /></span> Por registrar
            </span>
            <button onClick={() => abrirAyuda(puedeEditar ? 'capturar' : 'letras')} className="ml-auto inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-[#0F4C3A]">
              <HelpCircle className="h-4 w-4" /> ¿Cómo se usa?
            </button>
          </div>

            </>
          )}

          {/* ── Tabla ── */}
          {errorCarga ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 flex items-center justify-between gap-3">
              <p className="text-sm text-rose-700">{errorCarga}</p>
              <button className={botonSecundario} onClick={() => cargar(anio)}><RefreshCw className="h-4 w-4" /> Reintentar</button>
            </div>
          ) : cargando ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-12 flex items-center justify-center gap-3 text-slate-400">
              <Loader2 className="h-5 w-5 animate-spin" /> Cargando Auditoría {anio}…
            </div>
          ) : !servicios.length ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
              <ClipboardCheck className="mx-auto h-10 w-10 text-slate-300" />
              <p className="mt-3 text-lg font-bold text-slate-700">Aún no hay servicios en Auditoría {anio}</p>
              <p className="mt-1 text-sm text-slate-500 max-w-md mx-auto">
                {puedeEditar
                  ? (porTraer ? `En Estatus y Pagos de ${anio} hay ${porTraer} servicio${porTraer !== 1 ? 's' : ''}: tráelos con un clic, importa la hoja de Excel que ya llevan o agrégalos uno por uno.` : 'Importa la hoja de Excel que ya llevan o agrega los servicios uno por uno.')
                  : (porTraer ? `En Estatus y Pagos de ${anio} hay ${porTraer} servicio${porTraer !== 1 ? 's' : ''}. En cuanto el área de Auditoría los traiga, aquí aparecerá su control mensual.` : 'Cuando el área de Auditoría capture este año, aquí aparecerá su control mensual.')}
              </p>
              {puedeEditar && (
                <div className="mt-5 flex justify-center gap-2 flex-wrap">
                  {porTraer > 0 && (
                    <button className={botonPrimario} onClick={() => setVentana({ tipo: 'pagos' })}><RefreshCw className="h-4 w-4" /> Traer {porTraer} servicio{porTraer !== 1 ? 's' : ''} de {anio}</button>
                  )}
                  <button className={porTraer ? botonSecundario : botonPrimario} onClick={() => setVentana({ tipo: 'importar' })}><Upload className="h-4 w-4" /> Importar Excel</button>
                  <button className={botonSecundario} onClick={() => setVentana({ tipo: 'servicio', servicio: null })}><Plus className="h-4 w-4" /> Agregar servicio</button>
                </div>
              )}
            </div>
          ) : (
            <div className="relative rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              {/* La tabla es más ancha que muchas pantallas: sombra y flecha del lado
                  donde hay más columnas, para que no parezca cortada. */}
              {desborde.izq && (
                <button type="button" onClick={() => desplazar(-1)} aria-label="Ver columnas a la izquierda"
                  className="absolute left-[252px] top-[11px] z-40 flex h-7 w-7 items-center justify-center rounded-full bg-white text-[#1B3A5E] shadow-lg hover:bg-slate-50">
                  <ChevronLeft className="h-5 w-5" />
                </button>
              )}
              {desborde.der && (
                <>
                  <div className="pointer-events-none absolute inset-y-0 right-0 z-30 w-10 bg-gradient-to-l from-slate-900/10 to-transparent" />
                  <button type="button" onClick={() => desplazar(1)} aria-label="Ver más columnas a la derecha"
                    className="absolute right-2 top-[11px] z-40 flex items-center gap-1 rounded-full bg-white pl-3 pr-2 py-1.5 text-xs font-bold text-[#1B3A5E] shadow-lg hover:bg-slate-50">
                    Más <ChevronRight className="h-4 w-4" />
                  </button>
                </>
              )}
              <div ref={rejilla} tabIndex={0} onKeyDown={alTeclear} onCopy={alCopiar} onPaste={alPegar}
                onScroll={() => { if (popover) setPopover(null); medirDesborde(); }}
                className="overflow-auto max-h-[calc(100vh-200px)] outline-none select-none focus-visible:ring-2 focus-visible:ring-[#0F4C3A]/20"
                aria-label={`Control de Auditoría ${anio}`}>
                <table className="min-w-full border-separate border-spacing-0 text-[12.5px]">
                  <thead>
                    <tr className="text-left text-[11px] font-bold uppercase tracking-wide text-white/85">
                      <th className="sticky top-0 left-0 z-30 bg-[#1B3A5E] px-3 py-3 w-[244px] min-w-[244px] max-w-[244px] border-r border-white/10">
                        {encabezado('contrato', 'No. Contrato o Pedido')}
                      </th>
                      <th className="sticky top-0 z-20 bg-[#1B3A5E] px-3 py-3 w-[300px] min-w-[300px] max-w-[300px] border-r border-white/10">
                        <span className="flex items-center gap-1.5">
                          Descripción <span className="text-white/40">·</span> {encabezado('proveedor', 'Proveedor')}
                        </span>
                      </th>
                      {MESES_CORTOS.map((m, i) => {
                        const actual = mesActual === i + 1;
                        return (
                          <th key={m} title={MESES[i]} className={`sticky top-0 z-20 px-0 py-3 w-[40px] min-w-[40px] text-center ${actual ? 'bg-[#B38E5D] text-white' : 'bg-[#22497A]'} ${i === 11 ? 'border-r border-white/10' : ''}`}>
                            {m}
                            {actual && <span className="block text-[8px] font-black tracking-widest leading-none mt-0.5">HOY</span>}
                          </th>
                        );
                      })}
                      {ESTADOS.map((e) => (
                        <th key={e} className="sticky top-0 z-20 bg-[#1B3A5E] px-1.5 py-3 w-[58px] min-w-[58px] text-center">
                          {encabezado(e, <span className={`inline-flex h-5 w-5 items-center justify-center rounded text-[11px] font-black ring-1 ring-inset ${ESTILO[e].pill}`}>{e}</span>, 'justify-center w-full', `${ESTADO_INFO[e].etiqueta}: cuántos meses (clic para ordenar)`)}
                        </th>
                      ))}
                      <th className="sticky top-0 z-20 bg-[#1B3A5E] px-1.5 py-3 w-[62px] min-w-[62px] text-center border-r border-white/10">
                        {encabezado('total', 'Total', 'justify-center w-full', 'Meses con letra (clic para ordenar)')}
                      </th>
                      <th className="sticky top-0 z-20 bg-[#1B3A5E] px-3 py-3 min-w-[220px]">Observaciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map((f, r) => {
                      const filaElegida = rango && r >= rango.rMin && r <= rango.rMax;
                      const fondo = r % 2 ? 'bg-slate-50/60' : 'bg-white';
                      return (
                        <tr key={f.s.id} className="group">
                          <td className={`sticky left-0 z-10 w-[244px] min-w-[244px] max-w-[244px] border-b border-r border-slate-100 px-3 py-1.5 ${filaElegida ? 'bg-emerald-50' : 'bg-white'} group-hover:bg-slate-50`}>
                            {(() => {
                              // "AIFA-…-013/2026 y su Convenio No. 001/2026": el número en
                              // un renglón y el convenio abajo, sin partir el número.
                              const c = f.contrato ?? '';
                              const i = c.indexOf(' ');
                              const numero = i > 0 ? c.slice(0, i) : c;
                              const resto = i > 0 ? c.slice(i + 1) : '';
                              return (
                                <div className="relative pr-6" title={f.contrato ?? f.s.descripcion ?? ''}>
                                  {f.contrato ? (
                                    <>
                                      <span className="block font-bold text-slate-800 whitespace-nowrap">{numero}</span>
                                      {resto && <span className="block text-[11px] font-semibold leading-tight text-slate-500">{resto}</span>}
                                      {!f.s.contrato && <span className="block text-[10px] font-semibold text-violet-600">tomado de Estatus</span>}
                                    </>
                                  ) : (
                                    <span className="flex items-center gap-1.5 flex-wrap">
                                      <span className="font-semibold italic text-slate-400">Sin contrato</span>
                                      <FaseChip fase={f.fuente?.fase ?? null} />
                                    </span>
                                  )}
                                  {puedeEditar && (
                                    <button onClick={() => setVentana({ tipo: 'servicio', servicio: f.s })} aria-label={`Editar ${nombreServicio(f.s)}`}
                                      className="absolute right-0 top-0 h-6 w-6 flex items-center justify-center rounded-md text-slate-400 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-slate-200 hover:text-slate-700 transition-opacity">
                                      <Pencil className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                </div>
                              );
                            })()}
                            {f.faltan.length > 0 && (
                              <span className="text-[10px] font-semibold text-orange-600">{f.faltan.length} mes{f.faltan.length !== 1 ? 'es' : ''} por registrar</span>
                            )}
                          </td>
                          <td className={`w-[300px] min-w-[300px] max-w-[300px] border-b border-r border-slate-100 px-3 py-2 align-top ${fondo} group-hover:bg-slate-50`}>
                            {/* Completos, sin "…": la descripción en hasta 3 renglones y el
                                proveedor abajo. Lo que pase de eso, en el título al pasar el cursor. */}
                            <p className="line-clamp-3 leading-snug text-slate-700 break-words" title={f.s.descripcion ?? ''}>
                              {f.s.descripcion ?? <span className="text-slate-300">Sin descripción</span>}
                            </p>
                            {(f.s.proveedor ?? f.fuente?.proveedor) && (
                              <p className="mt-0.5 line-clamp-2 text-[11.5px] font-semibold leading-snug text-[#1B3A5E]/70 break-words" title={f.s.proveedor ?? f.fuente?.proveedor ?? ''}>
                                {f.s.proveedor ?? f.fuente?.proveedor}
                              </p>
                            )}
                          </td>
                          {Array.from({ length: 12 }, (_, i) => {
                            const m = i + 1;
                            const l = f.letras[m];
                            const fuera = f.vigencia && !f.vigencia.has(m);
                            const pendiente = !l && f.faltan.includes(m);
                            const elegida = rango && filaElegida && m >= rango.mMin && m <= rango.mMax;
                            const foco = sel && sel.r1 === r && sel.m1 === m;
                            const marca = marcas[clave(f.s.id, m)];
                            return (
                              <td key={m} data-celda={`${r}-${m}`}
                                onMouseDown={(e) => alPresionarCelda(e, r, m)}
                                onMouseEnter={() => alEntrarCelda(r, m)}
                                title={l ? `${ESTADO_INFO[l].etiqueta}${marca?.actualizado_nombre ? ` · ${marca.actualizado_nombre}` : ''}${marca ? ` · ${fechaCorta(marca.updated_at)}` : ''}` : fuera ? 'Fuera de vigencia' : pendiente ? 'Por registrar' : MESES[i]}
                                className={`relative border-b border-slate-100 p-0.5 text-center cursor-pointer ${i === 11 ? 'border-r' : ''} ${elegida ? 'bg-emerald-100/70' : mesActual === m ? 'bg-amber-50/70' : fondo} ${!elegida ? 'hover:bg-slate-100' : ''}`}
                                style={fuera && !elegida ? FUERA_VIGENCIA : undefined}>
                                <div className={`mx-auto flex h-7 w-8 items-center justify-center rounded-md ${foco ? 'ring-2 ring-[#1B3A5E] ring-offset-1' : ''}`}>
                                  {l ? <Pill estado={l} />
                                    : pendiente ? <span className={`flex h-7 w-8 items-center justify-center rounded-md ${filtro === 'P' ? 'border border-dashed border-orange-300 bg-orange-50' : ''}`}><span className="h-1.5 w-1.5 rounded-full bg-orange-300" /></span>
                                      : null}
                                </div>
                              </td>
                            );
                          })}
                          {ESTADOS.map((e) => (
                            <td key={e} className={`border-b border-slate-100 px-1.5 py-1 ${fondo} group-hover:bg-slate-50`}>
                              <Barra n={f.conteo[e]} max={maxConteo} color={ESTILO[e].color} claro={ESTILO[e].claro} />
                            </td>
                          ))}
                          <td className={`border-b border-r border-slate-100 px-1.5 py-1 ${fondo} group-hover:bg-slate-50`}>
                            <Barra n={f.conteo.total} max={maxConteo} color="#3b82f6" claro="#bfdbfe" fuerte />
                          </td>
                          <td className={`border-b border-slate-100 px-3 py-1 ${fondo} group-hover:bg-slate-50`}>
                            {editandoObs?.id === f.s.id ? (
                              <input autoFocus value={editandoObs.valor} maxLength={500}
                                onChange={(e) => setEditandoObs({ id: f.s.id, valor: e.target.value })}
                                onBlur={guardarObservacion}
                                onKeyDown={(e) => { if (e.key === 'Enter') guardarObservacion(); if (e.key === 'Escape') setEditandoObs(null); }}
                                className="w-full rounded-lg border border-[#0F4C3A] px-2 py-1 text-[12.5px] focus:outline-none focus:ring-2 focus:ring-[#0F4C3A]/20" />
                            ) : (
                              <button type="button" disabled={!puedeEditar}
                                onClick={() => setEditandoObs({ id: f.s.id, valor: f.s.observacion ?? '' })}
                                className={`block w-full max-w-[300px] line-clamp-2 break-words rounded-lg px-2 py-1 text-left leading-snug ${puedeEditar ? 'hover:bg-white hover:ring-1 hover:ring-slate-200' : 'cursor-default'} ${f.s.observacion ? 'text-slate-700' : 'text-slate-300 italic'}`}
                                title={f.s.observacion ?? (puedeEditar ? 'Agregar observación' : '')}>
                                {f.s.observacion ?? (puedeEditar ? 'Agregar…' : '')}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {!filas.length && (
                      <tr><td colSpan={21} className="px-6 py-10 text-center text-sm text-slate-400">Ningún servicio coincide con la búsqueda o el filtro.</td></tr>
                    )}
                  </tbody>
                  {filas.length > 0 && (
                    <tfoot>
                      <tr className="text-[11px]">
                        <td className="sticky bottom-0 left-0 z-20 bg-slate-100 border-t-2 border-slate-200 border-r px-3 py-2 font-black uppercase tracking-wide text-slate-600">
                          Completos por mes
                        </td>
                        <td className="sticky bottom-0 z-10 bg-slate-100 border-t-2 border-r border-slate-200 px-3 py-2 text-slate-400">
                          {filas.length} servicio{filas.length !== 1 ? 's' : ''}{filas.length !== servicios.length ? ' (filtrados)' : ''}
                        </td>
                        {totales.porMes.map(({ m, conteo }) => {
                          const conLetra = conteo.total;
                          return (
                            <td key={m} className={`sticky bottom-0 z-10 bg-slate-100 border-t-2 border-slate-200 px-1 py-1.5 text-center ${m === 12 ? 'border-r' : ''}`}
                              title={`${MESES[m - 1]}: ${ESTADOS.map((e) => `${conteo[e]} ${ESTADO_INFO[e].etiqueta.toLowerCase()}`).join(', ')}`}>
                              <p className={`font-black tabular-nums ${conteo.C ? 'text-emerald-700' : 'text-slate-300'}`}>{conteo.C}</p>
                              <div className="mx-auto mt-1 flex h-1.5 w-8 overflow-hidden rounded-full bg-slate-200">
                                {conLetra > 0 && ESTADOS.map((e) => conteo[e] > 0 && (
                                  <div key={e} style={{ width: `${(conteo[e] / filas.length) * 100}%`, background: ESTILO[e].color }} />
                                ))}
                              </div>
                            </td>
                          );
                        })}
                        {ESTADOS.map((e) => (
                          <td key={e} className="sticky bottom-0 z-10 bg-slate-100 border-t-2 border-slate-200 px-2 py-2 text-center font-black tabular-nums" style={{ color: ESTILO[e].color }}>
                            {filas.reduce((a, f) => a + f.conteo[e], 0)}
                          </td>
                        ))}
                        <td className="sticky bottom-0 z-10 bg-slate-100 border-t-2 border-r border-slate-200 px-2 py-2 text-center font-black tabular-nums text-slate-700">
                          {filas.reduce((a, f) => a + f.conteo.total, 0)}
                        </td>
                        <td className="sticky bottom-0 z-10 bg-slate-100 border-t-2 border-slate-200" />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Ventanita de la celda ── */}
      {popover && filaPopover && (
        <PopoverCelda
          key={`${popover.r}-${popover.m}`}
          rect={popover.rect}
          fila={filaPopover}
          mes={popover.m}
          anio={anio}
          marca={marcas[clave(filaPopover.s.id, popover.m)]}
          puedeEditar={puedeEditar}
          onElegir={(estado) => {
            guardar([{ servicioId: filaPopover.s.id, mes: popover.m, estado }]);
            setPopover(null);
            rejilla.current?.focus({ preventScroll: true });
          }}
          onCerrar={() => setPopover(null)}
        />
      )}

      {/* ── Ventanas ── */}
      {ayuda && <VentanaAyuda inicial={ayuda} puedeEditar={puedeEditar} onCerrar={() => setAyuda(null)} />}
      {ventana?.tipo === 'servicio' && (
        <VentanaServicio
          anio={anio}
          inicial={ventana.servicio}
          sugerencias={sugerenciasContrato}
          existentes={servicios}
          marcasDelServicio={ventana.servicio ? Object.keys(marcas).filter((k) => k.startsWith(`${ventana.servicio!.id}-`)).length : 0}
          puedeBorrar={puedeEditar}
          onGuardar={(d) => guardarServicio(ventana.servicio, d)}
          onBorrar={() => (ventana.servicio ? borrarServicio(ventana.servicio) : Promise.resolve(null))}
          onCerrar={() => setVentana(null)}
        />
      )}
      {ventana?.tipo === 'pagos' && (
        <VentanaTraer anio={anio} pendientes={pendientes} servicios={servicios} onTraer={traerDelAnio} onCerrar={() => setVentana(null)} />
      )}
      {ventana?.tipo === 'importar' && (
        <VentanaImportar
          anio={anio}
          anios={anios}
          cargando={cargando}
          existentes={servicios}
          letraActual={letraActual}
          onCambiarAnio={setAnio}
          onImportar={importar}
          onCerrar={() => setVentana(null)}
        />
      )}

      {/* ── Varias celdas elegidas: flota abajo para no mover la tabla mientras se arrastra ── */}
      {puedeEditar && celdasElegidas > 1 && createPortal(
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9995] w-[calc(100%-2rem)] max-w-max" onMouseDown={(e) => e.preventDefault()}>
          <div className="flex items-center gap-2 flex-wrap rounded-2xl bg-[#1B3A5E] px-4 py-2.5 text-white shadow-2xl shadow-slate-900/30 ring-1 ring-white/10">
            <span className="text-sm font-bold tabular-nums">{celdasElegidas} celdas</span>
            <span className="text-white/40 text-xs">Llenar con:</span>
            {ESTADOS.map((e) => (
              <button key={e} onClick={() => ponerLetra(e)} className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-2 py-1 hover:bg-white/20">
                <Pill estado={e} /><span className="text-xs font-semibold hidden sm:inline">{ESTADO_INFO[e].etiqueta}</span>
              </button>
            ))}
            <button onClick={() => ponerLetra(null)} className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1.5 text-xs font-semibold hover:bg-rose-500/40">
              <Trash2 className="h-3.5 w-3.5" /> Borrar
            </button>
            <button onClick={() => setSel(null)} className="h-7 w-7 flex items-center justify-center rounded-full hover:bg-white/10" aria-label="Quitar selección"><X className="h-4 w-4" /></button>
          </div>
        </div>,
        document.body,
      )}

      {/* ── Aviso ── */}
      {aviso && createPortal(
        <div className={`fixed left-1/2 -translate-x-1/2 z-[9998] transition-all ${puedeEditar && celdasElegidas > 1 ? 'bottom-24' : 'bottom-6'}`} role="status">
          <div className={`flex items-center gap-3 rounded-full px-4 py-2.5 text-sm font-semibold shadow-2xl ${aviso.tono === 'error' ? 'bg-rose-600 text-white' : 'bg-slate-900 text-white'}`}>
            {aviso.tono === 'error' ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
            {aviso.texto}
            {aviso.deshacer && (
              <button onClick={() => { setAviso(null); deshacer(); }} className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-xs font-bold hover:bg-white/20">
                <Undo2 className="h-3.5 w-3.5" /> Deshacer
              </button>
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
};

export default Auditoria;
