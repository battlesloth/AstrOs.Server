import axios from 'axios';

const apiClient = axios.create({
  baseURL: import.meta.env.BACKEND_API || 'http://localhost:3000',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add request interceptor to include JWT token
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('jwt_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

// Add response interceptor to handle 401 errors
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Clear token on auth failure
      localStorage.removeItem('jwt_token');
    }
    return Promise.reject(error);
  },
);

export default {
  setToken(token: string) {
    localStorage.setItem('jwt_token', token);
  },

  clearToken() {
    localStorage.removeItem('jwt_token');
  },

  getToken() {
    return localStorage.getItem('jwt_token');
  },

  async get(url: string) {
    try {
      const response = await apiClient.get(url);
      return response.data;
    } catch (error) {
      console.error('Error fetching data:', error);
      throw error;
    }
  },

  async getBlob(url: string): Promise<Blob> {
    try {
      const response = await apiClient.get(url, {
        responseType: 'blob',
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching blob:', error);
      throw error;
    }
  },

  async post(url: string, data: unknown) {
    try {
      const response = await apiClient.post(url, data);
      return response.data;
    } catch (error) {
      console.error('Error posting data:', error);
      throw error;
    }
  },

  async delete(url: string) {
    try {
      const response = await apiClient.delete(url);
      return response.data;
    } catch (error) {
      console.error('Error deleting data:', error);
      throw error;
    }
  },
};
