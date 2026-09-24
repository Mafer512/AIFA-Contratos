import { supabase } from './supabaseClient';
import type { User } from '../types';

// Bitácora de accesos: una fila de access_logs por sesión de trabajo.
//
// El ciclo es: startAccessSession() al entrar → un latido cada minuto que
// mueve last_seen_at → endAccessSession() al salir. El tiempo en línea no se
// guarda, se calcula como coalesce(logout_at, last_seen_at) - login_at; por eso
// el latido importa: es lo único que deja una duración correcta cuando alguien
// cierra el navegador de golpe y el logout_at nunca llega.

const STORAGE_KEY = 'aifa.accessLog.sessionId';
const HEARTBEAT_MS = 60_000;

export type LogoutReason = 'MANUAL' | 'INACTIVIDAD' | 'CIERRE';

let heartbeatTimer: number | null = null;
let currentSessionId: number | null = null;
let starting: Promise<void> | null = null;

// Si la tabla todavía no existe (nadie corrió la migración), se apaga sola y
// deja de intentar. La app no debe romperse por no poder registrar un acceso.
let available = true;

// PostgREST no siempre responde el 42P01 de Postgres: cuando la tabla nunca ha
// existido contesta PGRST205 ("Could not find the table in the schema cache").
// Hay que reconocer los dos, o la app se queda reintentando contra una tabla
// que no está.
const isMissingTable = (error: { code?: string; message?: string } | null) =>
  error?.code === '42P01' ||
  error?.code === 'PGRST205' ||
  /schema cache/i.test(error?.message ?? '');

const readStoredId = (): number | null => {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const writeStoredId = (id: number | null) => {
  try {
    if (id === null) window.sessionStorage.removeItem(STORAGE_KEY);
    else window.sessionStorage.setItem(STORAGE_KEY, String(id));
  } catch {
    /* sessionStorage bloqueado (modo privado): la sesión funciona igual, sólo
       se abre una fila nueva si recargan la página. */
  }
};

const stopHeartbeat = () => {
  if (heartbeatTimer !== null) {
    window.clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
};

const touch = async () => {
  if (!available || currentSessionId === null) return;
  const { error } = await supabase
    .from('access_logs')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('id', currentSessionId);

  if (error) {
    if (isMissingTable(error)) available = false;
    // Un latido perdido no es grave: el siguiente corrige last_seen_at.
  }
};

const startHeartbeat = () => {
  stopHeartbeat();
  heartbeatTimer = window.setInterval(() => { void touch(); }, HEARTBEAT_MS);
};

/**
 * Abre (o reanuda) la sesión de bitácora del usuario.
 *
 * Al recargar la página en la misma pestaña se reanuda la fila existente en
 * vez de abrir otra: recargar no es volver a entrar. Una pestaña nueva o un
 * inicio de sesión nuevo sí abren una fila nueva.
 */
export const startAccessSession = async (user: User): Promise<void> => {
  if (!available) return;

  // onAuthStateChange puede dispararse varias veces seguidas (INITIAL_SESSION,
  // TOKEN_REFRESHED...). Sin esta guardia, dos llamadas simultáneas abrirían
  // dos filas para la misma entrada.
  if (starting) return starting;

  starting = (async () => {
    const stored = readStoredId();
    if (stored !== null) {
      currentSessionId = stored;
      await touch();
      if (available) startHeartbeat();
      return;
    }

    const nav = window.navigator;
    const { data, error } = await supabase
      .from('access_logs')
      .insert([{
        user_id: user.id,
        user_email: user.email || null,
        user_name: user.name || null,
        user_role: user.role || null,
        user_agent: nav.userAgent ?? null,
        platform: (nav as Navigator & { platform?: string }).platform ?? null,
      }])
      .select('id')
      .single();

    if (error) {
      if (isMissingTable(error)) available = false;
      else console.error('No se pudo registrar el acceso:', error.message);
      return;
    }

    currentSessionId = (data?.id as number) ?? null;
    writeStoredId(currentSessionId);
    startHeartbeat();
  })();

  try {
    await starting;
  } finally {
    starting = null;
  }
};

/** Cierra la sesión de bitácora. Se llama antes del signOut. */
export const endAccessSession = async (reason: LogoutReason): Promise<void> => {
  stopHeartbeat();

  const id = currentSessionId ?? readStoredId();
  currentSessionId = null;
  writeStoredId(null);

  if (!available || id === null) return;

  const now = new Date().toISOString();
  const { error } = await supabase
    .from('access_logs')
    .update({ logout_at: now, last_seen_at: now, logout_reason: reason })
    .eq('id', id);

  if (error && isMissingTable(error)) available = false;
};

/**
 * Último latido al ocultar o cerrar la pestaña.
 *
 * Es un intento, no una garantía: el navegador puede matar la petición a media
 * salida. No pasa nada — sin él, la duración sale del último latido del minuto
 * anterior. Por eso aquí NO se cierra la sesión (no sabemos si se van o sólo
 * cambian de pestaña), sólo se acerca last_seen_at al momento real.
 */
export const touchAccessSession = (): void => {
  if (!available || currentSessionId === null) return;
  void touch();
};
