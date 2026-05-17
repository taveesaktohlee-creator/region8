import React, { useCallback, useState, useEffect } from 'react';
import { User, Mail, Briefcase, MapPin, Building2, IdCard, ShieldCheck, Edit3, ChevronRight, ArrowLeft, X, Camera, ImagePlus, Trash2, UploadCloud } from 'lucide-react';
import { API_BASE } from '../lib/apiConfig';
import Header from '../Header';
import LeftSide from '../LeftSide';
import Footer from '../Footer';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const MAX_AVATAR_BYTES = 15 * 1024 * 1024;
const SUPPORTED_AVATAR_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
  'image/bmp',
  'image/svg+xml',
  'image/tiff',
  'image/heic',
  'image/heif',
];
const SUPPORTED_AVATAR_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'bmp', 'svg', 'tif', 'tiff', 'heic', 'heif'];
const AVATAR_ACCEPT = [...SUPPORTED_AVATAR_TYPES, ...SUPPORTED_AVATAR_EXTENSIONS.map((ext) => `.${ext}`)].join(',');

function getAvatarUrl(name?: string, avatarDataUrl?: string | null) {
  if (avatarDataUrl) return avatarDataUrl;
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'User')}&background=3b82f6&color=fff&size=200&bold=true`;
}

function isSupportedAvatarFile(file: File) {
  const extension = file.name.split('.').pop()?.toLowerCase() || '';
  return SUPPORTED_AVATAR_TYPES.includes(file.type) || SUPPORTED_AVATAR_EXTENSIONS.includes(extension);
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function formatFileSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${bytes} bytes`;
}

export default function Profile() {
  const [userData, setUserData] = useState<any>(null);
  const [profileData, setProfileData] = useState<any>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [avatarPreview, setAvatarPreview] = useState('');
  const [avatarFileName, setAvatarFileName] = useState('');
  const [avatarError, setAvatarError] = useState('');

  const fetchProfile = useCallback(async (id: number) => {
    try {
      setIsLoading(true);
      const res = await fetch(`${API_BASE}/api/users/profile/${id}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setProfileData(data);
      setEditForm(data);
      setAvatarPreview(data.avatar_data_url || '');
    } catch (err) {
      console.error(err);
      toast.error('ไม่สามารถโหลดข้อมูลได้');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    if (savedUser && savedUser !== 'undefined') {
      try {
        const user = JSON.parse(savedUser);
        setUserData(user);
        fetchProfile(user.user_id);
      } catch (e) {
        window.location.href = '/';
      }
    } else {
      window.location.href = '/';
    }

    const handleResize = () => {
      setIsSidebarOpen(window.innerWidth >= 1024);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [fetchProfile]);

  const handleLogout = () => {
    localStorage.removeItem('user');
    window.location.href = '/';
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    if (userData?.user_id) {
      fetchProfile(userData.user_id).then(() => {
        setIsRefreshing(false);
        toast.success('อัปเดตข้อมูลแล้ว');
      });
    }
  };

  const openEditModal = () => {
    setEditForm(profileData || {});
    setAvatarPreview(profileData?.avatar_data_url || '');
    setAvatarFileName('');
    setAvatarError('');
    setIsModalOpen(true);
  };

  const closeEditModal = () => {
    setEditForm(profileData || {});
    setAvatarPreview(profileData?.avatar_data_url || '');
    setAvatarFileName('');
    setAvatarError('');
    setIsModalOpen(false);
  };

  const handleAvatarChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (!isSupportedAvatarFile(file)) {
      const message = 'รองรับเฉพาะไฟล์รูปภาพ เช่น JPG, PNG, WebP, GIF, SVG, HEIC, TIFF';
      setAvatarError(message);
      toast.warning(message);
      return;
    }

    if (file.size > MAX_AVATAR_BYTES) {
      const message = `ไฟล์มีขนาด ${formatFileSize(file.size)} กรุณาเลือกไฟล์ไม่เกิน ${formatFileSize(MAX_AVATAR_BYTES)}`;
      setAvatarError(message);
      toast.warning(message);
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      setEditForm((current: any) => ({ ...current, avatar_data_url: dataUrl }));
      setAvatarPreview(dataUrl);
      setAvatarFileName(`${file.name} (${formatFileSize(file.size)})`);
      setAvatarError('');
      toast.success('เลือกรูปประจำตัวแล้ว');
    } catch (error) {
      console.error(error);
      const message = 'ไม่สามารถอ่านไฟล์รูปภาพนี้ได้';
      setAvatarError(message);
      toast.error(message);
    }
  };

  const handleRemoveAvatar = () => {
    setEditForm((current: any) => ({ ...current, avatar_data_url: null }));
    setAvatarPreview('');
    setAvatarFileName('');
    setAvatarError('');
    toast.info('ลบรูปประจำตัวแล้ว กดบันทึกเพื่อยืนยัน');
  };

  const handleSave = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/users/profile/${userData.user_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Update failed');
      toast.success(result.message);
      setProfileData(editForm);
      const updatedUser = {
        ...userData,
        Name_Surname: editForm.Name_Surname,
        position: editForm.position,
        Division_Province: editForm.Division_Province,
        avatar_data_url: editForm.avatar_data_url || null,
      };
      localStorage.setItem('user', JSON.stringify(updatedUser));
      setUserData(updatedUser);
      setAvatarPreview(editForm.avatar_data_url || '');
      setAvatarFileName('');
      setIsModalOpen(false);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการบันทึก');
    }
  };

  const profileAvatarUrl = getAvatarUrl(profileData?.Name_Surname, profileData?.avatar_data_url);
  const editAvatarUrl = getAvatarUrl(editForm?.Name_Surname || profileData?.Name_Surname, avatarPreview);

  if (isLoading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 48, height: 48, border: '4px solid #3b82f6', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }}></div>
          <p style={{ color: '#64748b', fontWeight: 500 }}>กำลังโหลดข้อมูลส่วนตัว...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#f8fafc] overflow-hidden">
      <ToastContainer position="top-right" autoClose={3000} />

      <LeftSide userData={userData} isSidebarOpen={isSidebarOpen} setIsSidebarOpen={setIsSidebarOpen} handleLogout={handleLogout} />

      <main className="flex-1 flex flex-col h-full overflow-y-auto z-10">
        <Header setIsSidebarOpen={setIsSidebarOpen} handleRefresh={handleRefresh} isRefreshing={isRefreshing} handleLogout={handleLogout} />

        <div className="px-4 py-6 sm:px-8 sm:py-10 max-w-4xl mx-auto w-full flex flex-col gap-6">

          {/* Breadcrumb + Title */}
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 text-blue-600 text-sm font-semibold mb-1">
                <a href="/index" className="flex items-center gap-1 hover:underline"><ArrowLeft size={14} /> หน้าหลัก</a>
                <ChevronRight size={14} className="text-slate-400" />
                <span className="text-slate-600">ข้อมูลส่วนตัว</span>
              </div>
              <h2 className="text-1xl font-black text-slate-800">ข้อมูลส่วนตัว</h2>
            </div>
            <button
              onClick={openEditModal}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white font-semibold rounded-xl shadow hover:bg-blue-700 transition-all"
            >
              <Edit3 size={16} /> แก้ไขข้อมูล
            </button>
          </div>

          {/* Profile Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

            {/* Avatar Card */}
            <div className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 via-white to-indigo-100/70 p-6 shadow-[0_20px_50px_rgba(37,99,235,0.18)] ring-1 ring-blue-50 flex flex-col items-center gap-4">
              <div className="relative">
                <img
                  src={profileAvatarUrl}
                  onError={(event) => {
                    event.currentTarget.src = getAvatarUrl(profileData?.Name_Surname);
                  }}
                  className="w-28 h-28 rounded-full border-4 border-white shadow-lg object-cover bg-blue-50"
                  alt="Avatar"
                />
                <button
                  type="button"
                  onClick={openEditModal}
                  className="absolute -bottom-1 -right-1 flex h-9 w-9 items-center justify-center rounded-full border-4 border-white bg-blue-600 text-white shadow-lg transition hover:bg-blue-700"
                  aria-label="เปลี่ยนรูปประจำตัว"
                >
                  <Camera size={15} />
                </button>
              </div>
              <div className="text-center">
                <h3 className="text-lg font-bold text-slate-900">{profileData?.Name_Surname || '-'}</h3>
                <p className="text-blue-600 font-semibold text-sm mt-1">{profileData?.position || '-'}</p>
              </div>
              <div className="w-full rounded-xl border border-blue-100 bg-white/90 p-3 shadow-[0_10px_24px_rgba(37,99,235,0.10)] backdrop-blur flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg shadow-sm text-blue-700 ring-1 ring-blue-200">
                  <ShieldCheck size={18} />
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 font-bold uppercase">ประเภทผู้ใช้</p>
                  <p className="text-sm font-bold text-slate-700">{profileData?.type || '-'}</p>
                </div>
              </div>
            </div>

            {/* Info Card */}
            <div className="md:col-span-2 rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50 via-white to-violet-100/70 p-6 shadow-[0_20px_50px_rgba(14,165,233,0.16)] ring-1 ring-sky-50">
              <h4 className="text-base font-bold text-slate-700 flex items-center gap-2 mb-6">
                <User size={18} className="text-blue-600" /> ข้อมูลทั่วไป
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <InfoItem icon={<User size={16} />} label="ชื่อ-นามสกุล" value={profileData?.Name_Surname} />
                <InfoItem icon={<IdCard size={16} />} label="เลขประจำตัวประชาชน" value={profileData?.National_ID_number} />
                <InfoItem icon={<Briefcase size={16} />} label="ตำแหน่ง" value={profileData?.position} />
                <InfoItem icon={<Building2 size={16} />} label="ส่วนงาน / จังหวัด" value={profileData?.Division_Province} />
                <InfoItem icon={<MapPin size={16} />} label="หน่วยงาน" value={profileData?.Department} />
                <InfoItem icon={<Mail size={16} />} label="อีเมล" value={profileData?.email} />
                <div className="sm:col-span-2 border-t border-slate-100 pt-4">
                  <InfoItem icon={<User size={16} />} label="ชื่อผู้ใช้งาน (Username)" value={profileData?.username} note="ไม่สามารถเปลี่ยน Username ได้" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <Footer />
      </main>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-800">แก้ไขข้อมูลส่วนตัว</h3>
              <button onClick={closeEditModal} className="p-2 rounded-full hover:bg-slate-100 transition"><X size={20} /></button>
            </div>
            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2 rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50 to-white p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <img
                    src={editAvatarUrl}
                    onError={(event) => {
                      event.currentTarget.src = getAvatarUrl(editForm?.Name_Surname || profileData?.Name_Surname);
                    }}
                    className="h-24 w-24 rounded-full border-4 border-white bg-white object-cover shadow"
                    alt="Avatar preview"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
                      <ImagePlus size={17} className="text-blue-600" />
                      รูปประจำตัว
                    </div>
                    <p className="mt-1 text-xs font-medium text-slate-500">
                      รองรับ JPG, PNG, WebP, GIF, AVIF, BMP, SVG, TIFF, HEIC/HEIF ขนาดไม่เกิน {formatFileSize(MAX_AVATAR_BYTES)}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-blue-700">
                        <UploadCloud size={16} />
                        เลือกรูป
                        <input type="file" accept={AVATAR_ACCEPT} onChange={handleAvatarChange} className="hidden" />
                      </label>
                      {avatarPreview && (
                        <button
                          type="button"
                          onClick={handleRemoveAvatar}
                          className="inline-flex items-center gap-2 rounded-xl border border-red-100 bg-white px-4 py-2 text-sm font-semibold text-red-500 transition hover:bg-red-50"
                        >
                          <Trash2 size={16} />
                          ลบรูป
                        </button>
                      )}
                    </div>
                    {avatarFileName && <p className="mt-2 text-xs font-semibold text-blue-600">{avatarFileName}</p>}
                    {avatarError && <p className="mt-2 text-xs font-semibold text-red-500">{avatarError}</p>}
                  </div>
                </div>
              </div>
              {[
                { key: 'Name_Surname', label: 'ชื่อ-นามสกุล' },
                { key: 'National_ID_number', label: 'เลขประจำตัวประชาชน' },
                { key: 'position', label: 'ตำแหน่ง' },
                { key: 'email', label: 'อีเมล', type: 'email' },
                { key: 'Division_Province', label: 'ส่วนงาน / จังหวัด' },
                { key: 'Department', label: 'หน่วยงาน' },
                { key: 'type', label: 'ประเภทพนักงาน' },
              ].map((field) => (
                <div key={field.key} className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-500">{field.label}</label>
                  <input
                    type={field.type || 'text'}
                    value={editForm[field.key] || ''}
                    onChange={(e) => setEditForm({ ...editForm, [field.key]: e.target.value })}
                    className="border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-400 transition"
                  />
                </div>
              ))}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-slate-500">ชื่อผู้ใช้งาน (Username)</label>
                <input
                  type="text"
                  value={editForm.username || ''}
                  disabled
                  className="border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-400 bg-slate-50 cursor-not-allowed"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100">
              <button onClick={closeEditModal} className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50 transition">ยกเลิก</button>
              <button onClick={handleSave} className="px-5 py-2.5 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 shadow transition">บันทึกการเปลี่ยนแปลง</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoItem({ icon, label, value, note }: { icon: React.ReactNode; label: string; value?: string; note?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-bold uppercase tracking-wider">
        {icon} {label}
      </div>
      <p className="text-slate-800 font-bold text-sm">{value || '-'}</p>
      {note && <p className="text-[10px] text-red-400 font-medium">{note}</p>}
    </div>
  );
}
