"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { canSaveJourneyReview } from "../lib/review-experience";
import { ReviewAuthorityLegend } from "./review-authority-legend";

type PersonaRole = "TEACHER" | "STUDENT";
type AuthorizationAction =
  | "NAVIGATE"
  | "SUBMIT"
  | "DOWNLOAD"
  | "UPLOAD"
  | "MESSAGE"
  | "PURCHASE"
  | "DELETE"
  | "ADMINISTER";

interface SoftwareOption {
  readonly software: { readonly id: string; readonly name: string };
}

interface AgreementVersion {
  readonly id: string;
  readonly version: number;
}

interface RequirementVersion {
  readonly id: string;
  readonly status: "PROPOSED" | "CONFIRMED" | "AMBIGUOUS" | "REJECTED";
  readonly executable: boolean;
  readonly plainLanguage: string;
}

interface TestAuthorization {
  readonly id: string;
  readonly version: number;
  readonly status: "ACTIVE" | "EXPIRED" | "REVOKED";
  readonly allowedActions: readonly AuthorizationAction[];
  readonly prohibitedActions: readonly AuthorizationAction[];
  readonly allowedBaseUrl: string;
}

interface Persona {
  readonly id: string;
  readonly role: PersonaRole;
  readonly displayName: string;
  readonly email: string;
  readonly fields: Readonly<Record<string, string>>;
}

interface JourneyTestField {
  readonly fieldId: string;
  readonly sourceField: string;
  readonly requirementVersionId: string;
}

interface JourneyCheckpoint {
  readonly checkpointId: string;
  readonly required: boolean;
  readonly description: string;
  readonly observationSource:
    | "NETWORK"
    | "SCREENSHOT"
    | "BROWSER_STORAGE"
    | "ACTION";
  readonly requiredVisibility: boolean;
  readonly requirementVersionIds: readonly string[];
  readonly testFieldIds: readonly string[];
}

interface JourneyStep {
  readonly stepId: string;
  readonly instruction: string;
  readonly action: AuthorizationAction;
}

interface JourneyVersion {
  readonly id: string;
  readonly journeyId: string;
  readonly version: number;
  readonly sourceVersionId: string | null;
  readonly name: string;
  readonly role: PersonaRole;
  readonly goal: string;
  readonly startState: string;
  readonly requirementVersionIds: readonly string[];
  readonly authorizationId: string;
  readonly personaId: string;
  readonly testFields: readonly JourneyTestField[];
  readonly allowedActions: readonly AuthorizationAction[];
  readonly prohibitedActions: readonly AuthorizationAction[];
  readonly checkpoints: readonly JourneyCheckpoint[];
  readonly steps: readonly JourneyStep[];
  readonly createdAt: string;
  readonly createdBy: { readonly kind: "HUMAN"; readonly actorId: string };
}

interface JourneyCausalLink {
  readonly requirementVersionId: string;
  readonly requirementText: string | null;
  readonly personaId: string;
  readonly personaDisplayName: string | null;
  readonly fieldId: string;
  readonly sourceField: string;
  readonly checkpointIds: readonly string[];
}

interface JourneyView {
  readonly version: JourneyVersion;
  readonly readiness: {
    readonly status: "RUNNABLE" | "BLOCKED";
    readonly blockers: readonly { readonly code: string; readonly message: string }[];
  };
  readonly causalLinks: readonly JourneyCausalLink[];
  readonly lastSuccessfulVersion: null;
  readonly repairHistory: readonly [];
}

interface JourneyHistory {
  readonly versions: readonly JourneyView[];
  readonly current: readonly JourneyView[];
}

interface JourneyForm {
  readonly name: string;
  readonly goal: string;
  readonly startState: string;
  readonly requiredVisibility: boolean;
}

interface PrerequisiteState {
  readonly software: readonly SoftwareOption[];
  readonly softwareId: string;
  readonly agreement: AgreementVersion | undefined;
  readonly requirement: RequirementVersion | undefined;
  readonly authorization: TestAuthorization | undefined;
  readonly personas: readonly Persona[];
  readonly history: JourneyHistory;
}

interface ApiErrorBody {
  readonly error?: {
    readonly message?: string;
    readonly blockers?: readonly { readonly code: string; readonly message: string }[];
  };
}

class JourneyApiError extends Error {
  readonly blockers: readonly { readonly code: string; readonly message: string }[];

  constructor(response: Response, body: ApiErrorBody) {
    super(body.error?.message ?? `Journey request failed (${response.status}).`);
    this.name = "JourneyApiError";
    this.blockers = body.error?.blockers ?? [];
  }
}

async function journeyApi<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(input, init);
  const body = (await response.json()) as T | ApiErrorBody;
  if (!response.ok) throw new JourneyApiError(response, body as ApiErrorBody);
  return body as T;
}

const roleLabels: Readonly<Record<PersonaRole, string>> = {
  TEACHER: "Teacher",
  STUDENT: "Student",
};

const actionLabels: Readonly<Record<AuthorizationAction, string>> = {
  NAVIGATE: "Open pages",
  SUBMIT: "Submit fictional forms",
  DOWNLOAD: "Download files",
  UPLOAD: "Upload files",
  MESSAGE: "Send messages",
  PURCHASE: "Make purchases",
  DELETE: "Delete records",
  ADMINISTER: "Change settings or permissions",
};

function defaultForm(role: PersonaRole): JourneyForm {
  return role === "TEACHER"
    ? {
        name: "Publish a fictional assignment",
        goal: "Create an assignment containing the unique fictional class phrase.",
        startState: "Signed in to the fictional teacher workspace.",
        requiredVisibility: true,
      }
    : {
        name: "Submit a fictional classroom response",
        goal: "Submit the unique fictional response to the seeded assignment.",
        startState: "Signed in to the fictional student workspace.",
        requiredVisibility: true,
      };
}

function formFromVersion(version: JourneyVersion): JourneyForm {
  return {
    name: version.name,
    goal: version.goal,
    startState: version.startState,
    requiredVisibility: version.checkpoints.every(
      (checkpoint) => !checkpoint.required || checkpoint.requiredVisibility,
    ),
  };
}

function sourceValue(persona: Persona | undefined, sourceField: string): string {
  if (!persona) return "Unavailable";
  if (sourceField === "displayName") return persona.displayName;
  if (sourceField === "email") return persona.email;
  return persona.fields[sourceField] ?? "Unavailable";
}

function isoLabel(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

function boundedJourneyActions(
  authorization: TestAuthorization | undefined,
): readonly AuthorizationAction[] {
  if (!authorization) return [];
  const bounded = authorization.allowedActions.filter(
    (action) => action === "NAVIGATE" || action === "SUBMIT",
  );
  return bounded.length > 0 ? bounded : authorization.allowedActions.slice(0, 1);
}

function journeySourceFields(persona: Persona | undefined): readonly string[] {
  if (!persona) return [];
  const activitySource = Object.keys(persona.fields)[0];
  return [
    ...new Set(
      ["email", activitySource].filter(
        (source): source is string => Boolean(source),
      ),
    ),
  ];
}

export function JourneyAuthoringPanel({
  workspaceId,
  canManageJourneys,
}: {
  readonly workspaceId: string;
  readonly canManageJourneys: boolean;
}) {
  const [role, setRole] = useState<PersonaRole>("TEACHER");
  const [selectedSoftwareId, setSelectedSoftwareId] = useState("");
  const [form, setForm] = useState<JourneyForm>(defaultForm("TEACHER"));
  const [prerequisites, setPrerequisites] = useState<PrerequisiteState>();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{
    readonly tone: "success" | "blocked" | "neutral";
    readonly title: string;
    readonly message: string;
    readonly blockers?: readonly string[];
  }>();

  const current = prerequisites?.history.current.find(
    (journey) => journey.version.role === role,
  );
  const persona = prerequisites?.personas.find(
    (candidate) => candidate.role === role,
  );
  const journeyAllowedActions = boundedJourneyActions(
    prerequisites?.authorization,
  );
  const fictionalSources = journeySourceFields(persona);
  const history = prerequisites
    ? prerequisites.history.versions.filter((journey) =>
        current
          ? journey.version.journeyId === current.version.journeyId
          : journey.version.role === role,
      )
    : [];
  const missing = [
    !prerequisites?.softwareId ? "software" : undefined,
    !prerequisites?.agreement ? "agreement version" : undefined,
    !prerequisites?.requirement ? "current confirmed test rule" : undefined,
    !prerequisites?.authorization ? "active test authorization" : undefined,
    !persona ? `fictional ${roleLabels[role].toLowerCase()} persona` : undefined,
  ].filter((value): value is string => value !== undefined);
  const canSave = canSaveJourneyReview({
    canManage: canManageJourneys,
    hasSoftware: Boolean(prerequisites?.softwareId),
    hasAgreement: Boolean(prerequisites?.agreement),
    hasConfirmedRequirement: Boolean(prerequisites?.requirement),
    hasActiveAuthorization: Boolean(prerequisites?.authorization),
    hasPersona: Boolean(persona),
    allowedActionCount: journeyAllowedActions.length,
    fictionalSourceCount: fictionalSources.length,
    requiredCheckpointCount: form.requiredVisibility ? 1 : 0,
    requiredVisibility: form.requiredVisibility,
    name: form.name,
    goal: form.goal,
    startState: form.startState,
  });

  const applyRole = useCallback(
    (nextRole: PersonaRole, state = prerequisites): void => {
      setRole(nextRole);
      const saved = state?.history.current.find(
        (journey) => journey.version.role === nextRole,
      );
      setForm(saved ? formFromVersion(saved.version) : defaultForm(nextRole));
      setNotice(undefined);
    },
    [prerequisites],
  );

  const refreshPrerequisites = useCallback(async (
    preferredSoftwareId?: string,
  ): Promise<void> => {
    setLoading(true);
    setNotice(undefined);
    try {
      const softwareResult = await journeyApi<{
        readonly items: readonly SoftwareOption[];
      }>(`/api/workspaces/${workspaceId}/software`);
      const requestedSoftwareId = preferredSoftwareId ?? selectedSoftwareId;
      const softwareId =
        requestedSoftwareId &&
        softwareResult.items.some(
          (item) => item.software.id === requestedSoftwareId,
        )
          ? requestedSoftwareId
          : (softwareResult.items[0]?.software.id ?? "");
      setSelectedSoftwareId(softwareId);
      if (!softwareId) {
        const empty: PrerequisiteState = {
          software: softwareResult.items,
          softwareId: "",
          agreement: undefined,
          requirement: undefined,
          authorization: undefined,
          personas: [],
          history: { current: [], versions: [] },
        };
        setPrerequisites(empty);
        applyRole(role, empty);
        return;
      }

      const [agreementResult, authorizationResult, personaResult] =
        await Promise.all([
          journeyApi<{ readonly agreements: readonly AgreementVersion[] }>(
            `/api/workspaces/${workspaceId}/software/${softwareId}/agreements`,
          ),
          journeyApi<{
            readonly authorizations: readonly TestAuthorization[];
          }>(
            `/api/workspaces/${workspaceId}/software/${softwareId}/authorizations`,
          ),
          journeyApi<{ readonly personas: readonly Persona[] }>(
            `/api/workspaces/${workspaceId}/personas`,
          ),
        ]);
      const agreement = agreementResult.agreements[0];
      const latestAuthorization = authorizationResult.authorizations.at(-1);
      const authorization =
        latestAuthorization?.status === "ACTIVE"
          ? latestAuthorization
          : undefined;
      const [requirementResult, journeyHistory] = agreement
        ? await Promise.all([
            journeyApi<{
              readonly current: readonly RequirementVersion[];
            }>(
              `/api/workspaces/${workspaceId}/software/${softwareId}/agreements/${agreement.id}/requirements`,
            ),
            journeyApi<JourneyHistory>(
              `/api/workspaces/${workspaceId}/software/${softwareId}/journeys?agreementVersionId=${encodeURIComponent(agreement.id)}`,
            ),
          ])
        : [{ current: [] }, { current: [], versions: [] }];
      const requirement = requirementResult.current.find(
        (candidate) =>
          candidate.status === "CONFIRMED" && candidate.executable,
      );
      const nextState: PrerequisiteState = {
        software: softwareResult.items,
        softwareId,
        agreement,
        requirement,
        authorization,
        personas: personaResult.personas,
        history: journeyHistory,
      };
      setPrerequisites(nextState);
      applyRole(role, nextState);
      const nextPersona = nextState.personas.find(
        (candidate) => candidate.role === role,
      );
      if (agreement && requirement && authorization && nextPersona) {
        setNotice({
          tone: "neutral",
          title: "Prerequisites linked",
          message:
            "The editor found one current confirmed rule, active authorization, and matching fictional persona.",
        });
      } else {
        setNotice({
          tone: "blocked",
          title: "Journey prerequisites are incomplete",
          message:
            "Create the missing records in the panels above, then refresh this editor.",
        });
      }
    } catch (error) {
      setPrerequisites(undefined);
      setNotice({
        tone: "blocked",
        title: "Prerequisites could not be loaded",
        message: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setLoading(false);
    }
  }, [applyRole, role, selectedSoftwareId, workspaceId]);

  useEffect(() => {
    const setupSelected = (event: Event) => {
      const selected = (event as CustomEvent<{ softwareId?: unknown }>).detail
        ?.softwareId;
      if (typeof selected !== "string") return;
      setSelectedSoftwareId(selected);
      void refreshPrerequisites(selected);
    };
    window.addEventListener("pactwire:setup-software-selected", setupSelected);
    return () => {
      window.removeEventListener(
        "pactwire:setup-software-selected",
        setupSelected,
      );
    };
  }, [refreshPrerequisites]);

  async function saveJourney(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (
      !canSave ||
      !prerequisites?.agreement ||
      !prerequisites.requirement ||
      !prerequisites.authorization ||
      !persona
    ) {
      return;
    }
    setSaving(true);
    setNotice(undefined);
    const requirementId = prerequisites.requirement.id;
    const testFields = fictionalSources.map((sourceField) => ({
      fieldId: `${role.toLowerCase()}-${sourceField}`,
      sourceField,
      requirementVersionId: requirementId,
    }));
    const checkpointId =
      role === "TEACHER" ? "assignment-published" : "submission-request";
    const steps: readonly JourneyStep[] = journeyAllowedActions.map((action) => ({
      stepId: `${role.toLowerCase()}-${action.toLowerCase()}`,
      instruction:
        action === "NAVIGATE"
          ? `Open the fictional ${roleLabels[role].toLowerCase()} workspace.`
          : action === "SUBMIT"
            ? role === "TEACHER"
              ? "Publish the assignment with the unique fictional class phrase."
              : "Submit the unique fictional response."
            : `${actionLabels[action]} within the authorized fictional tenant.`,
      action,
    }));
    const payload = {
      agreementVersionId: prerequisites.agreement.id,
      ...(current ? { sourceVersionId: current.version.id } : {}),
      draft: {
        name: form.name.trim(),
        role,
        goal: form.goal.trim(),
        startState: form.startState.trim(),
        requirementVersionIds: [requirementId],
        authorizationId: prerequisites.authorization.id,
        personaId: persona.id,
        testFields,
        allowedActions: journeyAllowedActions,
        prohibitedActions: prerequisites.authorization.prohibitedActions,
        checkpoints: [
          {
            checkpointId,
            required: true,
            description:
              role === "TEACHER"
                ? "Observe the fictional assignment publish request."
                : "Observe the fictional submission request.",
            observationSource: "NETWORK" as const,
            requiredVisibility: form.requiredVisibility,
            requirementVersionIds: [requirementId],
            testFieldIds: testFields.map((field) => field.fieldId),
          },
        ],
        steps,
      },
    };
    try {
      const result = await journeyApi<{ readonly journey: JourneyView }>(
        `/api/workspaces/${workspaceId}/software/${prerequisites.softwareId}/journeys`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const nextHistory: JourneyHistory = {
        versions: [
          result.journey,
          ...prerequisites.history.versions.filter(
            (journey) => journey.version.id !== result.journey.version.id,
          ),
        ],
        current: [
          result.journey,
          ...prerequisites.history.current.filter(
            (journey) =>
              journey.version.journeyId !== result.journey.version.journeyId,
          ),
        ],
      };
      setPrerequisites({ ...prerequisites, history: nextHistory });
      setForm(formFromVersion(result.journey.version));
      setNotice({
        tone: "success",
        title: `Journey version ${result.journey.version.version} saved`,
        message:
          "This immutable version is runnable from the linked current prerequisites.",
      });
      window.dispatchEvent(new Event("pactwire:setup-progress-changed"));
    } catch (error) {
      setNotice({
        tone: "blocked",
        title: "Journey not saved",
        message: error instanceof Error ? error.message : "Please try again.",
        ...(error instanceof JourneyApiError && error.blockers.length > 0
          ? { blockers: error.blockers.map((blocker) => blocker.message) }
          : {}),
      });
    } finally {
      setSaving(false);
    }
  }

  const requirement = prerequisites?.requirement;
  const authorization = prerequisites?.authorization;

  return (
    <section
      className="journey-panel"
      id="journeys"
      data-testid="journey-authoring-panel"
      aria-labelledby="journey-heading"
      aria-busy={loading || saving}
    >
      <header className="journey-heading">
        <div>
          <p className="eyebrow">Named journey editor / JRN-02</p>
          <h2 id="journey-heading">Define exactly what a browser test must do and show.</h2>
          <p>
            Turn a confirmed agreement rule into a repeatable test specification.
            Name who acts, what they may do, which fictional values identify the
            test, and what must be visible before the journey can be saved.
          </p>
        </div>
        <span className="journey-boundary-badge">
          <span aria-hidden="true" /> Human-confirmed rules only
        </span>
      </header>

      <ReviewAuthorityLegend
        headingId="journey-review-authority-heading"
        observedState="NOT_RUN"
      />

      {!canManageJourneys ? (
        <div
          className="journey-notice blocked"
          data-testid="journey-permission-boundary"
          role="status"
        >
          <strong>Read-only access</strong>
          <span>
            Your workspace role can inspect named journeys but cannot create or
            change them.
          </span>
        </div>
      ) : null}

      <div className="journey-prerequisite-bar">
        <label htmlFor="journey-software">
          Software under test
          <select
            id="journey-software"
            data-testid="journey-software-select"
            value={selectedSoftwareId}
            disabled={loading || saving}
            onChange={(event) => {
              setSelectedSoftwareId(event.target.value);
              setPrerequisites(undefined);
              setNotice({
                tone: "neutral",
                title: "Refresh required",
                message: "Load the current prerequisites for this software.",
              });
            }}
          >
            <option value="">Choose software</option>
            {prerequisites?.software.map((item) => (
              <option key={item.software.id} value={item.software.id}>
                {item.software.name}
              </option>
            ))}
          </select>
        </label>
        <button
          className="secondary-button"
          type="button"
          data-testid="refresh-journey-prerequisites"
          disabled={loading || saving}
          onClick={() => {
            void refreshPrerequisites();
          }}
        >
          {loading ? "Loading prerequisites…" : "Refresh prerequisites"}
        </button>
        <p>
          This explicit refresh rechecks current records. It does not treat an
          earlier draft as permission.
        </p>
      </div>

      {notice ? (
        <div
          className={`journey-notice ${notice.tone}`}
          role="status"
          aria-live="polite"
          data-testid={
            notice.tone === "blocked" ? "journey-blocked-notice" : "journey-notice"
          }
        >
          <strong>{notice.title}</strong>
          <span>{notice.message}</span>
          {notice.blockers ? (
            <ul>
              {notice.blockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {prerequisites && missing.length === 0 ? (
        <div
          className="journey-prerequisite-proof"
          data-testid="journey-prerequisites-ready"
        >
          <div>
            <span>01</span>
            <small>Current rule</small>
            <strong>{requirement?.plainLanguage}</strong>
          </div>
          <div>
            <span>02</span>
            <small>Active authority</small>
            <strong>Version {authorization?.version}</strong>
            <code>{authorization?.allowedBaseUrl}</code>
          </div>
          <div>
            <span>03</span>
            <small>Fictional actor</small>
            <strong>{persona?.displayName}</strong>
            <code>{persona?.email}</code>
          </div>
        </div>
      ) : prerequisites ? (
        <div className="journey-missing" data-testid="journey-prerequisites-missing">
          <strong>Missing before this journey can run:</strong>
          <span>{missing.join(", ") || "No matching records"}</span>
        </div>
      ) : (
        <div className="journey-empty">
          <strong>Load current prerequisites to start.</strong>
          <span>The editor will not infer authority from page content or a saved draft.</span>
        </div>
      )}

      <div className="journey-workspace">
        <form
          className="journey-editor"
          onSubmit={(event) => {
            void saveJourney(event);
          }}
        >
          <div className="journey-card-heading">
            <span>01</span>
            <div>
              <p className="eyebrow">Journey definition</p>
              <h3>Actor, goal, and authorized steps</h3>
            </div>
          </div>

          <div className="journey-fields">
            <label htmlFor="journey-role">
              Fictional role
              <select
                id="journey-role"
                data-testid="journey-role-select"
                value={role}
                onChange={(event) => applyRole(event.target.value as PersonaRole)}
              >
                <option value="TEACHER">Teacher</option>
                <option value="STUDENT">Student</option>
              </select>
            </label>
            <label htmlFor="journey-name">
              Journey name
              <input
                id="journey-name"
                value={form.name}
                onChange={(event) =>
                  setForm((currentForm) => ({
                    ...currentForm,
                    name: event.target.value,
                  }))
                }
              />
            </label>
            <label className="journey-wide-field" htmlFor="journey-goal">
              Goal
              <textarea
                id="journey-goal"
                data-testid="journey-goal"
                rows={3}
                value={form.goal}
                onChange={(event) =>
                  setForm((currentForm) => ({
                    ...currentForm,
                    goal: event.target.value,
                  }))
                }
              />
            </label>
            <label className="journey-wide-field" htmlFor="journey-start-state">
              Starting state
              <input
                id="journey-start-state"
                value={form.startState}
                onChange={(event) =>
                  setForm((currentForm) => ({
                    ...currentForm,
                    startState: event.target.value,
                  }))
                }
              />
            </label>
          </div>

          <div className="journey-scope-grid">
            <div>
              <span className="scope-label allowed">Allowed by this journey</span>
              <ul>
                {journeyAllowedActions.map((action) => (
                  <li key={action}>{actionLabels[action]}</li>
                ))}
              </ul>
            </div>
            <div>
              <span className="scope-label prohibited">Always prohibited</span>
              <ul>
                {(authorization?.prohibitedActions ?? []).map((action) => (
                  <li key={action}>{actionLabels[action]}</li>
                ))}
              </ul>
            </div>
          </div>

          <fieldset className="journey-checkpoint-card">
            <legend>Required checkpoint</legend>
            <label htmlFor="journey-required-visibility">
              <input
                id="journey-required-visibility"
                data-testid="journey-required-visibility"
                type="checkbox"
                checked={form.requiredVisibility}
                onChange={(event) => {
                  const requiredVisibility = event.target.checked;
                  setForm((currentForm) => ({
                    ...currentForm,
                    requiredVisibility,
                  }));
                  setNotice(
                    requiredVisibility
                      ? undefined
                      : {
                          tone: "blocked",
                          title: "Required visibility is missing",
                          message:
                            "A runnable journey must say what evidence has to be visible. Restore this checkpoint before saving.",
                        },
                  );
                }}
              />
              <span>
                <strong>Required visibility</strong>
                Observe the {role === "TEACHER" ? "assignment publish" : "submission"} request and link every fictional field to it.
              </span>
            </label>
          </fieldset>

          <div className="journey-save-row">
            <div>
              <strong>{current ? `Append version ${current.version.version + 1}` : "Create version 1"}</strong>
              <span>Saving creates a new immutable record. Earlier bytes are preserved.</span>
            </div>
            <button
              className="primary-button"
              data-testid="save-journey"
              type="submit"
              disabled={!canSave || saving}
            >
              {saving
                ? "Saving immutable version…"
                : current
                  ? `Save version ${current.version.version + 1}`
                  : "Save named journey"}
            </button>
          </div>
        </form>

        <aside className="journey-proof-column">
          <section className="journey-current" data-testid="current-journey">
            <div className="journey-card-heading">
              <span>02</span>
              <div>
                <p className="eyebrow">Current saved version</p>
                <h3>{roleLabels[role]} journey</h3>
              </div>
            </div>
            {current ? (
              <>
                <div className="journey-current-status">
                  <span className="runnable-badge">{current.readiness.status}</span>
                  <strong>Version {current.version.version}</strong>
                </div>
                <h4>{current.version.name}</h4>
                <p>{current.version.goal}</p>
                <dl>
                  <div>
                    <dt>Actor</dt>
                    <dd>{persona?.displayName ?? roleLabels[role]}</dd>
                  </div>
                  <div>
                    <dt>Steps</dt>
                    <dd>{current.version.steps.length}</dd>
                  </div>
                  <div>
                    <dt>Required checkpoints</dt>
                    <dd>
                      {current.version.checkpoints.filter((checkpoint) => checkpoint.required).length}
                    </dd>
                  </div>
                </dl>
              </>
            ) : (
              <p className="journey-card-empty">No saved {roleLabels[role].toLowerCase()} journey.</p>
            )}
          </section>

          <section className="journey-causal-chain" data-testid="journey-causal-chain">
            <div className="journey-card-heading">
              <span>03</span>
              <div>
                <p className="eyebrow">Why this can run</p>
                <h3>Causal chain</h3>
              </div>
            </div>
            {current ? (
              <ol>
                {current.causalLinks.map((link) => (
                  <li key={link.fieldId}>
                    <div>
                      <span>Confirmed rule</span>
                      <strong>{link.requirementText ?? "Linked rule unavailable"}</strong>
                    </div>
                    <span className="causal-arrow" aria-hidden="true">→</span>
                    <div>
                      <span>Fictional field · {link.sourceField}</span>
                      <code>{sourceValue(persona, link.sourceField)}</code>
                    </div>
                    <span className="causal-arrow" aria-hidden="true">→</span>
                    <div>
                      <span>Required visibility</span>
                      <strong>{link.checkpointIds.join(", ")}</strong>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="journey-card-empty">
                Save a journey to record rule → fictional field → required checkpoint links.
              </p>
            )}
          </section>
        </aside>
      </div>

      <section className="journey-history" data-testid="journey-version-history">
        <header>
          <div>
            <p className="eyebrow">Immutable journey history</p>
            <h3>{roleLabels[role]} versions</h3>
          </div>
          <span>{history.length} stored</span>
        </header>
        {history.length > 0 ? (
          <div className="journey-history-list">
            {history.map((journey) => (
              <article key={journey.version.id} data-journey-version={journey.version.version}>
                <div>
                  <span>Version {journey.version.version}</span>
                  <strong>{journey.version.name}</strong>
                  <p>{journey.version.goal}</p>
                </div>
                <div>
                  <span className="runnable-badge">{journey.readiness.status}</span>
                  <time dateTime={journey.version.createdAt}>
                    {isoLabel(journey.version.createdAt)} UTC
                  </time>
                  <code>{journey.version.id}</code>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="journey-history-empty">No named journey version is stored for this role.</p>
        )}
        <div className="journey-execution-history" data-testid="journey-future-state">
          <article data-testid="deterministic-replay-history">
            <span>Deterministic replay history</span>
            <strong>No replay run recorded for this journey.</strong>
            <p>A saved journey is a test specification. It is not evidence that a browser replay ran or passed.</p>
          </article>
          <article data-testid="model-repair-history">
            <span>Model-assisted repair history</span>
            <strong>No repair draft recorded for this journey.</strong>
            <p>A model repair cannot become active until a person reviews it and the required checkpoint is observed again.</p>
          </article>
          <footer>
            No successful browser run is recorded. These empty histories do not mean the journey passed.
          </footer>
        </div>
      </section>
    </section>
  );
}
