# CX Tools - Environment Variables

Manage server-side environment variables in ConnexCS.

---

## Commands Overview

| Command | Description |
|---------|-------------|
| `cx env:list` | List all environment variables |
| `cx env:get <key>` | Get an environment variable by key |
| `cx env:set <key>` | Set/update an environment variable |
| `cx env:del <key>` | Delete an environment variable |

---

## List Variables

### Command: `cx env:list`

```bash
cx env:list                   # List all env vars
cx env:list -s                # Silent mode
cx env:list -s | jq '.[].key' # Extract variable names
```

### Options

| Option | Alias | Description |
|--------|-------|-------------|
| `-s` | `--silent` | Raw output only (for piping) |
| `-r` | `--raw` | Alias for `--silent` |

### Response Schema

```json
[
    {
        "key": "API_KEY",
        "value": "sk-xxxx..."
    },
    {
        "key": "DEBUG_MODE",
        "value": "true"
    },
    {
        "key": "DATABASE_URL",
        "value": "postgres://..."
    }
]
```

---

## Get Variable

### Command: `cx env:get`

```bash
cx env:get <key>              # Get variable by key
cx env:get API_KEY            # Example
cx env:get API_KEY -s         # Silent mode
cx env:get                    # Interactive: prompts for key
```

### Options

| Option | Alias | Description |
|--------|-------|-------------|
| `[key]` | | Variable key (optional, prompts if not provided) |
| `-s` | `--silent` | Raw output only (for piping) |
| `-r` | `--raw` | Alias for `--silent` |

### Response Schema

```json
{
    "key": "API_KEY",
    "value": "sk-xxxx..."
}
```

### Examples

```bash
# Get value only
cx env:get API_KEY -s | jq -r '.value'

# Use in shell script
API_KEY=$(cx env:get API_KEY -s | jq -r '.value')
```

---

## Set Variable

### Command: `cx env:set`

```bash
cx env:set <key> -v '<value>'     # Set with inline value
cx env:set API_KEY -v 'sk-xxxx'   # Example
cx env:set CONFIG -v ./config.txt # Set from file
cx env:set API_KEY -v             # Prompt for value
cx env:set                        # Interactive: prompts for key and value
```

### Options

| Option | Alias | Description |
|--------|-------|-------------|
| `[key]` | | Variable key (optional, prompts if not provided) |
| `-v` | `--value` | Value to set (string or file path) |
| `-s` | `--silent` | Raw output only (for piping) |
| `-r` | `--raw` | Alias for `--silent` |

### Value Input Detection

The `-v` flag automatically detects input type:

| Input | Behavior |
|-------|----------|
| No `-v` flag | Prompts for value |
| `-v` with no value | Prompts for value input |
| `-v 'my-value'` | Uses string directly |
| `-v ./file.txt` | Reads file contents as string |

### Examples

```bash
# Set string value
cx env:set API_KEY -v 'sk-1234567890abcdef'

# Set boolean-like value
cx env:set DEBUG_MODE -v 'true'

# Set from file
cx env:set SSL_CERT -v ./certificate.pem

# Update existing variable (upsert)
cx env:set API_KEY -v 'sk-newkey123'
```

---

## Delete Variable

### Command: `cx env:del`

```bash
cx env:del <key>              # Delete by key
cx env:del API_KEY            # Example
cx env:del API_KEY -s         # Silent mode
cx env:del                    # Interactive: prompts for key
```

### Options

| Option | Alias | Description |
|--------|-------|-------------|
| `[key]` | | Variable key to delete (optional, prompts if not provided) |
| `-s` | `--silent` | Suppress decorative output |
| `-r` | `--raw` | Alias for `--silent` |

---

## Using Environment Variables in ScriptForge

Access environment variables from within ScriptForge scripts using `process.env`:

```javascript
// ./src/my-script.js
export async function main() {
    // Access environment variables via process.env
    const apiKey = process.env.API_KEY;
    const debugMode = process.env.DEBUG_MODE;
    
    return {
        apiKey: apiKey,
        debug: debugMode === 'true'
    };
}
```

> **⚠️ Response Serialization:** All responses are serialized as JSON. This means:
> - **BigInt** values are not supported (convert to string or number first)
> - **Circular references** in nested objects will fail
> - **Functions, undefined, and Symbols** are stripped from responses
> - **Date objects** are converted to ISO strings
>
> Always ensure your return values are JSON-serializable.

### Example: Setting and Using an Environment Variable

```bash
# Set an environment variable
cx env:set HELLO -v 'World'
```

```javascript
// ./src/hello.js
export async function main() {
    return process.env.HELLO;  // Returns: "World"
}
```

```bash
# Run the script
cx run hello
# Output: "World"
```

### Common Patterns

```javascript
// ./src/config-example.js

// Check if variable exists
export function checkConfig() {
    if (!process.env.API_KEY) {
        return { error: 'API_KEY not configured' };
    }
    return { status: 'configured' };
}

// Use with default values
export function getTimeout() {
    const timeout = process.env.TIMEOUT || '30';
    return parseInt(timeout, 10);
}

// Access multiple env vars
export async function main() {
    return {
        apiKey: process.env.API_KEY,
        baseUrl: process.env.BASE_URL,
        debug: process.env.DEBUG_MODE === 'true',
        timeout: parseInt(process.env.TIMEOUT || '30', 10)
    };
}
```

---

## Local cx.env File

When using `cx pull`, environment variable metadata may be stored in `cx.env`:

```env
# Synced environment variables
# This file tracks which env vars are managed by cx-tools
API_KEY=synced
DEBUG_MODE=synced
```

This file is used for tracking purposes and is cleared with `cx clear`.

---

## Best Practices

1. **Naming Convention**: Use SCREAMING_SNAKE_CASE for variable names
2. **Sensitive Data**: Store API keys, passwords, and secrets as env vars
3. **Don't Commit**: Never commit sensitive values to version control
4. **Use Files**: For multi-line values (certificates, keys), use file input

---

## Error Handling

| Error | Solution |
|-------|----------|
| `Variable not found` | Verify key exists with `cx env:list` |
| `File not found` | Verify file path exists |
| `Permission denied` | Check account permissions |
| `Invalid key name` | Use valid variable name format |
