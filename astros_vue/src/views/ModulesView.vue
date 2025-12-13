<script setup lang="ts">
import { ref, computed } from 'vue';
import AstrosLayout from '@/components/common/layout/AstrosLayout.vue';
import AstrosLoadingModal from '@/components/modals/AstrosLoadingModal.vue';
import AstrosEspModule from '@/components/modules/AstrosEspModule.vue';
import { useLocationStore } from '@/stores/location';
import { useControllerStore } from '@/stores/controller';
import { Location } from '@/models/enums';

const showLoadingModal = ref(true);
const openAccordion = ref<string | null>(null);
const locationStore = useLocationStore();
const controllerStore = useControllerStore();

const bodyLocation = computed(() => locationStore.getLocation(Location.body));
const coreLocation = computed(() => locationStore.getLocation(Location.core));
const domeLocation = computed(() => locationStore.getLocation(Location.dome));

const availableCoreControllers = computed(() =>
  controllerStore.controllers.filter(
    (c) => c.id !== domeLocation.value?.controller?.id && c.address !== '00:00:00:00:00:00',
  ),
);

const availableDomeControllers = computed(() =>
  controllerStore.controllers.filter(
    (c) => c.id !== coreLocation.value?.controller?.id && c.address !== '00:00:00:00:00:00',
  ),
);

function onLocationsLoaded() {
  showLoadingModal.value = false;
}

function saveModuleSettings() {
  // TODO: Implement save functionality
  console.log('Save module settings');
}

function syncModuleSettings() {
  // TODO: Implement sync functionality
  console.log('Sync module settings');
}

function handleAddModule(event: any) {
  // TODO: Implement add module functionality
  console.log('Add module:', event);
}

function handleRemoveModule(event: any) {
  // TODO: Implement remove module functionality
  console.log('Remove module:', event);
}

function handleServoTest(event: any) {
  // TODO: Implement servo test modal
  console.log('Open servo test modal:', event);
}

function controllerSelectChanged(location: string) {
  // TODO: Implement controller select change
  console.log('Controller select changed:', location);
}
</script>

<template>
  <AstrosLayout>
    <template v-slot:main>
      <div class="flex flex-col overflow-hidden" style="height: calc(100vh - 64px)">
        <!-- Header with buttons -->
        <div class="flex items-center gap-4 p-4 bg-base-200 shrink-0">
          <h1 class="text-2xl font-bold">Modules</h1>
          <div class="grow"></div>
          <button
            data-testid="save_module_settings"
            class="btn btn-primary"
            @click="saveModuleSettings"
          >
            Save
          </button>
          <button class="btn btn-secondary" @click="syncModuleSettings">Sync</button>
        </div>

        <!-- Module Accordions -->
        <div class="flex-1 overflow-y-auto p-4 pb-8">
          <div class="space-y-2 pb-4">
            <!-- Body Module -->
            <div
              class="collapse collapse-arrow bg-base-200 border border-base-300"
              :class="{
                'collapse-open': openAccordion === 'body',
                'collapse-close': openAccordion !== 'body',
              }"
            >
              <div
                data-testid="body-module-header"
                class="collapse-title text-xl font-medium flex items-center gap-2 cursor-pointer"
                @click="openAccordion = openAccordion === 'body' ? null : 'body'"
              >
                <span>Body Module</span>
                <!-- TODO: Add status warning icon -->
              </div>
              <div class="collapse-content" v-if="!showLoadingModal && bodyLocation">
                <div class="mb-4">
                  <select class="select select-bordered w-full" title="Controller Select" disabled>
                    <option value="0" selected>Master Controller</option>
                  </select>
                </div>
                <AstrosEspModule
                  :is-master="true"
                  :location-enum="Location.body"
                  :parent-test-id="'body'"
                  @add-module="handleAddModule"
                  @remove-module="handleRemoveModule"
                  @open-servo-test-modal="handleServoTest"
                />
              </div>
            </div>

            <!-- Core Module -->
            <div
              class="collapse collapse-arrow bg-base-200 border border-base-300"
              :class="{
                'collapse-open': openAccordion === 'core',
                'collapse-close': openAccordion !== 'core',
              }"
            >
              <div
                data-testid="core-module-header"
                class="collapse-title text-xl font-medium flex items-center gap-2 cursor-pointer"
                @click="openAccordion = openAccordion === 'core' ? null : 'core'"
              >
                <span>Core Module</span>
                <!-- TODO: Add status warning icon -->
              </div>
              <div class="collapse-content" v-if="!showLoadingModal && coreLocation">
                <div class="mb-4">
                  <select
                    id="core-controller-select"
                    class="select select-bordered w-full"
                    title="Controller Select"
                    v-model="coreLocation.controller.id"
                    @change="controllerSelectChanged('core')"
                  >
                    <option value="0" selected>Disabled</option>
                    <option
                      v-for="controller in availableCoreControllers"
                      :key="controller.id"
                      :value="controller.id"
                    >
                      {{ controller.name }}
                    </option>
                  </select>
                </div>
                <AstrosEspModule
                  :location-enum="Location.core"
                  :parent-test-id="'core'"
                  @add-module="handleAddModule"
                  @remove-module="handleRemoveModule"
                  @open-servo-test-modal="handleServoTest"
                />
              </div>
            </div>

            <!-- Dome Module -->
            <div
              class="collapse collapse-arrow bg-base-200 border border-base-300"
              :class="{
                'collapse-open': openAccordion === 'dome',
                'collapse-close': openAccordion !== 'dome',
              }"
            >
              <div
                data-testid="dome-module-header"
                class="collapse-title text-xl font-medium flex items-center gap-2 cursor-pointer"
                @click="openAccordion = openAccordion === 'dome' ? null : 'dome'"
              >
                <span>Dome Module</span>
                <!-- TODO: Add status warning icon -->
              </div>
              <div class="collapse-content" v-if="!showLoadingModal && domeLocation">
                <div class="mb-4">
                  <select
                    id="dome-controller-select"
                    class="select select-bordered w-full"
                    title="Controller Select"
                    v-model="domeLocation.controller.id"
                    @change="controllerSelectChanged('dome')"
                  >
                    <option value="0" selected>Disabled</option>
                    <option
                      v-for="controller in availableDomeControllers"
                      :key="controller.id"
                      :value="controller.id"
                    >
                      {{ controller.name }}
                    </option>
                  </select>
                </div>
                <AstrosEspModule
                  :location-enum="Location.dome"
                  :parent-test-id="'dome'"
                  @add-module="handleAddModule"
                  @remove-module="handleRemoveModule"
                  @open-servo-test-modal="handleServoTest"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Loading modal - blocks interaction until loaded -->
      <AstrosLoadingModal v-if="showLoadingModal" @loaded="onLocationsLoaded" />
    </template>
  </AstrosLayout>
</template>
