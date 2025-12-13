import { createI18n } from 'vue-i18n'
import enUS from './locales/enUS.json'

const i18n = createI18n({
    legacy: false,
    locale: 'enUS',
    fallbackLocale: 'enUS',
    messages: {
        enUS,
    },
})
export default i18n
