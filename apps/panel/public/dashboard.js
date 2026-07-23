const $ = (selector) => document.querySelector(selector);
const landing = $("#landingView");
const dashboard = $("#dashboardView");
const grid = $("#projectGrid");
const empty = $("#emptyState");
const deployDialog = $("#deployDialog");
const logDialog = $("#logDialog");
const accountDialog = $("#accountDialog");
const formError = $("#formError");

const messages = {
  de: {
    brandBy: "von Johannes Wiedemann", serverReady: "Server bereit", heroEyebrow: "DEIN SERVER. OHNE SERVERKRAM.",
    heroTitle: "Was möchtest du<br /><span>online bringen?</span>",
    heroIntro: "GitHub-URL einfügen oder ZIP hochladen. Den Rest erledigt VPSPanel.",
    startGithub: "Mit GitHub starten", heroHint: "Das Admin-Passwort wurde bei der Installation angezeigt.",
    adminPassword: "Admin-Passwort", openPanel: "Panel öffnen", optionalGithub: "GitHub verbinden",
    flowAria: "Deployment-Ablauf", repository: "Repository", flowRepo: "Wähle dein Projekt aus.",
    domain: "Domain", flowDomain: "Sag uns, wo es laufen soll.", online: "Online", flowOnline: "Wir erledigen den Rest.",
    projects: "PROJEKTE", yourApps: "Deine Apps", overview: "Alles Wichtige auf einen Blick.",
    deployApp: "+ App deployen", firstApp: "Deine erste App wartet",
    emptyIntro: "GitHub-Repository oder ZIP auswählen. Den Serverkram übernehmen wir.", deployAppShort: "App deployen",
    newProject: "NEUES PROJEKT", selectRepository: "Repository auswählen", close: "Schließen",
    githubRepository: "GitHub-Repository", repositoryUrl: "Öffentliche GitHub-URL", connectedRepository: "Oder verbundenes Repository", loadingRepository: "Repository wird geladen …",
    orZip: "oder ohne Git", uploadZip: "Projekt als ZIP hochladen", zipHint: "ZIP auswählen oder hierher ziehen · maximal 100 MB", zipTooLarge: "Die ZIP-Datei darf maximal 100 MB groß sein.",
    analyzeProject: "Projekt analysieren", createPostgres: "PostgreSQL automatisch erstellen",
    databaseHint: "Sicheres Passwort und DATABASE_URL inklusive", deployEveryPush: "Bei jedem Push neu deployen",
    webhookHint: "VPSPanel richtet den GitHub-Webhook automatisch ein", advancedSettings: "Erweiterte Einstellungen",
    bringOnline: "App online bringen", preparingApp: "Deine App wird vorbereitet",
    firstBuildHint: "Das dauert beim ersten Build normalerweise ein paar Minuten.", openApp: "App öffnen",
    liveOutput: "LIVE-AUSGABE", loadingLogs: "Logs werden geladen …", craftedBy: "Entwickelt von Johannes Wiedemann",
    genericError: "Die Aktion ist fehlgeschlagen.", statusOnline: "Online", statusDeploying: "Wird deployed",
    statusQueued: "Wartet", statusFailed: "Fehlgeschlagen", deployment: "Deployment",
    viewLogs: "Logs ansehen", previousVersion: "Vorherige Version", privateSuffix: " · privat",
    redeploy: "Neu deployen",
    automatic: "Automatisch", detectedTitle: "Wir haben Folgendes erkannt", type: "Typ", port: "Port",
    build: "Build", start: "Start", packageManager: "Paketmanager", migration: "Migration",
    visibility: "Sichtbarkeit", privateLabel: "Privat", publicLabel: "Öffentlich", requiredValue: "Erforderlicher Wert",
    reviewDeployment: "Deployment prüfen", selectRepoError: "Bitte gib eine GitHub-URL ein, wähle ein Repository oder lade ein ZIP hoch.",
    analyzing: "Projekt wird analysiert …", appOnline: "Deine App ist online", deployFailed: "Deployment fehlgeschlagen",
    previousKeepsRunning: "Die vorherige Version läuft weiterhin, falls bereits eine vorhanden war.",
    openLogsHint: "Öffne die Logs für die genaue Ursache.", domainRequired: "Bitte gib die Domain deiner App ein.",
    deploymentRunning: "Deployment läuft", deploymentPreparing: "Deployment wird vorbereitet",
    noLogs: "Noch keine Logs vorhanden.", rollbackConfirm: "Wirklich die vorherige funktionierende Version starten?",
    githubNotConfigured: "GitHub OAuth ist noch nicht konfiguriert. Nutze panelctl github setup.",
    signedInAs: "Angemeldet als", account: "ACCOUNT", securityAndHttps: "Sicherheit & HTTPS", currentAddress: "Aktuelle Adresse",
    panelDomain: "Domain für dein Panel", httpsHelp: "Der A-Record muss auf diesen VPS zeigen. VPSPanel konfiguriert Caddy und das Zertifikat automatisch.",
    enableHttps: "HTTPS aktivieren", httpsStarted: "HTTPS wird eingerichtet", httpsWait: "Caddy holt das Zertifikat automatisch. Das dauert meist nur wenige Sekunden.", openSecure: "Sicheres Panel öffnen", logout: "Abmelden", title: "VPSPanel · Johannes Wiedemann",
    stepRepository: "Repository wird geladen", stepDatabase: "Datenbank wird erstellt", stepBuild: "App wird gebaut",
    stepStart: "App wird gestartet", stepDomain: "Domain und HTTPS werden verbunden", stepCheck: "App wird geprüft",
    stepRollback: "Vorherige Version wird gestartet"
  },
  en: {
    brandBy: "by Johannes Wiedemann", serverReady: "Server ready", heroEyebrow: "YOUR SERVER. WITHOUT THE SERVER WORK.",
    heroTitle: "What do you want to<br /><span>put online?</span>",
    heroIntro: "Paste a GitHub URL or upload a ZIP. VPSPanel handles the rest.",
    startGithub: "Start with GitHub", heroHint: "The admin password was shown during installation.",
    adminPassword: "Admin password", openPanel: "Open panel", optionalGithub: "Connect GitHub",
    flowAria: "Deployment flow", repository: "Repository", flowRepo: "Choose your project.",
    domain: "Domain", flowDomain: "Tell us where it should run.", online: "Online", flowOnline: "We handle the rest.",
    projects: "PROJECTS", yourApps: "Your apps", overview: "Everything important at a glance.",
    deployApp: "+ Deploy app", firstApp: "Your first app is waiting",
    emptyIntro: "Choose a GitHub repository or ZIP. We handle the server work.", deployAppShort: "Deploy app",
    newProject: "NEW PROJECT", selectRepository: "Select repository", close: "Close",
    githubRepository: "GitHub repository", repositoryUrl: "Public GitHub URL", connectedRepository: "Or connected repository", loadingRepository: "Loading repositories …",
    orZip: "or without Git", uploadZip: "Upload project as ZIP", zipHint: "Choose or drop a ZIP · maximum 100 MB", zipTooLarge: "The ZIP file must not exceed 100 MB.",
    analyzeProject: "Analyze project", createPostgres: "Create PostgreSQL automatically",
    databaseHint: "Secure password and DATABASE_URL included", deployEveryPush: "Deploy on every push",
    webhookHint: "VPSPanel configures the GitHub webhook automatically", advancedSettings: "Advanced settings",
    bringOnline: "Put app online", preparingApp: "Preparing your app",
    firstBuildHint: "The first build usually takes a few minutes.", openApp: "Open app",
    liveOutput: "LIVE OUTPUT", loadingLogs: "Loading logs …", craftedBy: "Built by Johannes Wiedemann",
    genericError: "The action failed.", statusOnline: "Online", statusDeploying: "Deploying",
    statusQueued: "Queued", statusFailed: "Failed", deployment: "Deployment",
    viewLogs: "View logs", previousVersion: "Previous version", privateSuffix: " · private",
    redeploy: "Deploy again",
    automatic: "Automatic", detectedTitle: "Here is what we detected", type: "Type", port: "Port",
    build: "Build", start: "Start", packageManager: "Package manager", migration: "Migration",
    visibility: "Visibility", privateLabel: "Private", publicLabel: "Public", requiredValue: "Required value",
    reviewDeployment: "Review deployment", selectRepoError: "Enter a GitHub URL, choose a repository, or upload a ZIP.",
    analyzing: "Analyzing project …", appOnline: "Your app is online", deployFailed: "Deployment failed",
    previousKeepsRunning: "The previous version remains online if one already exists.",
    openLogsHint: "Open the logs to see the exact cause.", domainRequired: "Please enter your app domain.",
    deploymentRunning: "Deployment running", deploymentPreparing: "Preparing deployment",
    noLogs: "No logs available yet.", rollbackConfirm: "Start the previous working version?",
    githubNotConfigured: "GitHub OAuth is not configured yet. Run panelctl github setup.",
    signedInAs: "Signed in as", account: "ACCOUNT", securityAndHttps: "Security & HTTPS", currentAddress: "Current address",
    panelDomain: "Domain for your panel", httpsHelp: "The A record must point to this VPS. VPSPanel configures Caddy and the certificate automatically.",
    enableHttps: "Enable HTTPS", httpsStarted: "HTTPS is being configured", httpsWait: "Caddy obtains the certificate automatically. This usually takes only a few seconds.", openSecure: "Open secure panel", logout: "Sign out", title: "VPSPanel · Johannes Wiedemann",
    stepRepository: "Loading repository", stepDatabase: "Creating database", stepBuild: "Building app",
    stepStart: "Starting app", stepDomain: "Connecting domain and HTTPS", stepCheck: "Checking app",
    stepRollback: "Starting previous version"
  }
};

let currentLanguage = "de";
let repositories = [];
let currentProjects = [];
let inspection = null;
let selectedRepository = null;
let selectedUploadId = null;
let pollingTimer = null;
let githubConnected = false;
let githubConfigured = false;

function t(key) {
  return messages[currentLanguage][key] || messages.de[key] || key;
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function applyLanguage(language, persist) {
  currentLanguage = language === "en" ? "en" : "de";
  document.documentElement.lang = currentLanguage;
  document.title = t("title");
  document.querySelectorAll("[data-i18n]").forEach((node) => { node.textContent = t(node.dataset.i18n); });
  document.querySelectorAll("[data-i18n-html]").forEach((node) => { node.innerHTML = t(node.dataset.i18nHtml); });
  document.querySelectorAll("[data-i18n-aria]").forEach((node) => { node.setAttribute("aria-label", t(node.dataset.i18nAria)); });
  document.querySelectorAll("[data-language]").forEach((button) => {
    const active = button.dataset.language === currentLanguage;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  if (persist) {
    try { window.localStorage.setItem("vpspanel_language", currentLanguage); } catch {}
  }
  if (currentProjects.length) renderProjects();
  if (inspection && !$("#configureStep").classList.contains("hidden")) showInspection(inspection);
}

function preferredLanguage(serverDefault) {
  try {
    const local = window.localStorage.getItem("vpspanel_language");
    if (local === "de" || local === "en") return local;
  } catch {}
  return serverDefault === "en" ? "en" : "de";
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || t("genericError"));
    error.data = data;
    error.status = response.status;
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
  return ({ online: t("statusOnline"), healthy: t("statusOnline"), deploying: t("statusDeploying"), queued: t("statusQueued"), failed: t("statusFailed") })[status] || status;
}

function projectCard(project) {
  const card = element("article", "project-card");
  const top = element("div", "project-top");
  const nameRow = element("div", "project-name");
  const icon = element("div", "app-icon", project.name.slice(0, 1).toUpperCase());
  const titleBlock = element("div");
  titleBlock.append(element("h2", "", project.name));
  const domain = element("a", "domain-link", project.domain);
  domain.href = "https://" + project.domain;
  domain.target = "_blank";
  domain.rel = "noreferrer";
  titleBlock.append(domain);
  nameRow.append(icon, titleBlock);
  const state = element("div", "status " + project.status);
  state.append(element("i", "status-dot"), document.createTextNode(statusLabel(project.status)));
  top.append(nameRow, state);

  const meta = element("div", "project-meta");
  meta.append(element("span", "", project.framework), element("span", "", t("deployment") + " " + (project.current_deployment?.slice(0, 7) || "–")));
  const actions = element("div", "card-actions");
  const logs = element("button", "secondary", t("viewLogs"));
  logs.addEventListener("click", () => showLogs(project.id));
  const redeploy = element("button", "primary", t("redeploy"));
  redeploy.addEventListener("click", () => redeployProject(project.id));
  const rollback = element("button", "secondary", t("previousVersion"));
  rollback.addEventListener("click", () => rollbackProject(project.id));
  actions.append(redeploy, logs, rollback);
  card.append(top, meta, actions);
  return card;
}

function renderProjects() {
  grid.replaceChildren(...currentProjects.map(projectCard));
  empty.classList.toggle("hidden", currentProjects.length > 0);
}

async function loadProjects() {
  currentProjects = await api("/api/projects");
  renderProjects();
}

async function loadRepositories() {
  const select = $("#repositorySelect");
  select.replaceChildren(new Option(t("loadingRepository"), ""));
  repositories = await api("/api/github/repos");
  select.replaceChildren(new Option(t("selectRepository"), ""), ...repositories.map((repo, index) => new Option(repo.fullName + (repo.private ? t("privateSuffix") : ""), String(index))));
}

function resetDialog() {
  clearError();
  inspection = null;
  selectedRepository = null;
  selectedUploadId = null;
  $("#repositoryStep").classList.remove("hidden");
  $("#configureStep").classList.add("hidden");
  $("#progressStep").classList.add("hidden");
  $("#dialogTitle").textContent = t("selectRepository");
  $("#repositorySelect").value = "";
  $("#repositoryUrlInput").value = "";
  $("#projectZipInput").value = "";
  $("#zipFileLabel").textContent = t("zipHint");
  $("#branchInput").value = "";
  $("#domainInput").value = "";
  $("#databaseInput").checked = false;
  $("#autoDeployInput").checked = githubConnected;
  $("#autoDeployRow").classList.toggle("hidden", !githubConnected);
  $("#environmentFields").replaceChildren();
}

async function openDeploy() {
  resetDialog();
  deployDialog.showModal();
  $("#connectedRepositoryField").classList.toggle("hidden", !githubConnected);
  if (githubConnected) {
    try { await loadRepositories(); } catch (error) { showError(error.message); }
  }
}

function summaryLine(label, value) {
  const row = element("div");
  row.append(element("b", "", label + ": "), document.createTextNode(value || t("automatic")));
  return row;
}

function showInspection(result) {
  const box = $("#detectedSummary");
  const title = element("h3", "", t("detectedTitle"));
  const details = element("div", "detected-grid");
  details.append(summaryLine(t("type"), result.framework), summaryLine(t("port"), String(result.port)), summaryLine(t("build"), result.buildCommand), summaryLine(t("start"), result.startCommand));
  box.replaceChildren(title, details);
  const advanced = $("#advancedSummary");
  advanced.replaceChildren(summaryLine(t("packageManager"), result.packageManager), summaryLine(t("migration"), result.migrationCommand), summaryLine("Branch", result.branch), summaryLine(t("visibility"), result.private ? t("privateLabel") : t("publicLabel")));
  const fields = $("#environmentFields");
  fields.replaceChildren(...result.missingVariables.map((name) => {
    const label = element("label", "field");
    label.dataset.variable = name;
    label.append(element("span", "", name));
    const input = element("input");
    input.type = "password";
    input.autocomplete = "off";
    input.placeholder = t("requiredValue");
    label.append(input);
    return label;
  }));
  $("#repositoryStep").classList.add("hidden");
  $("#configureStep").classList.remove("hidden");
  $("#dialogTitle").textContent = t("reviewDeployment");
}

async function inspectSelected() {
  clearError();
  const zipFile = $("#projectZipInput").files[0];
  const repositoryUrl = $("#repositoryUrlInput").value.trim();
  const index = $("#repositorySelect").value;
  const connected = index === "" ? null : repositories[Number(index)];
  if (!zipFile && !repositoryUrl && !connected) return showError(t("selectRepoError"));
  if (zipFile && zipFile.size > 100 * 1024 * 1024) return showError(t("zipTooLarge"));
  const branch = $("#branchInput").value.trim() || connected?.defaultBranch || "";
  const button = $("#inspectButton");
  button.disabled = true;
  button.textContent = t("analyzing");
  try {
    if (zipFile) {
      inspection = await api("/api/uploads/inspect", { method: "POST", body: zipFile, headers: { "Content-Type": "application/zip", "X-Upload-Name": encodeURIComponent(zipFile.name) } });
      selectedUploadId = inspection.uploadId;
      selectedRepository = { owner: inspection.owner, name: inspection.repo };
      $("#autoDeployInput").checked = false;
      $("#autoDeployRow").classList.add("hidden");
    } else {
      const request = repositoryUrl ? { repositoryUrl, branch } : { owner: connected.owner, repo: connected.name, branch };
      inspection = await api("/api/inspect", { method: "POST", body: JSON.stringify(request) });
      selectedUploadId = null;
      selectedRepository = { owner: inspection.owner, name: inspection.repo };
    }
    showInspection(inspection);
  } catch (error) { showError(error.message); }
  finally { button.disabled = false; button.innerHTML = "<span>" + t("analyzeProject") + "</span><span>→</span>"; }
}

function environmentValues() {
  return Object.fromEntries([...document.querySelectorAll("#environmentFields .field")].map((field) => [field.dataset.variable, field.querySelector("input").value]));
}

function translatedStepName(name) {
  return ({
    "Repository wird geladen": t("stepRepository"), "Datenbank wird erstellt": t("stepDatabase"),
    "App wird gebaut": t("stepBuild"), "App wird gestartet": t("stepStart"),
    "Domain und HTTPS werden verbunden": t("stepDomain"), "App wird geprüft": t("stepCheck"),
    "Vorherige Version wird gestartet": t("stepRollback")
  })[name] || name;
}

function renderSteps(steps) {
  const container = $("#deploymentSteps");
  container.replaceChildren(...steps.map((step) => {
    const row = element("div", "step " + step.status);
    const icon = step.status === "done" ? "✓" : step.status === "failed" ? "!" : step.status === "skipped" ? "–" : "·";
    const name = translatedStepName(step.name);
    row.append(element("span", "step-icon", icon), element("span", "", step.detail ? name + ": " + step.detail : name));
    return row;
  }));
}

async function pollDeployment(projectId) {
  window.clearTimeout(pollingTimer);
  try {
    const status = await api("/api/projects/" + projectId + "/status");
    renderSteps(status.steps || []);
    if (status.status === "online" || status.status === "healthy") {
      $("#progressTitle").textContent = t("appOnline");
      $("#progressSubtitle").textContent = status.domain;
      const open = $("#openAppButton");
      open.href = "https://" + status.domain;
      open.classList.remove("hidden");
      await loadProjects();
      return;
    }
    if (status.status === "failed") {
      $("#progressTitle").textContent = t("deployFailed");
      $("#progressSubtitle").textContent = t("previousKeepsRunning");
      showError(t("openLogsHint"));
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
  if (!domain) return showError(t("domainRequired"));
  const button = $("#deploySubmitButton");
  button.disabled = true;
  try {
    const result = await api("/api/projects", {
      method: "POST",
      body: JSON.stringify({ ...(selectedUploadId ? { uploadId: selectedUploadId } : { owner: selectedRepository.owner, repo: selectedRepository.name, branch: inspection.branch }), domain, database: $("#databaseInput").checked, autoDeploy: $("#autoDeployInput").checked, environment: environmentValues() }),
    });
    if (result.webhookWarning) showError(result.webhookWarning);
    $("#configureStep").classList.add("hidden");
    $("#progressStep").classList.remove("hidden");
    $("#dialogTitle").textContent = t("deploymentRunning");
    renderSteps([{ name: t("deploymentPreparing"), status: "running" }]);
    await pollDeployment(result.projectId);
  } catch (error) { showError(error.message); }
  finally { button.disabled = false; }
}

async function showLogs(projectId) {
  $("#logOutput").textContent = t("loadingLogs");
  logDialog.showModal();
  try { $("#logOutput").textContent = (await api("/api/projects/" + projectId + "/logs")).logs || t("noLogs"); }
  catch (error) { $("#logOutput").textContent = error.message; }
}

async function redeployProject(projectId) {
  clearError();
  deployDialog.showModal();
  $("#repositoryStep").classList.add("hidden");
  $("#configureStep").classList.add("hidden");
  $("#progressStep").classList.remove("hidden");
  $("#dialogTitle").textContent = t("deploymentRunning");
  $("#progressTitle").textContent = t("deploymentRunning");
  $("#progressSubtitle").textContent = t("firstBuildHint");
  $("#openAppButton").classList.add("hidden");
  renderSteps([{ name: t("deploymentPreparing"), status: "running" }]);
  try {
    await api("/api/projects/" + projectId + "/deploy", { method: "POST", body: "{}" });
    await pollDeployment(projectId);
  } catch (error) { showError(error.message); }
}

async function rollbackProject(projectId) {

  if (!window.confirm(t("rollbackConfirm"))) return;
  try {
    await api("/api/projects/" + projectId + "/rollback", { method: "POST", body: "{}" });
    await loadProjects();
  } catch (error) { window.alert(error.message); }
}

async function openAccountSettings() {
  const error = $("#settingsError");
  error.classList.add("hidden");
  $("#httpsSuccess").classList.add("hidden");
  $("#httpsForm").classList.remove("hidden");
  $("#connectGithubButton").classList.toggle("hidden", !githubConfigured || githubConnected);
  accountDialog.showModal();
  try {
    const settings = await api("/api/settings");
    $("#panelPublicUrl").textContent = settings.publicUrl;
    if (settings.httpsEnabled) {
      $("#httpsForm").classList.add("hidden");
      $("#httpsSuccess").classList.remove("hidden");
      $("#openSecurePanel").href = settings.publicUrl;
    }
  } catch (requestError) {
    error.textContent = requestError.message;
    error.classList.remove("hidden");
  }
}

async function enableHttps(event) {
  event.preventDefault();
  const button = $("#enableHttpsButton");
  const error = $("#settingsError");
  error.classList.add("hidden");
  button.disabled = true;
  try {
    const result = await api("/api/settings/domain", { method: "POST", body: JSON.stringify({ domain: $("#panelDomainInput").value }) });
    $("#panelPublicUrl").textContent = result.publicUrl;
    $("#httpsForm").classList.add("hidden");
    $("#httpsSuccess").classList.remove("hidden");
    $("#openSecurePanel").href = result.publicUrl;
  } catch (requestError) {
    error.textContent = requestError.message;
    error.classList.remove("hidden");
  } finally { button.disabled = false; }
}

async function initialize() {
  try {
    const meta = await api("/api/meta");
    applyLanguage(preferredLanguage(meta.language), false);
    $("#version").textContent = "VPSPanel " + meta.version;
    githubConfigured = Boolean(meta.githubConfigured);
    if (!meta.localLoginConfigured) {
      $("#setupHint").textContent = "Lokale Anmeldung fehlt. Führe den aktuellen Installer erneut aus.";
      $("#setupHint").classList.add("error");
    }
    const me = await api("/api/me");
    githubConnected = Boolean(me.githubConnected);
    landing.classList.add("hidden");
    dashboard.classList.remove("hidden");
    const account = $("#accountButton");
    account.classList.remove("hidden");
    account.title = t("signedInAs") + " " + me.login;
    if (me.avatarUrl) account.style.backgroundImage = "url(" + JSON.stringify(me.avatarUrl) + ")";
    else account.textContent = "⚙";
    account.addEventListener("click", openAccountSettings);
    await loadProjects();
  } catch (error) {
    if (error.status !== 401) console.warn(error);
  }
}

$("#adminLoginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const hint = $("#setupHint");
  hint.classList.remove("error");
  try {
    await api("/api/auth/local", { method: "POST", body: JSON.stringify({ password: $("#adminPasswordInput").value }) });
    window.location.reload();
  } catch (error) {
    hint.textContent = error.message;
    hint.classList.add("error");
  }
});

document.querySelectorAll("[data-language]").forEach((button) => {
  button.addEventListener("click", () => applyLanguage(button.dataset.language, true));
});
$("#newProjectButton").addEventListener("click", openDeploy);
$("#emptyDeployButton").addEventListener("click", openDeploy);
$("#inspectButton").addEventListener("click", inspectSelected);
$("#deploySubmitButton").addEventListener("click", deployProject);
$("#repositorySelect").addEventListener("change", () => {
  const repo = repositories[Number($("#repositorySelect").value)];
  if (repo) { $("#branchInput").value = repo.defaultBranch; $("#repositoryUrlInput").value = ""; $("#projectZipInput").value = ""; $("#zipFileLabel").textContent = t("zipHint"); }
});
$("#repositoryUrlInput").addEventListener("input", () => {
  if ($("#repositoryUrlInput").value) { $("#projectZipInput").value = ""; $("#zipFileLabel").textContent = t("zipHint"); }
});
$("#projectZipInput").addEventListener("change", () => {
  const file = $("#projectZipInput").files[0];
  $("#zipFileLabel").textContent = file ? file.name : t("zipHint");
  if (file) { $("#repositoryUrlInput").value = ""; $("#repositorySelect").value = ""; $("#branchInput").value = ""; }
});

const uploadZone = $(".upload-zone");
for (const eventName of ["dragenter", "dragover"]) uploadZone.addEventListener(eventName, (event) => { event.preventDefault(); uploadZone.classList.add("dragging"); });
for (const eventName of ["dragleave", "drop"]) uploadZone.addEventListener(eventName, (event) => { event.preventDefault(); uploadZone.classList.remove("dragging"); });
uploadZone.addEventListener("drop", (event) => {
  const file = [...event.dataTransfer.files].find((item) => item.name.toLowerCase().endsWith(".zip"));
  if (!file) return showError(t("selectRepoError"));
  const transfer = new DataTransfer();
  transfer.items.add(file);
  $("#projectZipInput").files = transfer.files;
  $("#projectZipInput").dispatchEvent(new Event("change"));
});
$("[data-close]").addEventListener("click", () => { window.clearTimeout(pollingTimer); deployDialog.close(); });
$("[data-close-logs]").addEventListener("click", () => logDialog.close());
$("#httpsForm").addEventListener("submit", enableHttps);
$("#logoutButton").addEventListener("click", async () => { await api("/api/logout", { method: "POST", body: "{}" }); window.location.href = "/"; });
$("[data-close-account]").addEventListener("click", () => accountDialog.close());

await initialize();
