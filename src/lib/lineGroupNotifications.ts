type DbLike = {
  query: (sql: string, values?: any[]) => Promise<any>;
};

type TopicPayload = {
  menuKey: string;
  sourceType: string;
  sourceId: string | number;
  title: string;
  description?: string;
  href?: string;
};

type LinePushResult = {
  attempted: number;
  sent: number;
  failed: number;
  skipped: number;
};

const LINE_PUSH_URL = 'https://api.line.me/v2/bot/message/push';
const LINE_GROUP_ID_RE = /^C[a-zA-Z0-9_-]{20,}$/;

function toInt(value: unknown, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function trimText(value: unknown, maxLength: number) {
  const text = String(value ?? '').trim();
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function getLineMessagingToken() {
  return process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN?.trim() || '';
}

export function getLineMessagingConfigStatus() {
  const token = getLineMessagingToken();
  return {
    ready: Boolean(token),
    channel_id: process.env.LINE_MESSAGING_CHANNEL_ID?.trim() || '',
    has_channel_secret: Boolean(process.env.LINE_MESSAGING_CHANNEL_SECRET?.trim()),
    missing: token ? [] : ['LINE_MESSAGING_CHANNEL_ACCESS_TOKEN'],
  };
}

export function normalizeLineGroupId(value: unknown) {
  return String(value || '').trim();
}

export function assertLineGroupId(value: unknown) {
  const groupId = normalizeLineGroupId(value);
  if (!LINE_GROUP_ID_RE.test(groupId)) {
    throw new Error('LINE groupId ต้องขึ้นต้นด้วย C และเป็น groupId ของ LINE กลุ่มเท่านั้น');
  }
  return groupId;
}

export async function ensureLineNotificationTables(db: DbLike) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS line_notification_topics (
      topic_id INT AUTO_INCREMENT PRIMARY KEY,
      menu_key VARCHAR(100) NOT NULL UNIQUE,
      is_enabled TINYINT(1) NOT NULL DEFAULT 0,
      updated_by_user_id INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_line_notification_topic_enabled (is_enabled)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS line_notification_groups (
      group_ref_id INT AUTO_INCREMENT PRIMARY KEY,
      group_name VARCHAR(255) NOT NULL,
      group_id VARCHAR(100) NOT NULL UNIQUE,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      last_verified_at DATETIME NULL,
      last_error TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_line_notification_group_active (is_active)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS line_notification_topic_groups (
      topic_id INT NOT NULL,
      group_ref_id INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (topic_id, group_ref_id),
      CONSTRAINT fk_line_topic_groups_topic
        FOREIGN KEY (topic_id) REFERENCES line_notification_topics(topic_id) ON DELETE CASCADE,
      CONSTRAINT fk_line_topic_groups_group
        FOREIGN KEY (group_ref_id) REFERENCES line_notification_groups(group_ref_id) ON DELETE CASCADE
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS line_notification_deliveries (
      delivery_id INT AUTO_INCREMENT PRIMARY KEY,
      menu_key VARCHAR(100) NOT NULL,
      source_type VARCHAR(80) NOT NULL,
      source_id VARCHAR(80) NOT NULL,
      group_ref_id INT NULL,
      line_group_id VARCHAR(100) NULL,
      status ENUM('sent','failed','skipped') NOT NULL DEFAULT 'skipped',
      message TEXT NULL,
      error TEXT NULL,
      line_response TEXT NULL,
      sent_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_line_delivery_once (menu_key, source_type, source_id, line_group_id),
      INDEX idx_line_delivery_topic (menu_key, source_type, source_id),
      INDEX idx_line_delivery_status (status)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);
}

export async function seedLineNotificationTopics(db: DbLike) {
  await ensureLineNotificationTables(db);
  await db.query(`
    INSERT IGNORE INTO line_notification_topics (menu_key)
    SELECT menu_key
    FROM menu_items
    WHERE menu_type = 'content'
  `);
}

export async function verifyLineGroup(groupId: string) {
  const token = getLineMessagingToken();
  if (!token) throw new Error('ยังไม่ได้ตั้งค่า LINE_MESSAGING_CHANNEL_ACCESS_TOKEN');

  const response = await fetch(`https://api.line.me/v2/bot/group/${encodeURIComponent(groupId)}/summary`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await response.text();
  let payload: any = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = {};
  }

  if (!response.ok) {
    throw new Error(String(payload?.message || text || 'ตรวจสอบ LINE group ไม่สำเร็จ'));
  }

  return {
    groupId: String(payload.groupId || groupId),
    groupName: String(payload.groupName || '').trim(),
  };
}

async function pushLineText(groupId: string, text: string) {
  const token = getLineMessagingToken();
  if (!token) throw new Error('ยังไม่ได้ตั้งค่า LINE_MESSAGING_CHANNEL_ACCESS_TOKEN');

  const response = await fetch(LINE_PUSH_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to: groupId,
      messages: [{ type: 'text', text: trimText(text, 4900) }],
    }),
  });

  const bodyText = await response.text();
  if (!response.ok) {
    let payload: any = {};
    try {
      payload = bodyText ? JSON.parse(bodyText) : {};
    } catch {
      payload = {};
    }
    throw new Error(String(payload?.message || bodyText || 'ส่งข้อความ LINE ไม่สำเร็จ'));
  }

  return bodyText;
}

function buildAppUrl(href?: string) {
  const path = String(href || '').trim();
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;

  const base =
    process.env.APP_BASE_URL?.trim() ||
    process.env.PUBLIC_APP_URL?.trim() ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');
  if (!base) return path;
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

export function buildLineTopicMessage(input: {
  menuName: string;
  title: string;
  description?: string;
  href?: string;
}) {
  const lines = [
    `สตท.8: ${input.menuName}`,
    trimText(input.title, 300),
  ];
  const description = trimText(input.description, 700);
  if (description) lines.push(description);
  const url = buildAppUrl(input.href);
  if (url) lines.push(`เปิดดู: ${url}`);
  return lines.filter(Boolean).join('\n');
}

async function logDelivery(
  db: DbLike,
  input: TopicPayload,
  group: { group_ref_id?: number | null; group_id?: string | null },
  status: 'sent' | 'failed' | 'skipped',
  message: string,
  error = '',
  lineResponse = '',
) {
  const [result]: any = await db.query(
    `INSERT IGNORE INTO line_notification_deliveries
       (menu_key, source_type, source_id, group_ref_id, line_group_id, status, message, error, line_response, sent_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ${status === 'sent' ? 'NOW()' : 'NULL'})`,
    [
      input.menuKey,
      input.sourceType,
      String(input.sourceId),
      group.group_ref_id || null,
      group.group_id || null,
      status,
      message,
      error,
      lineResponse,
    ],
  );

  return toInt(result?.insertId);
}

export async function sendLineTopicNotification(db: DbLike, input: TopicPayload): Promise<LinePushResult> {
  const result: LinePushResult = { attempted: 0, sent: 0, failed: 0, skipped: 0 };

  try {
    await seedLineNotificationTopics(db);

    const [topicRows]: any = await db.query(
      `SELECT t.topic_id, t.is_enabled, m.menu_name, m.menu_href
       FROM line_notification_topics t
       INNER JOIN menu_items m ON m.menu_key = t.menu_key
       WHERE t.menu_key = ? AND m.menu_type = 'content' AND m.is_active = 1
       LIMIT 1`,
      [input.menuKey],
    );

    const topic = topicRows[0];
    const message = buildLineTopicMessage({
      menuName: topic?.menu_name || input.menuKey,
      title: input.title,
      description: input.description,
      href: input.href || topic?.menu_href,
    });

    if (!topic || Number(topic.is_enabled) !== 1) {
      await logDelivery(db, input, {}, 'skipped', message, 'topic disabled');
      result.skipped += 1;
      return result;
    }

    const [groups]: any = await db.query(
      `SELECT g.group_ref_id, g.group_id
       FROM line_notification_topic_groups tg
       INNER JOIN line_notification_groups g ON g.group_ref_id = tg.group_ref_id
       WHERE tg.topic_id = ? AND g.is_active = 1
       ORDER BY g.group_name ASC`,
      [topic.topic_id],
    );

    if (groups.length === 0) {
      await logDelivery(db, input, {}, 'skipped', message, 'no active LINE group configured');
      result.skipped += 1;
      return result;
    }

    for (const group of groups) {
      result.attempted += 1;
      const deliveryId = await logDelivery(db, input, group, 'skipped', message, 'queued');
      if (!deliveryId) {
        result.skipped += 1;
        continue;
      }

      try {
        const lineResponse = await pushLineText(group.group_id, message);
        await db.query(
          `UPDATE line_notification_deliveries
           SET status = 'sent', error = NULL, line_response = ?, sent_at = NOW()
           WHERE delivery_id = ?`,
          [lineResponse, deliveryId],
        );
        result.sent += 1;
      } catch (error) {
        await db.query(
          `UPDATE line_notification_deliveries
           SET status = 'failed', error = ?
           WHERE delivery_id = ?`,
          [error instanceof Error ? error.message : String(error), deliveryId],
        );
        result.failed += 1;
      }
    }
  } catch (error) {
    console.error('LINE group notification failed', error);
    result.failed += 1;
  }

  return result;
}

export async function sendLineTestToGroup(
  db: DbLike,
  input: { groupRefId: number; menuKey?: string; message?: string },
) {
  await ensureLineNotificationTables(db);
  const [groups]: any = await db.query(
    'SELECT group_ref_id, group_name, group_id, is_active FROM line_notification_groups WHERE group_ref_id = ? LIMIT 1',
    [input.groupRefId],
  );
  const group = groups[0];
  if (!group) throw new Error('ไม่พบ LINE group ที่เลือก');
  if (Number(group.is_active) !== 1) throw new Error('LINE group นี้ถูกปิดใช้งานอยู่');

  const text =
    trimText(input.message, 1000) ||
    `สตท.8: ทดสอบแจ้งเตือน LINE\nกลุ่ม: ${group.group_name}\nระบบส่งเข้า LINE กลุ่มเท่านั้น`;
  const lineResponse = await pushLineText(group.group_id, text);

  await db.query(
    `INSERT INTO line_notification_deliveries
       (menu_key, source_type, source_id, group_ref_id, line_group_id, status, message, line_response, sent_at)
     VALUES (?, 'test', ?, ?, ?, 'sent', ?, ?, NOW())`,
    [
      input.menuKey || 'line_test',
      String(Date.now()),
      group.group_ref_id,
      group.group_id,
      text,
      lineResponse,
    ],
  );

  return { group_name: group.group_name };
}
