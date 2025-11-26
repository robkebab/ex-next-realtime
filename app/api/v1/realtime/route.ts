import { NextResponse } from "next/server";
import { Sandbox } from "@vercel/sandbox";
import ms from "ms";

async function createWebSocketServer() {
  const sandbox = await Sandbox.create({
    source: {
      type: "git",
      url: "https://github.com/robkebab/ex-s2s-proxy.git",
    },
    resources: { vcpus: 2 },
    timeout: ms("5m"),
    ports: [3001],
    runtime: "node22",
  });

  console.log(`Writing sandbox env file...`);
  await sandbox.writeFiles([
    {
      path: ".env",
      content: Buffer.from(`OPENAI_API_KEY=${process.env.OPENAI_API_KEY}
        PORT=3001
        `),
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
    args: ["start"],
    stderr: process.stderr,
    stdout: process.stdout,
    detached: true,
  });

  const publicUrl = sandbox.domain(3001);

  let attempts = 0;
  while (attempts < 5) {
    try {
      const response = await fetch(`${publicUrl}/health`);
      if (response.ok) {
        break;
      }
    } catch (error) {
      console.error(error);
    }
    attempts++;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

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
