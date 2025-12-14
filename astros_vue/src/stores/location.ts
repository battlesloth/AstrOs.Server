import { ref } from 'vue';
import { defineStore } from 'pinia';
import type { ControllerLocation } from '@/models/controllers/controllerLocation';
import { Location } from '@/enums/modules/Location';
import apiService from '@/api/apiService';
import { LOCATIONS_LOAD } from '@/api/enpoints';

export const useLocationStore = defineStore('location', () => {
  const coreLocation = ref<ControllerLocation | null>(null);
  const domeLocation = ref<ControllerLocation | null>(null);
  const bodyLocation = ref<ControllerLocation | null>(null);
  const isLoading = ref(false);
  const loadError = ref<string | null>(null);

  async function loadLocationsFromApi() {
    isLoading.value = true;
    loadError.value = null;

    try {
      const response = await apiService.get(LOCATIONS_LOAD);

      if (response.coreModule) {
        coreLocation.value = response.coreModule;
      }
      if (response.domeModule) {
        domeLocation.value = response.domeModule;
      }
      if (response.bodyModule) {
        bodyLocation.value = response.bodyModule;
      }

      return { success: true, data: response };
    } catch (error) {
      console.error('Failed to load locations:', error);
      loadError.value = 'Failed to load locations from API';
      return { success: false, error };
    } finally {
      isLoading.value = false;
    }
  }

  function setLocation(locationEnum: Location, location: ControllerLocation) {
    switch (locationEnum) {
      case Location.core:
        coreLocation.value = location;
        break;
      case Location.dome:
        domeLocation.value = location;
        break;
      case Location.body:
        bodyLocation.value = location;
        break;
    }
  }

  function getLocation(locationEnum: Location) {
    switch (locationEnum) {
      case Location.core:
        return coreLocation.value;
      case Location.dome:
        return domeLocation.value;
      case Location.body:
        return bodyLocation.value;
      default:
        return null;
    }
  }

  function clearLocation(locationEnum: Location) {
    switch (locationEnum) {
      case Location.core:
        coreLocation.value = null;
        break;
      case Location.dome:
        domeLocation.value = null;
        break;
      case Location.body:
        bodyLocation.value = null;
        break;
    }
  }

  function clearAllLocations() {
    coreLocation.value = null;
    domeLocation.value = null;
    bodyLocation.value = null;
  }

  return {
    coreLocation,
    domeLocation,
    bodyLocation,
    isLoading,
    loadError,
    loadLocationsFromApi,
    setLocation,
    getLocation,
    clearLocation,
    clearAllLocations,
  };
});
