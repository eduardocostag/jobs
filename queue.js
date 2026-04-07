const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Certifique-se de adicionar estas variáveis ao seu arquivo .env
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = { supabase };