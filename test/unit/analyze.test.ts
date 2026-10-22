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
