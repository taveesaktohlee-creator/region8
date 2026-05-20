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

export function getTrainingImageUrl(value?: string | null) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  if (raw.startsWith('/api/google-drive/files/')) {
    return `${API_BASE}${raw}`;
  }

  if (/drive\.google\.com/i.test(raw)) {
    const fileId = getDriveFileIdFromUrl(raw);
    return fileId ? getDriveFileProxyUrl(fileId) : raw;
  }

  return raw;
}
