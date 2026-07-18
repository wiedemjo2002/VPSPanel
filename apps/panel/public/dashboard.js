const $ = (selector) => document.querySelector(selector);
const landing = $("#landingView");
const dashboard = $("#dashboardView");
const grid = $("#projectGrid");
const empty = $("#emptyState");
const deployDialog = $("#deployDialog");
const logDialog = $("#logDialog");
const formError = $("#formError");
let repositories = [];
let inspection = null;
let selectedRepository = null;
let pollingTimer = null;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || "Die Aktion ist fehlgeschlagen.");
    error.data = data;
    throw error;
  }
  return data;
}

function showError(message) {
  formError.textContent = message;
  formError.classList.remove("hidden");
}

function clearError() {
  formError.textContent = "";
  formError.classList.add("hidden");
}

function statusLabel(status) {
  return ({ online: "Online", healthy: "Online", deploying: "Wird deployed", queued: "Wartet", failed: "Fehlgeschlagen" })[status] || status;
}

function projectCard(project) {
  const card = element("article", "project-card");
  const top = element("div", "project-top");
  const nameRow = element("div", "project-name");
  const icon = element("div", "app-icon", project.name.slice(0, 1).toUpperCase());
  const titleBlock = element("div");
  titleBlock.append(element("h2", "", project.name));
  const domain = element("a", "domain-link", project.domain);
  domain.href = `https://${project.domain}`;
  domain.target = "_blank";
  domain.rel = "noreferrer";
  titleBlock.append(domain);
  nameRow.append(icon, titleBlock);
  const state = element("div", `status ${project.status}`);
  state.append(element("i", "status-dot"), document.createTextNode(statusLabel(project.status)));
  top.append(nameRow, state);

  const meta = element("div", "project-meta");
  meta.append(element("span", "", project.framework), element("span", "", `Deployment ${project.current_deployment?.slice(0, 7) || "–"}`));
  const actions = element("div", "card-actions");
  const logs = element("button", "secondary", "Logs ansehen");
  logs.addEventListener("click", () => showLogs(project.id));
  const rollback = element("button", "secondary", "Vorherige Version");
  rollback.addEventListener("click", () => rollbackProject(project.id));
  actions.append(logs, rollback);
  card.append(top, meta, actions);
  return card;
}

async function loadProjects() {
  const projects = await api("/api/projects");
  grid.replaceChildren(...projects.map(projectCard));
  empty.classList.toggle("hidden", projects.length > 0);
}

async function loadRepositories() {
  const select = $("#repositorySelect");
  select.replaceChildren(new Option("Repository wird geladen …", ""));
  repositories = await api("/api/github/repos");
  select.replaceChildren(new Option("Repository auswählen", ""), ...repositories.map((repo, index) => new Option(`${repo.fullName}${repo.private ? " · privat" : ""}`, String(index))));
}

function resetDialog() {
  clearError();
  inspection = null;
  selectedRepository = null;
  $("#repositoryStep").classList.remove("hidden");
  $("#configureStep").classList.add("hidden");
  $("#progressStep").classList.add("hidden");
  $("#dialogTitle").textContent = "Repository auswählen";
  $("#repositorySelect").value = "";
  $("#branchInput").value = "main";
  $("#domainInput").value = "";
  $("#databaseInput").checked = false;
  $("#autoDeployInput").checked = true;
  $("#environmentFields").replaceChildren();
}

async function openDeploy() {
  resetDialog();
  deployDialog.showModal();
  try { await loadRepositories(); } catch (error) { showError(error.message); }
}

function summaryLine(label, value) {
  const row = element("div");
  row.append(element("b", "", `${label}: `), document.createTextNode(value || "Automatisch"));
  return row;
}

function showInspection(result) {
  const box = $("#detectedSummary");
  const title = element("h3", "", "Wir haben Folgendes erkannt");
  const details = element("div", "detected-grid");
  details.append(summaryLine("Typ", result.framework), summaryLine("Port", String(result.port)), summaryLine("Build", result.buildCommand), summaryLine("Start", result.startCommand));
  box.replaceChildren(title, details);
  const advanced = $("#advancedSummary");
  advanced.replaceChildren(summaryLine("Paketmanager", result.packageManager), summaryLine("Migration", result.migrationCommand), summaryLine("Branch", result.branch), summaryLine("Sichtbarkeit", result.private ? "Privat" : "Öffentlich"));
  const fields = $("#environmentFields");
  fields.replaceChildren(...result.missingVariables.map((name) => {
    const label = element("label", "field");
    label.dataset.variable = name;
    label.append(element("span", "", name));
    const input = element("input");
    input.type = "password";
    input.autocomplete = "off";
    input.placeholder = "Erforderlicher Wert";
    label.append(input);
    return label;
  }));
  $("#repositoryStep").classList.add("hidden");
  $("#configureStep").classList.remove("hidden");
  $("#dialogTitle").textContent = "Deployment prüfen";
}

async function inspectSelected() {
  clearError();
  const index = $("#repositorySelect").value;
  if (index === "") return showError("Bitte wähle ein Repository aus.");
  selectedRepository = repositories[Number(index)];
  const branch = $("#branchInput").value.trim() || selectedRepository.defaultBranch;
  const button = $("#inspectButton");
  button.disabled = true;
  button.textContent = "Projekt wird analysiert …";
  try {
    inspection = await api("/api/inspect", { method: "POST", body: JSON.stringify({ owner: selectedRepository.owner, repo: selectedRepository.name, branch }) });
    showInspection(inspection);
  } catch (error) { showError(error.message); }
  finally { button.disabled = false; button.innerHTML = "Projekt analysieren <span>→</span>"; }
}

function environmentValues() {
  return Object.fromEntries([...document.querySelectorAll("#environmentFields .field")].map((field) => [field.dataset.variable, field.querySelector("input").value]));
}

function renderSteps(steps) {
  const container = $("#deploymentSteps");
  container.replaceChildren(...steps.map((step) => {
    const row = element("div", `step ${step.status}`);
    const icon = step.status === "done" ? "✓" : step.status === "failed" ? "!" : step.status === "skipped" ? "–" : "·";
    row.append(element("span", "step-icon", icon), element("span", "", step.detail ? `${step.name}: ${step.detail}` : step.name));
    return row;
  }));
}

async function pollDeployment(projectId) {
  window.clearTimeout(pollingTimer);
  try {
    const status = await api(`/api/projects/${projectId}/status`);
    renderSteps(status.steps || []);
    if (status.status === "online" || status.status === "healthy") {
      $("#progressTitle").textContent = "Deine App ist online";
      $("#progressSubtitle").textContent = status.domain;
      const open = $("#openAppButton");
      open.href = `https://${status.domain}`;
      open.classList.remove("hidden");
      await loadProjects();
      return;
    }
    if (status.status === "failed") {
      $("#progressTitle").textContent = "Deployment fehlgeschlagen";
      $("#progressSubtitle").textContent = "Die vorherige Version läuft weiterhin, falls bereits eine vorhanden war.";
      showError("Öffne die Logs für die genaue Ursache.");
      await loadProjects();
      return;
    }
    pollingTimer = window.setTimeout(() => pollDeployment(projectId), 2000);
  } catch (error) {
    showError(error.message);
    pollingTimer = window.setTimeout(() => pollDeployment(projectId), 4000);
  }
}

async function deployProject() {
  clearError();
  const domain = $("#domainInput").value.trim().toLowerCase();
  if (!domain) return showError("Bitte gib die Domain deiner App ein.");
  const button = $("#deploySubmitButton");
  button.disabled = true;
  try {
    const result = await api("/api/projects", {
      method: "POST",
      body: JSON.stringify({ owner: selectedRepository.owner, repo: selectedRepository.name, branch: inspection.branch, domain, database: $("#databaseInput").checked, autoDeploy: $("#autoDeployInput").checked, environment: environmentValues() }),
    });
    if (result.webhookWarning) showError(result.webhookWarning);
    $("#configureStep").classList.add("hidden");
    $("#progressStep").classList.remove("hidden");
    $("#dialogTitle").textContent = "Deployment läuft";
    renderSteps([{ name: "Deployment wird vorbereitet", status: "running" }]);
    await pollDeployment(result.projectId);
  } catch (error) { showError(error.message); }
  finally { button.disabled = false; }
}

async function showLogs(projectId) {
  $("#logOutput").textContent = "Logs werden geladen …";
  logDialog.showModal();
  try { $("#logOutput").textContent = (await api(`/api/projects/${projectId}/logs`)).logs || "Noch keine Logs vorhanden."; }
  catch (error) { $("#logOutput").textContent = error.message; }
}

async function rollbackProject(projectId) {
  if (!window.confirm("Wirklich die vorherige funktionierende Version starten?")) return;
  try {
    await api(`/api/projects/${projectId}/rollback`, { method: "POST", body: "{}" });
    await loadProjects();
  } catch (error) { window.alert(error.message); }
}

async function initialize() {
  try {
    const meta = await api("/api/meta");
    $("#version").textContent = `VPSPanel ${meta.version}`;
    if (!meta.githubConfigured) {
      $("#githubButton").addEventListener("click", (event) => {
        event.preventDefault();
        $("#setupHint").textContent = "GitHub OAuth ist noch nicht konfiguriert. Nutze panelctl github setup.";
        $("#setupHint").classList.add("error");
      });
    }
    const me = await api("/api/me");
    landing.classList.add("hidden");
    dashboard.classList.remove("hidden");
    const account = $("#accountButton");
    account.classList.remove("hidden");
    account.title = `Angemeldet als ${me.login}`;
    if (me.avatarUrl) account.style.backgroundImage = `url(${JSON.stringify(me.avatarUrl).slice(1, -1)})`;
    account.addEventListener("click", async () => { await api("/api/logout", { method: "POST", body: "{}" }); window.location.href = "/"; });
    await loadProjects();
  } catch (error) {
    if (!error.message.includes("GitHub anmelden")) console.warn(error);
  }
}

$("#newProjectButton").addEventListener("click", openDeploy);
$("#emptyDeployButton").addEventListener("click", openDeploy);
$("#inspectButton").addEventListener("click", inspectSelected);
$("#deploySubmitButton").addEventListener("click", deployProject);
$("#repositorySelect").addEventListener("change", () => {
  const repo = repositories[Number($("#repositorySelect").value)];
  if (repo) $("#branchInput").value = repo.defaultBranch;
});
$("[data-close]").addEventListener("click", () => { window.clearTimeout(pollingTimer); deployDialog.close(); });
$("[data-close-logs]").addEventListener("click", () => logDialog.close());

await initialize();
