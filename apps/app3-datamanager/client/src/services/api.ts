import axios from 'axios';
import type { EntityType, EntityField, EntityRecord, Pagination } from '../types';

export const api = axios.create({
  baseURL: '/api/ddm',
  headers: { 'Content-Type': 'application/json' },
});

// ── Attach JWT token from App1's auth store ───────────────────
// App1 persists auth in localStorage under 'auth-store'
api.interceptors.request.use((config) => {
  try {
    const raw = localStorage.getItem('auth-store');
    if (raw) {
      const store = JSON.parse(raw);
      const token = store?.state?.token || store?.token;
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
  } catch { /* no token available */ }
  return config;
});

// ── Redirect to login on 401 ──────────────────────────────────
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      window.location.href = '/app1/login';
    }
    return Promise.reject(err);
  }
);

// ── Entities ───────────────────────────────────────────────────
export const entitiesApi = {
  list: () => api.get<{ data: EntityType[] }>('/entities').then(r => r.data.data),
  get:  (id: string) => api.get<{ data: EntityType & { fields: EntityField[] } }>(`/entities/${id}`).then(r => r.data.data),
  create: (data: Partial<EntityType>) => api.post<{ data: EntityType }>('/entities', data).then(r => r.data.data),
  update: (id: string, data: Partial<EntityType>) => api.patch<{ data: EntityType }>(`/entities/${id}`, data).then(r => r.data.data),
  delete: (id: string) => api.delete(`/entities/${id}`),
};

// ── Fields ─────────────────────────────────────────────────────
export const fieldsApi = {
  list:   (entityId: string) => api.get<{ data: EntityField[] }>(`/entities/${entityId}/fields`).then(r => r.data.data),
  create: (entityId: string, data: Partial<EntityField>) =>
    api.post<{ data: EntityField }>(`/entities/${entityId}/fields`, data).then(r => r.data.data),
  update: (entityId: string, fieldId: string, data: Partial<EntityField>) =>
    api.patch<{ data: EntityField }>(`/entities/${entityId}/fields/${fieldId}`, data).then(r => r.data.data),
  delete: (entityId: string, fieldId: string) =>
    api.delete(`/entities/${entityId}/fields/${fieldId}`),
  reorder: (entityId: string, order: Array<{ id: string; order_index: number }>) =>
    api.post(`/entities/${entityId}/fields/reorder`, { order }),
};

// ── Records ────────────────────────────────────────────────────
export interface RecordsListParams {
  page?: number; limit?: number; search?: string;
  sort_field?: string; sort_dir?: 'asc' | 'desc';
  [key: string]: unknown;
}

export const recordsApi = {
  list: (entityId: string, params?: RecordsListParams) =>
    api.get<{
      data: EntityRecord[];
      pagination: Pagination;
      fields: EntityField[];
      entity: EntityType;
    }>(`/entities/${entityId}/records`, { params }).then(r => r.data),

  get: (entityId: string, id: string) =>
    api.get<{ data: EntityRecord & { files: unknown[] } }>(`/entities/${entityId}/records/${id}`).then(r => r.data.data),

  create: (entityId: string, data: FormData | Record<string, unknown>) => {
    const isFormData = data instanceof FormData;
    return api.post<{ data: EntityRecord }>(`/entities/${entityId}/records`, data, {
      headers: isFormData ? { 'Content-Type': 'multipart/form-data' } : {},
    }).then(r => r.data.data);
  },

  update: (entityId: string, id: string, data: FormData | Record<string, unknown>) => {
    const isFormData = data instanceof FormData;
    return api.patch<{ data: EntityRecord }>(`/entities/${entityId}/records/${id}`, data, {
      headers: isFormData ? { 'Content-Type': 'multipart/form-data' } : {},
    }).then(r => r.data.data);
  },

  delete: (entityId: string, id: string) =>
    api.delete(`/entities/${entityId}/records/${id}`),
};

// ── Export ─────────────────────────────────────────────────────
export const exportApi = {
  download: (entityId: string, format: 'xlsx' | 'csv', fields?: string[], search?: string) => {
    try {
      const raw = localStorage.getItem('auth-store');
      const store = raw ? JSON.parse(raw) : null;
      const token = store?.state?.token || store?.token || '';
      const params = new URLSearchParams({ format });
      if (fields?.length) params.set('fields', fields.join(','));
      if (search) params.set('search', search);
      if (token) params.set('token', token);
      // Use /api/ddm/entities path (correct gateway mount)
      window.open(`/api/ddm/entities/${entityId}/export?${params}`, '_blank');
    } catch {
      window.open(`/api/ddm/entities/${entityId}/export?format=${format}`, '_blank');
    }
  },
};
