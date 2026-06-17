import { mkdir } from "node:fs/promises";
import { approveAll, BuiltInTools, CopilotClient, ToolSet } from "@github/copilot-sdk";
import type { SessionConfig } from "@github/copilot-sdk";
import { hasToken } from "./cli.js";

export function isJudgeEnabled(args: string[], env = process.env) {
  return hasToken(args, "--judge") || env.COPILOT_EVAL_ENABLE_LLM === "1";
}

export function resolveCopilotEvalModel(value: string | undefined) {
  if (!value || value.trim().toLowerCase() === "auto") return undefined;
  return value;
}

export async function withCopilotEvalClient<T>({
  baseDirectory,
  workingDirectory = process.cwd(),
  run,
}: {
  baseDirectory: string;
  workingDirectory?: string;
  run: (client: CopilotClient) => Promise<T>;
}) {
  await mkdir(baseDirectory, { recursive: true });

  const client = new CopilotClient({
    mode: "copilot-cli",
    workingDirectory,
    baseDirectory,
    logLevel: "none",
  });

  await client.start();

  try {
    return await run(client);
  } finally {
    await client.stop();
  }
}

export async function sendCopilotEvalPrompt({
  client,
  model,
  systemMessage,
  prompt,
  timeoutMs = 180_000,
  workingDirectory,
  configDirectory,
  toolAccess = "isolated",
  privacyMode = false,
}: {
  client: CopilotClient;
  model?: string;
  systemMessage: string;
  prompt: string;
  timeoutMs?: number;
  workingDirectory?: string;
  configDirectory?: string;
  toolAccess?: "isolated" | "none";
  privacyMode?: boolean;
}) {
  const sessionConfig: SessionConfig = {
    onPermissionRequest: approveAll,
    infiniteSessions: { enabled: false },
    systemMessage: {
      mode: "replace",
      content: systemMessage,
    },
  };

  if (model) sessionConfig.model = model;
  if (workingDirectory) sessionConfig.workingDirectory = workingDirectory;
  if (configDirectory) sessionConfig.configDirectory = configDirectory;

  sessionConfig.availableTools = toolAccess === "none"
    ? []
    : new ToolSet().addBuiltIn(BuiltInTools.Isolated);

  if (privacyMode) {
    sessionConfig.enableConfigDiscovery = false;
    sessionConfig.enableOnDemandInstructionDiscovery = false;
    sessionConfig.enableFileHooks = false;
    sessionConfig.enableHostGitOperations = false;
    sessionConfig.enableSessionStore = false;
    sessionConfig.enableSkills = false;
    sessionConfig.skipEmbeddingRetrieval = true;
    sessionConfig.embeddingCacheStorage = "in-memory";
    sessionConfig.mcpServers = {};
    sessionConfig.customAgents = [];
    sessionConfig.instructionDirectories = [];
    sessionConfig.pluginDirectories = [];
    sessionConfig.disabledSkills = ["*"];
    sessionConfig.mcpOAuthTokenStorage = "in-memory";
    sessionConfig.remoteSession = "off";
  }

  const session = await client.createSession(sessionConfig);

  try {
    const response = await session.sendAndWait({ prompt }, timeoutMs);
    return response?.data.content ?? "";
  } finally {
    await session.disconnect();
  }
}
