# CX Tools - ConnexCS Command Line Interface

`cx-tools` (command: `cx`) is a CLI for interacting with the ConnexCS SaaS platform.

**Installation:** `npm install -g @connexcs/tools`

## Quick Reference

```bash
cx -h                    # Show all available commands
cx <command> -h          # Show help for a specific command
```

## Documentation

Detailed instructions are available in the [instructions/](instructions/) folder:

| File | Description |
|------|-------------|
| [setup.instructions.md](instructions/setup.instructions.md) | Authentication, configuration, and initial setup |
| [scriptforge.instructions.md](instructions/scriptforge.instructions.md) | Running and writing ScriptForge scripts |
| [sync.instructions.md](instructions/sync.instructions.md) | Pull, push, and clear commands for syncing files |
| [sql.instructions.md](instructions/sql.instructions.md) | SQL query execution and CDR database access |
| [kv.instructions.md](instructions/kv.instructions.md) | Key-Value store operations |
| [env.instructions.md](instructions/env.instructions.md) | Environment variable management |

## Commands Summary

| Command | Description |
|---------|-------------|
| `cx configure` | Set up authentication credentials |
| `cx configure:app` | Select App ID for filtering scripts |
| `cx run [id]` | Execute a ScriptForge script |
| `cx pull` | Download scripts from ConnexCS |
| `cx push` | Upload local changes to ConnexCS |
| `cx clear` | Clear local files |
| `cx sql [query]` | Execute SQL query |
| `cx kv:list` | List KV keys |
| `cx kv:get [key]` | Get KV value |
| `cx kv:set [key]` | Set KV value |
| `cx kv:del [key]` | Delete KV key |
| `cx env:list` | List environment variables |
| `cx env:get [key]` | Get environment variable |
| `cx env:set [key]` | Set environment variable |
| `cx env:del [key]` | Delete environment variable |
| `cx ai-instructions` | Copy AI instructions to .github/ directory |

## Typical Workflow

```bash
cx configure         # Setup authentication
cx configure:app     # Select your app
cx pull              # Download scripts
# Edit ./src/*.js files
cx push -s           # Push changes
cx run <script>      # Test your script
```
