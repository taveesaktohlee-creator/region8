import { pool } from './src/lib/dbconnect.js';
import bcrypt from 'bcryptjs';

async function testLogin() {
  const username = 'cad';
  const password = '12345678';

  try {
    const [users]: any = await pool.query('SELECT user_id, username, password FROM user WHERE username = ?', [username]);
    
    if (users.length === 0) {
      console.log(`User ${username} not found.`);
      process.exit(1);
    }

    const user = users[0];
    console.log(`Found user ${username}. Hash from DB: ${user.password}`);
    
    const isMatch = await bcrypt.compare(password, user.password);
    
    if (isMatch) {
      console.log('✅ Password matches!');
    } else {
      console.log('❌ Password does NOT match.');
    }
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

testLogin();
