# CX Tools - Key-Value Store (KV)

Manage KV (Key-Value) store records in ConnexCS.

---

## Commands Overview

| Command | Description |
|---------|-------------|
| `cx kv:list` | List all KV keys |
| `cx kv:get <key>` | Get a KV record by key |
| `cx kv:set <key>` | Set/update a KV record |
| `cx kv:del <key>` | Delete a KV record |

---

## List Keys

### Command: `cx kv:list`

```bash
cx kv:list                    # List all KV keys
cx kv:list -s                 # Silent mode
cx kv:list -s | jq '.[].id'   # Extract key names
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
        "id": "my-config",
        "created_at": "2024-01-15T10:30:00Z",
        "updated_at": "2024-01-16T14:20:00Z"
    },
    {
        "id": "user-settings",
        "created_at": "2024-01-10T08:00:00Z",
        "updated_at": "2024-01-10T08:00:00Z"
    }
]
```

---

## Get Value

### Command: `cx kv:get`

```bash
cx kv:get <key>               # Get value by key
cx kv:get my-config           # Example
cx kv:get my-config -s        # Silent mode
cx kv:get                     # Interactive: prompts for key
```

### Options

| Option | Alias | Description |
|--------|-------|-------------|
| `[key]` | | Key ID (optional, prompts if not provided) |
| `-s` | `--silent` | Raw output only (for piping) |
| `-r` | `--raw` | Alias for `--silent` |

### Response Schema

```json
{
    "id": "my-config",
    "value": {
        "setting1": true,
        "setting2": "value",
        "nested": {
            "key": "value"
        }
    },
    "created_at": "2024-01-15T10:30:00Z",
    "updated_at": "2024-01-16T14:20:00Z"
}
```

### Examples

```bash
# Get and extract specific field
cx kv:get my-config -s | jq '.value.setting1'

# Save to file
cx kv:get my-config -s > backup.json
```

---

## Set Value

### Command: `cx kv:set`

```bash
cx kv:set <key> -v '<value>'      # Set with inline value
cx kv:set my-config -v '{"a":1}'  # Set JSON object
cx kv:set my-config -v "string"   # Set string value
cx kv:set my-config -v ./data.json # Set from file
cx kv:set my-config -v            # Prompt for value
cx kv:set                         # Interactive: prompts for key and value
```

### Options

| Option | Alias | Description |
|--------|-------|-------------|
| `[key]` | | Key ID (optional, prompts if not provided) |
| `-v` | `--value` | Value to set (JSON, string, or file path) |
| `-s` | `--silent` | Raw output only (for piping) |
| `-r` | `--raw` | Alias for `--silent` |

### Value Input Detection

The `-v` flag automatically detects input type:

| Input | Behavior |
|-------|----------|
| No `-v` flag | Prompts for value |
| `-v` with no value | Prompts for value input |
| `-v '{"key":"val"}'` | Parses as JSON object |
| `-v "plain string"` | Stores as string |
| `-v ./file.json` | Reads and parses JSON from file |
| `-v ./file.txt` | Reads file as string |

### Value Schema

Values can be any JSON-serializable data:

```javascript
// Object
{ "key": "value", "nested": { "a": 1 } }

// Array
[1, 2, 3, "four", { "five": 5 }]

// String
"Hello World"

// Number
42

// Boolean
true

// Null
null
```

### Examples

```bash
# Set JSON object
cx kv:set config -v '{"debug": true, "timeout": 30}'

# Set array
cx kv:set allowed-ips -v '["192.168.1.1", "10.0.0.1"]'

# Set from file
echo '{"version": "1.0.0"}' > config.json
cx kv:set app-config -v ./config.json

# Update existing key (upsert)
cx kv:set config -v '{"debug": false}'
```

---

## Delete Key

### Command: `cx kv:del`

```bash
cx kv:del <key>               # Delete by key
cx kv:del my-config           # Example
cx kv:del my-config -s        # Silent mode
cx kv:del                     # Interactive: prompts for key
```

### Options

| Option | Alias | Description |
|--------|-------|-------------|
| `[key]` | | Key ID to delete (optional, prompts if not provided) |
| `-s` | `--silent` | Raw output only (for piping) |
| `-r` | `--raw` | Alias for `--silent` |

---

## Using KV in ScriptForge

Access KV store from within ScriptForge scripts:

```javascript
// ./src/my-script.js
export default async function main(req) {
    // Access KV store via ConnexCS APIs
    // Refer to ConnexCS ScriptForge documentation for API details
    
    return { success: true };
}
```

*Note: KV access within ScriptForge uses ConnexCS internal APIs. See ConnexCS documentation for details.*

---

## Error Handling

| Error | Solution |
|-------|----------|
| `Key not found` | Verify the key exists with `cx kv:list` |
| `Invalid JSON` | Check JSON syntax in value |
| `File not found` | Verify file path exists |
| `Permission denied` | Check account permissions |
