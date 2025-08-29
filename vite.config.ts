import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [vue(), dts()],
  server: {
    watch: {
      usePolling: true,
    }
  },
  build: {
    lib: {
      entry: 'src/use-a11y.ts',
      name: 'useA11y',
      fileName: (format) => `use-a11y.${format}.js`,
      formats: ['es', 'cjs']
    },
    rollupOptions: {
      external: ['vue'],
      output: {
        globals: {
          vue: 'Vue'
        }
      }
    }
  }
});
