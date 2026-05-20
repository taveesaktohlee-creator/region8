/**
 * Dynamic API base URL
 * - Local dev keeps using Vite's /api proxy.
 * - Deployed Vercel builds also use same-origin /api by default so
 *   vercel.json can proxy to an HTTP backend without browser mixed-content errors.
 * - Set VITE_API_BASE_URL only when the API endpoint is HTTPS-ready.
 */
const configuredApiBase = import.meta.env.VITE_API_BASE_URL?.trim();

export const API_BASE = configuredApiBase || '';
