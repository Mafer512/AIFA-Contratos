import { createClient } from '@supabase/supabase-js';

// URL de tu proyecto Supabase
const supabaseUrl = 'https://hvabkxgxmthyqbgsjqgr.supabase.co';

// Llave pública (Anon Key) proporcionada por el usuario
// Esta es segura para usar en el navegador.
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2YWJreGd4bXRoeXFiZ3NqcWdyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM1ODYxNDYsImV4cCI6MjA3OTE2MjE0Nn0.Q9SfM02ie2ZDPhDkU9G1NG1LF66649jZmBI7ChbugvI';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);