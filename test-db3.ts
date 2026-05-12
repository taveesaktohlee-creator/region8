import { pool } from './src/lib/dbconnect.js';

async function test() {
  try {
    await pool.query('ALTER TABLE user MODIFY user_id INT NOT NULL AUTO_INCREMENT');
    console.log('Altered user table successfully');
  } catch (error) {
    console.error('DB Error:', error);
  } finally {
    process.exit(0);
  }
}
test();
