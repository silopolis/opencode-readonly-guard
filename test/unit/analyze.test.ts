import { describe, expect, test } from "bun:test"
import { analyze, createAnalyzer } from "../../src/analyze.js"
import { loadRules } from "../../src/rules.js"

const reason = (command: string): string | undefined => {
  const verdict = analyze(command)
  return verdict.block ? verdict.reason : undefined
}

describe("analyze", () => {
  test("reads are not blocked", () => {
    for (const command of ["ls -la", "git log --oneline | head", "cat x 2>&1", "find . -name '*.ts'"]) {
      expect(analyze(command)).toEqual({ block: false })
    }
  })

  test("blocks redirections in every position", () => {
    for (const command of [
      "cat x > f",
      "ls | cat > f",
      "{ ls; } > f",
      "(ls) > f",
      "for f in a; do cat $f >> out; done",
      "echo $(ls > f)",
      "bash -c 'ls > f'",
    ]) {
      expect(reason(command)).toContain("write redirection")
    }
  })

  test("allows output to the null device and fd duplication", () => {
    for (const command of ["ls > /dev/null", "ls 2>&1", "ls >&2", "ls &>/dev/null", "ls 2>/dev/stderr"]) {
      expect(analyze(command)).toEqual({ block: false })
    }
  })

  test("tee is only allowed towards the null device", () => {
    expect(analyze("ls | tee /dev/null")).toEqual({ block: false })
    expect(reason("ls | tee out.txt")).toContain('tee writes to "out.txt"')
  })

  test("looks through wrappers", () => {
    for (const command of [
      "sudo rm x",
      "env A=1 rm x",
      "timeout 5 rm x",
      "nice -n 5 rm x",
      "xargs rm",
      "rtk proxy rm x",
    ]) {
      expect(reason(command)).toContain('"rm" modifies files')
    }
  })

  test("command -v is a lookup, not an execution", () => {
    expect(analyze("command -v rm")).toEqual({ block: false })
  })

  test("looks into find -exec and fd -x", () => {
    expect(analyze("find . -exec grep foo {} ;")).toEqual({ block: false })
    expect(reason("find . -exec rm {} +")).toContain("find -exec")
    expect(analyze("fd x -x wc -l")).toEqual({ block: false })
    expect(reason("fd x -x rm")).toContain("fd -x")
  })

  test("git: reads pass, writes are blocked", () => {
    for (const command of ["git status", "git branch -a", "git tag -l", "git stash list", "git config --get a.b"]) {
      expect(analyze(command)).toEqual({ block: false })
    }
    for (const command of ["git commit -m x", "git branch x", "git tag v1", "git stash", "git config a.b c"]) {
      expect(analyze(command).block).toBe(true)
    }
  })

  test("git remote: only listing, show and get-url are reads, whatever options come first", () => {
    for (const command of [
      "git remote -v add o https://x",
      "git remote --verbose rename a b",
      "git remote -v remove o",
      "git remote -v set-url o https://y",
      "git remote -v update",
      "git remote prune origin",
    ]) {
      expect({ command, reason: reason(command) }).toEqual({ command, reason: expect.stringContaining("git remote") })
    }
    for (const command of [
      "git remote",
      "git remote -v",
      "git remote show origin",
      "git remote -v show origin",
      "git remote get-url origin",
      "git remote get-url --push origin",
    ]) {
      expect({ command, verdict: analyze(command) }).toEqual({ command, verdict: { block: false } })
    }
  })

  test("git global options before the subcommand are skipped", () => {
    expect(reason("git -C repo push")).toContain("git push")
    expect(analyze("git -C repo log")).toEqual({ block: false })
  })

  test("package managers: only mutating subcommands are blocked", () => {
    expect(reason("npm install")).toContain("npm install")
    expect(reason("bun add x")).toContain("bun add")
    expect(analyze("npm --version")).toEqual({ block: false })
    expect(analyze("cargo tree")).toEqual({ block: false })
  })

  test("curl and wget", () => {
    expect(analyze("curl -s https://x")).toEqual({ block: false })
    expect(analyze("curl -o /dev/null https://x")).toEqual({ block: false })
    expect(reason("curl -o f https://x")).toContain("curl")
    expect(reason("curl -O https://x")).toContain("curl")
    expect(analyze("wget -qO- https://x")).toEqual({ block: false })
    expect(reason("wget https://x")).toContain("wget")
  })

  test("archives: listing is fine, extracting is not", () => {
    expect(analyze("tar -tzf a.tgz")).toEqual({ block: false })
    expect(reason("tar xzf a.tgz")).toContain("tar")
    expect(analyze("unzip -l a.zip")).toEqual({ block: false })
    expect(reason("unzip a.zip")).toContain("unzip")
    expect(analyze("gzip -c f")).toEqual({ block: false })
    expect(reason("gzip f")).toContain("gzip")
  })

  test("systemctl: status is fine, changes are not", () => {
    expect(analyze("systemctl status sshd")).toEqual({ block: false })
    expect(reason("systemctl restart sshd")).toContain("systemctl restart")
  })

  test("sed -i and perl -i edit in place", () => {
    expect(analyze("sed -n 1p f")).toEqual({ block: false })
    expect(reason("sed -i s/a/b/ f")).toContain("sed -i")
    expect(reason("perl -pi -e s/a/b/ f")).toContain("perl -i")
  })

  test("herdr: subcommands that write files or the installation are blocked", () => {
    for (const [command, why] of [
      ["herdr update", "herdr update"],
      ["herdr update --handoff", "herdr update"],
      ["herdr config reset-keys", "herdr config reset-keys"],
      ["herdr worktree create --branch x", "herdr worktree create"],
      ["herdr worktree remove --path p", "herdr worktree remove"],
      ["herdr integration install opencode", "herdr integration install"],
      ["herdr integration uninstall opencode", "herdr integration uninstall"],
      ["herdr session delete old", "herdr session delete"],
      ["herdr plugin install owner/repo --yes", "herdr plugin install"],
      ["herdr plugin update", "herdr plugin update"],
    ] as const) {
      expect({ command, reason: reason(command) }).toEqual({ command, reason: expect.stringContaining(why) })
    }
  })

  test("herdr: global options and wrappers do not hide a write", () => {
    for (const command of [
      "herdr --machine box worktree create",
      "herdr --session work --machine=box worktree remove",
      "herdr --remote me@host --remote-keybindings local update",
      "sudo herdr update",
      "env A=1 herdr config reset-keys",
      "/home/me/.local/bin/herdr update",
    ]) {
      expect({ command, blocked: analyze(command).block }).toEqual({ command, blocked: true })
    }
  })

  test("herdr: reads, UI and the other mutating subcommands are not blocked", () => {
    for (const command of [
      "herdr agent list",
      "herdr worktree list",
      "herdr integration status",
      "herdr plugin list --json",
      "herdr session list",
      "herdr tab rename w1:t1 plan ready",
      "herdr notification show hi",
      "herdr agent prompt reviewer 'update the docs'",
      "herdr pane send-text w1:p2 update",
      "herdr pane read w1:p1 --source recent --lines 5",
      "herdr --version",
    ]) {
      expect({ command, verdict: analyze(command) }).toEqual({ command, verdict: { block: false } })
    }
  })

  test("herdr: `api schema --output` writes a file, plain `api schema` does not", () => {
    expect(reason("herdr api schema --output /tmp/schema.json")).toContain("herdr api schema --output")
    expect(reason("herdr api schema --output=/tmp/schema.json")).toContain("herdr api schema --output")
    expect(analyze("herdr api schema --json")).toEqual({ block: false })
    expect(analyze("herdr api snapshot")).toEqual({ block: false })
  })

  test("herdr: `pane run` is blocked when what it types would be", () => {
    for (const command of [
      "herdr pane run w1:p2 rm -rf build",
      "herdr pane run w1:p2 'rm -rf build'",
      "herdr pane run w1:p2 'echo hi > notes.txt'",
      "herdr pane run w1:p2 git commit -m x",
      "herdr --machine box pane run w1:p2 npm install",
      "herdr pane run w1:p2 bash -c 'cat a > b'",
    ]) {
      expect({ command, reason: reason(command) }).toEqual({
        command,
        reason: expect.stringContaining("herdr pane run"),
      })
    }
    // a read-only command in the pane is left to the permission rules (it asks)
    expect(analyze("herdr pane run w1:p2 ls -la")).toEqual({ block: false })
    expect(analyze("herdr pane run w1:p2 'git log --oneline | head'")).toEqual({ block: false })
  })

  test("unparsable input is blocked rather than guessed at", () => {
    expect(reason("echo 'oops")).toContain("could not parse")
  })

  test("deeply nested evaluation is refused", () => {
    let command = "echo hi > f"
    for (let i = 0; i < 8; i++) command = `bash -c '${command.replaceAll("'", `'\\''`)}'`
    expect(analyze(command).block).toBe(true)
  })
})

describe("createAnalyzer", () => {
  test("uses the supplied command classification", () => {
    const commands = { ...loadRules().commands, hardWrite: ["whoami"] }
    const custom = createAnalyzer(commands)
    expect(custom.analyze("whoami").block).toBe(true)
    expect(analyze("whoami").block).toBe(false)
  })

  test("is cached per classification", () => {
    const { commands } = loadRules()
    expect(createAnalyzer(commands)).toBe(createAnalyzer(commands))
  })
})
