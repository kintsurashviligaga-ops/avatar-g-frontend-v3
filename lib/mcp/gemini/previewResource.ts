/** The Vercel deployment URL is generated per build, so a static environment
 * value cannot name the next preview's resource. Derive it only from Vercel's
 * own system variable, and only for the explicitly enabled preview broker.
 * Never consult request Host/Forwarded headers. Explicit settings always win.
 */
export function mcpResourceUrl(env: NodeJS.ProcessEnv = process.env): string | undefined {
  if (env.MCP_GEMINI_RESOURCE_URL) return env.MCP_GEMINI_RESOURCE_URL;
  if (env.VERCEL_ENV !== 'preview' || env.MCP_BROKER_EXPERIMENTAL !== 'true' ||
      env.MCP_BROKER_PREVIEW_ENABLED !== 'true' ||
      !env.VERCEL_URL || !/^[a-z0-9-]+\.vercel\.app$/.test(env.VERCEL_URL)) return undefined;
  return `https://${env.VERCEL_URL}/api/mcp/gemini`;
}
