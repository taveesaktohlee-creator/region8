/**
 * Dynamic API base URL
 * - When running locally: uses localhost:3001
 * - When accessed from LAN/other devices: uses the same hostname as the browser
 */
const hostname = window.location.hostname;
export const API_BASE = import.meta.env.VITE_API_URL || `http://${hostname}:3001`;
