import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: process.env.DB_HOST || '157.85.98.50',
  port: Number(process.env.DB_PORT) || 3307,
  user: process.env.DB_USER || 'admin',
  password: process.env.DB_PASSWORD || '041853671',
  database: process.env.DB_NAME || 'isr8',
  timezone: '+07:00',
  dateStrings: true,
  waitForConnections: true,
  connectionLimit: 2,
  queueLimit: 0,
});

function sendJson(res: any, status: number, payload: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.end(JSON.stringify(payload));
}

async function readBody(req: any) {
  if (req.body) return req.body;

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const text = Buffer.concat(chunks).toString('utf8');
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function toInt(value: unknown, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getQuestionId(req: any) {
  const pathValue = Array.isArray(req.query?.path) ? req.query.path.join('/') : String(req.query?.path || '');
  const fromPath = pathValue.split('/').filter(Boolean).pop();
  return toInt(req.query?.questionId || req.query?.question_id || fromPath || req.url?.split('/').filter(Boolean).pop());
}

async function ensureTrainingQuestionTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS training_quizzes (
      quiz_id INT AUTO_INCREMENT PRIMARY KEY,
      course_id INT NOT NULL,
      quiz_type ENUM('pre','post') NOT NULL,
      title VARCHAR(255) NOT NULL,
      pass_score INT DEFAULT 70,
      time_limit_minutes INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_training_quiz_type (course_id, quiz_type),
      FOREIGN KEY (course_id) REFERENCES training_courses(course_id) ON DELETE CASCADE
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS training_questions (
      question_id INT AUTO_INCREMENT PRIMARY KEY,
      quiz_id INT NOT NULL,
      question_text TEXT NOT NULL,
      sort_order INT DEFAULT 0,
      FOREIGN KEY (quiz_id) REFERENCES training_quizzes(quiz_id) ON DELETE CASCADE
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS training_choices (
      choice_id INT AUTO_INCREMENT PRIMARY KEY,
      question_id INT NOT NULL,
      choice_text TEXT NOT NULL,
      is_correct TINYINT(1) DEFAULT 0,
      sort_order INT DEFAULT 0,
      FOREIGN KEY (question_id) REFERENCES training_questions(question_id) ON DELETE CASCADE
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);
}

async function updateQuestion(req: any, res: any) {
  const questionId = getQuestionId(req);
  const body = await readBody(req);
  const courseId = toInt(body.course_id);
  const quizType = body.quiz_type === 'pre' ? 'pre' : 'post';
  const questionText = String(body.question_text || '').trim();
  const choices = Array.isArray(body.choices)
    ? body.choices
        .map((choice: unknown, index: number) => ({ choiceText: String(choice || '').trim(), originalIndex: index }))
        .filter((choice: { choiceText: string }) => Boolean(choice.choiceText))
    : [];
  const correctOriginalIndex = toInt(body.correct_index);
  const hasCorrectChoice = choices.some((choice: { originalIndex: number }) => choice.originalIndex === correctOriginalIndex);

  if (!questionId) return sendJson(res, 400, { error: 'ไม่พบรหัสข้อสอบ' });
  if (!courseId) return sendJson(res, 400, { error: 'ไม่พบรหัสหลักสูตร' });
  if (!questionText) return sendJson(res, 400, { error: 'กรุณาระบุคำถาม' });
  if (choices.length < 2) return sendJson(res, 400, { error: 'กรุณาระบุตัวเลือกอย่างน้อย 2 ตัวเลือก' });
  if (!hasCorrectChoice) return sendJson(res, 400, { error: 'กรุณาเลือกคำตอบที่ถูกต้องจากตัวเลือกที่มีข้อความ' });

  await ensureTrainingQuestionTables();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query(
      `INSERT INTO training_quizzes (course_id, quiz_type, title, pass_score)
       VALUES (?, ?, ?, 70)
       ON DUPLICATE KEY UPDATE quiz_id = LAST_INSERT_ID(quiz_id)`,
      [courseId, quizType, quizType === 'pre' ? 'แบบทดสอบก่อนเรียน' : 'แบบทดสอบหลังเรียน'],
    );
    const [quizRows]: any = await connection.query('SELECT LAST_INSERT_ID() AS quiz_id');
    const quizId = quizRows[0]?.quiz_id;

    const [result]: any = await connection.query(
      'UPDATE training_questions SET quiz_id = ?, question_text = ?, sort_order = ? WHERE question_id = ?',
      [quizId, questionText, toInt(body.sort_order), questionId],
    );
    if (result.affectedRows === 0) {
      await connection.rollback();
      return sendJson(res, 404, { error: 'ไม่พบข้อสอบที่ต้องการแก้ไข' });
    }

    await connection.query('DELETE FROM training_choices WHERE question_id = ?', [questionId]);
    await connection.query(
      'INSERT INTO training_choices (question_id, choice_text, is_correct, sort_order) VALUES ?',
      [choices.map((choice: { choiceText: string; originalIndex: number }, index: number) => [
        questionId,
        choice.choiceText,
        choice.originalIndex === correctOriginalIndex ? 1 : 0,
        index + 1,
      ])],
    );
    await connection.commit();
    return sendJson(res, 200, { message: 'แก้ไขข้อสอบเรียบร้อยแล้ว' });
  } catch (error) {
    await connection.rollback();
    console.error(error);
    return sendJson(res, 500, { error: 'แก้ไขข้อสอบไม่สำเร็จ' });
  } finally {
    connection.release();
  }
}

async function deleteQuestion(req: any, res: any) {
  const questionId = getQuestionId(req);
  if (!questionId) return sendJson(res, 400, { error: 'ไม่พบรหัสข้อสอบ' });
  await ensureTrainingQuestionTables();
  const [result]: any = await pool.query('DELETE FROM training_questions WHERE question_id = ?', [questionId]);
  if (result.affectedRows === 0) return sendJson(res, 404, { error: 'ไม่พบข้อสอบที่ต้องการลบ' });
  return sendJson(res, 200, { message: 'ลบข้อสอบเรียบร้อยแล้ว' });
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return sendJson(res, 204, {});

  try {
    if (req.method === 'PUT') return await updateQuestion(req, res);
    if (req.method === 'DELETE') return await deleteQuestion(req, res);
    return sendJson(res, 405, { error: 'Method not allowed' });
  } catch (error) {
    console.error(error);
    return sendJson(res, 500, { error: 'ไม่สามารถประมวลผลข้อสอบได้' });
  }
}
