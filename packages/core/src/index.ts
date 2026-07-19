export const productIdentity = Object.freeze({
  name: "Pactwire",
  truthBoundary:
    "A named test can witness a conflict; it cannot prove safety or compliance.",
});

export * from "./domain.js";
export * from "./authorization.js";
export * from "./inventory.js";
export * from "./test-authorization.js";
export * from "./secret-isolation.js";
export * from "./evidence.js";
export * from "./migrations.js";
