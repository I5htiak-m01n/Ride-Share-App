require('dotenv').config();
const { pool } = require('./src/db');

const userId = '466f9879-29be-47e6-80d6-2087c2181ec6';
const email = 'testusernew@gmail.com';

(async () => {
  console.log('🔧 Fixing user database records...\n');

  try {
    await pool.query('BEGIN');

    // Insert into users table
    await pool.query(
      'INSERT INTO users (user_id, email, name, phone_number, role) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING',
      [userId, email, 'Test User New', '+8801712345678', 'rider']
    );
    console.log('✅ User record created');

    // Create rider profile
    await pool.query(
      'INSERT INTO riders (rider_id) VALUES ($1) ON CONFLICT DO NOTHING',
      [userId]
    );
    console.log('✅ Rider profile created');

    // Create wallet
    await pool.query(
      'INSERT INTO wallets (owner_id, balance, currency) VALUES ($1, 0, $2) ON CONFLICT DO NOTHING',
      [userId, 'BDT']
    );
    console.log('✅ Wallet created');

    await pool.query('COMMIT');
    console.log('\n🎉 User database records fixed!');
    console.log('You can now login with:');
    console.log('Email: testusernew@gmail.com');
    console.log('Password: testusernew\n');

  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('❌ Error:', error.message);
  }

  process.exit(0);
})();
