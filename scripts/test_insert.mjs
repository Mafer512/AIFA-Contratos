
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://hvabkxgxmthyqbgsjqgr.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2YWJreGd4bXRoeXFiZ3NqcWdyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM1ODYxNDYsImV4cCI6MjA3OTE2MjE0Nn0.Q9SfM02ie2ZDPhDkU9G1NG1LF66649jZmBI7ChbugvI';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function test() {
  const { data, error } = await supabase.from('estatus_2026').insert({}).select().single();
  console.log('Result:', data);
  console.log('Error:', error);
}
test();

