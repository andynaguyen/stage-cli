# Stage CLI agent onboarding playbook

Follow this playbook to install Stage for the user. Run the machine steps yourself. Pause only
when authentication, permissions, or an installation owned by an unknown package manager requires
the user to act.

Stage has two required components:

- `stagereview`, the CLI that prepares a diff and serves the local review UI.
- `stage-chapters`, the agent skill that generates reviewable chapters.

## Success criteria

Onboarding is complete only when:

- The latest `stagereview` release is installed globally.
- `stagereview --help` lists the `prep` and `show` commands.
- The global agent skills list contains `stage-chapters` for the user's agent.
- You have told the user how to start their first review.

## Constraints

- Run repository-dependent commands from the root of the git repository the user wants to review.
- Remove only a known npm installation automatically. Hand unknown installations back to the user.
- Never use `sudo`, delete a resolved executable manually, or modify the user's Node.js
  installation.
- Do not delete Stage's local database or application data during an upgrade or reinstall.
- Do not claim success until every verification check passes.

## Procedure

### 1. Locate the repository

Run:

```bash
git rev-parse --show-toplevel
```

If it fails, stop and ask the user to open the repository they want to review. Otherwise, change
to the printed repository root and run the remaining steps there.

### 2. Run preflight checks

Run:

```bash
node --version
npm --version
npx --version
gh --version
node -e 'if (Number(process.versions.node.split(".")[0]) < 20) process.exit(1)'
```

Require Node.js 20 or newer. If a command is missing or the Node.js check fails, stop and report
the failed prerequisite. Do not install or upgrade Node.js on the user's behalf.

### 3. Remove an existing Stage CLI installation

Record whether a `stagereview` binary is currently present:

```bash
command -v stagereview || true
```

If `stagereview` is installed in the active npm global prefix, uninstall it:

```bash
if npm list --global --depth=0 stagereview >/dev/null 2>&1; then
    npm uninstall --global stagereview
fi
hash -r 2>/dev/null || true
```

Check again:

```bash
command -v stagereview || true
```

If this still prints a path, stop. Show the path to the user and explain that another installation
is taking precedence, likely from a different Node.js version or package manager. Ask the user to
remove it with the tool that installed it, then rerun this step. Do not delete the binary directly.

### 4. Install the latest CLI release

Download the latest release tarball from this fork and install it with npm:

```bash
STAGE_TMP_DIR="$(mktemp -d)"
gh release download \
    --repo andynaguyen/stage-cli \
    --pattern "*.tgz" \
    --output "$STAGE_TMP_DIR/stagereview.tgz"
npm install --global "$STAGE_TMP_DIR/stagereview.tgz"
rm "$STAGE_TMP_DIR/stagereview.tgz"
rmdir "$STAGE_TMP_DIR"
unset STAGE_TMP_DIR
hash -r 2>/dev/null || true
```

If `gh` reports an authentication or repository access error, stop and ask the user to run:

```bash
gh auth login
```

Resume only after `gh auth status` succeeds. If npm reports a global-directory permission error,
stop and show the error. Do not retry with `sudo`.

### 5. Install the agent skill

Install or refresh `stage-chapters` globally for the agents detected on the machine:

```bash
npx --yes skills add andynaguyen/stage-cli \
    --global \
    --skill stage-chapters \
    --yes
```

This command is safe to rerun and refreshes the skill when its contents have changed.

### 6. Verify the installation

Run:

```bash
stagereview --version
stagereview --help
npx --yes skills list --global --json
```

Require all of the following:

- `stagereview --version` exits successfully.
- `stagereview --help` lists the `prep` and `show` commands.
- The global skills JSON contains an entry named `stage-chapters` for the user's agent.

Compare the installed CLI version with the latest release:

```bash
LATEST_STAGE_VERSION="$(gh release view \
    --repo andynaguyen/stage-cli \
    --json tagName \
    --jq '.tagName')"
INSTALLED_STAGE_VERSION="v$(stagereview --version)"
printf 'Latest: %s\nInstalled: %s\n' "$LATEST_STAGE_VERSION" "$INSTALLED_STAGE_VERSION"
test "$LATEST_STAGE_VERSION" = "$INSTALLED_STAGE_VERSION"
```

If the versions differ, stop and report both values.

### 7. Complete the handoff

Report the installed CLI version and confirm that `stage-chapters` was found. Tell the user to
start their first review from the target repository with:

```text
/stage-chapters
```

Some agents discover skills only when a task starts. If the current task does not recognize
`/stage-chapters`, ask the user to start a new task in the same repository and invoke it there.

## Failure handling

### `stagereview` remains after npm uninstall

Run:

```bash
type -a stagereview
npm prefix --global
```

Show the results to the user and ask them to uninstall the unexpected copy with the package
manager that owns it. Do not remove the executable manually.

### GitHub release download fails

Run:

```bash
gh auth status
gh release view --repo andynaguyen/stage-cli
```

If authentication is missing, ask the user to complete `gh auth login`, then retry the download.

### `stage-chapters` is not listed

Rerun the skill installation command and inspect its error. If installation succeeds but the
active agent still cannot see the skill, instruct the user to start a new agent task so its skill
catalog reloads.
