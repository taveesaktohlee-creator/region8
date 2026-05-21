import mysql from 'mysql2/promise';

type EvaluationQuestionType = 'rating' | 'single_choice' | 'multiple_choice' | 'text';

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
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
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

function normalizeQuestionType(value: unknown): EvaluationQuestionType {
  const raw = String(value || '').trim();
  if (raw === 'single_choice' || raw === 'multiple_choice' || raw === 'text') return raw;
  return 'rating';
}

async function ensureEvaluationTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS training_evaluation_questions (
      question_id INT AUTO_INCREMENT PRIMARY KEY,
      course_id INT NOT NULL,
      question_text TEXT NOT NULL,
      question_type ENUM('rating','single_choice','multiple_choice','text') NOT NULL DEFAULT 'rating',
      is_required TINYINT(1) DEFAULT 1,
      sort_order INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (course_id) REFERENCES training_courses(course_id) ON DELETE CASCADE,
      INDEX idx_training_eval_question_course (course_id)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS training_evaluation_options (
      option_id INT AUTO_INCREMENT PRIMARY KEY,
      question_id INT NOT NULL,
      option_text TEXT NOT NULL,
      sort_order INT DEFAULT 0,
      FOREIGN KEY (question_id) REFERENCES training_evaluation_questions(question_id) ON DELETE CASCADE
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS training_evaluation_responses (
      response_id INT AUTO_INCREMENT PRIMARY KEY,
      enrollment_id INT NOT NULL UNIQUE,
      course_id INT NOT NULL,
      user_id INT NOT NULL,
      submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_training_eval_response_course (course_id)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS training_evaluation_answers (
      answer_id INT AUTO_INCREMENT PRIMARY KEY,
      response_id INT NOT NULL,
      question_id INT NOT NULL,
      answer_value TEXT NULL,
      FOREIGN KEY (response_id) REFERENCES training_evaluation_responses(response_id) ON DELETE CASCADE,
      FOREIGN KEY (question_id) REFERENCES training_evaluation_questions(question_id) ON DELETE CASCADE
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);
}

async function getQuestions(courseId: number) {
  const [questions]: any = await pool.query(
    `SELECT question_id, course_id, question_text, question_type, is_required, sort_order
     FROM training_evaluation_questions
     WHERE course_id = ?
     ORDER BY sort_order, question_id`,
    [courseId],
  );
  const questionIds = questions.map((question: any) => question.question_id);
  const [options]: any = questionIds.length > 0
    ? await pool.query(
        `SELECT option_id, question_id, option_text, sort_order
         FROM training_evaluation_options
         WHERE question_id IN (?)
         ORDER BY question_id, sort_order, option_id`,
        [questionIds],
      )
    : [[]];

  return questions.map((question: any) => ({
    ...question,
    options: options.filter((option: any) => option.question_id === question.question_id),
  }));
}

async function getReport(courseId: number) {
  const questions = await getQuestions(courseId);
  const [responses]: any = await pool.query(
    `SELECT response_id
     FROM training_evaluation_responses
     WHERE course_id = ?`,
    [courseId],
  );
  const responseIds = responses.map((response: any) => response.response_id);
  const [answers]: any = responseIds.length > 0
    ? await pool.query(
        `SELECT response_id, question_id, answer_value
         FROM training_evaluation_answers
         WHERE response_id IN (?)`,
        [responseIds],
      )
    : [[]];

  const summaries = questions.map((question: any) => {
    const questionAnswers = answers.filter((answer: any) => answer.question_id === question.question_id);
    if (question.question_type === 'rating') {
      const ratings = questionAnswers
        .map((answer: any) => Number(answer.answer_value))
        .filter((value: number) => Number.isFinite(value) && value > 0);
      return {
        ...question,
        total_answers: ratings.length,
        average_rating: ratings.length > 0 ? Number((ratings.reduce((sum: number, value: number) => sum + value, 0) / ratings.length).toFixed(2)) : null,
      };
    }

    if (question.question_type === 'single_choice' || question.question_type === 'multiple_choice') {
      const counts: Record<string, number> = {};
      questionAnswers.forEach((answer: any) => {
        let values: string[] = [];
        if (question.question_type === 'multiple_choice') {
          try { values = JSON.parse(answer.answer_value || '[]'); } catch { values = []; }
        } else if (answer.answer_value) {
          values = [String(answer.answer_value)];
        }
        values.forEach((value) => { counts[value] = (counts[value] || 0) + 1; });
      });
      return { ...question, total_answers: questionAnswers.length, option_counts: counts };
    }

    return {
      ...question,
      total_answers: questionAnswers.filter((answer: any) => String(answer.answer_value || '').trim()).length,
      text_answers: questionAnswers.map((answer: any) => String(answer.answer_value || '').trim()).filter(Boolean).slice(0, 30),
    };
  });

  return { response_count: responses.length, questions: summaries };
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  try {
    await ensureEvaluationTables();
    const courseId = toInt(req.query.courseId);
    const questionId = toInt(req.query.questionId);

    if (req.method === 'GET') {
      if (!courseId) return sendJson(res, 400, { error: 'ไม่พบรหัสหลักสูตร' });
      const data = req.query.mode === 'report' ? await getReport(courseId) : await getQuestions(courseId);
      return sendJson(res, 200, data);
    }

    if (req.method === 'POST') {
      if (!courseId) return sendJson(res, 400, { error: 'ไม่พบรหัสหลักสูตร' });
      const body = await readBody(req);
      const questionText = String(body.question_text || '').trim();
      const questionType = normalizeQuestionType(body.question_type);
      const options = Array.isArray(body.options)
        ? body.options.map((option: unknown) => String(option || '').trim()).filter(Boolean)
        : [];

      if (!questionText) return sendJson(res, 400, { error: 'กรุณาระบุหัวข้อการประเมิน' });
      if ((questionType === 'single_choice' || questionType === 'multiple_choice') && options.length < 2) {
        return sendJson(res, 400, { error: 'คำถามแบบตัวเลือกต้องมีตัวเลือกอย่างน้อย 2 รายการ' });
      }

      const [result]: any = await pool.query(
        `INSERT INTO training_evaluation_questions
         (course_id, question_text, question_type, is_required, sort_order)
         VALUES (?, ?, ?, ?, ?)`,
        [courseId, questionText, questionType, body.is_required === false ? 0 : 1, toInt(body.sort_order)],
      );

      if (options.length > 0) {
        await pool.query(
          'INSERT INTO training_evaluation_options (question_id, option_text, sort_order) VALUES ?',
          [options.map((option: string, index: number) => [result.insertId, option, index + 1])],
        );
      }

      return sendJson(res, 200, { message: 'เพิ่มหัวข้อการประเมินเรียบร้อยแล้ว', question_id: result.insertId });
    }

    if (req.method === 'DELETE') {
      if (!questionId) return sendJson(res, 400, { error: 'ไม่พบรหัสหัวข้อประเมิน' });
      await pool.query('DELETE FROM training_evaluation_questions WHERE question_id = ?', [questionId]);
      return sendJson(res, 200, { message: 'ลบหัวข้อการประเมินเรียบร้อยแล้ว' });
    }

    return sendJson(res, 405, { error: 'Method not allowed' });
  } catch (error) {
    console.error(error);
    return sendJson(res, 500, {
      error: error instanceof Error ? error.message : 'ไม่สามารถจัดการแบบประเมินได้',
    });
  }
}
