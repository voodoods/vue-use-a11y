<template>
  <section class="space-y-6">
    <h2 class="text-3xl font-extrabold text-green-700 mb-4">Accessible Page Example</h2>
    <!-- Proper alt text -->
    <img src="https://via.placeholder.com/150" alt="Placeholder image" class="rounded shadow mx-auto mb-4" />
    <!-- Good color contrast -->
    <p class="p-3 rounded border bg-white text-gray-900 text-lg">This text has good contrast.</p>
    <!-- Labeled form field -->
    <form class="space-y-2">
      <label for="name" class="block font-medium text-gray-700">Name</label>
      <input id="name" type="text" placeholder="Name" class="border border-green-400 p-2 rounded w-full focus:outline-none focus:ring-2 focus:ring-green-400" />
      <button type="submit" class="bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded shadow font-bold transition-colors">Submit</button>
    </form>
    <!-- Descriptive link text -->
    <a href="https://example.com" class="text-blue-600 underline hover:text-blue-800 font-medium">Learn more about Example.com</a>
    <!-- Proper heading structure -->
    <h3 class="text-xl font-semibold mt-4">Section Heading</h3>
    <p class="mb-2 text-gray-700">Some section content.</p>
    <!-- Interactive element is a button -->
    <button @click="alert('Clicked!')" class="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded shadow font-bold transition-colors">Click me</button>
  </section>
</template>
