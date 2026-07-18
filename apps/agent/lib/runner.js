import { spawn } from "node:child_process";

const allowedPrograms = new Set(["docker", "tar"]);

export async function command(program, args, options = {}) {
  if (!allowedPrograms.has(program)) throw new Error("Command is not allowed");
  if (!Array.isArray(args) || args.some((value) => typeof value !== "string")) throw new Error("Invalid command arguments");

  return new Promise((resolve, reject) => {
    const child = spawn(program, args, {
      cwd: options.cwd,
      env: { PATH: process.env.PATH },
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout = (stdout + chunk).slice(-64_000); });
    child.stderr.on("data", (chunk) => { stderr = (stderr + chunk).slice(-64_000); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error((stderr || stdout || `${program} exited with ${code}`).trim()));
    });
  });
}

export async function containerExists(name) {
  try {
    await command("docker", ["inspect", name]);
    return true;
  } catch {
    return false;
  }
}
