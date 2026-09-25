// Detección del enlace de "olvidé mi contraseña".
//
// POR QUÉ ESTE MÓDULO EXISTE APARTE
// Hay dos carreras que hacen que el enlace se pierda, y las dos se ganan aquí:
//
//   1. El cliente de Supabase trae detectSessionInUrl activado: en cuanto
//      arranca canjea el token del hash y BORRA el hash de la barra de
//      direcciones. Quien lo lea después ya no ve el "type=recovery". Por eso
//      este archivo no importa nada: supabaseClient.ts lo importa a él, así que
//      su cuerpo corre antes de que se llame a createClient().
//
//   2. Supabase avisa del enlace con el evento PASSWORD_RECOVERY, pero lo emite
//      dentro de un setTimeout(0) durante su inicialización — normalmente antes
//      de que React monte el efecto que lo escucharía. Un listener registrado
//      en un componente llega tarde y se lo pierde. Por eso la suscripción se
//      registra a nivel de módulo (ver supabaseClient.ts) y deja el resultado
//      aquí, esperando a que la interfaz venga a preguntarlo.
//
// Sin esto, el enlace del correo se comportaba como un pase de entrada: metía a
// la persona a la aplicación y su contraseña seguía siendo la que no recordaba.

export interface AuthLinkInfo {
  /** El enlace es de restablecimiento de contraseña. */
  recovery: boolean;
  /** El enlace venía con error (caducado, ya usado...). */
  error: string | null;
  /** Confirmación de alta de cuenta (flujo que ya existía). */
  signup: boolean;
  /** La URL tal cual se cargó la página; sólo para diagnóstico. */
  hrefInicial: string;
}

const parse = (): AuthLinkInfo => {
  const vacio: AuthLinkInfo = { recovery: false, error: null, signup: false, hrefInicial: '' };
  if (typeof window === 'undefined') return vacio;

  try {
    const href = window.location.href;
    const url = new URL(href);
    const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
    const query = url.searchParams;

    const leer = (clave: string) => hash.get(clave) ?? query.get(clave);

    const tipo = leer('type');
    const errorCode = leer('error');
    const errorDesc = leer('error_description');

    // Un enlace caducado o ya usado no trae token: regresa con error. Hay que
    // reconocerlo para poder explicarlo en vez de mandar a la persona al login
    // sin decirle por qué no pasó nada.
    if (errorCode || errorDesc) {
      const desc = (errorDesc ?? '').replace(/\+/g, ' ');
      const caducado = /expired|invalid/i.test(desc + ' ' + (errorCode ?? ''));
      return {
        recovery: true,
        signup: false,
        hrefInicial: href,
        error: caducado
          ? 'El enlace caducó o ya se usó. Por seguridad duran poco tiempo. Pide uno nuevo desde la pantalla de acceso.'
          : desc || 'El enlace no es válido.',
      };
    }

    return {
      recovery: tipo === 'recovery',
      signup: tipo === 'signup' || leer('message') === 'Confirmation complete',
      error: null,
      hrefInicial: href,
    };
  } catch {
    return vacio;
  }
};

/** Lo que decía la URL al cargar la página, antes de que Supabase la tocara. */
export const authLink: AuthLinkInfo = parse();

// ── Aviso tardío de recuperación ──────────────────────────────────────────
// Respaldo por si la URL no traía "type=recovery" donde se esperaba (por
// ejemplo con flujo PKCE, donde el enlace llega como ?code=...). En ese caso lo
// único fiable es el evento de Supabase, y esto guarda su resultado aunque
// llegue antes de que la interfaz esté lista para escucharlo.

let recoveryDetectado = authLink.recovery;
const suscriptores = new Set<() => void>();

/** Lo llama supabaseClient.ts cuando Supabase emite PASSWORD_RECOVERY. */
export const marcarRecovery = (): void => {
  if (recoveryDetectado) return;
  recoveryDetectado = true;
  suscriptores.forEach((fn) => {
    try { fn(); } catch (e) { console.error('Error avisando de recuperación:', e); }
  });
};

/** true si el enlace es de restablecimiento, se haya sabido por URL o por evento. */
export const esFlujoRecovery = (): boolean => recoveryDetectado;

/** La interfaz se apunta aquí para enterarse aunque el evento llegue tarde. */
export const alDetectarRecovery = (fn: () => void): (() => void) => {
  suscriptores.add(fn);
  return () => { suscriptores.delete(fn); };
};

/** Termina el flujo: se llama al guardar la contraseña nueva. */
export const limpiarRecovery = (): void => {
  recoveryDetectado = false;
};

/**
 * La dirección a la que debe regresar el enlace del correo.
 *
 * Tiene que salir de un solo sitio porque Supabase compara esta cadena contra
 * su lista blanca de forma literal: si el login mandaba "https://app.com" y el
 * panel "https://app.com/", una de las dos podía no coincidir y Supabase la
 * descartaba en silencio, mandando a la persona a la Site URL del proyecto —que
 * puede ser un despliegue viejo— en vez de a donde estaba.
 *
 * Se incluye la barra final y en Supabase se registra con comodín
 * (https://tu-dominio/**), que cubre cualquier ruta.
 */
export const urlRetorno = (): string => {
  if (typeof window === 'undefined') return '/';
  return `${window.location.origin}/`;
};

// Diagnóstico: si el enlace vuelve a fallar, esto dice exactamente con qué URL
// se abrió la página, que es el dato que hace falta para saber por qué.
if (typeof window !== 'undefined') {
  (window as any).__aifaAuthLink = authLink;
}
