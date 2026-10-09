import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  X, ArrowLeft, GanttChartSquare, CalendarRange, Building2, User, Truck, Hash, ShieldCheck, ShieldAlert,
  AlertTriangle, Search, TrendingUp, Copy, Check, ChevronRight, Receipt, Gauge, ArrowUpDown,
  CheckCircle2, Info, Hourglass, Wallet, StickyNote, MessageSquarePlus,
} from 'lucide-react';
import { formatCurrency } from '../utils/formatters.ts';
import { parseFechaFlexible, diasEntre, ritmoDeEjercicio, type Ritmo } from '../utils/fichaServicio.ts';
import { ChipTipoNota, fechaNota, TIPOS_NOTA, type NotaServicio } from './NotasServicio';

// Ficha de un servicio y explorador de los servicios de un grupo.
//
// Un solo componente para los dos niveles —lista y ficha— porque siempre se
// llega igual: desde una barra de una gráfica o desde un renglón de una tabla,
// y de ahí a un servicio concreto. La lista y su resumen se exportan para que
// las pantallas de "servicios con estatus…" y "servicios en fase…" se vean y
// se comporten exactamente igual que el explorador.

export interface PagoMensual {
  mes: string;
  /** Lo pagado en el mes, ya descontada la nota de crédito. */
  pagado: number;
  /** Nota de crédito del mes: la deductiva aplicada. */
  deductiva: number;
}

export interface FaseProceso {
  etiqueta: string;
  color: string;
  area: 'DO' | 'DA';
  inicio: Date | null;
  fin: Date | null;
}

export interface DatosServicio {
  id: string | number;
  nombre: string;
  estatus: string;
  colorEstatus: string;
  claveCucop?: string;
  subdireccion?: string;
  gerencia?: string;
  responsable?: string;
  tipoServicio?: string;
  fase?: string;

  // Contrato
  noContrato?: string;
  proveedor?: string;
  administrador?: string;
  vigenciaInicio?: string;
  vigenciaTermino?: string;

  // Dinero
  montoMaximo?: number;
  montoEjercido?: number;
  /** Pagos del año ligados al servicio, mes por mes. */
  pagosMensuales?: PagoMensual[];
  /** Números de contrato con los que aparece en Pagos. */
  contratosPago?: string[];

  /** Texto de penas capturado en estatus (hoy no existe la columna). */
  penas?: string;
  incidencias?: string;
  garantias: { etiqueta: string; ok: boolean }[];

  /** Notas del servicio (undefined si la tabla de notas no existe). */
  notas?: NotaServicio[];

  /** Fases del proceso de contratación, para el mini Gantt. */
  fases?: FaseProceso[];
  /** Fila original, para abrir el Gantt de ese servicio. */
  row: Record<string, any>;
  tieneGantt: boolean;
}

interface Props {
  titulo: string;
  /** Uno o varios servicios. Con uno solo se abre directo en su ficha. */
  servicios: DatosServicio[];
  onCerrar: () => void;
  onVerGantt: (row: Record<string, any>) => void;
  subtitulo?: string;
  /** Hay otra ventana encima (el Gantt): Escape no debe cerrar ésta. */
  bloqueado?: boolean;
  /** Abre el panel de notas del servicio. */
  onAbrirNotas?: (s: DatosServicio) => void;
}

// ── Utilidades de presentación ──────────────────────────────────────────────

const VERDE = '#0F4C3A';
const DORADO = '#B38E5D';
const AZUL = '#1B3A5E';

const textoUtil = (v?: string | null) => {
  if (!v) return null;
  const t = String(v).trim();
  if (!t || /^(n\/?a|na|sin|-|—)$/i.test(t)) return null;
  return t;
};

const hoyLocal = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

const fmtFecha = (d: Date | null) =>
  d ? d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }).replace('.', '') : '—';

/** "$42.9 M", "$860 mil": para las tarjetas, donde la cifra completa no cabe. */
const fmtCompacto = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1e6) return `$${(n / 1e6).toFixed(a >= 1e8 ? 0 : 1)} M`;
  if (a >= 1e3) return `$${Math.round(n / 1e3)} mil`;
  return formatCurrency(n);
};

/** Deja cortar el número de contrato sólo después de "-" y "/". */
const contratoCortable = (c: string) => c.replace(/([-/])/g, '$1​');

const colorAvance = (pct: number) => (pct >= 95 ? '#059669' : pct >= 60 ? '#2563EB' : DORADO);

interface Metricas {
  maximo: number;
  ejercido: number;
  pct: number | null;
  inicio: Date | null;
  fin: Date | null;
  dias: number | null;
  semaforo: { texto: string; corto: string; tarjeta: string; cls: string; punto: string } | null;
  deductivas: number;
  mesesDeductiva: PagoMensual[];
  ritmo: Ritmo;
}

const calcularMetricas = (s: DatosServicio): Metricas => {
  const maximo = s.montoMaximo ?? 0;
  const ejercido = s.montoEjercido ?? 0;
  const pct = maximo > 0 ? (ejercido / maximo) * 100 : null;
  const inicio = parseFechaFlexible(s.vigenciaInicio);
  const fin = parseFechaFlexible(s.vigenciaTermino);
  const hoy = hoyLocal();
  const dias = fin ? diasEntre(hoy, fin) : null;

  // No "cuándo termina" sino "¿me tengo que preocupar?".
  const semaforo =
    dias === null ? null
      : dias < 0 ? { texto: `Venció hace ${Math.abs(dias)} día${Math.abs(dias) !== 1 ? 's' : ''}`, corto: 'Vencido', tarjeta: 'Vencido', cls: 'bg-rose-50 text-rose-700 border-rose-200', punto: '#E11D48' }
        : dias === 0 ? { texto: 'Vence hoy', corto: 'Vence hoy', tarjeta: 'Vence hoy', cls: 'bg-rose-50 text-rose-700 border-rose-200', punto: '#E11D48' }
          : dias <= 30 ? { texto: `Vence en ${dias} día${dias !== 1 ? 's' : ''}`, corto: `${dias} d`, tarjeta: `Vence en ${dias} d`, cls: 'bg-amber-50 text-amber-700 border-amber-200', punto: '#D97706' }
            : { texto: `Vigente · faltan ${dias} días`, corto: `${dias} d`, tarjeta: `Vigente · ${dias} d`, cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', punto: '#059669' };

  const meses = s.pagosMensuales ?? [];
  const mesesDeductiva = meses.filter((m) => m.deductiva > 0);
  const deductivas = mesesDeductiva.reduce((n, m) => n + m.deductiva, 0);

  return { maximo, ejercido, pct, inicio, fin, dias, semaforo, deductivas, mesesDeductiva, ritmo: ritmoDeEjercicio(inicio, fin, ejercido, maximo, hoy) };
};

// ── Piezas gráficas ─────────────────────────────────────────────────────────

/** Anillo de avance en SVG; el centro lo pone quien lo usa. */
const Anillo: React.FC<{ pct: number; color: string; size?: number; grosor?: number; children?: React.ReactNode }> = ({
  pct, color, size = 112, grosor = 11, children,
}) => {
  const r = (size - grosor) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, pct));
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E2E8F0" strokeWidth={grosor} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={grosor}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)}
          style={{ transition: 'stroke-dashoffset 0.9s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
};

const Etiqueta: React.FC<{ icono: React.ElementType; texto: string }> = ({ icono: Icono, texto }) => (
  <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
    <Icono className="h-3 w-3" />
    {texto}
  </p>
);

const Seccion: React.FC<{ icono: React.ElementType; titulo: string; extra?: React.ReactNode; children: React.ReactNode; innerRef?: React.RefObject<HTMLElement | null> }> = ({
  icono: Icono, titulo, extra, children, innerRef,
}) => (
  <section ref={innerRef} className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm scroll-mt-4">
    <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
      <h4 className="flex items-center gap-2 text-sm font-bold text-slate-800">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
          <Icono className="h-4 w-4" />
        </span>
        {titulo}
      </h4>
      {extra}
    </div>
    {children}
  </section>
);

/** Un dato del contrato. Cuando falta lo dice, en vez de dejar el hueco. */
const Campo: React.FC<{ icono: React.ElementType; etiqueta: string; valor?: string | null; ancho?: string; mono?: boolean }> = ({
  icono, etiqueta, valor, ancho = '', mono = false,
}) => (
  <div className={`rounded-xl border border-slate-200 bg-slate-50/60 p-3 ${ancho}`}>
    <Etiqueta icono={icono} texto={etiqueta} />
    {valor ? (
      <p className={`text-sm text-slate-800 font-semibold leading-snug break-words ${mono ? 'font-mono text-[13px]' : ''}`}>{valor}</p>
    ) : (
      <p className="text-sm text-slate-300 italic">Sin capturar</p>
    )}
  </div>
);

const BotonCopiar: React.FC<{ texto: string }> = ({ texto }) => {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      type="button"
      onClick={async (e) => {
        e.stopPropagation();
        try { await navigator.clipboard.writeText(texto); setCopiado(true); window.setTimeout(() => setCopiado(false), 1800); } catch { /* sin portapapeles */ }
      }}
      title="Copiar número de contrato"
      aria-label="Copiar número de contrato"
      className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors flex-shrink-0"
    >
      {copiado ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
};

const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

/** Barras por mes: lo pagado y, encima en rojo, la deductiva del mes. */
const GraficaMensual: React.FC<{ meses: PagoMensual[] }> = ({ meses }) => {
  const max = Math.max(...meses.map((m) => m.pagado + m.deductiva), 1);
  const hoy = new Date();
  const mesActual = hoy.getFullYear() === 2026 ? hoy.getMonth() : -1;
  return (
    <div>
      <div className="flex items-end gap-1.5 h-32 px-1">
        {meses.map((m, i) => {
          const hP = (m.pagado / max) * 100;
          const hD = (m.deductiva / max) * 100;
          const vacio = m.pagado + m.deductiva === 0;
          return (
            <div
              key={m.mes}
              className="flex-1 h-full flex flex-col justify-end items-stretch group/mes relative"
              title={`${m.mes}: pagado ${formatCurrency(m.pagado)}${m.deductiva > 0 ? ` · deductiva ${formatCurrency(m.deductiva)}` : ''}`}
            >
              {m.deductiva > 0 && (
                <div className="rounded-t-sm bg-rose-500/90" style={{ height: `${Math.max(hD, 3)}%` }} />
              )}
              <div
                className={`${m.deductiva > 0 ? '' : 'rounded-t-sm'} transition-all group-hover/mes:brightness-125`}
                style={{ height: vacio ? '2px' : `${Math.max(hP, 2)}%`, backgroundColor: vacio ? '#E2E8F0' : VERDE }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex gap-1.5 px-1 mt-1.5">
        {meses.map((m, i) => (
          <span key={m.mes} className={`flex-1 text-center text-[9px] font-bold uppercase tracking-wide ${i === mesActual ? 'text-[#0F4C3A]' : 'text-slate-400'}`}>
            {MESES_CORTOS[i] ?? m.mes.slice(0, 3)}
          </span>
        ))}
      </div>
      <div className="flex items-center gap-4 mt-2 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: VERDE }} /> Pagado</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-rose-500" /> Deductiva</span>
      </div>
    </div>
  );
};

const RITMO_TEXTO: Record<Ritmo['estado'], { titulo: string; cls: string }> = {
  'sin-datos': { titulo: 'Sin datos suficientes', cls: 'bg-slate-50 text-slate-500 border-slate-200' },
  'por-iniciar': { titulo: 'La vigencia aún no inicia', cls: 'bg-slate-50 text-slate-600 border-slate-200' },
  'en-ritmo': { titulo: 'En ritmo', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  lento: { titulo: 'Ejercicio lento', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  adelantado: { titulo: 'Ejercicio adelantado', cls: 'bg-sky-50 text-sky-800 border-sky-200' },
  concluido: { titulo: 'Vigencia concluida', cls: 'bg-slate-100 text-slate-700 border-slate-200' },
};

const explicarRitmo = (r: Ritmo): string => {
  const e = r.pctEjercido.toFixed(0);
  const t = r.pctTiempo.toFixed(0);
  switch (r.estado) {
    case 'en-ritmo': return `Lleva ${e}% ejercido con ${t}% del plazo transcurrido: el gasto va al paso del contrato.`;
    case 'lento': return `Lleva ${e}% ejercido pero ya pasó ${t}% del plazo. Si sigue así puede quedar dinero sin ejercer.`;
    case 'adelantado': return `Lleva ${e}% ejercido con sólo ${t}% del plazo: el monto podría agotarse antes del término.`;
    case 'concluido': return `La vigencia terminó con ${e}% del monto máximo ejercido.`;
    case 'por-iniciar': return 'Todavía no hay plazo transcurrido contra el cual comparar el gasto.';
    default: return 'Hace falta el monto máximo y las fechas de vigencia para comparar gasto contra plazo.';
  }
};

/** Mini Gantt del proceso de contratación: cada fase con fechas, a escala. */
const MiniGantt: React.FC<{ fases: FaseProceso[] }> = ({ fases }) => {
  const validas = fases.filter((f) => f.inicio && f.fin && f.fin >= f.inicio);
  if (!validas.length) return null;
  const min = Math.min(...validas.map((f) => f.inicio!.getTime()));
  const max = Math.max(...validas.map((f) => f.fin!.getTime()));
  const rango = Math.max(max - min, 86_400_000);
  const totalDias = validas.reduce((n, f) => n + Math.max(0, diasEntre(f.inicio!, f.fin!)), 0);
  const hoy = hoyLocal().getTime();
  const hoyPct = hoy >= min && hoy <= max ? ((hoy - min) / rango) * 100 : null;

  return (
    <div>
      <div className="space-y-1.5">
        {validas.map((f) => {
          const izq = ((f.inicio!.getTime() - min) / rango) * 100;
          const ancho = Math.max(((f.fin!.getTime() - f.inicio!.getTime()) / rango) * 100, 1.2);
          const dias = Math.max(0, diasEntre(f.inicio!, f.fin!));
          return (
            <div key={f.etiqueta} className="flex items-center gap-3" title={`${f.etiqueta}: ${fmtFecha(f.inicio)} → ${fmtFecha(f.fin)} · ${dias} días`}>
              <span className="w-40 sm:w-52 flex-shrink-0 truncate text-[11px] font-medium text-slate-600">
                {f.etiqueta.replace(/^\d+\.\s*/, '')}
              </span>
              <div className="relative flex-1 h-4 rounded bg-slate-100">
                <div
                  className="absolute top-0 h-full rounded"
                  style={{ left: `${izq}%`, width: `${ancho}%`, backgroundColor: f.area === 'DO' ? '#111827' : '#60A5FA' }}
                />
                {hoyPct !== null && <div className="absolute -top-0.5 -bottom-0.5 w-px bg-rose-500" style={{ left: `${hoyPct}%` }} />}
              </div>
              <span className="w-12 flex-shrink-0 text-right text-[11px] font-bold tabular-nums text-slate-500">{dias} d</span>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 mt-3 text-[11px] text-slate-500">
        <div className="flex items-center gap-4">
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#111827]" /> D.O.</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#60A5FA]" /> D.A.</span>
          {hoyPct !== null && <span className="inline-flex items-center gap-1.5"><span className="h-3 w-px bg-rose-500" /> Hoy</span>}
        </div>
        <span className="font-semibold text-slate-600">{fmtFecha(new Date(min))} → {fmtFecha(new Date(max))} · {totalDias} días en {validas.length} fase{validas.length !== 1 ? 's' : ''}</span>
      </div>
    </div>
  );
};

// ── Ficha ───────────────────────────────────────────────────────────────────

const FichaServicio: React.FC<{ s: DatosServicio; onVerGantt: (row: Record<string, any>) => void; onAbrirNotas?: (s: DatosServicio) => void }> = ({ s, onVerGantt, onAbrirNotas }) => {
  const m = useMemo(() => calcularMetricas(s), [s]);
  const refAvance = useRef<HTMLElement>(null);
  const refVigencia = useRef<HTMLElement>(null);
  const refPenas = useRef<HTMLElement>(null);
  const refContrato = useRef<HTMLElement>(null);
  const ir = (ref: React.RefObject<HTMLElement | null>) => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const contrato = textoUtil(s.noContrato) ?? s.contratosPago?.[0] ?? null;
  const administrador = textoUtil(s.administrador);
  const restante = Math.max(0, m.maximo - m.ejercido);
  const garantiasFaltantes = s.garantias.filter((g) => !g.ok);
  const tienePagos = (s.pagosMensuales ?? []).some((p) => p.pagado > 0 || p.deductiva > 0);
  const ritmo = RITMO_TEXTO[m.ritmo.estado];
  const inicialesAdmin = (administrador ?? '').replace(/\.$/, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('');

  const tarjeta = 'text-left rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm hover:shadow-md hover:border-slate-300 transition-all min-w-0';

  return (
    <div className="space-y-4">
      {/* ── Identificación ── */}
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border-2"
          style={{ borderColor: s.colorEstatus, backgroundColor: `${s.colorEstatus}18`, color: '#1e293b' }}
        >
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.colorEstatus }} />
          {s.estatus || 'Sin estatus'}
        </span>
        {s.subdireccion && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 text-[11px] font-semibold border border-indigo-100">
            <Building2 className="h-3 w-3" /> {s.subdireccion}
          </span>
        )}
        {s.gerencia && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-semibold border border-emerald-100">
            {s.gerencia}
          </span>
        )}
        {s.tipoServicio && (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 text-[11px] font-semibold">
            {s.tipoServicio}
          </span>
        )}
      </div>

      {/* ── Datos clave: lo que se pregunta primero, de un vistazo ── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5">
        <button type="button" onClick={() => ir(refAvance)} className={`${tarjeta} col-span-2 lg:col-span-1`}>
          <Etiqueta icono={TrendingUp} texto="Avance financiero" />
          <div className="flex items-center gap-3 mt-1">
            <Anillo pct={m.pct ?? 0} color={colorAvance(m.pct ?? 0)} size={52} grosor={6}>
              <span className="text-[11px] font-black text-slate-800 tabular-nums">{m.pct === null ? '—' : `${Math.round(m.pct)}%`}</span>
            </Anillo>
            <div className="min-w-0">
              <p className="text-sm font-black text-slate-800 tabular-nums truncate">{fmtCompacto(m.ejercido)}</p>
              <p className="text-[10px] text-slate-400 truncate">de {m.maximo > 0 ? fmtCompacto(m.maximo) : 'sin máximo'}</p>
            </div>
          </div>
        </button>

        <button type="button" onClick={() => ir(refVigencia)} className={tarjeta}>
          <Etiqueta icono={CalendarRange} texto="Vigencia" />
          {m.fin ? (
            <>
              <p className="text-sm font-black text-slate-800 mt-1">{fmtFecha(m.fin)}</p>
              {m.semaforo && (
                <span className={`inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap ${m.semaforo.cls}`} title={m.semaforo.texto}>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: m.semaforo.punto }} />
                  {m.semaforo.tarjeta}
                </span>
              )}
            </>
          ) : <p className="text-sm text-slate-300 italic mt-1">Sin capturar</p>}
        </button>

        <div className={`${tarjeta} hover:shadow-sm`} onClick={() => ir(refContrato)} role="button" tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter') ir(refContrato); }}>
          <Etiqueta icono={Hash} texto="Número de contrato" />
          {contrato ? (
            <div className="flex items-start gap-1 mt-1">
              <p className="text-[11px] font-bold font-mono text-slate-800 leading-snug">{contratoCortable(contrato)}</p>
              <BotonCopiar texto={contrato} />
            </div>
          ) : <p className="text-sm text-slate-300 italic mt-1">Sin capturar</p>}
        </div>

        <button type="button" onClick={() => ir(refPenas)} className={tarjeta}>
          <Etiqueta icono={AlertTriangle} texto="Penas y deductivas" />
          {m.deductivas > 0 ? (
            <>
              <p className="text-sm font-black text-rose-600 tabular-nums mt-1">{fmtCompacto(m.deductivas)}</p>
              <p className="text-[10px] text-slate-400">en {m.mesesDeductiva.length} mes{m.mesesDeductiva.length !== 1 ? 'es' : ''}</p>
            </>
          ) : textoUtil(s.penas) ? (
            <p className="text-xs font-semibold text-slate-700 mt-1 line-clamp-2">{s.penas}</p>
          ) : (
            <p className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 mt-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" /> No aplica
            </p>
          )}
        </button>

        <button type="button" onClick={() => ir(refContrato)} className={tarjeta}>
          <Etiqueta icono={User} texto="Administrador" />
          {administrador ? (
            <div className="flex items-center gap-2 mt-1">
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-black text-white" style={{ background: `linear-gradient(135deg, ${VERDE}, ${AZUL})` }}>
                {inicialesAdmin || '?'}
              </span>
              <p className="text-xs font-bold text-slate-800 leading-snug line-clamp-2">{administrador.replace(/\.$/, '')}</p>
            </div>
          ) : <p className="text-sm text-slate-300 italic mt-1">Sin capturar</p>}
        </button>
      </div>

      {/* ── Avance financiero ── */}
      <Seccion
        innerRef={refAvance}
        icono={Wallet}
        titulo="Avance financiero"
        extra={m.ritmo.estado !== 'sin-datos' && (
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${ritmo.cls}`}>{ritmo.titulo}</span>
        )}
      >
        {m.maximo > 0 || m.ejercido > 0 ? (
          <div className="space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center gap-5">
              <Anillo pct={m.pct ?? 0} color={colorAvance(m.pct ?? 0)}>
                <span className="text-2xl font-black text-slate-800 tabular-nums leading-none">{m.pct === null ? '—' : `${m.pct.toFixed(m.pct < 10 ? 1 : 0)}%`}</span>
                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mt-1">ejercido</span>
              </Anillo>
              <div className="flex-1 grid grid-cols-3 gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Ejercido</p>
                  <p className="text-sm sm:text-base font-black text-slate-800 tabular-nums">{formatCurrency(m.ejercido)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Por ejercer</p>
                  <p className="text-sm sm:text-base font-black text-slate-500 tabular-nums">{m.maximo > 0 ? formatCurrency(restante) : '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Monto máximo</p>
                  <p className="text-sm sm:text-base font-black text-slate-800 tabular-nums">{m.maximo > 0 ? formatCurrency(m.maximo) : 'Sin capturar'}</p>
                </div>

                {/* Gasto contra plazo: la pregunta de fondo es si el dinero va al paso. */}
                {m.ritmo.estado !== 'sin-datos' && (
                  <div className="col-span-3 space-y-1.5 pt-1">
                    {[
                      { etiqueta: 'Plazo transcurrido', valor: m.ritmo.pctTiempo, color: '#94A3B8' },
                      { etiqueta: 'Monto ejercido', valor: m.ritmo.pctEjercido, color: colorAvance(m.ritmo.pctEjercido) },
                    ].map((b) => (
                      <div key={b.etiqueta} className="flex items-center gap-2">
                        <span className="w-28 flex-shrink-0 text-[11px] text-slate-500">{b.etiqueta}</span>
                        <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(100, b.valor)}%`, backgroundColor: b.color }} />
                        </div>
                        <span className="w-10 text-right text-[11px] font-bold tabular-nums text-slate-600">{Math.round(b.valor)}%</span>
                      </div>
                    ))}
                    <p className="text-[11px] text-slate-500 leading-snug pt-0.5">{explicarRitmo(m.ritmo)}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="border-t border-slate-100 pt-4">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-3">Pagos por mes · 2026</p>
              {tienePagos ? (
                <GraficaMensual meses={s.pagosMensuales!} />
              ) : (
                <p className="text-sm text-slate-400 italic">No hay pagos registrados en Pagos 2026 para este servicio.</p>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-400 italic">
            Todavía no tiene monto máximo ni pagos registrados, así que no se puede calcular el avance.
          </p>
        )}
      </Seccion>

      {/* ── Vigencia ── */}
      <Seccion
        innerRef={refVigencia}
        icono={CalendarRange}
        titulo="Vigencia"
        extra={m.semaforo && (
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${m.semaforo.cls}`}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: m.semaforo.punto }} />
            {m.semaforo.texto}
          </span>
        )}
      >
        {m.inicio || m.fin ? (
          <div>
            {m.inicio && m.fin && m.fin > m.inicio ? (() => {
              const total = diasEntre(m.inicio, m.fin);
              const pasado = Math.max(0, Math.min(total, diasEntre(m.inicio, hoyLocal())));
              const pct = (pasado / total) * 100;
              return (
                <>
                  <div className="relative h-3 rounded-full bg-slate-100 mt-6 mb-2">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${VERDE}, ${m.semaforo?.punto ?? VERDE})` }} />
                    {pct > 0 && pct < 100 && (
                      <div className="absolute -top-6 -translate-x-1/2 flex flex-col items-center" style={{ left: `${pct}%` }}>
                        <span className="px-1.5 py-0.5 rounded bg-slate-800 text-white text-[9px] font-bold whitespace-nowrap">Hoy</span>
                        <span className="w-px h-3 bg-slate-800" />
                      </div>
                    )}
                  </div>
                  <div className="flex items-start justify-between text-xs">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Inicio</p>
                      <p className="font-semibold text-slate-800">{fmtFecha(m.inicio)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Plazo</p>
                      <p className="font-semibold text-slate-800">{total} días · {Math.round(pct)}% transcurrido</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Término</p>
                      <p className="font-semibold text-slate-800">{fmtFecha(m.fin)}</p>
                    </div>
                  </div>
                </>
              );
            })() : (
              <div className="flex items-center gap-3 text-sm">
                <span className="font-semibold text-slate-800">{fmtFecha(m.inicio)}</span>
                <span className="text-slate-300">→</span>
                <span className="font-semibold text-slate-800">{fmtFecha(m.fin)}</span>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-slate-300 italic">
            Sin capturar{textoUtil(s.vigenciaInicio) || textoUtil(s.vigenciaTermino) ? ` (lo capturado no es una fecha: "${s.vigenciaInicio ?? ''} – ${s.vigenciaTermino ?? ''}")` : ''}
          </p>
        )}
      </Seccion>

      {/* ── Penas convencionales y deductivas ── */}
      <Seccion innerRef={refPenas} icono={Receipt} titulo="Penas convencionales y deductivas">
        {m.deductivas > 0 ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <p className="text-2xl font-black text-rose-600 tabular-nums">{formatCurrency(m.deductivas)}</p>
              {m.ejercido > 0 && (
                <p className="text-xs text-slate-500">
                  equivale al <span className="font-bold text-slate-700">{((m.deductivas / (m.ejercido + m.deductivas)) * 100).toFixed(1)}%</span> de lo facturado
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {m.mesesDeductiva.map((d) => (
                <span key={d.mes} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-50 border border-rose-100 text-[11px]">
                  <span className="font-bold text-rose-700">{d.mes}</span>
                  <span className="font-semibold text-slate-700 tabular-nums">{formatCurrency(d.deductiva)}</span>
                </span>
              ))}
            </div>
            <p className="flex items-start gap-1.5 text-[11px] text-slate-400">
              <Info className="h-3.5 w-3.5 flex-shrink-0 mt-px" />
              Notas de crédito registradas en Pagos 2026 para este contrato.
            </p>
          </div>
        ) : (
          <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
            <CheckCircle2 className="h-4 w-4" />
            {tienePagos ? 'Sin penas ni deductivas aplicadas en los pagos de 2026.' : 'Sin penas ni deductivas registradas.'}
          </p>
        )}
        {textoUtil(s.penas) && (
          <p className="mt-3 text-sm text-slate-700 leading-snug"><span className="font-bold">Capturado: </span>{s.penas}</p>
        )}
        {textoUtil(s.incidencias) && (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
            <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-px" />
            <p className="text-xs text-amber-900 leading-snug"><span className="font-bold">Incidencias del servicio: </span>{s.incidencias}</p>
          </div>
        )}
      </Seccion>

      {/* ── Contrato ── */}
      <Seccion innerRef={refContrato} icono={Hash} titulo="Contrato">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
            <Etiqueta icono={Hash} texto="Número de contrato" />
            {contrato ? (
              <div className="flex items-start gap-1">
                <p className="text-[13px] font-mono font-semibold text-slate-800">{contratoCortable(contrato)}</p>
                <BotonCopiar texto={contrato} />
              </div>
            ) : <p className="text-sm text-slate-300 italic">Sin capturar</p>}
            {(s.contratosPago ?? []).filter((c) => c !== contrato).length > 0 && (
              <p className="text-[10px] text-slate-400 mt-1">En Pagos: {s.contratosPago!.join(' · ')}</p>
            )}
          </div>
          <Campo icono={User} etiqueta="Administrador del contrato" valor={administrador} />
          <Campo icono={Truck} etiqueta="Proveedor" valor={textoUtil(s.proveedor)} ancho="sm:col-span-2" />
          {s.responsable && <Campo icono={User} etiqueta="Responsable en GPyC" valor={s.responsable} />}
          {s.claveCucop && <Campo icono={Hash} etiqueta="Clave CUCOP" valor={s.claveCucop} mono />}
        </div>
      </Seccion>

      {/* ── Garantías: lo que bloquea el pago ── */}
      {s.garantias.length > 0 && (
        <Seccion
          icono={garantiasFaltantes.length ? ShieldAlert : ShieldCheck}
          titulo="Requisitos para liberar pago"
          extra={garantiasFaltantes.length > 0 ? (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[11px] font-bold">
              Falta{garantiasFaltantes.length !== 1 ? 'n' : ''} {garantiasFaltantes.length}
            </span>
          ) : (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold">Completos</span>
          )}
        >
          <div className="flex flex-wrap gap-2">
            {s.garantias.map((g) => (
              <span
                key={g.etiqueta}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border ${
                  g.ok ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-500 border-slate-200'
                }`}
              >
                {g.ok ? <ShieldCheck className="h-3.5 w-3.5" /> : <ShieldAlert className="h-3.5 w-3.5" />}
                {g.etiqueta}
              </span>
            ))}
          </div>
        </Seccion>
      )}

      {/* ── Notas: lo último que se sabe del servicio ── */}
      {s.notas && onAbrirNotas && (
        <Seccion
          icono={StickyNote}
          titulo="Notas del servicio"
          extra={
            <button
              type="button"
              onClick={() => onAbrirNotas(s)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-bold hover:bg-indigo-100 transition-colors"
            >
              <MessageSquarePlus className="h-3.5 w-3.5" />
              {s.notas.length ? `Ver las ${s.notas.length} y agregar` : 'Agregar nota'}
            </button>
          }
        >
          {s.notas.length === 0 ? (
            <p className="text-sm text-slate-400 italic">Todavía no hay notas. Aparecen también como marcadores en el Diagrama de Gantt.</p>
          ) : (
            <div className="space-y-2">
              {s.notas.slice(0, 3).map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => onAbrirNotas(s)}
                  className="w-full text-left flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2.5 hover:border-indigo-200 hover:bg-indigo-50/40 transition-colors"
                >
                  <span className="mt-1.5 h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: (TIPOS_NOTA[n.tipo] ?? TIPOS_NOTA.nota).color }} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <ChipTipoNota tipo={n.tipo} chico />
                      <span className="text-[11px] font-bold text-slate-600">{fechaNota(n.fecha)}</span>
                      <span className="text-[11px] text-slate-400">{n.autor_nombre ?? ''}</span>
                    </div>
                    <p className="text-sm text-slate-700 leading-snug mt-1 line-clamp-2">{n.texto}</p>
                  </div>
                </button>
              ))}
              {s.notas.length > 3 && (
                <p className="text-[11px] text-slate-400 pl-1">y {s.notas.length - 3} más…</p>
              )}
            </div>
          )}
        </Seccion>
      )}

      {/* ── Proceso de contratación ── */}
      <Seccion icono={GanttChartSquare} titulo="Proceso de contratación">
        {s.tieneGantt && s.fases?.some((f) => f.inicio && f.fin) ? (
          <MiniGantt fases={s.fases} />
        ) : (
          <p className="text-sm text-slate-400 italic">Este servicio todavía no tiene fechas de proceso capturadas.</p>
        )}
        <button
          type="button"
          onClick={() => onVerGantt(s.row)}
          disabled={!s.tieneGantt}
          className="mt-4 w-full inline-flex items-center justify-center gap-2 px-4 py-3 text-sm font-bold rounded-xl text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all hover:brightness-110 shadow-md"
          style={{ background: `linear-gradient(120deg, ${AZUL}, #0f2a44)` }}
          title={s.tieneGantt ? 'Abrir el Diagrama de Gantt de este servicio' : 'Sin fechas de proceso capturadas'}
        >
          <GanttChartSquare className="h-4 w-4" />
          {s.tieneGantt ? 'Ver Diagrama de Gantt del servicio' : 'Sin fechas para el Gantt'}
        </button>
      </Seccion>
    </div>
  );
};

// ── Resumen de un grupo ─────────────────────────────────────────────────────

/** Los datos clave de un conjunto de servicios: cuánto, cuánto va y qué urge. */
export const ResumenGrupo: React.FC<{
  servicios: DatosServicio[];
  estatusFiltro?: string | null;
  onFiltrarEstatus?: (estatus: string | null) => void;
}> = ({ servicios, estatusFiltro = null, onFiltrarEstatus }) => {
  const r = useMemo(() => {
    let maximo = 0, ejercido = 0, deductivas = 0, vencidos = 0, porVencer = 0;
    const porEstatus = new Map<string, { n: number; color: string }>();
    servicios.forEach((s) => {
      const m = calcularMetricas(s);
      maximo += m.maximo;
      ejercido += m.ejercido;
      deductivas += m.deductivas;
      if (m.dias !== null && m.dias < 0 && s.estatus.toLowerCase().includes('adjudic')) vencidos++;
      if (m.dias !== null && m.dias >= 0 && m.dias <= 30) porVencer++;
      const k = s.estatus || 'Sin estatus';
      const prev = porEstatus.get(k);
      porEstatus.set(k, { n: (prev?.n ?? 0) + 1, color: s.colorEstatus });
    });
    const estatus = Array.from(porEstatus.entries()).map(([nombre, v]) => ({ nombre, ...v })).sort((a, b) => b.n - a.n);
    return { maximo, ejercido, deductivas, vencidos, porVencer, estatus };
  }, [servicios]);

  const pct = r.maximo > 0 ? (r.ejercido / r.maximo) * 100 : null;
  const kpi = 'rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm min-w-0';

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <div className={kpi}>
          <Etiqueta icono={Hash} texto="Servicios" />
          <p className="text-2xl font-black text-slate-800 tabular-nums">{servicios.length}</p>
        </div>
        <div className={kpi}>
          <Etiqueta icono={Wallet} texto="Monto máximo" />
          <p className="text-lg font-black text-slate-800 tabular-nums truncate" title={formatCurrency(r.maximo)}>{fmtCompacto(r.maximo)}</p>
        </div>
        <div className={kpi}>
          <Etiqueta icono={Gauge} texto="Ejercido" />
          <p className="text-lg font-black text-slate-800 tabular-nums truncate" title={formatCurrency(r.ejercido)}>
            {fmtCompacto(r.ejercido)}
            {pct !== null && <span className="text-xs font-bold text-slate-400 ml-1.5">{pct.toFixed(0)}%</span>}
          </p>
          {pct !== null && (
            <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden mt-1.5">
              <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, backgroundColor: colorAvance(pct) }} />
            </div>
          )}
        </div>
        <div className={kpi}>
          <Etiqueta icono={Hourglass} texto="Alertas" />
          <div className="flex flex-wrap gap-1.5 mt-0.5">
            {r.deductivas > 0 && <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-100 text-[10px] font-bold">Deductivas {fmtCompacto(r.deductivas)}</span>}
            {r.porVencer > 0 && <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold">{r.porVencer} por vencer</span>}
            {r.vencidos > 0 && <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 text-[10px] font-bold">{r.vencidos} vencido{r.vencidos !== 1 ? 's' : ''}</span>}
            {!r.deductivas && !r.porVencer && !r.vencidos && <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> Sin alertas</span>}
          </div>
        </div>
      </div>

      {r.estatus.length > 1 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
          <div className="flex h-2.5 rounded-full overflow-hidden bg-slate-100">
            {r.estatus.map((e) => (
              <div key={e.nombre} title={`${e.nombre}: ${e.n}`} style={{ width: `${(e.n / servicios.length) * 100}%`, backgroundColor: e.color, opacity: estatusFiltro && estatusFiltro !== e.nombre ? 0.25 : 1 }} />
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {r.estatus.map((e) => {
              const activo = estatusFiltro === e.nombre;
              return (
                <button
                  key={e.nombre}
                  type="button"
                  disabled={!onFiltrarEstatus}
                  onClick={() => onFiltrarEstatus?.(activo ? null : e.nombre)}
                  className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${
                    activo ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                  } disabled:cursor-default`}
                >
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: e.color }} />
                  {e.nombre}
                  <span className={`tabular-nums ${activo ? 'text-white/70' : 'text-slate-400'}`}>{e.n}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

// ── Lista de servicios ──────────────────────────────────────────────────────

type Orden = 'monto' | 'avance' | 'vence' | 'nombre';

const ORDENES: { id: Orden; etiqueta: string }[] = [
  { id: 'monto', etiqueta: 'Mayor monto' },
  { id: 'avance', etiqueta: 'Mayor avance' },
  { id: 'vence', etiqueta: 'Vence primero' },
  { id: 'nombre', etiqueta: 'Nombre A–Z' },
];

/** Renglones de servicios con sus datos clave; cada uno abre su ficha. */
export const ListaServicios: React.FC<{
  servicios: DatosServicio[];
  onAbrir: (s: DatosServicio) => void;
  estatusFiltro?: string | null;
}> = ({ servicios, onAbrir, estatusFiltro = null }) => {
  const [busqueda, setBusqueda] = useState('');
  const [orden, setOrden] = useState<Orden>('monto');

  const filas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const conMetricas = servicios
      .filter((s) => !estatusFiltro || (s.estatus || 'Sin estatus') === estatusFiltro)
      .filter((s) => !q || [s.nombre, s.estatus, s.proveedor, s.noContrato, s.responsable, s.gerencia, s.administrador]
        .some((v) => String(v ?? '').toLowerCase().includes(q)))
      .map((s) => ({ s, m: calcularMetricas(s) }));
    const cmp: Record<Orden, (a: typeof conMetricas[number], b: typeof conMetricas[number]) => number> = {
      monto: (a, b) => b.m.maximo - a.m.maximo,
      avance: (a, b) => (b.m.pct ?? -1) - (a.m.pct ?? -1),
      vence: (a, b) => (a.m.dias ?? Infinity) - (b.m.dias ?? Infinity),
      nombre: (a, b) => a.s.nombre.localeCompare(b.s.nombre, 'es'),
    };
    return conMetricas.sort(cmp[orden]);
  }, [servicios, busqueda, orden, estatusFiltro]);

  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-2 mb-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar servicio, proveedor, contrato o administrador"
            className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#0F4C3A]/30"
          />
        </div>
        <label className="relative inline-flex items-center">
          <ArrowUpDown className="absolute left-3 h-4 w-4 text-slate-400 pointer-events-none" />
          <select
            value={orden}
            onChange={(e) => setOrden(e.target.value as Orden)}
            aria-label="Ordenar servicios"
            className="pl-9 pr-8 py-2.5 text-sm border border-slate-200 rounded-xl bg-white font-semibold text-slate-600 focus:outline-none focus:ring-2 focus:ring-[#0F4C3A]/30"
          >
            {ORDENES.map((o) => <option key={o.id} value={o.id}>{o.etiqueta}</option>)}
          </select>
        </label>
      </div>

      {filas.length === 0 ? (
        <p className="text-center text-sm text-slate-400 py-10">Sin coincidencias.</p>
      ) : (
        <div className="space-y-2">
          {filas.map(({ s, m }) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onAbrir(s)}
              className="group w-full text-left rounded-2xl border border-slate-200 bg-white p-3.5 hover:border-[#0F4C3A]/40 hover:shadow-md transition-all"
            >
              <div className="flex items-stretch gap-3">
                <span className="w-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.colorEstatus }} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-800 leading-snug group-hover:text-[#0F4C3A] transition-colors">{s.nombre}</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[11px] text-slate-500">
                    <span className="font-semibold text-slate-600">{s.estatus || 'Sin estatus'}</span>
                    {s.gerencia && <span>{s.gerencia}</span>}
                    {(textoUtil(s.noContrato) ?? s.contratosPago?.[0]) && (
                      <span className="font-mono">{textoUtil(s.noContrato) ?? s.contratosPago?.[0]}</span>
                    )}
                    {textoUtil(s.administrador) && <span className="inline-flex items-center gap-1"><User className="h-3 w-3" />{textoUtil(s.administrador)!.replace(/\.$/, '')}</span>}
                  </div>
                </div>
                <div className="hidden sm:flex flex-col items-end justify-center gap-1.5 w-44 flex-shrink-0">
                  <div className="flex items-center gap-2">
                    {m.semaforo && (
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold border ${m.semaforo.cls}`} title={m.semaforo.texto}>
                        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: m.semaforo.punto }} />
                        {m.semaforo.corto}
                      </span>
                    )}
                    {(s.notas?.length ?? 0) > 0 && (
                      <span
                        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100 text-[10px] font-bold"
                        title={`${s.notas!.length} nota${s.notas!.length !== 1 ? 's' : ''} · la última: ${s.notas![0].texto.slice(0, 80)}`}
                      >
                        <StickyNote className="h-2.5 w-2.5" />{s.notas!.length}
                      </span>
                    )}
                    {m.deductivas > 0 && (
                      <span className="px-1.5 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-100 text-[10px] font-bold" title={`Deductivas ${formatCurrency(m.deductivas)}`}>
                        −{fmtCompacto(m.deductivas)}
                      </span>
                    )}
                    <span className="text-xs font-black text-slate-700 tabular-nums">{m.maximo > 0 ? fmtCompacto(m.maximo) : '—'}</span>
                  </div>
                  {m.pct !== null && (
                    <div className="flex items-center gap-2 w-full">
                      <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${Math.min(100, m.pct)}%`, backgroundColor: colorAvance(m.pct) }} />
                      </div>
                      <span className="text-[10px] font-bold tabular-nums text-slate-500 w-9 text-right">{Math.round(m.pct)}%</span>
                    </div>
                  )}
                </div>
                <ChevronRight className="h-5 w-5 text-slate-300 self-center flex-shrink-0 group-hover:text-[#0F4C3A] group-hover:translate-x-0.5 transition-all" />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ── Ventana ─────────────────────────────────────────────────────────────────

const ServicioDetalle: React.FC<Props> = ({ titulo, servicios, onCerrar, onVerGantt, subtitulo, bloqueado = false, onAbrirNotas }) => {
  // Con un solo servicio se entra directo a su ficha: obligar a elegir de una
  // lista de uno sería un clic de más sin ninguna información nueva.
  const [abiertoId, setAbiertoId] = useState<string | number | null>(servicios.length === 1 ? servicios[0].id : null);
  const [estatusFiltro, setEstatusFiltro] = useState<string | null>(null);
  const cuerpo = useRef<HTMLDivElement>(null);

  // Se guarda el id, no el objeto: si los datos se recalculan (llegan los
  // pagos, por ejemplo) la ficha abierta se actualiza sola.
  const abierto = abiertoId === null ? null : servicios.find((s) => s.id === abiertoId) ?? null;
  const puedeVolver = abierto !== null && servicios.length > 1;

  useEffect(() => { cuerpo.current?.scrollTo({ top: 0 }); }, [abiertoId]);

  useEffect(() => {
    if (bloqueado) return;
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (puedeVolver) setAbiertoId(null);
      else onCerrar();
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [bloqueado, puedeVolver, onCerrar]);

  const montoTotal = useMemo(() => servicios.reduce((n, s) => n + (s.montoMaximo ?? 0), 0), [servicios]);

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center p-3 sm:p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(3px)' }}
      onClick={onCerrar}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={abierto ? abierto.nombre : titulo}
        className="bg-slate-50 rounded-3xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative flex items-start justify-between gap-3 px-5 sm:px-6 py-4 flex-shrink-0 overflow-hidden" style={{ background: `linear-gradient(120deg, ${VERDE} 0%, #14533f 50%, ${AZUL} 100%)` }}>
          <div className="absolute -right-12 -top-16 h-44 w-44 rounded-full bg-white/5 pointer-events-none" />
          <div className="relative min-w-0 flex items-start gap-3">
            {puedeVolver && (
              <button
                onClick={() => setAbiertoId(null)}
                title="Volver a la lista"
                aria-label="Volver a la lista"
                className="flex-shrink-0 mt-0.5 w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-200/80 mb-0.5">
                {abierto ? 'Ficha del servicio' : 'Servicios'}
              </p>
              <h3 className="text-base sm:text-lg font-bold text-white leading-snug break-words">
                {abierto ? abierto.nombre : titulo}
              </h3>
              <p className="text-xs text-emerald-100/80 mt-0.5">
                {abierto
                  ? [abierto.claveCucop ? `CUCOP ${abierto.claveCucop}` : null, abierto.gerencia].filter(Boolean).join(' · ') || 'Datos clave del contrato'
                  : (subtitulo ?? `${servicios.length} servicio${servicios.length !== 1 ? 's' : ''}${montoTotal > 0 ? ` · ${formatCurrency(montoTotal)}` : ''}`)}
              </p>
            </div>
          </div>
          <div className="relative flex items-center gap-2 flex-shrink-0">
            {abierto?.tieneGantt && (
              <button
                onClick={() => onVerGantt(abierto.row)}
                title="Ver Diagrama de Gantt del servicio"
                className="hidden sm:inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-colors"
              >
                <GanttChartSquare className="h-4 w-4" />
                Gantt
              </button>
            )}
            <button
              onClick={onCerrar}
              aria-label="Cerrar"
              className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div ref={cuerpo} className="p-4 sm:p-5 overflow-y-auto">
          {abierto ? (
            <FichaServicio s={abierto} onVerGantt={onVerGantt} onAbrirNotas={onAbrirNotas} />
          ) : (
            <div className="space-y-4">
              <ResumenGrupo servicios={servicios} estatusFiltro={estatusFiltro} onFiltrarEstatus={setEstatusFiltro} />
              <ListaServicios servicios={servicios} estatusFiltro={estatusFiltro} onAbrir={(s) => setAbiertoId(s.id)} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ServicioDetalle;
