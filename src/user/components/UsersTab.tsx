import { useState } from 'react';
import { Users, UserCheck, Search, Plus, Edit, X, AlertCircle } from 'lucide-react';
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
  type?: string;
  Department?: string;
  National_ID_number?: string;
  user_status: number | null;
  group_name: string | null;
}

export function UsersTab({ groups, users, onRefresh }: { groups: Group[]; users: UserRow[]; onRefresh: ()=>Promise<void>; }) {
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState<number|null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [formData, setFormData] = useState({
    Name_Surname: '', position: '', type: '', Division_Province: '', Department: '',
    email: '', National_ID_number: '', username: '', password: '', user_status: ''
  });
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  // Modal Handlers
  const openAddModal = () => {
    setEditingUser(null);
    setFormData({
      Name_Surname: '', position: '', type: '', Division_Province: '', Department: '',
      email: '', National_ID_number: '', username: '', password: '', user_status: ''
    });
    setFormError('');
    setIsModalOpen(true);
  };

  const openEditModal = (u: UserRow) => {
    setEditingUser(u);
    setFormData({
      Name_Surname: u.Name_Surname || '',
      position: u.position || '',
      type: u.type || '',
      Division_Province: u.Division_Province || '',
      Department: u.Department || '',
      email: u.email || '',
      National_ID_number: u.National_ID_number || '',
      username: u.username || '',
      password: '', // ปล่อยว่างถ้าไม่ต้องการเปลี่ยนรหัสผ่าน
      user_status: u.user_status?.toString() || ''
    });
    setFormError('');
    setIsModalOpen(true);
  };

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    
    // ตรวจสอบข้อมูลเบื้องต้น
    if (!formData.Name_Surname || !formData.username) {
      setFormError('กรุณากรอกข้อมูลที่จำเป็น (ชื่อ-นามสกุล, username)');
      return;
    }
    if (!editingUser && !formData.password) {
      setFormError('กรุณากำหนดรหัสผ่านสำหรับผู้ใช้งานใหม่');
      return;
    }

    setIsSubmitting(true);
    try {
      const url = editingUser ? `${API}/users/${editingUser.user_id}` : `${API}/users`;
      const method = editingUser ? 'PUT' : 'POST';
      const body = {
        ...formData,
        user_status: formData.user_status ? Number(formData.user_status) : null
      };

      const r = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const contentType = r.headers.get("content-type");
      if (contentType && contentType.indexOf("application/json") !== -1) {
        const d = await r.json();
        if (!r.ok) {
          setFormError(d.error || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล');
          return;
        }
        toast.success(d.message);
        setIsModalOpen(false);
        await onRefresh();
      } else {
        setFormError('เซิร์ฟเวอร์ตอบกลับไม่ถูกต้อง โปรดรีสตาร์ท Backend (API ไม่พบเส้นทางนี้)');
      }
    } catch (err) {
      setFormError('เกิดข้อผิดพลาดในการเชื่อมต่อกับเซิร์ฟเวอร์');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 relative">
      {/* Search and Add User Button */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"/>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อ, username, ตำแหน่ง..."
            className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
          />
        </div>
        <button
          onClick={openAddModal}
          className="flex items-center justify-center gap-2 px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl text-sm font-semibold transition-all shadow-sm shrink-0"
        >
          <Plus size={16} />
          เพิ่มผู้ใช้งาน
        </button>
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
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-800 text-sm truncate">{u.Name_Surname}</p>
                  <p className="text-xs text-slate-400">{u.username} · {u.position}</p>
                </div>
                <button onClick={() => openEditModal(u)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                  <Edit size={16} />
                </button>
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
                {['ผู้ใช้งาน','ตำแหน่ง','ส่วนงาน','กลุ่มปัจจุบัน','จัดการ'].map(h => (
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
                    <div className="flex items-center gap-2">
                      <select
                        value={u.user_status?.toString() || ''}
                        onChange={e => assignGroup(u.user_id, e.target.value)}
                        disabled={saving === u.user_id}
                        className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all min-w-[140px]">
                        <option value="">-- ไม่มีกลุ่ม --</option>
                        {groups.map(g => <option key={g.group_id} value={g.group_id}>{g.group_name}</option>)}
                      </select>
                      <button 
                        onClick={() => openEditModal(u)}
                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors"
                        title="แก้ไขข้อมูลผู้ใช้"
                      >
                        <Edit size={16} />
                      </button>
                    </div>
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

      {/* Add/Edit User Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white/90 backdrop-blur z-10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
                  {editingUser ? <Edit size={20}/> : <Plus size={20}/>}
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-lg">
                    {editingUser ? 'แก้ไขข้อมูลผู้ใช้งาน' : 'เพิ่มผู้ใช้งานใหม่'}
                  </h3>
                  <p className="text-xs text-slate-500">กรอกข้อมูลรายละเอียดผู้ใช้งานให้ครบถ้วน</p>
                </div>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors"
              >
                <X size={20}/>
              </button>
            </div>

            <div className="p-6 overflow-y-auto">
              {formError && (
                <div className="mb-6 p-4 bg-red-50 text-red-600 rounded-xl text-sm font-medium flex items-center gap-3 border border-red-100">
                  <AlertCircle size={18} className="shrink-0" />
                  {formError}
                </div>
              )}

              <form id="user-form" onSubmit={handleSubmit} className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* Column 1 */}
                  <div className="space-y-4">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">ข้อมูลส่วนตัว</h4>
                    
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">ชื่อ-นามสกุล <span className="text-red-500">*</span></label>
                      <input 
                        name="Name_Surname" value={formData.Name_Surname} onChange={handleFormChange} required
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">เลขประจำตัวประชาชน</label>
                      <input 
                        name="National_ID_number" value={formData.National_ID_number} onChange={handleFormChange} maxLength={13}
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">อีเมล (Email)</label>
                      <input 
                        name="email" type="email" value={formData.email} onChange={handleFormChange}
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                      />
                    </div>

                    <div className="pt-4 mt-4 border-t border-slate-100">
                      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">การทำงาน</h4>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">ตำแหน่ง</label>
                      <input 
                        name="position" value={formData.position} onChange={handleFormChange}
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">ประเภทบุคลากร</label>
                      <select 
                        name="type" value={formData.type} onChange={handleFormChange}
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                      >
                        <option value="">-- เลือกประเภท --</option>
                        <option value="ข้าราชการ">ข้าราชการ</option>
                        <option value="พนักงานราชการ">พนักงานราชการ</option>
                        <option value="ลูกจ้างประจำ">ลูกจ้างประจำ</option>
                        <option value="ลูกจ้างชั่วคราว">ลูกจ้างชั่วคราว</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">หน่วยงาน/จังหวัด</label>
                      <input 
                        name="Division_Province" value={formData.Division_Province} onChange={handleFormChange}
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">กลุ่มงาน</label>
                      <input 
                        name="Department" value={formData.Department} onChange={handleFormChange}
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                      />
                    </div>
                  </div>

                  {/* Column 2 */}
                  <div className="space-y-4">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">ข้อมูลเข้าสู่ระบบ</h4>
                    
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">ชื่อผู้ใช้งาน (Username) <span className="text-red-500">*</span></label>
                      <input 
                        name="username" value={formData.username} onChange={handleFormChange} required
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">รหัสผ่าน (Password) {!editingUser && <span className="text-red-500">*</span>}</label>
                      <input 
                        name="password" type="password" value={formData.password} onChange={handleFormChange}
                        placeholder={editingUser ? "เว้นว่างไว้ถ้าไม่ต้องการเปลี่ยน" : ""}
                        required={!editingUser}
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">กลุ่มสิทธิ์การใช้งาน (Role)</label>
                      <select 
                        name="user_status" value={formData.user_status} onChange={handleFormChange}
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                      >
                        <option value="">-- ไม่มีกลุ่ม --</option>
                        {groups.map(g => <option key={g.group_id} value={g.group_id}>{g.group_name}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              </form>
            </div>

            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-3 sticky bottom-0">
              <button 
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors"
                disabled={isSubmitting}
              >
                ยกเลิก
              </button>
              <button 
                form="user-form"
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all shadow-sm shadow-blue-500/30 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>}
                บันทึกข้อมูล
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
