const button = document.querySelector("#deployButton");
const hint = document.querySelector("#setupHint");
const version = document.querySelector("#version");

try {
  const response = await fetch("/api/meta");
  const meta = await response.json();
  version.textContent = `VPSPanel ${meta.version}`;

  if (!meta.githubConfigured) {
    button.addEventListener("click", () => {
      hint.textContent = "GitHub wird als Nächstes verbunden. Hinterlege dafür die OAuth-Daten in /opt/vpspanel/.env.";
      hint.classList.add("notice");
    });
  } else {
    button.addEventListener("click", () => {
      window.location.href = "/api/auth/github";
    });
  }
} catch {
  hint.textContent = "Das Panel ist noch nicht vollständig erreichbar. Versuche es gleich erneut.";
  hint.classList.add("notice");
}
