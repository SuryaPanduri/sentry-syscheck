export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

export async function fetchMachines(params = {}) {
  const url = new URL(API_URL + '/v1/machines');
  Object.entries(params).forEach(([k, v]) => v && url.searchParams.set(k, v));
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}