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
  IoPlay
} from 'oh-vue-icons/icons';
import App from './App.vue';
import router from './router';
import i18n from './i18n';

addIcons(
  IoCloudUpload,
  IoCopy,
  IoTrashBin,
  IoPersonOutline,
  IoPlay,
  IoKeyOutline,
  IoWarning,
  IoCheckmarkCircle
);

const app = createApp(App);

app.use(i18n);
app.component('v-icon', OhVueIcon);
app.use(createPinia());
app.use(router);

app.mount('#app');
