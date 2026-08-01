import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// Vitest has no built-in test-framework hook for RTL to attach to (that's a
// Jest-specific auto-registration), so without this every render() in a file
// leaves its tree in document.body and document.querySelector in the next
// test can silently match a previous test's stale, empty droppable instead.
afterEach(cleanup);

// jsdom doesn't implement ResizeObserver; @hello-pangea/dnd's DragDropContext
// touches it during layout measurement even when no drag is simulated.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as typeof ResizeObserver;
