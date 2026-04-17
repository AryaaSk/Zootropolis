# Git Policy

Company-wide Git conventions for Zootropolis agent companies. This
document is the source of truth; the container AGENTS.md template and
the leaf skill both reference it, but the rules below are canonical.

---

## Principles

1. **Code lives on GitHub.** Every code task names a target repo.
2. **Branches only.** Nobody pushes to `main` directly — ever.
3. **PRs are the unit of review.** Leaves create PRs, rooms merge them.
4. **Conflicts go back to the author.** The leaf who wrote the code
   resolves the conflict, not the manager.
5. **Identity is worker-side.** Each leaf has its own GitHub account
   (like a freelancer). The company doesn't configure or know it
   upfront. The leaf introduces itself on its first code task.

---

## Roles

### Leaf agents (workers)

Leaves are the only agents that touch code. Their git lifecycle per
task:

```
1. Pull main             git pull origin main
2. Branch                git checkout -b <username>/<issue-id>
3. Code + commit         git commit (conventional messages)
4. Push                  git push origin <username>/<issue-id>
5. Create a PR           gh pr create --title "<issue-id>: <summary>" --body "<details>"
6. Report in artifact    include PR URL + branch + username + change summary
```

#### First task — introduce yourself

On your very first code task for a company, discover and announce your
GitHub identity:

```bash
gh api user --jq .login    # → e.g. "sunny-bot-123"
```

Post a comment on the issue: **"My GitHub handle is @sunny-bot-123."**

Your manager (room agent) will see this in the comment thread. You
don't need to repeat it on subsequent tasks — your close artifacts
will carry your username going forward.

#### Branch naming

```
<github-username>/<issue-identifier>
```

Examples: `sunny-bot-123/ZOO-42`, `leafy-dev/ZOO-43`.

One branch per issue. Don't reuse branches across tasks.

#### Commit messages

Conventional commits:

```
feat: add OAuth2 login flow
fix: handle null token in refresh endpoint
refactor: extract middleware into shared module
docs: update API reference for /auth routes
test: add integration tests for login flow
```

#### Creating the PR

After pushing your branch, create a PR back to `main`:

```bash
gh pr create \
  --title "ZOO-42: Add OAuth2 login flow" \
  --body "## Summary
Implements the login flow per ZOO-42.

## Changes
- Added src/auth/login.ts
- Updated src/routes/index.ts
- Added tests in src/auth/__tests__/

## Issue
ZOO-42"
```

Include the PR URL in your close artifact:

```markdown
## Done
**Author:** @sunny-bot-123
**PR:** [#14 — ZOO-42: Add OAuth2 login flow](https://github.com/org/repo/pull/14)
**Branch:** `sunny-bot-123/ZOO-42`

### Changes
- Added `src/auth/login.ts` — OAuth2 flow
- Updated `src/routes/index.ts` — mounted auth routes
- Added integration tests
```

#### Conflict resolution

If your manager (room agent) asks you to rebase (via a new sub-issue
like "Rebase ZOO-42 onto latest main and resolve conflicts"):

```bash
git fetch origin main
git rebase origin/main
# resolve conflicts
git push --force-with-lease origin <your-branch>
```

Then update the PR and close the rebase sub-issue. You resolve
conflicts because you wrote the code and know it best — not because
your manager is lazy.

#### Rules

- Never push to `main`.
- Never force-push (use `--force-with-lease` only during rebases when
  explicitly asked).
- Always pull latest `main` before branching.
- If the issue doesn't specify a repo URL, ask via a comment before
  starting.

---

### Room agents (team leads)

Rooms are the direct parents of leaves. They are the ONLY container
layer that interacts with Git/GitHub, and only during synthesis.

#### During decomposition

When delegating a code task to a leaf:

- **ALWAYS include the target repo URL** in the sub-issue description.
  The leaf can't clone a repo you didn't name.
- State the branch convention: `<your-github-username>/<issue-id>`.
- If the task depends on another leaf's branch (e.g., "build on top of
  the auth changes from ZOO-42"), say so explicitly and mark the
  sub-issue as `blockedBy` the dependency.

#### During synthesis (after all sub-issues close)

Each closed sub-issue's artifact contains a PR URL. Your synthesis
step is:

1. **Check each PR's status.** Use `gh pr view <url> --json
   mergeable,reviewDecision,statusCheckRollup` or read via the
   GitHub API to confirm:
   - CI is green (or no CI configured)
   - No merge conflicts with `main`

2. **Merge clean PRs.** For each PR that's green + conflict-free:
   ```bash
   gh pr merge <pr-number> --squash --delete-branch
   ```
   This is an administrative action (one API call), not code work.
   You are clicking "merge" on behalf of the team, exactly like a
   real engineering lead.

3. **If a PR has conflicts:** do NOT resolve them yourself. Create a
   new sub-issue for the original leaf:
   ```
   Title: "Rebase ZOO-42 onto latest main and resolve conflicts"
   Description: "Your PR <url> has merge conflicts with main.
   Please rebase, resolve, and force-push-with-lease. Then close
   this issue."
   assigneeAgentId: <the-leaf-who-authored-the-PR>
   parentId: <your-current-issue>
   ```
   Wait for the leaf to close the rebase issue, then retry the merge.

4. **Report in your synthesis artifact:**
   ```markdown
   ## Synthesis
   All sub-tasks completed and merged to main.

   ### Merged PRs
   - [#14 — ZOO-42: OAuth2 login](https://github.com/org/repo/pull/14) by @sunny-bot-123
   - [#15 — ZOO-43: Token refresh](https://github.com/org/repo/pull/15) by @leafy-dev

   ### Conflicts resolved
   - ZOO-42 required a rebase (ZOO-50); resolved by @sunny-bot-123
   ```

#### What rooms MUST NOT do

- Write code (even to resolve a "simple" conflict).
- Clone a repo and run builds / tests.
- Push commits under their own identity.
- Merge PRs that have failing CI or unresolved conflicts.

Rooms are managers. They route, review, and click "merge." Everything
else goes back to the leaf.

---

### Floor / Building / Campus agents

These higher-level containers **never interact with Git or GitHub.**
They decompose tasks and synthesise results — that's it.

When synthesising: collect all PR / branch references from your
children's (floor → room → leaf) artifacts and propagate them upward.
Your artifact is the company-level index of where code lives.

```markdown
## Synthesis — Engineering deliverables for Runway

### Backend (Floor 1)
Merged by Engineering Room:
- [#14 — Auth flow](https://github.com/org/repo/pull/14) by @sunny-bot-123
- [#15 — Token refresh](https://github.com/org/repo/pull/15) by @leafy-dev

### Frontend (Floor 2)
Merged by UX Room:
- [#16 — Login page](https://github.com/org/repo/pull/16) by @extra-guy
```

---

## PR lifecycle (visual)

```
Leaf creates branch
       │
       ▼
Leaf pushes + creates PR
       │
       ▼
Room checks PR status ──── conflicts? ──── yes ──► Room asks leaf to rebase
       │                                                    │
       │ clean                                              │
       ▼                                                    ▼
Room merges (squash)                            Leaf rebases + force-push-with-lease
       │                                                    │
       ▼                                                    ▼
Room reports merged PR                           Room retries merge
  in synthesis artifact
```

---

## What "no work" means (precise definition)

The container "no work" rule means: **containers do not produce
deliverables.** They don't write code, draft documents, run builds,
or create content.

Administrative actions are NOT work:
- Creating sub-issues (decomposition)
- Posting comments (communication)
- Reading PR diffs (review)
- Calling `gh pr merge` on a clean PR (routing)
- Asking a leaf to rebase (delegation)

These are management. Managers do them in real companies every day
without anyone calling it "engineering work."

The line is: **if the action creates new content that didn't exist
before, it's work.** If it routes, reviews, approves, or combines
existing content, it's management.

---

## Granting GitHub access to container agents

Container agents (`claude_local`) run inside the Paperclip server
process. To give them `gh` CLI access:

1. Create a **GitHub bot account** for the Paperclip server (e.g.
   `zootropolis-bot`). This is the account that will show as the
   "merger" on squash-merged PRs.

2. Generate a **Personal Access Token** (classic or fine-grained)
   with `repo` scope (read + write on target repos).

3. On the Paperclip server host, authenticate:
   ```bash
   echo "<token>" | gh auth login --with-token
   gh auth status   # confirm: Logged in as zootropolis-bot
   ```

4. The `claude_local` adapter spawns Claude in the Paperclip server's
   shell, which inherits `gh` auth. No per-agent config needed —
   all containers share the server's bot account.

5. **Verify** by running a manual heartbeat for a room agent and
   checking that `gh pr list` works inside its session.

Leaf agents do NOT use this account. Each leaf has its own GitHub
account configured on its own VM.

---

## See also

- `what_is_this.md` — project overview.
- `EXTERNAL_LEAF_AGENTS.md` — leaf daemon setup guide.
- `paperclip-master/server/src/onboarding-assets/zootropolis-container/AGENTS.md`
  — container AGENTS.md template (includes the Git policy for rooms).
- `paperclip-master/packages/agent-runtime/src/skills/zootropolis-paperclip.md`
  — leaf skill (includes the Git policy for workers).
