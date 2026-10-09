import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight, CheckCircle2, Clock, AlertTriangle, ShieldAlert, FileText, StickyNote, X, Loader2, Search,
  CalendarClock, Play, Ban, Undo2, Lock, ClipboardEdit, Inbox, Hourglass,
} from 'lucide-react';
import {
  FASES, INDICE_ADJUDICADO, INDICE_CANCELADO, ESTATUS_CANCELADO, planAvanzar, valoresPrevios, aISO, deISO,
  type EstadoServicio, type Alerta,
} from '../utils/avanceFase';
import { claveContrato } from '../utils/fichaServicio';

// "Mis servicios": la bandeja de cada responsable. En vez de buscar celdas en
// una tabla de 65 columnas, cada servicio dice en qué fase va, qué pide
// atención y ofrece la acción que toca: avanzar de fase o completar los datos
// del contrato. Lo que se guarda va a las mismas columnas de siempre, así que
// gráficas, resúmenes y Gantt se actualizan solos.

export interface ColumnasContrato {
  contrato: string | null;
  proveedor: string | null;
  administrador: string | null;
  monto: string | null;
  vigenciaInicio: string | null;
  vigenciaTermino: string | null;
  firma: string | null;
  garantias: { col: string; etiqueta: string }[];
}

export interface ItemBandeja {
  key: string;
  row: Record<string, any>;
  nombre: string;
  gerencia?: string;
  responsable?: string;
  estatus: string;
  color: string;
  estado: EstadoServicio;
  puedeEditar: boolean;
  notas: number;
}

interface Props {
  anio: number;
  items: ItemBandeja[];
  columnaEstatus: string;
  columnas: ColumnasContrato;
  sugerencias: { proveedores: string[]; administradores: string[] };
  /** Para quien no tiene responsable: elegir de quién ver la bandeja. */
  responsables?: string[];
  filtroResponsable?: string;
  onFiltroResponsable?: (r: string) => void;
  /** Guarda celdas del servicio. Devuelve un mensaje si falló. */
  onAplicar: (row: Record<string, any>, cambios: Record<string, any>, descripcion: string) => Promise<string | null>;
  onNota: (row: Record<string, any>, nombre: string, nota: { texto: string; tipo: 'nota' | 'alerta' | 'acuerdo'; fecha: string }) => Promise<string | null>;
  onAbrirFicha: (row: Record<string, any>, nombre: string) => void;
  onAbrirNotas: (row: Record<string, any>, nombre: string) => void;
}

const CORTO = [
  'Anexo técnico', 'En IM', 'Recepción de IM', 'Validación de IM', 'Envío a RM',
  'Revisión DEFENSA', 'Observaciones DEFENSA', 'Doc. para publicación', 'Publicado',
];

const fmt = (d: Date | null) =>
  d ? d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }).replace('.', '') : '—';

const hoyISO = () => aISO(new Date());

/** Lo que pide atención, en palabras y con su color. */
const textoAlerta = (a: Alerta): { texto: string; cls: string; icono: React.ElementType } => {
  switch (a.tipo) {
    case 'fase-larga': return { texto: `Lleva ${a.dias} días en esta fase (lo normal: ${a.tipica})`, cls: 'bg-amber-50 text-amber-800 border-amber-200', icono: Hourglass };
    case 'sin-movimiento': return { texto: `Sin cambios hace ${a.dias} días`, cls: 'bg-slate-100 text-slate-600 border-slate-200', icono: Clock };
    case 'vence': return { texto: a.dias === 0 ? 'La vigencia vence hoy' : `Vence en ${a.dias} día${a.dias !== 1 ? 's' : ''}`, cls: 'bg-amber-50 text-amber-800 border-amber-200', icono: CalendarClock };
    case 'vencido': return { texto: `Vigencia vencida hace ${a.dias} día${a.dias !== 1 ? 's' : ''}`, cls: 'bg-rose-50 text-rose-700 border-rose-200', icono: CalendarClock };
    case 'garantias': return { texto: `Falta${a.faltan !== 1 ? 'n' : ''} ${a.faltan} garantía${a.faltan !== 1 ? 's' : ''}`, cls: 'bg-amber-50 text-amber-800 border-amber-200', icono: ShieldAlert };
    case 'datos-contrato': return { texto: `Faltan datos: ${a.faltan.join(', ')}`, cls: 'bg-sky-50 text-sky-800 border-sky-200', icono: ClipboardEdit };
    case 'sin-iniciar': return { texto: 'Proceso sin iniciar', cls: 'bg-slate-100 text-slate-600 border-slate-200', icono: Play };
  }
};

/** Las nueve fases como puntos: hechas, la actual y las que faltan. */
const Pasos: React.FC<{ indice: number }> = ({ indice }) => (
  <div className="flex items-center gap-1" aria-hidden="true">
    {FASES.map((f, i) => {
      const hecha = indice > i || indice === INDICE_ADJUDICADO;
      const actual = indice === i;
      return (
        <span
          key={f.estatus}
          title={f.estatus}
          className={`h-1.5 flex-1 rounded-full transition-colors ${
            indice === INDICE_CANCELADO ? 'bg-slate-200'
              : hecha ? 'bg-[#0F4C3A]'
                : actual ? 'bg-[#B38E5D]'
                  : 'bg-slate-200'
          }`}
        />
      );
    })}
  </div>
);

const etiquetaEtapa = (e: EstadoServicio) => {
  if (e.indice < 0) return 'Sin iniciar';
  if (e.indice === INDICE_ADJUDICADO) return 'Adjudicado';
  if (e.indice === INDICE_CANCELADO) return 'Cancelado';
  return `Fase ${e.indice + 1} de 9${e.diasEnFase !== null ? ` · lleva ${e.diasEnFase} día${e.diasEnFase !== 1 ? 's' : ''}` : ''}`;
};

// ── Ventana base ────────────────────────────────────────────────────────────

const Ventana: React.FC<{ titulo: string; subtitulo?: string; onCerrar: () => void; children: React.ReactNode; ancho?: string }> = ({
  titulo, subtitulo, onCerrar, children, ancho = 'max-w-lg',
}) => {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onCerrar]);
  return (
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
    </div>
  );
};

const etiqueta = 'block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5';
const campo = 'w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#0F4C3A]/25 focus:border-[#0F4C3A]';

// ── Avanzar fase ────────────────────────────────────────────────────────────

const AvanzarFase: React.FC<{
  item: ItemBandeja;
  columnaEstatus: string;
  onCerrar: () => void;
  onListo: (previos: Record<string, any>, descripcion: string, pideAdjudicacion: boolean) => void;
  onAplicar: Props['onAplicar'];
  onNota: Props['onNota'];
}> = ({ item, columnaEstatus, onCerrar, onListo, onAplicar, onNota }) => {
  const { indice } = item.estado;
  const actual = indice >= 0 ? FASES[indice] : null;
  const faltaInicio = !!actual && !deISO(item.row[actual.inicio]);
  const [fecha, setFecha] = useState(hoyISO());
  const [inicio, setInicio] = useState('');
  const [nota, setNota] = useState('');
  const [cancelando, setCancelando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const siguienteCorto = indice < 0 ? CORTO[0] : indice === FASES.length - 1 ? 'Adjudicado' : CORTO[indice + 1];
  const preguntaFecha = indice < 0
    ? '¿Cuándo empezó la elaboración del anexo técnico?'
    : indice === FASES.length - 1 ? '¿Cuándo fue el fallo?' : `¿Cuándo terminó "${CORTO[indice]}"?`;

  const avanzar = async (e: React.FormEvent) => {
    e.preventDefault();
    const f = deISO(fecha);
    if (!f) { setError('Elige la fecha.'); return; }
    const r = planAvanzar(item.row, columnaEstatus, f, new Date(), faltaInicio ? deISO(inicio) : null);
    if (!r.ok) { setError(r.error); return; }
    setGuardando(true);
    setError(null);
    const descripcion = indice < 0 ? `Inició "${CORTO[0]}"` : `Pasó a "${siguienteCorto}"`;
    const previos = valoresPrevios(item.row, r.plan.cambios);
    const err = await onAplicar(item.row, r.plan.cambios, descripcion);
    if (err) { setError(err); setGuardando(false); return; }
    if (nota.trim()) {
      const errNota = await onNota(item.row, item.nombre, { texto: nota.trim(), tipo: 'nota', fecha });
      if (errNota) console.warn('La fase avanzó, pero la nota no se guardó:', errNota);
    }
    onListo(previos, descripcion, r.plan.pideAdjudicacion);
  };

  const cancelar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (motivo.trim().length < 5) { setError('Escribe el motivo de la cancelación.'); return; }
    setGuardando(true);
    setError(null);
    const cambios = { [columnaEstatus]: ESTATUS_CANCELADO };
    const previos = valoresPrevios(item.row, cambios);
    const err = await onAplicar(item.row, cambios, 'Cancelado');
    if (err) { setError(err); setGuardando(false); return; }
    await onNota(item.row, item.nombre, { texto: `Cancelado: ${motivo.trim()}`, tipo: 'alerta', fecha: hoyISO() });
    onListo(previos, 'Cancelado', false);
  };

  return (
    <Ventana titulo={cancelando ? 'Cancelar el servicio' : indice < 0 ? 'Iniciar el proceso' : 'Avanzar de fase'} subtitulo={item.nombre} onCerrar={onCerrar}>
      {!cancelando ? (
        <form onSubmit={avanzar} noValidate className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center px-3 py-1.5 rounded-xl bg-slate-100 text-slate-600 text-xs font-bold">
              {indice < 0 ? 'Sin iniciar' : CORTO[indice]}
            </span>
            <ArrowRight className="h-4 w-4 text-slate-400" />
            <span className="inline-flex items-center px-3 py-1.5 rounded-xl bg-emerald-50 text-[#0F4C3A] border border-emerald-200 text-xs font-bold">
              {siguienteCorto}
            </span>
          </div>

          <div>
            <label htmlFor="avance-fecha" className={etiqueta}>{preguntaFecha}</label>
            <input id="avance-fecha" type="date" value={fecha} max={hoyISO()} onChange={(e) => { setFecha(e.target.value); setError(null); }} className={campo} />
          </div>

          {faltaInicio && (
            <div>
              <label htmlFor="avance-inicio" className={etiqueta}>¿Y cuándo empezó? <span className="normal-case font-semibold text-amber-600">No está capturado</span></label>
              <input id="avance-inicio" type="date" value={inicio} max={fecha || hoyISO()} onChange={(e) => setInicio(e.target.value)} className={campo} />
              <p className="text-[11px] text-slate-400 mt-1">Opcional, pero sin él el Gantt dibuja la fase sin principio.</p>
            </div>
          )}

          <div>
            <label htmlFor="avance-nota" className={etiqueta}>Nota (opcional)</label>
            <textarea id="avance-nota" rows={2} value={nota} maxLength={1000} onChange={(e) => setNota(e.target.value)} placeholder="Aparece como marcador en el Gantt, en la fecha de arriba." className={`${campo} resize-y placeholder:text-slate-300`} />
          </div>

          <p className="text-[11px] text-slate-400 leading-snug">
            Se guarda {indice < 0 ? 'el inicio de la primera fase' : 'el término de esta fase, el inicio de la siguiente'} y el estatus. Lo podrás deshacer.
          </p>

          {error && <p role="alert" className="text-sm font-medium text-red-600">{error}</p>}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            {indice >= 0 ? (
              <button type="button" onClick={() => { setCancelando(true); setError(null); }} className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-red-600">
                <Ban className="h-3.5 w-3.5" /> Cancelar el servicio…
              </button>
            ) : <span />}
            <div className="flex items-center gap-2">
              <button type="button" onClick={onCerrar} className="px-3 py-2.5 text-sm font-semibold text-slate-500 hover:text-slate-700">Cancelar</button>
              <button type="submit" disabled={guardando} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0F4C3A] text-white text-sm font-bold hover:bg-[#0d3f30] disabled:opacity-60 shadow-md shadow-[#0F4C3A]/20">
                {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {indice < 0 ? 'Iniciar proceso' : `Avanzar a ${siguienteCorto}`}
              </button>
            </div>
          </div>
        </form>
      ) : (
        <form onSubmit={cancelar} noValidate className="space-y-4">
          <p className="text-sm text-slate-600">El servicio quedará como <b>Cancelado</b> y el motivo se guarda como alerta en sus notas.</p>
          <div>
            <label htmlFor="cancelar-motivo" className={etiqueta}>Motivo</label>
            <textarea id="cancelar-motivo" rows={3} value={motivo} onChange={(e) => { setMotivo(e.target.value); setError(null); }} className={`${campo} resize-y`} placeholder="Ej. El área retiró la necesidad del servicio." />
          </div>
          {error && <p role="alert" className="text-sm font-medium text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setCancelando(false)} className="px-3 py-2.5 text-sm font-semibold text-slate-500 hover:text-slate-700">Volver</button>
            <button type="submit" disabled={guardando} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-700 disabled:opacity-60">
              {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
              Sí, cancelar el servicio
            </button>
          </div>
        </form>
      )}
    </Ventana>
  );
};

// ── Datos del contrato ──────────────────────────────────────────────────────

const numeroDe = (v: unknown): string => {
  const n = Number(String(v ?? '').replace(/[$,\s]/g, ''));
  return Number.isFinite(n) && n > 0 ? String(n) : '';
};

/** Qué datos del contrato le faltan a un servicio adjudicado. */
export const datosFaltantes = (row: Record<string, any>, c: ColumnasContrato): string[] => {
  const vacio = (col: string | null) => !col || !String(row[col] ?? '').trim() || /^n\/?a$/i.test(String(row[col]).trim());
  const f: string[] = [];
  if (vacio(c.contrato)) f.push('número de contrato');
  if (vacio(c.proveedor)) f.push('proveedor');
  if (vacio(c.administrador)) f.push('administrador');
  if (vacio(c.vigenciaInicio) || vacio(c.vigenciaTermino)) f.push('vigencia');
  if (c.monto && !numeroDe(row[c.monto])) f.push('monto máximo');
  return f;
};

const DatosContrato: React.FC<{
  item: ItemBandeja;
  columnas: ColumnasContrato;
  sugerencias: Props['sugerencias'];
  anio: number;
  onCerrar: () => void;
  onListo: (previos: Record<string, any>) => void;
  onAplicar: Props['onAplicar'];
}> = ({ item, columnas: c, sugerencias, anio, onCerrar, onListo, onAplicar }) => {
  const r = item.row;
  const txt = (col: string | null) => (col ? String(r[col] ?? '').trim().replace(/^n\/?a$/i, '') : '');
  const fechaDe = (col: string | null) => (col && deISO(r[col]) ? String(r[col]).slice(0, 10) : '');
  const [contrato, setContrato] = useState(txt(c.contrato));
  const [proveedor, setProveedor] = useState(txt(c.proveedor));
  const [administrador, setAdministrador] = useState(txt(c.administrador));
  const [monto, setMonto] = useState(c.monto ? numeroDe(r[c.monto]) : '');
  const [vInicio, setVInicio] = useState(fechaDe(c.vigenciaInicio));
  const [vFin, setVFin] = useState(fechaDe(c.vigenciaTermino));
  const [firma, setFirma] = useState(fechaDe(c.firma));
  const [garantias, setGarantias] = useState<Record<string, boolean>>(
    Object.fromEntries(c.garantias.map((g) => [g.col, r[g.col] === true])),
  );
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const contratoRaro = contrato.trim() !== '' && !claveContrato(contrato);

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (vInicio && vFin && vFin < vInicio) { setError('El término de la vigencia no puede ser antes del inicio.'); return; }
    if (firma && firma > hoyISO()) { setError('La firma del contrato no puede tener fecha futura.'); return; }
    if (monto && !numeroDe(monto)) { setError('Escribe el monto máximo sólo con números.'); return; }
    const nuevos: Record<string, any> = {};
    const poner = (col: string | null, valor: any, anterior: any) => {
      if (!col) return;
      const v = valor === '' ? null : valor;
      const a = anterior === '' ? null : anterior;
      if (v !== a) nuevos[col] = v;
    };
    poner(c.contrato, contrato.trim(), txt(c.contrato));
    poner(c.proveedor, proveedor.trim(), txt(c.proveedor));
    poner(c.administrador, administrador.trim(), txt(c.administrador));
    if (c.monto) poner(c.monto, numeroDe(monto), numeroDe(r[c.monto]));
    poner(c.vigenciaInicio, vInicio, fechaDe(c.vigenciaInicio));
    poner(c.vigenciaTermino, vFin, fechaDe(c.vigenciaTermino));
    poner(c.firma, firma, fechaDe(c.firma));
    c.garantias.forEach((g) => { if ((r[g.col] === true) !== garantias[g.col]) nuevos[g.col] = garantias[g.col]; });
    if (!Object.keys(nuevos).length) { onCerrar(); return; }

    setGuardando(true);
    setError(null);
    const previos = valoresPrevios(r, nuevos);
    const err = await onAplicar(r, nuevos, 'Datos del contrato');
    if (err) { setError(err); setGuardando(false); return; }
    onListo(previos);
  };

  return (
    <Ventana titulo="Datos del contrato" subtitulo={item.nombre} onCerrar={onCerrar} ancho="max-w-2xl">
      <form onSubmit={guardar} noValidate className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {c.contrato && (
            <div className="sm:col-span-2">
              <label htmlFor="dc-contrato" className={etiqueta}>Número de contrato</label>
              <input id="dc-contrato" value={contrato} onChange={(e) => setContrato(e.target.value)} placeholder="AIFA-C-LPN-DO-SVS-015/2026" className={`${campo} font-mono`} />
              {contratoRaro && <p className="text-[11px] text-amber-600 mt-1">No parece un número de contrato AIFA (por ejemplo AIFA-C-LPN-DO-SVS-015/2026). Revísalo: así se liga con sus pagos.</p>}
            </div>
          )}
          {c.proveedor && (
            <div className="sm:col-span-2">
              <label htmlFor="dc-proveedor" className={etiqueta}>Proveedor</label>
              <input id="dc-proveedor" list="dc-proveedores" value={proveedor} onChange={(e) => setProveedor(e.target.value)} placeholder="Razón social" className={campo} />
              <datalist id="dc-proveedores">{sugerencias.proveedores.map((p) => <option key={p} value={p} />)}</datalist>
            </div>
          )}
          {c.monto && (
            <div>
              <label htmlFor="dc-monto" className={etiqueta}>Monto máximo {anio}</label>
              <input id="dc-monto" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="19209600" className={`${campo} tabular-nums`} />
              {numeroDe(monto) && <p className="text-[11px] text-slate-400 mt-1">{Number(numeroDe(monto)).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}</p>}
            </div>
          )}
          {c.administrador && (
            <div>
              <label htmlFor="dc-admin" className={etiqueta}>Administrador del contrato</label>
              <input id="dc-admin" list="dc-administradores" value={administrador} onChange={(e) => setAdministrador(e.target.value)} placeholder="Nombre completo" className={campo} />
              <datalist id="dc-administradores">{sugerencias.administradores.map((p) => <option key={p} value={p} />)}</datalist>
            </div>
          )}
          {c.vigenciaInicio && (
            <div>
              <label htmlFor="dc-vinicio" className={etiqueta}>Vigencia: inicio</label>
              <input id="dc-vinicio" type="date" value={vInicio} onChange={(e) => setVInicio(e.target.value)} className={campo} />
            </div>
          )}
          {c.vigenciaTermino && (
            <div>
              <label htmlFor="dc-vfin" className={etiqueta}>Vigencia: término</label>
              <input id="dc-vfin" type="date" value={vFin} min={vInicio || undefined} onChange={(e) => setVFin(e.target.value)} className={campo} />
            </div>
          )}
          {c.firma && (
            <div>
              <label htmlFor="dc-firma" className={etiqueta}>Firma del contrato</label>
              <input id="dc-firma" type="date" value={firma} max={hoyISO()} onChange={(e) => setFirma(e.target.value)} className={campo} />
            </div>
          )}
        </div>

        {c.garantias.length > 0 && (
          <fieldset>
            <legend className={etiqueta}>Requisitos para liberar pago</legend>
            <div className="flex flex-wrap gap-2">
              {c.garantias.map((g) => (
                <label key={g.col} className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-semibold cursor-pointer transition-colors ${garantias[g.col] ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'bg-white border-slate-200 text-slate-600'}`}>
                  <input type="checkbox" checked={!!garantias[g.col]} onChange={(e) => setGarantias((p) => ({ ...p, [g.col]: e.target.checked }))} className="accent-[#0F4C3A] h-4 w-4" />
                  {g.etiqueta}
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {error && <p role="alert" className="text-sm font-medium text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onCerrar} className="px-3 py-2.5 text-sm font-semibold text-slate-500 hover:text-slate-700">Cancelar</button>
          <button type="submit" disabled={guardando} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0F4C3A] text-white text-sm font-bold hover:bg-[#0d3f30] disabled:opacity-60 shadow-md shadow-[#0F4C3A]/20">
            {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Guardar datos del contrato
          </button>
        </div>
      </form>
    </Ventana>
  );
};

// ── Bandeja ─────────────────────────────────────────────────────────────────

type Filtro = 'atencion' | 'proceso' | 'adjudicados' | 'todos';

const MisServicios: React.FC<Props> = ({
  anio, items, columnaEstatus, columnas, sugerencias, responsables, filtroResponsable, onFiltroResponsable,
  onAplicar, onNota, onAbrirFicha, onAbrirNotas,
}) => {
  const [filtro, setFiltro] = useState<Filtro>('atencion');
  const [busqueda, setBusqueda] = useState('');
  const [avanzando, setAvanzando] = useState<string | null>(null);
  const [contratoDe, setContratoDe] = useState<string | null>(null);
  const [ultimo, setUltimo] = useState<{ key: string; nombre: string; previos: Record<string, any>; descripcion: string } | null>(null);
  const [deshaciendo, setDeshaciendo] = useState(false);
  const [avisoError, setAvisoError] = useState<string | null>(null);

  // El aviso de "Deshacer" dura 20 segundos.
  useEffect(() => {
    if (!ultimo) return;
    const t = window.setTimeout(() => setUltimo(null), 20_000);
    return () => window.clearTimeout(t);
  }, [ultimo]);

  const cuenta = useMemo(() => ({
    atencion: items.filter((i) => i.estado.alertas.length > 0 && i.estado.indice !== INDICE_CANCELADO).length,
    proceso: items.filter((i) => i.estado.indice < INDICE_ADJUDICADO).length,
    adjudicados: items.filter((i) => i.estado.indice === INDICE_ADJUDICADO).length,
    todos: items.length,
  }), [items]);

  // Si no hay nada que atender, se abre en "Todos" en lugar de una lista vacía.
  useEffect(() => {
    if (filtro === 'atencion' && cuenta.atencion === 0 && items.length > 0) setFiltro('todos');
  }, [cuenta.atencion, filtro, items.length]);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return items
      .filter((i) => {
        if (filtro === 'atencion') return i.estado.alertas.length > 0 && i.estado.indice !== INDICE_CANCELADO;
        if (filtro === 'proceso') return i.estado.indice < INDICE_ADJUDICADO;
        if (filtro === 'adjudicados') return i.estado.indice === INDICE_ADJUDICADO;
        return true;
      })
      .filter((i) => !q || [i.nombre, i.gerencia, i.estatus, i.responsable].some((v) => String(v ?? '').toLowerCase().includes(q)))
      .sort((a, b) => b.estado.puntaje - a.estado.puntaje || a.nombre.localeCompare(b.nombre, 'es'));
  }, [items, filtro, busqueda]);

  const porKey = (k: string | null) => (k ? items.find((i) => i.key === k) ?? null : null);
  const itemAvance = porKey(avanzando);
  const itemContrato = porKey(contratoDe);

  const deshacer = async () => {
    if (!ultimo) return;
    const it = porKey(ultimo.key);
    if (!it) return;
    setDeshaciendo(true);
    const err = await onAplicar(it.row, ultimo.previos, `Deshacer: ${ultimo.descripcion}`);
    setDeshaciendo(false);
    if (err) setAvisoError(err);
    setUltimo(null);
  };

  const tabs: { id: Filtro; etiqueta: string }[] = [
    { id: 'atencion', etiqueta: 'Piden atención' },
    { id: 'proceso', etiqueta: 'En proceso' },
    { id: 'adjudicados', etiqueta: 'Adjudicados' },
    { id: 'todos', etiqueta: 'Todos' },
  ];

  return (
    <div className="space-y-5">
      {/* Encabezado */}
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="hidden sm:flex h-12 w-12 rounded-2xl text-white items-center justify-center shadow-lg flex-shrink-0" style={{ background: 'linear-gradient(135deg, #0F4C3A, #1B3A5E)' }}>
            <Inbox className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Mis servicios {anio}</h1>
            <p className="text-slate-500 text-sm mt-0.5 max-w-2xl">
              {items.length} servicio{items.length !== 1 ? 's' : ''}
              {cuenta.atencion > 0 ? <> · <span className="font-semibold text-amber-700">{cuenta.atencion} piden atención</span></> : ' · todo al día'}.
              {' '}Avanza la fase o completa los datos del contrato; gráficas, resúmenes y Gantt se actualizan solos.
            </p>
          </div>
        </div>
        {responsables && onFiltroResponsable && (
          <label className="flex items-center gap-2 text-sm">
            <span className="text-slate-500 font-semibold">Responsable</span>
            <select value={filtroResponsable ?? ''} onChange={(e) => onFiltroResponsable(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-xl bg-white text-slate-700 font-semibold focus:outline-none focus:ring-2 focus:ring-[#0F4C3A]/25">
              <option value="">Todos</option>
              {responsables.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
        )}
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filtrar servicios">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={filtro === t.id}
              onClick={() => setFiltro(t.id)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold border transition-colors ${
                filtro === t.id ? 'bg-[#0F4C3A] text-white border-[#0F4C3A]' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
              }`}
            >
              {t.etiqueta}
              <span className={`text-xs tabular-nums ${filtro === t.id ? 'text-white/70' : 'text-slate-400'}`}>{cuenta[t.id]}</span>
            </button>
          ))}
        </div>
        <div className="relative sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar servicio o gerencia" aria-label="Buscar servicio" className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#0F4C3A]/25" />
        </div>
      </div>

      {avisoError && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <span className="flex-1">{avisoError}</span>
          <button onClick={() => setAvisoError(null)} aria-label="Cerrar aviso"><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* Tarjetas */}
      {visibles.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-14 text-center">
          <CheckCircle2 className="h-10 w-10 text-emerald-400 mx-auto mb-2" />
          <p className="text-sm font-semibold text-slate-600">
            {items.length === 0 ? 'No tienes servicios asignados todavía.' : 'Nada por aquí.'}
          </p>
          {items.length === 0 && <p className="text-xs text-slate-400 mt-1">Un administrador te los asigna desde la tabla de Estatus servicios (columna Responsable).</p>}
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          {visibles.map((it) => {
            const { indice } = it.estado;
            const enProceso = indice < INDICE_ADJUDICADO;
            const faltanDatos = it.estado.alertas.some((a) => a.tipo === 'datos-contrato' || a.tipo === 'garantias');
            return (
              <article key={it.key} className={`rounded-2xl border bg-white p-4 shadow-sm flex flex-col gap-3 ${indice === INDICE_CANCELADO ? 'opacity-60' : ''} ${it.estado.alertas.some((a) => a.tipo === 'vencido' || a.tipo === 'fase-larga') ? 'border-amber-200' : 'border-slate-200'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 mb-1">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border" style={{ borderColor: it.color, backgroundColor: `${it.color}18`, color: '#1e293b' }}>
                        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: it.color }} />
                        {it.estatus || 'Sin estatus'}
                      </span>
                      {it.gerencia && <span className="text-[11px] text-slate-400 truncate">{it.gerencia}</span>}
                    </div>
                    <button type="button" onClick={() => onAbrirFicha(it.row, it.nombre)} className="text-left text-sm font-bold text-slate-800 leading-snug hover:text-[#0F4C3A]">
                      {it.nombre}
                    </button>
                  </div>
                  {!it.puedeEditar && (
                    <span title="Este servicio es de otro responsable: puedes verlo pero no cambiarlo." className="flex-shrink-0 inline-flex items-center gap-1 text-[10px] font-semibold text-slate-400">
                      <Lock className="h-3 w-3" /> Sólo lectura
                    </span>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Pasos indice={indice} />
                  <p className="text-[11px] font-semibold text-slate-500">{etiquetaEtapa(it.estado)}{it.estado.inicioFase && enProceso && indice >= 0 ? ` · desde ${fmt(it.estado.inicioFase)}` : ''}</p>
                </div>

                {it.estado.alertas.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {it.estado.alertas.map((a, k) => {
                      const t = textoAlerta(a);
                      const Icono = t.icono;
                      return (
                        <span key={k} className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-semibold ${t.cls}`}>
                          <Icono className="h-3 w-3" /> {t.texto}
                        </span>
                      );
                    })}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2 mt-auto pt-1">
                  {enProceso && (
                    <button
                      type="button"
                      disabled={!it.puedeEditar}
                      onClick={() => setAvanzando(it.key)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#0F4C3A] text-white text-xs font-bold hover:bg-[#0d3f30] disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
                    >
                      {indice < 0 ? <Play className="h-3.5 w-3.5" /> : <ArrowRight className="h-3.5 w-3.5" />}
                      {indice < 0 ? 'Iniciar proceso' : indice === FASES.length - 1 ? 'Registrar fallo' : `Avanzar a ${CORTO[indice + 1]}`}
                    </button>
                  )}
                  {indice === INDICE_ADJUDICADO && (
                    <button
                      type="button"
                      disabled={!it.puedeEditar}
                      onClick={() => setContratoDe(it.key)}
                      className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed ${
                        faltanDatos ? 'bg-[#0F4C3A] text-white hover:bg-[#0d3f30] shadow-sm' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <ClipboardEdit className="h-3.5 w-3.5" />
                      {faltanDatos ? 'Completar datos del contrato' : 'Datos del contrato'}
                    </button>
                  )}
                  <button type="button" onClick={() => onAbrirNotas(it.row, it.nombre)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 text-xs font-semibold hover:bg-slate-50">
                    <StickyNote className="h-3.5 w-3.5" /> Notas{it.notas ? ` (${it.notas})` : ''}
                  </button>
                  <button type="button" onClick={() => onAbrirFicha(it.row, it.nombre)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-slate-500 text-xs font-semibold hover:text-[#0F4C3A]">
                    <FileText className="h-3.5 w-3.5" /> Ficha
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Aviso con Deshacer */}
      {ultimo && (
        <div role="status" className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[9996] flex items-center gap-3 rounded-2xl bg-slate-900 text-white pl-4 pr-2 py-2 shadow-2xl max-w-[calc(100vw-2rem)]">
          <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0" />
          <span className="text-sm truncate"><b>{ultimo.descripcion}</b> · {ultimo.nombre}</span>
          <button onClick={deshacer} disabled={deshaciendo} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-sm font-bold flex-shrink-0">
            {deshaciendo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />} Deshacer
          </button>
          <button onClick={() => setUltimo(null)} aria-label="Cerrar aviso" className="p-1.5 rounded-lg text-white/50 hover:text-white"><X className="h-4 w-4" /></button>
        </div>
      )}

      {itemAvance && (
        <AvanzarFase
          item={itemAvance}
          columnaEstatus={columnaEstatus}
          onCerrar={() => setAvanzando(null)}
          onAplicar={onAplicar}
          onNota={onNota}
          onListo={(previos, descripcion, pideAdjudicacion) => {
            setUltimo({ key: itemAvance.key, nombre: itemAvance.nombre, previos, descripcion });
            setAvanzando(null);
            if (pideAdjudicacion) setContratoDe(itemAvance.key);
          }}
        />
      )}

      {itemContrato && (
        <DatosContrato
          item={itemContrato}
          columnas={columnas}
          sugerencias={sugerencias}
          anio={anio}
          onCerrar={() => setContratoDe(null)}
          onAplicar={onAplicar}
          onListo={(previos) => {
            setUltimo({ key: itemContrato.key, nombre: itemContrato.nombre, previos, descripcion: 'Datos del contrato guardados' });
            setContratoDe(null);
          }}
        />
      )}
    </div>
  );
};

export default MisServicios;
