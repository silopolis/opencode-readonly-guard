/**
 * A small POSIX-ish shell tokenizer. It does not execute or expand anything: it splits a command line into simple
 * commands (words + redirections) and collects the bodies of command substitutions so they can be analyzed too.
 *
 * Handled: quotes, escapes, comments, heredocs (bodies skipped), `$(…)`, backticks, process substitution,
 * `((…))`, `[[ … ]]`, pipes, lists, groups and subshells. Anything it cannot parse is reported as an error and
 * treated as unsafe by the analyzer.
 */

export interface Redirection {
  /** The operator including an optional fd prefix, e.g. `>`, `2>`, `&>`, `>>`, `3<>`. */
  op: string
  target: string
}

export interface SimpleCommand {
  words: string[]
  redirs: Redirection[]
}

export interface ParsedShell {
  cmds: SimpleCommand[]
  /** Bodies of `$(…)`, backtick and process substitutions found anywhere in the input. */
  subs: string[]
  error?: string
}

const REDIRECT_OPERATORS = ["&>>", "&>", "<<<", "<<-", "<<", "<>", "<&", ">>", ">|", ">&", "<", ">"]

/** Index of the `close` that matches an already-opened `open`, skipping quotes and nesting; -1 if unbalanced. */
function closeIndex(src: string, start: number, open: string, close: string): number {
  let depth = 1
  let i = start
  while (i < src.length) {
    const c = src[i]
    if (c === "\\") {
      i += 2
      continue
    }
    if (c === "'") {
      const j = src.indexOf("'", i + 1)
      if (j < 0) return -1
      i = j + 1
      continue
    }
    if (c === '"') {
      let j = i + 1
      while (j < src.length && src[j] !== '"') j += src[j] === "\\" ? 2 : 1
      if (j >= src.length) return -1
      i = j + 1
      continue
    }
    if (c === "`") {
      const j = backtickIndex(src, i + 1)
      if (j < 0) return -1
      i = j + 1
      continue
    }
    if (c === open) depth++
    else if (c === close && --depth === 0) return i
    i++
  }
  return -1
}

function backtickIndex(src: string, start: number): number {
  let i = start
  while (i < src.length) {
    if (src[i] === "\\") {
      i += 2
      continue
    }
    if (src[i] === "`") return i
    i++
  }
  return -1
}

export function parseShell(src: string): ParsedShell {
  const cmds: SimpleCommand[] = []
  const subs: string[] = []
  let cur: SimpleCommand = { words: [], redirs: [] }
  let word = ""
  let inWord = false
  let pending: string | null = null // redirection operator waiting for its target word
  let heredocNext: boolean | null = null // next word is a heredoc delimiter (value: strip leading tabs)
  const heredocs: { delim: string; strip: boolean }[] = []
  let inDoubleBracket = false // inside [[ … ]], where < and > are comparison operators
  const n = src.length
  let i = 0

  const addSub = (body: string) => {
    if (body.startsWith("(") && body.endsWith(")")) return // $(( arithmetic ))
    subs.push(body)
  }
  const pushWord = () => {
    if (!inWord) return
    if (heredocNext !== null) {
      heredocs.push({ delim: word, strip: heredocNext })
      heredocNext = null
    } else if (pending !== null) {
      cur.redirs.push({ op: pending, target: word })
      pending = null
    } else {
      if (word === "[[" && cur.words.length === 0) inDoubleBracket = true
      else if (word === "]]") inDoubleBracket = false
      cur.words.push(word)
    }
    word = ""
    inWord = false
  }
  const endCommand = () => {
    pushWord()
    if (pending !== null) {
      cur.redirs.push({ op: pending, target: "" })
      pending = null
    }
    if (cur.words.length || cur.redirs.length) cmds.push(cur)
    cur = { words: [], redirs: [] }
  }
  const fail = (error: string): ParsedShell => ({ cmds, subs, error })

  while (i < n) {
    const c = src[i]
    if (c === "\\") {
      if (src[i + 1] === "\n") {
        i += 2
        continue
      }
      word += src[i + 1] ?? ""
      inWord = true
      i += 2
      continue
    }
    if (c === "'") {
      const j = src.indexOf("'", i + 1)
      if (j < 0) return fail("unbalanced single quote")
      word += src.slice(i + 1, j)
      inWord = true
      i = j + 1
      continue
    }
    if (c === "$" && src[i + 1] === "'") {
      let j = i + 2
      while (j < n && src[j] !== "'") j += src[j] === "\\" ? 2 : 1
      if (j >= n) return fail("unbalanced $' quote")
      word += src.slice(i + 2, j)
      inWord = true
      i = j + 1
      continue
    }
    if (c === '"') {
      let j = i + 1
      let literal = ""
      while (j < n && src[j] !== '"') {
        if (src[j] === "\\") {
          literal += src[j + 1] ?? ""
          j += 2
          continue
        }
        if (src[j] === "$" && src[j + 1] === "(") {
          const k = closeIndex(src, j + 2, "(", ")")
          if (k < 0) return fail("unbalanced $(")
          addSub(src.slice(j + 2, k))
          literal += "$(…)"
          j = k + 1
          continue
        }
        if (src[j] === "`") {
          const k = backtickIndex(src, j + 1)
          if (k < 0) return fail("unbalanced backtick")
          subs.push(src.slice(j + 1, k))
          literal += "`…`"
          j = k + 1
          continue
        }
        literal += src[j]
        j++
      }
      if (j >= n) return fail("unbalanced double quote")
      word += literal
      inWord = true
      i = j + 1
      continue
    }
    if (c === "$" && src[i + 1] === "(") {
      const k = closeIndex(src, i + 2, "(", ")")
      if (k < 0) return fail("unbalanced $(")
      addSub(src.slice(i + 2, k))
      word += "$(…)"
      inWord = true
      i = k + 1
      continue
    }
    if (c === "$" && src[i + 1] === "{") {
      const k = closeIndex(src, i + 2, "{", "}")
      if (k < 0) return fail("unbalanced ${")
      word += src.slice(i, k + 1)
      inWord = true
      i = k + 1
      continue
    }
    if (c === "`") {
      const k = backtickIndex(src, i + 1)
      if (k < 0) return fail("unbalanced backtick")
      subs.push(src.slice(i + 1, k))
      word += "`…`"
      inWord = true
      i = k + 1
      continue
    }
    if (c === "#" && !inWord) {
      while (i < n && src[i] !== "\n") i++
      continue
    }
    if (c === " " || c === "\t" || c === "\r") {
      pushWord()
      i++
      continue
    }
    if (c === "\n") {
      endCommand()
      i++
      for (const h of heredocs.splice(0)) {
        while (i < n) {
          const nl = src.indexOf("\n", i)
          const end = nl < 0 ? n : nl
          const line = src.slice(i, end)
          i = end + 1
          if ((h.strip ? line.replace(/^\t+/, "") : line) === h.delim) break
        }
      }
      continue
    }
    if ((c === "<" || c === ">") && src[i + 1] === "(") {
      const k = closeIndex(src, i + 2, "(", ")")
      if (k < 0) return fail("unbalanced process substitution")
      addSub(src.slice(i + 2, k))
      if (c === ">") cur.redirs.push({ op: ">(", target: "(process substitution)" })
      word += `${c}(…)`
      inWord = true
      i = k + 1
      continue
    }
    if (inDoubleBracket && (c === "<" || c === ">")) {
      word += c
      inWord = true
      i++
      continue
    }
    if (c === ">" || c === "<" || (c === "&" && src[i + 1] === ">")) {
      let fd = ""
      if (inWord && /^(\d+|\{[A-Za-z_][A-Za-z0-9_]*\})$/.test(word)) {
        fd = word
        word = ""
        inWord = false
      } else {
        pushWord()
      }
      const op = REDIRECT_OPERATORS.find((candidate) => src.startsWith(candidate, i))!
      i += op.length
      if (op === "<<" || op === "<<-") {
        heredocNext = op === "<<-"
        continue
      }
      pending = fd + op
      continue
    }
    if (c === "|") {
      endCommand()
      i += src[i + 1] === "|" || src[i + 1] === "&" ? 2 : 1
      continue
    }
    if (c === "&") {
      endCommand()
      i += src[i + 1] === "&" ? 2 : 1
      continue
    }
    if (c === ";") {
      endCommand()
      i += src[i + 1] === ";" ? 2 : 1
      continue
    }
    if (c === "(") {
      if (inWord) {
        word += c // name() or arr=(
        i++
        continue
      }
      if (src[i + 1] === "(") {
        const k = closeIndex(src, i + 1, "(", ")") // (( arithmetic ))
        if (k < 0) return fail("unbalanced ((")
        endCommand()
        i = k + 1
        continue
      }
      endCommand()
      i++
      continue
    }
    if (c === ")") {
      endCommand()
      i++
      continue
    }
    word += c
    inWord = true
    i++
  }
  endCommand()
  return { cmds, subs }
}

/**
 * Every simple command in the input as the text opencode's permission rules would see it (approximately:
 * words joined by single spaces, redirections omitted), including those inside command substitutions.
 */
export function simpleCommands(src: string, depth = 0): string[] {
  if (depth > 5) return []
  const parsed = parseShell(src)
  const out = parsed.cmds.filter((cmd) => cmd.words.length).map((cmd) => cmd.words.join(" "))
  for (const sub of parsed.subs) out.push(...simpleCommands(sub, depth + 1))
  return out
}
