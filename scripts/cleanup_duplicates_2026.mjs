import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://hvabkxgxmthyqbgsjqgr.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2YWJreGd4bXRoeXFiZ3NqcWdyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM1ODYxNDYsImV4cCI6MjA3OTE2MjE0Nn0.Q9SfM02ie2ZDPhDkU9G1NG1LF66649jZmBI7ChbugvI'
);

function countInfo(row) {
  let count = 0;
  for (const key in row) {
    if (key === 'id') continue;
    const val = row[key];
    if (val !== null && val !== undefined && val !== '') {
      count++;
    }
  }
  return count;
}

async function fixDuplicates() {
  const { data, error } = await supabase.from('estatus_2026').select('*');
  if (error) {
    console.error('Error fetching:', error);
    return;
  }

  // Find duplicates
  const grouped = {};
  data.forEach((row) => {
    if (!grouped[row.id]) grouped[row.id] = [];
    grouped[row.id].push(row);
  });

  const idsToDelete = [];
  const rowsToReinsert = [];

  for (const id in grouped) {
    const rows = grouped[id];
    if (rows.length > 1) {
      console.log(`\nDuplicate found for ID ${id}: ${rows.length} rows`);
      idsToDelete.push(Number(id));
      
      // Sort rows descending by the amount of information they have
      rows.sort((a, b) => countInfo(b) - countInfo(a));
      
      const winner = rows[0];
      const loser = rows[rows.length - 1];
      
      console.log(`Best row has ${countInfo(winner)} filled columns. Lowest has ${countInfo(loser)}.`);
      console.log('Keeping best row...');
      
      rowsToReinsert.push(winner);
    }
  }

  if (idsToDelete.length === 0) {
    console.log('No duplicates found.');
    return;
  }

  // 1. Delete all instances of these duplicate IDs
  console.log(`Deleting ${idsToDelete.length} duplicate IDs...`);
  const { error: delError } = await supabase.from('estatus_2026').delete().in('id', idsToDelete);
  if (delError) {
    console.error('Error deleting duplicates:', delError);
    return;
  }

  // 2. Re-insert the best row for each deleted ID
  console.log(`Re-inserting ${rowsToReinsert.length} unique best rows...`);
  const { error: insError } = await supabase.from('estatus_2026').insert(rowsToReinsert);
  if (insError) {
    console.error('Error inserting best rows:', insError);
    return;
  }

  console.log('Done! All duplicates resolved.');
}

fixDuplicates();
