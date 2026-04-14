import { writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomBytes, randomInt } from "node:crypto";
import type { ServerAdapterModule } from "@paperclipai/adapter-utils";

type OnHireApproved = NonNullable<ServerAdapterModule["onHireApproved"]>;

/**
 * Phase A6 — mock identity provisioning.
 *
 * On hire, materialize a fake but plausible identity (email, US phone,
 * card, TOTP secret) into the agent's folder at `identity.json`. The
 * port broker (A5) created the folder; the agent runtime daemon (A4)
 * mounts CLAUDE.md / memory.md alongside it on first execute. This hook
 * just drops the secrets onto disk so the agent can read them like a
 * password manager export.
 *
 * Real AliasKit API integration is gated behind ZOOTROPOLIS_USE_REAL_ALIASKIT;
 * v1 keeps the mock so the rest of the system can be exercised end-to-end
 * without a live AliasKit account.
 */
export const onHireApproved: OnHireApproved = async (payload, _adapterConfig) => {
  if (useRealAliaskit()) {
    // Future: call out to AliasKit API and shape its response into the same
    // identity.json layout. For v1 this branch is intentionally unreachable.
    return { ok: false, error: "Real AliasKit integration is not implemented in v1" };
  }

  const identity = mockIdentityFor(payload.agentId);
  const folder = agentFolderFor(payload.agentId);
  try {
    await mkdir(folder, { recursive: true });
    await writeFile(
      join(folder, "identity.json"),
      JSON.stringify(identity, null, 2) + "\n",
    );
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "identity write failed",
    };
  }
};

function useRealAliaskit(): boolean {
  const v = (process.env.ZOOTROPOLIS_USE_REAL_ALIASKIT ?? "").toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

function agentFolderFor(agentId: string): string {
  return process.env.ZOOTROPOLIS_AGENTS_ROOT?.trim()
    ? join(process.env.ZOOTROPOLIS_AGENTS_ROOT.trim(), agentId)
    : join(homedir(), "zootropolis", "agents", agentId);
}

interface MockIdentity {
  email: string;
  phone: string;
  card: { number: string; expMonth: number; expYear: number; cvv: string; brand: string };
  totpSecret: string;
  createdAt: string;
  source: "zootropolis-mock";
  note: string;
}

function mockIdentityFor(agentId: string): MockIdentity {
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
      "This is a Zootropolis mock identity for local development. " +
      "Set ZOOTROPOLIS_USE_REAL_ALIASKIT=true to wire the real AliasKit API.",
  };
}
