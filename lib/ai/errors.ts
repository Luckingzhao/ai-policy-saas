import "server-only";

export type AiFailureKind = "fallback_allowed" | "output_invalid" | "business_invalid" | "configuration" | "unknown";

export class AiOutputValidationError extends Error {
  readonly kind = "output_invalid" as const;

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "AiOutputValidationError";
  }
}

export class AiConfigurationError extends Error {
  readonly kind = "configuration" as const;

  constructor(message: string) {
    super(message);
    this.name = "AiConfigurationError";
  }
}

export class AiRetryableError extends Error {
  readonly kind = "fallback_allowed" as const;
  readonly retryable = true;
  readonly status = 503;

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "AiRetryableError";
  }
}

export function classifyAiFailure(error: unknown): AiFailureKind {
  if (error instanceof AiOutputValidationError) return "output_invalid";
  if (error instanceof AiConfigurationError) return "configuration";

  const status = readStatus(error);
  const message = error instanceof Error ? error.message : String(error);
  if (
    status === 429 ||
    (status !== null && status >= 500) ||
    /timeout|timed out|ETIMEDOUT|ECONNRESET|ECONNREFUSED|connection error|fetch failed|premature close|provider unavailable|service unavailable/i.test(
      message
    )
  ) {
    return "fallback_allowed";
  }

  return "unknown";
}

function readStatus(error: unknown) {
  if (!error || typeof error !== "object") return null;
  const value = "status" in error ? error.status : "statusCode" in error ? error.statusCode : null;
  return typeof value === "number" ? value : null;
}
