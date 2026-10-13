"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { credentialCounts } from "./settings-state";

type Agent = {
  agent_id: string;
  display_name: string;
  disabled_at: string | null;
  tokens: Array<{ token_id: string; created_at: string; revoked_at: string | null }>;
};
type Price = { model: string; input_per_million: number; output_per_million: number };
type Reveal = { name: string; token: string };

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error("Request failed");
  return (await response.json()) as T;
}

export function SettingsPanel() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [prices, setPrices] = useState<Price[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [agentName, setAgentName] = useState("");
  const [model, setModel] = useState("");
  const [inputRate, setInputRate] = useState("");
  const [outputRate, setOutputRate] = useState("");
  const [editing, setEditing] = useState(false);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [copyStatus, setCopyStatus] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const agentInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const responses = await Promise.all([
        fetch("/v1/settings/agents", { cache: "no-store" }).then(json<{ agents: Agent[] }>),
        fetch("/v1/settings/prices", { cache: "no-store" }).then(json<{ prices: Price[] }>),
      ]);
      setAgents(responses[0].agents);
      setPrices(responses[1].prices);
    } catch {
      setError("Settings could not be loaded. Check the local server and retry.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (reveal && dialogRef.current && !dialogRef.current.open) dialogRef.current.showModal();
  }, [reveal]);

  function closeReveal() {
    setReveal(null);
    setCopyStatus("");
    window.requestAnimationFrame(() => agentInputRef.current?.focus());
  }

  async function createAgent(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    try {
      const result = await json<{ agent: { display_name: string }; token: string }>(
        await fetch("/v1/settings/agents", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ display_name: agentName }),
        }),
      );
      setAgentName("");
      setReveal({ name: result.agent.display_name, token: result.token });
      await load();
    } catch {
      setMessage("Agent could not be created. Check its name and retry.");
    }
  }

  async function revoke(tokenId: string, name: string) {
    if (
      !window.confirm(
        "Revoke a credential for " + name + "? Clients using it can no longer report events.",
      )
    )
      return;
    try {
      await json(
        await fetch("/v1/settings/tokens/" + encodeURIComponent(tokenId), { method: "DELETE" }),
      );
      setMessage("Credential revoked for " + name + ".");
      await load();
    } catch {
      setMessage("Credential for " + name + " could not be revoked. Retry the action.");
    }
  }

  async function savePrice(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = Number(inputRate);
    const output = Number(outputRate);
    if (
      !model.trim() ||
      !Number.isFinite(input) ||
      input < 0 ||
      !Number.isFinite(output) ||
      output < 0
    ) {
      setMessage("Enter a model name and non-negative rates for both token types.");
      return;
    }
    try {
      await json(
        await fetch("/v1/settings/prices", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            model: model.trim(),
            input_per_million: input,
            output_per_million: output,
          }),
        }),
      );
      setMessage("Price saved for " + model.trim() + ".");
      setModel("");
      setInputRate("");
      setOutputRate("");
      setEditing(false);
      await load();
    } catch {
      setMessage("Price for " + model.trim() + " could not be saved. Check the values and retry.");
    }
  }

  async function deletePrice(name: string) {
    if (
      !window.confirm(
        "Delete the configured price for " +
          name +
          "? Existing cost estimates will become unavailable.",
      )
    )
      return;
    try {
      await json(
        await fetch("/v1/settings/prices/" + encodeURIComponent(name), { method: "DELETE" }),
      );
      setMessage("Price deleted for " + name + ".");
      await load();
    } catch {
      setMessage("Price for " + name + " could not be deleted. Retry the action.");
    }
  }

  async function copyToken() {
    if (!reveal) return;
    try {
      await navigator.clipboard.writeText(reveal.token);
      setCopyStatus("Token copied. Close this dialog to clear it.");
    } catch {
      const input = dialogRef.current?.querySelector<HTMLInputElement>("#token-value");
      input?.focus();
      input?.select();
      setCopyStatus("Clipboard unavailable. The token is selected so you can copy it manually.");
    }
  }

  return (
    <section aria-labelledby="settings-title">
      <div className="page-heading settings-page-heading">
        <div>
          <p className="eyebrow">Local configuration</p>
          <h1 id="settings-title" tabIndex={-1}>
            Settings
          </h1>
          <p className="lede">Manage agent credentials and model prices on this computer.</p>
        </div>
      </div>
      {message && (
        <p className="settings-message" role="status" aria-live="polite">
          {message}
        </p>
      )}
      {error && (
        <p className="settings-message error-message" role="alert">
          {error}{" "}
          <button className="text-button" type="button" onClick={() => void load()}>
            Retry loading Settings
          </button>
        </p>
      )}
      {loading && (
        <p className="settings-message" role="status">
          Loading Settings…
        </p>
      )}
      {!loading && !error && (
        <div className="settings-content">
          <section className="settings-section" aria-labelledby="agents-title">
            <div className="section-heading">
              <div>
                <h2 id="agents-title">Agents</h2>
                <p>Each agent has a private credential. The credential is shown only once.</p>
              </div>
            </div>
            <form className="inline-form" onSubmit={createAgent}>
              <label>
                <span>Agent name</span>
                <input
                  ref={agentInputRef}
                  value={agentName}
                  onChange={(event) => setAgentName(event.target.value)}
                  required
                  minLength={1}
                  maxLength={100}
                  autoComplete="off"
                />
              </label>
              <button className="primary-button" type="submit">
                Create agent
              </button>
            </form>
            {agents.length === 0 ? (
              <p className="empty-list">
                No agents yet. Create an agent to issue a credential for the local bridge.
              </p>
            ) : (
              <div className="settings-list">
                {agents.map((agent) => {
                  const { active, revoked } = credentialCounts(agent.tokens);
                  return (
                    <article className="settings-row" key={agent.agent_id}>
                      <div>
                        <h3>{agent.display_name}</h3>
                        <p>
                          {agent.disabled_at ? "Disabled" : "Active"} · {active} active · {revoked}{" "}
                          revoked credential
                          {revoked === 1 ? "" : "s"}
                        </p>
                      </div>
                      <div className="row-actions">
                        {agent.tokens
                          .filter((token) => !token.revoked_at)
                          .map((token) => (
                            <button
                              className="secondary-button"
                              type="button"
                              key={token.token_id}
                              aria-label={`Revoke credential for ${agent.display_name}`}
                              onClick={() => void revoke(token.token_id, agent.display_name)}
                            >
                              Revoke credential
                            </button>
                          ))}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <section className="settings-section" aria-labelledby="connection-title">
            <div className="section-heading">
              <div>
                <h2 id="connection-title">MCP connection</h2>
                <p>
                  Codex is the current connection target; end-to-end setup has not been verified
                  yet.
                </p>
              </div>
            </div>
            <p className="support-copy">
              Use the stdio bridge with the tracker URL and selected agent credential supplied
              through environment variables. Keep credentials out of repository files.
            </p>
            <pre className="setup-code">
              <code>
                {
                  '[mcp_servers.ai-task-board]\ncommand = "node"\nargs = ["dist/integrations/mcp/index.js"]\ncwd = "/absolute/path/to/Task Tracker Kanban"\nenv = { AI_TASK_BOARD_URL = "http://127.0.0.1:4317" }\nenv_vars = ["AI_TASK_BOARD_TOKEN"]'
                }
              </code>
            </pre>
            <p className="support-copy">
              Merge this example into project-level client settings yourself, replace the working
              directory, and provide the token through the launching environment. Claude and
              Antigravity are future candidates, not verified clients.
            </p>
          </section>

          <section className="settings-section" aria-labelledby="prices-title">
            <div className="section-heading">
              <div>
                <h2 id="prices-title">Model prices</h2>
                <p>
                  Rates estimate cost from reported token usage. No currency is defined; estimates
                  use the configured rate units.
                </p>
              </div>
            </div>
            <form className="inline-form price-form" onSubmit={savePrice}>
              <label>
                <span>Model name</span>
                <input
                  id="price-model"
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                  required
                  maxLength={200}
                  autoComplete="off"
                  readOnly={editing}
                />
              </label>
              <label>
                <span>Input rate / 1M tokens</span>
                <input
                  value={inputRate}
                  onChange={(event) => setInputRate(event.target.value)}
                  type="number"
                  min="0"
                  step="any"
                  required
                />
              </label>
              <label>
                <span>Output rate / 1M tokens</span>
                <input
                  value={outputRate}
                  onChange={(event) => setOutputRate(event.target.value)}
                  type="number"
                  min="0"
                  step="any"
                  required
                />
              </label>
              <button className="primary-button" type="submit">
                {editing ? "Update price" : "Save price"}
              </button>
              {editing && (
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => {
                    setEditing(false);
                    setModel("");
                    setInputRate("");
                    setOutputRate("");
                  }}
                >
                  Cancel edit
                </button>
              )}
            </form>
            {prices.length === 0 ? (
              <p className="empty-list">
                No model prices configured. Cost estimates will say “No price” until a rate is
                added.
              </p>
            ) : (
              <div className="settings-list">
                {prices.map((price) => (
                  <article className="settings-row" key={price.model}>
                    <div>
                      <h3>{price.model}</h3>
                      <p>
                        Input {price.input_per_million} · Output {price.output_per_million} rate
                        units per 1M tokens
                      </p>
                    </div>
                    <div className="row-actions">
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => {
                          setEditing(true);
                          setModel(price.model);
                          setInputRate(String(price.input_per_million));
                          setOutputRate(String(price.output_per_million));
                          document.querySelector<HTMLInputElement>("#price-model")?.focus();
                        }}
                      >
                        Edit
                      </button>
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => void deletePrice(price.model)}
                      >
                        Delete
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
      <dialog
        ref={dialogRef}
        className="token-dialog"
        aria-labelledby="token-dialog-title"
        onCancel={(event) => {
          event.preventDefault();
          dialogRef.current?.close();
          closeReveal();
        }}
        onClose={closeReveal}
      >
        <form method="dialog" className="dialog-form">
          <button className="dialog-close" type="submit" aria-label="Close credential dialog">
            ×
          </button>
        </form>
        <p className="eyebrow">Shown once · {reveal?.name}</p>
        <h2 id="token-dialog-title">Copy this agent token</h2>
        <p id="token-dialog-help" className="support-copy">
          This token cannot be shown again. Copy it now and store it in your MCP client's
          environment or secret store.
        </p>
        <label className="token-field">
          <span>Agent token</span>
          <input
            id="token-value"
            value={reveal?.token ?? ""}
            readOnly
            aria-describedby="token-dialog-help"
            onFocus={(event) => event.currentTarget.select()}
          />
        </label>
        <div className="dialog-actions">
          <button className="primary-button" type="button" onClick={() => void copyToken()}>
            Copy token
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => dialogRef.current?.close()}
          >
            Close and clear
          </button>
        </div>
        <p role="status" aria-live="polite">
          {copyStatus}
        </p>
      </dialog>
    </section>
  );
}
