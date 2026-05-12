import { useState } from 'react';
import { Users, UserCheck, Search } from 'lucide-react';
import { toast } from 'react-toastify';
import type { Group } from './GroupsTab';
import { API_BASE } from '../../lib/apiConfig';

const API = `${API_BASE}/api/admin`;

interface UserRow {
  user_id: number;
  Name_Surname: string;
  username: string;
  email: string;
  position: string;
  Division_Province: string;
  user_status: number | null;
  group_name: string | null;
}

export function UsersTab({ groups, users, onRefresh }: { groups: Group[]; users: UserRow[]; onRefresh: ()=>Promise<void>; }) {
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState<number|null>(null);

  const filtered = users.filter(u =>
    u.Name_Surname?.toLowerCase().includes(search.toLowerCase()) ||
    u.username?.toLowerCase().includes(search.toLowerCase()) ||
    u.position?.toLowerCase().includes(search.toLowerCase())
  );

  const assignGroup = async (userId: number, groupId: string) => {
    setSaving(userId);
    try {
      const r = await fetch(`${API}/users/${userId}/group`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group_id: groupId === '' ? null : Number(groupId) })
      });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error); return; }
      toast.success(d.message);
      await onRefresh();
    } finally {
      setSaving(null);
    }
  };

  const getInitials = (name: string) => {
    if (!name) return '?';
    const parts = name.split(' ');
    return parts.length >= 2 ? parts[0][0] + parts[1][0] : name[0];
  };

  const colors = ['bg-blue-500','bg-emerald-500','bg-purple-500','bg-orange-500','bg-pink-500','bg-teal-500'];

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"/>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="ค้นหาชื่อ, username, ตำแหน่ง..."
          className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
        />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white/80 rounded-2xl border border-white p-4 shadow-sm">
          <p className="text-xs text-slate-400 font-semibold">ผู้ใช้ทั้งหมด</p>
          <p className="text-2xl font-black text-slate-800 mt-1">{users.length}</p>
        </div>
        <div className="bg-white/80 rounded-2xl border border-white p-4 shadow-sm">
          <p className="text-xs text-slate-400 font-semibold">มีกลุ่มแล้ว</p>
          <p className="text-2xl font-black text-blue-600 mt-1">{users.filter(u=>u.user_status).length}</p>
        </div>
        <div className="bg-white/80 rounded-2xl border border-white p-4 shadow-sm">
          <p className="text-xs text-slate-400 font-semibold">ยังไม่มีกลุ่ม</p>
          <p className="text-2xl font-black text-orange-500 mt-1">{users.filter(u=>!u.user_status).length}</p>
        </div>
        <div className="bg-white/80 rounded-2xl border border-white p-4 shadow-sm">
          <p className="text-xs text-slate-400 font-semibold">จำนวนกลุ่ม</p>
          <p className="text-2xl font-black text-emerald-600 mt-1">{groups.length}</p>
        </div>
      </div>

      {/* Users List */}
      <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-white shadow-[0_8px_30px_rgba(0,0,0,0.04)] overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
          <Users size={16} className="text-blue-600"/>
          <span className="font-bold text-slate-700 text-sm">รายชื่อผู้ใช้งาน</span>
          <span className="ml-auto text-xs text-slate-400">{filtered.length} รายการ</span>
        </div>

        {/* Mobile Cards */}
        <div className="sm:hidden divide-y divide-slate-50">
          {filtered.map((u, i) => (
            <div key={u.user_id} className="p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0 ${colors[i%colors.length]}`}>
                  {getInitials(u.Name_Surname)}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-slate-800 text-sm truncate">{u.Name_Surname}</p>
                  <p className="text-xs text-slate-400">{u.username} · {u.position}</p>
                </div>
              </div>
              <select
                value={u.user_status?.toString() || ''}
                onChange={e => assignGroup(u.user_id, e.target.value)}
                disabled={saving === u.user_id}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all">
                <option value="">-- ไม่มีกลุ่ม --</option>
                {groups.map(g => <option key={g.group_id} value={g.group_id}>{g.group_name}</option>)}
              </select>
            </div>
          ))}
        </div>

        {/* Desktop Table */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50/80">
              <tr>
                {['ผู้ใช้งาน','ตำแหน่ง','ส่วนงาน','กลุ่มปัจจุบัน','กำหนดกลุ่ม'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-bold text-slate-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map((u, i) => (
                <tr key={u.user_id} className="hover:bg-blue-50/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 ${colors[i%colors.length]}`}>
                        {getInitials(u.Name_Surname)}
                      </div>
                      <div>
                        <p className="font-semibold text-slate-700">{u.Name_Surname}</p>
                        <p className="text-xs text-slate-400">{u.username}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{u.position||'-'}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{u.Division_Province||'-'}</td>
                  <td className="px-4 py-3">
                    {u.group_name
                      ? <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-100 text-blue-700 text-xs font-bold"><UserCheck size={11}/>{u.group_name}</span>
                      : <span className="text-xs text-slate-300 font-medium">ไม่มีกลุ่ม</span>
                    }
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={u.user_status?.toString() || ''}
                      onChange={e => assignGroup(u.user_id, e.target.value)}
                      disabled={saving === u.user_id}
                      className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all min-w-[140px]">
                      <option value="">-- ไม่มีกลุ่ม --</option>
                      {groups.map(g => <option key={g.group_id} value={g.group_id}>{g.group_name}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-16 text-slate-300">
            <Users size={40} className="mx-auto mb-3"/>
            <p className="font-medium text-slate-400">ไม่พบผู้ใช้งาน</p>
          </div>
        )}
      </div>
    </div>
  );
}
