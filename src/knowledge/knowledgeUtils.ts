import { API_BASE } from '../lib/apiConfig';

export type KnowledgeStatus = 'draft' | 'published' | 'archived';

export type KnowledgeItem = {
  item_id?: number;
  title: string;
  category: string;
  description: string;
  status?: KnowledgeStatus;
  cover_url: string;
  cover_file_id?: string;
  pdf_url: string;
  pdf_file_id?: string;
  pdf_proxy_url?: string;
  published_at?: string | null;
  view_count?: number;
  sort_order: number;
  updated_at?: string | null;
};

export const emptyKnowledgeItem: KnowledgeItem = {
  title: '',
  category: '',
  description: '',
  status: 'published',
  cover_url: '',
  cover_file_id: '',
  pdf_url: '',
  pdf_file_id: '',
  sort_order: 0,
};

export const KNOWLEDGE_COVER_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,image/avif,image/bmp,image/svg+xml,image/tiff,.jpg,.jpeg,.png,.webp,.gif,.avif,.bmp,.svg,.tif,.tiff';
export const KNOWLEDGE_COVER_MAX_BYTES = 1024 * 1024;
export const KNOWLEDGE_COVER_MAX_ORIGINAL_BYTES = 30 * 1024 * 1024;
export const KNOWLEDGE_PDF_MAX_BYTES = 18 * 1024 * 1024;

export function getDriveFileIdFromUrl(value?: string | null) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const apiProxyMatch = raw.match(/\/api\/google-drive\/files\/([^/?#]+)/);
  if (apiProxyMatch?.[1]) return decodeURIComponent(apiProxyMatch[1]);

  const idQueryMatch = raw.match(/[?&]id=([^&]+)/);
  if (idQueryMatch?.[1]) return decodeURIComponent(idQueryMatch[1]);

  const filePathMatch = raw.match(/\/file\/d\/([^/]+)/);
  if (filePathMatch?.[1]) return filePathMatch[1];

  if (/^[a-zA-Z0-9_-]{20,}$/.test(raw)) return raw;

  return '';
}

export function getDriveFileProxyUrl(fileId: string) {
  return `${API_BASE}/api/google-drive/files/${encodeURIComponent(fileId)}`;
}

export function getKnowledgeAssetUrl(value?: string | null) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  if (raw.startsWith('/api/google-drive/files/')) return `${API_BASE}${raw}`;
  if (/drive\.google\.com/i.test(raw)) {
    const fileId = getDriveFileIdFromUrl(raw);
    return fileId ? getDriveFileProxyUrl(fileId) : raw;
  }

  return raw;
}

export function formatFileSize(bytes: number) {
  if (!bytes) return '0 KB';
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function formatThaiDate(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
}

export function formatDuration(seconds?: number) {
  const safe = Math.max(0, Number(seconds || 0));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  if (hours > 0) return `${hours} ชม. ${minutes} นาที`;
  return `${minutes} นาที`;
}

export function readBlobAsDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export function dataUrlToBase64(dataUrl: string) {
  return dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
}

export function resolveDriveUploadResult(data: any) {
  const fileId = getDriveFileIdFromUrl(
    data?.fileId ||
    data?.file_id ||
    data?.id ||
    data?.fileProxyPath ||
    data?.webViewLink ||
    data?.web_view_link ||
    data?.url ||
    data?.thumbnailUrl ||
    '',
  );
  const proxyPath = data?.fileProxyPath || (fileId ? `/api/google-drive/files/${encodeURIComponent(fileId)}` : '');
  const url = proxyPath || data?.webViewLink || data?.web_view_link || data?.url || data?.thumbnailUrl || '';

  return { fileId, url };
}

function loadImageFromUrl(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('ไม่สามารถอ่านไฟล์รูปภาพนี้ได้'));
    image.src = url;
  });
}

function canvasToWebp(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/webp', quality);
  });
}

export async function optimizeKnowledgeCover(file: File) {
  if (!file.type.startsWith('image/')) throw new Error('กรุณาเลือกไฟล์รูปภาพเท่านั้น');
  if (file.size > KNOWLEDGE_COVER_MAX_ORIGINAL_BYTES) {
    throw new Error(`ขนาดไฟล์ต้นฉบับต้องไม่เกิน ${formatFileSize(KNOWLEDGE_COVER_MAX_ORIGINAL_BYTES)}`);
  }

  const dimensions = [1600, 1400, 1200, 1000, 800];
  const qualities = [0.86, 0.78, 0.7, 0.62, 0.54, 0.46];
  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await loadImageFromUrl(objectUrl);
    const baseName = file.name.replace(/\.[^.]+$/, '') || 'knowledge-cover';
    let best: { blob: Blob; dataUrl: string; width: number; height: number } | null = null;

    for (const maxDimension of dimensions) {
      const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('ไม่สามารถประมวลผลรูปภาพได้');
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(image, 0, 0, width, height);

      for (const quality of qualities) {
        const blob = await canvasToWebp(canvas, quality);
        if (!blob) continue;
        const dataUrl = await readBlobAsDataUrl(blob);
        if (!best || blob.size < best.blob.size) best = { blob, dataUrl, width, height };
        if (blob.size <= KNOWLEDGE_COVER_MAX_BYTES) {
          return {
            fileName: `${baseName}.webp`,
            mimeType: 'image/webp',
            base64: dataUrlToBase64(dataUrl),
            previewUrl: dataUrl,
            originalSize: file.size,
            outputSize: blob.size,
            width,
            height,
          };
        }
      }
    }

    if (!best) throw new Error('ไม่สามารถย่อรูปภาพได้');
    return {
      fileName: `${baseName}.webp`,
      mimeType: 'image/webp',
      base64: dataUrlToBase64(best.dataUrl),
      previewUrl: best.dataUrl,
      originalSize: file.size,
      outputSize: best.blob.size,
      width: best.width,
      height: best.height,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
