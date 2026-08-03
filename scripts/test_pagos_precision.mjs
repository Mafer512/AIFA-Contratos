import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://hvabkxgxmthyqbgsjqgr.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2YWJreGd4bXRoeXFiZ3NqcWdyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM1ODYxNDYsImV4cCI6MjA3OTE2MjE0Nn0.Q9SfM02ie2ZDPhDkU9G1NG1LF66649jZmBI7ChbugvI';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkPrecision() {
  // Row 2 (Energías de México) según el usuario tiene Ene = 12,424,719.58
  // Vamos a leerla y ver qué devuelve la base de datos
  const { data, error } = await supabase
    .from('pagos_2026')
    .select('id, "No. Contrato", "Ene.", "Feb.", "Mar.", "Mont. Max."')
    .order('id', { ascending: true })
    .limit(5);

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('Valores actuales en pagos_2026 (Ene, Feb, Mar):');
  data.forEach(row => {
    console.log(`ID ${row.id}: Contrato=${row['No. Contrato']}`);
    console.log(`  Mont. Max. = ${row['Mont. Max.']}`);
    console.log(`  Ene. = ${row['Ene.']}`);
    console.log(`  Feb. = ${row['Feb.']}`);
    console.log(`  Mar. = ${row['Mar.']}`);
  });

  // Intentar escribir un valor con decimales y leerlo de vuelta
  // para confirmar si hay redondeo en la DB
  if (data.length > 0) {
    const testRow = data[1]; // row 2
    const testId = testRow?.id;
    const testValue = 12424719.58;
    
    console.log(`\nProbando escritura de ${testValue} en Ene. del registro id=${testId}...`);
    const { error: updateError } = await supabase
      .from('pagos_2026')
      .update({ 'Ene.': testValue })
      .eq('id', testId);

    if (updateError) {
      console.error('Error al escribir:', updateError);
      return;
    }

    const { data: readBack, error: readError } = await supabase
      .from('pagos_2026')
      .select('id, "Ene."')
      .eq('id', testId)
      .single();

    if (readError) {
      console.error('Error al leer:', readError);
      return;
    }

    console.log(`Valor escrito: ${testValue}`);
    console.log(`Valor leído de vuelta: ${readBack['Ene.']}`);
    if (readBack['Ene.'] === testValue) {
      console.log('✓ Sin redondeo - la DB preserva el valor');
    } else {
      console.log(`✗ REDONDEO DETECTADO: ${testValue} → ${readBack['Ene.']} (diferencia: ${testValue - readBack['Ene.']})`);
      console.log('  → El tipo de columna en la base de datos es probablemente float4/real (precisión simple)');
      console.log('  → Se necesita cambiar a float8/double precision o numeric(20,2)');
    }
  }
}

checkPrecision();
