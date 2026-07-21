export const runnerService = Object.freeze({
  product: "Pactwire",
  responsibility: "isolated browser execution",
  service: "runner",
});

export * from "./deterministic-replay.js";
export * from "./deterministic-recorder.js";
export * from "./isolated-browser.js";
export * from "./playwright-replay.js";
