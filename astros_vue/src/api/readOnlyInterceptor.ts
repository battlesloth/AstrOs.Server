import type { AxiosError } from 'axios';
import { apiClient } from '@/api/apiService';
import i18n from '@/i18n';
import { useToast } from '@/composables/useToast';
import { useSystemStatusStore } from '@/stores/systemStatus';
import type { ReadOnlyReasonCode } from '@/types/systemStatus';

// Recognize a 503 read-only response by its body shape: { message, reasonCode }
// per write_guard.ts on the API. Treating "any 503 with a reasonCode field"
// as the signal keeps us robust if a future server adds 503s for unrelated
// reasons without that envelope.
function readOnlyReasonCodeFrom(error: AxiosError): ReadOnlyReasonCode | null {
  if (error.response?.status !== 503) return null;
  const body = error.response.data as { reasonCode?: string } | undefined;
  return (body?.reasonCode as ReadOnlyReasonCode | undefined) ?? null;
}

// Installs an axios response interceptor that detects the API's read-only
// 503s, mirrors the state into the systemStatus store, and surfaces a toast.
//
// MUST be called from main.ts AFTER `app.use(createPinia())`. Calling
// useSystemStatusStore() before Pinia is active throws.
export function installReadOnlyInterceptor(): void {
  apiClient.interceptors.response.use(
    (response) => response,
    (error: AxiosError) => {
      const reasonCode = readOnlyReasonCodeFrom(error);
      if (reasonCode !== null) {
        // Sync local state with the server's view of itself — the WebSocket
        // push would catch up eventually, but updating here makes the banner
        // and disabled-button bindings flip immediately.
        try {
          useSystemStatusStore().setStatus({ readOnly: true, reasonCode });
        } catch (storeErr) {
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
}
