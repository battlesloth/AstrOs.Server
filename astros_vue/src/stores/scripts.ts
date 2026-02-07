import apiService from '@/api/apiService';
import { SCRIPTS, SCRIPTS_ALL, SCRIPTS_COPY, SCRIPTS_RUN, SCRIPTS_UPLOAD } from '@/api/endpoints';
import type { Script, ScriptStatus } from '@/models';
import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useScriptsStore = defineStore('scripts', () => {
  const scripts = ref<Script[]>([]);
  const isLoading = ref(false);
  const isSaving = ref(false);

  async function loadScripts() {
    isLoading.value = true;
    try {
      const response = (await apiService.get(SCRIPTS_ALL)) as Script[];
      scripts.value = [...response];
      return { success: true, data: response };
    } catch (error) {
      console.error('Failed to load scripts:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    } finally {
      isLoading.value = false;
    }
  }

  async function saveScripts() {
    isSaving.value = true;
    try {
      await apiService.post(SCRIPTS_ALL, scripts.value);
      return { success: true };
    } catch (error) {
      console.error('Failed to save scripts:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    } finally {
      isSaving.value = false;
    }
  }

  async function copyScript(scriptId: string) {
    try {
      const response = (await apiService.get(SCRIPTS_COPY, { id: scriptId })) as Script;
      scripts.value.push(response);
      return { success: true, data: response };
    } catch (error) {
      console.error('Failed to copy script:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  async function deleteScript(scriptId: string) {
    try {
      await apiService.delete(SCRIPTS, { id: scriptId });
      scripts.value = scripts.value.filter((s) => s.id !== scriptId);
      return { success: true };
    } catch (error) {
      console.error('Failed to delete script:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  async function uploadScript(scriptId: string) {
    try {
      await apiService.get(SCRIPTS_UPLOAD, { id: scriptId });
      return { success: true };
    } catch (error) {
      console.error('Failed to upload script:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  async function runScript(scriptId: string) {
    try {
      await apiService.get(SCRIPTS_RUN, { id: scriptId });
      return { success: true };
    } catch (error) {
      console.error('Failed to run script:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  async function updateScriptStatus(status: ScriptStatus) {
    console.log('Updating script status:', status);
    const script = scripts.value.find((s) => s.id === status.scriptId);
    if (script) {
      // Update the script's deployment status based on the incoming status
      script.deploymentStatus = {
        ...script.deploymentStatus,
        [status.locationId]: {
          date: status.date,
          value: status.status,
        },
      };
    } else {
      console.warn('Script status update skipped: script not found in store', {
        scriptId: status.scriptId,
        storeSize: scripts.value.length,
        storeIds: scripts.value.map((s) => s.id),
      });
    }
  }

  return {
    scripts,
    isLoading,
    isSaving,
    loadScripts,
    saveScripts,
    deleteScript,
    copyScript,
    uploadScript,
    runScript,
    updateScriptStatus,
  };
});
