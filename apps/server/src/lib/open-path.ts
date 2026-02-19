import { spawn } from "node:child_process";

export async function openPathInFileManager(targetPath: string): Promise<void> {
  let command: string;
  let args: string[];
  switch (process.platform) {
    case "darwin":
      command = "open";
      args = [targetPath];
      break;
    case "win32":
      command = "explorer";
      args = [targetPath];
      break;
    default:
      command = "xdg-open";
      args = [targetPath];
      break;
  }

  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      detached: true,
      stdio: "ignore"
    });
    child.once("error", reject);
    child.once("spawn", () => resolve());
    child.unref();
  });
}
