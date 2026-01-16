# CX Tools - ScriptForge Scripts

Execute and manage ScriptForge scripts on the ConnexCS platform.

## Environment 

SCRIPTFORGE DOES NOT EXECUTE LOCALLY. Please referer to scriptforge-api-README.md for environment (and script execution) details.

## Running Scripts

### Command: `cx run`

```bash
cx run                      # Interactive: select from available scripts
cx run <id>                 # Run script by ScriptForge ID or name
cx run <id> -f <function>   # Run specific function within the script
cx run <id> -b              # Prompt for JSON request body
cx run <id> -b '{"key":"value"}'  # Inline JSON body
cx run <id> -b request.json # Load body from file
cx run <id> -s              # Silent/raw mode (for piping)
cx run <id> --no-sse        # Disable SSE log streaming
cx run <id> --log-delay 5000  # Wait 5s for late logs (default: 2000ms)
```

### Options

| Option | Alias | Description |
|--------|-------|-------------|
| `[id]` | | ScriptForge ID or name (optional, prompts if not provided) |
| `-f` | `--fn` | Function name to execute within the script |
| `-b` | `--body` | JSON request body (string, file path, or prompt) |
| `-s` | `--silent` | Raw output only (for piping) |
| `-r` | `--raw` | Alias for `--silent` |
| | `--no-sse` | Disable SSE log streaming |
| | `--log-delay` | Delay in ms to wait for late logs (default: 2000) |

### Body Input Detection

The `-b` flag automatically detects input type:

| Input | Behavior |
|-------|----------|
| No `-b` flag | Sends empty body `{}` |
| `-b` with no value | Prompts for JSON input |
| `-b '{"key":"val"}'` | Uses provided JSON string |
| `-b ./file.json` | Reads JSON from file |

---

## Writing ScriptForge Scripts

**Important:** Files in `./src/` are NOT executed locally. They run in ConnexCS's QuickJS sandbox environment.

### Module Format

Scripts must use **ES2023 module format**:

```javascript
// ./src/my-script.js

// Default export - called when no function specified
export default function main(req) {
    // req contains the request body passed via cx run -b
    return { success: true, data: req };
}

// Named exports - called with cx run <id> -f <functionName>
export function myFunction(req) {
    return { result: "hello" };
}

export async function asyncFunction(req) {
    // Async functions are supported
    return { async: true };
}
```

### Request Object Schema

The `req` parameter passed to your function:

```javascript
{
    // Body from -b flag (parsed JSON or empty object)
    "body": { ... },
    
    // Additional context may be provided by ConnexCS
    // depending on how the script is invoked
}
```

### Response Format

Return any JSON-serializable value:

```javascript
// Object response
return { status: "ok", data: [...] };

// Array response
return [1, 2, 3];

// Primitive response
return "Hello World";

// Null/undefined
return null;
```

### Running Scripts

```bash
# Run default export
cx run my-script

# Run named function
cx run my-script -f myFunction

# Run with request body
cx run my-script -b '{"userId": 123}'

# Run and pipe output
cx run my-script -s | jq '.data'
```

---

## Response Handling

The tool handles different response types:

| Response Type | Output |
|---------------|--------|
| JSON | Pretty-formatted with syntax highlighting |
| Text/HTML | Raw text output |
| Error | Error message with HTTP status code |

### Silent Mode

Use `-s` or `--raw` for machine-readable output:

```bash
# Pipe to jq
cx run my-script -s | jq '.result'

# Save to file
cx run my-script -s > output.json

# Use in shell scripts
RESULT=$(cx run my-script -s)
```

---

## SSE Log Streaming

By default, logs are streamed in real-time via Server-Sent Events (SSE).

```bash
# With log streaming (default)
cx run my-script

# Disable log streaming
cx run my-script --no-sse

# Adjust log delay (wait for late-arriving logs)
cx run my-script --log-delay 5000
```

---

## Error Handling

| Error | Solution |
|-------|----------|
| `ScriptForge does not exist` | Verify the script ID/name is correct |
| `Invalid JSON data` | Check JSON syntax in request body |
| `Function not found` | Check the function name with `-f` flag |
| `APP_ID required` | Run `cx configure:app` first |
