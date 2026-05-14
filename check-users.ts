import { pool } from './src/lib/dbconnect.js';

async function checkUsers() {
  try {
    const [rows]: any = await pool.query('SELECT user_id, username, Name_Surnam FROM user LIMIT 5');
    console.log('Users in database:', rows);
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkUsers();
