import { describe, expect, test } from "bun:test"
import { parseShell, simpleCommands } from "../../src/shell.js"

describe("parseShell", () => {
  test("splits pipelines and lists into simple commands", () => {
    const { cmds } = parseShell("ls -la | grep x && echo done; pwd")
    expect(cmds.map((cmd) => cmd.words)).toEqual([["ls", "-la"], ["grep", "x"], ["echo", "done"], ["pwd"]])
  })

  test("keeps quoted text together and strips the quotes", () => {
    expect(parseShell(`rg -n 'a > b' "c d" e\\ f`).cmds[0].words).toEqual(["rg", "-n", "a > b", "c d", "e f"])
  })

  test("collects redirections with their fd prefix and target", () => {
    const { cmds } = parseShell("cmd 2>/dev/null >out 2>&1 <in")
    expect(cmds[0].redirs).toEqual([
      { op: "2>", target: "/dev/null" },
      { op: ">", target: "out" },
      { op: "2>&", target: "1" },
      { op: "<", target: "in" },
    ])
  })

  test("recognises &> and >| and >>", () => {
    const ops = parseShell("a &> x; b >| y; c >> z").cmds.map((cmd) => cmd.redirs[0].op)
    expect(ops).toEqual(["&>", ">|", ">>"])
  })

  test("collects command and process substitutions", () => {
    const { subs } = parseShell('echo $(a) "$(b)" `c` <(d)')
    expect(subs).toEqual(["a", "b", "c", "d"])
  })

  test("arithmetic is not a substitution", () => {
    expect(parseShell("x=$(( 1 + 2 ))").subs).toEqual([])
  })

  test("skips heredoc bodies but not what follows", () => {
    const { cmds } = parseShell("cat <<EOF\nrm -rf /\nEOF\nls")
    expect(cmds.map((cmd) => cmd.words)).toEqual([["cat"], ["ls"]])
  })

  test("supports <<- heredocs with tab-indented delimiters", () => {
    const { cmds } = parseShell("cat <<-EOF\n\tbody\n\tEOF\nls")
    expect(cmds.map((cmd) => cmd.words)).toEqual([["cat"], ["ls"]])
  })

  test("ignores comments", () => {
    expect(parseShell("ls # rm -rf /").cmds.map((cmd) => cmd.words)).toEqual([["ls"]])
  })

  test("[[ ]] comparisons are not redirections", () => {
    const { cmds } = parseShell("[[ a > b ]] && echo yes")
    expect(cmds[0].redirs).toEqual([])
  })

  test("reports unbalanced input", () => {
    for (const bad of ["echo 'x", 'echo "x', "echo $(x", "echo `x", "echo ${x"]) {
      expect(parseShell(bad).error).toBeString()
    }
  })

  test("a redirection without a target is kept with an empty target", () => {
    expect(parseShell("ls >").cmds[0].redirs).toEqual([{ op: ">", target: "" }])
  })
})

describe("simpleCommands", () => {
  test("includes commands inside substitutions", () => {
    expect(simpleCommands("echo $(cat /etc/hostname)")).toEqual(["echo $(…)", "cat /etc/hostname"])
  })

  test("omits redirections", () => {
    expect(simpleCommands("ls -la 2>/dev/null")).toEqual(["ls -la"])
  })

  // checked against tree-sitter-bash: opencode builds one pattern per `command` node and skips cd/pushd/popd
  test("leaves out what opencode builds no pattern for, but not what it contains", () => {
    for (const [line, expected] of [
      ["B=/x", []],
      ["a=1 b=2; ls", ["ls"]],
      ["x=$(( 3 > 2 ))", []],
      ["rev=$(git rev-parse HEAD)", ["git rev-parse HEAD"]],
      ["arr=(a b c); echo ok", ["echo ok"]],
      ["export LC_ALL=C; sort f", ["sort f"]],
      ["declare -p A; local b=1; readonly c=2; typeset d; unset e", []],
      ["local y=$(cat f)", ["cat f"]],
      ["[ -f x ] && echo yes", ["echo yes"]],
      ["[[ a > b ]] || echo no", ["echo no"]],
      ["cd src && ls; pushd a; popd; X=1 cd b", ["ls"]],
      ["if [ -f x ]; then echo a; elif false; then echo b; else echo c; fi", ["echo a", "false", "echo b", "echo c"]],
      ["if ! git diff --quiet; then echo dirty; fi", ["git diff --quiet", "echo dirty"]],
      ["for f in $(ls); do wc -l $f; done", ["wc -l $f", "ls"]],
      ["for ((i = 0; i < 3; i++)); do echo $i; done", ["echo $i"]],
      ["while read -r line; do echo $line; done < list", ["read -r line", "echo $line"]],
      ["until false; do break; done", ["false", "break"]],
      ["select x in a b; do echo $x; done", ["echo $x"]],
      ["{ echo a; echo b; } | sort", ["echo a", "echo b", "sort"]],
      ["f() { echo hi; }; function g { echo ho; }", ["echo hi", "echo ho"]],
      ["X=1 git status", ["X=1 git status"]],
      ["time ls", ["time ls"]],
    ] as const) {
      expect({ line, commands: simpleCommands(line) }).toEqual({ line, commands: [...expected] })
    }
  })
})
