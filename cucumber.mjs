export default {
  format: [
    "progress",
    "json:artifacts/verification/AUT-01/reports/cucumber.json",
    "json:artifacts/verification/AUT-02/reports/cucumber.json",
    "json:artifacts/verification/AUT-03/reports/cucumber.json",
  ],
  import: ["tests/bdd/**/*.steps.mjs"],
  paths: ["tests/bdd/**/*.feature"],
  publish: false,
};
