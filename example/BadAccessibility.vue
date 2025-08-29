<template>
  <section class="space-y-6">
    <h2 class="text-3xl font-extrabold text-red-700 mb-4">Page with Accessibility Violations</h2>
    <!-- Missing alt text -->
    <img src="https://via.placeholder.com/150" class="rounded shadow mx-auto mb-4" />
    <!-- Poor color contrast -->
    <p class="p-3 rounded border text-lg" style="color: #aaa; background: #fff;">This text has poor contrast.</p>
    <!-- Unlabeled form field -->
    <form class="space-y-2">
      <input type="text" placeholder="Name" class="border border-red-400 p-2 rounded w-full focus:outline-none focus:ring-2 focus:ring-red-400" />
      <button class="bg-red-600 hover:bg-red-700 text-white px-5 py-2 rounded shadow font-bold transition-colors">Submit</button>
    </form>
    <!-- Non-descriptive link text -->
    <a href="https://example.com" class="text-blue-600 underline hover:text-blue-800 font-medium">Click here</a>
    <!-- No heading structure -->
    <div class="p-3 bg-gray-100 rounded text-gray-700">Just some text, no headings.</div>
    <!-- Non-interactive element with click handler -->
    <span @click="alert('Clicked!')" class="cursor-pointer text-red-600 underline hover:text-red-800 font-semibold">Clickable span</span>
  </section>
</template>
