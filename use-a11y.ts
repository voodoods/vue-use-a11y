import { onMounted, onUnmounted, ref, watch, nextTick, type Ref } from "vue";
import type { AxeResults, ElementContext, Result } from "axe-core";

interface AccessibilityHookOptions {
  /**
   * The element to test. Defaults to document.body
   */
  element?: Ref<HTMLElement | undefined> | HTMLElement;
  /**
   * Whether to enable the accessibility checking. Defaults to true in development
   */
  enabled?: boolean;
  /**
   * Custom axe configuration
   */
  axeOptions?: any;
  /**
   * Whether to highlight elements on hover. Defaults to true
   */
  enableHighlighting?: boolean;
  /**
   * Whether to monitor DOM changes and re-run accessibility checks. Defaults to true
   */
  watchForChanges?: boolean;
  /**
   * Debounce delay for re-running checks after DOM changes (ms). Defaults to 1000
   */
  debounceDelay?: number;
  /**
   * Whether to run checks on user interactions (click, focus, etc.). Defaults to true
   */
  watchInteractions?: boolean;
  /**
   * Logger prefix to include in accessibility messages (e.g., "[MyApp] (0e2d)")
   */
  loggerPrefix?: string;
  /**
   * Delay before starting initial accessibility scan (ms). Defaults to 2000
   */
  initialScanDelay?: number;
  /**
   * Minimum content threshold before running accessibility checks.
   * Will wait until the target element has meaningful content.
   */
  waitForContent?: boolean;
}

interface ViolationLogEntry {
  id: string;
  impact: string;
  description: string;
  help: string;
  helpUrl: string;
  nodes: Array<{
    html: string;
    target: string[];
    element?: Element;
  }>;
}

// Global state to ensure axe runs only once per page
let isAxeRunning = false;
const axeInstances: Set<symbol> = new Set();
let highlightedElement: HTMLElement | null = null;

// Helper function to find element within Shadow DOM using multiple strategies
const findElementInShadowDOM = (
  selector: string,
  htmlContent?: string,
  rootElement?: HTMLElement | Document
): Element | null => {
  const root = rootElement || document;

  // Strategy 1: If we have HTML content, prioritize finding by content patterns
  // This is now the primary strategy since CSS selectors often fail in Shadow DOM
  if (htmlContent) {
    const element = findByHtmlContentInAllShadowRoots(htmlContent, root);
    if (element) return element;
  }

  // Strategy 2: Try regular querySelector as fallback
  const element = root.querySelector(selector);
  if (element) return element;

  // Strategy 3: Search through shadow roots with selector (less reliable for Shadow DOM)
  const searchInShadow = (node: Element | Document): Element | null => {
    if ("shadowRoot" in node && node.shadowRoot) {
      const found = node.shadowRoot.querySelector(selector);
      if (found) return found;

      // Recursively search within shadow root
      const shadowElements = Array.from(node.shadowRoot.querySelectorAll("*"));
      for (const shadowEl of shadowElements) {
        const result = searchInShadow(shadowEl);
        if (result) return result;
      }
    }

    if ("children" in node) {
      for (const child of Array.from(node.children)) {
        const result = searchInShadow(child);
        if (result) return result;
      }
    }

    return null;
  };

  return searchInShadow(root);
};

// Enhanced function to find element by HTML content in all shadow roots
const findByHtmlContentInAllShadowRoots = (
  htmlContent: string,
  root: Element | Document
): Element | null => {
  // First, try to find in the main document
  const mainDocElement = findByHtmlContent(htmlContent, root);
  if (mainDocElement) return mainDocElement;

  // Then recursively search all shadow roots
  const searchAllShadowRoots = (node: Element | Document): Element | null => {
    if ("shadowRoot" in node && node.shadowRoot) {
      // Search within this shadow root
      const found = findByHtmlContent(htmlContent, node.shadowRoot);
      if (found) return found;

      // Recursively search nested shadow roots
      const shadowElements = Array.from(node.shadowRoot.querySelectorAll("*"));
      for (const shadowEl of shadowElements) {
        const result = searchAllShadowRoots(shadowEl);
        if (result) return result;
      }
    }

    // Search children for more shadow roots
    if ("children" in node) {
      for (const child of Array.from(node.children)) {
        const result = searchAllShadowRoots(child);
        if (result) return result;
      }
    }

    return null;
  };

  return searchAllShadowRoots(root);
};

// Helper function to find element by HTML content patterns
const findByHtmlContent = (
  htmlContent: string,
  root: Element | Document | ShadowRoot
): Element | null => {
  // Extract useful attributes from the HTML content
  const idMatch = htmlContent.match(/id="([^"]+)"/);
  const classMatch = htmlContent.match(/class="([^"]+)"/);
  const roleMatch = htmlContent.match(/role="([^"]+)"/);
  const ariaLabelMatch = htmlContent.match(/aria-label="([^"]+)"/);
  const textContentMatch = htmlContent.match(/>([^<]+)</);

  // Try to find by ID first (most specific)
  if (idMatch) {
    const element = root.querySelector(`#${idMatch[1]}`);
    if (element) return element;
  }

  // Try to find by unique aria-label
  if (ariaLabelMatch) {
    const element = root.querySelector(`[aria-label="${ariaLabelMatch[1]}"]`);
    if (element) return element;
  }

  // Try to find by role + classes combination
  if (roleMatch && classMatch) {
    const element = root.querySelector(
      `[role="${roleMatch[1]}"].${classMatch[1].split(" ").join(".")}`
    );
    if (element) return element;
  }

  // Try to find by role only
  if (roleMatch) {
    const element = root.querySelector(`[role="${roleMatch[1]}"]`);
    if (element) return element;
  }

  // Try to find by class combination
  if (classMatch) {
    const classes = classMatch[1].split(" ").filter((c) => c.length > 0);
    if (classes.length > 0) {
      const element = root.querySelector(`.${classes.join(".")}`);
      if (element) return element;
    }
  }

  // Last resort: try to find by text content
  if (textContentMatch) {
    const text = textContentMatch[1].trim();
    if (text.length > 3) {
      // Only match meaningful text
      const elements = Array.from(root.querySelectorAll("*"));
      for (const element of elements) {
        if (element.textContent?.trim() === text) {
          return element;
        }
      }
    }
  }

  return null;
};

// Global queue for axe runs to prevent concurrent execution
const axeQueue: Array<() => Promise<void>> = [];
let isProcessingQueue = false;

// Process the axe queue sequentially
const processAxeQueue = async () => {
  if (isProcessingQueue || axeQueue.length === 0) return;

  isProcessingQueue = true;

  while (axeQueue.length > 0) {
    const nextRun = axeQueue.shift();
    if (nextRun) {
      try {
        await nextRun();
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error("Error in queued accessibility scan:", error);
      }
    }
  }

  isProcessingQueue = false;
};

/**
 * Vue composable for accessibility testing using axe-core
 * Provides similar functionality to @axe-core/react but for Vue applications
 */
export function useAccessibility(options: AccessibilityHookOptions = {}) {
  const {
    element,
    enabled = process.env.NODE_ENV === "development",
    axeOptions = {},
    enableHighlighting = true,
    watchForChanges = true,
    debounceDelay = 1000,
    watchInteractions = true,
    loggerPrefix,
    initialScanDelay = 3000,
    waitForContent = true
  } = options;

  const violations = ref<ViolationLogEntry[]>([]);
  const isRunning = ref(false);
  const instanceId = Symbol("axe-instance");
  let hasRunInitialScan = false; // Track if initial scan has completed

  // Keep track of previously reported violations to detect new ones
  let previousViolations: ViolationLogEntry[] = [];

  // Helper function to format messages with logger prefix
  const formatMessage = (message: string): string => {
    return loggerPrefix ? `${loggerPrefix}: ${message}` : message;
  };

  // Custom console styling for accessibility violations
  const consoleStyles = {
    violation:
      "background: #d32f2f; color: white; padding: 2px 6px; border-radius: 3px; font-weight: bold;",
    minor: "background: #ff9800; color: white; padding: 2px 6px; border-radius: 3px;",
    moderate: "background: #f57c00; color: white; padding: 2px 6px; border-radius: 3px;",
    serious: "background: #e53935; color: white; padding: 2px 6px; border-radius: 3px;",
    critical: "background: #b71c1c; color: white; padding: 2px 6px; border-radius: 3px;",
    element:
      "background: #1976d2; color: white; padding: 1px 4px; border-radius: 2px; font-family: monospace;",
    help: "color: #1976d2; text-decoration: underline;"
  };

  // Function to highlight element on hover
  const highlightElement = (element: Element) => {
    if (!enableHighlighting) return;

    removeHighlight();

    const rect = element.getBoundingClientRect();
    const highlight = document.createElement("div");
    highlight.id = "axe-highlight-overlay";
    highlight.style.cssText = `
      position: fixed;
      top: ${rect.top}px;
      left: ${rect.left}px;
      width: ${rect.width}px;
      height: ${rect.height}px;
      border: 3px solid #ff4444;
      background: rgba(255, 68, 68, 0.1);
      pointer-events: none;
      z-index: 10000;
      box-sizing: border-box;
    `;

    document.body.appendChild(highlight);
    highlightedElement = highlight;
  };

  // Function to remove highlight
  const removeHighlight = () => {
    if (highlightedElement) {
      highlightedElement.remove();
      highlightedElement = null;
    }
  };

  // Helper function to create a unique key for a violation
  const createViolationKey = (violation: Result): string => {
    return `${violation.id}:${violation.impact}:${violation.nodes.map((n) => n.target.join(",").slice(0, 50)).join("|")}`;
  };

  // Helper function to log individual violation details
  const logViolationDetails = (violation: Result) => {
    // Keep styled console output for regular console
    const impactStyle =
      consoleStyles[violation.impact as keyof typeof consoleStyles] || consoleStyles.violation;

    // eslint-disable-next-line no-console
    console.groupCollapsed(
      `%c${violation.impact?.toUpperCase()}%c ${violation.description}`,
      impactStyle,
      "font-weight: bold;"
    );

    // eslint-disable-next-line no-console
    console.log(`%cRule: %c${violation.id}`, "font-weight: bold;", "font-family: monospace;");
    // eslint-disable-next-line no-console
    console.log(`%cHelp: %c${violation.help}`, "font-weight: bold;", consoleStyles.help);
    // eslint-disable-next-line no-console
    console.log(`%cMore info: %c${violation.helpUrl}`, "font-weight: bold;", consoleStyles.help);

    violation.nodes.forEach((node, index) => {
      const element = findElementInShadowDOM(node.target[0] as string, node.html);

      // eslint-disable-next-line no-console
      console.groupCollapsed(`%cElement ${index + 1}:`, "font-weight: bold;", element);

      // eslint-disable-next-line no-console
      console.groupEnd();
    });

    // eslint-disable-next-line no-console
    console.groupEnd();
  };

  // Enhanced console logging with smart new violation detection
  const logViolations = (results: AxeResults, isInitialScan = false) => {
    // Store current violations for programmatic access
    violations.value = results.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact || "unknown",
      description: violation.description,
      help: violation.help,
      helpUrl: violation.helpUrl,
      nodes: violation.nodes.map((node) => ({
        html: node.html,
        target: node.target as string[],
        element: findElementInShadowDOM(node.target[0] as string, node.html) || undefined
      }))
    }));

    // For initial scan, show all violations
    if (isInitialScan || previousViolations.length === 0) {
      if (results.violations.length === 0) {
        // eslint-disable-next-line no-console
        console.log(
          `%c✓ ${formatMessage("No accessibility violations found")}`,
          "background: #4caf50; color: white; padding: 2px 6px; border-radius: 3px;"
        );
      } else {
        // eslint-disable-next-line no-console
        console.group(
          `%c⚠ ${formatMessage(`${results.violations.length} Accessibility Violation${results.violations.length > 1 ? "s" : ""} Found`)}`,
          consoleStyles.violation
        );
        results.violations.forEach((violation) => logViolationDetails(violation));
        // eslint-disable-next-line no-console
        console.groupEnd();
      }
    } else {
      // For subsequent scans, only show new violations and summary
      const previousKeys = new Set(previousViolations.map((v) => createViolationKey(v as Result)));
      const currentKeys = new Set(results.violations.map((v) => createViolationKey(v)));

      const newViolations = results.violations.filter(
        (v) => !previousKeys.has(createViolationKey(v))
      );
      const resolvedViolations = previousViolations.filter(
        (v) => !currentKeys.has(createViolationKey(v as Result))
      );

      // Show summary of changes
      if (newViolations.length > 0 || resolvedViolations.length > 0) {
        // eslint-disable-next-line no-console
        console.group(
          "%c📊 Accessibility Scan Update",
          "background: #607d8b; color: white; padding: 2px 6px; border-radius: 3px; font-weight: bold;"
        );

        if (resolvedViolations.length > 0) {
          // eslint-disable-next-line no-console
          console.log(
            `%c✅ ${resolvedViolations.length} violation${resolvedViolations.length > 1 ? "s" : ""} resolved`,
            "color: #4caf50; font-weight: bold;"
          );
        }

        if (newViolations.length > 0) {
          // eslint-disable-next-line no-console
          console.log(
            `%c🔍 ${newViolations.length} new violation${newViolations.length > 1 ? "s" : ""} detected`,
            "color: #ff5722; font-weight: bold;"
          );
        }

        // eslint-disable-next-line no-console
        console.log(
          `%c📋 Total: ${results.violations.length} violation${results.violations.length > 1 ? "s" : ""}`,
          "color: #2196f3; font-weight: bold;"
        );
        // eslint-disable-next-line no-console
        console.groupEnd();

        // Show details for new violations only
        if (newViolations.length > 0) {
          // eslint-disable-next-line no-console
          console.group(
            `%c🆕 New Accessibility Violation${newViolations.length > 1 ? "s" : ""} Details`,
            "background: #ff5722; color: white; padding: 2px 6px; border-radius: 3px; font-weight: bold;"
          );
          newViolations.forEach((violation) => logViolationDetails(violation));
          // eslint-disable-next-line no-console
          console.groupEnd();
        }
      } else if (results.violations.length === 0 && previousViolations.length > 0) {
        // All violations were resolved
        // eslint-disable-next-line no-console
        console.log(
          `%c🎉 ${formatMessage(`All ${previousViolations.length} accessibility violation${previousViolations.length > 1 ? "s" : ""} resolved!`)}`,
          "background: #4caf50; color: white; padding: 2px 6px; border-radius: 3px; font-weight: bold;"
        );
      } else if (results.violations.length === 0) {
        // Still no violations
        // eslint-disable-next-line no-console
        console.log(
          `%c✓ ${formatMessage("No new accessibility violations found")}`,
          "background: #4caf50; color: white; padding: 2px 6px; border-radius: 3px;"
        );
      }
    }

    // Update previous violations reference
    previousViolations = [...violations.value];
  };

  // Helper function to check if element has meaningful content
  const hasContentReady = (targetElement: HTMLElement): boolean => {
    if (!waitForContent) return true;

    // Check if element has meaningful child elements (not just empty divs)
    const meaningfulElements = targetElement.querySelectorAll(
      "button, input, a, img, canvas, video, audio, [role], [aria-label], [tabindex]"
    );
    if (meaningfulElements.length > 0) return true;

    // Check if element has meaningful text content
    const textContent = targetElement.textContent?.trim();
    if (textContent && textContent.length > 10) return true;

    // Check for Shadow DOM content
    const elementsWithShadow = targetElement.querySelectorAll("*");
    for (const el of Array.from(elementsWithShadow)) {
      if (el.shadowRoot && el.shadowRoot.children.length > 0) {
        return true;
      }
    }

    return false;
  };

  // Enhanced function to wait for content readiness
  const waitForContentReadiness = async (
    targetElement: HTMLElement,
    maxWaitTime = 5000
  ): Promise<boolean> => {
    if (!waitForContent) return true;

    const startTime = Date.now();

    return new Promise((resolve) => {
      const checkContent = () => {
        if (hasContentReady(targetElement)) {
          resolve(true);
          return;
        }

        const elapsed = Date.now() - startTime;
        if (elapsed >= maxWaitTime) {
          // eslint-disable-next-line no-console
          console.warn(
            formatMessage(
              "Accessibility scan started without full content readiness (timeout reached)"
            )
          );
          resolve(false);
          return;
        }

        // Check again in 100ms
        setTimeout(checkContent, 100);
      };

      checkContent();
    });
  };

  // Main function to run axe with queue support
  const runAxe = async (isInitialScan = false) => {
    if (!enabled) return;

    // Skip if this is an initial scan and we've already completed one
    if (isInitialScan && hasRunInitialScan) {
      return;
    }

    // Create a queued execution function
    const queuedRun = async () => {
      // Check if axe is already running at the time of execution
      if (isAxeRunning) {
        return; // Silently skip duplicate runs
      }

      try {
        // Dynamic import to avoid bundling axe-core in production
        const axe = await import("axe-core");

        isAxeRunning = true;
        isRunning.value = true;
        axeInstances.add(instanceId);

        const targetElement = element
          ? "value" in element
            ? element.value
            : element
          : document.body;

        if (!targetElement) {
          // eslint-disable-next-line no-console
          console.warn("Target element for accessibility testing not found");
          return;
        }

        // Wait for content readiness if this is the initial scan
        if (isInitialScan) {
          await waitForContentReadiness(targetElement as HTMLElement);
        }

        const results = (await axe.default.run(targetElement as ElementContext, {
          rules: {
            // Default rules - can be customized via axeOptions
          },
          ...axeOptions
        })) as unknown as AxeResults;

        logViolations(results, isInitialScan);

        // Mark initial scan as completed and setup observers
        if (isInitialScan) {
          hasRunInitialScan = true;
          // Setup monitoring only after initial scan completes
          setTimeout(() => {
            setupMutationObserver();
            setupInteractionListeners();
          }, 500); // Small delay to let DOM settle
        }
      } catch (error) {
        // Check if this is the "already running" error
        if (error instanceof Error && error.message.includes("Axe is already running")) {
          // For initial scans, retry after a longer delay
          if (isInitialScan) {
            setTimeout(() => {
              runAxe(true);
            }, 1000);
          }
        } else {
          // eslint-disable-next-line no-console
          console.error("Error running accessibility scan:", error);
        }
      } finally {
        isRunning.value = false;
        isAxeRunning = false;
      }
    };

    // Add to queue and process
    axeQueue.push(queuedRun);
    processAxeQueue();
  };

  // Debounce utility for DOM change monitoring
  let debounceTimeout: ReturnType<typeof setTimeout>;
  let mutationObserver: MutationObserver | null = null;
  let interactionListeners: Array<() => void> = [];

  // Debounced function to run accessibility checks (not initial scan)
  const debouncedRunAxe = () => {
    if (debounceTimeout) {
      clearTimeout(debounceTimeout);
    }
    debounceTimeout = setTimeout(() => {
      nextTick(() => runAxe(false)); // false = not initial scan
    }, debounceDelay);
  };

  // Handler for user interactions
  const handleUserInteraction = (event: Event) => {
    // Only re-run for specific interaction types that might change accessibility
    const relevantEvents = ["click", "focus", "blur", "change", "input", "keydown"];
    if (relevantEvents.includes(event.type)) {
      debouncedRunAxe();
    }
  };

  // Setup DOM mutation observer
  const setupMutationObserver = () => {
    if (!watchForChanges || mutationObserver) return;

    const targetElement = element ? ("value" in element ? element.value : element) : document.body;

    if (!targetElement) return;

    mutationObserver = new MutationObserver((mutations) => {
      let shouldRerun = false;

      mutations.forEach((mutation) => {
        // Check for added/removed nodes
        if (mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0) {
          shouldRerun = true;
        }

        // Check for attribute changes that might affect accessibility
        if (mutation.type === "attributes") {
          const relevantAttributes = [
            "aria-",
            "role",
            "tabindex",
            "alt",
            "title",
            "disabled",
            "hidden",
            "class",
            "style",
            "id",
            "for",
            "aria-hidden",
            "aria-expanded",
            "aria-selected",
            "aria-checked"
          ];

          const attrName = mutation.attributeName;
          if (
            attrName &&
            relevantAttributes.some((attr) => attrName.startsWith(attr) || attrName === attr)
          ) {
            shouldRerun = true;
          }
        }
      });

      if (shouldRerun) {
        debouncedRunAxe();
      }
    });

    mutationObserver.observe(targetElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        "aria-expanded",
        "aria-hidden",
        "aria-selected",
        "aria-checked",
        "role",
        "tabindex",
        "alt",
        "title",
        "disabled",
        "hidden",
        "class"
      ]
    });
  };

  // Setup interaction event listeners
  const setupInteractionListeners = () => {
    if (!watchInteractions) return;

    const targetElement = element ? ("value" in element ? element.value : element) : document.body;

    if (!targetElement) return;

    const events = ["click", "focus", "blur", "change", "input", "keydown"];

    events.forEach((eventType) => {
      const listener = (event: Event) => handleUserInteraction(event);
      targetElement.addEventListener(eventType, listener, { passive: true, capture: true });
      interactionListeners.push(() => {
        targetElement.removeEventListener(eventType, listener, { capture: true });
      });
    });
  };

  // Watch for element changes
  watch(
    () => (element && "value" in element ? element.value : element),
    (newElement, oldElement) => {
      if (newElement !== oldElement) {
        // Cleanup old observers
        cleanup();
        // Setup new observers
        nextTick(() => {
          setupMutationObserver();
          setupInteractionListeners();
          runAxe();
        });
      }
    },
    { immediate: false }
  );

  // Cleanup function
  const cleanup = () => {
    axeInstances.delete(instanceId);
    removeHighlight();
    if (mutationObserver) {
      mutationObserver.disconnect();
      mutationObserver = null;
    }
    interactionListeners.forEach((removeListener) => removeListener());
    interactionListeners = [];

    // If this was the last instance, reset global state
    if (axeInstances.size === 0) {
      isAxeRunning = false;
    }
  };

  // Run axe when component mounts
  onMounted(() => {
    // Small delay to ensure DOM is fully rendered
    setTimeout(() => {
      runAxe(true); // true = initial scan
      // Setup monitoring after initial scan
      setupMutationObserver();
      setupInteractionListeners();
    }, initialScanDelay);
  });

  // Cleanup when component unmounts
  onUnmounted(cleanup);

  return {
    violations,
    isRunning,
    runAxe,
    cleanup,
    highlightElement,
    removeHighlight
  };
}

// USAGE EXAMPLE

// Initialize accessibility checking
useAccessibility({
  element: appRef,
  enabled: props.dev || process.env.NODE_ENV === "development",
  enableHighlighting: true,
  loggerPrefix: `[MyApp] (${appStore.appId})`,
  initialScanDelay: 3000, // Wait 3 seconds before initial scan
  waitForContent: true // Wait for meaningful content before scanning
});

export type { AccessibilityHookOptions, ViolationLogEntry };
