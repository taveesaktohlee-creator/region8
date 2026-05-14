import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import { pool } from './src/lib/dbconnect.js';

const app = express();
app.use(cors());
app.use(express.json());

// หน้าแรกสำหรับตรวจสอบสถานะ Server
app.get('/', (req, res) => {
  res.send('Region 8 API Server is running!');
});

// ตรวจสอบสุขภาพระบบและการเชื่อมต่อฐานข้อมูล
app.get('/api/health', async (req, res) => {
  try {
    const [rows]: any = await pool.query('SELECT 1 as connected');
    res.json({ 
      status: 'OK', 
      database: rows[0].connected === 1 ? 'Connected' : 'Error',
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    res.status(500).json({ 
      status: 'Error', 
      database: 'Disconnected', 
      error: error.message 
    });
  }
});

// ค้นหาชื่อ-นามสกุลจาก user_confirm
app.get('/api/users/search-confirm', async (req, res) => {
  try {
    const q = req.query.q || '';
    const [rows] = await pool.query(
      'SELECT id, Name_Surname, position, type, Division_Province, Department FROM user_confirm WHERE Name_Surname LIKE ? LIMIT 10',
      [`%${q}%`]
    );
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ตรวจสอบข้อมูลซ้ำ และลงทะเบียน
app.post('/api/users/register', async (req, res) => {
  try {
    const { 
      Name_Surname, position, type, Division_Province, Department, 
      email, username, password 
    } = req.body;

    // 1. เช็คชื่อนามสกุลซ้ำ
    const [nameCheck]: any = await pool.query(
      'SELECT user_id FROM user WHERE Name_Surnam = ?', 
      [Name_Surname]
    );
    if (nameCheck.length > 0) {
      return res.status(400).json({ error: 'ท่านลงทะเบียนใช้งานแล้ว' });
    }

    // 2. เช็คอีเมลซ้ำ
    const [emailCheck]: any = await pool.query(
      'SELECT user_id FROM user WHERE email = ?', 
      [email]
    );
    if (emailCheck.length > 0) {
      return res.status(400).json({ error: 'อีเมลนี้ถูกใช้งานแล้ว' });
    }

    // 3. เช็ค username ซ้ำ
    const [usernameCheck]: any = await pool.query(
      'SELECT user_id FROM user WHERE username = ?', 
      [username]
    );
    if (usernameCheck.length > 0) {
      return res.status(400).json({ error: 'ชื่อผู้ใช้งานนี้ถูกใช้งานแล้ว' });
    }

    // 4. Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // 5. หากลุ่ม "ผู้ใช้งานทั่วไป" — สร้างถ้ายังไม่มี
    let defaultGroupId: number | null = null;
    try {
      const [gRows]: any = await pool.query(
        "SELECT group_id FROM user_groups WHERE group_name = 'ผู้ใช้งานทั่วไป' LIMIT 1"
      );
      if (gRows.length > 0) {
        defaultGroupId = gRows[0].group_id;
      } else {
        const [gRes]: any = await pool.query(
          "INSERT INTO user_groups (group_name, group_description) VALUES ('ผู้ใช้งานทั่วไป', 'กลุ่มผู้ใช้งานเริ่มต้นสำหรับสมาชิกใหม่')"
        );
        defaultGroupId = gRes.insertId;
      }
    } catch (_) {
      // user_groups อาจยังไม่ถูกสร้าง ใช้ null แทน
    }

    // 6. บันทึกลงตาราง user
    await pool.query(
      `INSERT INTO user 
       (Name_Surnam, position, type, Division_Province, Department, email, username, password, registration_date, active_users, user_status) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), '1', ?)`,
      [Name_Surname, position, type, Division_Province, Department, email, username, hashedPassword, defaultGroupId]
    );

    res.json({ message: 'ลงทะเบียนเรียบร้อยแล้ว' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการลงทะเบียน' });
  }
});

// เข้าสู่ระบบ
app.post('/api/users/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // ค้นหาผู้ใช้ด้วย username
    const [users]: any = await pool.query(
      'SELECT user_id, username, password, Name_Surnam, position, Division_Province FROM user WHERE username = ?',
      [username]
    );

    if (users.length === 0) {
      return res.status(401).json({ error: 'ชื่อผู้ใช้งานไม่ถูกต้อง', field: 'username' });
    }

    const user = users[0];

    // ตรวจสอบรหัสผ่าน
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'รหัสผ่านไม่ถูกต้อง', field: 'password' });
    }

    // สร้าง session อัตโนมัติ (ปิด session เก่าก่อน)
    let session_id: number | null = null;
    try {
      await pool.query(
        'UPDATE user_sessions SET is_online = 0, logout_time = NOW() WHERE user_id = ? AND is_online = 1',
        [user.user_id]
      );
      const [sResult]: any = await pool.query(
        'INSERT INTO user_sessions (user_id, ip_address, user_agent) VALUES (?, ?, ?)',
        [user.user_id, req.ip || '', req.headers['user-agent'] || '']
      );
      session_id = sResult.insertId;
    } catch (_) {
      // ตารางอาจยังไม่มี ข้ามไป
    }

    // ล็อกอินสำเร็จ
    res.json({ 
      message: 'เข้าสู่ระบบสำเร็จ', 
      user: {
        user_id: user.user_id,
        Name_Surname: user.Name_Surnam,
        position: user.position,
        Division_Province: user.Division_Province
      },
      session_id
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ' });
  }
});

// ดึงข้อมูลโปรไฟล์ผู้ใช้
app.get('/api/users/profile/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [rows]: any = await pool.query(
      'SELECT Name_Surnam as Name_Surname, position, type, Division_Province, Department, email, National_ID_number, username FROM user WHERE user_id = ?',
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'ไม่พบข้อมูลผู้ใช้' });
    }
    res.json(rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// อัปเดตข้อมูลโปรไฟล์ผู้ใช้
app.put('/api/users/profile/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      Name_Surname, position, type, Division_Province, Department, email, National_ID_number
    } = req.body;

    await pool.query(
      `UPDATE user SET 
       Name_Surnam = ?, position = ?, type = ?, Division_Province = ?, 
       Department = ?, email = ?, National_ID_number = ? 
       WHERE user_id = ?`,
      [Name_Surname, position, type, Division_Province, Department, email, National_ID_number, id]
    );

    res.json({ message: 'บันทึกข้อมูลเรียบร้อยแล้ว' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล' });
  }
});

// ดึงสิทธิ์เมนูของผู้ใช้ตาม group (user_status)
app.get('/api/users/:id/menu-permissions', async (req, res) => {
  try {
    const { id } = req.params;

    // ดึง user_status (group_id) ของ user
    const [userRows]: any = await pool.query(
      'SELECT user_status FROM user WHERE user_id = ?', [id]
    );
    if (userRows.length === 0) return res.status(404).json({ error: 'ไม่พบผู้ใช้งาน' });

    const groupId = userRows[0].user_status;

    // ถ้าไม่มีกลุ่ม หรือตาราง group_permissions ยังไม่มีข้อมูล → คืน array เปล่า (แสดงทุกเมนู)
    if (!groupId) return res.json({ allowed: null }); // null = ไม่จำกัด

    // ดึงเมนูที่กลุ่มนี้มีสิทธิ์มองเห็น
    const [rows]: any = await pool.query(
      `SELECT m.menu_key
       FROM menu_items m
       INNER JOIN group_permissions gp ON m.menu_id = gp.menu_id
       WHERE gp.group_id = ? AND gp.can_view = 1 AND m.is_active = 1`,
      [groupId]
    );

    const allowed = rows.map((r: any) => r.menu_key);
    res.json({ allowed });
  } catch (error) {
    console.error(error);
    // ถ้าตารางยังไม่มี ให้คืน null (ไม่จำกัดสิทธิ์)
    res.json({ allowed: null });
  }
});

// เปลี่ยนรหัสผ่าน
app.post('/api/users/change-password', async (req, res) => {
  try {
    const { user_id, oldPassword, newPassword } = req.body;

    // 1. ค้นหาผู้ใช้
    const [users]: any = await pool.query(
      'SELECT password FROM user WHERE user_id = ?',
      [user_id]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: 'ไม่พบผู้ใช้งาน' });
    }

    const user = users[0];

    // 2. ตรวจสอบรหัสผ่านเดิม
    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'รหัสผ่านเดิมไม่ถูกต้อง' });
    }

    // 3. Hash รหัสผ่านใหม่
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // 4. อัปเดตรหัสผ่านในฐานข้อมูล
    await pool.query(
      'UPDATE user SET password = ? WHERE user_id = ?',
      [hashedPassword, user_id]
    );

    res.json({ message: 'เปลี่ยนรหัสผ่านเรียบร้อยแล้ว' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการเปลี่ยนรหัสผ่าน' });
  }
});

// ====== USER SETTINGS: GROUPS & PERMISSIONS ======

// สร้างตาราง user_groups, menu_items, group_permissions (รัน 1 ครั้งหรือใช้ร่วมกับ migration)
app.post('/api/admin/setup-tables', async (_req, res) => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_groups (
        group_id INT AUTO_INCREMENT PRIMARY KEY,
        group_name VARCHAR(100) NOT NULL,
        group_description VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS menu_items (
        menu_id INT AUTO_INCREMENT PRIMARY KEY,
        menu_key VARCHAR(100) NOT NULL UNIQUE,
        menu_name VARCHAR(150) NOT NULL,
        menu_type ENUM('sidebar','content') NOT NULL DEFAULT 'sidebar',
        menu_icon VARCHAR(100),
        menu_href VARCHAR(255),
        sort_order INT DEFAULT 0,
        is_active TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS group_permissions (
        perm_id INT AUTO_INCREMENT PRIMARY KEY,
        group_id INT NOT NULL,
        menu_id INT NOT NULL,
        can_view TINYINT(1) DEFAULT 0,
        UNIQUE KEY uq_group_menu (group_id, menu_id),
        FOREIGN KEY (group_id) REFERENCES user_groups(group_id) ON DELETE CASCADE,
        FOREIGN KEY (menu_id) REFERENCES menu_items(menu_id) ON DELETE CASCADE
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);

    // Seed default menu items if empty
    const [existing]: any = await pool.query('SELECT COUNT(*) as cnt FROM menu_items');
    if (existing[0].cnt === 0) {
      await pool.query(`
        INSERT INTO menu_items (menu_key, menu_name, menu_type, menu_icon, menu_href, sort_order) VALUES
        ('home',            'หน้าหลัก',                   'sidebar',  'Home',        '/index',           1),
        ('profile',         'ข้อมูลส่วนตัว',               'sidebar',  'FileText',    '/profile',         2),
        ('training',        'ประวัติการอบรม',               'sidebar',  'ListTodo',    '#',                3),
        ('change_password', 'เปลี่ยนรหัสผ่าน',             'sidebar',  'KeyRound',    '/change-password', 4),
        ('user_settings',   'ตั้งค่าผู้ใช้งาน',            'sidebar',  'Settings',    '/user-settings',   5),
        ('report_monitor',  'รายงานการกำกับติดตามฯ',        'content',  'Monitor',     '#',                10),
        ('report_course',   'หลักสูตรการอบรม',              'content',  'BookOpen',    '#',                11),
        ('report_usage',    'รายงานการใช้งานระบบ',          'content',  'Users',       '#',                12),
        ('report_security', 'รายงานการรักษาความปลอดภัย',   'content',  'ShieldCheck', '#',                13)
      `);
    }

    res.json({ message: 'ตารางถูกสร้างและตั้งค่าเรียบร้อยแล้ว' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการสร้างตาราง' });
  }
});

// ดึงรายการกลุ่มผู้ใช้งานทั้งหมด
app.get('/api/admin/groups', async (_req, res) => {
  try {
    const [rows]: any = await pool.query(
      'SELECT * FROM user_groups ORDER BY created_at DESC'
    );
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// สร้างกลุ่มผู้ใช้งาน
app.post('/api/admin/groups', async (req, res) => {
  try {
    const { group_name, group_description } = req.body;
    if (!group_name) return res.status(400).json({ error: 'กรุณาระบุชื่อกลุ่ม' });

    const [result]: any = await pool.query(
      'INSERT INTO user_groups (group_name, group_description) VALUES (?, ?)',
      [group_name, group_description || '']
    );
    res.json({ message: 'สร้างกลุ่มเรียบร้อยแล้ว', group_id: result.insertId });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการสร้างกลุ่ม' });
  }
});

// แก้ไขกลุ่มผู้ใช้งาน
app.put('/api/admin/groups/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { group_name, group_description } = req.body;
    await pool.query(
      'UPDATE user_groups SET group_name = ?, group_description = ? WHERE group_id = ?',
      [group_name, group_description || '', id]
    );
    res.json({ message: 'แก้ไขกลุ่มเรียบร้อยแล้ว' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการแก้ไขกลุ่ม' });
  }
});

// ลบกลุ่มผู้ใช้งาน
app.delete('/api/admin/groups/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM user_groups WHERE group_id = ?', [id]);
    res.json({ message: 'ลบกลุ่มเรียบร้อยแล้ว' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการลบกลุ่ม' });
  }
});

// ดึงรายการเมนูทั้งหมด
app.get('/api/admin/menus', async (_req, res) => {
  try {
    const [rows]: any = await pool.query(
      'SELECT * FROM menu_items ORDER BY menu_type, sort_order'
    );
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// เพิ่มเมนูใหม่
app.post('/api/admin/menus', async (req, res) => {
  try {
    const { menu_key, menu_name, menu_type, menu_icon, menu_href, sort_order } = req.body;
    const [result]: any = await pool.query(
      'INSERT INTO menu_items (menu_key, menu_name, menu_type, menu_icon, menu_href, sort_order) VALUES (?,?,?,?,?,?)',
      [menu_key, menu_name, menu_type || 'sidebar', menu_icon || '', menu_href || '#', sort_order || 0]
    );
    res.json({ message: 'เพิ่มเมนูเรียบร้อยแล้ว', menu_id: result.insertId });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการเพิ่มเมนู' });
  }
});

// ดึงสิทธิ์ของกลุ่ม
app.get('/api/admin/groups/:id/permissions', async (req, res) => {
  try {
    const { id } = req.params;
    const [rows]: any = await pool.query(
      `SELECT m.*, COALESCE(gp.can_view, 0) as can_view
       FROM menu_items m
       LEFT JOIN group_permissions gp ON m.menu_id = gp.menu_id AND gp.group_id = ?
       ORDER BY m.menu_type, m.sort_order`,
      [id]
    );
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// บันทึกสิทธิ์ของกลุ่ม
app.post('/api/admin/groups/:id/permissions', async (req, res) => {
  try {
    const { id } = req.params;
    const { permissions } = req.body; // [{ menu_id, can_view }]

    // ลบสิทธิ์เดิมทั้งหมดของกลุ่มนี้
    await pool.query('DELETE FROM group_permissions WHERE group_id = ?', [id]);

    // เพิ่มสิทธิ์ใหม่
    if (permissions && permissions.length > 0) {
      const values = permissions.map((p: any) => [id, p.menu_id, p.can_view ? 1 : 0]);
      await pool.query(
        'INSERT INTO group_permissions (group_id, menu_id, can_view) VALUES ?',
        [values]
      );
    }

    res.json({ message: 'บันทึกสิทธิ์เรียบร้อยแล้ว' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการบันทึกสิทธิ์' });
  }
});

// แก้ไขเมนู
app.put('/api/admin/menus/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { menu_name, menu_type, menu_icon, menu_href, sort_order, is_active } = req.body;
    await pool.query(
      'UPDATE menu_items SET menu_name=?, menu_type=?, menu_icon=?, menu_href=?, sort_order=?, is_active=? WHERE menu_id=?',
      [menu_name, menu_type || 'sidebar', menu_icon || '', menu_href || '#', sort_order || 0, is_active ?? 1, id]
    );
    res.json({ message: 'แก้ไขเมนูเรียบร้อยแล้ว' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการแก้ไขเมนู' });
  }
});

// ลบเมนู
app.delete('/api/admin/menus/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM menu_items WHERE menu_id = ?', [id]);
    res.json({ message: 'ลบเมนูเรียบร้อยแล้ว' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการลบเมนู' });
  }
});

// ดึงรายชื่อ user ทั้งหมดพร้อมกลุ่ม
app.get('/api/admin/users', async (_req, res) => {
  try {
    const [rows]: any = await pool.query(
      `SELECT u.user_id, u.Name_Surnam AS Name_Surname, u.username, u.email, u.position,
              u.Division_Province, u.type, u.Department, u.National_ID_number, u.user_status,
              ug.group_name
       FROM user u
       LEFT JOIN user_groups ug ON u.user_status = ug.group_id
       ORDER BY u.Name_Surnam`
    );
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// อัปเดตกลุ่มของ user (user_status = group_id)
app.put('/api/admin/users/:id/group', async (req, res) => {
  try {
    const { id } = req.params;
    const { group_id } = req.body;
    await pool.query(
      'UPDATE user SET user_status = ? WHERE user_id = ?',
      [group_id, id]
    );
    res.json({ message: 'อัปเดตกลุ่มผู้ใช้งานเรียบร้อยแล้ว' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการอัปเดตกลุ่ม' });
  }
});

// เพิ่มผู้ใช้งานใหม่โดย Admin
app.post('/api/admin/users', async (req, res) => {
  try {
    const {
      Name_Surname, position, type, Division_Province, Department,
      email, National_ID_number, username, password, user_status
    } = req.body;

    // เช็ค username ซ้ำ
    const [usernameCheck]: any = await pool.query('SELECT user_id FROM user WHERE username = ?', [username]);
    if (usernameCheck.length > 0) return res.status(400).json({ error: 'ชื่อผู้ใช้งาน (username) นี้ถูกใช้งานแล้ว' });

    // เช็ค email ซ้ำ
    if (email) {
      const [emailCheck]: any = await pool.query('SELECT user_id FROM user WHERE email = ?', [email]);
      if (emailCheck.length > 0) return res.status(400).json({ error: 'อีเมลนี้ถูกใช้งานแล้ว' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    await pool.query(
      `INSERT INTO user 
       (Name_Surnam, position, type, Division_Province, Department, email, National_ID_number, username, password, registration_date, active_users, user_status) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), '1', ?)`,
      [Name_Surname, position, type, Division_Province, Department, email || null, National_ID_number || null, username, hashedPassword, user_status || null]
    );

    res.json({ message: 'เพิ่มผู้ใช้งานเรียบร้อยแล้ว' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการเพิ่มผู้ใช้งาน' });
  }
});

// แก้ไขข้อมูลผู้ใช้งานโดย Admin
app.put('/api/admin/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      Name_Surname, position, type, Division_Province, Department,
      email, National_ID_number, username, password, user_status
    } = req.body;

    // เช็ค username ซ้ำ (ยกเว้นตัวเอง)
    const [usernameCheck]: any = await pool.query('SELECT user_id FROM user WHERE username = ? AND user_id != ?', [username, id]);
    if (usernameCheck.length > 0) return res.status(400).json({ error: 'ชื่อผู้ใช้งาน (username) นี้ถูกใช้งานแล้ว' });

    // เช็ค email ซ้ำ (ยกเว้นตัวเอง)
    if (email) {
      const [emailCheck]: any = await pool.query('SELECT user_id FROM user WHERE email = ? AND user_id != ?', [email, id]);
      if (emailCheck.length > 0) return res.status(400).json({ error: 'อีเมลนี้ถูกใช้งานแล้ว' });
    }

    if (password) {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);
      await pool.query(
        `UPDATE user SET 
         Name_Surnam=?, position=?, type=?, Division_Province=?, Department=?, email=?, National_ID_number=?, username=?, password=?, user_status=?
         WHERE user_id=?`,
        [Name_Surname, position, type, Division_Province, Department, email || null, National_ID_number || null, username, hashedPassword, user_status || null, id]
      );
    } else {
      await pool.query(
        `UPDATE user SET 
         Name_Surnam=?, position=?, type=?, Division_Province=?, Department=?, email=?, National_ID_number=?, username=?, user_status=?
         WHERE user_id=?`,
        [Name_Surname, position, type, Division_Province, Department, email || null, National_ID_number || null, username, user_status || null, id]
      );
    }

    res.json({ message: 'แก้ไขข้อมูลผู้ใช้งานเรียบร้อยแล้ว' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการแก้ไขข้อมูลผู้ใช้งาน' });
  }
});

// ====== SYSTEM USAGE REPORT ======

// สร้างตาราง activity tracking
app.post('/api/admin/setup-usage-tables', async (_req, res) => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        session_id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        login_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        logout_time DATETIME NULL,
        is_online TINYINT(1) DEFAULT 1,
        ip_address VARCHAR(50),
        user_agent VARCHAR(500),
        INDEX idx_user_online (user_id, is_online),
        INDEX idx_login_time (login_time)
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_activity_log (
        log_id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        session_id INT,
        menu_key VARCHAR(100) NOT NULL,
        menu_name VARCHAR(200) NOT NULL,
        start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        end_time DATETIME NULL,
        active_seconds INT DEFAULT 0,
        created_date DATE GENERATED ALWAYS AS (DATE(start_time)) STORED,
        INDEX idx_user_date (user_id, created_date),
        INDEX idx_session (session_id)
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    res.json({ message: 'ตาราง usage tracking ถูกสร้างเรียบร้อยแล้ว' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'เกิดข้อผิดพลาด' });
  }
});

// บันทึก login session
app.post('/api/usage/login-session', async (req, res) => {
  try {
    const { user_id, ip_address, user_agent } = req.body;
    // ปิด session เก่าที่ยังค้างอยู่
    await pool.query(
      'UPDATE user_sessions SET is_online = 0, logout_time = NOW() WHERE user_id = ? AND is_online = 1',
      [user_id]
    );
    const [result]: any = await pool.query(
      'INSERT INTO user_sessions (user_id, ip_address, user_agent) VALUES (?, ?, ?)',
      [user_id, ip_address || '', user_agent || '']
    );
    res.json({ session_id: result.insertId });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// บันทึก logout
app.post('/api/usage/logout-session', async (req, res) => {
  try {
    const { session_id, user_id } = req.body;
    if (session_id) {
      await pool.query(
        'UPDATE user_sessions SET is_online = 0, logout_time = NOW() WHERE session_id = ?',
        [session_id]
      );
    } else if (user_id) {
      await pool.query(
        'UPDATE user_sessions SET is_online = 0, logout_time = NOW() WHERE user_id = ? AND is_online = 1',
        [user_id]
      );
    }
    res.json({ message: 'ok' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// บันทึก activity log (เข้าเมนู)
app.post('/api/usage/log-activity', async (req, res) => {
  try {
    const { user_id, session_id, menu_key, menu_name, active_seconds } = req.body;
    if (active_seconds && active_seconds > 0) {
      // อัปเดต record ที่มีอยู่แล้ว (end_time)
      await pool.query(
        `UPDATE user_activity_log SET end_time = NOW(), active_seconds = active_seconds + ?
         WHERE log_id = (SELECT log_id FROM (SELECT log_id FROM user_activity_log WHERE user_id = ? AND menu_key = ? AND session_id = ? ORDER BY start_time DESC LIMIT 1) AS t)`,
        [active_seconds, user_id, menu_key, session_id]
      );
      return res.json({ message: 'updated' });
    }
    const [result]: any = await pool.query(
      'INSERT INTO user_activity_log (user_id, session_id, menu_key, menu_name) VALUES (?, ?, ?, ?)',
      [user_id, session_id || null, menu_key, menu_name]
    );
    res.json({ log_id: result.insertId });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Heartbeat - อัปเดตสถานะ online
app.post('/api/usage/heartbeat', async (req, res) => {
  try {
    const { session_id } = req.body;
    if (session_id) {
      await pool.query(
        'UPDATE user_sessions SET logout_time = NOW() WHERE session_id = ? AND is_online = 1',
        [session_id]
      );
    }
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ดึงสรุปข้อมูลรายงานการใช้งาน (รองรับ ?from=YYYY-MM-DD&to=YYYY-MM-DD)
app.get('/api/usage/summary', async (req, res) => {
  try {
    const { from, to } = req.query as { from?: string; to?: string };
    const hasRange = from && to;

    // จำนวนผู้ลงทะเบียนทั้งหมด (ไม่กรองตามช่วงเวลา)
    const [totalUsers]: any = await pool.query('SELECT COUNT(*) as count FROM user');

    // จำนวน unique users ที่ login ในช่วงเวลาที่เลือก
    let totalLogins = [{ count: 0 }];
    try {
      if (hasRange) {
        const [r]: any = await pool.query(
          'SELECT COUNT(DISTINCT user_id) as count FROM user_sessions WHERE DATE(login_time) >= ? AND DATE(login_time) <= ?',
          [from, to]
        );
        totalLogins = r;
      } else {
        const [r]: any = await pool.query('SELECT COUNT(DISTINCT user_id) as count FROM user_sessions');
        totalLogins = r;
      }
    } catch (_) { /* table may not exist */ }

    // จำนวนประเภทข้าราชการ
    const [govOfficers]: any = await pool.query("SELECT COUNT(*) as count FROM user WHERE type = 'ข้าราชการ'");
    // จำนวนประเภทพนักงานราชการ
    const [govEmployees]: any = await pool.query("SELECT COUNT(*) as count FROM user WHERE type = 'พนักงานราชการ'");

    res.json({
      totalRegistered: totalUsers[0]?.count || 0,
      totalLogins: totalLogins[0]?.count || 0,
      totalGovOfficers: govOfficers[0]?.count || 0,
      totalGovEmployees: govEmployees[0]?.count || 0,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ดึงตารางการใช้งานระบบพร้อมสถานะออนไลน์ (รองรับ ?from=YYYY-MM-DD&to=YYYY-MM-DD)
app.get('/api/usage/users-table', async (req, res) => {
  try {
    const { from, to } = req.query as { from?: string; to?: string };
    const hasRange = from && to;

    // ปิด session ที่ไม่มี heartbeat มานานกว่า 2 นาที
    try {
      await pool.query(
        "UPDATE user_sessions SET is_online = 0, logout_time = COALESCE(logout_time, NOW()) WHERE is_online = 1 AND logout_time < DATE_SUB(NOW(), INTERVAL 2 MINUTE)"
      );
    } catch (_) { /* ignore */ }

    // สร้าง sub-query สำหรับกรองตามช่วงเวลา
    const sessionFilter = hasRange
      ? `AND DATE(login_time) >= '${from}' AND DATE(login_time) <= '${to}'`
      : '';
    const activityFilter = hasRange
      ? `AND DATE(start_time) >= '${from}' AND DATE(start_time) <= '${to}'`
      : '';
    const lastLoginFilter = hasRange
      ? `AND DATE(login_time) >= '${from}' AND DATE(login_time) <= '${to}'`
      : '';

    const [rows]: any = await pool.query(`
      SELECT 
        u.user_id, u.Name_Surnam AS Name_Surname, u.username, u.position, u.type,
        u.Division_Province, u.registration_date,
        COALESCE(MAX(s_online.is_online), 0) AS is_online,
        (SELECT MAX(login_time) FROM user_sessions WHERE user_id = u.user_id ${lastLoginFilter}) AS last_login,
        (SELECT COUNT(*) FROM user_sessions WHERE user_id = u.user_id ${sessionFilter}) AS total_logins,
        (SELECT COALESCE(SUM(active_seconds), 0) FROM user_activity_log WHERE user_id = u.user_id ${activityFilter}) AS total_active_seconds
      FROM user u
      LEFT JOIN user_sessions s_online ON u.user_id = s_online.user_id AND s_online.is_online = 1
      GROUP BY u.user_id
      ORDER BY COALESCE(MAX(s_online.is_online), 0) DESC, u.Name_Surnam
    `);
    res.json(rows);
  } catch (error) {
    console.error(error);
    // fallback ถ้า table ยังไม่มี
    try {
      const [rows]: any = await pool.query(`
        SELECT u.user_id, u.Name_Surnam AS Name_Surname, u.username, u.position, u.type,
               u.Division_Province, u.registration_date,
               0 AS is_online, NULL AS last_login, 0 AS total_logins, 0 AS total_active_seconds
        FROM user u ORDER BY u.Name_Surnam
      `);
      res.json(rows);
    } catch (e2) {
      console.error(e2);
      res.status(500).json({ error: 'Server error' });
    }
  }
});

// ดึงรายละเอียดประวัติการใช้งานของ user (รองรับ ?from=YYYY-MM-DD&to=YYYY-MM-DD)
app.get('/api/usage/user-history/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { from, to } = req.query as { from?: string; to?: string };
    const hasRange = from && to;

    const dateFilter = hasRange
      ? `AND DATE(start_time) >= '${from}' AND DATE(start_time) <= '${to}'`
      : '';

    const [rows]: any = await pool.query(`
      SELECT 
        created_date AS date,
        menu_key, menu_name,
        SUM(active_seconds) AS total_seconds,
        COUNT(*) AS visit_count,
        MIN(start_time) AS first_visit,
        MAX(COALESCE(end_time, start_time)) AS last_visit
      FROM user_activity_log
      WHERE user_id = ? ${dateFilter}
      GROUP BY created_date, menu_key, menu_name
      ORDER BY created_date DESC, menu_name
    `, [userId]);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.json([]);
  }
});

const PORT = process.env.PORT || 3001;
app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT} (accessible from LAN)`);
});
