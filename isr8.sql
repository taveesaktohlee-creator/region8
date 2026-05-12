/*
 Navicat Premium Dump SQL

 Source Server         : mysql8
 Source Server Type    : MySQL
 Source Server Version : 80046 (8.0.46)
 Source Host           : 157.85.98.50:3307
 Source Schema         : isr8

 Target Server Type    : MySQL
 Target Server Version : 80046 (8.0.46)
 File Encoding         : 65001

 Date: 12/05/2026 11:43:25
*/

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- Table structure for group_permissions
-- ----------------------------
DROP TABLE IF EXISTS `group_permissions`;
CREATE TABLE `group_permissions` (
  `perm_id` int NOT NULL AUTO_INCREMENT,
  `group_id` int NOT NULL,
  `menu_id` int NOT NULL,
  `can_view` tinyint(1) DEFAULT '0',
  PRIMARY KEY (`perm_id`),
  UNIQUE KEY `uq_group_menu` (`group_id`,`menu_id`),
  KEY `menu_id` (`menu_id`),
  CONSTRAINT `group_permissions_ibfk_1` FOREIGN KEY (`group_id`) REFERENCES `user_groups` (`group_id`) ON DELETE CASCADE,
  CONSTRAINT `group_permissions_ibfk_2` FOREIGN KEY (`menu_id`) REFERENCES `menu_items` (`menu_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=172 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Records of group_permissions
-- ----------------------------
BEGIN;
INSERT INTO `group_permissions` (`perm_id`, `group_id`, `menu_id`, `can_view`) VALUES (19, 1, 1, 1);
INSERT INTO `group_permissions` (`perm_id`, `group_id`, `menu_id`, `can_view`) VALUES (20, 1, 2, 1);
INSERT INTO `group_permissions` (`perm_id`, `group_id`, `menu_id`, `can_view`) VALUES (21, 1, 3, 1);
INSERT INTO `group_permissions` (`perm_id`, `group_id`, `menu_id`, `can_view`) VALUES (22, 1, 4, 1);
INSERT INTO `group_permissions` (`perm_id`, `group_id`, `menu_id`, `can_view`) VALUES (23, 1, 5, 1);
INSERT INTO `group_permissions` (`perm_id`, `group_id`, `menu_id`, `can_view`) VALUES (24, 1, 6, 1);
INSERT INTO `group_permissions` (`perm_id`, `group_id`, `menu_id`, `can_view`) VALUES (25, 1, 7, 1);
INSERT INTO `group_permissions` (`perm_id`, `group_id`, `menu_id`, `can_view`) VALUES (26, 1, 8, 1);
INSERT INTO `group_permissions` (`perm_id`, `group_id`, `menu_id`, `can_view`) VALUES (27, 1, 9, 1);
INSERT INTO `group_permissions` (`perm_id`, `group_id`, `menu_id`, `can_view`) VALUES (154, 2, 1, 1);
INSERT INTO `group_permissions` (`perm_id`, `group_id`, `menu_id`, `can_view`) VALUES (155, 2, 2, 1);
INSERT INTO `group_permissions` (`perm_id`, `group_id`, `menu_id`, `can_view`) VALUES (156, 2, 3, 1);
INSERT INTO `group_permissions` (`perm_id`, `group_id`, `menu_id`, `can_view`) VALUES (157, 2, 4, 1);
INSERT INTO `group_permissions` (`perm_id`, `group_id`, `menu_id`, `can_view`) VALUES (158, 2, 5, 0);
INSERT INTO `group_permissions` (`perm_id`, `group_id`, `menu_id`, `can_view`) VALUES (159, 2, 6, 1);
INSERT INTO `group_permissions` (`perm_id`, `group_id`, `menu_id`, `can_view`) VALUES (160, 2, 7, 1);
INSERT INTO `group_permissions` (`perm_id`, `group_id`, `menu_id`, `can_view`) VALUES (161, 2, 8, 1);
INSERT INTO `group_permissions` (`perm_id`, `group_id`, `menu_id`, `can_view`) VALUES (162, 2, 9, 1);
INSERT INTO `group_permissions` (`perm_id`, `group_id`, `menu_id`, `can_view`) VALUES (163, 3, 1, 1);
INSERT INTO `group_permissions` (`perm_id`, `group_id`, `menu_id`, `can_view`) VALUES (164, 3, 2, 1);
INSERT INTO `group_permissions` (`perm_id`, `group_id`, `menu_id`, `can_view`) VALUES (165, 3, 3, 1);
INSERT INTO `group_permissions` (`perm_id`, `group_id`, `menu_id`, `can_view`) VALUES (166, 3, 4, 1);
INSERT INTO `group_permissions` (`perm_id`, `group_id`, `menu_id`, `can_view`) VALUES (167, 3, 5, 0);
INSERT INTO `group_permissions` (`perm_id`, `group_id`, `menu_id`, `can_view`) VALUES (168, 3, 6, 1);
INSERT INTO `group_permissions` (`perm_id`, `group_id`, `menu_id`, `can_view`) VALUES (169, 3, 7, 1);
INSERT INTO `group_permissions` (`perm_id`, `group_id`, `menu_id`, `can_view`) VALUES (170, 3, 8, 0);
INSERT INTO `group_permissions` (`perm_id`, `group_id`, `menu_id`, `can_view`) VALUES (171, 3, 9, 0);
COMMIT;

-- ----------------------------
-- Table structure for menu_items
-- ----------------------------
DROP TABLE IF EXISTS `menu_items`;
CREATE TABLE `menu_items` (
  `menu_id` int NOT NULL AUTO_INCREMENT,
  `menu_key` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `menu_name` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `menu_type` enum('sidebar','content') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'sidebar',
  `menu_icon` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `menu_href` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sort_order` int DEFAULT '0',
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`menu_id`),
  UNIQUE KEY `menu_key` (`menu_key`)
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Records of menu_items
-- ----------------------------
BEGIN;
INSERT INTO `menu_items` (`menu_id`, `menu_key`, `menu_name`, `menu_type`, `menu_icon`, `menu_href`, `sort_order`, `is_active`, `created_at`) VALUES (1, 'home', 'หน้าหลัก', 'sidebar', 'Home', '/index', 1, 1, '2026-05-08 13:35:15');
INSERT INTO `menu_items` (`menu_id`, `menu_key`, `menu_name`, `menu_type`, `menu_icon`, `menu_href`, `sort_order`, `is_active`, `created_at`) VALUES (2, 'profile', 'ข้อมูลส่วนตัว', 'sidebar', 'FileText', '/user/profile', 2, 1, '2026-05-08 13:35:15');
INSERT INTO `menu_items` (`menu_id`, `menu_key`, `menu_name`, `menu_type`, `menu_icon`, `menu_href`, `sort_order`, `is_active`, `created_at`) VALUES (3, 'training', 'ประวัติการอบรม', 'sidebar', 'ListTodo', '/training/training-history', 3, 1, '2026-05-08 13:35:15');
INSERT INTO `menu_items` (`menu_id`, `menu_key`, `menu_name`, `menu_type`, `menu_icon`, `menu_href`, `sort_order`, `is_active`, `created_at`) VALUES (4, 'change_password', 'เปลี่ยนรหัสผ่าน', 'sidebar', 'KeyRound', '/user/change-password', 4, 1, '2026-05-08 13:35:15');
INSERT INTO `menu_items` (`menu_id`, `menu_key`, `menu_name`, `menu_type`, `menu_icon`, `menu_href`, `sort_order`, `is_active`, `created_at`) VALUES (5, 'user_settings', 'ตั้งค่าผู้ใช้งาน', 'sidebar', 'Settings', '/user/user-settings', 5, 1, '2026-05-08 13:35:15');
INSERT INTO `menu_items` (`menu_id`, `menu_key`, `menu_name`, `menu_type`, `menu_icon`, `menu_href`, `sort_order`, `is_active`, `created_at`) VALUES (6, 'report_monitor', 'รายงานการกำกับติดตามฯ', 'content', 'Monitor', '/monitor/program-monitoring', 10, 1, '2026-05-08 13:35:15');
INSERT INTO `menu_items` (`menu_id`, `menu_key`, `menu_name`, `menu_type`, `menu_icon`, `menu_href`, `sort_order`, `is_active`, `created_at`) VALUES (7, 'report_course', 'หลักสูตรการอบรม', 'content', 'BookOpen', '/training/training-courses', 11, 1, '2026-05-08 13:35:15');
INSERT INTO `menu_items` (`menu_id`, `menu_key`, `menu_name`, `menu_type`, `menu_icon`, `menu_href`, `sort_order`, `is_active`, `created_at`) VALUES (8, 'report_usage', 'รายงานการใช้งานระบบ', 'content', 'Users', '/user/system-usage-report', 12, 1, '2026-05-08 13:35:15');
INSERT INTO `menu_items` (`menu_id`, `menu_key`, `menu_name`, `menu_type`, `menu_icon`, `menu_href`, `sort_order`, `is_active`, `created_at`) VALUES (9, 'report_security', 'รายงานการรักษาความปลอดภัย', 'content', 'ShieldCheck', '/security_report/office-security-report', 13, 1, '2026-05-08 13:35:15');
COMMIT;

-- ----------------------------
-- Table structure for user
-- ----------------------------
DROP TABLE IF EXISTS `user`;
CREATE TABLE `user` (
  `user_id` int NOT NULL AUTO_INCREMENT,
  `Name_Surnam` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `position` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `type` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `Division_Province` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `Department` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `email` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `National_ID_number` varchar(13) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `username` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `password` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `user_status` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `active_users` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `user_history` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `registration_date` datetime DEFAULT NULL,
  PRIMARY KEY (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ----------------------------
-- Records of user
-- ----------------------------
BEGIN;
INSERT INTO `user` (`user_id`, `Name_Surnam`, `position`, `type`, `Division_Province`, `Department`, `email`, `National_ID_number`, `username`, `password`, `user_status`, `active_users`, `user_history`, `registration_date`) VALUES (1, 'นายทวีศักดิ์ โต๊ะหลี', 'เจ้าหน้าที่ระบบงานคอมพิวเตอร์', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'กลุ่มเทคโนโลยีสารสนเทศ', 'taveesak.tohlee@gmail.com', '1801300086271', 'taveesak', '$2b$10$VNe0B9LX.4PH.C4peDsTk.IGgb/8kLOGFvWjAa3S7L9GoCVtMjNLi', '1', '1', NULL, '2026-05-05 15:40:51');
INSERT INTO `user` (`user_id`, `Name_Surnam`, `position`, `type`, `Division_Province`, `Department`, `email`, `National_ID_number`, `username`, `password`, `user_status`, `active_users`, `user_history`, `registration_date`) VALUES (2, 'นายศุภชัย นุ่นปาน', 'นักจัดการงานทั่วไป', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'กลุ่มพัฒนาการเรียนรู้', 'suppachainu@gmail.com', '3930100227739', 'Supachai', '$2b$10$1wBz1ZF3BGYIdxsLMK0aVOj7GHhSLUFSsbzXu63.Dsohinp0UAvym', '3', '1', NULL, '2026-05-08 15:12:59');
INSERT INTO `user` (`user_id`, `Name_Surnam`, `position`, `type`, `Division_Province`, `Department`, `email`, `National_ID_number`, `username`, `password`, `user_status`, `active_users`, `user_history`, `registration_date`) VALUES (3, 'นางสาวพัชรินทร์ คีรีเพ็ชร', 'เจ้าหน้าที่ระบบงานคอมพิวเตอร์', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'กลุ่มพัฒนาการเรียนรู้', 'taveesak.tohle@gmail.com', NULL, 'cad', '$2b$10$txDnPDnbTzOdKEFvibZt0uJs3TiKtjdrYyxtfaoMhvawzE8hgeEgO', '3', '1', NULL, '2026-05-08 23:22:58');
INSERT INTO `user` (`user_id`, `Name_Surnam`, `position`, `type`, `Division_Province`, `Department`, `email`, `National_ID_number`, `username`, `password`, `user_status`, `active_users`, `user_history`, `registration_date`) VALUES (4, 'นางกิตติมา สุขจันทรา', 'นักวิชาการตรวจสอบบัญชีชำนาญการ', 'ข้าราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'กลุ่มเทคโนโลยีสารสนเทศ', 'taveesak.toee@gmail.com', NULL, 'cad1', '$2b$10$zOa9h/bUIZAuvmDQ/51J9uauA87rt.r/zvb/cl.Nnx1BNkypbBofa', '2', '1', NULL, '2026-05-09 07:12:31');
INSERT INTO `user` (`user_id`, `Name_Surnam`, `position`, `type`, `Division_Province`, `Department`, `email`, `National_ID_number`, `username`, `password`, `user_status`, `active_users`, `user_history`, `registration_date`) VALUES (5, 'นางวิลาลักษณ์ รวีโชติสกุล', 'นักวิชาการตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'กลุ่มกำกับมาตรฐานการบัญชี', 'taveesak.tohlee44@gmail.com', NULL, 'cad2', '$2b$10$cqAOpX3wyZHBRHSiOCl/1eOsK2bAgh3JusWAUE7FnT6uIAjIXjBVa', '3', '1', NULL, '2026-05-12 11:37:09');
COMMIT;

-- ----------------------------
-- Table structure for user_activity_log
-- ----------------------------
DROP TABLE IF EXISTS `user_activity_log`;
CREATE TABLE `user_activity_log` (
  `log_id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `session_id` int DEFAULT NULL,
  `menu_key` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `menu_name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `start_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `end_time` datetime DEFAULT NULL,
  `active_seconds` int DEFAULT '0',
  `created_date` date GENERATED ALWAYS AS (cast(`start_time` as date)) STORED,
  PRIMARY KEY (`log_id`),
  KEY `idx_user_date` (`user_id`,`created_date`),
  KEY `idx_session` (`session_id`)
) ENGINE=InnoDB AUTO_INCREMENT=163 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Records of user_activity_log
-- ----------------------------
BEGIN;
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (1, 1, 1, 'home', 'หน้าหลัก', '2026-05-09 09:43:15', '2026-05-09 09:43:17', 2);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (2, 1, 1, 'report_usage', 'รายงานการใช้งานระบบ', '2026-05-09 09:43:17', '2026-05-09 09:47:17', 240);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (3, 1, 1, 'report_usage', 'รายงานการใช้งานระบบ', '2026-05-09 09:47:40', '2026-05-09 09:48:04', 23);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (4, 1, 1, 'profile', 'ข้อมูลส่วนตัว', '2026-05-09 09:48:04', '2026-05-09 09:49:14', 70);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (5, 1, 1, 'home', 'หน้าหลัก', '2026-05-09 09:49:14', '2026-05-09 09:49:16', 1);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (6, 1, 1, 'report_usage', 'รายงานการใช้งานระบบ', '2026-05-09 09:49:16', '2026-05-09 09:51:16', 120);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (7, 1, 1, 'report_usage', 'รายงานการใช้งานระบบ', '2026-05-09 09:51:49', '2026-05-09 09:52:07', 17);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (8, 1, 1, 'change_password', 'เปลี่ยนรหัสผ่าน', '2026-05-09 09:52:07', '2026-05-09 09:56:09', 239);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (9, 1, 1, 'home', 'หน้าหลัก', '2026-05-09 09:56:09', '2026-05-09 09:56:10', 1);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (10, 1, 1, 'report_security', 'รายงานความปลอดภัย', '2026-05-09 09:56:10', '2026-05-09 09:56:11', 1);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (11, 1, 1, 'home', 'หน้าหลัก', '2026-05-09 09:56:11', NULL, 0);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (12, 1, 1, 'report_usage', 'รายงานการใช้งานระบบ', '2026-05-09 09:56:12', '2026-05-09 09:56:54', 42);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (13, 1, 1, 'user_settings', 'ตั้งค่าผู้ใช้งาน', '2026-05-09 09:56:54', '2026-05-09 10:07:05', 608);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (14, 1, 1, 'user_settings', 'ตั้งค่าผู้ใช้งาน', '2026-05-09 10:07:06', '2026-05-09 10:33:42', 594);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (15, 1, 1, 'home', 'หน้าหลัก', '2026-05-09 10:33:42', '2026-05-09 10:33:44', 1);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (16, 1, 1, 'report_usage', 'รายงานการใช้งานระบบ', '2026-05-09 10:33:44', '2026-05-09 10:34:04', 19);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (17, 1, 1, 'home', 'หน้าหลัก', '2026-05-09 10:34:04', '2026-05-09 10:40:39', 143);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (18, 3, 2, 'home', 'หน้าหลัก', '2026-05-09 10:35:21', '2026-05-09 10:40:14', 147);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (19, 3, 2, 'home', 'หน้าหลัก', '2026-05-09 10:40:26', '2026-05-09 10:41:05', 38);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (20, 1, 1, 'report_usage', 'รายงานการใช้งานระบบ', '2026-05-09 10:40:39', '2026-05-09 10:47:39', 418);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (21, 3, 3, 'home', 'หน้าหลัก', '2026-05-09 10:46:25', '2026-05-09 10:46:35', 10);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (22, 3, 3, 'report_monitor', 'รายงานการกำกับติดตาม', '2026-05-09 10:46:35', '2026-05-09 10:49:32', 31);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (23, 1, 4, 'home', 'หน้าหลัก', '2026-05-09 10:48:35', NULL, 0);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (24, 1, 4, 'home', 'หน้าหลัก', '2026-05-09 10:48:49', '2026-05-09 10:48:52', 3);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (25, 1, 4, 'report_security', 'รายงานความปลอดภัย', '2026-05-09 10:48:52', '2026-05-09 10:57:49', 535);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (26, 1, 4, 'home', 'หน้าหลัก', '2026-05-09 10:57:49', '2026-05-09 10:57:52', 3);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (27, 1, 4, 'report_usage', 'รายงานการใช้งานระบบ', '2026-05-09 10:58:05', NULL, 0);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (28, 3, 3, 'report_monitor', 'รายงานการกำกับติดตาม', '2026-05-09 10:58:26', '2026-05-09 10:59:04', 37);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (29, 1, 4, 'report_usage', 'รายงานการใช้งานระบบ', '2026-05-09 10:58:51', '2026-05-09 10:58:58', 7);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (30, 1, 4, 'home', 'หน้าหลัก', '2026-05-09 10:58:59', NULL, 0);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (31, 1, 4, 'report_usage', 'รายงานการใช้งานระบบ', '2026-05-09 10:58:59', NULL, 0);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (32, 3, 3, 'home', 'หน้าหลัก', '2026-05-09 10:59:04', '2026-05-09 10:59:07', 2);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (33, 3, 3, 'report_course', 'หลักสูตรการอบรม', '2026-05-09 10:59:07', '2026-05-09 10:59:43', 36);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (34, 1, 4, 'report_usage', 'รายงานการใช้งานระบบ', '2026-05-09 10:59:33', '2026-05-09 11:00:42', 69);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (35, 3, 3, 'profile', 'ข้อมูลส่วนตัว', '2026-05-09 10:59:44', '2026-05-09 11:00:46', 42);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (36, 1, 4, 'report_usage', 'รายงานการใช้งานระบบ', '2026-05-09 11:00:42', NULL, 0);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (37, 3, 3, 'profile', 'ข้อมูลส่วนตัว', '2026-05-09 11:00:57', NULL, 0);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (38, 1, 4, 'report_usage', 'รายงานการใช้งานระบบ', '2026-05-09 11:01:00', '2026-05-09 11:17:00', 430);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (39, 3, 5, 'home', 'หน้าหลัก', '2026-05-09 11:01:25', '2026-05-09 11:01:33', 7);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (40, 3, 5, 'profile', 'ข้อมูลส่วนตัว', '2026-05-09 11:01:33', '2026-05-09 11:11:58', 433);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (41, 3, 5, 'home', 'หน้าหลัก', '2026-05-09 11:11:58', '2026-05-09 11:12:22', 24);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (42, 3, 5, 'home', 'หน้าหลัก', '2026-05-09 11:14:32', '2026-05-09 11:20:01', 9);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (43, 1, 4, 'report_usage', 'รายงานการใช้งานระบบ', '2026-05-09 11:17:18', '2026-05-09 11:18:24', 66);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (44, 1, 4, 'report_usage', 'รายงานการใช้งานระบบ', '2026-05-09 11:19:23', NULL, 0);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (45, 1, 4, 'report_usage', 'รายงานการใช้งานระบบ', '2026-05-09 11:19:24', '2026-05-09 11:40:58', 737);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (46, 1, 4, 'report_usage', 'รายงานการใช้งานระบบ', '2026-05-09 11:42:21', '2026-05-09 11:50:51', 36);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (47, 1, 4, 'report_usage', 'รายงานการใช้งานระบบ', '2026-05-09 11:51:21', NULL, 0);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (48, 1, 6, 'home', 'หน้าหลัก', '2026-05-09 11:51:36', '2026-05-09 11:51:37', 1);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (49, 1, 6, 'report_usage', 'รายงานการใช้งานระบบ', '2026-05-09 11:51:37', '2026-05-09 11:51:56', 18);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (50, 1, 6, 'home', 'หน้าหลัก', '2026-05-09 11:51:56', '2026-05-09 11:52:57', 33);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (51, 1, 6, 'change_password', 'เปลี่ยนรหัสผ่าน', '2026-05-09 11:52:57', '2026-05-09 11:53:02', 4);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (52, 1, 6, 'home', 'หน้าหลัก', '2026-05-09 11:53:02', '2026-05-09 11:53:21', 19);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (53, 1, 6, 'report_course', 'หลักสูตรการอบรม', '2026-05-09 11:53:21', '2026-05-09 11:53:34', 13);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (54, 1, 6, 'training', 'ประวัติการอบรม', '2026-05-09 11:55:09', '2026-05-09 11:56:34', 55);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (55, 1, 6, 'home', 'หน้าหลัก', '2026-05-09 11:56:34', '2026-05-09 11:56:35', 1);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (56, 1, 6, 'report_usage', 'รายงานการใช้งานระบบ', '2026-05-09 11:56:35', '2026-05-09 11:56:45', 9);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (57, 1, 7, 'home', 'หน้าหลัก', '2026-05-10 13:04:46', '2026-05-10 13:04:48', 2);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (58, 1, 7, 'report_usage', 'รายงานการใช้งานระบบ', '2026-05-10 13:04:48', '2026-05-10 13:05:52', 63);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (59, 1, 7, 'profile', 'ข้อมูลส่วนตัว', '2026-05-10 13:05:52', '2026-05-10 13:05:53', 1);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (60, 1, 7, 'home', 'หน้าหลัก', '2026-05-10 13:05:53', '2026-05-10 13:06:37', 17);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (61, 1, 7, 'report_usage', 'รายงานการใช้งานระบบ', '2026-05-10 13:06:37', '2026-05-10 13:08:31', 113);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (62, 1, 7, 'home', 'หน้าหลัก', '2026-05-10 13:08:31', '2026-05-10 13:09:30', 59);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (63, 1, 7, 'report_usage', 'รายงานการใช้งานระบบ', '2026-05-10 13:10:04', '2026-05-10 13:10:24', 20);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (64, 1, 7, 'profile', 'ข้อมูลส่วนตัว', '2026-05-10 13:10:24', '2026-05-10 13:10:26', 1);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (65, 1, 7, 'home', 'หน้าหลัก', '2026-05-10 13:10:26', '2026-05-10 13:10:27', 1);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (66, 1, 7, 'report_course', 'หลักสูตรการอบรม', '2026-05-10 13:10:27', '2026-05-10 13:12:07', 99);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (67, 1, 7, 'home', 'หน้าหลัก', '2026-05-10 13:12:07', '2026-05-10 13:12:08', 1);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (68, 1, 7, 'report_usage', 'รายงานการใช้งานระบบ', '2026-05-10 13:12:08', '2026-05-10 13:13:54', 105);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (69, 1, 7, 'home', 'หน้าหลัก', '2026-05-10 13:13:54', '2026-05-10 16:23:55', 2100);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (70, 1, 8, 'home', 'หน้าหลัก', '2026-05-11 13:40:35', '2026-05-11 13:40:48', 12);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (71, 1, 8, 'report_usage', 'รายงานการใช้งานระบบ', '2026-05-11 13:40:48', '2026-05-11 13:41:36', 47);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (72, 1, 8, 'home', 'หน้าหลัก', '2026-05-11 13:41:36', NULL, 0);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (73, 1, 8, 'profile', 'ข้อมูลส่วนตัว', '2026-05-11 13:41:37', '2026-05-11 13:41:42', 5);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (74, 1, 8, 'home', 'หน้าหลัก', '2026-05-11 13:41:42', '2026-05-11 13:41:51', 8);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (75, 1, 8, 'report_monitor', 'รายงานการกำกับติดตาม', '2026-05-11 13:41:51', '2026-05-11 13:41:53', 2);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (76, 1, 8, 'report_monitor', 'รายงานการกำกับติดตาม', '2026-05-11 13:46:52', '2026-05-11 13:52:53', 357);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (77, 1, 8, 'report_monitor', 'รายงานการกำกับติดตาม', '2026-05-11 13:53:10', '2026-05-11 14:13:22', 1211);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (78, 1, 8, 'report_monitor', 'รายงานการกำกับติดตาม', '2026-05-11 14:13:40', '2026-05-11 14:32:00', 1095);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (79, 1, 9, 'home', 'หน้าหลัก', '2026-05-11 15:17:49', '2026-05-11 15:17:52', 3);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (80, 1, 9, 'report_monitor', 'รายงานการกำกับติดตาม', '2026-05-11 15:17:52', '2026-05-11 15:28:02', 196);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (81, 1, 9, 'home', 'หน้าหลัก', '2026-05-11 15:28:02', '2026-05-11 15:28:03', 1);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (82, 1, 9, 'report_course', 'หลักสูตรการอบรม', '2026-05-11 15:28:03', '2026-05-11 15:28:05', 1);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (83, 1, 9, 'home', 'หน้าหลัก', '2026-05-11 15:28:05', '2026-05-11 15:28:06', 1);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (84, 1, 9, 'report_usage', 'รายงานการใช้งานระบบ', '2026-05-11 15:28:06', '2026-05-11 15:28:13', 6);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (85, 1, 9, 'home', 'หน้าหลัก', '2026-05-11 15:28:13', '2026-05-11 15:28:14', 1);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (86, 1, 9, 'report_security', 'รายงานความปลอดภัย', '2026-05-11 15:28:14', '2026-05-11 15:28:15', 1);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (87, 1, 9, 'home', 'หน้าหลัก', '2026-05-11 15:28:15', '2026-05-11 15:28:19', 3);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (88, 1, 9, 'profile', 'ข้อมูลส่วนตัว', '2026-05-11 15:28:19', '2026-05-11 15:30:38', 38);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (89, 1, 9, 'home', 'หน้าหลัก', '2026-05-11 15:30:38', '2026-05-11 15:30:40', 1);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (90, 1, 9, 'report_monitor', 'รายงานการกำกับติดตาม', '2026-05-11 15:30:40', '2026-05-11 15:30:58', 18);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (91, 1, 9, 'home', 'หน้าหลัก', '2026-05-11 15:30:58', '2026-05-11 15:32:31', 92);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (92, 1, 9, 'home', 'หน้าหลัก', '2026-05-11 15:34:47', '2026-05-11 15:49:58', 784);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (93, 1, 9, 'report_security', 'รายงานความปลอดภัย', '2026-05-11 15:49:59', '2026-05-11 16:27:59', 272);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (94, 1, 9, 'report_security', 'รายงานความปลอดภัย', '2026-05-11 16:28:38', '2026-05-11 16:28:51', 13);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (95, 1, 9, 'home', 'หน้าหลัก', '2026-05-11 16:28:51', '2026-05-11 16:29:08', 17);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (96, 1, 9, 'report_monitor', 'รายงานการกำกับติดตาม', '2026-05-11 16:29:08', '2026-05-11 16:29:20', 11);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (97, 1, 9, 'home', 'หน้าหลัก', '2026-05-11 16:29:20', '2026-05-11 16:29:22', 2);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (98, 1, 9, 'report_security', 'รายงานความปลอดภัย', '2026-05-11 16:29:22', '2026-05-11 16:30:25', 60);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (99, 1, 9, 'profile', 'ข้อมูลส่วนตัว', '2026-05-11 16:30:25', '2026-05-11 16:31:53', 16);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (100, 1, 9, 'report_monitor', 'รายงานการกำกับติดตาม', '2026-05-11 16:31:53', '2026-05-11 16:31:55', 2);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (101, 1, 9, 'training', 'ประวัติการอบรม', '2026-05-11 16:31:55', '2026-05-11 16:37:55', 18);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (102, 1, 9, 'training', 'ประวัติการอบรม', '2026-05-11 16:37:56', '2026-05-11 16:37:58', 1);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (103, 1, 9, 'home', 'หน้าหลัก', '2026-05-11 16:37:58', '2026-05-11 16:37:59', 1);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (104, 1, 9, 'report_security', 'รายงานความปลอดภัย', '2026-05-11 16:37:59', '2026-05-11 16:43:16', 314);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (105, 1, 10, 'home', 'หน้าหลัก', '2026-05-11 19:14:22', '2026-05-11 19:14:25', 3);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (106, 1, 10, 'profile', 'ข้อมูลส่วนตัว', '2026-05-11 19:14:25', '2026-05-11 19:14:26', 1);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (107, 1, 10, 'training', 'ประวัติการอบรม', '2026-05-11 19:14:26', '2026-05-11 19:14:31', 4);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (108, 1, 10, 'change_password', 'เปลี่ยนรหัสผ่าน', '2026-05-11 19:14:31', '2026-05-11 19:14:43', 12);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (109, 1, 10, 'user_settings', 'ตั้งค่าผู้ใช้งาน', '2026-05-11 19:14:43', '2026-05-11 19:16:11', 87);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (110, 1, 10, 'home', 'หน้าหลัก', '2026-05-11 19:16:11', '2026-05-11 19:44:07', 4);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (111, 1, 10, 'report_security', 'รายงานความปลอดภัย', '2026-05-11 19:16:14', '2026-05-11 19:28:48', 217);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (112, 1, 10, 'report_security', 'รายงานความปลอดภัย', '2026-05-11 19:32:20', '2026-05-11 19:43:58', 284);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (113, 1, 10, 'report_security', 'รายงานความปลอดภัย', '2026-05-11 19:44:07', '2026-05-11 19:47:07', 89);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (114, 1, 10, 'report_security', 'รายงานความปลอดภัย', '2026-05-11 19:48:05', '2026-05-11 21:52:45', 253);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (115, 1, 10, 'report_security', 'รายงานความปลอดภัย', '2026-05-11 21:56:25', '2026-05-11 21:59:57', 121);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (116, 1, 10, 'report_security', 'รายงานความปลอดภัย', '2026-05-11 22:01:54', '2026-05-11 22:02:38', 43);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (117, 1, 10, 'home', 'หน้าหลัก', '2026-05-11 22:02:38', '2026-05-11 22:02:40', 1);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (118, 1, 10, 'report_security', 'รายงานความปลอดภัย', '2026-05-11 22:02:40', '2026-05-11 22:03:39', 58);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (119, 1, 10, 'home', 'หน้าหลัก', '2026-05-11 22:03:39', '2026-05-11 22:03:40', 1);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (120, 1, 10, 'report_usage', 'รายงานการใช้งานระบบ', '2026-05-11 22:03:40', '2026-05-11 22:04:18', 38);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (121, 1, 10, 'change_password', 'เปลี่ยนรหัสผ่าน', '2026-05-11 22:04:18', '2026-05-11 22:04:21', 3);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (122, 1, 10, 'home', 'หน้าหลัก', '2026-05-11 22:04:21', '2026-05-11 22:04:29', 7);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (123, 1, 11, 'home', 'หน้าหลัก', '2026-05-12 08:32:58', '2026-05-12 08:36:35', 82);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (124, 1, 11, 'home', 'หน้าหลัก', '2026-05-12 08:38:47', '2026-05-12 09:06:30', 75);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (125, 1, 12, 'home', 'หน้าหลัก', '2026-05-12 09:08:00', '2026-05-12 09:17:17', 94);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (126, 1, 12, 'report_security', 'รายงานความปลอดภัย', '2026-05-12 09:17:17', '2026-05-12 09:17:39', 21);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (127, 1, 12, 'home', 'หน้าหลัก', '2026-05-12 09:17:39', '2026-05-12 09:18:20', 40);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (128, 1, 12, 'report_usage', 'รายงานการใช้งานระบบ', '2026-05-12 09:18:20', '2026-05-12 09:18:47', 18);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (129, 1, 12, 'training', 'ประวัติการอบรม', '2026-05-12 09:18:47', '2026-05-12 09:18:49', 2);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (130, 1, 12, 'change_password', 'เปลี่ยนรหัสผ่าน', '2026-05-12 09:18:49', '2026-05-12 09:18:50', 1);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (131, 1, 12, 'user_settings', 'ตั้งค่าผู้ใช้งาน', '2026-05-12 09:18:50', '2026-05-12 09:18:52', 1);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (132, 1, 12, 'home', 'หน้าหลัก', '2026-05-12 09:18:52', '2026-05-12 09:19:31', 29);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (133, 1, 12, 'report_monitor', 'รายงานการกำกับติดตาม', '2026-05-12 09:19:31', '2026-05-12 09:20:05', 34);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (134, 1, 12, 'home', 'หน้าหลัก', '2026-05-12 09:20:05', '2026-05-12 09:20:12', 6);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (135, 1, 12, 'report_usage', 'รายงานการใช้งานระบบ', '2026-05-12 09:20:12', '2026-05-12 09:20:34', 22);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (136, 1, 12, 'home', 'หน้าหลัก', '2026-05-12 09:20:34', '2026-05-12 09:20:56', 22);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (137, 1, 12, 'report_usage', 'รายงานการใช้งานระบบ', '2026-05-12 09:20:56', '2026-05-12 09:25:14', 53);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (138, 1, 12, 'home', 'หน้าหลัก', '2026-05-12 09:25:14', '2026-05-12 09:25:25', 11);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (139, 1, 12, 'report_usage', 'รายงานการใช้งานระบบ', '2026-05-12 09:25:25', '2026-05-12 09:31:37', 86);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (140, 1, 12, 'report_usage', 'รายงานการใช้งานระบบ', '2026-05-12 09:38:30', '2026-05-12 10:02:42', 1206);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (141, 1, 12, 'home', 'หน้าหลัก', '2026-05-12 10:02:42', '2026-05-12 10:02:45', 3);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (142, 1, 12, 'report_security', 'รายงานความปลอดภัย', '2026-05-12 10:02:45', '2026-05-12 10:03:21', 35);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (143, 1, 12, 'home', 'หน้าหลัก', '2026-05-12 10:03:21', '2026-05-12 10:03:26', 5);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (144, 1, 12, 'report_course', 'หลักสูตรการอบรม', '2026-05-12 10:03:26', '2026-05-12 10:03:28', 1);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (145, 1, 12, 'home', 'หน้าหลัก', '2026-05-12 10:03:28', '2026-05-12 10:03:30', 1);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (146, 1, 12, 'report_monitor', 'รายงานการกำกับติดตาม', '2026-05-12 10:03:30', '2026-05-12 10:03:42', 12);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (147, 1, 12, 'home', 'หน้าหลัก', '2026-05-12 10:03:42', '2026-05-12 10:03:44', 2);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (148, 1, 12, 'report_usage', 'รายงานการใช้งานระบบ', '2026-05-12 10:03:45', '2026-05-12 10:07:01', 194);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (149, 1, 12, 'report_usage', 'รายงานการใช้งานระบบ', '2026-05-12 10:11:51', '2026-05-12 10:14:57', 185);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (150, 1, 12, 'report_usage', 'รายงานการใช้งานระบบ', '2026-05-12 10:15:15', '2026-05-12 10:28:24', 672);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (151, 1, 12, 'report_usage', 'รายงานการใช้งานระบบ', '2026-05-12 10:35:58', '2026-05-12 10:49:33', 390);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (152, 1, 12, 'report_usage', 'รายงานการใช้งานระบบ', '2026-05-12 10:52:11', '2026-05-12 10:54:11', 120);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (153, 1, 12, 'report_usage', 'รายงานการใช้งานระบบ', '2026-05-12 10:54:16', '2026-05-12 11:10:08', 574);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (154, 1, 12, 'report_usage', 'รายงานการใช้งานระบบ', '2026-05-12 11:10:08', '2026-05-12 11:18:36', 191);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (155, 1, 12, 'report_usage', 'รายงานการใช้งานระบบ', '2026-05-12 11:18:36', '2026-05-12 11:22:08', 212);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (156, 1, 12, 'report_usage', 'รายงานการใช้งานระบบ', '2026-05-12 11:22:08', '2026-05-12 11:22:10', 1);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (157, 1, 12, 'profile', 'ข้อมูลส่วนตัว', '2026-05-12 11:22:10', NULL, 0);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (158, 1, 12, 'home', 'หน้าหลัก', '2026-05-12 11:22:11', '2026-05-12 11:22:18', 7);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (159, 1, 12, 'report_security', 'รายงานความปลอดภัย', '2026-05-12 11:22:18', '2026-05-12 11:22:26', 7);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (160, 1, 12, 'home', 'หน้าหลัก', '2026-05-12 11:22:26', '2026-05-12 11:22:36', 10);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (161, 1, 12, 'user_settings', 'ตั้งค่าผู้ใช้งาน', '2026-05-12 11:22:36', '2026-05-12 11:30:25', 446);
INSERT INTO `user_activity_log` (`log_id`, `user_id`, `session_id`, `menu_key`, `menu_name`, `start_time`, `end_time`, `active_seconds`) VALUES (162, 1, 12, 'home', 'หน้าหลัก', '2026-05-12 11:30:25', NULL, 0);
COMMIT;

-- ----------------------------
-- Table structure for user_confirm
-- ----------------------------
DROP TABLE IF EXISTS `user_confirm`;
CREATE TABLE `user_confirm` (
  `id` int NOT NULL,
  `Name_Surname` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `position` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `type` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `Division_Province` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `Department` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ----------------------------
-- Records of user_confirm
-- ----------------------------
BEGIN;
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (1, 'นางสาวเพ็ญสุดา คุ้มฉายา', 'ผู้อำนวยการสำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'ข้าราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สตท.8');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (2, 'นางรัตนาภรณ์ ชัยรัตนวงศ์', 'ผู้เชี่ยวชาญด้านการบัญชีและการสอบบัญชี', 'ข้าราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สตท.8');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (3, 'นางสาวกรุณา วุฒิมานพ', 'นักวิชาการตรวจสอบบัญชีชำนาญการพิเศษ', 'ข้าราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'กลุ่มกำกับมาตรฐานการบัญชี');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (4, 'นางสายชล วิโรจน์กุล', 'นักวิชาการตรวจสอบบัญชีชำนาญการ', 'ข้าราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'กลุ่มกำกับมาตรฐานการบัญชี');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (5, 'นางสุภาณี ใจเพียร', 'นักวิชาการตรวจสอบบัญชีชำนาญการ', 'ข้าราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'กลุ่มกำกับมาตรฐานการบัญชี');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (6, 'นางสาวบุณฑริก แก้วซัง', 'นักวิชาการตรวจสอบบัญชีปฏิบัติการ', 'ข้าราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'กลุ่มกำกับมาตรฐานการบัญชี');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (7, 'นางสาวบุรฉัตร มะโนดำ', 'นักวิชาการตรวจสอบบัญชีปฏิบัติการ', 'ข้าราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'กลุ่มกำกับมาตรฐานการบัญชี');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (8, 'นางวิลาลักษณ์ รวีโชติสกุล', 'นักวิชาการตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'กลุ่มกำกับมาตรฐานการบัญชี');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (9, 'นางชนัยสุดา ขุนจันทร์', 'นักวิชาการตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'กลุ่มกำกับมาตรฐานการบัญชี');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (10, 'นางสาวอังสนา โยธินวัฒนบำรุง', 'นักวิชาการตรวจสอบบัญชีชำนาญการพิเศษ', 'ข้าราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'กลุ่มพัฒนาการเรียนรู้');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (11, 'นางกมลวรรณ ไหมนวล', 'นักวิชาการตรวจสอบบัญชีชำนาญการ', 'ข้าราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'กลุ่มพัฒนาการเรียนรู้');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (12, 'นางสาวศุภวรรณ ศุภพงศ์', 'นักวิชาการตรวจสอบบัญชีปฏิบัติการ', 'ข้าราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'กลุ่มพัฒนาการเรียนรู้');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (13, 'นางสาวพัชรินทร์ คีรีเพ็ชร', 'เจ้าหน้าที่ระบบงานคอมพิวเตอร์', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'กลุ่มพัฒนาการเรียนรู้');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (14, 'นายศุภชัย นุ่นปาน', 'นักจัดการงานทั่วไป', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'กลุ่มพัฒนาการเรียนรู้');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (15, 'นางภัทร์ชยาพร บุญภิบาล', 'นักวิชาการตรวจสอบบัญชีชำนาญการ', 'ข้าราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'กลุ่มเทคโนโลยีสารสนเทศ');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (16, 'นางกิตติมา สุขจันทรา', 'นักวิชาการตรวจสอบบัญชีชำนาญการ', 'ข้าราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'กลุ่มเทคโนโลยีสารสนเทศ');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (17, 'นายทวีศักดิ์ โต๊ะหลี', 'เจ้าหน้าที่ระบบงานคอมพิวเตอร์', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'กลุ่มเทคโนโลยีสารสนเทศ');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (18, 'นายสุภลักษณ์ จันโบ', 'เจ้าหน้าที่ระบบงานคอมพิวเตอร์', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'กลุ่มเทคโนโลยีสารสนเทศ');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (19, 'นางสาวพิชญารัฐ เพชรประพันธ์', 'นักวิชาการตรวจสอบบัญชีชำนาญการพิเศษ', 'ข้าราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'กลุ่มแผนงานและติดตามประเมินผล');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (20, 'นางเพ็ญพยอม แซ่ห้วน', 'นักวิชาการตรวจสอบบัญชีชำนาญการ', 'ข้าราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'กลุ่มแผนงานและติดตามประเมินผล');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (21, 'นางจุรีรัตน์ สุขวานิตย์', 'นักวิชาการตรวจสอบบัญชีชำนาญการ', 'ข้าราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'กลุ่มแผนงานและติดตามประเมินผล');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (22, 'นางลักษมณ เพชรเจริญ', 'นักวิชาการตรวจสอบบัญชีชำนาญการพิเศษ', 'ข้าราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์กระบี่');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (23, 'นางสาวจารุเนตร คงทอง', 'นักวิชาการตรวจสอบบัญชีชำนาญการพิเศษ', 'ข้าราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์กระบี่');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (24, 'นางสาวหยาดภิรุณ มามาตย์', 'นักวิชาการตรวจสอบบัญชีชำนาญการ', 'ข้าราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์กระบี่');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (25, 'นางสาวสุมณฑา มุลกุล', 'นักวิชาการตรวจสอบบัญชีชำนาญการ', 'ข้าราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์กระบี่');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (26, 'นางสาวธัญทิพ ช้อยชาญชัยกุล', 'นักวิชาการตรวจสอบบัญชีชำนาญการ', 'ข้าราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์กระบี่');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (27, 'นางสาวชญานิศ คุ่มเคี่ยม', 'นักวิชาการตรวจสอบบัญชีปฏิบัติการ', 'ข้าราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์กระบี่');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (28, 'นางสาวซาวีณี สัตย์สุข', 'นักวิชาการตรวจสอบบัญชีปฏิบัติการ', 'ข้าราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์กระบี่');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (29, 'นางสาวปรีญาภรณ์ เม่งบุตร', 'นักวิชาการตรวจสอบบัญชีปฏิบัติการ', 'ข้าราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์กระบี่');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (30, 'นางสาวสุวรรณี มาตย์บุตร', 'นักวิชาการตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์กระบี่');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (31, 'นายสิริวัฒน์ คงสุข', 'เจ้าหน้าที่ระบบงานคอมพิวเตอร์', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์กระบี่');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (32, 'นางสุนีย์ ละงู', 'นักวิชาการตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์กระบี่');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (33, 'นางสาววิรินทร์รัชฎิ์ ชูศรี', 'นักวิชาการตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์กระบี่');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (34, 'นางสาวจิรพรรณ บัวแก้ว', 'นักวิชาการตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์กระบี่');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (35, 'นางสาววิภารัตน์ บุญเกื้อ', 'นักวิชาการตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์กระบี่');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (36, 'นางสาววรรจิรา ทองชาติ', 'นักวิชาการตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์กระบี่');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (37, 'นางสาวธนภรณ์ มดคัน', 'นักวิชาการตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์กระบี่');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (38, 'นางสาวภัทรดา ทองทิพย์', 'นักวิชาการตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์กระบี่');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (39, 'นางสาวยุวันดา หลีดี', 'นักวิชาการตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์กระบี่');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (40, 'นางสาวพิชญากร ทองเหลือ', 'นักวิชาการตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์กระบี่');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (41, 'นางวรรณา บุญรัตน์', 'นักวิชาการตรวจสอบบัญชีชำนาญการพิเศษ', 'ข้าราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์ชุมพร');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (42, 'นางสาวทิพวรรณ บุรีรัตน์', 'นักวิชาการตรวจสอบบัญชีชำนาญการพิเศษ', 'ข้าราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์ชุมพร');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (43, 'นางสาวจันทนา ถึงถิ่น', 'นักวิชาการตรวจสอบบัญชีชำนาญการ', 'ข้าราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์ชุมพร');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (44, 'นางสาวศรวณีย์ ข้ามสมุทร', 'นักวิชาการตรวจสอบบัญชีชำนาญการ', 'ข้าราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์ชุมพร');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (45, 'นางทัศนีย์ อินทรสุวรรณ', 'นักวิชาการตรวจสอบบัญชีปฏิบัติการ', 'ข้าราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์ชุมพร');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (46, 'นางสาวศรัญญา แสงสุวรรณ', 'นักวิชาการตรวจสอบบัญชีปฏิบัติการ', 'ข้าราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์ชุมพร');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (47, 'นางสาวสุนทรีย์ ขุนไกร', 'นักวิชาการตรวจสอบบัญชีปฏิบัติการ', 'ข้าราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์ชุมพร');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (48, 'นางสาวนงลักษณ์ ชื่นแก้ว', 'นักวิชาการตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์ชุมพร');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (49, 'นางสาวกุศล อินสุรธาน', 'นักวิชาการตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์ชุมพร');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (50, 'นางสาวประภาพร รักบำรุง', 'นักวิชาการตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์ชุมพร');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (51, 'นางสาวอาภรณ์ ยาดำ', 'นักวิชาการตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์ชุมพร');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (52, 'นายกฤตภคิน พิมพ์สวัสดิ์', 'เจ้าหน้าที่ระบบงานคอมพิวเตอร์', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์ชุมพร');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (53, 'นางสาวบัณฑิตา อักโขพันธ์', 'นักวิชาการตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์ชุมพร');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (54, 'นางสาวนันทิชา นวลละออง', 'นักวิชาการตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์ชุมพร');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (55, 'นางสาววารีรัตน์ ศิริสมบูรณ์', 'นักวิชาการตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์ชุมพร');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (56, 'นางสาวโฉมศรี ไพรพฤกษา', 'นักวิชาการตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์ชุมพร');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (57, 'นางสาววรรณิษา ผูกจิตต์', 'นักวิชาการตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์ชุมพร');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (58, 'นางสาวอัยลดา ใจดี', 'นักวิชาการตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์ชุมพร');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (59, 'นางสาวสมฤดี มณีสาร', 'เจ้าพนักงานตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์ชุมพร');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (60, 'นางสาวศิริวรรณ โพธิ์ถาวร', 'นักวิชาการตรวจสอบบัญชีชำนาญการพิเศษ', 'ข้าราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์นครศรีธรรมราช');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (61, 'นางสาววรรณวรา คงสง', 'นักวิชาการตรวจสอบบัญชีชำนาญการพิเศษ', 'ข้าราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์นครศรีธรรมราช');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (62, 'นางสาวอมรา เจริญวรรณ์', 'นักวิชาการตรวจสอบบัญชีชำนาญการ', 'ข้าราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์นครศรีธรรมราช');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (63, 'นางฐิตารีย์ พาณิชย์กุล', 'นักวิชาการตรวจสอบบัญชีชำนาญการ', 'ข้าราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์นครศรีธรรมราช');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (64, 'นางสาวพิไลวรรณ ทัศนสุวรรณ', 'นักวิชาการตรวจสอบบัญชีชำนาญการ', 'ข้าราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์นครศรีธรรมราช');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (65, 'นางธนัชชา หนุนวงศ์', 'นักวิชาการตรวจสอบบัญชีชำนาญการ', 'ข้าราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์นครศรีธรรมราช');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (66, 'นางสาวอรัญญา ทองอ่อน', 'นักวิชาการตรวจสอบบัญชีชำนาญการ', 'ข้าราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์นครศรีธรรมราช');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (67, 'นางสาวกาญจนา สัตถาพร', 'นักวิชาการตรวจสอบบัญชีชำนาญการ', 'ข้าราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์นครศรีธรรมราช');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (68, 'นางสาวชลธิชา ศรีพิบูลย์', 'นักวิชาการตรวจสอบบัญชีชำนาญการ', 'ข้าราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์นครศรีธรรมราช');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (69, 'นายจิรศักดิ์ ทองแสงแก้ว', 'นักวิชาการตรวจสอบบัญชีชำนาญการ', 'ข้าราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์นครศรีธรรมราช');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (70, 'นางสาวกุลชวัล ดวงคงทอง', 'นักวิชาการตรวจสอบบัญชีชำนาญการ', 'ข้าราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์นครศรีธรรมราช');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (71, 'นางสาวอรสา สุวรรณรัตน์', 'นักวิชาการตรวจสอบบัญชีชำนาญการ', 'ข้าราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์นครศรีธรรมราช');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (72, 'นางสาวสุธานี ราชแป้น', 'นักวิชาการตรวจสอบบัญชีชำนาญการ', 'ข้าราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์นครศรีธรรมราช');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (73, 'นางอรอุรินทร์ นุ่นทิพย์', 'นักวิชาการตรวจสอบบัญชีชำนาญการ', 'ข้าราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์นครศรีธรรมราช');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (74, 'นางสุวิภา สงวนทอง', 'นักวิชาการตรวจสอบบัญชีปฏิบัติการ', 'ข้าราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์นครศรีธรรมราช');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (75, 'นางสาวเมทินี หนูอินทร์', 'นักวิชาการตรวจสอบบัญชีปฏิบัติการ', 'ข้าราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์นครศรีธรรมราช');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (76, 'นางสาววิภาดา ธราพร', 'นักวิชาการตรวจสอบบัญชีปฏิบัติการ', 'ข้าราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์นครศรีธรรมราช');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (77, 'นางพิกุลรัตน์ เพ็ชรหนู', 'นักวิชาการตรวจสอบบัญชีปฏิบัติการ', 'ข้าราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์นครศรีธรรมราช');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (78, 'นางสาวชรินทร์รัตน์ ชูรัตน์', 'นักวิชาการตรวจสอบบัญชีปฏิบัติการ', 'ข้าราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์นครศรีธรรมราช');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (79, 'นางสาวสุธาสิน อริยะพงศ์', 'นักวิชาการตรวจสอบบัญชีปฏิบัติการ', 'ข้าราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์นครศรีธรรมราช');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (80, 'นายจุมพล พิศาล', 'นักวิชาการตรวจสอบบัญชีปฏิบัติการ', 'ข้าราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์นครศรีธรรมราช');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (81, 'นางสาวนัทธวัน ปราบอักษร', 'นักวิชาการตรวจสอบบัญชีปฏิบัติการ', 'ข้าราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์นครศรีธรรมราช');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (82, 'นางสาวณิชภัทร จุฑาวงศ์กุล', 'นักวิชาการตรวจสอบบัญชีปฏิบัติการ', 'ข้าราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์นครศรีธรรมราช');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (83, 'นางสาวณัฐมน รัตนะ', 'นักวิชาการตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์นครศรีธรรมราช');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (84, 'นางสาวอัมพร ไชยานุพงศ์', 'นักวิชาการตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์นครศรีธรรมราช');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (85, 'นางชลนิภา ณ ระนอง', 'นักวิชาการตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์นครศรีธรรมราช');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (86, 'นางสาวเบญจพร เพชรศรีสม', 'นักวิชาการตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์นครศรีธรรมราช');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (87, 'นางสรันพร สุขจีน', 'นักวิชาการตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์นครศรีธรรมราช');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (88, 'นางสาวดรุณี ทองขาว', 'นักวิชาการตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์นครศรีธรรมราช');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (89, 'นางสาววีณัส คุ้มสุข', 'เจ้าหน้าที่ระบบงานคอมพิวเตอร์', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์นครศรีธรรมราช');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (90, 'นางสาวจุฑารัตน์ ศรีสุวรรณ', 'นักวิชาการตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์นครศรีธรรมราช');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (91, 'นางหนึ่งฤทัย บุญบวร', 'นักวิชาการตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์นครศรีธรรมราช');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (92, 'นางจีราวรรณ ทองแสงแก้ว', 'นักวิชาการตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์นครศรีธรรมราช');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (93, 'นางวิไลภรณ์ จิตอารีย์', 'นักวิชาการตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์นครศรีธรรมราช');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (94, 'นางพรทิพย์ ทองอ่อน', 'นักวิชาการตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์นครศรีธรรมราช');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (95, 'นางสาวมธูลดา สุดจันทร์', 'นักวิชาการตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์นครศรีธรรมราช');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (96, 'นางอมร ผิวแก้ว', 'นักวิชาการตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์นครศรีธรรมราช');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (97, 'นางจิดาภา จิตต์ประไพย', 'นักวิชาการตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์นครศรีธรรมราช');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (98, 'นางสาวสุดธิดา จงจิตร', 'เจ้าหน้าที่ระบบงานคอมพิวเตอร์', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์นครศรีธรรมราช');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (99, 'นางศิรารัตน์ สาระพงศ์', 'นักวิชาการตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์นครศรีธรรมราช');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (100, 'นางสาวสุนิตตา นาคีเภท', 'นักวิชาการตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์นครศรีธรรมราช');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (101, 'นางสาวเฉลิมศรี วงศ์ราช', 'นักวิชาการตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์นครศรีธรรมราช');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (102, 'นางสาวนิตยา จันทร์ชาตรี', 'นักวิชาการตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์นครศรีธรรมราช');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (103, 'นางจุรีรัตน์ กาญจนา', 'นักวิชาการตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์นครศรีธรรมราช');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (104, 'นางสาวปิยะวรรณ มีชนะ', 'นักวิชาการตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์นครศรีธรรมราช');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (105, 'นางสาวสุกัญญา ปรีชา', 'นักวิชาการตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์นครศรีธรรมราช');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (106, 'นางสาวพิลาวัณย์ แซ่โว้น', 'นักวิชาการตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์นครศรีธรรมราช');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (107, 'นางวารี ดำเนินผล', 'นักวิชาการตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์นครศรีธรรมราช');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (108, 'นายภัทรพงษ์ พรหมวิเศษ', 'นักจัดการงานทั่วไป', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์นครศรีธรรมราช');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (109, 'นางสาวสุธิดา พรมเส้ง', 'นักวิชาการตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์นครศรีธรรมราช');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (110, 'นางสาวเมธินี พันธ์พืช', 'นักวิชาการตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์นครศรีธรรมราช');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (111, 'นางสาวเยาวลักษณ์ นาคจันทร์', 'นักวิชาการตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์นครศรีธรรมราช');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (112, 'นางสาวสาวิตรี ทองอ่อน', 'นักวิชาการตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์นครศรีธรรมราช');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (113, 'นางสาวฐิติกาญจน์ ห่อหุ้ม', 'นักวิชาการตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์นครศรีธรรมราช');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (114, 'นางสาวกวินตรา ปรีชาชาญ', 'นักวิชาการตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์นครศรีธรรมราช');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (115, 'นางสาวสกาวรัตน์ ส่งขาว', 'นักวิชาการตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์นครศรีธรรมราช');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (116, 'นางสาวดวงพร สร้างบุญ', 'นักวิชาการตรวจสอบบัญชีชำนาญการพิเศษ', 'ข้าราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์พังงา');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (117, 'นางสาวอภิญญา ชูจันทร์', 'นักวิชาการตรวจสอบบัญชีชำนาญการพิเศษ', 'ข้าราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์พังงา');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (118, 'นางสาวศุภนิดา รัตนะ', 'นักวิชาการตรวจสอบบัญชีปฏิบัติการ', 'ข้าราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์พังงา');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (119, 'นางสาวจิราวรรณ อุตะมะ', 'นักวิชาการตรวจสอบบัญชีปฏิบัติการ', 'ข้าราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์พังงา');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (120, 'นางสาววิไลวรรณ มุกดา', 'เจ้าพนักงานตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์พังงา');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (121, 'นางอัญชลิกา ศิวะศิลป์ชัย', 'เจ้าหน้าที่ระบบงานคอมพิวเตอร์', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์พังงา');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (122, 'นางเกษณี นวลจันทร์', 'นักวิชาการตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์พังงา');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (123, 'นางสาวกานติมา หัสนีย์', 'นักวิชาการตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์พังงา');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (124, 'นางสาวอำภาพร แก้วการจร', 'นักวิชาการตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์พังงา');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (125, 'นางสาวพิมพิมนต์ บรรจงการ', 'นักวิชาการตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์พังงา');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (126, 'นางสาวปภัสสร เจนการ', 'นักวิชาการตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์พังงา');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (127, 'นางสาวชนกพร เกษแก้ว', 'นักวิชาการตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์พังงา');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (128, 'นางสาววันเพ็ญ รองเลื่อน', 'นักวิชาการตรวจสอบบัญชีชำนาญการพิเศษ', 'ข้าราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์ภูเก็ต');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (129, 'นางสาวรักชนก เครือแพทย์', 'นักวิชาการตรวจสอบบัญชีชำนาญการพิเศษ', 'ข้าราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์ภูเก็ต');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (130, 'นายการัณยภาส วิริยะศักดิ์สกุล', 'นักวิชาการตรวจสอบบัญชีชำนาญการ', 'ข้าราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์ภูเก็ต');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (131, 'นางสาววาสนา มานะกิจ', 'นักวิชาการตรวจสอบบัญชีปฏิบัติการ', 'ข้าราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์ภูเก็ต');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (132, 'นางสาวกันย์ญรัสมิ์ ชูไชยยัง', 'นักวิชาการตรวจสอบบัญชีปฏิบัติการ', 'ข้าราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์ภูเก็ต');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (133, 'นางสาวรุ่งทิวา ดุมลักษณ์', 'เจ้าหน้าที่ระบบงานคอมพิวเตอร์', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์ภูเก็ต');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (134, 'นางสาวศิริประภา ทองวล', 'นักวิชาการตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์ภูเก็ต');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (135, 'นางสาวกุสุมา แปะเที่ยว', 'นักวิชาการตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์ภูเก็ต');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (136, 'นางสาวนิตยา ประยูร', 'นักวิชาการตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์ภูเก็ต');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (137, 'นางสาวปรียาภรณ์ สังฆวัง', 'นักวิชาการตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์ภูเก็ต');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (138, 'นางณิชชา รัชตทวีโภคิน', 'นักวิชาการตรวจสอบบัญชีชำนาญการพิเศษ', 'ข้าราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์ระนอง');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (139, 'นางสาววิจิตรา ขุนณิชย์', 'นักวิชาการตรวจสอบบัญชีชำนาญการ', 'ข้าราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์ระนอง');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (140, 'นางสาวบุศรินทร์ เลิศเกียรติพงษ์', 'นักวิชาการตรวจสอบบัญชีชำนาญการ', 'ข้าราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์ระนอง');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (141, 'นางสาวโซเฟีย วันสุไลมาน', 'นักวิชาการตรวจสอบบัญชีปฏิบัติการ', 'ข้าราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์ระนอง');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (142, 'นางเกษวดี พัฒน์ธนาชัยภัค', 'นักวิชาการตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์ระนอง');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (143, 'นางสาวสาวิตรี เขียวไข่กา', 'นักวิชาการตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์ระนอง');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (144, 'นางสาวอริยาพร สุทธิคง', 'เจ้าหน้าที่ระบบงานคอมพิวเตอร์', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์ระนอง');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (145, 'นางสาวจรีลักษณ์ จันทร์วัฒนเดชากุล', 'นักวิชาการตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์ระนอง');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (146, 'นางสาวอภิสรา ภูริชวรโชติ', 'นักวิชาการตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์ระนอง');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (147, 'นางอาภรณ์ศิริ กาญจนะ', 'นักวิชาการตรวจสอบบัญชีชำนาญการพิเศษ', 'ข้าราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์สุราษฎร์ธานี');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (148, 'นางยุวดี จงจิตต์', 'นักวิชาการตรวจสอบบัญชีชำนาญการพิเศษ', 'ข้าราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์สุราษฎร์ธานี');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (149, 'นางสุณี พลสังข์', 'นักวิชาการตรวจสอบบัญชีชำนาญการ', 'ข้าราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์สุราษฎร์ธานี');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (150, 'นางสาวนิรมล เลิศพันธ์', 'นักวิชาการตรวจสอบบัญชีชำนาญการ', 'ข้าราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์สุราษฎร์ธานี');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (151, 'นายเกษมสันต์ สร้อยประเสริฐ', 'นักวิชาการตรวจสอบบัญชีชำนาญการ', 'ข้าราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์สุราษฎร์ธานี');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (152, 'นางสาวปิณฑิรา ขาวเต็มดี', 'นักวิชาการตรวจสอบบัญชีชำนาญการ', 'ข้าราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์สุราษฎร์ธานี');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (153, 'นางวนิดา โอชารส', 'นักวิชาการตรวจสอบบัญชีชำนาญการ', 'ข้าราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์สุราษฎร์ธานี');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (154, 'นางสาวมยุเรศ สุดเพชร', 'นักวิชาการตรวจสอบบัญชีชำนาญการ', 'ข้าราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์สุราษฎร์ธานี');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (155, 'นางภนัสฎา นิลอุบล', 'นักวิชาการตรวจสอบบัญชีชำนาญการ', 'ข้าราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์สุราษฎร์ธานี');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (156, 'นางสาววิลาวัณย์ พรหมชิต', 'นักวิชาการตรวจสอบบัญชีชำนาญการ', 'ข้าราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์สุราษฎร์ธานี');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (157, 'นางสาวศิริวันนิภา พรหมขำ', 'นักวิชาการตรวจสอบบัญชีชำนาญการ', 'ข้าราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์สุราษฎร์ธานี');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (158, 'นายพิพัฒน์ แสงอุดม', 'นักวิชาการตรวจสอบบัญชีปฏิบัติการ', 'ข้าราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์สุราษฎร์ธานี');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (159, 'นางสาวจินตภา ศักดาศักดิ์', 'นักวิชาการตรวจสอบบัญชีปฏิบัติการ', 'ข้าราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์สุราษฎร์ธานี');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (160, 'นางสาวพิมพกานต์ มีจิตต์', 'นักวิชาการตรวจสอบบัญชีปฏิบัติการ', 'ข้าราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์สุราษฎร์ธานี');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (161, 'นางสาวนันทินี มณีชัย', 'นักวิชาการตรวจสอบบัญชีปฏิบัติการ', 'ข้าราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์สุราษฎร์ธานี');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (162, 'นางปิยนันท์ บัวทอง', 'นักวิชาการตรวจสอบบัญชีปฏิบัติการ', 'ข้าราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์สุราษฎร์ธานี');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (163, 'นางสาวผกากานต์ แสงอุทัย', 'นักวิชาการตรวจสอบบัญชีปฏิบัติการ', 'ข้าราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์สุราษฎร์ธานี');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (164, 'นางจันทิมา ภักดีพล', 'นักวิชาการตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์สุราษฎร์ธานี');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (165, 'นางสาวสายฝน ทองรักษ์', 'นักวิชาการตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์สุราษฎร์ธานี');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (166, 'นางสาวมลฤดี ศรีเทพ', 'นักวิชาการตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์สุราษฎร์ธานี');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (167, 'นางนันทิดา ผดุงวงศ์', 'นักวิชาการตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์สุราษฎร์ธานี');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (168, 'นางสาวจุฬาวัลย์ เหมประพันธ์', 'นักวิชาการตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์สุราษฎร์ธานี');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (169, 'นายสุธี วรรณทอง', 'เจ้าหน้าที่ระบบงานคอมพิวเตอร์', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์สุราษฎร์ธานี');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (170, 'นางสาวสุภาพร ชื่นจิตร์', 'นักวิชาการตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์สุราษฎร์ธานี');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (171, 'นางสาวศรัญญา วังทะพันธ์', 'นักวิชาการตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์สุราษฎร์ธานี');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (172, 'นางสาวสุพรรณี จรูญพงศ์', 'นักวิชาการตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์สุราษฎร์ธานี');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (173, 'นางสาวกาญจนา แซ่ตั้ง', 'นักวิชาการตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์สุราษฎร์ธานี');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (174, 'นางสาวเมณวิกา ชัยศรี', 'นักวิชาการตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์สุราษฎร์ธานี');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (175, 'นางสาววรรณเพ็ญ แซ่ลิ้ม', 'นักวิชาการตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์สุราษฎร์ธานี');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (176, 'นางสาวหยาดทิพย์ เนียมทับ', 'นักวิชาการตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์สุราษฎร์ธานี');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (177, 'นางจุฑามาศ จิตรัตน์', 'นักวิชาการตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์สุราษฎร์ธานี');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (178, 'นายธาดา ขาวเต็มดี', 'เจ้าหน้าที่ระบบงานคอมพิวเตอร์', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์สุราษฎร์ธานี');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (179, 'นางสาวปัทมา เกลี้ยงกลม', 'นักวิชาการตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์สุราษฎร์ธานี');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (180, 'นางสาวกัญญารัตน์ สุขกิจ', 'นักวิชาการตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์สุราษฎร์ธานี');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (181, 'นางสาวปัทมา เชียรเลิศ', 'นักวิชาการตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์สุราษฎร์ธานี');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (182, 'นางดาราวดี วันดี', 'นักวิชาการตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์สุราษฎร์ธานี');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (183, 'นางสาวสิรินยา สกุลอ่อน', 'นักวิชาการตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์สุราษฎร์ธานี');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (184, 'นายธนิสร รอดสวัสดิ์', 'นักวิชาการตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์สุราษฎร์ธานี');
INSERT INTO `user_confirm` (`id`, `Name_Surname`, `position`, `type`, `Division_Province`, `Department`) VALUES (185, 'นางสาววิภารัตน์ ธราพร', 'นักวิชาการตรวจสอบบัญชี', 'พนักงานราชการ', 'สำนักงานตรวจบัญชีสหกรณ์ที่ 8', 'สำนักงานตรวจบัญชีสหกรณ์สุราษฎร์ธานี');
COMMIT;

-- ----------------------------
-- Table structure for user_groups
-- ----------------------------
DROP TABLE IF EXISTS `user_groups`;
CREATE TABLE `user_groups` (
  `group_id` int NOT NULL AUTO_INCREMENT,
  `group_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `group_description` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`group_id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Records of user_groups
-- ----------------------------
BEGIN;
INSERT INTO `user_groups` (`group_id`, `group_name`, `group_description`, `created_at`, `updated_at`) VALUES (1, 'ผู้ดูแลระบบ', 'admin', '2026-05-08 13:35:53', '2026-05-08 13:35:53');
INSERT INTO `user_groups` (`group_id`, `group_name`, `group_description`, `created_at`, `updated_at`) VALUES (2, 'กลุ่มเทคโนโลยีสารสนเทศ', 'ผู้ปฏิบัติงานกลุ่มเทคโนโลยีสารสนเทศ สตท.8', '2026-05-08 15:16:43', '2026-05-12 11:30:04');
INSERT INTO `user_groups` (`group_id`, `group_name`, `group_description`, `created_at`, `updated_at`) VALUES (3, 'ผู้ใช้งานทั่วไป', 'ผู้ใช้งานทั่วไปในพื้นที่สำนักงานตรวจบัญชีสหกรณ์ที่ 8', '2026-05-08 15:18:50', '2026-05-12 11:28:44');
INSERT INTO `user_groups` (`group_id`, `group_name`, `group_description`, `created_at`, `updated_at`) VALUES (4, 'ผู้บริหาร', 'ผู้อำนวยการ/ผู้เชี่ยวชาญ', '2026-05-12 11:23:23', '2026-05-12 11:23:23');
COMMIT;

-- ----------------------------
-- Table structure for user_sessions
-- ----------------------------
DROP TABLE IF EXISTS `user_sessions`;
CREATE TABLE `user_sessions` (
  `session_id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `login_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `logout_time` datetime DEFAULT NULL,
  `is_online` tinyint(1) DEFAULT '1',
  `ip_address` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `user_agent` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`session_id`),
  KEY `idx_user_online` (`user_id`,`is_online`),
  KEY `idx_login_time` (`login_time`)
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Records of user_sessions
-- ----------------------------
BEGIN;
INSERT INTO `user_sessions` (`session_id`, `user_id`, `login_time`, `logout_time`, `is_online`, `ip_address`, `user_agent`) VALUES (1, 1, '2026-05-09 09:43:13', '2026-05-09 10:48:18', 0, '127.0.0.1', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36');
INSERT INTO `user_sessions` (`session_id`, `user_id`, `login_time`, `logout_time`, `is_online`, `ip_address`, `user_agent`) VALUES (2, 3, '2026-05-09 10:35:19', '2026-05-09 10:42:11', 0, '192.168.1.37', 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Mobile Safari/537.36');
INSERT INTO `user_sessions` (`session_id`, `user_id`, `login_time`, `logout_time`, `is_online`, `ip_address`, `user_agent`) VALUES (3, 3, '2026-05-09 10:46:23', '2026-05-09 10:50:20', 0, '192.168.1.37', 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Mobile Safari/537.36');
INSERT INTO `user_sessions` (`session_id`, `user_id`, `login_time`, `logout_time`, `is_online`, `ip_address`, `user_agent`) VALUES (4, 1, '2026-05-09 10:48:34', '2026-05-09 11:51:26', 0, '127.0.0.1', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36');
INSERT INTO `user_sessions` (`session_id`, `user_id`, `login_time`, `logout_time`, `is_online`, `ip_address`, `user_agent`) VALUES (5, 3, '2026-05-09 11:01:23', '2026-05-09 11:17:40', 0, '192.168.1.37', 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Mobile Safari/537.36');
INSERT INTO `user_sessions` (`session_id`, `user_id`, `login_time`, `logout_time`, `is_online`, `ip_address`, `user_agent`) VALUES (6, 1, '2026-05-09 11:51:34', '2026-05-10 13:04:44', 0, '127.0.0.1', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36');
INSERT INTO `user_sessions` (`session_id`, `user_id`, `login_time`, `logout_time`, `is_online`, `ip_address`, `user_agent`) VALUES (7, 1, '2026-05-10 13:04:44', '2026-05-11 13:40:33', 0, '127.0.0.1', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36');
INSERT INTO `user_sessions` (`session_id`, `user_id`, `login_time`, `logout_time`, `is_online`, `ip_address`, `user_agent`) VALUES (8, 1, '2026-05-11 13:40:34', '2026-05-11 15:17:47', 0, '127.0.0.1', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36');
INSERT INTO `user_sessions` (`session_id`, `user_id`, `login_time`, `logout_time`, `is_online`, `ip_address`, `user_agent`) VALUES (9, 1, '2026-05-11 15:17:47', '2026-05-11 19:14:20', 0, '127.0.0.1', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36');
INSERT INTO `user_sessions` (`session_id`, `user_id`, `login_time`, `logout_time`, `is_online`, `ip_address`, `user_agent`) VALUES (10, 1, '2026-05-11 19:14:20', '2026-05-12 08:32:57', 0, '127.0.0.1', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36');
INSERT INTO `user_sessions` (`session_id`, `user_id`, `login_time`, `logout_time`, `is_online`, `ip_address`, `user_agent`) VALUES (11, 1, '2026-05-12 08:32:57', '2026-05-12 09:07:46', 0, '127.0.0.1', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36');
INSERT INTO `user_sessions` (`session_id`, `user_id`, `login_time`, `logout_time`, `is_online`, `ip_address`, `user_agent`) VALUES (12, 1, '2026-05-12 09:07:59', '2026-05-12 11:30:31', 0, '127.0.0.1', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36');
COMMIT;

SET FOREIGN_KEY_CHECKS = 1;
