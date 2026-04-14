import { randomBytes, randomInt } from "node:crypto";

/**
 * AliasKit mock identity. v1.2 stores these directly on the agent's
 * `metadata.zootropolis.aliaskit` and serves them to external daemons via
 * GET /api/companies/:id/agents/:id/identity — no filesystem writes.
 *
 * Real AliasKit API integration is future work gated behind
 * ZOOTROPOLIS_USE_REAL_ALIASKIT; v1.2 keeps the mock so the rest of the
 * system can be exercised end-to-end without a live AliasKit account.
 */
export interface ZootropolisMockIdentity {
  email: string;
  phone: string;
  card: {
    number: string;
    expMonth: number;
    expYear: number;
    cvv: string;
    brand: string;
  };
  totpSecret: string;
  createdAt: string;
  source: "zootropolis-mock";
  note: string;
}

export function useRealAliaskit(): boolean {
  const v = (process.env.ZOOTROPOLIS_USE_REAL_ALIASKIT ?? "").toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

export function mockIdentityFor(agentId: string): ZootropolisMockIdentity {
  const slug = agentId.replace(/[^a-z0-9-]/gi, "").slice(0, 16) || "leaf";
  const phoneTail = String(randomInt(0, 10_000_000)).padStart(7, "0");
  const cardLast4 = String(randomInt(0, 10_000)).padStart(4, "0");
  return {
    email: `${slug}@zootropolis-mock.local`,
    phone: `+1555${phoneTail}`,
    card: {
      number: `4111111111${cardLast4}`,
      expMonth: 12,
      expYear: new Date().getUTCFullYear() + 3,
      cvv: String(randomInt(100, 1000)),
      brand: "visa-mock",
    },
    totpSecret: randomBytes(20).toString("base64"),
    createdAt: new Date().toISOString(),
    source: "zootropolis-mock",
    note:
      "Zootropolis mock identity. Set ZOOTROPOLIS_USE_REAL_ALIASKIT=true " +
      "to wire the real AliasKit API (unimplemented in v1.2).",
  };
}
