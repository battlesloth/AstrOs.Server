import axios, { type AxiosError } from 'axios';
import router from '@/router';
import i18n from '@/i18n';
import { useToast } from '@/composables/useToast';
import { useSystemStatusStore, type ReadOnlyReasonCode } from '@/stores/systemStatus';

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

// Recognize a 503 read-only response by its body shape: { message, reasonCode }
// per write_guard.ts on the API. Treating "any 503 with a reasonCode field"
// as the signal keeps us robust if a future server adds 503s for unrelated
// reasons without that envelope.
function readOnlyReasonCodeFrom(error: AxiosError): ReadOnlyReasonCode | null {
  if (error.response?.status !== 503) return null;
  const body = error.response.data as { reasonCode?: string } | undefined;
  return (body?.reasonCode as ReadOnlyReasonCode | undefined) ?? null;
}

// Add response interceptor to handle 401 + 503 read-only
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      // Clear token on auth failure
      localStorage.removeItem('jwt_token');
      // Redirect to auth page if not already there
      if (router.currentRoute.value.path !== '/auth') {
        router.push('/auth');
      }
      return Promise.reject(error);
    }

    const reasonCode = readOnlyReasonCodeFrom(error);
    if (reasonCode !== null) {
      // Sync local state with the server's view of itself — the WebSocket
      // push would catch up eventually, but updating here makes the banner
      // and disabled-button bindings flip immediately.
      try {
        const systemStatusStore = useSystemStatusStore();
        systemStatusStore.setStatus({ readOnly: true, reasonCode });
      } catch (storeErr) {
        // Pinia not initialized (e.g., setup-time error); state will catch
        // up via the WebSocket push on next handshake.
        console.warn('Could not update systemStatus store from 503:', storeErr);
      }

      try {
        useToast().warning(i18n.global.t('systemStatus.readOnly.requestBlocked'));
      } catch (toastErr) {
        console.warn('Could not surface read-only toast:', toastErr);
      }
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

  async get(url: string, params?: Record<string, unknown>) {
    try {
      const response = await apiClient.get(url, { params });
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

  async put(url: string, data: unknown) {
    try {
      const response = await apiClient.put(url, data);
      return response.data;
    } catch (error) {
      console.error('Error putting data:', error);
      throw error;
    }
  },

  async delete(url: string, params?: Record<string, unknown>) {
    try {
      const response = await apiClient.delete(url, { params });
      return response.data;
    } catch (error) {
      console.error('Error deleting data:', error);
      throw error;
    }
  },
};
