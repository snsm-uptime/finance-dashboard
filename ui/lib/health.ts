/** Shared health payload — kept tiny so Vitest can cover statements without browser chrome. */
export type HealthPayload = {
  status: "ok";
};

export function buildHealthPayload(): HealthPayload {
  return { status: "ok" };
}

export function isHealthy(payload: HealthPayload | null | undefined): boolean {
  return payload?.status === "ok";
}
