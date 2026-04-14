import type { ServerAdapterModule } from "@paperclipai/adapter-utils";

type OnHireApproved = NonNullable<ServerAdapterModule["onHireApproved"]>;

/**
 * Stubbed in Phase A3. Real identity provisioning + folder/daemon spawn
 * lands in Phases A5 (port broker) and A6 (mock identity). For now this
 * is a no-op so the adapter can be registered safely.
 */
export const onHireApproved: OnHireApproved = async (_payload, _adapterConfig) => {
  return { ok: true };
};
