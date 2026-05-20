import * as LucideIcons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { API_BASE } from './apiConfig';

export type MenuType = 'sidebar' | 'content';

export interface UserMenuItem {
  menu_id: number;
  menu_key: string;
  menu_name: string;
  menu_type: MenuType;
  menu_icon: string | null;
  menu_href: string | null;
  sort_order: number;
  is_active: number;
}

const MENU_CACHE_KEY = 'menu_allowed_items_v2';
const PERM_CACHE_KEY = 'menu_allowed_keys_v2';

const LEGACY_MENU_ITEMS: UserMenuItem[] = [
  { menu_id: 1, menu_key: 'home', menu_name: 'หน้าหลัก', menu_type: 'sidebar', menu_icon: 'Home', menu_href: '/index', sort_order: 1, is_active: 1 },
  { menu_id: 2, menu_key: 'profile', menu_name: 'ข้อมูลส่วนตัว', menu_type: 'sidebar', menu_icon: 'FileText', menu_href: '/profile', sort_order: 2, is_active: 1 },
  { menu_id: 3, menu_key: 'training', menu_name: 'ประวัติการอบรม', menu_type: 'sidebar', menu_icon: 'ListTodo', menu_href: '/training-history', sort_order: 3, is_active: 1 },
  { menu_id: 4, menu_key: 'change_password', menu_name: 'เปลี่ยนรหัสผ่าน', menu_type: 'sidebar', menu_icon: 'KeyRound', menu_href: '/change-password', sort_order: 4, is_active: 1 },
  { menu_id: 5, menu_key: 'user_settings', menu_name: 'ตั้งค่าผู้ใช้งาน', menu_type: 'sidebar', menu_icon: 'Settings', menu_href: '/user-settings', sort_order: 5, is_active: 1 },
  { menu_id: 6, menu_key: 'monitor_data', menu_name: 'บันทึกกำกับติดตามกลุ่มเทคฯ', menu_type: 'sidebar', menu_icon: 'ClipboardEdit', menu_href: '/monitor-data', sort_order: 6, is_active: 1 },
  { menu_id: 7, menu_key: 'training_admin', menu_name: 'จัดการระบบอบรม', menu_type: 'sidebar', menu_icon: 'GraduationCap', menu_href: '/training-admin', sort_order: 7, is_active: 1 },
  { menu_id: 8, menu_key: 'knowledge_admin', menu_name: 'จัดการคลังความรู้', menu_type: 'sidebar', menu_icon: 'LibraryBig', menu_href: '/knowledge-admin', sort_order: 8, is_active: 1 },
  { menu_id: 10, menu_key: 'report_monitor', menu_name: 'รายงานการกำกับติดตามฯ', menu_type: 'content', menu_icon: 'Monitor', menu_href: '/program-monitoring', sort_order: 10, is_active: 1 },
  { menu_id: 11, menu_key: 'report_course', menu_name: 'หลักสูตรการอบรม', menu_type: 'content', menu_icon: 'BookOpen', menu_href: '/training-courses', sort_order: 11, is_active: 1 },
  { menu_id: 12, menu_key: 'report_usage', menu_name: 'รายงานการใช้งานระบบ', menu_type: 'content', menu_icon: 'Users', menu_href: '/system-usage-report', sort_order: 12, is_active: 1 },
  { menu_id: 13, menu_key: 'report_security', menu_name: 'รายงานการรักษาความปลอดภัย', menu_type: 'content', menu_icon: 'ShieldCheck', menu_href: '/office-security-report', sort_order: 13, is_active: 1 },
  { menu_id: 14, menu_key: 'knowledge', menu_name: 'คลังความรู้', menu_type: 'content', menu_icon: 'LibraryBig', menu_href: '/knowledge', sort_order: 14, is_active: 1 },
];

interface MenuCache {
  userId: number;
  menus: UserMenuItem[];
}

export function readCachedMenus(userId: number): UserMenuItem[] | undefined {
  try {
    const raw = sessionStorage.getItem(MENU_CACHE_KEY);
    if (raw === null) return undefined;
    const parsed = JSON.parse(raw) as MenuCache;
    return parsed.userId === userId && Array.isArray(parsed.menus) ? parsed.menus : undefined;
  } catch {
    return undefined;
  }
}

export function writeCachedMenus(userId: number, menus: UserMenuItem[]) {
  try {
    sessionStorage.setItem(MENU_CACHE_KEY, JSON.stringify({ userId, menus }));
  } catch { /* ignore */ }
}

export function clearMenuAccessCache() {
  try {
    sessionStorage.removeItem(MENU_CACHE_KEY);
    sessionStorage.removeItem(PERM_CACHE_KEY);
  } catch { /* ignore */ }
}

export async function fetchAllowedMenus(userId: number): Promise<UserMenuItem[]> {
  const response = await fetch(`${API_BASE}/api/users/${userId}/menus`);
  if (response.ok) return response.json();

  if (response.status === 404) {
    const legacyResponse = await fetch(`${API_BASE}/api/users/${userId}/menu-permissions`);
    if (!legacyResponse.ok) throw new Error('Cannot fetch menu permissions');

    const data = await legacyResponse.json();
    if (data.allowed === null || data.allowed === undefined) return LEGACY_MENU_ITEMS;
    if (!Array.isArray(data.allowed)) return [];
    return LEGACY_MENU_ITEMS.filter(menu => data.allowed.includes(menu.menu_key));
  }

  throw new Error('Cannot fetch menu list');
}

export function getMenuHref(menu: Pick<UserMenuItem, 'menu_href'>) {
  return menu.menu_href?.trim() || '#';
}

export function getMenuIcon(iconName?: string | null): LucideIcon {
  const icons = LucideIcons as unknown as Record<string, LucideIcon | undefined>;
  return (iconName ? icons[iconName] : undefined) || LucideIcons.FileText;
}

const MENU_COLORS = [
  'bg-[#007AFF]',
  'bg-[#5856D6]',
  'bg-[#FF9500]',
  'bg-[#34C759]',
  'bg-[#AF52DE]',
  'bg-[#FF2D55]',
  'bg-[#00A7B5]',
  'bg-[#8E8E93]',
];

export function getMenuColor(index: number) {
  return MENU_COLORS[index % MENU_COLORS.length];
}

const CONTENT_STYLES = [
  {
    iconBg: 'from-blue-500 to-blue-600',
    hoverBg: 'group-hover:from-blue-600 group-hover:to-blue-700',
    iconShadow: 'rgba(37,99,235,0.4)',
  },
  {
    iconBg: 'from-emerald-500 to-emerald-600',
    hoverBg: 'group-hover:from-emerald-600 group-hover:to-emerald-700',
    iconShadow: 'rgba(5,150,105,0.4)',
  },
  {
    iconBg: 'from-orange-500 to-orange-600',
    hoverBg: 'group-hover:from-orange-600 group-hover:to-orange-700',
    iconShadow: 'rgba(234,88,12,0.4)',
  },
  {
    iconBg: 'from-purple-500 to-purple-600',
    hoverBg: 'group-hover:from-purple-600 group-hover:to-purple-700',
    iconShadow: 'rgba(147,51,234,0.4)',
  },
  {
    iconBg: 'from-rose-500 to-rose-600',
    hoverBg: 'group-hover:from-rose-600 group-hover:to-rose-700',
    iconShadow: 'rgba(225,29,72,0.4)',
  },
  {
    iconBg: 'from-cyan-500 to-cyan-600',
    hoverBg: 'group-hover:from-cyan-600 group-hover:to-cyan-700',
    iconShadow: 'rgba(8,145,178,0.4)',
  },
];

export function getContentMenuStyle(index: number) {
  return CONTENT_STYLES[index % CONTENT_STYLES.length];
}
