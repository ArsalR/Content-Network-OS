const PRICING: Record<
  string,
  { inputPerMillion: number; outputPerMillion: number }
> = {
  "gpt-4o": { inputPerMillion: 2.5, outputPerMillion: 10.0 },
  "gpt-4o-mini": { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  "gpt-4-turbo": { inputPerMillion: 10.0, outputPerMillion: 30.0 },
  "gpt-3.5-turbo": { inputPerMillion: 0.5, outputPerMillion: 1.5 },
};

export function computeCostUsd(
  model: string,
  tokensIn: number,
  tokensOut: number
): number {
  const p = PRICING[model] ?? PRICING["gpt-4o-mini"]!;
  return (
    (tokensIn / 1_000_000) * p.inputPerMillion +
    (tokensOut / 1_000_000) * p.outputPerMillion
  );
}

export function getDefaultModel(): string {
  return "gpt-4o-mini";
}
