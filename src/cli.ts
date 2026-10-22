#!/usr/bin/env node
import { runCli, systemIo } from "./commands.js"

process.exitCode = runCli(process.argv.slice(2), systemIo())
