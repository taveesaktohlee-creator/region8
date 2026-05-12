import React, { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { Settings, Users, Layout, X, Save, Edit3, Trash2, Check, Plus } from 'lucide-react';
import { toast } from 'react-toastify';
import { API_BASE } from '../../lib/apiConfig';

const API = `${API_BASE}/api/admin`;
export type MenuItem = { menu_id: number; menu_key: string; menu_name: string; menu_type: 'sidebar'|'content'; menu_icon: string; menu_href: string; sort_order: number; is_active: number; can_view?: number; };
export type Group = { group_id: number; group_name: string; group_description: string; };

// -------- Reusable Modal Shell --------
export const Modal = memo(function Modal({ title, onClose, children, footer }: { title: React.ReactNode; onClose: ()=>void; children: React.ReactNode; footer: React.ReactNode; }) {
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      {/* overlay แยกเป็น div ต่างหาก ไม่ใช้ backdrop-blur เพื่อความเร็ว */}
      <div className="absolute inset-0 bg-black/40" />
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col relative z-10"
        onClick={e => e.stopPropagation()}
        style={{ contain: 'layout paint' }}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div className="font-bold text-slate-800 flex items-center gap-2">{title}</div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl transition-colors"><X size={18}/></button>
        </div>
        <div className="overflow-y-auto flex-1 p-6">{children}</div>
        <div className="flex gap-3 px-6 py-4 border-t border-slate-100 shrink-0">{footer}</div>
      </div>
    </div>
  );
});

// -------- Perm Toggle Button --------
const PermButton = memo(function PermButton({ m, color, onToggle }: { m: MenuItem; color: string; onToggle: (menuId: number) => void; }) {
  const active = !!m.can_view;
  const isBlue = color === 'blue';

  return (
    <button
      onClick={() => onToggle(m.menu_id)}
      className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-colors text-left ${
        active
          ? isBlue ? 'bg-blue-50 border-blue-200' : 'bg-emerald-50 border-emerald-200'
          : 'bg-slate-50 border-slate-100 hover:border-slate-200'
      }`}
    >
      <div className="flex items-center gap-3">
        <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center ${
          active
            ? isBlue ? 'bg-blue-600 border-blue-600' : 'bg-emerald-600 border-emerald-600'
            : 'border-slate-300'
        }`}>
          {active && <Check size={12} className="text-white"/>}
        </div>
        <span className={`text-sm font-semibold ${
          active
            ? isBlue ? 'text-blue-800' : 'text-emerald-800'
            : 'text-slate-600'
        }`}>{m.menu_name}</span>
      </div>
      <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
        active
          ? isBlue ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'
          : 'bg-slate-100 text-slate-400'
      }`}>
        {active ? 'มีสิทธิ์' : 'ไม่มีสิทธิ์'}
      </span>
    </button>
  );
});

// -------- Permission Modal --------
const PermissionsModal = memo(function PermissionsModal({ group, onClose, onSaved }: { group: Group; onClose: () => void; onSaved: () => void; }) {
  const [perms, setPerms] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API}/groups/${group.group_id}/permissions`)
      .then(r => r.json())
      .then(data => { if (!cancelled) { setPerms(data); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [group.group_id]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const handleToggle = useCallback((menuId: number) => {
    setPerms(prev => prev.map(p => p.menu_id === menuId ? { ...p, can_view: p.can_view ? 0 : 1 } : p));
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const r = await fetch(`${API}/groups/${group.group_id}/permissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissions: perms.map(p => ({ menu_id: p.menu_id, can_view: p.can_view })) })
      });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error); return; }
      toast.success(d.message);
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }, [group.group_id, perms, onClose, onSaved]);

  const sidebar = useMemo(() => perms.filter(p => p.menu_type === 'sidebar'), [perms]);
  const content = useMemo(() => perms.filter(p => p.menu_type === 'content'), [perms]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col relative z-10"
        onClick={e => e.stopPropagation()}
        style={{ contain: 'layout paint' }}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div>
            <div className="font-bold text-slate-800 flex items-center gap-2"><Layout size={18} className="text-blue-600"/>สิทธิ์เมนู</div>
            <p className="text-sm text-slate-400 mt-0.5">กลุ่ม: <span className="font-semibold text-blue-600">{group.group_name}</span></p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl transition-colors"><X size={18}/></button>
        </div>
        <div className="overflow-y-auto flex-1 p-6 space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">เมนูด้านซ้าย (Sidebar)</h4>
                <div className="space-y-2">
                  {sidebar.map(m => <PermButton key={m.menu_id} m={m} color="blue" onToggle={handleToggle} />)}
                </div>
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">เมนูรายงาน (Content)</h4>
                <div className="space-y-2">
                  {content.map(m => <PermButton key={m.menu_id} m={m} color="emerald" onToggle={handleToggle} />)}
                </div>
              </div>
            </>
          )}
        </div>
        <div className="flex gap-3 px-6 py-4 border-t border-slate-100 shrink-0">
          <button onClick={onClose} className="flex-1 py-3 rounded-2xl border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50 transition-colors">ยกเลิก</button>
          <button onClick={handleSave} disabled={saving || loading} className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-semibold shadow-lg shadow-emerald-500/25 hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2 disabled:opacity-50">
            {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/> : <Save size={16}/>}
            บันทึกสิทธิ์
          </button>
        </div>
      </div>
    </div>
  );
});

// -------- GROUPS TAB --------
export function GroupsTab({ groups, onRefresh }: { groups: Group[]; onRefresh: ()=>Promise<void>; }) {
  const [modal, setModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState<Partial<Group>>({});
  const [permGroup, setPermGroup] = useState<Group|null>(null);

  const openCreate = useCallback(() => { setForm({}); setEditMode(false); setModal(true); }, []);
  const openEdit = useCallback((g: Group) => { setForm({...g}); setEditMode(true); setModal(true); }, []);

  const save = useCallback(async () => {
    if (!form.group_name?.trim()) { toast.warning('กรุณาระบุชื่อกลุ่ม'); return; }
    const url = editMode ? `${API}/groups/${form.group_id}` : `${API}/groups`;
    const r = await fetch(url, { method: editMode?'PUT':'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(form) });
    const d = await r.json();
    if (!r.ok) { toast.error(d.error); return; }
    toast.success(d.message); setModal(false); await onRefresh();
  }, [form, editMode, onRefresh]);

  const del = useCallback(async (g: Group) => {
    if (!confirm(`ลบกลุ่ม "${g.group_name}" ใช่หรือไม่?`)) return;
    const r = await fetch(`${API}/groups/${g.group_id}`, { method:'DELETE' });
    const d = await r.json();
    if (!r.ok) { toast.error(d.error); return; }
    toast.success(d.message); await onRefresh();
  }, [onRefresh]);

  const openPerms = useCallback((g: Group) => { setPermGroup(g); }, []);
  const handlePermSaved = useCallback(() => {}, []);

  return (
    <>
      <div className="flex justify-end mb-4">
        <button onClick={openCreate} className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold rounded-2xl shadow-lg shadow-blue-500/25 hover:-translate-y-0.5 active:scale-95 transition-all">
          <Plus size={16}/> สร้างกลุ่มใหม่
        </button>
      </div>

      {groups.length === 0 ? (
        <div className="text-center py-20 text-slate-300">
          <Users size={48} className="mx-auto mb-3"/>
          <p className="font-medium text-slate-400">ยังไม่มีกลุ่มผู้ใช้งาน</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {groups.map(g => (
            <div key={g.group_id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col gap-4 hover:-translate-y-1 transition-transform">
              <div className="flex items-start justify-between">
                <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600"><Settings size={20}/></div>
                <div className="flex gap-1">
                  <button onClick={()=>openPerms(g)} title="สิทธิ์" className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors"><Layout size={15}/></button>
                  <button onClick={()=>openEdit(g)} title="แก้ไข" className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-colors"><Edit3 size={15}/></button>
                  <button onClick={()=>del(g)} title="ลบ" className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"><Trash2 size={15}/></button>
                </div>
              </div>
              <div>
                <h3 className="font-bold text-slate-800">{g.group_name}</h3>
                <p className="text-sm text-slate-400 mt-1">{g.group_description||'ไม่มีคำอธิบาย'}</p>
              </div>
              <button onClick={()=>openPerms(g)} className="w-full py-2.5 rounded-xl bg-slate-50 hover:bg-blue-50 text-slate-500 hover:text-blue-600 text-sm font-semibold border border-slate-100 hover:border-blue-100 transition-colors flex items-center justify-center gap-2">
                <Layout size={14}/> จัดการสิทธิ์เมนู
              </button>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <Modal title={<><Settings size={18} className="text-blue-600"/>{editMode?'แก้ไขกลุ่ม':'สร้างกลุ่มใหม่'}</>} onClose={()=>setModal(false)}
          footer={<>
            <button onClick={()=>setModal(false)} className="flex-1 py-3 rounded-2xl border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50 transition-colors">ยกเลิก</button>
            <button onClick={save} className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold shadow-lg shadow-blue-500/25 hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2"><Save size={16}/>บันทึก</button>
          </>}>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-bold text-slate-700 mb-1.5 block">ชื่อกลุ่ม <span className="text-red-500">*</span></label>
              <input value={form.group_name||''} onChange={e=>setForm({...form,group_name:e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all" placeholder="เช่น ผู้ดูแลระบบ"/>
            </div>
            <div>
              <label className="text-sm font-bold text-slate-700 mb-1.5 block">คำอธิบาย</label>
              <textarea value={form.group_description||''} onChange={e=>setForm({...form,group_description:e.target.value})} rows={3} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all resize-none" placeholder="คำอธิบายกลุ่มผู้ใช้งาน..."/>
            </div>
          </div>
        </Modal>
      )}

      {permGroup && (
        <PermissionsModal
          group={permGroup}
          onClose={() => setPermGroup(null)}
          onSaved={handlePermSaved}
        />
      )}
    </>
  );
}
