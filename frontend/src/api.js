import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000/api',
});

// Request interceptor to add the auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor to handle token expiry or unauthorized
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    const message = error.response?.data?.error || error.message || 'An unknown error occurred';
    return Promise.reject(new Error(message));
  }
);

export const AuthAPI = {
  login: (username, password) => api.post('/auth/login', { username, password }),
  register: (data) => api.post('/auth/register', data),
  getMe: () => api.get('/auth/me'),
  getUsers: () => api.get('/auth/users'),
};

export const GroupsAPI = {
  getGroups: () => api.get('/groups'),
  getGroup: (id) => api.get(`/groups/${id}`),
  createGroup: (data) => api.post('/groups', data),
  updateGroup: (id, data) => api.put(`/groups/${id}`, data),
  deleteGroup: (id) => api.delete(`/groups/${id}`),
  addMember: (groupId, data) => api.post(`/groups/${groupId}/members`, data),
  removeMember: (groupId, userId, data) => api.put(`/groups/${groupId}/members/${userId}/leave`, data),
};

export const ExpensesAPI = {
  getExpenses: (groupId, page = 1) => api.get(`/expenses?group_id=${groupId}&page=${page}`),
  getExpense: (id) => api.get(`/expenses/${id}`),
  createExpense: (data) => api.post('/expenses', data),
  updateExpense: (id, data) => api.put(`/expenses/${id}`, data),
  deleteExpense: (id) => api.delete(`/expenses/${id}`),
};

export const BalancesAPI = {
  getGroupBalances: (groupId) => api.get(`/balances/${groupId}`),
  getUserBalance: (groupId, userId) => api.get(`/balances/${groupId}/user/${userId}`),
};

export const SettlementsAPI = {
  getSettlements: (groupId) => api.get(`/settlements?group_id=${groupId}`),
  createSettlement: (data) => api.post('/settlements', data),
  deleteSettlement: (id) => api.delete(`/settlements/${id}`),
};

export const ImportAPI = {
  analyzeCSV: (formData) => api.post('/import/analyze', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  commitImport: (data) => api.post('/import/commit', data),
  getAnomalies: (importId) => api.get(`/import/${importId}/anomalies`),
  resolveAnomaly: (id, data) => api.put(`/import/anomalies/${id}/resolve`, data),
  getImportHistory: (groupId) => api.get(`/import/history?group_id=${groupId}`),
};

export default api;
