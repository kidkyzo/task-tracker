"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { TaskProjection, TaskStatus } from "@/server/types";
import {
  costEstimateLabel,
  elapsedLifetimeLabel,
  tokenUsageLabel,
} from "@/server/events/task-display";
import { findTaskByIdentity } from "./board-state";
import { parseThemePreference } from "./theme";

type BoardTask = TaskProjection & { agent_name: string };
type BoardProject = { project_id: string; name: string };
type TaskEvent = {
  event_id: string;
  event: string;
  source: string;
  ts: string;
  ts_inferred: boolean;
  attempt: number;
  step: string | null;
  plan: Array<{ text: string; status: string }> | null;
  progress: number | null;
  reason: string | null;
  summary: string | null;
  error: string | null;
  token_reset: boolean;
};
type DetailTask = BoardTask & { events: TaskEvent[] };
type Lane = Exclude<TaskStatus, null>;
const lanes: Lane[] = ["queued", "ongoing", "blocked", "done", "failed"];
const laneLabels: Record<Lane, string> = {
  queued: "Queued",
  ongoing: "Ongoing",
  blocked: "Blocked",
  done: "Done",
  failed: "Failed",
};

function taskKey(task: Pick<BoardTask, "agent_id" | "task_id">): string {
  return `${task.agent_id}\u0000${task.task_id}`;
}

function relativeTime(value: string | null): string {
  if (!value) return "Waiting for first report";
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "Report time unavailable";
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return "Reported just now";
  if (seconds < 3600) return `Reported ${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `Reported ${Math.floor(seconds / 3600)}h ago`;
  return `Reported ${Math.floor(seconds / 86400)}d ago`;
}

function statusLabel(status: TaskStatus): string {
  return status ? laneLabels[status] : "Status unavailable";
}

function TaskCard({
  task,
  projects,
  projectId,
  onOpen,
  onMove,
}: {
  task: BoardTask;
  projects: BoardProject[];
  projectId: string | null;
  onOpen: (task: BoardTask, button: HTMLButtonElement) => void;
  onMove: (task: BoardTask, projectId: string | null) => void;
}) {
  return (
    <article className={`task-card status-${task.status ?? "unknown"}`}>
      <div className="task-card-heading">
        <h3>{task.title || "Untitled task"}</h3>
        <span className={`status-badge status-${task.status ?? "unknown"}`}>
          {statusLabel(task.status)}
        </span>
      </div>
      <p className="task-meta">
        {task.agent_name}
        {task.model ? ` · ${task.model}` : ""}
      </p>
      <p className="task-step">{task.step || "No step reported."}</p>
      {task.progress !== null && (
        <p className="task-progress">Reported progress: {task.progress}%</p>
      )}
      <p className="task-foot">{relativeTime(task.updated_at)}</p>
      <div className="task-metrics">
        <span className="task-metric">Elapsed lifetime: {elapsedLifetimeLabel(task)}</span>
        <span className="task-metric">{tokenUsageLabel(task)}</span>
        <span className="task-metric">{costEstimateLabel(task)}</span>
      </div>
      <label className="task-project-control">
        <span>Project</span>
        <select
          value={projectId ?? ""}
          aria-label={`Move ${task.title || "Untitled task"} to a project`}
          onChange={(event) => onMove(task, event.target.value || null)}
        >
          <option value="">Unassigned</option>
          {projects.map((project) => (
            <option key={project.project_id} value={project.project_id}>
              {project.name}
            </option>
          ))}
        </select>
      </label>
      <button
        className="history-button"
        type="button"
        aria-label={`View task history for ${task.title || "Untitled task"}, ${task.agent_name}`}
        onClick={(event) => onOpen(task, event.currentTarget)}
      >
        View task history
      </button>
    </article>
  );
}

export function BoardClient() {
  const [tasks, setTasks] = useState<BoardTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [readError, setReadError] = useState("");
  const [connected, setConnected] = useState(false);
  const [receivedSnapshot, setReceivedSnapshot] = useState(false);
  const [agentFilter, setAgentFilter] = useState("all");
  const [modelFilter, setModelFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [projects, setProjects] = useState<BoardProject[]>([]);
  const [activeProject, setActiveProject] = useState("all");
  const [projectError, setProjectError] = useState("");
  const [mobileLane, setMobileLane] = useState<Lane>("ongoing");
  const [view, setView] = useState<"projects" | "board">("projects");
  const [theme, setTheme] = useState<"system" | "light" | "dark">("system");
  const [themeReady, setThemeReady] = useState(false);
  const [systemTheme, setSystemTheme] = useState<"light" | "dark">("light");
  const [announcement, setAnnouncement] = useState("");
  const [detail, setDetail] = useState<DetailTask | null>(null);
  const [detailError, setDetailError] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const [clockTick, setClockTick] = useState(0);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const detailBodyRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const detailRequestRef = useRef(0);
  const detailRef = useRef<DetailTask | null>(null);
  const detailScrollTopRef = useRef(0);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch("/v1/dashboard/projects", { cache: "no-store" });
        if (!response.ok) throw new Error("Project list could not be loaded.");
        const result = (await response.json()) as { projects: BoardProject[] };
        if (active) setProjects(result.projects);
      } catch {
        if (active)
          setProjectError("Project data could not be loaded. Check the local server and retry.");
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    try {
      setTheme(parseThemePreference(localStorage.getItem("ai-task-board-theme")));
    } catch {
      // The system theme remains available when local storage is disabled.
    } finally {
      setThemeReady(true);
    }
  }, []);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystemTheme(preference.matches ? "dark" : "light");
    update();
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!themeReady) return;
    if (theme === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("ai-task-board-theme", theme);
    } catch {
      // Theme changes still apply for the current page.
    }
  }, [theme, themeReady]);

  useEffect(() => {
    const timer = window.setInterval(() => setClockTick((tick) => tick + 1), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    detailRef.current = detail;
  }, [detail]);

  const loadTasks = useCallback(async () => {
    try {
      const response = await fetch("/v1/dashboard/tasks", { cache: "no-store" });
      if (!response.ok) throw new Error("Task list could not be loaded.");
      const result = (await response.json()) as { tasks: BoardTask[] };
      setTasks(result.tasks);
      setReadError("");
      setLoading(false);
    } catch {
      setReadError("Task data could not be loaded. Check the local server and retry.");
      setLoading(false);
    }
  }, []);

  const loadDetail = useCallback((task: BoardTask) => {
    const requestId = ++detailRequestRef.current;
    detailScrollTopRef.current = detailBodyRef.current?.scrollTop ?? 0;
    setDetailLoading(true);
    setDetailError("");
    const key = taskKey(task);
    void fetch(
      `/v1/dashboard/tasks/${encodeURIComponent(task.agent_id)}/${encodeURIComponent(task.task_id)}`,
      { cache: "no-store" },
    )
      .then(async (response) => {
        if (!response.ok) throw new Error("Task history could not be loaded.");
        const result = (await response.json()) as { task: DetailTask };
        if (requestId !== detailRequestRef.current || taskKey(result.task) !== key) return;
        setDetail(result.task);
      })
      .catch(() => {
        if (requestId === detailRequestRef.current)
          setDetailError("Task history could not be loaded. Retry to try again.");
      })
      .finally(() => {
        if (requestId === detailRequestRef.current) setDetailLoading(false);
      });
  }, []);

  useEffect(() => {
    void loadTasks();
    const stream = new EventSource("/v1/stream");
    stream.onopen = () => setConnected(true);
    stream.onerror = () => setConnected(false);
    stream.addEventListener("snapshot", (event) => {
      const snapshot = JSON.parse((event as MessageEvent<string>).data) as BoardTask[];
      setTasks(snapshot);
      setReceivedSnapshot(true);
      setLoading(false);
      setReadError("");
      const current = detailRef.current;
      const latest = current && findTaskByIdentity(snapshot, current);
      if (latest) loadDetail(latest);
    });
    stream.addEventListener("task.updated", (event) => {
      const update = JSON.parse((event as MessageEvent<string>).data) as { task: BoardTask };
      setTasks((current) => {
        const key = taskKey(update.task);
        const existing = current.find((task) => taskKey(task) === key);
        if (existing && existing.status !== update.task.status) {
          setAnnouncement(
            `${update.task.title || "A task"} moved to ${statusLabel(update.task.status)}.`,
          );
        } else if (!existing) {
          setAnnouncement(`${update.task.title || "A task"} was reported.`);
        }
        return [update.task, ...current.filter((task) => taskKey(task) !== key)];
      });
      setReceivedSnapshot(true);
      const current = detailRef.current;
      if (current && taskKey(current) === taskKey(update.task)) loadDetail(update.task);
    });
    stream.addEventListener("projects.snapshot", (event) => {
      setProjects(JSON.parse((event as MessageEvent<string>).data) as BoardProject[]);
    });
    stream.addEventListener("projects.updated", (event) => {
      const update = JSON.parse((event as MessageEvent<string>).data) as {
        projects: BoardProject[];
      };
      setProjects(update.projects);
    });
    stream.addEventListener("task.project_updated", (event) => {
      const update = JSON.parse((event as MessageEvent<string>).data) as { task: BoardTask };
      setTasks((current) =>
        current.map((task) => (taskKey(task) === taskKey(update.task) ? update.task : task)),
      );
    });
    return () => stream.close();
  }, [loadTasks, loadDetail]);

  const agents = useMemo(() => [...new Set(tasks.map((task) => task.agent_name))].sort(), [tasks]);
  const models = useMemo(
    () =>
      [
        ...new Set(
          tasks.map((task) => task.model).filter((model): model is string => Boolean(model)),
        ),
      ].sort(),
    [tasks],
  );
  const filteredTasks = useMemo(
    () =>
      tasks.filter(
        (task) =>
          (agentFilter === "all" || task.agent_name === agentFilter) &&
          (modelFilter === "all" || task.model === modelFilter) &&
          (statusFilter === "all" || task.status === statusFilter),
      ),
    [tasks, agentFilter, modelFilter, statusFilter],
  );
  const visibleTasks = useMemo(
    () =>
      filteredTasks.filter((task) => {
        const projectId = task.project_id;
        if (activeProject === "all") return true;
        if (activeProject === "unassigned") return !projectId;
        return projectId === activeProject;
      }),
    [filteredTasks, activeProject],
  );
  const hasFilters = agentFilter !== "all" || modelFilter !== "all" || statusFilter !== "all";

  function resetFilters() {
    setAgentFilter("all");
    setModelFilter("all");
    setStatusFilter("all");
  }

  async function moveTask(task: BoardTask, projectId: string | null) {
    try {
      const response = await fetch(
        `/v1/dashboard/tasks/${encodeURIComponent(task.agent_id)}/${encodeURIComponent(task.task_id)}/project`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ project_id: projectId }),
        },
      );
      if (!response.ok) throw new Error("Task could not be moved.");
      const result = (await response.json()) as { task: BoardTask };
      setTasks((current) =>
        current.map((item) => (taskKey(item) === taskKey(result.task) ? result.task : item)),
      );
      const destination =
        projects.find((project) => project.project_id === projectId)?.name ?? "Unassigned";
      setAnnouncement(`${task.title || "Task"} moved to ${destination}.`);
    } catch {
      setProjectError("Task could not be moved. Check the local server and retry.");
    }
  }

  function openDetail(task: BoardTask, button: HTMLButtonElement) {
    openerRef.current = button;
    detailScrollTopRef.current = 0;
    setDetail({ ...task, events: [] });
    setDetailError("");
    dialogRef.current?.showModal();
    window.requestAnimationFrame(() =>
      dialogRef.current?.querySelector<HTMLButtonElement>(".dialog-close")?.focus(),
    );
    loadDetail(task);
  }

  function closeDetail() {
    detailRequestRef.current++;
    dialogRef.current?.close();
    setDetail(null);
    setDetailError("");
    window.requestAnimationFrame(() => {
      const opener = openerRef.current;
      if (opener?.isConnected && opener.getClientRects().length > 0) opener.focus();
      else document.querySelector<HTMLElement>("#page-title")?.focus();
    });
  }

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    const body = detailBodyRef.current;
    if (!dialog || !body || !detail) return;
    body.scrollTop = detailScrollTopRef.current;
  }, [detail]);

  const laneCounts = useMemo(
    () =>
      Object.fromEntries(
        lanes.map((lane) => [lane, visibleTasks.filter((task) => task.status === lane).length]),
      ) as Record<Lane, number>,
    [visibleTasks, clockTick],
  );
  const unknownTasks = visibleTasks.filter((task) => task.status === null);
  const effectiveTheme = theme === "system" ? systemTheme : theme;
  const projectTasks = (projectId: string) =>
    tasks.filter((task) => {
      const assignedProject = task.project_id;
      return projectId === "unassigned" ? !assignedProject : assignedProject === projectId;
    });
  const projectTaskCount = (projectId: string, status: Lane) =>
    projectTasks(projectId).filter((task) => task.status === status).length;
  const projectLastUpdated = (projectId: string) => {
    const latest = projectTasks(projectId)
      .map((task) => task.updated_at)
      .filter((value): value is string => Boolean(value))
      .sort((left, right) => Date.parse(right) - Date.parse(left))[0];
    return relativeTime(latest ?? null).replace("Reported ", "");
  };

  function openProject(projectId: string) {
    setActiveProject(projectId);
    setAgentFilter("all");
    setModelFilter("all");
    setStatusFilter("all");
    setView("board");
  }

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to tasks
      </a>
      <header className="topbar">
        <a className="brand" href="/" aria-label="AI Task Board home">
          <span className="brand-mark" aria-hidden="true">
            AT
          </span>
          <span>AI Task Board</span>
        </a>
        <nav className="primary-nav" aria-label="Main navigation">
          <button
            className="nav-item"
            type="button"
            aria-current={view === "projects" ? "page" : undefined}
            onClick={() => setView("projects")}
          >
            Projects
          </button>
        </nav>
        <div className="topbar-actions">
          <p
            className="connection"
            data-state={connected ? "live" : "paused"}
            role="status"
            aria-live="polite"
          >
            <span className="connection-dot" aria-hidden="true" />
            {connected ? "Live updates connected" : "Reconnecting to live updates"}
          </p>
          <button
            className="theme-toggle"
            type="button"
            aria-label={`Switch to ${effectiveTheme === "dark" ? "light" : "dark"} theme`}
            onClick={() => setTheme(effectiveTheme === "dark" ? "light" : "dark")}
          >
            <span aria-hidden="true">◐</span>
            <span>Theme</span>
          </button>
        </div>
      </header>

      <main id="main" className="page-shell">
        {view === "projects" ? (
          <section className="projects-page" aria-labelledby="page-title">
            <div className="page-heading projects-page-heading">
              <div>
                <p className="eyebrow">Workspace</p>
                <h1 id="page-title" tabIndex={-1}>
                  Projects
                </h1>
                <p className="lede">Choose a project to see the tasks reported for it.</p>
              </div>
              <p className="freshness">
                {receivedSnapshot
                  ? `Updated ${relativeTime(tasks[0]?.updated_at ?? null).replace("Reported ", "")}`
                  : "Waiting for the first task snapshot"}
              </p>
            </div>
            <section className="project-list-panel" aria-label="Project list">
              <div className="project-list-toolbar">
                <p className="project-list-label">Projects</p>
              </div>
              {projectError && (
                <p className="project-error" role="alert">
                  {projectError}
                </p>
              )}
              <p className="project-help">
                Projects and task assignments are shared by the local board and connected agents.
              </p>
              <div className="project-table-wrap">
                <table className="project-table">
                  <thead>
                    <tr>
                      <th scope="col">Project</th>
                      <th scope="col">Updated</th>
                      {lanes.map((lane) => (
                        <th scope="col" key={lane}>
                          {laneLabels[lane]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {projects.map((project) => (
                      <tr key={project.project_id}>
                        <th scope="row">
                          <button
                            className="project-open-button"
                            type="button"
                            onClick={() => openProject(project.project_id)}
                          >
                            {project.name}
                          </button>
                        </th>
                        <td>{projectLastUpdated(project.project_id)}</td>
                        {lanes.map((lane) => (
                          <td key={lane}>{projectTaskCount(project.project_id, lane)}</td>
                        ))}
                      </tr>
                    ))}
                    {projectTasks("unassigned").length > 0 && (
                      <tr>
                        <th scope="row">
                          <button
                            className="project-open-button"
                            type="button"
                            onClick={() => openProject("unassigned")}
                          >
                            Unassigned
                          </button>
                        </th>
                        <td>{projectLastUpdated("unassigned")}</td>
                        {lanes.map((lane) => (
                          <td key={lane}>{projectTaskCount("unassigned", lane)}</td>
                        ))}
                      </tr>
                    )}
                    {projects.length === 0 && projectTasks("unassigned").length === 0 && (
                      <tr>
                        <td className="project-empty" colSpan={lanes.length + 2}>
                          No projects yet. A connected agent will register its project when it
                          starts work.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </section>
        ) : view === "board" ? (
          <>
            <section className="page-heading" aria-labelledby="page-title">
              <div>
                <button
                  className="project-back-link"
                  type="button"
                  onClick={() => setView("projects")}
                >
                  ‹ Projects
                </button>
                <p className="eyebrow">Project board</p>
                <h1 id="page-title" tabIndex={-1}>
                  {activeProject === "unassigned"
                    ? "Unassigned tasks"
                    : (projects.find((project) => project.project_id === activeProject)?.name ??
                      "Project")}
                </h1>
                <p className="lede">Tasks reported for this project.</p>
              </div>
              <p className="freshness">
                {receivedSnapshot
                  ? `Updated ${relativeTime(tasks[0]?.updated_at ?? null).replace("Reported ", "")}`
                  : "Waiting for the first task snapshot"}
              </p>
            </section>
            <section className="filters" aria-label="Task filters">
              <label>
                <span>Agent</span>
                <select
                  value={agentFilter}
                  onChange={(event) => setAgentFilter(event.target.value)}
                >
                  <option value="all">All agents</option>
                  {agents.map((agent) => (
                    <option key={agent}>{agent}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Model</span>
                <select
                  value={modelFilter}
                  onChange={(event) => setModelFilter(event.target.value)}
                >
                  <option value="all">All models</option>
                  {models.map((model) => (
                    <option key={model}>{model}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Status</span>
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                >
                  <option value="all">All statuses</option>
                  {lanes.map((lane) => (
                    <option key={lane} value={lane}>
                      {laneLabels[lane]}
                    </option>
                  ))}
                </select>
              </label>
              {hasFilters && (
                <button className="clear-filters" type="button" onClick={resetFilters}>
                  Clear filters
                </button>
              )}
            </section>
            {readError && (
              <p className="board-message error-message" role="alert">
                {readError}{" "}
                <button className="text-button" type="button" onClick={() => void loadTasks()}>
                  Retry
                </button>
              </p>
            )}
            {loading && (
              <p className="board-message" role="status">
                Loading tasks…
              </p>
            )}
            {!loading && tasks.length === 0 && !readError && (
              <p className="board-message" role="status">
                No tasks reported yet.
              </p>
            )}
            {!loading && tasks.length > 0 && visibleTasks.length === 0 && (
              <p className="board-message" role="status">
                {hasFilters ? (
                  <>
                    No tasks match these filters.{" "}
                    <button className="text-button" type="button" onClick={resetFilters}>
                      Clear filters
                    </button>
                  </>
                ) : (
                  <>
                    No tasks are assigned to this project yet. Move a task here from another project
                    board.
                  </>
                )}
              </p>
            )}
            <div className="mobile-lane-picker">
              <label htmlFor="mobile-lane">Status</label>
              <select
                id="mobile-lane"
                value={mobileLane}
                onChange={(event) => setMobileLane(event.target.value as Lane)}
              >
                {lanes.map((lane) => (
                  <option key={lane} value={lane}>
                    {laneLabels[lane]} ({laneCounts[lane]})
                  </option>
                ))}
              </select>
            </div>
            <section
              className="board"
              data-mobile-lane={mobileLane}
              aria-label="Tasks by status"
              aria-busy={loading}
            >
              {lanes.map((lane) => (
                <section
                  className="lane"
                  data-lane={lane}
                  key={lane}
                  aria-labelledby={`lane-${lane}`}
                >
                  <div className="lane-heading">
                    <h2 id={`lane-${lane}`}>{laneLabels[lane]}</h2>
                    <span className="lane-count">{laneCounts[lane]}</span>
                  </div>
                  <div className="lane-tasks">
                    {visibleTasks
                      .filter((task) => task.status === lane)
                      .map((task) => (
                        <TaskCard
                          key={taskKey(task)}
                          task={task}
                          projects={projects}
                          projectId={task.project_id}
                          onOpen={openDetail}
                          onMove={moveTask}
                        />
                      ))}
                  </div>
                </section>
              ))}
            </section>
            {unknownTasks.length > 0 && (
              <section className="unknown-tasks" aria-labelledby="unknown-title">
                <h2 id="unknown-title">Status unavailable</h2>
                <p>These events are recorded, but the board has no recognized status for them.</p>
                <div className="unknown-list">
                  {unknownTasks.map((task) => (
                    <TaskCard
                      key={taskKey(task)}
                      task={task}
                      projects={projects}
                      projectId={task.project_id}
                      onOpen={openDetail}
                      onMove={moveTask}
                    />
                  ))}
                </div>
              </section>
            )}
            <p className="visually-hidden" aria-live="polite" aria-atomic="true">
              {announcement}
            </p>
          </>
        ) : null}
      </main>
      <footer className="footer">
        <span>Runs on this computer</span>
        <span>Work is reported by agents; the board does not control them.</span>
      </footer>

      <dialog
        ref={dialogRef}
        className="task-dialog"
        aria-labelledby="task-dialog-title"
        onCancel={(event) => {
          event.preventDefault();
          closeDetail();
        }}
      >
        <div className="task-dialog-header">
          <div>
            <p className="eyebrow">Task history</p>
            <h2 id="task-dialog-title">{detail?.title || "Task details"}</h2>
          </div>
          <button className="secondary-button dialog-close" type="button" onClick={closeDetail}>
            Close
          </button>
        </div>
        <div className="task-dialog-body" ref={detailBodyRef}>
          {detailLoading && (
            <p className="settings-message" role="status">
              Loading task history…
            </p>
          )}
          {detailError && (
            <p className="settings-message error-message" role="alert">
              {detailError}
              <button
                className="text-button"
                type="button"
                onClick={() => detail && loadDetail(detail)}
              >
                Retry
              </button>
            </p>
          )}
          {detail && <TaskDetail task={detail} />}
          {detail && !detailLoading && !detailError && detail.events.length === 0 && (
            <p>No events reported for this task.</p>
          )}
        </div>
      </dialog>
    </>
  );
}

function TaskDetail({ task }: { task: DetailTask }) {
  const byAttempt = new Map<number, TaskEvent[]>();
  for (const event of task.events)
    byAttempt.set(event.attempt, [...(byAttempt.get(event.attempt) ?? []), event]);
  return (
    <div className="detail-content">
      <section className="detail-summary">
        <h3>Current summary</h3>
        <dl>
          <div>
            <dt>Status</dt>
            <dd>{statusLabel(task.status)}</dd>
          </div>
          <div>
            <dt>Agent</dt>
            <dd>{task.agent_name}</dd>
          </div>
          <div>
            <dt>Model</dt>
            <dd>{task.model || "Not reported"}</dd>
          </div>
          <div>
            <dt>Current step</dt>
            <dd>{task.step || "Not reported"}</dd>
          </div>
          <div>
            <dt>Progress</dt>
            <dd>{task.progress === null ? "Not reported" : `${task.progress}%`}</dd>
          </div>
          <div>
            <dt>Elapsed lifetime</dt>
            <dd>{elapsedLifetimeLabel(task)}</dd>
          </div>
          <div>
            <dt>Reported usage</dt>
            <dd>{tokenUsageLabel(task)}</dd>
          </div>
          <div>
            <dt>Estimated cost</dt>
            <dd>{costEstimateLabel(task)}</dd>
          </div>
        </dl>
      </section>
      {task.plan && task.plan.length > 0 && (
        <section>
          <h3>Plan</h3>
          <ol className="plan-list">
            {task.plan.map((step, index) => (
              <li key={`${index}-${step.text}`} data-state={step.status}>
                {step.text}
                <span>{step.status}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
      <section>
        <h3>Event history</h3>
        {[...byAttempt.entries()].map(([attempt, events]) => (
          <section className="attempt" key={attempt}>
            <h4>Attempt {attempt}</h4>
            <ol className="timeline">
              {events.map((event) => (
                <li key={event.event_id}>
                  <div className="timeline-heading">
                    <strong>{eventLabel(event.event)}</strong>
                    <time dateTime={event.ts}>
                      {new Date(event.ts).toLocaleString()}
                      {event.ts_inferred ? " · time inferred" : ""}
                    </time>
                  </div>
                  <p>
                    {event.source}
                    {event.token_reset ? " · token usage reset" : ""}
                  </p>
                  {event.step && <p>{event.step}</p>}
                  {event.reason && <p>Blocked reason: {event.reason}</p>}
                  {event.summary && <p>{event.summary}</p>}
                  {event.error && <p>Failure: {event.error}</p>}
                </li>
              ))}
            </ol>
          </section>
        ))}
      </section>
    </div>
  );
}

function eventLabel(event: string): string {
  const known = new Set([
    "task_queued",
    "task_started",
    "task_progress",
    "task_blocked",
    "task_done",
    "task_failed",
  ]);
  return known.has(event) ? event.replaceAll("_", " ") : `Unrecognized event · ${event}`;
}
