const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });

  if (response.status === 204) return null;

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || `Request failed with status ${response.status}`);
  }

  return data;
}

export const api = {
  summary: {
    get: () => request('/api/summary'),
  },

  transactions: {
    list: (filters = {}) => {
      const params = new URLSearchParams();
      if (filters.type) params.set('type', filters.type);
      if (filters.category_id) params.set('category_id', filters.category_id);
      if (filters.label_id) params.set('label_id', filters.label_id);
      if (filters.date_from) params.set('date_from', filters.date_from);
      if (filters.date_to) params.set('date_to', filters.date_to);
      const qs = params.toString();
      return request(`/api/transactions${qs ? `?${qs}` : ''}`);
    },
    get: (id) => request(`/api/transactions/${id}`),
    create: (body) =>
      request('/api/transactions', { method: 'POST', body: JSON.stringify(body) }),
    update: (id, body) =>
      request(`/api/transactions/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    delete: (id) => request(`/api/transactions/${id}`, { method: 'DELETE' }),
  },

  categories: {
    list: () => request('/api/categories'),
    create: (body) =>
      request('/api/categories', { method: 'POST', body: JSON.stringify(body) }),
    delete: (id) => request(`/api/categories/${id}`, { method: 'DELETE' }),
  },

  labels: {
    list: () => request('/api/labels'),
    create: (body) =>
      request('/api/labels', { method: 'POST', body: JSON.stringify(body) }),
    delete: (id) => request(`/api/labels/${id}`, { method: 'DELETE' }),
  },
};
