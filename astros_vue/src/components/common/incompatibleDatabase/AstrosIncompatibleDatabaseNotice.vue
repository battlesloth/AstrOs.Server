<!--
  Replaces the router view when the server reports DB_NEWER_THAN_SERVER.
  Every API route but GET /system/status answers 503 then, so there is
  nothing to navigate to: no login, no links, no controls.
-->
<script setup lang="ts">
import { onMounted, ref } from 'vue';

const heading = ref<HTMLHeadingElement | null>(null);

// The notice always replaces content after the first paint (the status fetch,
// a 503 or the WS push), so focus would otherwise stay on the old page.
onMounted(() => {
  heading.value?.focus();
});
</script>

<template>
  <main class="relative flex min-h-dvh w-full items-center justify-center bg-base-200 p-4">
    <img
      src="@/assets/images/r2d2-schematic.jpg"
      alt=""
      aria-hidden="true"
      class="absolute inset-0 h-full w-full object-cover opacity-50"
    />
    <div class="absolute inset-0 backdrop-blur-sm"></div>

    <div
      class="relative w-full max-w-lg rounded-box border-t-4 border-error bg-base-100 p-8 shadow-lg"
    >
      <div
        class="font-starwars mb-6 text-base-content/70"
        aria-hidden="true"
      >
        <span class="text-2xl">A</span>
        <span class="text-xl">str</span>
        <span class="text-2xl">O</span>
        <span class="text-xl">s</span>
      </div>

      <h1
        ref="heading"
        tabindex="-1"
        class="mb-3 text-2xl font-semibold text-base-content focus:outline-none"
      >
        {{ $t('systemStatus.incompatibleDatabase.title') }}
      </h1>
      <p
        role="alert"
        class="mb-4 leading-relaxed text-base-content"
      >
        {{ $t('systemStatus.incompatibleDatabase.message') }}
      </p>
      <p class="leading-relaxed text-base-content/70">
        {{ $t('systemStatus.incompatibleDatabase.action') }}
      </p>
    </div>
  </main>
</template>
