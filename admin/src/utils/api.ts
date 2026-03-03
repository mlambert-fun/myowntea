const API_URL = 'http://localhost:5000/api';

export const api = {
  async get(endpoint: string, token?: string) {
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    
    const res = await fetch(`${API_URL}${endpoint}`, { headers });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async post(endpoint: string, data: any, token?: string) {
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    
    const res = await fetch(`${API_URL}${endpoint}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async put(endpoint: string, data: any, token: string) {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };
    
    const res = await fetch(`${API_URL}${endpoint}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async delete(endpoint: string, token: string) {
    const headers: HeadersInit = {
      Authorization: `Bearer ${token}`,
    };
    
    const res = await fetch(`${API_URL}${endpoint}`, {
      method: 'DELETE',
      headers,
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
};
