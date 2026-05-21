import { API_BASE } from '../lib/apiConfig';

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

export function getDriveThumbnailUrl(fileId: string) {
  return `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w640`;
}

export function getDriveWebViewUrl(fileId: string) {
  return `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view`;
}

export function getTrainingImageUrl(value?: string | null) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const fileId = getDriveFileIdFromUrl(raw);
  if (fileId) {
    return getDriveThumbnailUrl(fileId);
  }

  return raw;
}

export function getTrainingFileUrl(value?: string | null) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const fileId = getDriveFileIdFromUrl(raw);
  if (fileId) return getDriveWebViewUrl(fileId);
  return raw;
}
