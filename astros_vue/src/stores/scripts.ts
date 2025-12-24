import apiService from "@/api/apiService";
import { SCRIPTS_ALL } from "@/api/endpoints";
import type { Script } from "@/models/scripts/script";
import { defineStore } from "pinia";
import { ref } from "vue";

export const useScriptsStore = defineStore('scripts', () => {
  const scripts = ref<Script[]>([]);
  const isLoading = ref(false);
  const isSaving = ref(false);

  async function loadScripts() {
    isLoading.value = true;
    try {
      const response = await apiService.get(SCRIPTS_ALL) as Script[];
      scripts.value = [...response];
      return { success: true, data: response };
    } catch (error) {
      console.error('Failed to load scripts:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
    finally {
      isLoading.value = false;
    }
  }

  return {
    scripts,
    isLoading,
    isSaving,
    loadScripts,
  };
});