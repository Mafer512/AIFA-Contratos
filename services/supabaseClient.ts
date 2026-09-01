import { createClient } from '@supabase/supabase-js';

// URL de tu proyecto Supabase
const supabaseUrl = 'https://hvabkxgxmthyqbgsjqgr.supabase.co';

// Llave pública (Anon Key) proporcionada por el usuario
// Esta es segura para usar en el navegador.
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2YWJreGd4bXRoeXFiZ3NqcWdyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM1ODYxNDYsImV4cCI6MjA3OTE2MjE0Nn0.Q9SfM02ie2ZDPhDkU9G1NG1LF66649jZmBI7ChbugvI';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Segunda conexión: proyecto Supabase de AIFA-OPERACIONES.
// Hacia allá se están migrando gradualmente las tablas del sistema; por ahora
// solo se usa para leer paaas_2026, que vive en ese proyecto.
const operacionesUrl = 'https://fgstncvuuhpgyzmjceyr.supabase.co';
const operacionesAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZnc3RuY3Z1dWhwZ3l6bWpjZXlyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4NzQ0NDQsImV4cCI6MjA4MTQ1MDQ0NH0.YEDIKuWt5iKUEI0BAvidINUz0aZBvQM0h6XRJ-uslB8';

export const supabaseOperaciones = createClient(operacionesUrl, operacionesAnonKey);