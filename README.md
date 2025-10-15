# cx-tools

ConnexCS Tools

## Installation

```bash
npm install -g connexcs-tools
```

## Usage

### Configure Credentials

Set up your ConnexCS username and password credentials that will be validated and stored in a `.env` file:

```bash
# Interactive prompts (recommended)
cx configure

# Using command line flags
cx configure --username myuser --password mypass

# Force overwrite existing .env file
cx configure --force
```

### Configure App

Select an App ID to use for API requests. This requires credentials to be configured first:

```bash
# Interactive app selection
cx configure:app
```

This command will:

1. Fetch all available apps from your ConnexCS account
2. Display them in a selectable list
3. Save the selected App ID to your `.env` file

### Run ScriptForge Scripts

Execute ScriptForge scripts on your ConnexCS platform:

```bash
# Interactive mode - fetches and displays available scripts
cx run

# If APP_ID is configured, only shows scripts for that app
# Otherwise, shows all scripts

# Provide ScriptForge ID as argument
cx run 12345

# No body (default)
cx run 12345

# Prompt for body input
cx run 12345 -b

# Provide JSON request body
cx run 12345 -b '{"key": "value"}'

# Use a JSON file as request body
cx run 12345 -b request.json

# Silent/raw mode for piping
cx run 12345 -s | jq '.result'
cx run 12345 --raw > output.json
```

### Execute SQL Queries

Query the CDR database or Userspace databases:

```bash
# Interactive mode - prompts for SQL query
cx sql

# Provide SQL query as argument
cx sql "SELECT * FROM cdr WHERE dt > DATE_SUB(NOW(), INTERVAL 1 DAY) LIMIT 10"

# Return results as CSV
cx sql "SELECT * FROM cdr dt > DATE_SUB(NOW(), INTERVAL 1 DAY) LIMIT 10" --csv

# Silent mode for piping to files
cx sql "SELECT * FROM cdr WHERE dt > DATE_SUB(NOW(), INTERVAL 1 DAY) duration > 60" -s > results.json
cx sql "SELECT * FROM cdr dt > DATE_SUB(NOW(), INTERVAL 1 DAY) LIMIT 100" --csv -s > data.csv

# Pipe to other tools
cx sql "SELECT dest_number, COUNT(0) as calls FROM cdr dt > DATE_SUB(NOW(), INTERVAL 1 DAY) LIMIT 100" -s | jq '.[] | select(.calls > 10)'
```

### Key-Value Store Operations

Manage KV (Key-Value) store records:

```bash
# List all KV keys
cx kv:list

# List keys in silent mode for piping
cx kv:list -s | jq '.[] | .id'

# Get a specific KV record
cx kv:get mykey

# Get with silent mode
cx kv:get mykey -s

# Set a KV record (upsert)
cx kv:set mykey -v '{"data": "value"}'

# Set a simple string value
cx kv:set mykey -v "Hello World"

# Set from a JSON file
cx kv:set mykey -v ./data.json

# Set from a text file
cx kv:set config -v ./config.txt

# Interactive mode - prompts for key and value
cx kv:set

# Delete a KV record
cx kv:del mykey

# Delete with silent mode
cx kv:del mykey -s

# Interactive delete - prompts for key
cx kv:del

# Pipe and process
cx kv:get config -s | jq '.settings.enabled'
```

### Configure Command Options

**configure**

- `-u, --username <username>`: Specify username via command line
- `-p, --password <password>`: Specify password via command line  
- `-f, --force`: Force overwrite existing .env file

**configure:app**

- No options - interactive app selection from available apps

### Run Command Options

- `[id]`: ScriptForge ID (optional, will be prompted if not provided)
- `-b, --body [body]`: Include JSON request body (optionally provide JSON string or file path)
  - No `-b` flag: Sends empty body `{}`
  - `-b` with no value: Prompts for JSON input
  - `-b` with value: Uses provided JSON or file path
- `-s, --silent`: Silent/raw mode - outputs only response data for piping
- `-r, --raw`: Alias for `--silent`

### SQL Command Options

- `[query]`: SQL query (optional, will be prompted if not provided)
- `--csv`: Return results in CSV format instead of JSON
- `-s, --silent`: Silent/raw mode - outputs only response data for piping
- `-r, --raw`: Alias for `--silent`

### KV Command Options

**kv:list**

- `-s, --silent`: Silent/raw mode - outputs only response data for piping
- `-r, --raw`: Alias for `--silent`

**kv:get**

- `[id]`: Key ID (optional, will be prompted if not provided)
- `-s, --silent`: Silent/raw mode - outputs only response data for piping
- `-r, --raw`: Alias for `--silent`

**kv:set**

- `[id]`: Key ID (optional, will be prompted if not provided)
- `-v, --value [value]`: Value to set (string, JSON data, or file path)
  - No `-v` flag: Prompts for value
  - `-v` with no value: Prompts for value input
  - `-v` with value: Uses provided string/JSON or reads from file path
  - Automatically detects JSON and parses it, otherwise stores as string
- `-s, --silent`: Silent/raw mode - outputs only response data for piping
- `-r, --raw`: Alias for `--silent`

**kv:del**

- `[id]`: Key ID to delete (optional, will be prompted if not provided)
- `-s, --silent`: Silent/raw mode - outputs only response data for piping
- `-r, --raw`: Alias for `--silent`

### Authentication Validation

The tool validates your credentials against the ConnexCS API before saving them:

- Makes a request to `https://connexcs.com/api/cp/setup/account`
- Uses HTTP Basic Authentication with your credentials
- Verifies the response contains your company information
- Only saves credentials if authentication is successful

If username or password are not provided via flags, you will be prompted to enter them interactively.

### Output Format

Upon successful authentication, credentials are saved to a `.env` file in the current working directory:

```env
# Company: Your Company Name
USERNAME=your_username
PASSWORD=your_password
```

### Security

- **Authentication Required**: Credentials are validated before being saved
- **Git Protection**: The `.env` file is automatically ignored by git to prevent accidental commit
- **Local Storage**: Credentials are stored locally and never transmitted except for validation

### Input Detection

The run command automatically detects whether your input is a file path or JSON data:

- **File Path**: If the input matches an existing file, it reads and uses the file content
- **JSON Data**: If the input is not a file path, it treats it as inline JSON
- **Validation**: All JSON data is validated before sending to the API

### Response Handling

The tool intelligently handles different response types:

- **JSON Response**: Pretty-formatted JSON output with syntax highlighting
- **Text/HTML Response**: Raw text output for non-JSON responses
- **Error Responses**: Clear error messages with HTTP status codes

### Error Handling

The tool provides clear error messages for common issues:

- `Invalid username or password`: Check your ConnexCS login credentials
- `API endpoint not found`: Verify the ConnexCS API is accessible
- `Server error`: Try again later or contact ConnexCS support
- `Network error`: Check your internet connection
- `Invalid JSON data`: Check your JSON syntax in request body
- `ScriptForge does not exist`: Verify the ScriptForge ID is correct

## Sync Commands

Sync your ScriptForge scripts between ConnexCS and your local filesystem.

### Pull Scripts

Download all ScriptForge scripts to your local `./src` folder:

```bash
# Pull scripts (filtered by configured APP_ID)
cx pull
```

This command will:
1. Fetch all ScriptForge scripts from your account
2. Filter by configured APP_ID (if set)
3. Show you which files will be downloaded
4. Ask for confirmation
5. Save each script as `<name>.js` in the `./src` folder

**Example output:**
```
📥 Files to be pulled:
══════════════════════════════════════════════════
  • my-script.js (ID: 123)
  • another-script.js (ID: 124)
══════════════════════════════════════════════════
📊 Total: 2 file(s)
? Pull 2 file(s) to ./src? (Y/n)
```

### Push Changes

Upload local changes back to ScriptForge:

```bash
# Push local changes
cx push
```

This command will:
1. Read all `.js` files from `./src`
2. Fetch remote scripts to compare
3. Detect changes (modified or new files)
4. Show you what will be updated/created
5. Ask for confirmation
6. **UPDATE** existing scripts (PUT request)
7. **CREATE** new scripts (POST request)

**Example output:**
```
📤 Changes to be pushed:
══════════════════════════════════════════════════
📝 Files to UPDATE:
  • my-script.js (ID: 123)
✨ Files to CREATE:
  • new-script.js
══════════════════════════════════════════════════
📊 Total: 2 change(s) (1 update, 1 create)
? Push 2 change(s) to ScriptForge? (Y/n)
```

**Important Notes:**
- Changed files are detected by comparing local code with remote code
- Unchanged files are skipped automatically
- New files require an APP_ID to be configured (`cx configure:app`)
- File names must match the script names (e.g., `my-script.js` → script name: `my-script`)

### Clear Local Files

Clear all files from your `./src` folder:

```bash
# Clear ./src folder
cx clear
```

This command will:
1. List all files in `./src`
2. Ask for confirmation (defaults to No for safety)
3. Delete all files from the folder

**Example output:**
```
🗑️  Files to be deleted:
══════════════════════════════════════════════════
  • my-script.js
  • another-script.js
══════════════════════════════════════════════════
📊 Total: 2 file(s)
⚠️  Delete all 2 file(s) from ./src? (y/N)
```

### Sync Workflow

Typical workflow for syncing scripts:

```bash
# 1. Configure credentials and app
cx configure
cx configure:app

# 2. Pull existing scripts from ConnexCS
cx pull

# 3. Edit scripts locally in ./src/
# ... make your changes ...

# 4. Push changes back to ConnexCS
cx push

# 5. Optional: Clear local files when done
cx clear
```

## TODO

- ~~Checkout App ID~~ ✅ Implemented
- ~~SQL on CDR & Userspace Databases + Export as CSV~~ ✅ Implemented
- ~~KV Get/Set/List~~ ✅ Implemented
- ~~Sync between local file system and ConnexCS~~ ✅ Implemented
- Query Builder
- ScriptForge Remote Logs
- Investigate Call-ID
- Live Tail
- Live Calls Line per call / Dialogs Live UI

```
