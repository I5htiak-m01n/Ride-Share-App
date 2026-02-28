const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Warning: SUPABASE_URL and SUPABASE_ANON_KEY must be set in .env file");
}

if (!supabaseServiceRoleKey) {
  console.warn("Warning: SUPABASE_SERVICE_ROLE_KEY not set - registration may be rate limited");
}

// Regular client - used for login and session management
// persistSession: false prevents shared state mutation across concurrent requests
const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false }
});

// Admin client - bypasses rate limits and email confirmation for user creation
const supabaseAdmin = supabaseServiceRoleKey
  ? createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })
  : null;

module.exports = { supabase, supabaseAdmin };
