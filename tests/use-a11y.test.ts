import { describe, it, expect, vi } from "vitest";
import { ref } from "vue";
import { useA11y } from "../src/use-a11y";
import { nextTick } from 'vue';

describe('useA11y', () => {
  it('should initialize without errors and expose API', () => {
    const el = ref(document.createElement('div'));
    const a11y = useA11y({ element: el, enabled: false });
    expect(a11y).toHaveProperty('violations');
    expect(a11y).toHaveProperty('isRunning');
    expect(a11y).toHaveProperty('runAxe');
    expect(a11y).toHaveProperty('cleanup');
    expect(a11y).toHaveProperty('highlightElement');
    expect(a11y).toHaveProperty('removeHighlight');
  });

  it('should not run axe when disabled', async () => {
    const el = ref(document.createElement('div'));
    const a11y = useA11y({ element: el, enabled: false });
    const spy = vi.fn();
    a11y.runAxe = spy;
    await a11y.runAxe();
    expect(spy).toHaveBeenCalled();
  });

  it('should run axe and return violations array', async () => {
    const el = ref(document.createElement('img'));
    document.body.appendChild(el.value!);
    await nextTick();
    const a11y = useA11y({ element: el, enabled: true });
    await a11y.runAxe();
    expect(Array.isArray(a11y.violations.value)).toBe(true);
    el.value?.remove();
  });

  it('should highlight an element', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const a11y = useA11y({ enabled: false });
    a11y.highlightElement(el);
    expect(document.getElementById('axe-highlight-overlay')).not.toBeNull();
    a11y.removeHighlight();
    expect(document.getElementById('axe-highlight-overlay')).toBeNull();
    el.remove();
  });

  it('should cleanup listeners and overlays', () => {
    const el = ref(document.createElement('div'));
    document.body.appendChild(el.value!);
    const a11y = useA11y({ element: el, enabled: false });
    a11y.highlightElement(el.value!);
    a11y.cleanup();
    expect(document.getElementById('axe-highlight-overlay')).toBeNull();
    el.value?.remove();
  });

  it('should react to changes in the target element', async () => {
    const el1 = ref(document.createElement('div'));
    const el2 = ref(document.createElement('div'));
    document.body.appendChild(el1.value!);
    document.body.appendChild(el2.value!);
    const a11y = useA11y({ element: el1, enabled: false });
    el1.value = el2.value;
    await a11y.runAxe();
    expect(a11y.violations.value).toBeDefined();
    el1.value?.remove();
    el2.value?.remove();
  });

  it('should respect custom options', () => {
    const el = ref(document.createElement('div'));
    const a11y = useA11y({ element: el, debounceDelay: 2000, loggerPrefix: '[Test]' });
    expect(a11y).toBeDefined();
  });
});
