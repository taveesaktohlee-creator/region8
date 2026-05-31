import { useState } from 'react';
import { Menu, Plus, Edit3, Trash2, Save, ToggleLeft, ToggleRight, Loader2 } from 'lucide-react';
import { toast } from 'react-toastify';
import { Modal, type MenuItem } from './GroupsTab';
import { API_BASE } from '../../lib/apiConfig';
import { clearMenuAccessCache } from '../../lib/menuAccess';
import { confirmDialog } from '../../lib/sweetAlert';

const API = `${API_BASE}/api/admin`;

const MENU_TYPES = [{ value: 'sidebar', label: 'เมนูด้านซ้าย' }, { value: 'content', label: 'เมนูรายงาน' }];
const emptyForm: Partial<MenuItem> = { menu_key:'', menu_name:'', menu_type:'sidebar', menu_icon:'', menu_href:'#', sort_order:0, is_active:1 };

export function MenusTab({ menus, onRefresh }: { menus: MenuItem[]; onRefresh: ()=>Promise<void>; }) {
  const [modal, setModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState<Partial<MenuItem>>({...emptyForm});
  const [saving, setSaving] = useState(false);

  const openCreate = () => { setForm({...emptyForm}); setEditMode(false); setModal(true); };
  const openEdit = (m: MenuItem) => { setForm({...m}); setEditMode(true); setModal(true); };

  const save = async () => {
    if (saving) return;
    if (!form.menu_name?.trim() || !form.menu_key?.trim()) { toast.warning('กรุณากรอกชื่อเมนูและ Key'); return; }
    const normalizedKey = form.menu_key.trim().toLowerCase();
    const duplicated = menus.some(m =>
      m.menu_id !== form.menu_id && m.menu_key.trim().toLowerCase() === normalizedKey
    );
    if (duplicated) { toast.warning('Key เมนูนี้ถูกใช้งานแล้ว'); return; }
    const url = editMode ? `${API}/menus/${form.menu_id}` : `${API}/menus`;
    const method = editMode ? 'PUT' : 'POST';
    setSaving(true);
    try {
      const r = await fetch(url, { method, headers:{'Content-Type':'application/json'}, body: JSON.stringify(form) });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error); return; }
      clearMenuAccessCache();
      toast.success(d.message); setModal(false); await onRefresh();
    } finally {
      setSaving(false);
    }
  };

  const del = async (m: MenuItem) => {
    const confirmed = await confirmDialog({ text: `ลบเมนู "${m.menu_name}" ใช่หรือไม่?` });
    if (!confirmed) return;
    const r = await fetch(`${API}/menus/${m.menu_id}`, { method:'DELETE' });
    const d = await r.json();
    if (!r.ok) { toast.error(d.error); return; }
    clearMenuAccessCache();
    toast.success(d.message); await onRefresh();
  };

  const sidebarMenus = menus.filter(m=>m.menu_type==='sidebar');
  const contentMenus = menus.filter(m=>m.menu_type==='content');

  const MenuTable = ({ items, typeLabel }: { items: MenuItem[]; typeLabel: string }) => (
    <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-white shadow-[0_8px_30px_rgba(0,0,0,0.04)] overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
        <Menu size={16} className="text-blue-600"/>
        <span className="font-bold text-slate-700 text-sm">{typeLabel}</span>
        <span className="ml-auto text-xs text-slate-400">{items.length} รายการ</span>
      </div>
      {items.length === 0 ? (
        <div className="text-center py-10 text-slate-300 text-sm">ไม่มีรายการ</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50/80">
              <tr>{['ชื่อเมนู','Key','ไอคอน','ลิงก์','ลำดับ','สถานะ','จัดการ'].map(h=>(
                <th key={h} className="px-4 py-3 text-left text-xs font-bold text-slate-500">{h}</th>
              ))}</tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {items.map(m=>(
                <tr key={m.menu_id} className="hover:bg-blue-50/30 transition-colors">
                  <td className="px-4 py-3 font-semibold text-slate-700">{m.menu_name}</td>
                  <td className="px-4 py-3 text-slate-400 font-mono text-xs">{m.menu_key}</td>
                  <td className="px-4 py-3 text-slate-400 text-xs font-mono">{m.menu_icon}</td>
                  <td className="px-4 py-3 text-slate-400 text-xs">{m.menu_href}</td>
                  <td className="px-4 py-3 text-slate-500">{m.sort_order}</td>
                  <td className="px-4 py-3">
                    {m.is_active
                      ? <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600"><ToggleRight size={14}/>เปิด</span>
                      : <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-400"><ToggleLeft size={14}/>ปิด</span>
                    }
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button onClick={()=>openEdit(m)} className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"><Edit3 size={14}/></button>
                      <button onClick={()=>del(m)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"><Trash2 size={14}/></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  return (
    <>
      <div className="flex justify-end mb-4">
        <button onClick={openCreate} className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold rounded-2xl shadow-lg shadow-blue-500/25 hover:-translate-y-0.5 active:scale-95 transition-all">
          <Plus size={16}/> เพิ่มเมนูใหม่
        </button>
      </div>
      <div className="space-y-4">
        <MenuTable items={sidebarMenus} typeLabel="เมนูด้านซ้าย (Sidebar)"/>
        <MenuTable items={contentMenus} typeLabel="เมนูรายงาน (Content)"/>
      </div>

      {modal && (
        <Modal title={<><Menu size={18} className="text-blue-600"/>{editMode?'แก้ไขเมนู':'เพิ่มเมนูใหม่'}</>} onClose={()=>setModal(false)}
          footer={<>
            <button onClick={()=>setModal(false)} className="flex-1 py-3 rounded-2xl border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50 transition-all">ยกเลิก</button>
            <button onClick={save} disabled={saving} className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold shadow-lg shadow-blue-500/25 hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-60">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16}/>}
              {saving ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
          </>}>
          <div className="space-y-4">
            {([
              { key:'menu_name', label:'ชื่อเมนู *', placeholder:'เช่น หน้าหลัก' },
              { key:'menu_key', label:'Key *', placeholder:'เช่น home', mono:true },
              { key:'menu_icon', label:'ไอคอน (Lucide name)', placeholder:'เช่น Home, Settings' },
              { key:'menu_href', label:'ลิงก์ (href)', placeholder:'เช่น /index' },
            ] as const).map(f=>(
              <div key={f.key}>
                <label className="text-sm font-bold text-slate-700 mb-1.5 block">{f.label}</label>
                <input value={(form as any)[f.key]||''} onChange={e=>setForm({...form,[f.key]:e.target.value})}
                  className={`w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all ${'mono' in f ? 'font-mono text-sm' : ''}`}
                  placeholder={f.placeholder}/>
              </div>
            ))}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-bold text-slate-700 mb-1.5 block">ประเภท</label>
                <select value={form.menu_type||'sidebar'} onChange={e=>setForm({...form,menu_type:e.target.value as any})}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all">
                  {MENU_TYPES.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-bold text-slate-700 mb-1.5 block">ลำดับ</label>
                <input type="number" value={form.sort_order||0} onChange={e=>setForm({...form,sort_order:Number(e.target.value)})}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"/>
              </div>
            </div>
            <label className="flex items-center gap-3 cursor-pointer p-3 rounded-2xl hover:bg-slate-50 transition-all">
              <div onClick={()=>setForm({...form,is_active:form.is_active?0:1})}
                className={`w-12 h-6 rounded-full transition-all relative ${form.is_active?'bg-blue-500':'bg-slate-300'}`}>
                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${form.is_active?'left-7':'left-1'}`}/>
              </div>
              <span className="text-sm font-semibold text-slate-700">เปิดใช้งาน</span>
            </label>
          </div>
        </Modal>
      )}
    </>
  );
}
