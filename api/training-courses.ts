import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  timezone: '+07:00',
  dateStrings: true,
  waitForConnections: true,
  connectionLimit: 2,
  queueLimit: 0,
});

type VercelRequest = any;
type VercelResponse = any;
type AnyRecord = Record<string, any>;

function setCors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function sendJson(res: VercelResponse, status: number, payload: unknown) {
  setCors(res);
  res.status(status).json(payload);
}

function parseRequestBody(req: VercelRequest): AnyRecord {
  const body = req.body;
  if (!body) return {};
  if (Buffer.isBuffer(body)) {
    try {
      return JSON.parse(body.toString('utf8')) as AnyRecord;
    } catch {
      return {};
    }
  }
  if (typeof body === 'string') {
    try {
      return JSON.parse(body) as AnyRecord;
    } catch {
      return {};
    }
  }
  if (typeof body === 'object') return body as AnyRecord;
  return {};
}

function getQueryValue(value: unknown) {
  return Array.isArray(value) ? value[0] : value;
}

function toInt(value: unknown, fallback = 0) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? Math.round(numberValue) : fallback;
}

function toBooleanFlag(value: unknown) {
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number') return value > 0 ? 1 : 0;
  const text = String(value ?? '').trim().toLowerCase();
  return ['1', 'true', 'yes', 'on', 'เปิด', 'enabled'].includes(text) ? 1 : 0;
}

function toBooleanFlagWithDefault(value: unknown, fallback = 1) {
  if (value === undefined || value === null || value === '') return fallback;
  return toBooleanFlag(value);
}

function normalizeCourseType(value: unknown) {
  const text = String(value || '').trim().toLowerCase();
  if (['online', 'zoom', 'onsite'].includes(text)) return text;
  if (text.includes('zoom')) return 'zoom';
  if (text.includes('on-site') || text.includes('onsite') || text.includes('สถานที่')) return 'onsite';
  if (text.includes('ออนไลน์') || text.includes('online')) return 'online';
  return 'online';
}

function normalizeTrainingStatus(value: unknown) {
  const text = String(value || '').trim();
  if (['draft', 'open', 'closed'].includes(text)) return text;
  return 'open';
}

function normalizeDateOnly(value: unknown) {
  if (value === undefined || value === null || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const text = String(value).trim();
  if (!text) return null;
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const normalized = `${match[1]}-${match[2]}-${match[3]}`;
  const date = new Date(`${normalized}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return normalized;
}

function firstPresentBodyValue(body: AnyRecord, keys: string[]) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(body, key)) return body[key];
  }
  return undefined;
}

function normalizeTrainingDateRange(body: AnyRecord, courseType: string) {
  if (courseType !== 'zoom' && courseType !== 'onsite') {
    return { trainingStartDate: null, trainingEndDate: null };
  }

  const start = normalizeDateOnly(
    firstPresentBodyValue(body, [
      'training_start_date',
      'trainingStartDate',
      'start_date',
      'startDate',
      'training_date',
      'trainingDate',
    ]),
  );
  const end =
    normalizeDateOnly(
      firstPresentBodyValue(body, [
        'training_end_date',
        'trainingEndDate',
        'end_date',
        'endDate',
        'training_date_end',
        'trainingDateEnd',
      ]),
    ) || start;

  if (start && end && end < start) {
    return { trainingStartDate: end, trainingEndDate: start };
  }

  return { trainingStartDate: start, trainingEndDate: end };
}

function getYouTubeEmbedUrl(value: unknown) {
  const text = String(value || '').trim();
  if (!text) return '';

  try {
    const url = new URL(text);
    let videoId = '';
    if (url.hostname.includes('youtu.be')) {
      videoId = url.pathname.replace('/', '').split('/')[0];
    } else if (url.pathname.includes('/embed/')) {
      videoId = url.pathname.split('/embed/')[1]?.split('/')[0] || '';
    } else {
      videoId = url.searchParams.get('v') || '';
    }
    return videoId ? `https://www.youtube.com/embed/${videoId}` : '';
  } catch {
    return '';
  }
}

async function ensureColumn(tableName: string, columnName: string, definition: string) {
  const [rows] = await pool.query<any[]>(
    `SELECT COUNT(*) AS count
       FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?`,
    [tableName, columnName],
  );
  if (Number(rows?.[0]?.count || 0) > 0) return;

  try {
    await pool.query(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${definition}`);
  } catch (error: any) {
    if (error?.code !== 'ER_DUP_FIELDNAME') throw error;
  }
}

async function ensureTrainingSchemaColumns() {
  await ensureColumn('training_courses', 'pre_quiz_enabled', 'TINYINT(1) DEFAULT 1');
  await ensureColumn('training_courses', 'post_quiz_enabled', 'TINYINT(1) DEFAULT 1');
  await ensureColumn('training_courses', 'training_start_date', 'DATE NULL');
  await ensureColumn('training_courses', 'training_end_date', 'DATE NULL');
  await ensureColumn('training_quizzes', 'time_limit_minutes', 'INT DEFAULT 0');
}

function buildCoursePayload(body: AnyRecord, existingCourse?: AnyRecord) {
  const mergedBody = existingCourse ? { ...existingCourse, ...body } : body;
  const courseType = normalizeCourseType(mergedBody.course_type);
  const status = normalizeTrainingStatus(mergedBody.status);
  const dateRange = normalizeTrainingDateRange(mergedBody, courseType);

  return {
    title: String(mergedBody.title || '').trim(),
    category: String(mergedBody.category || ''),
    courseType,
    status,
    thumbnailUrl: String(mergedBody.thumbnail_url || mergedBody.thumbnailUrl || ''),
    instructor: String(mergedBody.instructor || ''),
    targetGroup: String(mergedBody.target_group || mergedBody.targetGroup || ''),
    learningObjectives: String(mergedBody.learning_objectives || mergedBody.learningObjectives || ''),
    learningTopics: String(mergedBody.learning_topics || mergedBody.learningTopics || ''),
    contentSummary: String(mergedBody.content_summary || mergedBody.contentSummary || ''),
    evaluationMethod: String(mergedBody.evaluation_method || mergedBody.evaluationMethod || ''),
    description: String(mergedBody.description || ''),
    durationMinutes: toInt(mergedBody.duration_minutes || mergedBody.durationMinutes, 0),
    zoomUrl: String(mergedBody.zoom_url || mergedBody.zoomUrl || ''),
    location: String(mergedBody.location || ''),
    trainingStartDate: dateRange.trainingStartDate,
    trainingEndDate: dateRange.trainingEndDate,
    passScore: toInt(mergedBody.pass_score || mergedBody.passScore, 70),
    preQuizEnabled: toBooleanFlagWithDefault(
      firstPresentBodyValue(mergedBody, ['pre_quiz_enabled', 'preQuizEnabled']),
      1,
    ),
    postQuizEnabled: toBooleanFlagWithDefault(
      firstPresentBodyValue(mergedBody, ['post_quiz_enabled', 'postQuizEnabled']),
      1,
    ),
    certificateEnabled: toBooleanFlagWithDefault(
      firstPresentBodyValue(mergedBody, ['certificate_enabled', 'certificateEnabled']),
      1,
    ),
  };
}

async function handlePublicCourses(req: VercelRequest, res: VercelResponse) {
  await ensureTrainingSchemaColumns();
  const userId = toInt(getQueryValue(req.query.user_id), 0);
  const params: any[] = [];
  let enrollmentSelect =
    'NULL AS enrollment_id, NULL AS enrollment_status, 0 AS attended_seconds, NULL AS pre_score, NULL AS post_score, 0 AS evaluated';
  let enrollmentJoin = '';

  if (userId > 0) {
    enrollmentSelect =
      'e.enrollment_id, e.status AS enrollment_status, e.attended_seconds, e.pre_score, e.post_score, e.evaluated';
    enrollmentJoin = 'LEFT JOIN training_enrollments e ON e.course_id = c.course_id AND e.user_id = ?';
    params.push(userId);
  }

  const [rows] = await pool.query<any[]>(
    `SELECT c.*,
            DATE_FORMAT(c.training_start_date, '%Y-%m-%d') AS training_start_date,
            DATE_FORMAT(c.training_end_date, '%Y-%m-%d') AS training_end_date,
            ${enrollmentSelect},
            (SELECT COUNT(*) FROM training_enrollments WHERE course_id = c.course_id) AS enrolled_count,
            (SELECT COUNT(*) FROM training_lessons WHERE course_id = c.course_id) AS lesson_count,
            (SELECT COUNT(*) FROM training_materials WHERE course_id = c.course_id) AS material_count
       FROM training_courses c
       ${enrollmentJoin}
      WHERE c.status <> 'draft'
      ORDER BY c.updated_at DESC, c.course_id DESC`,
    params,
  );

  sendJson(res, 200, rows);
}

async function handleCourseDetail(req: VercelRequest, res: VercelResponse, id: number) {
  await ensureTrainingSchemaColumns();
  if (!id) return sendJson(res, 400, { error: 'ไม่พบรหัสหลักสูตร' });

  const userId = toInt(getQueryValue(req.query.user_id), 0);
  const [courseRows] = await pool.query<any[]>(
    `SELECT c.*,
            DATE_FORMAT(c.training_start_date, '%Y-%m-%d') AS training_start_date,
            DATE_FORMAT(c.training_end_date, '%Y-%m-%d') AS training_end_date
       FROM training_courses c
      WHERE c.course_id = ?
      LIMIT 1`,
    [id],
  );

  if (!courseRows.length) return sendJson(res, 404, { error: 'ไม่พบหลักสูตรอบรม' });

  const [lessons] = await pool.query<any[]>(
    'SELECT * FROM training_lessons WHERE course_id = ? ORDER BY sort_order, lesson_id',
    [id],
  );
  const [materials] = await pool.query<any[]>(
    'SELECT * FROM training_materials WHERE course_id = ? ORDER BY sort_order, material_id',
    [id],
  );
  const [quizzes] = await pool.query<any[]>(
    `SELECT quiz_id, course_id, quiz_type, title, pass_score, time_limit_minutes
       FROM training_quizzes
      WHERE course_id = ?
      ORDER BY FIELD(quiz_type, 'pre', 'post'), quiz_id`,
    [id],
  );

  let enrollment = null;
  if (userId > 0) {
    const [enrollmentRows] = await pool.query<any[]>(
      'SELECT * FROM training_enrollments WHERE course_id = ? AND user_id = ? LIMIT 1',
      [id, userId],
    );
    enrollment = enrollmentRows[0] || null;
  }

  sendJson(res, 200, {
    ...courseRows[0],
    lessons: lessons.map((lesson) => ({ ...lesson, embed_url: getYouTubeEmbedUrl(lesson.youtube_url) })),
    materials,
    quizzes,
    enrollment,
  });
}

async function handleAdminCourses(res: VercelResponse) {
  await ensureTrainingSchemaColumns();
  const [rows] = await pool.query<any[]>(
    `SELECT c.*,
            DATE_FORMAT(c.training_start_date, '%Y-%m-%d') AS training_start_date,
            DATE_FORMAT(c.training_end_date, '%Y-%m-%d') AS training_end_date,
            (SELECT COUNT(*) FROM training_enrollments WHERE course_id = c.course_id) AS enrolled_count,
            (SELECT COUNT(*) FROM training_lessons WHERE course_id = c.course_id) AS lesson_count,
            (SELECT COUNT(*) FROM training_materials WHERE course_id = c.course_id) AS material_count
       FROM training_courses c
      ORDER BY c.updated_at DESC, c.course_id DESC`,
  );
  sendJson(res, 200, rows);
}

async function handleCreateCourse(req: VercelRequest, res: VercelResponse) {
  await ensureTrainingSchemaColumns();
  const body = parseRequestBody(req);
  const payload = buildCoursePayload(body);
  if (!payload.title) return sendJson(res, 400, { error: 'กรุณากรอกชื่อหลักสูตร' });

  const [result] = await pool.query<any>(
    `INSERT INTO training_courses (
       title, category, course_type, status, thumbnail_url, instructor, target_group,
       learning_objectives, learning_topics, content_summary, evaluation_method, description,
       duration_minutes, zoom_url, location, training_start_date, training_end_date,
       pass_score, pre_quiz_enabled, post_quiz_enabled, certificate_enabled
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      payload.title,
      payload.category,
      payload.courseType,
      payload.status,
      payload.thumbnailUrl,
      payload.instructor,
      payload.targetGroup,
      payload.learningObjectives,
      payload.learningTopics,
      payload.contentSummary,
      payload.evaluationMethod,
      payload.description,
      payload.durationMinutes,
      payload.zoomUrl,
      payload.location,
      payload.trainingStartDate,
      payload.trainingEndDate,
      payload.passScore,
      payload.preQuizEnabled,
      payload.postQuizEnabled,
      payload.certificateEnabled,
    ],
  );

  sendJson(res, 201, { success: true, course_id: result.insertId });
}

async function handleUpdateCourse(req: VercelRequest, res: VercelResponse, id: number) {
  await ensureTrainingSchemaColumns();
  if (!id) return sendJson(res, 400, { error: 'ไม่พบรหัสหลักสูตร' });

  const [existingRows] = await pool.query<any[]>('SELECT * FROM training_courses WHERE course_id = ? LIMIT 1', [id]);
  if (!existingRows.length) return sendJson(res, 404, { error: 'ไม่พบหลักสูตรอบรม' });

  const body = parseRequestBody(req);
  const payload = buildCoursePayload(body, existingRows[0]);
  if (!payload.title) return sendJson(res, 400, { error: 'กรุณากรอกชื่อหลักสูตร' });

  await pool.query(
    `UPDATE training_courses
        SET title = ?,
            category = ?,
            course_type = ?,
            status = ?,
            thumbnail_url = ?,
            instructor = ?,
            target_group = ?,
            learning_objectives = ?,
            learning_topics = ?,
            content_summary = ?,
            evaluation_method = ?,
            description = ?,
            duration_minutes = ?,
            zoom_url = ?,
            location = ?,
            training_start_date = ?,
            training_end_date = ?,
            pass_score = ?,
            pre_quiz_enabled = ?,
            post_quiz_enabled = ?,
            certificate_enabled = ?,
            updated_at = CURRENT_TIMESTAMP
      WHERE course_id = ?`,
    [
      payload.title,
      payload.category,
      payload.courseType,
      payload.status,
      payload.thumbnailUrl,
      payload.instructor,
      payload.targetGroup,
      payload.learningObjectives,
      payload.learningTopics,
      payload.contentSummary,
      payload.evaluationMethod,
      payload.description,
      payload.durationMinutes,
      payload.zoomUrl,
      payload.location,
      payload.trainingStartDate,
      payload.trainingEndDate,
      payload.passScore,
      payload.preQuizEnabled,
      payload.postQuizEnabled,
      payload.certificateEnabled,
      id,
    ],
  );

  sendJson(res, 200, { success: true });
}

async function handleDeleteCourse(res: VercelResponse, id: number) {
  await ensureTrainingSchemaColumns();
  if (!id) return sendJson(res, 400, { error: 'ไม่พบรหัสหลักสูตร' });
  await pool.query('DELETE FROM training_courses WHERE course_id = ?', [id]);
  sendJson(res, 200, { success: true });
}

async function handleTrainingHistory(res: VercelResponse, userId: number) {
  await ensureTrainingSchemaColumns();
  if (!userId) return sendJson(res, 400, { error: 'ไม่พบรหัสผู้ใช้' });

  const [rows] = await pool.query<any[]>(
    `SELECT e.*,
            c.title,
            c.category,
            c.course_type,
            c.thumbnail_url,
            c.instructor,
            c.pass_score,
            c.duration_minutes,
            c.certificate_enabled,
            DATE_FORMAT(c.training_start_date, '%Y-%m-%d') AS training_start_date,
            DATE_FORMAT(c.training_end_date, '%Y-%m-%d') AS training_end_date
       FROM training_enrollments e
       INNER JOIN training_courses c ON c.course_id = e.course_id
      WHERE e.user_id = ?
      ORDER BY e.registered_at DESC`,
    [userId],
  );

  sendJson(res, 200, rows);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const mode = String(getQueryValue(req.query.mode) || '').trim();
    const id = toInt(getQueryValue(req.query.id), 0);
    const userId = toInt(getQueryValue(req.query.userId), 0);

    if (mode === 'public' && req.method === 'GET') return handlePublicCourses(req, res);
    if (mode === 'detail' && req.method === 'GET') return handleCourseDetail(req, res, id);
    if (mode === 'history' && req.method === 'GET') return handleTrainingHistory(res, userId);
    if (mode === 'admin' && req.method === 'GET') return handleAdminCourses(res);
    if (mode === 'admin' && req.method === 'POST') return handleCreateCourse(req, res);
    if (mode === 'admin-detail' && req.method === 'GET') return handleCourseDetail(req, res, id);
    if (mode === 'admin-detail' && req.method === 'PUT') return handleUpdateCourse(req, res, id);
    if (mode === 'admin-detail' && req.method === 'DELETE') return handleDeleteCourse(res, id);

    return sendJson(res, 404, { error: 'ไม่พบ API ระบบอบรมที่ต้องการ' });
  } catch (error) {
    console.error('training-courses api error:', error);
    return sendJson(res, 500, { error: 'ระบบอบรมทำงานไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' });
  }
}
