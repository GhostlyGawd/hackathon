import { EventEmitter } from "node:events";

// One durable JSON report is emitted per implemented task evidence directory.
EventEmitter.defaultMaxListeners = 32;

export default {
  format: [
    "progress",
    "json:artifacts/verification/AUT-01/reports/cucumber.json",
    "json:artifacts/verification/AUT-02/reports/cucumber.json",
    "json:artifacts/verification/AUT-03/reports/cucumber.json",
    "json:artifacts/verification/AUT-04/reports/cucumber.json",
    "json:artifacts/verification/JRN-01/reports/cucumber.json",
    "json:artifacts/verification/JRN-02/reports/cucumber.json",
    "json:artifacts/verification/JRN-03/reports/cucumber.json",
    "json:artifacts/verification/RUN-01/reports/cucumber.json",
    "json:artifacts/verification/RUN-02/reports/cucumber.json",
    "json:artifacts/verification/RUN-03/reports/cucumber.json",
    "json:artifacts/verification/AGR-01/reports/cucumber.json",
    "json:artifacts/verification/AGR-02/reports/cucumber.json",
    "json:artifacts/verification/AGR-03/reports/cucumber.json",
    "json:artifacts/verification/FIX-01/reports/cucumber.json",
  ],
  import: ["tests/bdd/**/*.steps.mjs"],
  paths: ["tests/bdd/**/*.feature"],
  publish: false,
};
