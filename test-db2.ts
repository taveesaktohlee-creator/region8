import { pool } from './src/lib/dbconnect.js';

async function test() {
  try {
    const [rows] = await pool.query('DESCRIBE user');
    console.log(rows);
  } catch (error) {
    console.error('DB Error:', error);
  } finally {
    process.exit(0);
  }
}
test();
