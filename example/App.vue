<template>
  <div ref={appRef} class="min-h-screen bg-blue-100 flex flex-col items-center justify-start py-12 font-sans">
    <h1 class="text-5xl font-extrabold mb-8 text-blue-700 tracking-tight drop-shadow-lg">Accessibility Example</h1>
    <nav class="mb-10 flex gap-6">
      <button @click="showBad = true" :class="showBad ? 'bg-red-600 text-white' : 'bg-white text-red-600'" class="px-6 py-3 rounded-lg shadow-lg border-2 border-red-600 font-semibold transition-colors text-lg">Accessibility Violations</button>
      <button @click="showBad = false" :class="!showBad ? 'bg-green-600 text-white' : 'bg-white text-green-600'" class="px-6 py-3 rounded-lg shadow-lg border-2 border-green-600 font-semibold transition-colors text-lg">Accessible Page</button>
    </nav>
    <div class="w-full max-w-2xl bg-white rounded-2xl shadow-xl p-8 space-y-6">
      <div v-if="showBad">
        <BadAccessibility />
      </div>
      <div v-else>
        <GoodAccessibility />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, useTemplateRef } from 'vue';
import BadAccessibility from './BadAccessibility.vue';
import GoodAccessibility from './GoodAccessibility.vue';
import { useA11y } from '../src/use-a11y';
const showBad = ref(true);
const appRef  = useTemplateRef<HTMLElement>("app");

useA11y({
    element: appRef,
    enableHighlighting: true,
    loggerPrefix: `[MyApp]`,
    initialScanDelay: 3000, // Wait 3 seconds before initial scan
    waitForContent: true // Wait for meaningful content before scanning
});
</script>
