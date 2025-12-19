<script setup lang="ts">
import { ref, computed } from 'vue';
import type { AddModuleEvent } from '@/models/events';
import { useLocationStore } from '@/stores/location';
import { useControllerStore } from '@/stores/controller';
import { Location } from '@/enums/modules/Location';
import { useModuleManagement } from '@/composables/useModuleManagement';
import { ModalType } from '@/enums/modalType';

import AstrosLayout from '@/components/common/layout/AstrosLayout.vue';
import AstrosLoadingModal from '@/components/modals/AstrosLoadingModal.vue';
import AstrosEspModule from '@/components/modules/AstrosEspModule.vue';
import AstrosAddModuleModal from '@/components/modals/AstrosAddModuleModal.vue';
import AstrosAlertModal from '@/components/modals/AstrosAlertModal.vue';
import AstrosConfirmModal from '@/components/modals/AstrosConfirmModal.vue';
import AstrosInterruptModal from '@/components/modals/AstrosInterruptModal.vue';


const showModal = ref<ModalType>(ModalType.loadingModal);
const modalMessage = ref<string>('');

const selectedLocationId = ref<Location>(Location.unknown);
const selectedModuleId = ref<string>('');
const selectedModuleType = ref<number>(0);

const openAccordion = ref<string | null>(null);

const locationStore = useLocationStore();
const controllerStore = useControllerStore();

const {
  addModule, removeModule,
} = useModuleManagement();

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
  showModal.value = ModalType.closeAll;
}

async function saveModuleSettings() {
  modalMessage.value = 'module_view.saving';
  showModal.value = ModalType.interruptModal;
  const result = await locationStore.saveLocationsToApi();

  // wait 1 second so it's not so abrupt
  await new Promise((resolve) => setTimeout(resolve, 1000));

  if (result.success) {
    showModal.value = ModalType.closeAll;
    modalMessage.value = '';
  } else {
    modalMessage.value = result.error ?? 'module_view.save_failed';
    showModal.value = ModalType.errorModal;
  }
}

async function syncModuleSettings() {
  modalMessage.value = 'module_view.syncing';
  showModal.value = ModalType.interruptModal;

  //TODO: Implement sync logic
  const result = { success: false, error: 'Not implemented' };

  // wait 1 second so it's not so abrupt
  await new Promise((resolve) => setTimeout(resolve, 1000));

  if (result.success) {
    showModal.value = ModalType.closeAll;
    modalMessage.value = '';
  } else {
    modalMessage.value = result.error ?? 'module_view.sync_failed';
    showModal.value = ModalType.errorModal;
  };
}

function openAddModuleModal(evt: AddModuleEvent) {
  selectedLocationId.value = evt.locationId;
  selectedModuleType.value = evt.moduleType;
  showModal.value = ModalType.addModule;
}

function handleAddModule(event: any) {
  try {
    addModule(event.locationId, event.moduleType, event.moduleSubType);
    showModal.value = ModalType.closeAll;
  } catch (error) {
    console.error('Error adding module:', error);
    modalMessage.value = (error as Error).message;
    showModal.value = ModalType.errorModal;
  }
}

function openConfirmRemoveModuleModal(event: any) {
  selectedLocationId.value = event.locationId;
  selectedModuleId.value = event.id;
  selectedModuleType.value = event.moduleType;
  showModal.value = ModalType.confirmModal;
}

function handleRemoveModule() {
  try {
    removeModule(selectedLocationId.value, selectedModuleId.value, selectedModuleType.value);
    showModal.value = ModalType.closeAll;
  } catch (error) {
    console.error('Error removing module:', error);
    modalMessage.value = (error as Error).message;
    showModal.value = ModalType.errorModal;
  }
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
          <h1 class="text-2xl font-bold">{{ $t('module_view.modules') }}</h1>
          <div class="grow"></div>
          <button data-testid="save_module_settings" class="btn btn-primary" @click="saveModuleSettings">
            {{ $t('module_view.save') }}
          </button>
          <button class="btn btn-secondary" @click="syncModuleSettings">{{ $t('module_view.sync') }}</button>
        </div>

        <!-- Module Accordions -->
        <div class="flex-1 overflow-y-scroll p-4 pb-8 flex justify-center">
          <div class="space-y-2 pb-4 w-full max-w-5xl">
            <!-- Body Module -->
            <div class="collapse collapse-arrow bg-base-200 border border-base-300" :class="{
              'collapse-open': openAccordion === 'body',
              'collapse-close': openAccordion !== 'body',
            }">
              <div data-testid="body-module-header"
                class="collapse-title text-xl font-medium flex items-center gap-2 cursor-pointer"
                @click="openAccordion = openAccordion === 'body' ? null : 'body'">
                <span>{{ $t('module_view.body') }}</span>
                <!-- TODO: Add status warning icon -->
              </div>
              <div class="collapse-content" v-if="bodyLocation">
                <div class="mb-4">
                  <select class="select select-bordered w-full" title="Controller Select" disabled>
                    <option value="0" selected>{{ $t('module_view.master') }}</option>
                  </select>
                </div>
                <AstrosEspModule :is-master="true" :location-enum="Location.body" :parent-test-id="'body'"
                  @add-module="openAddModuleModal" @remove-module="openConfirmRemoveModuleModal"
                  @open-servo-test-modal="handleServoTest" />
              </div>
            </div>

            <!-- Core Module -->
            <div class="collapse collapse-arrow bg-base-200 border border-base-300" :class="{
              'collapse-open': openAccordion === 'core',
              'collapse-close': openAccordion !== 'core',
            }">
              <div data-testid="core-module-header"
                class="collapse-title text-xl font-medium flex items-center gap-2 cursor-pointer"
                @click="openAccordion = openAccordion === 'core' ? null : 'core'">
                <span>{{ $t('module_view.core') }}</span>
                <!-- TODO: Add status warning icon -->
              </div>
              <div class="collapse-content" v-if="coreLocation">
                <div class="mb-4">
                  <select id="core-controller-select" class="select select-bordered w-full" title="Controller Select"
                    v-model="coreLocation.controller.id" @change="controllerSelectChanged('core')">
                    <option value="0" selected>{{ $t('module_view.disabled') }}</option>
                    <option v-for="controller in availableCoreControllers" :key="controller.id" :value="controller.id">
                      {{ controller.name }}
                    </option>
                  </select>
                </div>
                <AstrosEspModule :location-enum="Location.core" :parent-test-id="'core'"
                  @add-module="openAddModuleModal" @remove-module="openConfirmRemoveModuleModal"
                  @open-servo-test-modal="handleServoTest" />
              </div>
            </div>

            <!-- Dome Module -->
            <div class="collapse collapse-arrow bg-base-200 border border-base-300" :class="{
              'collapse-open': openAccordion === 'dome',
              'collapse-close': openAccordion !== 'dome',
            }">
              <div data-testid="dome-module-header"
                class="collapse-title text-xl font-medium flex items-center gap-2 cursor-pointer"
                @click="openAccordion = openAccordion === 'dome' ? null : 'dome'">
                <span>{{ $t('module_view.dome') }}</span>
                <!-- TODO: Add status warning icon -->
              </div>
              <div class="collapse-content" v-if="domeLocation">
                <div class="mb-4">
                  <select id="dome-controller-select" class="select select-bordered w-full" title="Controller Select"
                    v-model="domeLocation.controller.id" @change="controllerSelectChanged('dome')">
                    <option value="0" selected>{{ $t('module_view.disabled') }}</option>
                    <option v-for="controller in availableDomeControllers" :key="controller.id" :value="controller.id">
                      {{ controller.name }}
                    </option>
                  </select>
                </div>
                <AstrosEspModule :location-enum="Location.dome" :parent-test-id="'dome'"
                  @add-module="openAddModuleModal" @remove-module="openConfirmRemoveModuleModal"
                  @open-servo-test-modal="handleServoTest" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <AstrosInterruptModal v-if="showModal === ModalType.interruptModal" :message="modalMessage" />
      <AstrosAlertModal v-if="showModal === ModalType.errorModal" :message="modalMessage"
        @close="showModal = ModalType.closeAll" />
      <AstrosConfirmModal v-if="showModal === ModalType.confirmModal" :message="$t('module_view.confirm_remove')"
        @confirm="handleRemoveModule" @close="showModal = ModalType.closeAll" />
      <AstrosLoadingModal v-if="showModal === ModalType.loadingModal" @loaded="onLocationsLoaded" />
      <AstrosAddModuleModal v-if="showModal === ModalType.addModule" :is-open="showModal === ModalType.addModule"
        :location-id="selectedLocationId" :module-type="selectedModuleType" @add="handleAddModule"
        @close="showModal = ModalType.closeAll" />
    </template>
  </AstrosLayout>
</template>
