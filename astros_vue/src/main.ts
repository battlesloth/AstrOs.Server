import './assets/styles.css';
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { OhVueIcon, addIcons } from 'oh-vue-icons';
import {
  IoCloudUpload,
  IoCopy,
  IoPersonOutline,
  IoKeyOutline,
  IoWarning,
  IoCheckmarkCircle,
  IoTrashBin,
  IoPlay,
  IoSearch,
  IoChevronUp,
  IoChevronDown,
  IoAdd,
  IoHelpCircleOutline,
} from 'oh-vue-icons/icons';
import { MdDraghandle } from 'oh-vue-icons/icons/md';
import App from './App.vue';
import router from './router';
import i18n from './i18n';
import { installReadOnlyInterceptor } from '@/api/readOnlyInterceptor';

addIcons(
  IoCloudUpload,
  IoCopy,
  IoTrashBin,
  IoPersonOutline,
  IoPlay,
  IoKeyOutline,
  IoWarning,
  IoCheckmarkCircle,
  IoSearch,
  IoChevronUp,
  IoChevronDown,
  IoAdd,
  IoHelpCircleOutline,
  MdDraghandle,
);

const app = createApp(App);

app.use(i18n);
app.component('v-icon', OhVueIcon);
app.use(createPinia());
app.use(router);

// Install the 503 read-only-mode response interceptor *after* Pinia is
// active. This keeps apiService.ts free of any store import and breaks
// what would otherwise be a circular module dependency
// (apiService → store → apiService).
installReadOnlyInterceptor();

app.mount('#app');
