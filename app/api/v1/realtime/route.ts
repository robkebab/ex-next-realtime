import { NextResponse } from "next/server";
import { Sandbox } from "@vercel/sandbox";
import ms from "ms";

const pkgJson = JSON.stringify(
  {
    name: "openai-realtime-gateway",
    private: true,
    scripts: {
      dev: "node ./index.js",
    },
    type: "module",
    dependencies: { dotenv: "^16.4.7" },
  },
  null,
  2
);

const index = `
console.log("Hello, world!");
`;

async function createWebSocketServer() {
  const sandbox = await Sandbox.create({
    resources: { vcpus: 2 },
    timeout: ms("5m"),
    ports: [3000],
    runtime: "node22",
  });

  console.log(`Writing sandbox files...`);
  await sandbox.writeFiles([
    { path: "package.json", content: Buffer.from(pkgJson) },
    { path: "index.js", content: Buffer.from(index) },
    {
      path: ".env",
      content: Buffer.from(`OPENAI_API_KEY=${process.env.OPENAI_API_KEY}`),
    },
  ]);

  console.log(`Installing sandbox dependencies...`);
  const install = await sandbox.runCommand({
    cmd: "npm",
    args: ["install", "--loglevel", "info"],
    stderr: process.stderr,
    stdout: process.stdout,
  });

  if (install.exitCode != 0) {
    console.log("installing packages failed");
    throw new Error("Installing packages failed");
  }

  console.log(`Starting the sandbox server...`);
  await sandbox.runCommand({
    cmd: "npm",
    args: ["run", "dev"],
    stderr: process.stderr,
    stdout: process.stdout,
  });

  const publicUrl = sandbox.domain(3000);
  publicUrl.replace(/^https:/, "wss:");
}

export async function POST(_request: Request) {
  try {
    // const socketUrl = await createWebSocketServer();
    const socketUrl = "ws://localhost:8080/realtime";

    return NextResponse.json({
      socketUrl,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to create sandbox" },
      { status: 500 }
    );
  }
}
