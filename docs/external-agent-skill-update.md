# Updating the embedded skill in your external daemon

Your `daemon.mjs` has a `PAPERCLIP_SKILL` template string (around line 349)
that gets written to `.claude/skills/zootropolis-paperclip/SKILL.md` on the
daemon's first bootstrap. The master copy in the Paperclip repo
(`packages/agent-runtime/src/skills/zootropolis-paperclip.md`) has been
rewritten (Phase Q1) — your daemon needs a corresponding update so newly-
bootstrapped agent folders get the current skill.

This is not strictly required to fix issue closure — the wake-payload
preamble (Phase P2, enhanced in Q2) already reaches your agent on every
heartbeat with the mandatory-artifact rule in it. The skill file is
reference material Claude can re-consult mid-conversation. But if you want
them to match, paste the replacement below.

## What changed

- The skill now declares clearly that **leaves don't delegate.** The whole
  "How you delegate" section was removed. Leaves are terminal agents; they
  just close their assigned issue with an artifact.
- `artifact is MANDATORY` is called out with hard-reject warning.
- Bad-pattern examples: empty artifact, marker-mid-stdout, multiple markers.
- Identity is via env vars (v1.2+), not `identity.json`.

## How to apply

1. Open `~/Desktop/zootropolis-agent-1/daemon.mjs`.
2. Find the line `const PAPERCLIP_SKILL = \`# Zootropolis Paperclip Skill` (~L349).
3. Replace the entire template literal (up to the closing backtick) with
   the content in [`packages/agent-runtime/src/skills/zootropolis-paperclip.md`](../paperclip-master/packages/agent-runtime/src/skills/zootropolis-paperclip.md)
   wrapped in backticks. Mind the template-literal escape rules: any
   literal backtick in the skill text becomes `\``, any literal `${`
   becomes `\${`. The current skill has neither, so a raw paste works.
4. Delete the stale skill file so your next bootstrap re-writes it:
   ```bash
   rm -rf ~/Desktop/zootropolis-agent-1/.claude/skills
   ```
5. Restart the daemon. Next heartbeat's bootstrap call re-populates
   `.claude/skills/zootropolis-paperclip/SKILL.md` with the new content.

Verify:
```bash
grep -c MANDATORY ~/Desktop/zootropolis-agent-1/.claude/skills/zootropolis-paperclip/SKILL.md
# should print 1 or 2
```

## Convenience: sync script

If you hate copy-pasting, add this to your agent's package.json as a
one-off dev script:

```json
{
  "scripts": {
    "sync-skill": "cp ../Zootropolis/paperclip-master/packages/agent-runtime/src/skills/zootropolis-paperclip.md .claude/skills/zootropolis-paperclip/SKILL.md"
  }
}
```

Run `npm run sync-skill` whenever the master skill is updated and restart
the daemon. Scales to zero maintenance.
