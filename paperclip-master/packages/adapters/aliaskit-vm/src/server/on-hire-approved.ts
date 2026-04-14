import type { ServerAdapterModule } from "@paperclipai/adapter-utils";

type OnHireApproved = NonNullable<ServerAdapterModule["onHireApproved"]>;

/**
 * Phase L (v1.2): identity is no longer written to a filesystem folder.
 * The create-agent route handler generates a mock AliasKit identity and
 * stores it in `agents.metadata.zootropolis.aliaskit` at hire time; the
 * external daemon fetches it via GET /api/companies/:id/agents/:id/identity.
 *
 * This hook is therefore now a no-op. Left in place so the adapter
 * registry still has something to call — and so we have a place to wire
 * real AliasKit API provisioning later when it graduates from mock.
 */
export const onHireApproved: OnHireApproved = async (_payload, _adapterConfig) => {
  return { ok: true };
};
