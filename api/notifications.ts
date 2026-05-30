import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || '157.85.98.50',
  port: Number(process.env.DB_PORT) || 3307,
  user: process.env.DB_USER || 'admin',
  password: process.env.DB_PASSWORD || '',
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
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.end(JSON.stringify(payload));
}

async function readBody(req: any) {
  if (req.body && typeof req.body === 'object') return req.body;

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

function getRoutePath(req: any) {
  const queryPath = req.query?.path;
  const rawQueryPath = Array.isArray(queryPath) ? queryPath.join('/') : String(queryPath || '');
  if (rawQueryPath) return rawQueryPath.replace(/^\/+|\/+$/g, '');

  const pathname = new URL(req.url || '/', 'http://localhost').pathname;
  return pathname.replace(/^\/?api\/notifications\/?/, '').replace(/^\/+|\/+$/g, '');
}

type NotificationDbRow = {
  notification_type: 'knowledge' | 'activity' | 'meeting_report';
  source_id: number | string;
  title: string | null;
  subtitle: string | null;
  href: string | null;
  sort_at: string | null;
  created_at: string | null;
};

function sortNotificationRows(rows: NotificationDbRow[]) {
  return rows.sort((a, b) => {
    const aTime = Date.parse(String(a.sort_at || a.created_at || '').replace(' ', 'T'));
    const bTime = Date.parse(String(b.sort_at || b.created_at || '').replace(' ', 'T'));
    return (Number.isNaN(bTime) ? 0 : bTime) - (Number.isNaN(aTime) ? 0 : aTime);
  });
}

async function ensureNotificationTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_notification_reads (
      read_id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      notification_type ENUM('knowledge','activity','meeting_report') NOT NULL,
      source_id INT NOT NULL,
      read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_user_notification_read (user_id, notification_type, source_id),
      INDEX idx_user_notification_user (user_id),
      INDEX idx_user_notification_source (notification_type, source_id),
      FOREIGN KEY (user_id) REFERENCES user(user_id) ON DELETE CASCADE
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);
  await pool.query(`
    ALTER TABLE user_notification_reads
    MODIFY notification_type ENUM('knowledge','activity','meeting_report') NOT NULL
  `);
}

async function listNotifications(req: any, res: any) {
  await ensureNotificationTables();

  const userId = toInt(req.query?.user_id);
  if (!userId) return sendJson(res, 400, { error: 'ไม่พบรหัสผู้ใช้งาน' });

  const [knowledgeRows]: any = await pool.query(
    `SELECT
       'knowledge' AS notification_type,
       i.item_id AS source_id,
       i.title AS title,
       COALESCE(NULLIF(i.category, ''), 'คลังความรู้') AS subtitle,
       CONCAT('/knowledge/', i.item_id) AS href,
       DATE_FORMAT(COALESCE(i.published_at, i.created_at), '%Y-%m-%dT%H:%i:%s') AS sort_at,
       DATE_FORMAT(COALESCE(i.published_at, i.created_at), '%Y-%m-%dT%H:%i:%s') AS created_at
     FROM knowledge_items i
     LEFT JOIN user_notification_reads r
       ON r.user_id = ?
      AND r.notification_type = 'knowledge'
      AND r.source_id = i.item_id
     LEFT JOIN knowledge_reading_logs l
       ON l.user_id = ?
      AND l.item_id = i.item_id
     WHERE i.status = 'published'
       AND r.read_id IS NULL
       AND l.log_id IS NULL
     ORDER BY COALESCE(i.published_at, i.created_at) DESC
     LIMIT 40`,
    [userId, userId],
  );

  const [activityRows]: any = await pool.query(
    `SELECT
       'activity' AS notification_type,
       e.event_id AS source_id,
       e.title AS title,
       CONCAT(
         CASE
           WHEN e.all_day = 1 THEN 'ทั้งวัน'
           ELSE DATE_FORMAT(e.start_at, '%H:%i')
         END,
         ' · เพิ่มโดย ',
         COALESCE(NULLIF(e.created_by_name, ''), u.Name_Surnam, 'ไม่ระบุ')
       ) AS subtitle,
       CONCAT('/activity-calendar?date=', DATE_FORMAT(e.start_at, '%Y-%m-%d'), '&event=', e.event_id) AS href,
       DATE_FORMAT(e.created_at, '%Y-%m-%dT%H:%i:%s') AS sort_at,
       DATE_FORMAT(e.created_at, '%Y-%m-%dT%H:%i:%s') AS created_at
     FROM activity_events e
     LEFT JOIN user u ON u.user_id = e.created_by_user_id
     LEFT JOIN user_notification_reads r
       ON r.user_id = ?
      AND r.notification_type = 'activity'
      AND r.source_id = e.event_id
     WHERE e.source = 'system'
       AND e.visibility = 'org'
       AND r.read_id IS NULL
     ORDER BY e.created_at DESC
     LIMIT 40`,
    [userId],
  );

  const [meetingReportRows]: any = await pool.query(
    `SELECT
       'meeting_report' AS notification_type,
       mr.report_id AS source_id,
       mr.title AS title,
       CONCAT('รายงานการประชุม', CASE WHEN mr.section = 'area' THEN 'สำนักงานในพื้นที่' ELSE 'สำนักงาน' END) AS subtitle,
       CONCAT('/meeting-reports/', mr.report_id) AS href,
       DATE_FORMAT(COALESCE(mr.published_at, mr.updated_at), '%Y-%m-%dT%H:%i:%s') AS sort_at,
       DATE_FORMAT(COALESCE(mr.published_at, mr.updated_at), '%Y-%m-%dT%H:%i:%s') AS created_at
     FROM meeting_reports mr
     LEFT JOIN user_notification_reads r
       ON r.user_id = ?
      AND r.notification_type = 'meeting_report'
      AND r.source_id = mr.report_id
     LEFT JOIN meeting_report_read_logs l
       ON l.user_id = ?
      AND l.report_id = mr.report_id
     WHERE mr.status = 'published'
       AND r.read_id IS NULL
       AND l.log_id IS NULL
       AND EXISTS (
         SELECT 1
         FROM user u
         INNER JOIN group_permissions gp ON gp.group_id = u.user_status AND gp.can_view = 1
         INNER JOIN menu_items m ON m.menu_id = gp.menu_id AND m.is_active = 1
         WHERE u.user_id = ?
           AND m.menu_key = CASE WHEN mr.section = 'area' THEN 'meeting_reports_area' ELSE 'meeting_reports_office' END
         LIMIT 1
       )
     ORDER BY COALESCE(mr.published_at, mr.updated_at) DESC
     LIMIT 40`,
    [userId, userId, userId],
  );

  const rows = sortNotificationRows([
    ...(knowledgeRows as NotificationDbRow[]),
    ...(activityRows as NotificationDbRow[]),
    ...(meetingReportRows as NotificationDbRow[]),
  ]).slice(0, 40);

  return sendJson(res, 200, rows.map((row) => ({
    id: `${row.notification_type}:${row.source_id}`,
    type: row.notification_type,
    source_id: Number(row.source_id),
    title: row.title || '',
    subtitle: row.subtitle || '',
    href: row.href || '/index',
    created_at: row.created_at || '',
  })));
}

async function markNotificationRead(req: any, res: any) {
  await ensureNotificationTables();
  const body = await readBody(req);
  const userId = toInt(body.user_id);
  const sourceId = toInt(body.source_id);
  const notificationType = String(body.notification_type || '').trim();

  if (!userId || !sourceId || !['knowledge', 'activity', 'meeting_report'].includes(notificationType)) {
    return sendJson(res, 400, { error: 'ข้อมูลแจ้งเตือนไม่ครบถ้วน' });
  }

  await pool.query(
    `INSERT INTO user_notification_reads (user_id, notification_type, source_id)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE read_at = CURRENT_TIMESTAMP`,
    [userId, notificationType, sourceId],
  );

  return sendJson(res, 200, { message: 'อ่านแจ้งเตือนแล้ว' });
}

export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') return sendJson(res, 204, {});

  try {
    const routePath = getRoutePath(req);
    if (req.method === 'GET' && routePath === '') return await listNotifications(req, res);
    if (req.method === 'POST' && routePath === 'read') return await markNotificationRead(req, res);
    return sendJson(res, 404, { error: 'ไม่พบเส้นทางแจ้งเตือน' });
  } catch (error) {
    console.error(error);
    return sendJson(res, 500, { error: 'ไม่สามารถประมวลผลแจ้งเตือนได้' });
  }
}
