// Contenido del asistente de ayuda ("¿cómo hago…?") y la lógica que no
// necesita React: qué temas ve cada persona, cómo se numeran y el buscador.
// Se prueba con scripts/test_ayuda.mjs.
//
// Al agregar o cambiar una pantalla, revisa aquí las respuestas que la
// mencionan: los nombres de botones van **en negritas** y deben decir lo
// mismo que el botón en pantalla.

import { GRUPOS_VISTAS, TODAS_LAS_VISTAS, puedeVer } from './vistas.ts';

/** Quién puede hacer lo que explica la respuesta. Sin requisito: cualquiera. */
export type Requisito = 'captura' | 'admin' | 'superadmin' | 'auditoria';

/** Pestaña de adentro que abre el botón "Llévame…" (la interpreta Dashboard). */
export type DetalleDestino = 'tabla' | 'seguimiento' | 'tablaPagos' | 'resumenPagos' | 'responsables' | 'usuarios' | 'bitacora';

export const DETALLES_DESTINO: readonly DetalleDestino[] = ['tabla', 'seguimiento', 'tablaPagos', 'resumenPagos', 'responsables', 'usuarios', 'bitacora'];

/** Pantallas de administración: no están en utils/vistas.ts, dependen del rol. */
export const VISTAS_ADMIN = ['historial', 'accesos'] as const;

export interface Destino {
  /** Llave de utils/vistas.ts o 'historial' / 'accesos'. Con lista, la primera que la persona pueda abrir. */
  vista: string | string[];
  detalle?: DetalleDestino;
  /** Texto del botón, p. ej. "Ir a Pagos 2026". */
  etiqueta: string;
}

export interface Pregunta {
  id: string;
  pregunta: string;
  /** Una o dos frases que contestan antes de los pasos. */
  resumen: string;
  /** Pasos en orden (lista numerada). */
  pasos?: string[];
  /** Datos sueltos (lista con viñetas). */
  puntos?: string[];
  tip?: string;
  ir?: Destino;
  requiere?: Requisito;
  /** Se muestra sólo si la persona puede abrir alguna de estas pantallas. */
  vistas?: string[];
  /** Palabras extra para el buscador (sinónimos, cómo lo diría la gente). */
  claves?: string;
}

export interface Tema {
  id: string;
  titulo: string;
  descripcion: string;
  requiere?: Requisito;
  /** Pantallas del tema: filtran el tema y lo marcan como "pantalla actual". */
  vistas?: string[];
  preguntas: Pregunta[];
}

// ── Contenido ───────────────────────────────────────────────────────────────

const ESTATUS = ['2026.estatus', '2027.estatus'];
const RESUMEN = ['2026.resumen', '2027.resumen'];
const MIS = ['2026.mis', '2027.mis'];
const GANTT = ['2026.gantt', '2027.gantt'];

export const TEMAS: Tema[] = [
  {
    id: 'cuenta',
    titulo: 'Primeros pasos y tu cuenta',
    descripcion: 'Menú, contraseña, sesión y permisos',
    preguntas: [
      {
        id: 'cuenta.menu',
        pregunta: '¿Cómo me muevo por el sistema?',
        resumen: 'Todo se abre desde el menú lateral izquierdo, ordenado por año y por módulo.',
        pasos: [
          'El menú tiene los grupos **2025** (Histórico), **2026** (Activo), **2027** (Anteproyecto), **Reportes** y **Auditoría**. Si eres administrador, abajo aparece **Administración**.',
          'Haz clic en el nombre de un grupo para desplegar u ocultar sus pantallas.',
          'El botón **☰** de la barra superior muestra u oculta el menú para ganar espacio.',
          'La barra **Agenda 2026**, debajo del encabezado, muestra los eventos de **HOY** y **MAÑANA**; tócalos para abrir el calendario.',
        ],
        tip: 'Sólo ves los módulos que un administrador te asignó. Si te falta alguno, revisa la pregunta "No veo un módulo".',
        claves: 'navegar menu lateral inicio pantallas modulos donde esta agenda barra',
      },
      {
        id: 'cuenta.anios',
        pregunta: '¿Qué diferencia hay entre 2025, 2026 y 2027?',
        resumen: 'Cada año del menú es un ejercicio distinto, con sus propios servicios y su propia plantilla.',
        puntos: [
          '**2025 · Histórico:** consulta del ejercicio anterior: Resumen, Estatus servicios (Tablero, Seguimiento y Tabla) y Gestión Contratos (Pagos, Facturas y Procedimientos).',
          '**2026 · Activo:** el año en curso: Mis servicios, Resumen, Estatus servicios, Pagos 2026 y Diagrama Gantt.',
          '**2027 · Anteproyecto:** los servicios que se preparan para el siguiente año. Aún no tiene Pagos porque ninguno está adjudicado.',
        ],
        claves: 'año anio ejercicio historico activo anteproyecto cambiar de año 2025 2026 2027',
      },
      {
        id: 'cuenta.recuperar',
        pregunta: 'Olvidé mi contraseña, ¿cómo la recupero?',
        resumen: 'Puedes recuperarla tú mismo desde la pantalla de acceso, sin pedírsela a nadie.',
        pasos: [
          'En la pantalla de acceso escribe tu correo en el campo **Correo**.',
          'Pulsa **¿Olvidaste tu contraseña?**. Te llegará un correo con un enlace.',
          'Abre el enlace desde ese correo y escribe tu contraseña nueva dos veces (mínimo 6 caracteres y distinta de la anterior).',
          'Al guardar regresas a la pantalla de acceso: entra con tu contraseña nueva.',
        ],
        tip: 'Si aparece **Este enlace ya no sirve**, caducó o ya se usó: pide uno nuevo. Si dice **Demasiados intentos**, espera unos minutos.',
        claves: 'olvide olvidé contraseña password clave recuperar restablecer no puedo entrar acceso correo enlace',
      },
      {
        id: 'cuenta.cambiar',
        pregunta: '¿Cómo cambio mi contraseña?',
        resumen: 'Por seguridad, la contraseña se cambia con un enlace que llega a tu correo.',
        pasos: [
          'Cierra sesión con **Cerrar Sesión** (abajo del menú lateral).',
          'En la pantalla de acceso escribe tu correo y pulsa **¿Olvidaste tu contraseña?**.',
          'Abre el enlace del correo y define tu contraseña nueva.',
        ],
        tip: 'Un administrador también puede enviarte ese enlace desde Accesos → Usuarios con el botón **Enviar enlace**.',
        claves: 'cambiar contraseña password clave nueva actualizar',
      },
      {
        id: 'cuenta.inactividad',
        pregunta: '¿Por qué se cerró mi sesión sola?',
        resumen: 'Por seguridad, la sesión se cierra tras 10 minutos sin actividad.',
        pasos: [
          'A los 8 minutos sin mover el mouse ni teclear aparece el aviso **¿Sigues ahí?** con una cuenta regresiva de 2 minutos.',
          'Pulsa **Continuar sesión** para seguir trabajando.',
          'Si no respondes, la sesión se cierra y tendrás que volver a entrar. Lo que ya guardaste no se pierde.',
        ],
        claves: 'sesion cerro sola me saco expiro inactividad tiempo sigues ahi desconecto',
      },
      {
        id: 'cuenta.vistas',
        pregunta: 'No veo un módulo o una pantalla, ¿qué hago?',
        resumen: 'Cada persona ve sólo las pantallas que un administrador le asignó.',
        pasos: [
          'Pide a un administrador que te agregue la vista en **Accesos → Usuarios → Vistas**.',
          'El cambio se aplica en tu siguiente inicio de sesión: cierra sesión y vuelve a entrar.',
        ],
        tip: 'Historial y Accesos son exclusivos del rol Administrador.',
        claves: 'no veo modulo pantalla falta desaparecio acceso vista permiso no aparece',
      },
      {
        id: 'cuenta.roles',
        pregunta: '¿Por qué no puedo editar o no veo el botón "Editar"?',
        resumen: 'Lo que puedes hacer depende del rol que te asignaron:',
        puntos: [
          '**Solo lectura:** consulta tablas, gráficas y reportes, y descarga archivos. No cambia nada.',
          '**Operador:** captura y edita la información, pero no borra registros. Si su cuenta está ligada a un responsable, en Estatus sólo cambia los servicios de esa persona.',
          '**Administrador:** control total: usuarios, bitácora y borrado de registros.',
        ],
        tip: 'Capturar en Auditoría no depende del rol: hay que estar marcado como **Área de Auditoría**. Si necesitas más permisos, pídelo a un administrador.',
        claves: 'no puedo editar boton editar rol permiso operador solo lectura administrador capturar modificar bloqueado',
      },
      {
        id: 'cuenta.instalar',
        pregunta: '¿Cómo instalo el sistema como aplicación?',
        resumen: 'Puedes instalarlo para abrirlo a pantalla completa, con su propio ícono, como cualquier app.',
        pasos: [
          'Si aparece la tarjeta **Instala AIFA Contratos**, pulsa **Instalar ahora**.',
          'En Chrome o Edge también puedes buscar la opción **Instalar** en la barra de direcciones o en el menú del navegador.',
          'En iPhone o iPad, desde Safari: **Compartir → Agregar a inicio**.',
        ],
        claves: 'instalar app aplicacion icono escritorio celular movil pantalla completa acceso directo',
      },
      {
        id: 'cuenta.salir',
        pregunta: '¿Cómo cierro sesión?',
        resumen: 'Pulsa **Cerrar Sesión**, en la parte de abajo del menú lateral.',
        tip: 'Si el menú está oculto, ábrelo con el botón **☰** de la barra superior.',
        claves: 'cerrar sesion salir logout desconectarme',
      },
      {
        id: 'cuenta.soporte',
        pregunta: 'Algo no funciona, ¿a quién acudo?',
        resumen: 'Repórtalo al administrador del sistema con la mayor información posible.',
        pasos: [
          'Toma una captura de pantalla de lo que ves, con el mensaje de error si lo hay.',
          'Anota qué estabas haciendo y en qué pantalla (por ejemplo, "2026 → Pagos 2026, al pulsar Descargar").',
          'Envíalo al administrador del sistema.',
        ],
        tip: 'Muchas veces basta con recargar la página (F5) o cerrar sesión y volver a entrar.',
        claves: 'error falla no funciona problema soporte ayuda contacto contactar reportar bug',
      },
    ],
  },
  {
    id: 'mis',
    titulo: 'Mis servicios',
    descripcion: 'Tu bandeja: avanzar fases y datos del contrato',
    vistas: MIS,
    preguntas: [
      {
        id: 'mis.que',
        pregunta: '¿Qué es "Mis servicios" y cómo lo uso?',
        resumen: 'Es tu bandeja de trabajo: cada tarjeta es un servicio a tu cargo, con la fase en la que va, lo que pide atención y la acción que toca.',
        puntos: [
          'Filtra con **Piden atención**, **En proceso**, **Adjudicados** o **Todos**.',
          'Busca con **Buscar servicio o gerencia**.',
          'La barra de pasos de cada tarjeta muestra en cuál de las 9 fases del proceso va.',
          'Lo que guardas aquí actualiza solo el Resumen, las gráficas y el Diagrama de Gantt.',
        ],
        tip: 'Si tu cuenta no está ligada a un responsable, arriba a la derecha eliges de quién ver la bandeja con **Responsable**.',
        ir: { vista: MIS, etiqueta: 'Ir a Mis servicios' },
        claves: 'bandeja mis servicios tarjetas pendientes trabajo asignados',
      },
      {
        id: 'mis.avanzar',
        pregunta: '¿Cómo avanzo un servicio a la siguiente fase?',
        resumen: 'Desde su tarjeta, con un solo botón: registras cuándo terminó la fase actual y el sistema llena las fechas y el estatus.',
        pasos: [
          'En la tarjeta del servicio pulsa **Avanzar a …** (o **Iniciar proceso** si aún no empieza).',
          'Elige la fecha en que terminó la fase actual. No puede ser una fecha futura.',
          'Si la fase no tenía fecha de inicio, te la pide en **¿Y cuándo empezó?**. Es opcional, pero sin ella el Gantt no dibuja su principio.',
          'Si quieres, escribe una **Nota**: aparecerá como marcador en el Diagrama de Gantt.',
          'Confirma con **Avanzar a …**.',
        ],
        tip: 'Durante 20 segundos verás abajo un aviso con **Deshacer**, por si te equivocaste.',
        requiere: 'captura',
        ir: { vista: MIS, etiqueta: 'Ir a Mis servicios' },
        claves: 'avanzar fase siguiente etapa iniciar proceso mover estatus cambiar fase actualizar avance',
      },
      {
        id: 'mis.fallo',
        pregunta: '¿Cómo registro el fallo y los datos del contrato?',
        resumen: 'Al registrar el fallo el servicio pasa a Adjudicado y el sistema te pide los datos del contrato.',
        pasos: [
          'Cuando el servicio está en **Publicado Compras MX**, su botón dice **Registrar fallo**: elige la fecha del fallo y confirma.',
          'Se abre la ventana **Datos del contrato**.',
          'Captura número de contrato, proveedor, monto máximo, administrador del contrato, vigencia (inicio y término) y firma del contrato.',
          'Palomea los **Requisitos para liberar pago** que ya tengas y guarda.',
        ],
        tip: 'Escribe el número de contrato completo (p. ej. AIFA-C-LPN-DO-SVS-015/2026): así se liga solo con sus pagos. Si te falta algo, complétalo después con **Completar datos del contrato**.',
        requiere: 'captura',
        ir: { vista: MIS, etiqueta: 'Ir a Mis servicios' },
        claves: 'fallo adjudicar adjudicado contrato numero proveedor monto vigencia firma administrador garantias datos del contrato',
      },
      {
        id: 'mis.cancelar',
        pregunta: '¿Cómo cancelo un servicio?',
        resumen: 'La cancelación se hace desde la misma ventana con la que avanzas la fase.',
        pasos: [
          'En la tarjeta pulsa **Avanzar a …** (o **Iniciar proceso**).',
          'Abajo de la ventana pulsa **Cancelar el servicio…**.',
          'Escribe el **Motivo** y confirma con **Sí, cancelar el servicio**.',
        ],
        tip: 'El motivo se guarda como alerta en las notas del servicio. Los cancelados no cuentan en el total del Resumen.',
        requiere: 'captura',
        ir: { vista: MIS, etiqueta: 'Ir a Mis servicios' },
        claves: 'cancelar cancelado baja servicio motivo retirar',
      },
      {
        id: 'mis.deshacer',
        pregunta: 'Me equivoqué al avanzar, ¿cómo lo deshago?',
        resumen: 'Tienes 20 segundos para deshacerlo con un clic; después se corrige en la tabla de Estatus.',
        pasos: [
          'Justo después de guardar aparece abajo un aviso oscuro: pulsa **Deshacer**.',
          'Si ya pasó el tiempo, abre **Estatus servicios → Tabla**, pulsa **Editar** y corrige las fechas y el estatus del servicio.',
        ],
        tip: 'Todos los cambios quedan registrados en el Historial, con quién los hizo y cuándo.',
        requiere: 'captura',
        claves: 'deshacer error equivoque equivocacion regresar revertir corregir fase',
      },
      {
        id: 'mis.alertas',
        pregunta: '¿Qué significan las alertas de las tarjetas?',
        resumen: 'Son avisos automáticos de lo que necesita tu atención:',
        puntos: [
          '**Lleva X días en esta fase (lo normal: Y):** la fase tarda más que el promedio.',
          '**Sin cambios hace X días:** nadie ha movido el servicio en un buen tiempo.',
          '**Vence en X días** o **Vigencia vencida:** revisa la vigencia del contrato.',
          '**Faltan garantías:** no están palomeados los requisitos para liberar pago.',
          '**Faltan datos:** el contrato adjudicado está incompleto.',
          '**Proceso sin iniciar:** todavía no arranca la primera fase.',
        ],
        tip: 'El filtro **Piden atención** junta todos los servicios con alguna alerta.',
        ir: { vista: MIS, etiqueta: 'Ir a Mis servicios' },
        claves: 'alertas avisos atencion vence vencido dias garantias faltan datos amarillo rojo',
      },
      {
        id: 'mis.vacio',
        pregunta: 'No me aparece ningún servicio, ¿por qué?',
        resumen: 'Tu bandeja muestra los servicios en los que apareces como **Responsable**.',
        pasos: [
          'Un administrador u operador te los asigna en **Estatus servicios**, columna **Responsable**.',
          'Cuando te asignen uno, aparecerá en tu bandeja.',
        ],
        tip: 'Si una tarjeta dice **Sólo lectura** con un candado, es de otro responsable: puedes verla pero no cambiarla.',
        claves: 'no aparece ningun servicio vacio sin servicios asignados no tengo bandeja vacia candado solo lectura',
      },
    ],
  },
  {
    id: 'estatus',
    titulo: 'Estatus de servicios',
    descripcion: 'Tabla, captura, filtros y calendario',
    vistas: ESTATUS,
    preguntas: [
      {
        id: 'estatus.buscar',
        pregunta: '¿Cómo busco o filtro un servicio en la tabla?',
        resumen: 'La tabla tiene un buscador general y filtros por columna que se combinan entre sí.',
        pasos: [
          'Escribe en **Filtra por servicio, clave o monto** para buscar en toda la tabla.',
          'Debajo de cada encabezado hay una caja **Buscar...** para buscar sólo en esa columna (Responsable tiene una lista).',
          'El ícono de embudo de cada columna te deja elegir valores exactos.',
          'Si no aparece nada, pulsa **Limpiar los filtros**.',
        ],
        ir: { vista: ESTATUS, detalle: 'tabla', etiqueta: 'Ir a la tabla de Estatus' },
        claves: 'buscar filtrar encontrar servicio tabla columna embudo filtro limpiar',
      },
      {
        id: 'estatus.editar',
        pregunta: '¿Cómo edito la información de un servicio?',
        resumen: 'Activa el modo edición de la tabla; cada cambio se guarda solo.',
        pasos: [
          'En **Estatus servicios → Tabla** pulsa **Editar** (arriba a la derecha).',
          'Textos: haz clic en la celda, escribe y pulsa Enter o haz clic fuera.',
          'Fechas: elige el día en el calendario de la celda. Casillas: palomea o despalomea.',
          '**Estatus**, **Tipo de servicio** y **Responsable** se eligen de una lista.',
          'Al terminar pulsa **Salir de edición**.',
        ],
        tip: 'Para avanzar de fase es más fácil **Mis servicios**: llena por ti las fechas correctas.',
        requiere: 'captura',
        ir: { vista: ESTATUS, detalle: 'tabla', etiqueta: 'Ir a la tabla de Estatus' },
        claves: 'editar modificar cambiar capturar celda dato fecha corregir informacion tabla estatus',
      },
      {
        id: 'estatus.agregar',
        pregunta: '¿Cómo agrego un servicio nuevo?',
        resumen: 'Hay dos caminos, según lo que te sea más cómodo:',
        pasos: [
          'En **Estatus servicios → Tabla** pulsa **Agregar fila**: se crea un renglón nuevo y la tabla queda en modo edición para que llenes sus celdas.',
          'O en **Resumen → Responsables**, abre la tarjeta de la persona y pulsa **Agregar servicio**: queda asignado a ella desde el inicio.',
        ],
        requiere: 'captura',
        ir: { vista: ESTATUS, detalle: 'tabla', etiqueta: 'Ir a la tabla de Estatus' },
        claves: 'agregar nuevo servicio alta fila registro crear añadir',
      },
      {
        id: 'estatus.responsable',
        pregunta: '¿Cómo asigno o cambio el responsable de un servicio?',
        resumen: 'El responsable se elige de una lista con las personas de la plantilla del año.',
        pasos: [
          'En **Estatus servicios → Tabla** pulsa **Editar** y elige el nombre en la columna **Responsable**.',
          'O en **Resumen → Responsables**: abre a la persona y cambia el responsable desde la lista de cada servicio.',
        ],
        tip: 'El servicio aparecerá en la bandeja **Mis servicios** de la persona asignada.',
        requiere: 'captura',
        ir: { vista: ESTATUS, detalle: 'tabla', etiqueta: 'Ir a la tabla de Estatus' },
        claves: 'asignar responsable reasignar cambiar responsable persona encargado',
      },
      {
        id: 'estatus.observaciones',
        pregunta: '¿Cómo escribo observaciones de un servicio?',
        resumen: 'Las observaciones van en la columna morada marcada con 📝; no hace falta activar **Editar**.',
        pasos: [
          'Ubica la columna de observaciones (encabezado morado).',
          'Haz clic en la celda, escribe el texto y pulsa **Guardar**.',
        ],
        tip: 'Las filas con observación se resaltan en amarillo. Si quieres dejar registro con fecha, usa mejor las **Notas del servicio**.',
        requiere: 'captura',
        ir: { vista: ESTATUS, detalle: 'tabla', etiqueta: 'Ir a la tabla de Estatus' },
        claves: 'observaciones incidencias comentario escribir morada texto',
      },
      {
        id: 'estatus.eliminar',
        pregunta: '¿Cómo elimino un servicio de la tabla?',
        resumen: 'Sólo los administradores pueden eliminar registros, y el borrado no se puede deshacer.',
        pasos: [
          'En **Estatus servicios → Tabla** pulsa **Editar**.',
          'Pasa el cursor sobre el número de la fila y pulsa el bote de basura.',
          'Confirma en el mensaje que aparece.',
        ],
        tip: 'Si sólo quieres sacarlo del proceso, mejor cancélalo: así se conserva y deja de contar en el total.',
        requiere: 'admin',
        ir: { vista: ESTATUS, detalle: 'tabla', etiqueta: 'Ir a la tabla de Estatus' },
        claves: 'eliminar borrar quitar fila servicio registro basura',
      },
      {
        id: 'estatus.pago',
        pregunta: '¿Qué significa "servicio pendiente para pago"?',
        resumen: 'Para liberar pagos deben estar palomeadas **Garantía de cumplimiento**, **Póliza de responsabilidad civil** y **Garantía de calidad**.',
        puntos: [
          'El aviso amarillo arriba de la tabla dice cuántos servicios tienen pendientes y cuál requisito les falta.',
          'Dentro de la tabla, las casillas que faltan se marcan en amarillo.',
          'Palomea cada casilla cuando tengas el documento (con **Editar**) o desde **Mis servicios → Datos del contrato**.',
        ],
        ir: { vista: ESTATUS, detalle: 'tabla', etiqueta: 'Ir a la tabla de Estatus' },
        claves: 'pendiente pago liberar garantia cumplimiento poliza responsabilidad civil calidad requisitos amarillo',
      },
      {
        id: 'estatus.calendario',
        pregunta: '¿Cómo uso el calendario de Seguimiento?',
        resumen: 'El calendario muestra como eventos todas las fechas capturadas de cada servicio.',
        pasos: [
          'En **Estatus servicios** cambia a la pestaña **Seguimiento**.',
          'Toca cualquier día para ver sus eventos.',
          'El botón **¿Cómo funciona?** explica qué columnas de fecha lee.',
        ],
        tip: 'La barra **Agenda 2026** de arriba muestra lo de hoy y mañana; **Ver calendario** te trae aquí.',
        ir: { vista: ESTATUS, detalle: 'seguimiento', etiqueta: 'Ir al calendario' },
        claves: 'calendario seguimiento fechas eventos agenda hoy mañana dia',
      },
      {
        id: 'estatus.compacta',
        pregunta: '¿Cómo veo más renglones en pantalla?',
        resumen: 'Usa la **vista compacta**: el botón con flechas hacia adentro, junto a **Editar**.',
        puntos: [
          'Reduce el alto de cada renglón para ver más servicios a la vez.',
          'Vuelve a pulsarlo para regresar a la vista normal.',
          'Las primeras columnas se quedan fijas al desplazarte a la derecha, para no perder de vista el servicio.',
        ],
        ir: { vista: ESTATUS, detalle: 'tabla', etiqueta: 'Ir a la tabla de Estatus' },
        claves: 'compacta mas filas renglones pantalla tamaño espacio ver mas',
      },
    ],
  },
  {
    id: 'resumen',
    titulo: 'Resumen, gráficas y ficha',
    descripcion: 'Indicadores, filtros por periodo y la ficha',
    vistas: RESUMEN,
    preguntas: [
      {
        id: 'resumen.leer',
        pregunta: '¿Cómo leo el Resumen del año?',
        resumen: 'El Resumen junta en una pantalla los indicadores y las gráficas del ejercicio.',
        puntos: [
          'Las tarjetas de arriba cuentan **Total Servicios**, **Adjudicados**, **En Proceso**, **Cancelados** (no incluidos en el total) y **Responsables**.',
          'Haz clic en una tarjeta para ver la lista de esos servicios; regresa con **Volver al resumen**.',
          'Debajo están las gráficas por estatus, subdirección, gerencia y presupuesto.',
        ],
        ir: { vista: RESUMEN, etiqueta: 'Ir al Resumen' },
        claves: 'resumen tablero indicadores kpi tarjetas total adjudicados proceso cancelados',
      },
      {
        id: 'resumen.periodo',
        pregunta: '¿Cómo filtro por trimestre o por mes?',
        resumen: 'Hay dos filtros de periodo:',
        puntos: [
          'Arriba a la derecha, **Todo el año**, **Q1**, **Q2**, **Q3** o **Q4** cambian las tarjetas.',
          'En **Periodo de las gráficas** eliges **Total**, **Mensual** o **Trimestral** y luego el mes o trimestre. Aplica a las gráficas de estatus, gerencia, subdirección y presupuesto.',
        ],
        ir: { vista: RESUMEN, etiqueta: 'Ir al Resumen' },
        claves: 'trimestre mes periodo filtrar q1 q2 q3 q4 mensual trimestral fechas',
      },
      {
        id: 'resumen.grafica',
        pregunta: '¿Cómo veo los servicios detrás de una gráfica?',
        resumen: 'Todas las gráficas se pueden explorar con un clic.',
        pasos: [
          'Toca una barra o una rebanada de la gráfica.',
          'Se abre la lista de esos servicios con su resumen.',
          'Haz clic en un servicio para abrir su ficha.',
        ],
        tip: 'En esa lista puedes buscar por servicio, proveedor, contrato o administrador, y ordenar por **Mayor monto**, **Mayor avance**, **Vence primero** o **Nombre A–Z**.',
        ir: { vista: RESUMEN, etiqueta: 'Ir al Resumen' },
        claves: 'grafica barra clic detalle explorar lista servicios ordenar',
      },
      {
        id: 'resumen.ficha',
        pregunta: '¿Qué información trae la ficha de un servicio?',
        resumen: 'La ficha reúne todo lo importante de un servicio en una sola ventana.',
        puntos: [
          'Arriba, cinco datos clave: **Avance financiero**, **Vigencia**, **Número de contrato**, **Penas y deductivas** y **Administrador**. Haz clic en uno para ir a su detalle.',
          'Más abajo: pagos por mes, requisitos para liberar pago, **Notas del servicio** y el **Proceso de contratación** con su Gantt.',
          'El botón junto al número de contrato lo copia al portapapeles.',
        ],
        tip: 'La ficha se abre desde cualquier lista: haz clic en el nombre del servicio.',
        claves: 'ficha detalle servicio informacion contrato avance financiero vigencia penas deductivas administrador copiar',
      },
    ],
  },
  {
    id: 'organigrama',
    titulo: 'Organigrama y responsables',
    descripcion: 'Plantilla del año, altas, bajas y fotos',
    vistas: RESUMEN,
    preguntas: [
      {
        id: 'organigrama.ver',
        pregunta: '¿Dónde veo el organigrama y los servicios de cada persona?',
        resumen: 'El organigrama vive dentro del Resumen del año, en la tarjeta **Responsables**.',
        pasos: [
          'Abre el **Resumen** del año y pulsa la tarjeta **Responsables** (**Ver por responsable →**).',
          'Haz clic en una persona para ver sus servicios.',
          'Usa **Buscar responsable, servicio o estatus...** para encontrar a alguien.',
        ],
        ir: { vista: RESUMEN, detalle: 'responsables', etiqueta: 'Ir al organigrama' },
        claves: 'organigrama responsables personas plantilla equipo estructura quien',
      },
      {
        id: 'organigrama.agregar',
        pregunta: '¿Cómo agrego a una persona al organigrama?',
        resumen: 'Son cinco pasos y no hace falta saber nada técnico.',
        pasos: [
          'En el organigrama pulsa **Agregar persona** (botón verde, arriba a la derecha).',
          'Escribe sus datos: nombre completo, número de empleado, grado académico, antigüedad, puesto y nivel salarial.',
          'Elige su coordinador en **Depende de** y su equipo en **Color de su coordinación**.',
          'Guarda: ya aparece en su equipo y en el orden que le corresponde.',
          'Asígnale sus servicios desde **Estatus servicios**, columna **Responsable**.',
        ],
        tip: 'Cada año tiene su propia plantilla. Si la persona ya estuvo en otro año, en **Agregar persona** puedes traer su ficha en vez de capturarla de nuevo.',
        requiere: 'captura',
        ir: { vista: RESUMEN, detalle: 'responsables', etiqueta: 'Ir al organigrama' },
        claves: 'agregar persona alta organigrama nuevo empleado plantilla integrante',
      },
      {
        id: 'organigrama.editar',
        pregunta: '¿Cómo edito a alguien o lo cambio de coordinación?',
        resumen: 'Todo se corrige con el lápiz de su tarjeta.',
        pasos: [
          'Pulsa el lápiz de la tarjeta de la persona: se abre el mismo formulario del alta.',
          'Para cambiarla de coordinación, cambia el campo **Depende de**.',
          'Guarda los cambios.',
        ],
        requiere: 'captura',
        ir: { vista: RESUMEN, detalle: 'responsables', etiqueta: 'Ir al organigrama' },
        claves: 'editar persona cambiar puesto coordinacion depende de jefe corregir datos',
      },
      {
        id: 'organigrama.foto',
        pregunta: '¿Cómo subo o cambio una fotografía?',
        resumen: 'La foto se sube desde el mismo formulario de la persona.',
        pasos: [
          'Abre el lápiz de su tarjeta.',
          'Pulsa **Subir foto** (o **Cambiar foto**) y elige la imagen.',
          'Se recorta en cuadro y se reduce sola: puedes usarla tal como salió del celular.',
        ],
        tip: 'Es opcional: sin foto, la tarjeta muestra sus iniciales sobre el color de su equipo.',
        requiere: 'captura',
        ir: { vista: RESUMEN, detalle: 'responsables', etiqueta: 'Ir al organigrama' },
        claves: 'foto fotografia imagen subir cambiar avatar retrato',
      },
      {
        id: 'organigrama.baja',
        pregunta: '¿Cómo doy de baja a alguien del organigrama?',
        resumen: 'Con el bote de basura de su tarjeta. Desaparece del organigrama, pero su historial se conserva.',
        pasos: [
          'Antes, pásale sus servicios a quien los vaya a tomar (columna **Responsable**).',
          'Pulsa el bote de basura de su tarjeta y confirma.',
        ],
        tip: 'La baja sólo vale para el año que estás viendo; los demás años no cambian.',
        requiere: 'captura',
        ir: { vista: RESUMEN, detalle: 'responsables', etiqueta: 'Ir al organigrama' },
        claves: 'baja quitar persona se fue renuncia eliminar organigrama',
      },
      {
        id: 'organigrama.anios',
        pregunta: 'Cambié a alguien en 2026 y no se ve en 2027, ¿es normal?',
        resumen: 'Sí. Cada año tiene su propia plantilla: altas, bajas y cambios sólo valen para el año en el que los hiciste.',
        tip: 'Si la persona también debe estar en el otro año, repite el cambio ahí (o tráela con **Agregar persona**).',
        claves: 'plantilla año diferente no aparece 2027 2026 cambio no se ve',
      },
    ],
  },
  {
    id: 'gantt',
    titulo: 'Notas y Diagrama de Gantt',
    descripcion: 'Bitácora de cada servicio y su línea de tiempo',
    vistas: GANTT,
    preguntas: [
      {
        id: 'gantt.nota',
        pregunta: '¿Cómo agrego una nota a un servicio?',
        resumen: 'Las notas guardan lo que no cabe en una columna, con la fecha a la que se refieren.',
        pasos: [
          'Abre las notas desde **Mis servicios** (botón **Notas**), desde la ficha del servicio o con el ícono de notas en el Diagrama de Gantt.',
          'Elige el tipo: **Nota** (un dato o avance), **Alerta** (algo que frena) o **Acuerdo** (una decisión tomada).',
          'Elige la fecha a la que se refiere y escribe el texto.',
          'Pulsa **Agregar nota**.',
        ],
        tip: 'Cada nota aparece en la ficha del servicio y como marcador en el Gantt, justo en su fecha.',
        requiere: 'captura',
        ir: { vista: GANTT, etiqueta: 'Ir al Diagrama Gantt' },
        claves: 'nota notas agregar escribir alerta acuerdo bitacora comentario apunte',
      },
      {
        id: 'gantt.corregir',
        pregunta: '¿Cómo corrijo o borro una nota?',
        resumen: 'Desde la lista de notas del servicio.',
        pasos: [
          'Pulsa el lápiz (**Corregir**), cambia lo necesario y pulsa **Guardar cambios**.',
          'Para borrarla, pulsa el bote de basura y confirma en **¿Borrarla?**.',
        ],
        tip: 'Sólo quien escribió la nota o un administrador puede cambiarla.',
        requiere: 'captura',
        claves: 'corregir borrar nota editar eliminar nota',
      },
      {
        id: 'gantt.leer',
        pregunta: '¿Cómo leo el Diagrama de Gantt?',
        resumen: 'Cada renglón es un servicio y cada barra una fase de su proceso de contratación.',
        puntos: [
          'El color dice qué dirección tenía la fase: negro, **D.O** (Dirección de Operación); azul, **D.A** (Dirección de Administración).',
          'Los círculos de colores son notas: Nota, Alerta y Acuerdo.',
          'Abajo, **Resumen de días acumulados por dirección** muestra dónde se atoran los procesos.',
          'Haz clic en el nombre de un servicio para abrir su ficha.',
        ],
        ir: { vista: GANTT, etiqueta: 'Ir al Diagrama Gantt' },
        claves: 'gantt diagrama linea de tiempo barras fases direccion operacion administracion dias cuello de botella',
      },
      {
        id: 'gantt.falta',
        pregunta: '¿Por qué un servicio no aparece en el Gantt?',
        resumen: 'El Gantt sólo dibuja los servicios con fechas de inicio y término capturadas en sus fases.',
        pasos: [
          'Avanza el servicio desde **Mis servicios**: cada avance captura las fechas por ti.',
          'O captúralas en **Estatus servicios → Tabla** con **Editar** (columnas de fecha de cada fase).',
        ],
        claves: 'no aparece gantt falta servicio pendiente de datos fechas vacio',
      },
    ],
  },
  {
    id: 'pagos',
    titulo: 'Pagos y reportes',
    descripcion: 'Pagos 2026, descargas y reportes',
    vistas: ['2026.pagos', 'reportes.gastoEfectuado', 'reportes.historicoServicios', 'reportes.paaas', 'reportes.deductivas'],
    preguntas: [
      {
        id: 'pagos.consultar',
        pregunta: '¿Cómo consulto los pagos de un contrato?',
        resumen: 'Todo está en **2026 → Pagos 2026**, con dos pestañas.',
        pasos: [
          'En **Tabla** busca el contrato con **Buscar en pagos...**.',
          'En **Resumen pagos** ves el avance de cada servicio: total pagado, saldo restante y avance global.',
          'Haz clic en un total para ver el desglose por mes.',
        ],
        vistas: ['2026.pagos'],
        ir: { vista: '2026.pagos', detalle: 'tablaPagos', etiqueta: 'Ir a Pagos 2026' },
        claves: 'pagos consultar contrato pagado saldo mensual desglose cuanto se ha pagado',
      },
      {
        id: 'pagos.capturar',
        pregunta: '¿Cómo capturo o corrijo un pago?',
        resumen: 'Igual que en Estatus: activas la edición y cada celda se guarda sola.',
        pasos: [
          'En **Pagos 2026 → Tabla** pulsa **Editar**.',
          'Haz clic en la celda, escribe el importe y pulsa Enter.',
          'Pulsa **Recalcular totales** para actualizar el total de cada mes (Preventivos + Correctivos − Nota de Crédito).',
          'Para un contrato nuevo usa **Agregar fila**.',
        ],
        requiere: 'captura',
        vistas: ['2026.pagos'],
        ir: { vista: '2026.pagos', detalle: 'tablaPagos', etiqueta: 'Ir a Pagos 2026' },
        claves: 'capturar pago registrar importe factura corregir pago recalcular totales nota de credito preventivos correctivos',
      },
      {
        id: 'pagos.descargar',
        pregunta: '¿Cómo descargo el reporte de pagos en Excel, Word o PDF?',
        resumen: 'Con el botón **Descargar** de Pagos 2026. El archivo trae los mismos números que ves en pantalla.',
        pasos: [
          'Elige la pestaña **Tabla** o **Resumen pagos**: el reporte sale de la que tengas abierta.',
          'Pulsa **Descargar** y elige **Excel (.xlsx)**, **Word (.docx)** o **PDF**.',
          'Espera unos segundos: el archivo se descarga con gráficas y un control de calidad de los datos.',
        ],
        tip: 'Si aparece un aviso amarillo, el archivo sí se descargó, pero algún control pide revisión: el detalle está al final del reporte.',
        vistas: ['2026.pagos'],
        ir: { vista: '2026.pagos', detalle: 'resumenPagos', etiqueta: 'Ir a Pagos 2026' },
        claves: 'descargar reporte excel word pdf exportar imprimir archivo xlsx docx bajar',
      },
      {
        id: 'pagos.gasto',
        pregunta: '¿Dónde veo el gasto efectuado y el avance financiero?',
        resumen: 'En **Reportes → Gasto Efectuado 2026**.',
        puntos: [
          'Arriba: monto máximo total, saldo restante y avance global.',
          'En la tabla: el avance mensual y acumulado de cada contrato.',
          'Para un solo contrato, su ficha compara el plazo transcurrido contra el monto ejercido en **Avance financiero**.',
        ],
        vistas: ['reportes.gastoEfectuado'],
        ir: { vista: 'reportes.gastoEfectuado', etiqueta: 'Ir a Gasto Efectuado' },
        claves: 'gasto efectuado avance financiero ejercido presupuesto saldo restante',
      },
      {
        id: 'pagos.paaas',
        pregunta: '¿Dónde consulto el PAAAS?',
        resumen: 'En **Reportes → PAAAS**: el Programa Anual de Adquisiciones, Arrendamientos y Servicios.',
        puntos: [
          'Busca por concepto o clave CUCOP con el buscador de arriba.',
          'Arriba ves los registros importados, partidas independientes, adquisiciones consolidadas y el monto total estimado.',
        ],
        vistas: ['reportes.paaas'],
        ir: { vista: 'reportes.paaas', etiqueta: 'Ir al PAAAS' },
        claves: 'paaas paas programa anual adquisiciones cucop',
      },
      {
        id: 'pagos.historico',
        pregunta: '¿Dónde están los datos de años anteriores?',
        resumen: 'Hay dos lugares para consultar lo histórico:',
        puntos: [
          '**Reportes → Histórico de Servicios:** los pagos mensuales de los contratos de años anteriores.',
          '**2025 (Histórico)** en el menú: Resumen, Estatus servicios y Gestión Contratos (Pagos, Facturas y Procedimientos).',
        ],
        vistas: ['reportes.historicoServicios', '2025.resumen', '2025.estatus', '2025.contratos'],
        ir: { vista: ['reportes.historicoServicios', '2025.resumen'], etiqueta: 'Ir al histórico' },
        claves: 'historico años anteriores 2025 pasado facturas procedimientos gestion contratos',
      },
      {
        id: 'pagos.deductivas',
        pregunta: '¿Dónde veo las penas convencionales y deductivas?',
        resumen: 'En la ficha de cada servicio, sección **Penas convencionales y deductivas**.',
        puntos: [
          'Se calculan con las notas de crédito capturadas en Pagos 2026.',
          'El reporte **Reportes → Deductivas** todavía está en construcción.',
        ],
        claves: 'penas convencionales deductivas nota de credito sancion descuento',
      },
    ],
  },
  {
    id: 'auditoria',
    titulo: 'Auditoría',
    descripcion: 'Control mensual de entregables (C, R, E, N)',
    vistas: ['auditoria'],
    preguntas: [
      {
        id: 'auditoria.letras',
        pregunta: '¿Qué significan las letras C, R, E y N?',
        resumen: 'Cada contrato lleva una letra por mes que dice cómo va su entrega:',
        puntos: [
          '**C · Completo:** la entrega de ese mes está completa.',
          '**R · Revisado:** la entrega de ese mes ya fue revisada.',
          '**E · En revisión:** la entrega de ese mes se está revisando.',
          '**N · No aplica:** ese mes no aplica para el contrato.',
          '**Por registrar** (naranja): el mes ya terminó, el contrato estaba vigente y aún no tiene letra.',
          '**Fuera de vigencia** (rayado): el contrato no estaba vigente ese mes; se puede capturar igual.',
        ],
        tip: 'Una celda vacía en un mes que todavía no termina no es un pendiente: simplemente aún no toca.',
        ir: { vista: 'auditoria', etiqueta: 'Ir a Auditoría' },
        claves: 'letras c r e n completo revisado en revision no aplica significado por registrar fuera de vigencia colores',
      },
      {
        id: 'auditoria.capturar',
        pregunta: '¿Cómo capturo una letra?',
        resumen: 'Se captura como en Excel: eliges la celda y escribes la letra.',
        pasos: [
          'Haz clic en la celda del contrato y el mes: se abre una ventanita con las cuatro letras, quién puso la actual y el historial de la celda.',
          'O, con la celda elegida, escribe **C**, **R**, **E** o **N**: el cursor pasa solo al mes siguiente.',
          '**Supr** borra la letra; las flechas y **Tab** te mueven.',
        ],
        tip: '**Ctrl + Z** deshace la última captura. También aparece **Deshacer** en el aviso de abajo.',
        requiere: 'auditoria',
        ir: { vista: 'auditoria', etiqueta: 'Ir a Auditoría' },
        claves: 'capturar letra celda escribir marcar mes teclado auditoria',
      },
      {
        id: 'auditoria.varias',
        pregunta: '¿Cómo lleno varias celdas o pego desde Excel?',
        resumen: 'Puedes capturar en bloque, igual que en una hoja de cálculo.',
        pasos: [
          'Arrastra sobre la tabla (o usa **Shift** + flechas) y elige la letra en la barra que aparece abajo, o escríbela.',
          'Para pegar, copia un bloque de letras en Excel, elige la celda de inicio y pulsa **Ctrl + V**.',
          'Una sola letra pegada sobre varias celdas elegidas las llena todas.',
        ],
        requiere: 'auditoria',
        ir: { vista: 'auditoria', etiqueta: 'Ir a Auditoría' },
        claves: 'varias celdas bloque pegar copiar excel ctrl v arrastrar seleccionar llenar',
      },
      {
        id: 'auditoria.servicios',
        pregunta: '¿Cómo agrego contratos o traigo los servicios del año?',
        resumen: 'Hay dos botones para armar la lista de contratos del año:',
        pasos: [
          '**Traer servicios del año** (aparece cuando hay pendientes): junta los servicios de Estatus y los contratos de Pagos que aún no están; tú eliges cuáles agregar.',
          '**Agregar servicio**: para un contrato, pedido o servicio que no está en Estatus ni en Pagos. El número de contrato es opcional.',
        ],
        tip: 'El año se elige arriba a la derecha; cada año tiene sus propios contratos y letras.',
        requiere: 'auditoria',
        ir: { vista: 'auditoria', etiqueta: 'Ir a Auditoría' },
        claves: 'agregar contrato servicio traer servicios del año nuevo pedido lista',
      },
      {
        id: 'auditoria.importar',
        pregunta: '¿Cómo importo nuestra hoja de Excel?',
        resumen: 'Puedes subir la misma hoja de control que ya llevan.',
        pasos: [
          'Pulsa **Importar Excel**.',
          'Arrastra el archivo a la ventana o haz clic para elegirlo. Debe tener el encabezado **No. Contrato o Pedido** y los meses.',
          'Revisa lo que va a cambiar y confirma la importación.',
        ],
        tip: 'Las celdas vacías del archivo no borran lo que ya está capturado.',
        requiere: 'auditoria',
        ir: { vista: 'auditoria', etiqueta: 'Ir a Auditoría' },
        claves: 'importar subir excel hoja archivo cargar xlsx',
      },
      {
        id: 'auditoria.descargar',
        pregunta: '¿Cómo descargo el Excel de Auditoría?',
        resumen: 'Con el botón **Excel** (ícono de descarga) de la barra de Auditoría.',
        puntos: [
          'Baja lo que ves en pantalla, con la búsqueda y los filtros aplicados.',
          'Respeta el formato de la hoja original: colores, conteos con fórmula y leyenda.',
        ],
        ir: { vista: 'auditoria', etiqueta: 'Ir a Auditoría' },
        claves: 'descargar exportar excel auditoria bajar archivo',
      },
      {
        id: 'auditoria.permiso',
        pregunta: '¿Por qué no puedo capturar en Auditoría?',
        resumen: 'Sólo el **área de Auditoría** captura. Las demás personas consultan, filtran, revisan el historial de cada celda y descargan el Excel.',
        pasos: [
          'Si te toca capturar, pide a un administrador que te marque como **Área de Auditoría** en Accesos → Usuarios.',
          'Cierra sesión y vuelve a entrar para que se aplique.',
        ],
        tip: 'Dentro del módulo, el botón **?** abre una guía completa de Auditoría.',
        claves: 'no puedo capturar auditoria candado consulta permiso area de auditoria bloqueado',
      },
    ],
  },
  {
    id: 'admin',
    titulo: 'Administración',
    descripcion: 'Usuarios, permisos, historial y bitácora',
    requiere: 'admin',
    preguntas: [
      {
        id: 'admin.alta',
        pregunta: '¿Cómo doy de alta a un usuario?',
        resumen: 'Desde **Accesos → Usuarios**, en cinco pasos.',
        pasos: [
          'Abre **Accesos → Usuarios** (o el ícono de personas junto a tu nombre, arriba a la derecha) y pulsa **Nuevo usuario**.',
          'Escribe su nombre completo y su correo institucional.',
          'Define una contraseña temporal o pulsa **Generar una segura**.',
          'Elige qué podrá hacer (**Solo lectura**, **Operador** o **Administrador**), qué servicios verá y qué módulos.',
          'Pulsa **Crear usuario** y entrégale sus datos de acceso por un medio privado.',
        ],
        tip: 'Da el rol de Administrador sólo a quien de verdad lo necesita: puede crear cuentas y borrar registros.',
        ir: { vista: 'accesos', detalle: 'usuarios', etiqueta: 'Ir a Usuarios' },
        claves: 'alta usuario nuevo crear cuenta registrar persona acceso dar de alta',
      },
      {
        id: 'admin.permisos',
        pregunta: '¿Cómo cambio el rol, los servicios o las vistas de alguien?',
        resumen: 'Todo se ajusta en el renglón de la persona, en **Accesos → Usuarios**.',
        pasos: [
          'Busca a la persona con **Buscar por nombre o correo**.',
          '**Permisos** cambia su rol y **Servicios que ve** la limita a los de un responsable.',
          '**Vistas** abre el panel de módulos: marca los que verá y pulsa **Guardar vistas**.',
        ],
        tip: 'Los cambios se aplican en su próximo inicio de sesión.',
        ir: { vista: 'accesos', detalle: 'usuarios', etiqueta: 'Ir a Usuarios' },
        claves: 'cambiar rol permisos vistas modulos servicios que ve operador administrador solo lectura',
      },
      {
        id: 'admin.auditoria',
        pregunta: '¿Cómo doy permiso de captura en Auditoría?',
        resumen: 'Marcando a la persona como parte del **Área de Auditoría**.',
        pasos: [
          'En **Accesos → Usuarios** abre **Vistas** en el renglón de la persona.',
          'Marca **Área de Auditoría**, o usa **Usuario de Auditoría** (área + sólo Auditoría + Solo lectura).',
          'Pulsa **Guardar vistas**.',
        ],
        tip: 'Para capturar en Auditoría no hace falta ser Operador: con Solo lectura captura ahí y no puede cambiar nada más.',
        ir: { vista: 'accesos', detalle: 'usuarios', etiqueta: 'Ir a Usuarios' },
        claves: 'auditoria permiso captura area de auditoria usuario de auditoria',
      },
      {
        id: 'admin.contrasena',
        pregunta: 'Alguien olvidó su contraseña, ¿cómo le ayudo?',
        resumen: 'Lo más seguro es que la cambie la propia persona.',
        pasos: [
          'En **Accesos → Usuarios** pulsa **Enviar enlace** en su renglón: le llega un correo para definir su contraseña.',
          'Si eres superadmin, también puedes fijarla tú con **Cambiar contraseña**.',
        ],
        ir: { vista: 'accesos', detalle: 'usuarios', etiqueta: 'Ir a Usuarios' },
        claves: 'contraseña olvido usuario restablecer enviar enlace cambiar contraseña de otro password',
      },
      {
        id: 'admin.baja',
        pregunta: '¿Cómo doy de baja o reactivo a un usuario?',
        resumen: 'La baja quita el acceso, pero no borra la cuenta ni su historial.',
        pasos: [
          'En **Accesos → Usuarios** pulsa **Dar de baja** en su renglón y confirma.',
          'Pierde el acceso de inmediato y pasa a la sección **Dados de baja**.',
          'Para devolverle el acceso, pulsa **Reactivar**.',
        ],
        requiere: 'superadmin',
        ir: { vista: 'accesos', detalle: 'usuarios', etiqueta: 'Ir a Usuarios' },
        claves: 'baja usuario desactivar quitar acceso reactivar bloquear cuenta',
      },
      {
        id: 'admin.superadmin',
        pregunta: '¿Cómo nombro a otro superadmin?',
        resumen: 'En **Accesos → Usuarios**, pulsa **Hacer superadmin** en el renglón de la persona.',
        puntos: [
          'Sólo se puede nombrar a administradores activos.',
          'Un superadmin fija contraseñas ajenas, da de baja usuarios y nombra superadmins.',
        ],
        requiere: 'superadmin',
        ir: { vista: 'accesos', detalle: 'usuarios', etiqueta: 'Ir a Usuarios' },
        claves: 'superadmin nombrar super administrador',
      },
      {
        id: 'admin.foto',
        pregunta: '¿Cómo cambio la foto de un usuario?',
        resumen: 'Desde su renglón en **Accesos → Usuarios**.',
        pasos: [
          'Pulsa la foto (o las iniciales) de la persona.',
          'Sube una imagen, usa **Usar la del organigrama** o pulsa **Quitar**.',
        ],
        ir: { vista: 'accesos', detalle: 'usuarios', etiqueta: 'Ir a Usuarios' },
        claves: 'foto usuario avatar imagen perfil cambiar foto',
      },
      {
        id: 'admin.historial',
        pregunta: '¿Cómo veo quién modificó un registro?',
        resumen: 'En **Administración → Historial** queda cada cambio: quién, cuándo y qué campos.',
        pasos: [
          'Abre **Historial** en el menú lateral.',
          'Filtra por tabla con la lista **Todas las tablas**.',
          'Pulsa **Actualizar** para traer los cambios más recientes.',
        ],
        ir: { vista: 'historial', etiqueta: 'Ir al Historial' },
        claves: 'historial cambios quien modifico auditoria de cambios registro bitacora de cambios',
      },
      {
        id: 'admin.bitacora',
        pregunta: '¿Cómo veo quién está conectado y cuándo entra?',
        resumen: 'En **Administración → Accesos → Bitácora**.',
        puntos: [
          'Arriba: cuántos están en línea ahora, sesiones, usuarios y sesión promedio.',
          'Luego: cada usuario con su última conexión, las entradas por hora del día y el detalle de sesiones.',
          'Filtra el detalle por usuario con la lista **Todos los usuarios**.',
        ],
        ir: { vista: 'accesos', detalle: 'bitacora', etiqueta: 'Ir a la Bitácora' },
        claves: 'bitacora accesos conectados en linea sesiones quien entro ultima vez',
      },
    ],
  },
];

// ── Quién ve qué ────────────────────────────────────────────────────────────

/** Lo que el asistente necesita saber de la persona (cabe un User de types.ts). */
export interface PerfilAyuda {
  role: string;
  isSuperAdmin?: boolean;
  areaAuditoria?: boolean;
  modulos?: readonly string[] | null;
}

const esAdmin = (p: PerfilAyuda) => p.role === 'ADMIN';

export const cumple = (p: PerfilAyuda, requiere?: Requisito): boolean => {
  switch (requiere) {
    case undefined: return true;
    case 'captura': return p.role === 'ADMIN' || p.role === 'OPERATOR';
    case 'admin': return esAdmin(p);
    case 'superadmin': return esAdmin(p) && p.isSuperAdmin === true;
    case 'auditoria': return p.areaAuditoria === true;
  }
};

/** Historial y Accesos dependen del rol; lo demás, de profiles.modulos. */
export const puedeAbrir = (p: PerfilAyuda, vista: string): boolean =>
  (VISTAS_ADMIN as readonly string[]).includes(vista) ? esAdmin(p) : puedeVer(p.modulos, vista);

const comoLista = (v: string | string[]) => (Array.isArray(v) ? v : [v]);

/** La pantalla a la que lleva el botón de la respuesta, o null si no la puede abrir. */
export const destinoPara = (p: PerfilAyuda, ir?: Destino): string | null =>
  ir ? comoLista(ir.vista).find((v) => puedeAbrir(p, v)) ?? null : null;

export interface PreguntaVisible extends Pregunta { numero: string; temaId: string }
export interface TemaVisible extends Omit<Tema, 'preguntas'> { numero: number; preguntas: PreguntaVisible[] }

/**
 * Los temas y preguntas que aplican a la persona, numerados como en el menú
 * ("3", "3.2"). Lo que no puede hacer ni abrir no se le ofrece.
 */
export const temasPara = (p: PerfilAyuda): TemaVisible[] => {
  const alcanza = (vistas?: string[]) => !vistas || vistas.some((v) => puedeAbrir(p, v));
  return TEMAS
    .filter((t) => cumple(p, t.requiere) && alcanza(t.vistas))
    .map((t) => ({ ...t, preguntas: t.preguntas.filter((q) => cumple(p, q.requiere) && alcanza(q.vistas)) }))
    .filter((t) => t.preguntas.length > 0)
    .map((t, i) => ({
      ...t,
      numero: i + 1,
      preguntas: t.preguntas.map((q, j) => ({ ...q, numero: `${i + 1}.${j + 1}`, temaId: t.id })),
    }));
};

/** El tema que corresponde a la pantalla abierta, para marcarlo en el menú. */
export const temaDeVista = (temas: TemaVisible[], vista: string | null): TemaVisible | null => {
  if (!vista) return null;
  if ((VISTAS_ADMIN as readonly string[]).includes(vista)) return temas.find((t) => t.id === 'admin') ?? null;
  return temas.find((t) => t.vistas?.includes(vista)) ?? null;
};

/** "Pagos 2026", "Estatus servicios (2027)", "Historial". */
export const nombreVista = (vista: string): string => {
  if (vista === 'historial') return 'Historial';
  if (vista === 'accesos') return 'Accesos';
  for (const g of GRUPOS_VISTAS) {
    const v = g.vistas.find((x) => x.id === vista);
    if (!v) continue;
    if (g.vistas.length === 1 || g.id === 'reportes' || v.etiqueta.includes(g.etiqueta)) return v.etiqueta;
    return `${v.etiqueta} (${g.etiqueta})`;
  }
  return vista;
};

/** Para que las pruebas revisen que ninguna respuesta apunte a una pantalla que no existe. */
export const vistaConocida = (vista: string) =>
  TODAS_LAS_VISTAS.includes(vista) || (VISTAS_ADMIN as readonly string[]).includes(vista);

// ── Buscador ────────────────────────────────────────────────────────────────

const VACIAS = new Set([
  'a', 'al', 'algo', 'como', 'con', 'cual', 'cuales', 'cuando', 'de', 'del', 'donde', 'el', 'en', 'es', 'esta', 'este', 'hacer',
  'hago', 'hay', 'la', 'las', 'le', 'lo', 'los', 'me', 'mi', 'mis', 'necesito', 'o', 'para', 'pero', 'por', 'puedo', 'que',
  'quiero', 'se', 'si', 'sistema', 'su', 'sus', 'tengo', 'un', 'una', 'uno', 'y', 'ya', 'yo', 'ayuda', 'favor', 'saber',
]);

/** Minúsculas, sin acentos ni signos: "¿Cómo?" → "como". */
export const normalizar = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Palabras con significado, en singular aproximado ("pagos" → "pago"). */
export const palabras = (s: string): string[] =>
  normalizar(s).split(' ')
    .filter((w) => w.length > 1 && !VACIAS.has(w))
    .map((w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w));

/** 1 igual, 0.6 misma raíz ("edito" / "editar"), 0 nada. */
const parecido = (q: string, d: string): number => {
  if (q === d) return 1;
  const corta = Math.min(q.length, d.length);
  if (corta < 4) return 0;
  let comun = 0;
  while (comun < corta && q[comun] === d[comun]) comun++;
  return comun >= Math.max(4, corta - 1) ? 0.6 : 0;
};

const mejor = (q: string, campo: string[]) => campo.reduce((m, d) => Math.max(m, parecido(q, d)), 0);

/**
 * Las preguntas que mejor contestan lo que escribió la persona, de la más a
 * la menos parecida. Pesa más lo que dice la pregunta y sus claves que el
 * texto de la respuesta.
 */
export const buscarPreguntas = (temas: TemaVisible[], texto: string, limite = 5): PreguntaVisible[] => {
  const consulta = [...new Set(palabras(texto))];
  if (!consulta.length) return [];
  const puntuadas = temas.flatMap((t) => t.preguntas.map((q) => {
    const campos: [string[], number][] = [
      [palabras(q.pregunta), 3],
      [palabras(q.claves ?? ''), 3],
      [palabras(t.titulo), 1.5],
      [palabras([q.resumen, ...(q.pasos ?? []), ...(q.puntos ?? []), q.tip ?? ''].join(' ')), 1],
    ];
    let puntos = 0;
    let halladas = 0;
    for (const w of consulta) {
      const s = campos.reduce((m, [campo, peso]) => Math.max(m, mejor(w, campo) * peso), 0);
      if (s > 0) halladas++;
      puntos += s;
    }
    if (halladas === consulta.length) puntos *= 1.5;
    return { q, puntos, halladas };
  }));
  const tope = Math.max(0, ...puntuadas.map((x) => x.puntos));
  if (tope === 0) return [];
  return puntuadas
    .filter((x) => x.halladas > 0 && x.puntos >= tope * 0.35)
    .sort((a, b) => b.puntos - a.puntos)
    .slice(0, limite)
    .map((x) => x.q);
};

/** "3" → tema 3, "3.2" → pregunta 3.2, como en los menús por número. */
export const elegirPorNumero = (temas: TemaVisible[], texto: string): { tema: TemaVisible; pregunta?: PreguntaVisible } | null => {
  const m = texto.trim().match(/^(\d{1,2})(?:\s*[.,]\s*(\d{1,2}))?\.?$/);
  if (!m) return null;
  const tema = temas.find((t) => t.numero === Number(m[1]));
  if (!tema) return null;
  if (!m[2]) return { tema };
  const pregunta = tema.preguntas.find((q) => q.numero === `${m[1]}.${Number(m[2])}`);
  return pregunta ? { tema, pregunta } : null;
};
