import '@testing-library/jest-dom';

// jsdom has no ResizeObserver; the canvas only needs it to exist.
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
