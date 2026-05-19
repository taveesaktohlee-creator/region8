import React, { useCallback, useState, useEffect, useRef } from 'react';
import { User, Mail, Briefcase, MapPin, Building2, IdCard, ShieldCheck, Edit3, ChevronRight, ArrowLeft, X, Camera, ImagePlus, Trash2, UploadCloud } from 'lucide-react';
import { API_BASE } from '../lib/apiConfig';
import Header from '../Header';
import LeftSide from '../LeftSide';
import Footer from '../Footer';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const MAX_AVATAR_BYTES = 30 * 1024 * 1024;
const MAX_AVATAR_UPLOAD_BYTES = 1024 * 1024;
const AVATAR_EDITOR_FRAME_SIZE = 128;
const AVATAR_MIN_ZOOM = 1;
const AVATAR_MAX_ZOOM = 3;
const AVATAR_DIMENSION_STEPS = [640, 512, 448, 384, 320];
const AVATAR_WEBP_QUALITY_STEPS = [0.86, 0.78, 0.7, 0.62, 0.54, 0.46, 0.38];
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

function readBlobAsDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function loadImageFromObjectUrl(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Cannot decode image'));
    image.src = url;
  });
}

function dataUrlToBase64(dataUrl: string) {
  return dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
}

function encodeCanvasToWebp(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/webp', quality);
  });
}

function createAvatarCanvas(image: HTMLImageElement, maxDimension: number) {
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d', { alpha: true });
  if (!context) throw new Error('Cannot create canvas');

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, width, height);

  return { canvas, width, height };
}

type AvatarCropState = {
  zoom: number;
  offsetX: number;
  offsetY: number;
};

async function shrinkAvatarImage(file: File) {
  const originalDataUrl = await readFileAsDataUrl(file);
  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await loadImageFromObjectUrl(objectUrl);
    const baseName = file.name.replace(/\.[^.]+$/, '') || 'avatar';
    let bestCandidate: {
      blob: Blob;
      dataUrl: string;
      width: number;
      height: number;
    } | null = null;

    for (const dimension of AVATAR_DIMENSION_STEPS) {
      const { canvas, width, height } = createAvatarCanvas(image, dimension);

      for (const quality of AVATAR_WEBP_QUALITY_STEPS) {
        const blob = await encodeCanvasToWebp(canvas, quality);
        if (!blob) continue;

        if (!bestCandidate || blob.size < bestCandidate.blob.size) {
          bestCandidate = {
            blob,
            dataUrl: await readBlobAsDataUrl(blob),
            width,
            height,
          };
        }

        if (blob.size <= MAX_AVATAR_UPLOAD_BYTES) {
          const dataUrl = bestCandidate.blob === blob ? bestCandidate.dataUrl : await readBlobAsDataUrl(blob);
          return {
            dataUrl,
            base64: dataUrlToBase64(dataUrl),
            fileName: `${baseName}.webp`,
            mimeType: 'image/webp',
            originalSize: file.size,
            outputSize: blob.size,
            resized: true,
            width,
            height,
          };
        }
      }
    }

    if (!bestCandidate) throw new Error('Cannot encode image');

    return {
      dataUrl: bestCandidate.dataUrl,
      base64: dataUrlToBase64(bestCandidate.dataUrl),
      fileName: `${baseName}.webp`,
      mimeType: 'image/webp',
      originalSize: file.size,
      outputSize: bestCandidate.blob.size,
      resized: true,
      width: bestCandidate.width,
      height: bestCandidate.height,
    };
  } catch (error) {
    console.warn('Avatar compression fallback:', error);
    return {
      dataUrl: originalDataUrl,
      base64: dataUrlToBase64(originalDataUrl),
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      originalSize: file.size,
      outputSize: file.size,
      resized: false,
      width: 0,
      height: 0,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function createCroppedAvatarCanvas(
  image: HTMLImageElement,
  crop: AvatarCropState,
  outputSize: number,
  frameSize = AVATAR_EDITOR_FRAME_SIZE,
) {
  const canvas = document.createElement('canvas');
  canvas.width = outputSize;
  canvas.height = outputSize;

  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('Cannot create canvas');

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, outputSize, outputSize);

  const fitScale = Math.min(frameSize / image.naturalWidth, frameSize / image.naturalHeight);
  const displayWidth = image.naturalWidth * fitScale * crop.zoom;
  const displayHeight = image.naturalHeight * fitScale * crop.zoom;
  const outputRatio = outputSize / frameSize;

  const drawWidth = displayWidth * outputRatio;
  const drawHeight = displayHeight * outputRatio;
  const drawX = (frameSize / 2 + crop.offsetX - displayWidth / 2) * outputRatio;
  const drawY = (frameSize / 2 + crop.offsetY - displayHeight / 2) * outputRatio;

  context.drawImage(image, drawX, drawY, drawWidth, drawHeight);

  return canvas;
}

async function createCroppedAvatarImage(
  sourceDataUrl: string,
  fileName: string,
  originalSize: number,
  crop: AvatarCropState,
) {
  const image = await loadImageFromObjectUrl(sourceDataUrl);
  const baseName = fileName.replace(/\.[^.]+$/, '') || 'avatar';
  let bestCandidate: {
    blob: Blob;
    dataUrl: string;
    width: number;
    height: number;
  } | null = null;

  for (const dimension of AVATAR_DIMENSION_STEPS) {
    const canvas = createCroppedAvatarCanvas(image, crop, dimension);

    for (const quality of AVATAR_WEBP_QUALITY_STEPS) {
      const blob = await encodeCanvasToWebp(canvas, quality);
      if (!blob) continue;

      if (!bestCandidate || blob.size < bestCandidate.blob.size) {
        bestCandidate = {
          blob,
          dataUrl: await readBlobAsDataUrl(blob),
          width: dimension,
          height: dimension,
        };
      }

      if (blob.size <= MAX_AVATAR_UPLOAD_BYTES) {
        const dataUrl = bestCandidate.blob === blob ? bestCandidate.dataUrl : await readBlobAsDataUrl(blob);
        return {
          dataUrl,
          base64: dataUrlToBase64(dataUrl),
          fileName: `${baseName}.webp`,
          mimeType: 'image/webp',
          originalSize,
          outputSize: blob.size,
          resized: true,
          width: dimension,
          height: dimension,
        };
      }
    }
  }

  if (!bestCandidate) throw new Error('Cannot encode image');

  return {
    dataUrl: bestCandidate.dataUrl,
    base64: dataUrlToBase64(bestCandidate.dataUrl),
    fileName: `${baseName}.webp`,
    mimeType: 'image/webp',
    originalSize,
    outputSize: bestCandidate.blob.size,
    resized: true,
    width: bestCandidate.width,
    height: bestCandidate.height,
  };
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
  const [pendingAvatarUpload, setPendingAvatarUpload] = useState<Awaited<ReturnType<typeof shrinkAvatarImage>> | null>(null);
  const [avatarSourceDataUrl, setAvatarSourceDataUrl] = useState('');
  const [avatarSourceFileName, setAvatarSourceFileName] = useState('');
  const [avatarSourceSize, setAvatarSourceSize] = useState(0);
  const [avatarSourceDimensions, setAvatarSourceDimensions] = useState({ width: 1, height: 1 });
  const [avatarCrop, setAvatarCrop] = useState<AvatarCropState>({ zoom: 1, offsetX: 0, offsetY: 0 });
  const [isRenderingAvatar, setIsRenderingAvatar] = useState(false);
  const avatarDragRef = useRef({
    active: false,
    pointerId: 0,
    startX: 0,
    startY: 0,
    offsetX: 0,
    offsetY: 0,
  });
  const [isSaving, setIsSaving] = useState(false);

  const resetPendingAvatarState = useCallback((avatarUrl?: string | null) => {
    setAvatarPreview(avatarUrl || '');
    setAvatarFileName('');
    setAvatarError('');
    setPendingAvatarUpload(null);
    setAvatarSourceDataUrl('');
    setAvatarSourceFileName('');
    setAvatarSourceSize(0);
    setAvatarSourceDimensions({ width: 1, height: 1 });
    setAvatarCrop({ zoom: 1, offsetX: 0, offsetY: 0 });
    setIsRenderingAvatar(false);
  }, []);

  const fetchProfile = useCallback(async (id: number) => {
    try {
      setIsLoading(true);
      const res = await fetch(`${API_BASE}/api/users/profile/${id}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setProfileData(data);
      setEditForm(data);
      resetPendingAvatarState(data.avatar_data_url || '');
    } catch (err) {
      console.error(err);
      toast.error('ไม่สามารถโหลดข้อมูลได้');
    } finally {
      setIsLoading(false);
    }
  }, [resetPendingAvatarState]);

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
    resetPendingAvatarState(profileData?.avatar_data_url || '');
    setIsModalOpen(true);
  };

  const closeEditModal = () => {
    setEditForm(profileData || {});
    resetPendingAvatarState(profileData?.avatar_data_url || '');
    setIsModalOpen(false);
  };

  const renderCroppedAvatar = useCallback(async (
    sourceDataUrl = avatarSourceDataUrl,
    fileName = avatarSourceFileName,
    sourceSize = avatarSourceSize,
    crop = avatarCrop,
  ) => {
    if (!sourceDataUrl || !fileName) return null;

    setIsRenderingAvatar(true);
    try {
      const optimizedAvatar = await createCroppedAvatarImage(sourceDataUrl, fileName, sourceSize, crop);
      if (optimizedAvatar.outputSize > MAX_AVATAR_UPLOAD_BYTES) {
        const message = `รูปหลังย่อยังมีขนาด ${formatFileSize(optimizedAvatar.outputSize)} กรุณาปรับขนาดหรือเลือกไฟล์ใหม่`;
        setAvatarError(message);
        toast.warning(message);
        return null;
      }

      setEditForm((current: any) => ({ ...current, avatar_data_url: optimizedAvatar.dataUrl }));
      setAvatarPreview(optimizedAvatar.dataUrl);
      setPendingAvatarUpload(optimizedAvatar);
      setAvatarFileName(`${optimizedAvatar.fileName} (${formatFileSize(sourceSize)} → ${formatFileSize(optimizedAvatar.outputSize)})`);
      setAvatarError('');
      return optimizedAvatar;
    } finally {
      setIsRenderingAvatar(false);
    }
  }, [avatarCrop, avatarSourceDataUrl, avatarSourceFileName, avatarSourceSize]);

  useEffect(() => {
    if (!avatarSourceDataUrl || !avatarSourceFileName) return;

    const timer = window.setTimeout(() => {
      renderCroppedAvatar();
    }, 120);

    return () => window.clearTimeout(timer);
  }, [avatarCrop, avatarSourceDataUrl, avatarSourceFileName, renderCroppedAvatar]);

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
      toast.info('กำลังเตรียมรูปภาพสำหรับปรับตำแหน่ง...');
      const sourceDataUrl = await readFileAsDataUrl(file);
      const image = await loadImageFromObjectUrl(sourceDataUrl);
      const nextCrop = { zoom: 1, offsetX: 0, offsetY: 0 };

      setAvatarSourceDataUrl(sourceDataUrl);
      setAvatarSourceFileName(file.name);
      setAvatarSourceSize(file.size);
      setAvatarSourceDimensions({ width: image.naturalWidth, height: image.naturalHeight });
      setAvatarCrop(nextCrop);
      await renderCroppedAvatar(sourceDataUrl, file.name, file.size, nextCrop);
      toast.success('เลือกรูปเรียบร้อยแล้ว สามารถเลื่อนและปรับขนาดรูปก่อนกดบันทึก');
    } catch (error) {
      console.error(error);
      const message = 'ไม่สามารถอ่านไฟล์รูปภาพนี้ได้';
      setAvatarError(message);
      toast.error(message);
    }
  };

  const handleRemoveAvatar = () => {
    setEditForm((current: any) => ({ ...current, avatar_data_url: null }));
    resetPendingAvatarState('');
    toast.info('ลบรูปประจำตัวแล้ว กดบันทึกเพื่อยืนยัน');
  };

  const handleAvatarPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!avatarSourceDataUrl) return;

    event.preventDefault();
    avatarDragRef.current = {
      active: true,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: avatarCrop.offsetX,
      offsetY: avatarCrop.offsetY,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleAvatarPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = avatarDragRef.current;
    if (!drag.active || drag.pointerId !== event.pointerId) return;

    setAvatarCrop((current) => ({
      ...current,
      offsetX: drag.offsetX + event.clientX - drag.startX,
      offsetY: drag.offsetY + event.clientY - drag.startY,
    }));
  };

  const handleAvatarPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = avatarDragRef.current;
    if (drag.pointerId === event.pointerId) {
      avatarDragRef.current.active = false;
    }
  };

  const resetAvatarCrop = () => {
    setAvatarCrop({ zoom: 1, offsetX: 0, offsetY: 0 });
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      let avatarUrl = editForm.avatar_data_url || null;
      let avatarToUpload = pendingAvatarUpload;

      if (avatarSourceDataUrl) {
        avatarToUpload = await renderCroppedAvatar();
        if (!avatarToUpload) {
          throw new Error('ไม่สามารถเตรียมรูปประจำตัวสำหรับอัปโหลดได้');
        }
      }

      if (avatarToUpload) {
        const uploadRes = await fetch(`${API_BASE}/api/users/profile/avatar-drive`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: userData.user_id,
            display_name: editForm.Name_Surname || profileData?.Name_Surname || userData?.Name_Surname,
            file_name: avatarToUpload.fileName,
            mime_type: avatarToUpload.mimeType,
            base64: avatarToUpload.base64,
          }),
        });
        const uploadResult = await uploadRes.json();
        if (!uploadRes.ok || uploadResult?.ok === false) {
          throw new Error(uploadResult.error || 'ไม่สามารถอัปโหลดรูปไป Google Drive ได้');
        }
        avatarUrl = uploadResult.thumbnailUrl || uploadResult.url || uploadResult.webViewLink;
      }

      const payload = {
        ...editForm,
        avatar_data_url: avatarUrl,
      };

      const res = await fetch(`${API_BASE}/api/users/profile/${userData.user_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Update failed');
      toast.success(result.message);
      setProfileData(payload);
      const updatedUser = {
        ...userData,
        Name_Surname: payload.Name_Surname,
        position: payload.position,
        Division_Province: payload.Division_Province,
        avatar_data_url: payload.avatar_data_url || null,
      };
      localStorage.setItem('user', JSON.stringify(updatedUser));
      setUserData(updatedUser);
      setAvatarPreview(payload.avatar_data_url || '');
      setAvatarFileName('');
      setPendingAvatarUpload(null);
      setAvatarSourceDataUrl('');
      setAvatarSourceFileName('');
      setAvatarSourceSize(0);
      setIsModalOpen(false);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการบันทึก');
    } finally {
      setIsSaving(false);
    }
  };

  const profileAvatarUrl = getAvatarUrl(profileData?.Name_Surname, profileData?.avatar_data_url);
  const editAvatarUrl = getAvatarUrl(editForm?.Name_Surname || profileData?.Name_Surname, avatarPreview);
  const avatarFitScale = Math.min(
    AVATAR_EDITOR_FRAME_SIZE / avatarSourceDimensions.width,
    AVATAR_EDITOR_FRAME_SIZE / avatarSourceDimensions.height,
  );
  const avatarDisplayWidth = avatarSourceDimensions.width * avatarFitScale * avatarCrop.zoom;
  const avatarDisplayHeight = avatarSourceDimensions.height * avatarFitScale * avatarCrop.zoom;

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
                  className="w-28 h-28 rounded-full border-4 border-white shadow-lg object-contain bg-white"
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
                  <div className="flex flex-col items-center gap-2">
                    <div
                      role="button"
                      tabIndex={0}
                      onPointerDown={handleAvatarPointerDown}
                      onPointerMove={handleAvatarPointerMove}
                      onPointerUp={handleAvatarPointerEnd}
                      onPointerCancel={handleAvatarPointerEnd}
                      className={`relative h-32 w-32 overflow-hidden rounded-full border-4 border-white bg-white shadow ring-1 ring-blue-100 ${avatarSourceDataUrl ? 'cursor-grab touch-none active:cursor-grabbing' : ''}`}
                      aria-label="กรอบปรับตำแหน่งรูปประจำตัว"
                    >
                      {avatarSourceDataUrl ? (
                        <img
                          src={avatarSourceDataUrl}
                          draggable={false}
                          className="pointer-events-none absolute left-1/2 top-1/2 max-w-none select-none"
                          style={{
                            width: avatarDisplayWidth,
                            height: avatarDisplayHeight,
                            transform: `translate(-50%, -50%) translate(${avatarCrop.offsetX}px, ${avatarCrop.offsetY}px)`,
                          }}
                          alt="Avatar crop preview"
                        />
                      ) : (
                        <img
                          src={editAvatarUrl}
                          onError={(event) => {
                            event.currentTarget.src = getAvatarUrl(editForm?.Name_Surname || profileData?.Name_Surname);
                          }}
                          className="h-full w-full bg-white object-contain"
                          alt="Avatar preview"
                        />
                      )}
                      {isRenderingAvatar && (
                        <div className="absolute inset-0 flex items-center justify-center bg-white/60 text-[10px] font-bold text-blue-600">
                          กำลังจัดรูป...
                        </div>
                      )}
                    </div>
                    {avatarSourceDataUrl && (
                      <span className="text-[11px] font-semibold text-slate-500">ลากรูปเพื่อจัดตำแหน่ง</span>
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
                      <ImagePlus size={17} className="text-blue-600" />
                      รูปประจำตัว
                    </div>
                    <p className="mt-1 text-xs font-medium text-slate-500">
                      รองรับ JPG, PNG, WebP, GIF, AVIF, BMP, SVG, TIFF, HEIC/HEIF ระบบจะย่อให้ต่ำกว่า {formatFileSize(MAX_AVATAR_UPLOAD_BYTES)} และแปลงเป็น WebP ก่อนเก็บใน Google Drive ขนาดไฟล์ต้นฉบับไม่เกิน {formatFileSize(MAX_AVATAR_BYTES)}
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
                    {avatarSourceDataUrl && (
                      <div className="mt-4 rounded-xl border border-blue-100 bg-white/80 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <label htmlFor="avatar-zoom" className="text-xs font-bold text-slate-600">
                            ขนาดรูป
                          </label>
                          <button
                            type="button"
                            onClick={resetAvatarCrop}
                            className="text-xs font-semibold text-blue-600 transition hover:text-blue-700"
                          >
                            รีเซ็ต
                          </button>
                        </div>
                        <input
                          id="avatar-zoom"
                          type="range"
                          min={AVATAR_MIN_ZOOM}
                          max={AVATAR_MAX_ZOOM}
                          step="0.01"
                          value={avatarCrop.zoom}
                          onChange={(event) => {
                            const zoom = Number(event.target.value);
                            setAvatarCrop((current) => ({ ...current, zoom }));
                          }}
                          className="mt-2 w-full accent-blue-600"
                        />
                        <p className="mt-1 text-[11px] font-medium text-slate-400">
                          เลื่อนแถบเพื่อซูมเข้า-ออก แล้วลากรูปในกรอบวงกลมให้พอดี
                        </p>
                      </div>
                    )}
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
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="px-5 py-2.5 rounded-xl bg-blue-600 text-white font-semibold shadow transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
              >
                {isSaving ? 'กำลังบันทึก...' : 'บันทึกการเปลี่ยนแปลง'}
              </button>
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
