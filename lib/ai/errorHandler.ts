export class AIServiceError extends Error {
  constructor(
    message: string,
    public service: string,
    public code: string,
    public retryable: boolean = false
  ) {
    super(message);
    this.name = "AIServiceError";
  }
}

export function handleAIError(error: any, service: string): never {
  console.error(`[${service}] Error:`, error);

  if (error.message?.includes("rate limit")) {
    throw new AIServiceError(
      "Rate limit exceeded. Please try again in a few moments.",
      service,
      "RATE_LIMIT",
      true
    );
  }

  if (error.message?.includes("invalid api key")) {
    throw new AIServiceError(
      "Service authentication failed. Please contact support.",
      service,
      "AUTH_FAILED",
      false
    );
  }

  if (error.message?.includes("content policy")) {
    throw new AIServiceError(
      "Content violates usage policy. Please revise your prompt.",
      service,
      "CONTENT_POLICY",
      false
    );
  }

  throw new AIServiceError(
    `Service temporarily unavailable. Please try again.`,
    service,
    "UNKNOWN",
    true
  );
}
