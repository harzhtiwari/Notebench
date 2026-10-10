import "dotenv/config";
import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import getPort, { portNumbers } from "get-port";

interface Diagnostic {
  item: string;
  status: "PASS" | "FAIL" | "WARN";
  message: string;
}

const diagnostics: Diagnostic[] = [];

console.log("🩺 Running Notebench Environment Diagnostics (pnpm doctor)...\n");

// 1. Node.js version check (>= 22.0.0)
const nodeVersion = process.versions.node;
const nodeMajor = parseInt(nodeVersion.split(".")[0] || "0", 10);
if (nodeMajor >= 22) {
  diagnostics.push({
    item: "Node.js Runtime",
    status: "PASS",
    message: `v${nodeVersion} (>= 22.0.0 required)`,
  });
} else {
  diagnostics.push({
    item: "Node.js Runtime",
    status: "FAIL",
    message: `v${nodeVersion} is installed. Node >= 22.0.0 is strictly required.`,
  });
}

// 2. pnpm version check (>= 10.0.0)
try {
  const pnpmOutput = execSync("pnpm --version", { encoding: "utf-8" }).trim();
  const pnpmMajor = parseInt(pnpmOutput.split(".")[0] || "0", 10);
  if (pnpmMajor >= 10) {
    diagnostics.push({
      item: "pnpm Package Manager",
      status: "PASS",
      message: `v${pnpmOutput} (>= 10.0.0 required)`,
    });
  } else {
    diagnostics.push({
      item: "pnpm Package Manager",
      status: "FAIL",
      message: `v${pnpmOutput} is installed. pnpm >= 10.0.0 is required. Run 'corepack prepare pnpm@latest --activate'.`,
    });
  }
} catch {
  diagnostics.push({
    item: "pnpm Package Manager",
    status: "FAIL",
    message: "pnpm is not found in PATH.",
  });
}

// 3. Astral uv check
try {
  const uvVersion = execSync("uv --version", { encoding: "utf-8" }).trim();
  diagnostics.push({
    item: "Astral uv",
    status: "PASS",
    message: uvVersion,
  });
} catch {
  diagnostics.push({
    item: "Astral uv",
    status: "FAIL",
    message: "uv is not found in PATH. Install uv from https://astral.sh/uv",
  });
}

// 4. Python runtime check (>= 3.12.0)
try {
  const pyVersion = execSync("python --version", { encoding: "utf-8" }).trim();
  const pyMatch = pyVersion.match(/Python\s+(\d+)\.(\d+)/);
  if (pyMatch) {
    const pyMajor = parseInt(pyMatch[1] ?? "0", 10);
    const pyMinor = parseInt(pyMatch[2] ?? "0", 10);
    if (pyMajor >= 3 && pyMinor >= 12) {
      diagnostics.push({
        item: "Python Runtime",
        status: "PASS",
        message: `${pyVersion} (>= 3.12.0 required)`,
      });
    } else {
      diagnostics.push({
        item: "Python Runtime",
        status: "FAIL",
        message: `${pyVersion} is installed. Python >= 3.12.0 is strictly required.`,
      });
    }
  } else {
    diagnostics.push({
      item: "Python Runtime",
      status: "PASS",
      message: pyVersion,
    });
  }
} catch {
  diagnostics.push({
    item: "Python Runtime",
    status: "FAIL",
    message: "Python 3.12+ is not found in PATH.",
  });
}

// 5. Git & DCO Sign-off Configuration
try {
  const gitVersion = execSync("git --version", { encoding: "utf-8" }).trim();
  let userName = "";
  let userEmail = "";
  try {
    userName = execSync("git config user.name", { encoding: "utf-8" }).trim();
    userEmail = execSync("git config user.email", { encoding: "utf-8" }).trim();
  } catch {
    // Git config keys might not be set
  }

  if (userName && userEmail) {
    diagnostics.push({
      item: "Git & DCO Sign-off Config",
      status: "PASS",
      message: `${gitVersion} (${userName} <${userEmail}> ready for 'git commit -s')`,
    });
  } else {
    diagnostics.push({
      item: "Git & DCO Sign-off Config",
      status: "WARN",
      message: `${gitVersion} installed, but user.name/user.email is not set. Run 'git config user.name ...' for DCO sign-offs.`,
    });
  }
} catch {
  diagnostics.push({
    item: "Git Version Control",
    status: "FAIL",
    message: "Git is not installed or not in PATH.",
  });
}

// 6. Workspace Storage Permissions
const root = process.cwd();
try {
  const testFile = join(root, ".write-permission-test");
  writeFileSync(testFile, "ok");
  unlinkSync(testFile);
  diagnostics.push({
    item: "Workspace Storage Permissions",
    status: "PASS",
    message: "Workspace is writable; runtime auto-generation of .notebook/ and .tmp/ supported",
  });
} catch (e: unknown) {
  diagnostics.push({
    item: "Workspace Storage Permissions",
    status: "FAIL",
    message: `Permission denied: ${e instanceof Error ? e.message : String(e)}`,
  });
}

// 7. Dynamic Port Pre-Flight Check (127.0.0.1)
async function checkPorts() {
  const targetWeb = process.env["WEB_PORT"]
    ? Number(process.env["WEB_PORT"])
    : (process.env["PORT"] ? Number(process.env["PORT"]) : 3000);
  const targetServer = process.env["SERVER_PORT"]
    ? Number(process.env["SERVER_PORT"])
    : 3001;

  const freeWeb = await getPort({
    port: portNumbers(targetWeb, targetWeb + 100),
    host: "127.0.0.1",
  });
  const freeServer = await getPort({
    port: portNumbers(targetServer, targetServer + 100),
    host: "127.0.0.1",
  });

  const webMsg = freeWeb === targetWeb
    ? `Port ${targetWeb} is open`
    : `Port ${targetWeb} occupied (fallback: ${freeWeb})`;
  const srvMsg = freeServer === targetServer
    ? `Port ${targetServer} is open`
    : `Port ${targetServer} occupied (fallback: ${freeServer})`;

  diagnostics.push({
    item: "Dev Ports (127.0.0.1)",
    status: "PASS",
    message: `${webMsg}; ${srvMsg}`,
  });

  // Print structured table
  console.log("| Check | Status | Details |");
  console.log("|---|---|---|");
  for (const d of diagnostics) {
    const icon = d.status === "PASS" ? "✅ PASS" : d.status === "WARN" ? "⚠️ WARN" : "❌ FAIL";
    console.log(`| ${d.item} | ${icon} | ${d.message} |`);
  }

  const failed = diagnostics.some((d) => d.status === "FAIL");
  if (failed) {
    console.error("\n❌ Environment pre-flight check failed. Resolve the errors above.");
    process.exit(1);
  } else {
    console.log("\n✅ All environment diagnostics passed successfully!");
  }
}

checkPorts().catch((err) => {
  console.error("Diagnostic execution failed:", err);
  process.exit(1);
});
