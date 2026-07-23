fetch("http://127.0.0.1:3100/health", {
  headers: { Authorization: `Bearer ${process.env.AGENT_TOKEN}` },
}).then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1));
