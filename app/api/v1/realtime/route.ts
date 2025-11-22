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

export async function POST(_request: Request) {
  try {
    const sandbox = await Sandbox.create({
      resources: { vcpus: 2 },
      // Timeout in milliseconds: ms('10m') = 600000
      // Defaults to 5 minutes. The maximum is 5 hours for Pro/Enterprise, and 45 minutes for Hobby.
      timeout: ms("5m"),
      ports: [3000],
      runtime: "node22",
    });

    await sandbox.writeFiles([
      { path: "package.json", content: Buffer.from(pkgJson) },
      { path: "index.js", content: Buffer.from(index) },
      {
        path: ".env",
        content: Buffer.from(`OPENAI_API_KEY=${process.env.OPENAI_API_KEY}`),
      },
    ]);

    console.log(`Installing dependencies...`);
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

    console.log(`Starting the development server...`);
    await sandbox.runCommand({
      cmd: "npm",
      args: ["run", "dev"],
      stderr: process.stderr,
      stdout: process.stdout,
    });

    const publicUrl = sandbox.domain(3000);

    return NextResponse.json({
      socketUrl: publicUrl.replace(/^https:/, "wss:"),
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to create sandbox", details: error },
      { status: 500 }
    );
  }
}
