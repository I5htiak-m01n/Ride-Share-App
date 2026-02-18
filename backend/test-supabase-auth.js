require("dotenv").config();
const { supabase } = require("./src/supabaseClient");

(async () => {
  console.log("Testing Supabase Auth signup...\n");

  const testEmail = `test${Date.now()}@demo.com`;
  const { data, error } = await supabase.auth.signUp({
    email: testEmail,
    password: "password123",
    options: {
      data: {
        first_name: "Test",
        last_name: "User",
        name: "Test User",
        role: "rider",
        phone_number: "+8801700000099",
      }
    }
  });

  if (error) {
    console.error("Supabase Auth Error:", error);
  } else {
    console.log("Success!", JSON.stringify(data, null, 2));
  }

  process.exit(0);
})();
