import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const dbConfig = {
  host: process.env.DB_HOST || '157.85.98.50',
  port: Number(process.env.DB_PORT) || 3307,
  user: process.env.DB_USER || 'admin',
  password: process.env.DB_PASSWORD || '041853671',
  database: process.env.DB_NAME || 'isr8', // ระบุชื่อ database ที่ต้องการใช้งาน
  timezone: '+07:00',
  dateStrings: true,
};

export const pool = mysql.createPool(dbConfig);

pool.on('connection', (connection) => {
  connection.query("SET time_zone = '+07:00'");
});

export const connectDB = async () => {
  try {
    const connection = await pool.getConnection();
    console.log('Connected to MySQL database successfully');
    connection.release();
  } catch (error) {
    console.error('Error connecting to MySQL:', error);
    process.exit(1);
  }
};

export default pool;
