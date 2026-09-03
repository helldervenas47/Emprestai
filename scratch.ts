import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  const { data } = await supabase.from('subscriptions').select('*').order('created_at', { ascending: false }).limit(5);
  console.log(data);
}
run();