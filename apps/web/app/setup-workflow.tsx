"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type SetupStepId =
  | "software"
  | "authorization"
  | "agreement"
  | "requirements"
  | "test-data"
  | "journey";

interface SetupStep {
  readonly id: SetupStepId;
  readonly number: number;
  readonly label: string;
  readonly description: string;
  readonly status: "COMPLETE" | "ACTION_REQUIRED" | "BLOCKED";
  readonly detail: string;
  readonly blocker?: string;
  readonly targetId: string;
}

interface SetupWorkflowView {
  readonly software: { readonly id: string; readonly name: string };
  readonly configuration: {
    readonly agreementVersion: number | null;
    readonly authorizationReviewAt: string | null;
  };
  readonly statusProvenance: {
    readonly state: string;
    readonly label: string;
    readonly sourceLabel: string;
    readonly sourceReference?: string;
    readonly reason: string;
    readonly recordedAt: string;
    readonly isPactwireConclusion: false;
  };
  readonly steps: readonly SetupStep[];
  readonly completedStepCount: number;
  readonly currentStepId: SetupStepId | null;
  readonly runReady: boolean;
  readonly nextAction: { readonly code: string; readonly label: string };
}

interface SetupWorkflowProps {
  readonly workspaceId: string;
  readonly softwareId: string;
  readonly initialStepId?: string;
  readonly onClose: () => void;
}

const statusLabels = Object.freeze({
  COMPLETE: "Complete",
  ACTION_REQUIRED: "Needs action",
  BLOCKED: "Blocked",
});

function isStepId(value: string | undefined): value is SetupStepId {
  return [
    "software",
    "authorization",
    "agreement",
    "requirements",
    "test-data",
    "journey",
  ].includes(value ?? "");
}

function replaceSetupUrl(softwareId: string, stepId?: SetupStepId): void {
  const url = new URL(window.location.href);
  url.searchParams.set("setup", softwareId);
  if (stepId) url.searchParams.set("step", stepId);
  else url.searchParams.delete("step");
  window.history.replaceState({}, "", url);
}

export function SetupWorkflow({
  workspaceId,
  softwareId,
  initialStepId,
  onClose,
}: SetupWorkflowProps) {
  const [workflow, setWorkflow] = useState<SetupWorkflowView>();
  const [activeStepId, setActiveStepId] = useState<SetupStepId | undefined>(
    isStepId(initialStepId) ? initialStepId : undefined,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const loadSequence = useRef(0);

  const load = useCallback(async () => {
    const requestSequence = ++loadSequence.current;
    setLoading(true);
    setError(undefined);
    try {
      const response = await fetch(
        `/api/workspaces/${workspaceId}/software/${softwareId}/setup`,
        { cache: "no-store" },
      );
      const body = (await response.json()) as {
        readonly workflow?: SetupWorkflowView;
        readonly error?: { readonly message?: string };
      };
      if (!response.ok || !body.workflow) {
        throw new Error(
          body.error?.message ?? "Pactwire could not load this setup.",
        );
      }
      if (requestSequence !== loadSequence.current) return;
      setWorkflow(body.workflow);
      const requestedStep = isStepId(initialStepId)
        ? initialStepId
        : undefined;
      setActiveStepId((currentStep) => {
        return (
          requestedStep ??
          currentStep ??
          body.workflow?.currentStepId ??
          "journey"
        );
      });
      window.dispatchEvent(
        new CustomEvent("pactwire:setup-software-selected", {
          detail: { softwareId },
        }),
      );
    } catch (cause) {
      if (requestSequence !== loadSequence.current) return;
      setError(
        cause instanceof Error
          ? cause.message
          : "Pactwire could not load this setup.",
      );
    } finally {
      if (requestSequence === loadSequence.current) setLoading(false);
    }
  }, [initialStepId, softwareId, workspaceId]);

  useEffect(() => {
    void load();
    return () => {
      loadSequence.current += 1;
    };
  }, [load]);

  useEffect(() => {
    const refresh = () => void load();
    window.addEventListener("pactwire:setup-progress-changed", refresh);
    return () => {
      window.removeEventListener("pactwire:setup-progress-changed", refresh);
    };
  }, [load]);

  useEffect(() => {
    if (activeStepId) replaceSetupUrl(softwareId, activeStepId);
  }, [activeStepId, softwareId]);

  const activeStep = useMemo(
    () => workflow?.steps.find((step) => step.id === activeStepId),
    [activeStepId, workflow],
  );

  function selectStep(step: SetupStep): void {
    setActiveStepId(step.id);
    replaceSetupUrl(softwareId, step.id);
  }

  function openStep(step: SetupStep): void {
    selectStep(step);
    const target = document.getElementById(step.targetId);
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function close(): void {
    const url = new URL(window.location.href);
    url.searchParams.delete("setup");
    url.searchParams.delete("step");
    window.history.replaceState({}, "", url);
    onClose();
  }

  return (
    <section
      className="setup-workflow"
      data-testid="setup-workflow"
      id="setup"
      aria-labelledby="setup-heading"
    >
      <header className="setup-heading">
        <div>
          <p className="eyebrow">Guided setup / UX-01</p>
          <h2 id="setup-heading">
            {workflow?.software.name ??
              (error ? "Software setup" : "Loading software setup")}
          </h2>
          <p>
            Complete the six visible prerequisites below. Pactwire reads each
            state from saved workspace records, so you can leave and resume from
            this URL.
          </p>
        </div>
        <div className="setup-heading-actions">
          <button
            className="secondary-button"
            data-testid="refresh-setup-status"
            disabled={loading}
            type="button"
            onClick={() => void load()}
          >
            {loading ? "Checking…" : "Refresh status"}
          </button>
          <button className="text-button" type="button" onClick={close}>
            Close setup
          </button>
        </div>
      </header>

      {error ? (
        <div className="setup-state danger" role="alert">
          <div>
            <strong>Setup status unavailable</strong>
            <p>{error}</p>
          </div>
          <button className="secondary-button" type="button" onClick={() => void load()}>
            Try again
          </button>
        </div>
      ) : loading && !workflow ? (
        <div className="setup-state" aria-live="polite">
          <span className="inventory-loader" aria-hidden="true" />
          <strong>Checking saved prerequisites</strong>
        </div>
      ) : workflow ? (
        <>
          <div className="setup-summary">
            <div>
              <span>Setup progress</span>
              <strong>
                {workflow.completedStepCount} of {workflow.steps.length} complete
              </strong>
              <div
                className="setup-progress-track"
                role="progressbar"
                aria-label="Software setup completion"
                aria-valuemin={0}
                aria-valuemax={workflow.steps.length}
                aria-valuenow={workflow.completedStepCount}
              >
                <span
                  style={{
                    width: `${(workflow.completedStepCount / workflow.steps.length) * 100}%`,
                  }}
                />
              </div>
            </div>
            <div data-testid="setup-status-provenance">
              <span>District status · {workflow.statusProvenance.label}</span>
              <strong>{workflow.statusProvenance.sourceLabel}</strong>
              <small>
                {workflow.statusProvenance.sourceReference
                  ? `District record ${workflow.statusProvenance.sourceReference} · `
                  : ""}
                not a Pactwire conclusion
              </small>
            </div>
            <div className={workflow.runReady ? "run-ready" : "next-required"}>
              <span>{workflow.runReady ? "Configuration" : "Next safe action"}</span>
              <strong>
                {workflow.runReady ? "Run-ready" : workflow.nextAction.label}
              </strong>
              {workflow.runReady ? (
                <small>{workflow.nextAction.label}</small>
              ) : null}
              <small className="mono">{workflow.nextAction.code}</small>
            </div>
          </div>

          <ol className="setup-steps" aria-label="Software setup steps">
            {workflow.steps.map((step) => (
              <li
                className={`setup-step ${step.status.toLocaleLowerCase().replace("_", "-")} ${activeStepId === step.id ? "active" : ""}`}
                data-testid="setup-step"
                key={step.id}
              >
                <button
                  type="button"
                  aria-current={activeStepId === step.id ? "step" : undefined}
                  onClick={() => selectStep(step)}
                >
                  <span className="setup-step-number mono">
                    {String(step.number).padStart(2, "0")}
                  </span>
                  <span className="setup-step-copy">
                    <strong>{step.label}</strong>
                    <small>{statusLabels[step.status]}</small>
                    {step.blocker ? (
                      <span className="setup-step-blocker">{step.blocker}</span>
                    ) : null}
                  </span>
                </button>
              </li>
            ))}
          </ol>

          {activeStep ? (
            <div className="setup-step-detail" aria-live="polite">
              <div>
                <p className="card-kicker">
                  Step {activeStep.number} · {statusLabels[activeStep.status]}
                </p>
                <h3>{activeStep.label}</h3>
                <p>{activeStep.description}</p>
              </div>
              <div className="setup-step-decision">
                <strong>{activeStep.detail}</strong>
                {activeStep.blocker ? <p>{activeStep.blocker}</p> : null}
                <button
                  className="primary-button"
                  disabled={activeStep.status === "BLOCKED"}
                  type="button"
                  onClick={() => openStep(activeStep)}
                >
                  {activeStep.status === "COMPLETE"
                    ? "Review saved step"
                    : activeStep.status === "BLOCKED"
                      ? "Complete the earlier step first"
                      : "Open this step"}
                </button>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
