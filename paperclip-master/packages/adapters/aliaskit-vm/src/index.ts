export const type = "aliaskit_vm";
export const label = "AliasKit VM";

export const models: { id: string; label: string }[] = [];

export const agentConfigurationDoc = `# aliaskit_vm agent configuration

Adapter: aliaskit_vm

Use when:
- This agent is a Zootropolis leaf — it does real work on the internet
  (browses, signs up for services, receives verification codes, etc.).
- You want a per-agent persistent runtime (folder-as-VM in dev, real Cua/
  Coasty VM in prod) with its own AliasKit identity (email/phone/card).

Don't use when:
- This agent is a container (room/floor/building/campus). Containers are
  pure delegators and should use \`claude_local\` instead — no VM, no
  identity, no workspace overhead.

Core fields:
- runtimeEndpoint (string, required): WebSocket URL of the agent runtime
  daemon. In dev, set automatically by the port broker on hire to
  ws://localhost:<port>/. In prod, set to wss://<vm-ip>:<port>/.
- runtimePort (number, optional): the broker-allocated TCP port; mostly
  informational since runtimeEndpoint already encodes it.
- timeoutMs (number, optional): per-execute hard timeout in milliseconds
  (default 600000 = 10 min).
- agentToken (string, optional): bearer token for prod VM auth; ignored
  for the dev folder daemon.

AliasKit fields (set by onHireApproved on hire — do not edit by hand):
- aliaskit.handles (object, optional): public-safe identity handles
  (email, phone). Stored on the agent's metadata too so the UI can show
  them without going through the adapter.

Behavior notes:
- Daemon lifetime is hire-to-fire — the VM-surrogate stays alive across
  heartbeats. Each \`execute\` is one RPC into a long-lived daemon.
- Inside the daemon, Claude itself is still spawned per-wake; the daemon
  is a persistent supervisor, not a long-running Claude subprocess. See
  design.md §7c for the full lifecycle.
`;
