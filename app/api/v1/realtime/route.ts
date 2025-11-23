import { NextResponse } from "next/server";
import { Sandbox } from "@vercel/sandbox";
import ms from "ms";

async function createWebSocketServer() {
  const sandbox = await Sandbox.create({
    source: { type: "git", url: "https://github.com/robkebab/ex-s2s-proxy" },
    resources: { vcpus: 2 },
    timeout: ms("5m"),
    ports: [3000],
    runtime: "node22",
  });

  console.log(`Writing sandbox files...`);
  await sandbox.writeFiles([
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
  return publicUrl.replace(/^https:/, "wss:") + "/realtime";
}

export async function POST(_request: Request) {
  try {
    const socketUrl = await createWebSocketServer();

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
