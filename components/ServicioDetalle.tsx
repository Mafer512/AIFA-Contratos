import React, { useMemo, useState } from 'react';
import {
  X, ArrowLeft, GanttChartSquare, FileText, CalendarRange, Building2, User,
  Truck, Hash, ShieldCheck, ShieldAlert, AlertTriangle, Search, TrendingUp,
} from 'lucide-react';
import { formatCurrency } from '../utils/formatters.ts';

// Ficha de un servicio y explorador de los servicios de un grupo.
//
// Un solo componente para los dos niveles —lista y detalle— porque siempre se
// llega igual: desde una barra de una gráfica o desde un renglón de una tabla,
// y de ahí a un servicio concreto. Separarlos obligaría a apilar dos ventanas
// una encima de otra, que es justo lo que hace que la gente se pierda.

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

  penas?: string;
  garantias: { etiqueta: string; ok: boolean }[];

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
}

const soloFecha = (v?: string) => {
  if (!v) return null;
  const t = String(v).trim();
  if (!t || /^(n\/?a|na|sin|-|—)$/i.test(t)) return null;
  return t;
};

/** Días que faltan (o que pasaron) para una fecha. */
const diasHasta = (fecha?: string): number | null => {
  const t = soloFecha(fecha);
  if (!t) return null;
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return null;
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - hoy.getTime()) / 86_400_000);
};

const Etiqueta: React.FC<{ icono: React.ElementType; texto: string }> = ({ icono: Icono, texto }) => (
  <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
    <Icono className="h-3 w-3" />
    {texto}
  </p>
);

/** Un dato del contrato. Cuando falta lo dice, en vez de dejar el hueco. */
const Campo: React.FC<{ icono: React.ElementType; etiqueta: string; valor?: string | null; ancho?: string }> = ({
  icono, etiqueta, valor, ancho = '',
}) => (
  <div className={`rounded-xl border border-slate-200 bg-white p-3 ${ancho}`}>
    <Etiqueta icono={icono} texto={etiqueta} />
    {valor ? (
      <p className="text-sm text-slate-800 font-semibold leading-snug break-words">{valor}</p>
    ) : (
      <p className="text-sm text-slate-300 italic">Sin capturar</p>
    )}
  </div>
);

const FichaServicio: React.FC<{ s: DatosServicio; onVerGantt: (row: Record<string, any>) => void }> = ({ s, onVerGantt }) => {
  const maximo = s.montoMaximo ?? 0;
  const ejercido = s.montoEjercido ?? 0;
  const pct = maximo > 0 ? Math.min(100, (ejercido / maximo) * 100) : 0;
  const restante = Math.max(0, maximo - ejercido);

  const dias = diasHasta(s.vigenciaTermino);
  const vigencia = soloFecha(s.vigenciaInicio) || soloFecha(s.vigenciaTermino);

  // El semáforo de vigencia es la lectura que de verdad se busca: no "cuándo
  // termina" sino "¿me tengo que preocupar?".
  const estadoVigencia =
    dias === null ? null
      : dias < 0 ? { texto: `Venció hace ${Math.abs(dias)} día${Math.abs(dias) !== 1 ? 's' : ''}`, cls: 'bg-rose-50 text-rose-700 border-rose-200' }
        : dias === 0 ? { texto: 'Vence hoy', cls: 'bg-rose-50 text-rose-700 border-rose-200' }
          : dias <= 30 ? { texto: `Vence en ${dias} día${dias !== 1 ? 's' : ''}`, cls: 'bg-amber-50 text-amber-700 border-amber-200' }
            : { texto: `Vigente · ${dias} días`, cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' };

  const garantiasFaltantes = s.garantias.filter((g) => !g.ok);

  return (
    <div className="space-y-4">

      {/* ── Identificación ── */}
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border-2"
          style={{ borderColor: s.colorEstatus, backgroundColor: `${s.colorEstatus}18`, color: '#1e293b' }}
        >
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

      {/* ── Avance financiero ── */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <Etiqueta icono={TrendingUp} texto="Avance financiero" />
          {maximo > 0 && (
            <span className="text-xs font-black tabular-nums text-slate-700">{pct.toFixed(1)}%</span>
          )}
        </div>

        {maximo > 0 ? (
          <>
            <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden mt-1">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.max(pct > 0 ? 2 : 0, pct)}%`, backgroundColor: pct >= 95 ? '#059669' : pct >= 60 ? '#2563EB' : '#B38E5D' }}
              />
            </div>
            <div className="grid grid-cols-3 gap-2 mt-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Ejercido</p>
                <p className="text-sm font-black text-slate-800 tabular-nums">{formatCurrency(ejercido)}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Por ejercer</p>
                <p className="text-sm font-black text-slate-500 tabular-nums">{formatCurrency(restante)}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Monto máximo</p>
                <p className="text-sm font-black text-slate-800 tabular-nums">{formatCurrency(maximo)}</p>
              </div>
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-400 italic mt-1">
            Todavía no tiene monto máximo capturado, así que no se puede calcular el avance.
          </p>
        )}
      </div>

      {/* ── Vigencia ── */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <Etiqueta icono={CalendarRange} texto="Vigencia" />
          {estadoVigencia && (
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${estadoVigencia.cls}`}>
              {estadoVigencia.texto}
            </span>
          )}
        </div>
        {vigencia ? (
          <div className="flex items-center gap-3 mt-1">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Inicio</p>
              <p className="text-sm font-semibold text-slate-800">{soloFecha(s.vigenciaInicio) ?? '—'}</p>
            </div>
            <span className="text-slate-300">→</span>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Término</p>
              <p className="text-sm font-semibold text-slate-800">{soloFecha(s.vigenciaTermino) ?? '—'}</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-300 italic mt-1">Sin capturar</p>
        )}
      </div>

      {/* ── Contrato ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Campo icono={Hash} etiqueta="Número de contrato" valor={soloFecha(s.noContrato)} />
        <Campo icono={User} etiqueta="Administrador del contrato" valor={soloFecha(s.administrador)} />
        <Campo icono={Truck} etiqueta="Proveedor" valor={soloFecha(s.proveedor)} ancho="sm:col-span-2" />
        {s.responsable && <Campo icono={User} etiqueta="Responsable en la Gerencia" valor={s.responsable} ancho="sm:col-span-2" />}
      </div>

      {/* ── Penas convencionales ── */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <Etiqueta icono={AlertTriangle} texto="Penas convencionales y deductivas" />
        {soloFecha(s.penas) ? (
          <p className="text-sm text-slate-800 font-semibold leading-snug break-words">{s.penas}</p>
        ) : (
          <p className="text-sm text-slate-400 italic">
            Sin penas ni deductivas registradas para este servicio.
          </p>
        )}
      </div>

      {/* ── Garantías ──
          Van aquí porque son lo que bloquea el pago: un servicio adjudicado al
          que le falta una garantía no puede cobrar, y esa es la pregunta que
          se hace justo al abrir su ficha. */}
      {s.garantias.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <Etiqueta icono={garantiasFaltantes.length ? ShieldAlert : ShieldCheck} texto="Requisitos para liberar pago" />
            {garantiasFaltantes.length > 0 && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[11px] font-bold">
                Falta{garantiasFaltantes.length !== 1 ? 'n' : ''} {garantiasFaltantes.length}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2 mt-1">
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
        </div>
      )}

      {/* ── Gantt ── */}
      <button
        type="button"
        onClick={() => onVerGantt(s.row)}
        disabled={!s.tieneGantt}
        className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 text-sm font-bold rounded-xl bg-[#1B3A5E] text-white hover:bg-[#15304e] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        title={s.tieneGantt ? 'Ver los tiempos de cada fase' : 'Este servicio todavía no tiene fechas de proceso capturadas'}
      >
        <GanttChartSquare className="h-4 w-4" />
        {s.tieneGantt ? 'Ver tiempos en el Diagrama de Gantt' : 'Sin fechas para el Gantt'}
      </button>
    </div>
  );
};

const ServicioDetalle: React.FC<Props> = ({ titulo, servicios, onCerrar, onVerGantt, subtitulo }) => {
  // Con un solo servicio se entra directo a su ficha: obligar a elegir de una
  // lista de uno sería un clic de más sin ninguna información nueva.
  const [abierto, setAbierto] = useState<DatosServicio | null>(servicios.length === 1 ? servicios[0] : null);
  const [busqueda, setBusqueda] = useState('');

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return servicios;
    return servicios.filter((s) =>
      [s.nombre, s.estatus, s.proveedor, s.noContrato, s.responsable, s.gerencia]
        .some((v) => String(v ?? '').toLowerCase().includes(q))
    );
  }, [servicios, busqueda]);

  const montoTotal = useMemo(
    () => servicios.reduce((n, s) => n + (s.montoMaximo ?? 0), 0),
    [servicios]
  );

  const puedeVolver = abierto !== null && servicios.length > 1;

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(3px)' }}
      onClick={onCerrar}
    >
      <div
        className="bg-slate-50 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-6 py-4 bg-[#0F4C3A] rounded-t-2xl flex-shrink-0">
          <div className="min-w-0 flex items-start gap-3">
            {puedeVolver && (
              <button
                onClick={() => setAbierto(null)}
                title="Volver a la lista"
                className="flex-shrink-0 mt-0.5 w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <div className="min-w-0">
              <h3 className="text-base font-bold text-white leading-snug break-words">
                {abierto ? abierto.nombre : titulo}
              </h3>
              <p className="text-xs text-emerald-200 mt-0.5">
                {abierto
                  ? (abierto.claveCucop ? `Clave CUCOP ${abierto.claveCucop}` : 'Ficha del servicio')
                  : (subtitulo ?? `${servicios.length} servicio${servicios.length !== 1 ? 's' : ''}${montoTotal > 0 ? ` · ${formatCurrency(montoTotal)}` : ''}`)}
              </p>
            </div>
          </div>
          <button
            onClick={onCerrar}
            className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto">
          {abierto ? (
            <FichaServicio s={abierto} onVerGantt={onVerGantt} />
          ) : (
            <>
              {servicios.length > 6 && (
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    placeholder="Buscar servicio, proveedor o contrato"
                    className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#0F4C3A]/30"
                  />
                </div>
              )}

              {filtrados.length === 0 ? (
                <p className="text-center text-sm text-slate-400 py-10">Sin coincidencias.</p>
              ) : (
                <div className="space-y-2">
                  {filtrados.map((s) => {
                    const pct = (s.montoMaximo ?? 0) > 0 ? ((s.montoEjercido ?? 0) / s.montoMaximo!) * 100 : null;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setAbierto(s)}
                        className="w-full text-left rounded-xl border border-slate-200 bg-white p-3 hover:border-[#0F4C3A]/40 hover:shadow-sm transition-all"
                      >
                        <div className="flex items-start gap-3">
                          <span
                            className="w-1.5 self-stretch rounded-full flex-shrink-0"
                            style={{ backgroundColor: s.colorEstatus }}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-slate-800 leading-snug">{s.nombre}</p>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[11px] text-slate-500">
                              <span className="font-semibold" style={{ color: '#475569' }}>{s.estatus || 'Sin estatus'}</span>
                              {s.gerencia && <span>{s.gerencia}</span>}
                              {s.noContrato && <span className="font-mono">{s.noContrato}</span>}
                              {(s.montoMaximo ?? 0) > 0 && (
                                <span className="font-semibold text-slate-600 tabular-nums">{formatCurrency(s.montoMaximo!)}</span>
                              )}
                              {pct !== null && (
                                <span className="tabular-nums">{pct.toFixed(0)}% ejercido</span>
                              )}
                            </div>
                          </div>
                          <FileText className="h-4 w-4 text-slate-300 flex-shrink-0 mt-0.5" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ServicioDetalle;
