/**
 * Dynamic API base URL
 * - Local dev keeps using Vite's /api proxy.
 * - Deployed static hosts call the Render backend directly.
 */
const configuredApiBase = import.meta.env.VITE_API_BASE_URL?.trim();
const localHosts = new Set(['localhost', '127.0.0.1', '']);
const isLocalHost = localHosts.has(window.location.hostname);

export const API_BASE = configuredApiBase || (isLocalHost ? '' : 'https://region8.onrender.com');
