
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://hvabkxgxmthyqbgsjqgr.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2YWJreGd4bXRoeXFiZ3NqcWdyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM1ODYxNDYsImV4cCI6MjA3OTE2MjE0Nn0.Q9SfM02ie2ZDPhDkU9G1NG1LF66649jZmBI7ChbugvI';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkTable() {
    console.log("Checking table 'estatus_2026'...");
    const { data, error, count } = await supabase
        .from('estatus_2026')
        .select('*', { count: 'exact', head: true });

    if (error) {
        console.error("Error connecting to 'estatus_2026':", error);
    } else {
        console.log("Success! Table exists.");
        console.log("Messages count:", count);
    }
    
    // Check if we can get sample data
    const { data: sample, error: sampleError } = await supabase
        .from('estatus_2026')
        .select('*')
        .limit(1);
        
    if (sampleError) {
         console.error("Error fetching rows:", sampleError);
    } else {
        console.log("Sample Data:", sample);
    }
}

checkTable();
