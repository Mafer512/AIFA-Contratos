import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://your-project.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'your-key';

const client = createClient(supabaseUrl, supabaseKey);

async function checkDuplicates() {
  const { data, error } = await client.from('estatus_2026').select('*');
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  const idCounts = {};
  data.forEach(row => {
    idCounts[row.id] = (idCounts[row.id] || 0) + 1;
  });
  
  const duplicates = Object.keys(idCounts).filter(id => idCounts[id] > 1);
  console.log('Duplicate IDs:', duplicates);
  
  const dupRows = data.filter(row => duplicates.includes(String(row.id)));
  console.log(JSON.stringify(dupRows, null, 2));
}

checkDuplicates();
