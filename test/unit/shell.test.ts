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
})
