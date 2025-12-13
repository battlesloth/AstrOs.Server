import { ref, computed } from 'vue';
import { defineStore } from 'pinia';
import type { ControllerLocation } from '@/models/controllers/controllerLocation';
import { Location } from '@/models/enums';

export const useLocationStore = defineStore('location', () => {
    const coreLocation = ref<ControllerLocation | null>(null);
    const domeLocation = ref<ControllerLocation | null>(null);
    const bodyLocation = ref<ControllerLocation | null>(null);

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
        setLocation,
        getLocation,
        clearLocation,
        clearAllLocations
    };
});
