require('dotenv').config();
const { supabase } = require('./src/supabaseClient');
const { pool } = require('./src/db');

(async () => {
  console.log('🔧 Creating test user account...\n');

  const testUser = {
    email: 'testuser@demo.com',
    password: 'password123',
    first_name: 'Test',
    last_name: 'User',
    phone_number: '+8801712345678',
    role: 'rider'
  };

  try {
    // Try to create user in Supabase
    console.log('Step 1: Creating user in Supabase Auth...');
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: testUser.email,
      password: testUser.password,
      email_confirm: true, // Auto-confirm email
      user_metadata: {
        first_name: testUser.first_name,
        last_name: testUser.last_name,
        name: `${testUser.first_name} ${testUser.last_name}`,
        role: testUser.role,
        phone_number: testUser.phone_number,
      }
    });

    if (authError) {
      console.error('❌ Supabase Auth Error:', authError.message);
      console.log('\n💡 Try Solution 2 instead (disable email confirmations)\n');
      process.exit(1);
    }

    const userId = authData.user.id;
    console.log('✅ User created in Supabase:', userId);

    // Create records in database
    console.log('Step 2: Creating user records in database...');
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Insert into users table
      await client.query(
        `INSERT INTO users (user_id, email, name, phone_number, role)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id) DO NOTHING`,
        [userId, testUser.email, `${testUser.first_name} ${testUser.last_name}`, testUser.phone_number, testUser.role]
      );

      // Create rider profile
      await client.query(
        'INSERT INTO riders (rider_id) VALUES ($1) ON CONFLICT DO NOTHING',
        [userId]
      );

      // Create wallet
      await client.query(
        'INSERT INTO wallets (owner_id, balance, currency) VALUES ($1, 0, $2) ON CONFLICT DO NOTHING',
        [userId, 'BDT']
      );

      await client.query('COMMIT');
      console.log('✅ Database records created');

      console.log('\n🎉 SUCCESS! Test account created:');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('Email:    testuser@demo.com');
      console.log('Password: password123');
      console.log('Role:     Rider');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('\nYou can now login at: http://localhost:5173/login\n');

    } catch (dbError) {
      await client.query('ROLLBACK');
      console.error('❌ Database Error:', dbError.message);
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('\n💡 This might require Supabase admin permissions.');
    console.log('Try Solution 2: Disable email confirmations in Supabase dashboard\n');
  }

  process.exit(0);
})();
