// ORDEN IMPORTANTE: authLink primero. Su cuerpo se evalúa antes que el de este
// archivo, así que captura la URL del enlace antes de que createClient() la
// consuma y le borre el hash. Si se quita este import, el restablecimiento de
// contraseña vuelve a fallar en silencio: el enlace mete a la persona a la
// aplicación sin darle nunca la pantalla para cambiarla.
import { authLink, marcarRecovery } from './authLink';
import { createClient } from '@supabase/supabase-js';

// URL de tu proyecto Supabase
const supabaseUrl = 'https://hvabkxgxmthyqbgsjqgr.supabase.co';

// Llave pública (Anon Key) proporcionada por el usuario
// Esta es segura para usar en el navegador.
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2YWJreGd4bXRoeXFiZ3NqcWdyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM1ODYxNDYsImV4cCI6MjA3OTE2MjE0Nn0.Q9SfM02ie2ZDPhDkU9G1NG1LF66649jZmBI7ChbugvI';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Suscripción a nivel de módulo, no dentro de un componente.
//
// Supabase emite PASSWORD_RECOVERY con un setTimeout(0) mientras se inicializa,
// casi siempre antes de que React monte sus efectos. Un listener puesto en un
// useEffect llega tarde y el aviso se pierde para siempre: el evento no se
// reemite a quien se suscribe después. Aquí se registra en cuanto existe el
// cliente, así que no hay forma de perdérselo.
supabase.auth.onAuthStateChange((event) => {
  if (event === 'PASSWORD_RECOVERY') marcarRecovery();
});

// Deja el dato a mano para diagnóstico si el enlace vuelve a fallar.
if (typeof window !== 'undefined') {
  (window as any).__aifaAuthLink = authLink;
}

// Segunda conexión: proyecto Supabase de AIFA-OPERACIONES.
// Hacia allá se están migrando gradualmente las tablas del sistema; por ahora
// solo se usa para leer paaas_2026, que vive en ese proyecto.
const operacionesUrl = 'https://fgstncvuuhpgyzmjceyr.supabase.co';
const operacionesAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZnc3RuY3Z1dWhwZ3l6bWpjZXlyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4NzQ0NDQsImV4cCI6MjA4MTQ1MDQ0NH0.YEDIKuWt5iKUEI0BAvidINUz0aZBvQM0h6XRJ-uslB8';

export const supabaseOperaciones = createClient(operacionesUrl, operacionesAnonKey);

// Tercera conexión: sólo para que un administrador dé de alta a otras personas.
//
// supabase.auth.signUp() inicia sesión con la cuenta recién creada. Si se usara
// el cliente principal, el administrador saldría de su propia sesión en cuanto
// crea un usuario y se quedaría dentro del sistema como el empleado nuevo.
//
// Con persistSession en false y su propio storageKey, este cliente nunca escribe
// en el almacenamiento del navegador: crea la cuenta, devuelve el id y olvida la
// sesión. La del administrador, que vive en el cliente principal, ni se entera.
export const supabaseSignUp = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
    storageKey: 'aifa-alta-usuarios',
  },
});
