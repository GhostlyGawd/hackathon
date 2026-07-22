"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

type PersonaRole = "TEACHER" | "STUDENT";

interface Persona {
  readonly id: string;
  readonly role: PersonaRole;
  readonly displayName: string;
  readonly email: string;
  readonly fields: Readonly<Record<string, string>>;
  readonly fictionalConfirmation: {
    readonly statementVersion: "fictional-only-v1";
    readonly confirmedAt: string;
  };
  readonly scanResult: {
    readonly scannerVersion: "likely-real-v1";
    readonly outcome: "CLEAR";
    readonly findings: readonly [];
  };
}

interface Canary {
  readonly id: string;
  readonly runId: string;
  readonly personaId: string;
  readonly sourceField: string;
  readonly value: string;
  readonly generatedAt: string;
}

interface ScanFinding {
  readonly code: string;
  readonly field: string;
  readonly message: string;
}

interface ScanResult {
  readonly scannerVersion: string;
  readonly outcome: "CLEAR" | "BLOCKED";
  readonly findings: readonly ScanFinding[];
}

interface ErrorBody {
  readonly error?: {
    readonly code?: string;
    readonly message?: string;
    readonly findings?: readonly ScanFinding[];
  };
}

class SyntheticDataApiError extends Error {
  readonly code: string;
  readonly findings: readonly ScanFinding[];

  constructor(response: Response, body: ErrorBody) {
    super(body.error?.message ?? "Pactwire could not complete the request.");
    this.name = "SyntheticDataApiError";
    this.code = body.error?.code ?? `HTTP_${response.status}`;
    this.findings = body.error?.findings ?? [];
  }
}

async function request<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const body = (await response.json()) as T | ErrorBody;
  if (!response.ok) {
    throw new SyntheticDataApiError(response, body as ErrorBody);
  }
  return body as T;
}

const preparedRuns = [
  {
    id: "81818181-8181-4181-8181-818181818181",
    label: "Prepared run A",
  },
  {
    id: "82828282-8282-4282-8282-828282828282",
    label: "Prepared run B",
  },
  {
    id: "83838383-8383-4383-8383-838383838383",
    label: "Unrelated prepared run",
  },
] as const;

const roleLabels: Readonly<Record<PersonaRole, string>> = {
  TEACHER: "Teacher",
  STUDENT: "Student",
};

function sourceLabel(sourceField: string): string {
  const labels: Readonly<Record<string, string>> = {
    displayName: "Display name",
    email: "Email",
    classPhrase: "Class phrase",
    submissionPhrase: "Submission phrase",
  };
  return labels[sourceField] ?? sourceField;
}

function defaultsFor(persona: Persona): readonly string[] {
  const activity = Object.keys(persona.fields)[0];
  return activity ? ["email", activity] : ["email"];
}

export function SyntheticDataPanel({
  workspaceId,
  principalUserId,
}: {
  readonly workspaceId: string;
  readonly principalUserId: string;
}) {
  const [personas, setPersonas] = useState<readonly Persona[]>([]);
  const [role, setRole] = useState<PersonaRole>("STUDENT");
  const [displayName, setDisplayName] = useState("Nova Reed (Fictional)");
  const [email, setEmail] = useState(
    "nova.reed@student.pactwire.invalid",
  );
  const [activityField, setActivityField] = useState("submissionPhrase");
  const [activityValue, setActivityValue] = useState(
    "Fictional response about Saturn",
  );
  const [confirmed, setConfirmed] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState<string>(preparedRuns[0].id);
  const [selections, setSelections] = useState<
    Readonly<Record<string, readonly string[]>>
  >({});
  const [canaries, setCanaries] = useState<readonly Canary[]>([]);
  const [canariesByRun, setCanariesByRun] = useState<
    Readonly<Record<string, readonly Canary[]>>
  >({});
  const [notice, setNotice] = useState<{
    readonly tone: "safe" | "blocked" | "neutral";
    readonly title: string;
    readonly message: string;
    readonly findings?: readonly ScanFinding[];
  }>();
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadPersonas = useCallback(async (): Promise<readonly Persona[]> => {
    const result = await request<{ readonly personas: readonly Persona[] }>(
      `/api/workspaces/${workspaceId}/personas`,
    );
    return result.personas;
  }, [principalUserId, workspaceId]);

  const loadCanaries = useCallback(
    async (runId: string): Promise<readonly Canary[]> => {
      const result = await request<{ readonly canaries: readonly Canary[] }>(
        `/api/workspaces/${workspaceId}/runs/${runId}/canaries`,
      );
      return result.canaries;
    },
    [principalUserId, workspaceId],
  );

  useEffect(() => {
    let active = true;
    setPersonas([]);
    setSelections({});
    setCanaries([]);
    setCanariesByRun({});
    setNotice(undefined);
    setLoading(true);
    void Promise.all([loadPersonas(), loadCanaries(preparedRuns[0].id)])
      .then(([nextPersonas, nextCanaries]) => {
        if (!active) return;
        setPersonas(nextPersonas);
        setSelections(
          Object.fromEntries(
            nextPersonas.map((persona) => [persona.id, defaultsFor(persona)]),
          ),
        );
        setCanaries(nextCanaries);
        setCanariesByRun({ [preparedRuns[0].id]: nextCanaries });
      })
      .catch((error: unknown) => {
        if (!active) return;
        setNotice({
          tone: "blocked",
          title: "Fictional test data unavailable",
          message: error instanceof Error ? error.message : "Please try again.",
        });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loadCanaries, loadPersonas, principalUserId, workspaceId]);

  function clearSubmittedValues(): void {
    setDisplayName("");
    setEmail("");
    setActivityValue("");
    setConfirmed(false);
  }

  function applyRoleDefaults(nextRole: PersonaRole): void {
    setRole(nextRole);
    if (nextRole === "TEACHER") {
      setDisplayName("Mira Sol (Fictional)");
      setEmail("mira.sol@teacher.pactwire.invalid");
      setActivityField("classPhrase");
      setActivityValue("Fictional astronomy class");
    } else {
      setDisplayName("Nova Reed (Fictional)");
      setEmail("nova.reed@student.pactwire.invalid");
      setActivityField("submissionPhrase");
      setActivityValue("Fictional response about Saturn");
    }
    setConfirmed(false);
    setNotice(undefined);
  }

  async function savePersona(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!confirmed || !displayName || !email || !activityValue) return;
    setBusy(true);
    setNotice(undefined);
    const draft = {
      role,
      displayName,
      email,
      fields: { [activityField]: activityValue },
    };
    try {
      const scan = await request<{ readonly scan: ScanResult }>(
        `/api/workspaces/${workspaceId}/personas/scan`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(draft),
        },
      );
      if (scan.scan.outcome === "BLOCKED") {
        clearSubmittedValues();
        setNotice({
          tone: "blocked",
          title: "Likely real data blocked",
          message:
            "Nothing was saved. Replace each flagged field with obviously fictional data.",
          findings: scan.scan.findings,
        });
        return;
      }
      const result = await request<{ readonly persona: Persona }>(
        `/api/workspaces/${workspaceId}/personas`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...draft, confirmedFictional: true }),
        },
      );
      setPersonas((current) => [...current, result.persona]);
      setSelections((current) => ({
        ...current,
        [result.persona.id]: defaultsFor(result.persona),
      }));
      setConfirmed(false);
      setNotice({
        tone: "safe",
        title: `${roleLabels[result.persona.role]} persona saved`,
        message:
          "The server scan is clear, the .invalid address cannot receive mail, and the fictional-data attestation is recorded.",
      });
      window.dispatchEvent(new Event("pactwire:setup-progress-changed"));
    } catch (error) {
      if (error instanceof SyntheticDataApiError && error.code === "LIKELY_REAL_DATA") {
        clearSubmittedValues();
        setNotice({
          tone: "blocked",
          title: "Likely real data blocked",
          message: "Nothing was saved. Use only obviously fictional values.",
          findings: error.findings,
        });
      } else {
        setNotice({
          tone: "blocked",
          title: "Persona not saved",
          message: error instanceof Error ? error.message : "Please try again.",
        });
      }
    } finally {
      setBusy(false);
    }
  }

  function toggleSource(personaId: string, sourceField: string): void {
    setSelections((current) => {
      const selected = current[personaId] ?? [];
      const next = selected.includes(sourceField)
        ? selected.filter((field) => field !== sourceField)
        : [...selected, sourceField];
      return { ...current, [personaId]: next };
    });
  }

  async function selectRun(runId: string): Promise<void> {
    setSelectedRunId(runId);
    setNotice(undefined);
    setBusy(true);
    try {
      const next = await loadCanaries(runId);
      setCanaries(next);
      setCanariesByRun((current) => ({ ...current, [runId]: next }));
    } catch (error) {
      setCanaries([]);
      setNotice({
        tone: "blocked",
        title: "Run canaries unavailable",
        message: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function generateCanaries(): Promise<void> {
    const requestedSelections = personas
      .map((persona) => ({
        personaId: persona.id,
        sourceFields: selections[persona.id] ?? [],
      }))
      .filter((selection) => selection.sourceFields.length > 0);
    if (requestedSelections.length === 0) return;
    setBusy(true);
    setNotice(undefined);
    try {
      const result = await request<{ readonly canaries: readonly Canary[] }>(
        `/api/workspaces/${workspaceId}/runs/${selectedRunId}/canaries`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ selections: requestedSelections }),
        },
      );
      setCanaries(result.canaries);
      setCanariesByRun((current) => ({
        ...current,
        [selectedRunId]: result.canaries,
      }));
      setNotice({
        tone: "safe",
        title: "Run canaries ready",
        message: `${result.canaries.length} selected fields now have one immutable value for this prepared run.`,
      });
    } catch (error) {
      setNotice({
        tone: "blocked",
        title: "Canaries not generated",
        message: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="synthetic-panel"
      id="synthetic-data"
      data-testid="synthetic-data-panel"
      aria-busy={loading || busy}
    >
      <div className="synthetic-heading">
        <div>
          <p className="eyebrow">Synthetic test data / JRN-01</p>
          <h2>Create fictional users without real student data.</h2>
          <p>
            Pactwire blocks likely real identifiers before saving. Each selected
            fictional field then receives a different value for one prepared run.
          </p>
        </div>
        <span className="synthetic-boundary-badge">
          <span aria-hidden="true" /> .invalid addresses only
        </span>
      </div>

      <div className="real-data-warning" data-testid="real-data-warning">
        <strong>Never enter real student or teacher data.</strong>
        <span>
          Do not use real names, district email addresses, student IDs, phone
          numbers, or government identifiers. The server scans again even if a
          client bypasses this form.
        </span>
      </div>

      <div className="synthetic-layout">
        <form className="persona-form" onSubmit={(event) => void savePersona(event)}>
          <div className="synthetic-card-title">
            <span>01</span>
            <div>
              <h3>Configure one fictional user</h3>
              <p>The scan and your confirmation are stored with the persona.</p>
            </div>
          </div>
          <div className="persona-form-grid">
            <label>
              Role
              <select
                data-testid="persona-role"
                value={role}
                onChange={(event) => applyRoleDefaults(event.target.value as PersonaRole)}
              >
                <option value="STUDENT">Student</option>
                <option value="TEACHER">Teacher</option>
              </select>
            </label>
            <label>
              Clearly fictional display name
              <input
                data-testid="persona-display-name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
              />
            </label>
            <label className="persona-wide-field">
              Reserved email address
              <input
                data-testid="persona-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
              <small>Must end in .invalid and cannot receive mail.</small>
            </label>
            <label>
              Activity field
              <select
                data-testid="persona-activity-field"
                value={activityField}
                onChange={(event) => setActivityField(event.target.value)}
              >
                <option value="submissionPhrase">Submission phrase</option>
                <option value="classPhrase">Class phrase</option>
                <option value="studentId">District identifier test</option>
              </select>
            </label>
            <label>
              Obviously fictional value
              <input
                data-testid="persona-activity-value"
                value={activityValue}
                onChange={(event) => setActivityValue(event.target.value)}
              />
            </label>
          </div>
          <label className="fictional-confirmation">
            <input
              data-testid="persona-confirmation"
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            <span>
              I confirm every value above is fictional and belongs only to this
              authorized test fixture.
            </span>
          </label>
          <button
            className="primary-button"
            data-testid="save-fictional-persona"
            type="submit"
            disabled={busy || !confirmed}
          >
            Scan and save fictional user
          </button>
        </form>

        <div className="persona-records">
          <div className="synthetic-card-title">
            <span>02</span>
            <div>
              <h3>Select fields to trace</h3>
              <p>Each checked source maps to one persona and one run value.</p>
            </div>
          </div>
          <div className="persona-list" data-testid="persona-list">
            {loading ? (
              <p className="synthetic-empty">Loading fictional users…</p>
            ) : personas.length === 0 ? (
              <p className="synthetic-empty">No fictional personas saved.</p>
            ) : (
              personas.map((persona) => {
                const sources = ["email", ...Object.keys(persona.fields)];
                return (
                  <article key={persona.id} data-persona-id={persona.id}>
                    <div className="persona-record-topline">
                      <span>{roleLabels[persona.role]}</span>
                      <span>SCAN CLEAR</span>
                    </div>
                    <h4>{persona.displayName}</h4>
                    <p>{persona.email}</p>
                    <div className="persona-proof-row">
                      <span>Fictional confirmed</span>
                      <span>Reserved domain</span>
                    </div>
                    <fieldset>
                      <legend>Trace in the selected run</legend>
                      {sources.map((source) => (
                        <label key={source}>
                          <input
                            type="checkbox"
                            data-testid={`persona-source-${persona.id}-${source}`}
                            checked={(selections[persona.id] ?? []).includes(source)}
                            onChange={() => toggleSource(persona.id, source)}
                          />
                          {sourceLabel(source)}
                        </label>
                      ))}
                    </fieldset>
                  </article>
                );
              })
            )}
          </div>
        </div>
      </div>

      {notice ? (
        <div
          className={`synthetic-notice ${notice.tone}`}
          data-testid="synthetic-notice"
          role={notice.tone === "blocked" ? "alert" : "status"}
        >
          <strong>{notice.title}</strong>
          <span>{notice.message}</span>
          {notice.findings && notice.findings.length > 0 ? (
            <ul>
              {notice.findings.map((finding) => (
                <li key={`${finding.code}:${finding.field}`}>
                  {finding.field} · {finding.message}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="canary-workbench">
        <div className="canary-controls">
          <div>
            <p className="eyebrow">Run-specific mapping</p>
            <h3>Generate values for one prepared run</h3>
            <p>
              Replaying the same selection returns the existing mapping. Another
              run receives different values.
            </p>
          </div>
          <label>
            Prepared run
            <select
              data-testid="prepared-run-select"
              value={selectedRunId}
              onChange={(event) => void selectRun(event.target.value)}
            >
              {preparedRuns.map((run) => (
                <option key={run.id} value={run.id}>
                  {run.label}
                </option>
              ))}
            </select>
          </label>
          <button
            className="primary-button"
            data-testid="generate-run-canaries"
            type="button"
            disabled={busy || personas.length === 0}
            onClick={() => void generateCanaries()}
          >
            Generate canaries
          </button>
        </div>

        <div className="canary-mappings" data-testid="canary-mappings">
          {canaries.length === 0 ? (
            <div className="canary-empty" data-testid="canary-empty">
              <strong>No canaries for this prepared run</strong>
              <span>Values from other runs are not shown or reused here.</span>
            </div>
          ) : (
            canaries.map((canary) => {
              const persona = personas.find((item) => item.id === canary.personaId);
              return (
                <article
                  key={canary.id}
                  data-canary-value={canary.value}
                  data-persona-id={canary.personaId}
                  data-run-id={canary.runId}
                  data-source-field={canary.sourceField}
                >
                  <div>
                    <span>{sourceLabel(canary.sourceField)}</span>
                    <strong>{persona?.displayName ?? "Fictional persona"}</strong>
                  </div>
                  <code>{canary.value}</code>
                </article>
              );
            })
          )}
        </div>
        <p className="run-isolation-summary" data-testid="run-isolation-summary">
          {Object.entries(canariesByRun).filter(([, values]) => values.length > 0).length}
          {" prepared run mapping set(s) loaded · values are immutable and globally non-reused"}
        </p>
      </div>
    </section>
  );
}
