import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  MessageCircleQuestion, X, RotateCcw, SendHorizontal, ChevronRight, ArrowLeft, House, LogOut, ArrowUpRight,
  Lightbulb, MapPin, KeyRound, Inbox, FileSpreadsheet, LayoutDashboard, Network, GanttChartSquare, Wallet,
  ClipboardCheck, ShieldCheck, Search,
} from 'lucide-react';
import type { User } from '../types';
import {
  temasPara, temaDeVista, nombreVista, destinoPara, buscarPreguntas, elegirPorNumero,
  type TemaVisible, type PreguntaVisible,
} from '../utils/ayuda';

// Asistente de ayuda: una guía en forma de chat para resolver "¿cómo hago…?"
// sin salir de la pantalla. Funciona como el chatbot de atención del AIFA
// —temas numerados → preguntas → respuesta paso a paso, con Regresar, Menú
// principal y Salir— y además busca por lo que la persona escriba y la lleva
// a la pantalla de la respuesta. El contenido vive en utils/ayuda.ts.

interface Props {
  user: User;
  /** La pantalla abierta ("2026.pagos", "auditoria", "historial"…), para marcar su tema. */
  vistaActual: string | null;
  /** Abre una pantalla del tablero. detalle elige la pestaña de adentro. */
  onIr: (vista: string, detalle?: string) => void;
}

type Mensaje =
  | { id: number; de: 'bot'; texto: string }
  | { id: number; de: 'persona'; texto: string }
  | { id: number; de: 'respuesta'; preguntaId: string };

type MensajeNuevo = { de: 'bot'; texto: string } | { de: 'respuesta'; preguntaId: string };

/** Lo que se puede tocar debajo del último mensaje. */
type Opciones =
  | { tipo: 'menu' }
  | { tipo: 'tema'; temaId: string }
  | { tipo: 'respuesta'; preguntaId: string; yaFue?: boolean }
  | { tipo: 'busqueda'; ids: string[] };

const ASPECTO_TEMA: Record<string, { icono: React.ElementType; color: string }> = {
  cuenta: { icono: KeyRound, color: '#0F4C3A' },
  mis: { icono: Inbox, color: '#059669' },
  estatus: { icono: FileSpreadsheet, color: '#0369A1' },
  resumen: { icono: LayoutDashboard, color: '#4F46E5' },
  organigrama: { icono: Network, color: '#7C3AED' },
  gantt: { icono: GanttChartSquare, color: '#1B3A5E' },
  pagos: { icono: Wallet, color: '#B38E5D' },
  auditoria: { icono: ClipboardCheck, color: '#0891B2' },
  admin: { icono: ShieldCheck, color: '#B45309' },
};
const ASPECTO_OTRO = { icono: MessageCircleQuestion, color: '#0F4C3A' };

const CLAVE_INVITACION = 'aifa-ayuda-invitacion-vista';
const PAUSA_ESCRIBIENDO = 450;

const sinMovimiento = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const conMouse = () => typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: fine)').matches;
const pantallaChica = () => typeof window !== 'undefined' && !!window.matchMedia?.('(max-width: 639px)').matches;

/** Texto con **negritas**. React escapa lo demás, así que lo que escriba la persona no se interpreta. */
const Rico: React.FC<{ texto: string }> = ({ texto }) => (
  <>
    {texto.split(/(\*\*[^*]+\*\*)/g).map((parte, i) =>
      parte.length > 4 && parte.startsWith('**') && parte.endsWith('**')
        ? <strong key={i} className="font-semibold text-slate-800">{parte.slice(2, -2)}</strong>
        : <React.Fragment key={i}>{parte}</React.Fragment>,
    )}
  </>
);

const Avatar: React.FC = () => (
  <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full shadow-sm ring-2 ring-white" style={{ background: 'linear-gradient(135deg, #0D2B1E, #0F4C3A)' }} aria-hidden="true">
    <img src="/images/aifa-logo.png" alt="" className="h-4 w-auto brightness-200" />
  </span>
);

const AsistenteAyuda: React.FC<Props> = ({ user, vistaActual, onIr }) => {
  const temas = useMemo(
    () => temasPara(user),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user.role, user.isSuperAdmin, user.areaAuditoria, user.modulos],
  );
  const preguntaPorId = useMemo(() => new Map(temas.flatMap((t) => t.preguntas.map((q) => [q.id, q] as const))), [temas]);
  const temaPorId = useMemo(() => new Map(temas.map((t) => [t.id, t] as const)), [temas]);
  const temaActual = temaDeVista(temas, vistaActual);

  const [abierto, setAbierto] = useState(false);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [opciones, setOpciones] = useState<Opciones | null>(null);
  const [escribiendo, setEscribiendo] = useState(false);
  const [texto, setTexto] = useState('');
  const [invitacion, setInvitacion] = useState(false);

  const idRef = useRef(0);
  const timers = useRef<number[]>([]);
  const listaRef = useRef<HTMLDivElement>(null);
  const entradaRef = useRef<HTMLInputElement>(null);
  const botonRef = useRef<HTMLButtonElement>(null);

  const programar = (fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)); };
  const limpiarTimers = () => { timers.current.forEach((t) => window.clearTimeout(t)); timers.current = []; };
  useEffect(() => limpiarTimers, []);

  // Una sola vez por navegador, un globo junto al botón para que se sepa que existe.
  useEffect(() => {
    let vista = false;
    try { vista = localStorage.getItem(CLAVE_INVITACION) === '1'; } catch { /* sin almacenamiento: se muestra igual */ }
    if (vista) return;
    const mostrar = window.setTimeout(() => {
      setInvitacion(true);
      try { localStorage.setItem(CLAVE_INVITACION, '1'); } catch { /* nada */ }
    }, 2500);
    const ocultar = window.setTimeout(() => setInvitacion(false), 14000);
    return () => { window.clearTimeout(mostrar); window.clearTimeout(ocultar); };
  }, []);

  const hablar = (t: string) => setMensajes((prev) => [...prev, { id: ++idRef.current, de: 'persona', texto: t }]);

  /** El bot "escribe" un momento y contesta; luego aparecen las opciones. */
  const decir = useCallback((nuevos: MensajeNuevo[], siguiente: Opciones | null, despues?: () => void) => {
    setOpciones(null);
    setEscribiendo(true);
    programar(() => {
      setEscribiendo(false);
      setMensajes((prev) => [...prev, ...nuevos.map((m) => ({ ...m, id: ++idRef.current }) as Mensaje)]);
      setOpciones(siguiente);
      if (conMouse()) entradaRef.current?.focus({ preventScroll: true });
      despues?.();
    }, sinMovimiento() ? 0 : PAUSA_ESCRIBIENDO);
  }, []);

  const iniciar = () => {
    limpiarTimers();
    setMensajes([]);
    const nombre = user.name.trim().split(/\s+/)[0] || '';
    const saludo: MensajeNuevo[] = [
      { de: 'bot', texto: `¡Hola${nombre ? `, ${nombre}` : ''}! 👋 Soy tu guía de **AIFA Contratos**.` },
      { de: 'bot', texto: '¿En qué te puedo ayudar hoy? Elige un tema o escribe tu duda abajo. 😊' },
    ];
    if (temaActual && vistaActual) {
      saludo.push({ de: 'bot', texto: `Veo que estás en **${nombreVista(vistaActual)}**: te marqué el tema de esta pantalla.` });
    }
    decir(saludo, { tipo: 'menu' });
  };

  const abrir = () => {
    setInvitacion(false);
    setAbierto(true);
    if (!mensajes.length && !escribiendo) iniciar();
    else if (conMouse()) window.setTimeout(() => entradaRef.current?.focus({ preventScroll: true }), 0);
  };

  const cerrar = () => {
    setAbierto(false);
    botonRef.current?.focus();
  };

  const elegirTema = (t: TemaVisible, comoTexto?: string) => {
    hablar(comoTexto ?? `${t.numero}. ${t.titulo}`);
    decir([{ de: 'bot', texto: `Estas son las dudas más comunes sobre **${t.titulo}**. ¿Cuál se parece a la tuya?` }], { tipo: 'tema', temaId: t.id });
  };

  const elegirPregunta = (q: PreguntaVisible, comoTexto?: string) => {
    hablar(comoTexto ?? `${q.numero} ${q.pregunta}`);
    decir([{ de: 'respuesta', preguntaId: q.id }], { tipo: 'respuesta', preguntaId: q.id });
  };

  const menu = (comoTexto = 'Ir al menú principal') => {
    hablar(comoTexto);
    decir([{ de: 'bot', texto: '¿En qué más te puedo ayudar? Elige un tema:' }], { tipo: 'menu' });
  };

  const regresar = () => {
    if (opciones?.tipo === 'respuesta') {
      const tema = temaPorId.get(preguntaPorId.get(opciones.preguntaId)?.temaId ?? '');
      if (tema) {
        hablar('Regresar');
        decir([{ de: 'bot', texto: `Claro. Estas son las preguntas de **${tema.titulo}**:` }], { tipo: 'tema', temaId: tema.id });
        return;
      }
    }
    menu('Regresar');
  };

  const salir = () => {
    hablar('Salir');
    decir([{ de: 'bot', texto: '¡Gracias por usar la guía! Cuando tengas otra duda, aquí estaré. 👋' }], null, () => {
      programar(() => {
        setAbierto(false);
        setMensajes([]);
        setOpciones(null);
      }, sinMovimiento() ? 600 : 1400);
    });
  };

  const ir = (q: PreguntaVisible) => {
    const destino = destinoPara(user, q.ir);
    if (!destino || !q.ir) return;
    onIr(destino, q.ir.detalle);
    hablar(q.ir.etiqueta);
    decir(
      [{ de: 'bot', texto: `Listo, ya estás en **${nombreVista(destino)}**. Sigue los pasos de arriba; si te atoras, aquí sigo. 👍` }],
      { tipo: 'respuesta', preguntaId: q.id, yaFue: true },
    );
    // En el celular el chat tapa la pantalla: se cierra para que se vea a dónde llegó.
    if (pantallaChica()) setAbierto(false);
  };

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    const consulta = texto.trim();
    if (!consulta || escribiendo) return;
    setTexto('');
    const porNumero = elegirPorNumero(temas, consulta);
    if (porNumero?.pregunta) { elegirPregunta(porNumero.pregunta, consulta); return; }
    if (porNumero) { elegirTema(porNumero.tema, consulta); return; }
    hablar(consulta);
    const hallazgos = buscarPreguntas(temas, consulta);
    if (hallazgos.length) {
      decir(
        [{ de: 'bot', texto: hallazgos.length === 1 ? 'Encontré esta respuesta:' : `Encontré ${hallazgos.length} respuestas que pueden servirte:` }],
        { tipo: 'busqueda', ids: hallazgos.map((q) => q.id) },
      );
    } else {
      decir(
        [{ de: 'bot', texto: `No encontré nada sobre «${consulta}». 🤔 Prueba con otras palabras —por ejemplo **contraseña**, **fase**, **pagos** o **Excel**— o elige un tema:` }],
        { tipo: 'menu' },
      );
    }
  };

  // Al contestar, la vista arranca en lo último que eligió la persona: se lee
  // su elección, la respuesta y el principio de las opciones aunque sean
  // largas. Mientras el bot escribe, hasta abajo para ver los puntitos.
  useEffect(() => {
    const lista = listaRef.current;
    if (!lista || !abierto) return;
    const comportamiento: ScrollBehavior = sinMovimiento() ? 'auto' : 'smooth';
    if (escribiendo) { lista.scrollTo({ top: lista.scrollHeight, behavior: comportamiento }); return; }
    const eleccion = [...mensajes].reverse().find((m) => m.de === 'persona');
    const el = eleccion ? lista.querySelector<HTMLElement>(`[data-msg="${eleccion.id}"]`) : null;
    lista.scrollTo({ top: el ? el.offsetTop - 12 : 0, behavior: comportamiento });
  }, [mensajes, opciones, escribiendo, abierto]);

  // ── Piezas ──────────────────────────────────────────────────────────────

  const botonOpcion = 'group flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left shadow-sm transition-all hover:-translate-y-px hover:border-[#0F4C3A]/40 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F4C3A]/40 motion-reduce:transform-none';
  const botonAccion = 'flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2 py-2.5 text-[12px] font-semibold leading-tight text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F4C3A]/40';

  const filaPregunta = (q: PreguntaVisible, conTema = false) => (
    <button key={q.id} type="button" onClick={() => elegirPregunta(q)} className={`${botonOpcion} items-start`}>
      <span className="mt-px flex-shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-black tabular-nums text-slate-500 transition-colors group-hover:bg-[#0F4C3A] group-hover:text-white">
        {q.numero}
      </span>
      <span className="min-w-0 flex-1">
        {conTema && <span className="block text-[10px] font-bold uppercase tracking-wider text-[#B38E5D]">{temaPorId.get(q.temaId)?.titulo}</span>}
        <span className="block text-[13px] font-semibold leading-snug text-slate-700 group-hover:text-slate-900">{q.pregunta}</span>
      </span>
      <ChevronRight className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-[#0F4C3A]" />
    </button>
  );

  const renderRespuesta = (m: Extract<Mensaje, { de: 'respuesta' }>) => {
    const q = preguntaPorId.get(m.preguntaId);
    if (!q) return null;
    const tema = temaPorId.get(q.temaId);
    const aspecto = ASPECTO_TEMA[q.temaId] ?? ASPECTO_OTRO;
    return (
      <div key={m.id} data-msg={m.id} className="ayuda-msg flex items-start gap-2">
        <Avatar />
        <article className="min-w-0 flex-1 overflow-hidden rounded-2xl rounded-tl-md bg-white shadow-sm ring-1 ring-slate-200/80">
          <header className="flex items-start gap-2.5 border-b border-slate-100 px-3.5 py-3" style={{ background: `linear-gradient(90deg, ${aspecto.color}12, transparent 80%)` }}>
            <span className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-white shadow-sm" style={{ backgroundColor: aspecto.color }}>
              <aspecto.icono className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.14em]" style={{ color: aspecto.color }}>{q.numero} · {tema?.titulo}</p>
              <h3 className="mt-0.5 text-[13.5px] font-bold leading-snug text-slate-800">{q.pregunta}</h3>
            </div>
          </header>
          <div className="space-y-3 px-3.5 py-3 text-[13px] leading-relaxed text-slate-600">
            <p><Rico texto={q.resumen} /></p>
            {q.pasos && (
              <ol className="space-y-2">
                {q.pasos.map((paso, i) => (
                  <li key={i} className="flex gap-2.5">
                    <span className="mt-px flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-[#0F4C3A] text-[10px] font-black text-white">{i + 1}</span>
                    <span className="min-w-0"><Rico texto={paso} /></span>
                  </li>
                ))}
              </ol>
            )}
            {q.puntos && (
              <ul className="space-y-1.5">
                {q.puntos.map((punto, i) => (
                  <li key={i} className="flex gap-2.5">
                    <span className="mt-[7px] h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[#B38E5D]" />
                    <span className="min-w-0"><Rico texto={punto} /></span>
                  </li>
                ))}
              </ul>
            )}
            {q.tip && (
              <div className="flex gap-2 rounded-xl border border-amber-200/80 bg-amber-50/80 px-3 py-2 text-[12px] leading-relaxed text-amber-900">
                <Lightbulb className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-500" />
                <span className="min-w-0"><Rico texto={q.tip} /></span>
              </div>
            )}
          </div>
        </article>
      </div>
    );
  };

  const renderOpciones = () => {
    if (!opciones) return null;

    if (opciones.tipo === 'menu') {
      return (
        <div className="ayuda-msg space-y-1.5 pl-10">
          {temas.map((t) => {
            const aspecto = ASPECTO_TEMA[t.id] ?? ASPECTO_OTRO;
            const aqui = temaActual?.id === t.id;
            return (
              <button key={t.id} type="button" onClick={() => elegirTema(t)} className={`${botonOpcion} ${aqui ? 'border-[#B38E5D]/60 ring-1 ring-[#B38E5D]/30' : ''}`}>
                <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-white shadow-sm transition-transform group-hover:scale-105 motion-reduce:transform-none" style={{ backgroundColor: aspecto.color }}>
                  <aspecto.icono className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-bold leading-tight text-slate-800">{t.numero}. {t.titulo}</span>
                  <span className="mt-0.5 block truncate text-[11px] text-slate-500">{t.descripcion}</span>
                </span>
                {aqui && (
                  <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold text-[#8a6a3f]" style={{ backgroundColor: 'rgba(179,142,93,0.14)' }}>
                    <MapPin className="h-3 w-3" /> Aquí
                  </span>
                )}
                <ChevronRight className="h-4 w-4 flex-shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-[#0F4C3A]" />
              </button>
            );
          })}
        </div>
      );
    }

    if (opciones.tipo === 'tema' || opciones.tipo === 'busqueda') {
      const lista = opciones.tipo === 'tema'
        ? temaPorId.get(opciones.temaId)?.preguntas ?? []
        : opciones.ids.map((id) => preguntaPorId.get(id)).filter((q): q is PreguntaVisible => !!q);
      return (
        <div className="ayuda-msg space-y-1.5 pl-10">
          {lista.map((q) => filaPregunta(q, opciones.tipo === 'busqueda'))}
          <div className="grid grid-cols-2 gap-1.5 pt-1">
            <button type="button" onClick={opciones.tipo === 'tema' ? regresar : () => menu()} className={botonAccion}>
              {opciones.tipo === 'tema' ? <><ArrowLeft className="h-3.5 w-3.5" /> Regresar</> : <><House className="h-3.5 w-3.5" /> Menú principal</>}
            </button>
            <button type="button" onClick={salir} className={botonAccion}><LogOut className="h-3.5 w-3.5" /> Salir</button>
          </div>
        </div>
      );
    }

    const q = preguntaPorId.get(opciones.preguntaId);
    const destino = q ? destinoPara(user, q.ir) : null;
    const yaAqui = !!destino && destino === vistaActual && !q?.ir?.detalle;
    return (
      <div className="ayuda-msg space-y-1.5 pl-10">
        {q?.ir && destino && !opciones.yaFue && (yaAqui ? (
          <p className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-[#0F4C3A]/30 bg-emerald-50/60 px-3 py-2.5 text-[12px] font-semibold text-[#0F4C3A]">
            <MapPin className="h-3.5 w-3.5" /> Ya estás en esta pantalla
          </p>
        ) : (
          <button
            type="button"
            onClick={() => ir(q)}
            className="group flex w-full items-center justify-center gap-2 rounded-xl px-3 py-3 text-[13px] font-bold text-white shadow-md shadow-[#0F4C3A]/25 transition-all hover:-translate-y-px hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B38E5D] motion-reduce:transform-none"
            style={{ background: 'linear-gradient(120deg, #0F4C3A 0%, #14664F 60%, #1B3A5E 100%)' }}
          >
            {q.ir.etiqueta}
            <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 motion-reduce:transform-none" />
          </button>
        ))}
        <div className="grid grid-cols-3 gap-1.5">
          <button type="button" onClick={regresar} className={botonAccion}><ArrowLeft className="h-3.5 w-3.5 flex-shrink-0" /> Regresar</button>
          <button type="button" onClick={() => menu()} className={botonAccion}><House className="h-3.5 w-3.5 flex-shrink-0" /> Menú</button>
          <button type="button" onClick={salir} className={botonAccion}><LogOut className="h-3.5 w-3.5 flex-shrink-0" /> Salir</button>
        </div>
      </div>
    );
  };

  return (
    <div className="print:hidden">
      {/* Invitación (una vez por navegador) */}
      {invitacion && !abierto && (
        <div className="ayuda-msg fixed bottom-[5.5rem] right-5 z-[9001] flex max-w-[260px] items-start gap-2.5 rounded-2xl rounded-br-md bg-white p-3.5 pr-8 shadow-xl ring-1 ring-slate-200" role="status">
          <Avatar />
          <button type="button" onClick={abrir} className="text-left">
            <span className="block text-[13px] font-bold text-slate-800">¿Tienes dudas?</span>
            <span className="block text-[12px] leading-snug text-slate-500">Te explico paso a paso cómo hacer cualquier cosa en el sistema.</span>
          </button>
          <button type="button" onClick={() => setInvitacion(false)} aria-label="Cerrar invitación" className="absolute right-2 top-2 rounded-md p-1 text-slate-300 hover:bg-slate-100 hover:text-slate-500">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Botón flotante */}
      <button
        ref={botonRef}
        type="button"
        onClick={abierto ? cerrar : abrir}
        aria-expanded={abierto}
        aria-controls="asistente-ayuda"
        aria-label={abierto ? 'Cerrar el asistente de ayuda' : 'Abrir el asistente de ayuda'}
        title={abierto ? 'Cerrar la ayuda' : '¿Necesitas ayuda?'}
        className="group fixed bottom-5 right-5 z-[9001] flex h-14 w-14 items-center justify-center rounded-full text-white shadow-[0_12px_28px_-6px_rgba(13,43,30,0.55)] ring-[3px] ring-[#B38E5D]/70 transition-transform hover:scale-105 active:scale-95 focus:outline-none focus-visible:ring-[#B38E5D] motion-reduce:transform-none"
        style={{ background: 'linear-gradient(135deg, #0F4C3A 0%, #14664F 50%, #1B3A5E 100%)' }}
      >
        {invitacion && !abierto && <span className="absolute inset-0 rounded-full bg-[#B38E5D]/40 animate-ping motion-reduce:hidden" aria-hidden="true" />}
        <span className={`relative transition-transform duration-300 motion-reduce:transition-none ${abierto ? 'rotate-90' : ''}`}>
          {abierto ? <X className="h-6 w-6" /> : <MessageCircleQuestion className="h-7 w-7" />}
        </span>
      </button>

      {/* Ventana del chat */}
      {abierto && (
        <section
          id="asistente-ayuda"
          role="dialog"
          aria-label="Asistente de ayuda"
          onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); cerrar(); } }}
          className="ayuda-panel fixed bottom-[5.25rem] left-3 right-3 top-3 z-[9001] flex flex-col overflow-hidden rounded-3xl bg-white shadow-[0_28px_70px_-15px_rgba(13,43,30,0.5)] ring-1 ring-black/5 sm:left-auto sm:right-5 sm:top-auto sm:bottom-[5.5rem] sm:h-[min(640px,calc(100vh-7.5rem))] sm:w-[400px]"
        >
          {/* Encabezado */}
          <header className="relative flex flex-shrink-0 items-center gap-3 overflow-hidden px-4 py-3.5 text-white" style={{ background: 'linear-gradient(120deg, #0D2B1E 0%, #0F4C3A 55%, #1B3A5E 100%)' }}>
            <span className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-white/5" />
            <span className="pointer-events-none absolute -bottom-12 right-16 h-24 w-24 rounded-full" style={{ backgroundColor: 'rgba(179,142,93,0.15)' }} />
            <span className="relative flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
              <img src="/images/aifa-logo.png" alt="" className="h-6 w-auto brightness-200" />
              <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-400 ring-2 ring-[#0F4C3A]" />
            </span>
            <div className="relative min-w-0 flex-1">
              <p className="text-[15px] font-bold leading-tight">Asistente de ayuda</p>
              <p className="mt-0.5 text-[11px] text-emerald-100/80">AIFA Contratos · Guía paso a paso</p>
            </div>
            <button type="button" onClick={iniciar} title="Empezar de nuevo" aria-label="Empezar de nuevo" className="relative rounded-lg p-2 text-white/70 transition-colors hover:bg-white/10 hover:text-white">
              <RotateCcw className="h-4 w-4" />
            </button>
            <button type="button" onClick={cerrar} title="Cerrar" aria-label="Cerrar el asistente" className="relative rounded-lg p-2 text-white/70 transition-colors hover:bg-white/10 hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </header>
          <div className="h-[3px] flex-shrink-0" style={{ background: 'linear-gradient(90deg, #B38E5D, #e3c99f, #B38E5D)' }} />

          {/* Conversación */}
          <div ref={listaRef} className="relative flex-1 space-y-3 overflow-y-auto overscroll-contain bg-gradient-to-b from-slate-50 to-white px-3 py-4" aria-live="polite">
            {mensajes.map((m) => {
              if (m.de === 'respuesta') return renderRespuesta(m);
              if (m.de === 'persona') {
                return (
                  <div key={m.id} data-msg={m.id} className="ayuda-msg flex justify-end pl-10">
                    <p className="rounded-2xl rounded-br-md px-3.5 py-2.5 text-[13px] font-semibold leading-snug text-white shadow-sm" style={{ background: 'linear-gradient(135deg, #0F4C3A, #14664F)' }}>
                      {m.texto}
                    </p>
                  </div>
                );
              }
              return (
                <div key={m.id} data-msg={m.id} className="ayuda-msg flex items-end gap-2 pr-6">
                  <Avatar />
                  <p className="rounded-2xl rounded-bl-md bg-white px-3.5 py-2.5 text-[13px] leading-relaxed text-slate-700 shadow-sm ring-1 ring-slate-200/80">
                    <Rico texto={m.texto} />
                  </p>
                </div>
              );
            })}

            {escribiendo && (
              <div className="ayuda-msg flex items-end gap-2" aria-label="El asistente está escribiendo">
                <Avatar />
                <span className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-white px-4 py-3.5 shadow-sm ring-1 ring-slate-200/80">
                  <span className="ayuda-punto" /><span className="ayuda-punto" /><span className="ayuda-punto" />
                </span>
              </div>
            )}

            {!escribiendo && renderOpciones()}
          </div>

          {/* Escribir */}
          <form onSubmit={enviar} className="flex flex-shrink-0 items-center gap-2 border-t border-slate-100 bg-white px-3 py-3">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                ref={entradaRef}
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder="Escribe tu duda… (ej. contraseña)"
                aria-label="Escribe tu duda"
                maxLength={120}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-[13px] text-slate-800 placeholder:text-slate-400 transition-colors focus:border-[#0F4C3A] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#0F4C3A]/10"
              />
            </div>
            <button
              type="submit"
              disabled={!texto.trim() || escribiendo}
              aria-label="Enviar"
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-white shadow-sm transition-all hover:shadow-md disabled:cursor-not-allowed disabled:opacity-40"
              style={{ background: 'linear-gradient(135deg, #0F4C3A, #1B3A5E)' }}
            >
              <SendHorizontal className="h-4 w-4" />
            </button>
          </form>
        </section>
      )}
    </div>
  );
};

export default AsistenteAyuda;
