import { pool } from '../src/lib/dbconnect.js';
import {
  assertLineGroupId,
  ensureLineNotificationTables,
  getLineMessagingConfigStatus,
  recordLineWebhookGroups,
  seedLineNotificationTopics,
  sendLineTestToGroup,
  verifyLineGroup,
} from '../src/lib/lineGroupNotifications.js';

function sendJson(res: any, status: number, payload: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
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

function toBooleanFlag(value: unknown) {
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number') return value === 1 ? 1 : 0;
  const text = String(value ?? '').trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(text) ? 1 : 0;
}

function getRoutePath(req: any) {
  const value = req.query?.path;
  const raw = Array.isArray(value) ? value.join('/') : String(value || '');
  return raw.replace(/^\/+|\/+$/g, '');
}

async function setup() {
  await ensureLineNotificationTables(pool);
  await seedLineNotificationTopics(pool);
}

async function listSettings(_req: any, res: any) {
  await setup();
  const [topicRows]: any = await pool.query(`
    SELECT
      m.menu_id, m.menu_key, m.menu_name, m.menu_icon, m.menu_href, m.sort_order, m.is_active,
      t.topic_id,
      COALESCE(t.is_enabled, 0) AS is_enabled,
      DATE_FORMAT(t.updated_at, '%Y-%m-%dT%H:%i:%s') AS updated_at
    FROM menu_items m
    LEFT JOIN line_notification_topics t ON t.menu_key = m.menu_key
    WHERE m.menu_type = 'content'
    ORDER BY m.sort_order ASC, m.menu_name ASC
  `);
  const [groups]: any = await pool.query(`
    SELECT group_ref_id, group_name, group_id, is_active,
           DATE_FORMAT(last_verified_at, '%Y-%m-%dT%H:%i:%s') AS last_verified_at,
           last_error
    FROM line_notification_groups
    ORDER BY is_active DESC, group_name ASC
  `);
  const [links]: any = await pool.query(`
    SELECT t.menu_key, tg.group_ref_id
    FROM line_notification_topic_groups tg
    INNER JOIN line_notification_topics t ON t.topic_id = tg.topic_id
  `);

  const groupIdsByTopic = new Map<string, number[]>();
  for (const link of links) {
    const key = String(link.menu_key || '');
    const next = groupIdsByTopic.get(key) || [];
    next.push(Number(link.group_ref_id));
    groupIdsByTopic.set(key, next);
  }

  return sendJson(res, 200, {
    line_config: getLineMessagingConfigStatus(),
    topics: topicRows.map((topic: any) => ({
      ...topic,
      is_enabled: Number(topic.is_enabled) === 1,
      group_ref_ids: groupIdsByTopic.get(String(topic.menu_key)) || [],
    })),
    groups: groups.map((group: any) => ({
      ...group,
      is_active: Number(group.is_active) === 1,
    })),
  });
}

async function saveSettings(req: any, res: any) {
  await setup();
  const body = await readBody(req);
  const topics = Array.isArray(body?.topics) ? body.topics : [];
  const userId = Number(body?.user_id) || null;
  const [menus]: any = await pool.query("SELECT menu_key FROM menu_items WHERE menu_type = 'content' AND is_active = 1");
  const allowedKeys = new Set(menus.map((menu: any) => String(menu.menu_key)));

  for (const topic of topics) {
    const menuKey = String(topic?.menu_key || '').trim();
    if (!allowedKeys.has(menuKey)) continue;

    await pool.query(
      `INSERT INTO line_notification_topics (menu_key, is_enabled, updated_by_user_id)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE
         is_enabled = VALUES(is_enabled),
         updated_by_user_id = VALUES(updated_by_user_id)`,
      [menuKey, topic?.is_enabled ? 1 : 0, userId],
    );

    const [topicRows]: any = await pool.query('SELECT topic_id FROM line_notification_topics WHERE menu_key = ? LIMIT 1', [menuKey]);
    const topicId = Number(topicRows[0]?.topic_id);
    if (!topicId) continue;

    await pool.query('DELETE FROM line_notification_topic_groups WHERE topic_id = ?', [topicId]);
    const groupIds = Array.isArray(topic?.group_ref_ids)
      ? [...new Set(topic.group_ref_ids.map((value: unknown) => Number(value)).filter((value: number) => Number.isFinite(value) && value > 0))]
      : [];
    if (groupIds.length > 0) {
      const [validGroups]: any = await pool.query('SELECT group_ref_id FROM line_notification_groups WHERE group_ref_id IN (?)', [groupIds]);
      const values = validGroups.map((group: any) => [topicId, Number(group.group_ref_id)]);
      if (values.length > 0) {
        await pool.query('INSERT IGNORE INTO line_notification_topic_groups (topic_id, group_ref_id) VALUES ?', [values]);
      }
    }
  }

  return sendJson(res, 200, { message: 'บันทึกตั้งค่าแจ้งเตือน LINE เรียบร้อยแล้ว' });
}

async function createGroup(req: any, res: any) {
  await setup();
  const body = await readBody(req);
  const groupId = assertLineGroupId(body?.group_id);
  const verified = await verifyLineGroup(groupId);
  const groupName = String(body?.group_name || verified.groupName || groupId).trim();
  const [result]: any = await pool.query(
    `INSERT INTO line_notification_groups
       (group_name, group_id, is_active, last_verified_at, last_error)
     VALUES (?, ?, 1, NOW(), NULL)
     ON DUPLICATE KEY UPDATE
       group_name = VALUES(group_name),
       is_active = 1,
       last_verified_at = NOW(),
       last_error = NULL`,
    [groupName, verified.groupId],
  );
  return sendJson(res, 200, { message: 'เพิ่ม LINE group เรียบร้อยแล้ว', group_ref_id: result.insertId || null });
}

async function updateGroup(req: any, res: any, groupRefId: number) {
  await setup();
  const body = await readBody(req);
  if (!groupRefId) return sendJson(res, 400, { error: 'ไม่พบรหัส LINE group' });
  const groupId = body?.group_id ? assertLineGroupId(body.group_id) : '';
  let verified: { groupId: string; groupName: string } | null = null;
  if (groupId) verified = await verifyLineGroup(groupId);
  const groupName = String(body?.group_name || verified?.groupName || '').trim();
  const isActive = toBooleanFlag(body?.is_active);

  if (groupId) {
    await pool.query(
      `UPDATE line_notification_groups
       SET group_name = COALESCE(NULLIF(?, ''), group_name),
           group_id = ?,
           is_active = ?,
           last_verified_at = NOW(),
           last_error = NULL
       WHERE group_ref_id = ?`,
      [groupName, verified?.groupId || groupId, isActive, groupRefId],
    );
  } else {
    await pool.query(
      `UPDATE line_notification_groups
       SET group_name = COALESCE(NULLIF(?, ''), group_name),
           is_active = ?
       WHERE group_ref_id = ?`,
      [groupName, isActive, groupRefId],
    );
  }
  return sendJson(res, 200, { message: 'บันทึก LINE group เรียบร้อยแล้ว' });
}

async function deleteGroup(res: any, groupRefId: number) {
  await setup();
  if (!groupRefId) return sendJson(res, 400, { error: 'ไม่พบรหัส LINE group' });
  await pool.query('DELETE FROM line_notification_groups WHERE group_ref_id = ?', [groupRefId]);
  return sendJson(res, 200, { message: 'ลบ LINE group เรียบร้อยแล้ว' });
}

async function sendTest(req: any, res: any) {
  const body = await readBody(req);
  const groupRefId = toInt(body?.group_ref_id);
  if (!groupRefId) return sendJson(res, 400, { error: 'กรุณาเลือก LINE group ที่ต้องการทดสอบ' });
  const result = await sendLineTestToGroup(pool, {
    groupRefId,
    menuKey: String(body?.menu_key || 'line_test').trim(),
    message: String(body?.message || '').trim(),
  });
  return sendJson(res, 200, { message: `ส่งข้อความทดสอบไปยัง ${result.group_name} เรียบร้อยแล้ว` });
}

async function lineWebhook(req: any, res: any) {
  const body = await readBody(req);
  const events = Array.isArray(body?.events) ? body.events : [];
  const groupIds = events
    .map((event: any) => event?.source?.type === 'group' ? event.source.groupId : '')
    .filter(Boolean);
  console.log('LINE webhook:', JSON.stringify(body));
  if (groupIds.length > 0) console.log('LINE groupId:', [...new Set(groupIds)].join(', '));
  if (groupIds.length > 0) await recordLineWebhookGroups(pool, groupIds);
  return sendJson(res, 200, { ok: true });
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const path = getRoutePath(req);

  try {
    if (path === 'settings' && req.method === 'GET') return await listSettings(req, res);
    if (path === 'settings' && req.method === 'PUT') return await saveSettings(req, res);
    if (path === 'groups' && req.method === 'POST') return await createGroup(req, res);

    const groupMatch = path.match(/^groups\/(\d+)$/);
    if (groupMatch && req.method === 'PUT') return await updateGroup(req, res, toInt(groupMatch[1]));
    if (groupMatch && req.method === 'DELETE') return await deleteGroup(res, toInt(groupMatch[1]));

    if (path === 'test' && req.method === 'POST') return await sendTest(req, res);
    if (path === 'webhook' && req.method === 'POST') return await lineWebhook(req, res);

    return sendJson(res, 404, { error: 'ไม่พบ API แจ้งเตือน LINE' });
  } catch (error) {
    console.error(error);
    return sendJson(res, 500, {
      error: error instanceof Error ? error.message : 'จัดการแจ้งเตือน LINE ไม่สำเร็จ',
    });
  }
}
