import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  X, Loader2, CheckCircle2, Briefcase, CircleDollarSign, Gavel, FileSignature, CalendarRange, StickyNote,
  Package, Wrench, ChevronDown, AlertTriangle, Info,
} from 'lucide-react';
import { FASES } from '../utils/avanceFase';
import {
  camposDisponibles, columnasFaltantes, valoresIniciales, textoNoFecha, cambiosFicha,
  registroNuevo, validarFicha, estatusGeneral, TIPOS_CONTRATACION,
  type CampoFicha, type SeccionFicha, type ValoresFicha, type TipoContratacion, type EstatusGeneral,
} from '../utils/servicio2027';

// Ficha para dar de alta o editar un servicio (o adquisición) de 2027 sin
// tocar la tabla: cada dato en su campo, con el tipo que le toca (fecha,
// moneda, opciones…). Al guardar sólo se mandan las columnas que cambiaron.

interface Props {
  modo: 'nuevo' | 'editar';
  /** La fila de estatus_2027 (al editar). */
  row?: Record<string, any>;
  anio: number;
  /** Las columnas que de verdad tiene la tabla. */
  columnas: string[];
  tipoInicial?: TipoContratacion;
  responsableInicial?: string;
  responsables: string[];
  /** Operador con responsable: sus servicios quedan a su nombre. */
  responsableFijo?: boolean;
  /** Valores que ya existen en la tabla, para sugerir al escribir (por columna). */
  sugerencias: Record<string, string[]>;
  renderEstatus: (valor: string, onChange: (v: string) => void) => React.ReactNode;
  onCerrar: () => void;
  /** Guarda. Devuelve el mensaje de error, o null si salió bien. */
  onGuardar: (datos: Record<string, any>) => Promise<string | null>;
}

const SECCIONES: { id: SeccionFicha; titulo: string; icono: React.ElementType; ayuda?: string }[] = [
  { id: 'identificacion', titulo: 'Identificación', icono: Briefcase },
  { id: 'estatus', titulo: 'Estatus y montos', icono: CircleDollarSign },
  { id: 'procedimiento', titulo: 'Procedimiento de contratación', icono: Gavel },
  { id: 'contrato', titulo: 'Contrato', icono: FileSignature },
  { id: 'cronograma', titulo: 'Cronograma (Diagrama de Gantt)', icono: CalendarRange, ayuda: 'Estas fechas las va llenando "Avanzar fase". Aquí sólo se corrigen si alguna quedó mal.' },
  { id: 'notas', titulo: 'Observaciones', icono: StickyNote },
];

const etiquetaCls = 'block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5';
const campoCls = 'w-full px-3 py-2.5 text-sm border rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#0F4C3A]/25 focus:border-[#0F4C3A] disabled:bg-slate-50 disabled:text-slate-500';

const COLOR_GENERAL: Record<EstatusGeneral, string> = {
  Adjudicado: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  'En proceso': 'bg-amber-100 text-amber-800 border-amber-200',
  Cancelado: 'bg-slate-800 text-white border-slate-700',
  'Sin estatus': 'bg-white/15 text-white border-white/30',
};

const moneda = (t: string) => {
  const n = Number(String(t).replace(/[$,\s]/g, ''));
  return t.trim() && Number.isFinite(n) ? n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' }) : '';
};

const FormularioServicio2027: React.FC<Props> = ({
  modo, row = {}, anio, columnas, tipoInicial, responsableInicial, responsables, responsableFijo,
  sugerencias, renderEstatus, onCerrar, onGuardar,
}) => {
  const campos = useMemo(() => camposDisponibles(columnas), [columnas]);
  const faltantes = useMemo(() => columnasFaltantes(columnas), [columnas]);
  const inicial = useMemo<ValoresFicha>(() => {
    const v = valoresIniciales(row, campos);
    if (modo === 'nuevo') {
      if (tipoInicial) v['Tipo de contratación'] = tipoInicial;
      if (responsableInicial) v['Responsable'] = responsableInicial;
    }
    return v;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [valores, setValores] = useState<ValoresFicha>(inicial);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [verCronograma, setVerCronograma] = useState(false);
  const cuerpoRef = useRef<HTMLDivElement | null>(null);

  const sucio = useMemo(() => Object.keys(cambiosFicha(campos, inicial, valores, columnas)).length > 0, [campos, inicial, valores, columnas]);

  const cerrar = () => {
    if (sucio && !guardando && !window.confirm('Tienes cambios sin guardar. ¿Salir de todos modos?')) return;
    onCerrar();
  };

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      // El selector de estatus usa Escape para cerrarse a sí mismo.
      if (e.key === 'Escape' && !e.defaultPrevented) cerrar();
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  const poner = (col: string, v: string | boolean) => {
    setValores((p) => ({ ...p, [col]: v }));
    if (errores[col]) setErrores((p) => { const { [col]: _, ...resto } = p; return resto; });
    setErrorGeneral(null);
  };

  const tipo = (valores['Tipo de contratación'] as TipoContratacion) || tipoInicial || 'Servicio';
  const general = estatusGeneral(valores['Estatus']);
  const fechasCronograma = campos.filter((c) => c.seccion === 'cronograma');
  const llenasCronograma = fechasCronograma.filter((c) => valores[c.col]).length;

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validarFicha(campos, valores);
    setErrores(errs);
    if (Object.keys(errs).length) {
      if (fechasCronograma.some((c) => errs[c.col])) setVerCronograma(true);
      setErrorGeneral(`Revisa ${Object.keys(errs).length === 1 ? 'el campo marcado' : `los ${Object.keys(errs).length} campos marcados`}.`);
      requestAnimationFrame(() => cuerpoRef.current?.querySelector('[aria-invalid="true"]')?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
      return;
    }
    const datos = modo === 'nuevo' ? registroNuevo(campos, valores, columnas) : cambiosFicha(campos, inicial, valores, columnas);
    if (modo === 'editar' && !Object.keys(datos).length) { onCerrar(); return; }
    setGuardando(true);
    setErrorGeneral(null);
    const err = await onGuardar(datos);
    setGuardando(false);
    if (err) { setErrorGeneral(err); return; }
    onCerrar();
  };

  const ids = (c: CampoFicha) => `f27-${c.col.replace(/[^a-z0-9]+/gi, '-')}`;

  const control = (c: CampoFicha) => {
    const v = valores[c.col];
    const texto = typeof v === 'string' ? v : '';
    const err = errores[c.col];
    const borde = err ? 'border-red-300' : 'border-slate-200';
    const comunes = { id: ids(c), 'aria-invalid': err ? true : undefined } as const;
    switch (c.tipo) {
      case 'tipoContratacion':
        return (
          <div role="radiogroup" aria-label={c.etiqueta} className="grid grid-cols-2 gap-2">
            {TIPOS_CONTRATACION.map((t) => {
              const activo = tipo === t;
              const Icono = t === 'Adquisición' ? Package : Wrench;
              return (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={activo}
                  onClick={() => poner(c.col, t)}
                  className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-bold transition-colors ${activo ? 'border-[#0F4C3A] bg-emerald-50 text-[#0F4C3A] ring-2 ring-[#0F4C3A]/15' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
                >
                  <Icono className="h-4 w-4" /> {t}
                </button>
              );
            })}
          </div>
        );
      case 'responsable':
        return (
          <select {...comunes} value={texto} disabled={responsableFijo} onChange={(e) => poner(c.col, e.target.value)} className={`${campoCls} ${borde}`}>
            <option value="">— Sin asignar —</option>
            {(texto && !responsables.includes(texto) ? [texto, ...responsables] : responsables).map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        );
      case 'opciones':
        return (
          <select {...comunes} value={texto} onChange={(e) => poner(c.col, e.target.value)} className={`${campoCls} ${borde}`}>
            <option value="">— Selecciona —</option>
            {(texto && !c.opciones?.includes(texto) ? [texto, ...(c.opciones ?? [])] : c.opciones ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        );
      case 'estatus':
        return (
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <div className="sm:w-80">{renderEstatus(texto, (n) => poner(c.col, n))}</div>
            <span className="text-[11px] text-slate-500">
              Estatus general: <b className="text-slate-700">{general}</b>
            </span>
          </div>
        );
      case 'moneda':
        return (
          <>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400 pointer-events-none">$</span>
              <input {...comunes} inputMode="decimal" value={texto} onChange={(e) => poner(c.col, e.target.value)} placeholder={c.placeholder} className={`${campoCls} ${borde} pl-7 tabular-nums`} />
            </div>
            {!err && moneda(texto) && <p className="text-[11px] text-slate-400 mt-1">{moneda(texto)}</p>}
          </>
        );
      case 'fecha':
      case 'fechaTexto': {
        const viejo = textoNoFecha(c, row);
        return (
          <>
            <input {...comunes} type="date" value={texto} onChange={(e) => poner(c.col, e.target.value)} className={`${campoCls} ${borde}`} />
            {viejo && !texto && <p className="text-[11px] text-slate-400 mt-1">Antes decía «{viejo}». Elige una fecha para reemplazarlo.</p>}
          </>
        );
      }
      case 'notas':
        return <textarea {...comunes} rows={3} value={texto} onChange={(e) => poner(c.col, e.target.value)} className={`${campoCls} ${borde} resize-y`} placeholder="Algo que convenga saber de este servicio." />;
      default: {
        const lista = c.sugerencias ?? sugerencias[c.col];
        return (
          <>
            <input
              {...comunes}
              value={texto}
              list={lista?.length ? `${ids(c)}-lista` : undefined}
              inputMode={c.tipo === 'cucop' ? 'numeric' : undefined}
              autoFocus={c.col === 'Nombre del Servicio.' && modo === 'nuevo'}
              onChange={(e) => poner(c.col, e.target.value)}
              placeholder={c.placeholder}
              className={`${campoCls} ${borde} ${c.tipo === 'alfanumerico' || c.tipo === 'cucop' ? 'font-mono' : ''}`}
            />
            {!!lista?.length && <datalist id={`${ids(c)}-lista`}>{lista.map((o) => <option key={o} value={o} />)}</datalist>}
          </>
        );
      }
    }
  };

  const fila = (c: CampoFicha) => (
    <div key={c.col} className={c.ancho === 'completo' ? 'sm:col-span-2' : undefined}>
      {c.tipo !== 'tipoContratacion' && <label htmlFor={ids(c)} className={etiquetaCls}>{c.etiqueta}</label>}
      {control(c)}
      {errores[c.col] && <p className="text-[11px] font-medium text-red-600 mt-1">{errores[c.col]}</p>}
    </div>
  );

  const titulo = modo === 'nuevo'
    ? (tipo === 'Adquisición' ? 'Nueva adquisición' : 'Nuevo servicio')
    : `Editar ${tipo === 'Adquisición' ? 'adquisición' : 'servicio'}`;
  const subtitulo = modo === 'nuevo'
    ? `Se agrega a ${anio}. Lo demás (fases, contrato) se puede llenar después.`
    : String(row['Nombre del Servicio.'] ?? '');

  return (
    <div className="fixed inset-0 z-[9997] flex items-center justify-center p-2 sm:p-4" style={{ backgroundColor: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(3px)' }} onClick={cerrar}>
      <form
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        noValidate
        onSubmit={guardar}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[94vh] flex flex-col overflow-hidden"
      >
        <div className="px-5 sm:px-6 py-4 text-white flex items-start justify-between gap-3 flex-shrink-0" style={{ background: 'linear-gradient(120deg, #0F4C3A, #1B3A5E)' }}>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-bold leading-snug">{titulo}</h3>
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${COLOR_GENERAL[general]}`}>{general}</span>
            </div>
            {subtitulo && <p className="text-xs text-emerald-100/80 mt-0.5 leading-snug line-clamp-2">{subtitulo}</p>}
          </div>
          <button type="button" onClick={cerrar} aria-label="Cerrar" className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div ref={cuerpoRef} className="flex-1 min-h-0 overflow-y-auto px-5 sm:px-6 py-5 space-y-6">
          {faltantes.length > 0 && (
            <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
              <Info className="h-4 w-4 flex-shrink-0 mt-px" />
              <span>
                Todavía no se pueden capturar <b>{faltantes.join(', ')}</b>: falta activarlos en la base de datos
                (migración 20261123000000). Lo demás se guarda normal.
              </span>
            </p>
          )}

          {SECCIONES.map((s) => {
            const deSeccion = campos.filter((c) => c.seccion === s.id);
            if (!deSeccion.length) return null;
            const Icono = s.icono;
            const casillas = deSeccion.filter((c) => c.tipo === 'casilla');
            const resto = deSeccion.filter((c) => c.tipo !== 'casilla');

            if (s.id === 'cronograma') {
              return (
                <section key={s.id} className="rounded-2xl border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setVerCronograma((x) => !x)}
                    aria-expanded={verCronograma}
                    className="w-full flex items-center gap-2 px-4 py-3 text-left"
                  >
                    <Icono className="h-4 w-4 text-[#0F4C3A]" />
                    <span className="text-sm font-bold text-slate-800">{s.titulo}</span>
                    <span className="text-[11px] text-slate-400">{llenasCronograma} de {fechasCronograma.length} fechas</span>
                    <ChevronDown className={`ml-auto h-4 w-4 text-slate-400 transition-transform ${verCronograma ? 'rotate-180' : ''}`} />
                  </button>
                  {verCronograma && (
                    <div className="border-t border-slate-100 px-4 py-4 space-y-3">
                      <p className="text-[11px] text-slate-500">{s.ayuda}</p>
                      {FASES.map((f, i) => {
                        const deFase = resto.filter((c) => c.fase === i);
                        if (!deFase.length) return null;
                        return (
                          <div key={f.estatus} className="grid grid-cols-1 sm:grid-cols-[minmax(0,12rem)_1fr_1fr] gap-x-3 gap-y-2 items-start">
                            <p className="text-xs font-bold text-slate-700 sm:pt-7">{i + 1}. {f.estatus}</p>
                            {deFase.map(fila)}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            }

            return (
              <section key={s.id}>
                <h4 className="flex items-center gap-2 text-sm font-bold text-slate-800 mb-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-[#0F4C3A]"><Icono className="h-4 w-4" /></span>
                  {s.titulo}
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {resto.map(fila)}
                  {casillas.length > 0 && (
                    <fieldset className="sm:col-span-2">
                      <legend className={etiquetaCls}>Requisitos para liberar pago</legend>
                      <div className="flex flex-wrap gap-2">
                        {casillas.map((c) => (
                          <label key={c.col} className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-semibold cursor-pointer transition-colors ${valores[c.col] ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'bg-white border-slate-200 text-slate-600'}`}>
                            <input type="checkbox" checked={valores[c.col] === true} onChange={(e) => poner(c.col, e.target.checked)} className="accent-[#0F4C3A] h-4 w-4" />
                            {c.etiqueta}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  )}
                </div>
              </section>
            );
          })}
        </div>

        <div className="flex-shrink-0 border-t border-slate-100 bg-slate-50/80 px-5 sm:px-6 py-3 flex flex-col-reverse sm:flex-row sm:items-center gap-2 sm:justify-end">
          {errorGeneral && (
            <p role="alert" className="sm:mr-auto flex items-start gap-1.5 text-sm font-medium text-red-600">
              <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" /> {errorGeneral}
            </p>
          )}
          <button type="button" onClick={cerrar} className="px-3 py-2.5 text-sm font-semibold text-slate-500 hover:text-slate-700">Cancelar</button>
          <button type="submit" disabled={guardando} className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#0F4C3A] text-white text-sm font-bold hover:bg-[#0d3f30] disabled:opacity-60 shadow-md shadow-[#0F4C3A]/20">
            {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {guardando ? 'Guardando…' : modo === 'nuevo' ? `Agregar ${tipo === 'Adquisición' ? 'adquisición' : 'servicio'}` : 'Guardar cambios'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default FormularioServicio2027;
