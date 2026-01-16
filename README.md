# cx-tools

ConnexCS Tools

## Installation

```bash
npm install -g @connexcs/tools
```

![Installation Demo](https://cdn.cnxcdn.com/npm/cx-tools/install.gif)

## Usage

### Configure Credentials

Set up your ConnexCS credentials to obtain a 30-day refresh token that will be stored in a `.env` file:

```bash
# Interactive prompts (recommended)
cx configure

# Using command line flags
cx configure --username myuser --password mypass

# Force overwrite existing .env file
cx configure --force
```

**How it works:**
1. Your username and password are validated against the ConnexCS API
2. If valid, a 30-day refresh token is obtained from `/api/cp/auth/jwt/refresh`
3. The token is tied to your machine using an audience claim (`cx-tools@hostname`)
4. The refresh token is securely saved to your `.env` file
5. This token is used to obtain short-lived access tokens for each API request
6. **Automatic Renewal**: When a token has less than 15 days remaining, it's automatically renewed during any API request
7. You can manually refresh anytime by running `cx configure --force`

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

![Run Demo](https://cdn.cnxcdn.com/npm/cx-tools/cxrun.gif)

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

![SQL Demo](https://cdn.cnxcdn.com/npm/cx-tools/cxsql.gif)

```bash
# Interactive mode - prompts for SQL query
cx sql

# Provide SQL query as argument (CDR database by default)
cx sql "SELECT * FROM cdr WHERE dt > DATE_SUB(NOW(), INTERVAL 1 DAY) LIMIT 10"

# Query userspace database with -u flag
cx sql "SELECT * FROM myTable WHERE status = 'active'" -u

# Return results as CSV
cx sql "SELECT * FROM cdr WHERE dt > DATE_SUB(NOW(), INTERVAL 1 DAY) LIMIT 10" --csv

# Prepared statements with parameters
cx sql "SELECT * FROM cdr WHERE dest_number = :dest LIMIT 10" -p '{"dest": "+1234567890"}'

# Parameters from JSON file
cx sql "SELECT * FROM cdr WHERE dt > :start_date AND status = :status" -p ./params.json

# Silent mode for piping to files
cx sql "SELECT * FROM cdr WHERE dt > DATE_SUB(NOW(), INTERVAL 1 DAY) AND duration > 60" -s > results.json
cx sql "SELECT * FROM cdr WHERE dt > DATE_SUB(NOW(), INTERVAL 1 DAY) LIMIT 100" --csv -s > data.csv

# Pipe to other tools
cx sql "SELECT dest_number, COUNT(*) as calls FROM cdr WHERE dt > DATE_SUB(NOW(), INTERVAL 1 DAY) LIMIT 100" -s | jq '.[] | select(.calls > 10)'
```

### Key-Value Store Operations

Manage KV (Key-Value) store records:

![KV Store Demo](https://cdn.cnxcdn.com/npm/cx-tools/cxkv.gif)

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

### Environment Variables Operations

Manage server-side environment variables:

```bash
# List all environment variables
cx env:list

# List variables in silent mode for piping
cx env:list -s | jq '.[].key'

# Get a specific environment variable by key
cx env:get myvar

# Get with silent mode
cx env:get myvar -s

# Set an environment variable (upsert by key)
cx env:set myvar -v 'my value'

# Set from a file
cx env:set myvar -v ./config.txt

# Interactive mode - prompts for key and value
cx env:set

# Delete an environment variable by key
cx env:del myvar

# Delete with silent mode
cx env:del myvar -s

# Interactive delete - prompts for key
cx env:del

# Pipe and process
cx env:list -s | jq '.[] | select(.key == "myvar")'
```

### ENV Command Options

**env:list**

- `-s, --silent`: Silent/raw mode - outputs only key/value pairs as JSON array
- `-r, --raw`: Alias for `--silent`

**env:get**

- `[key]`: Variable key (optional, will be prompted if not provided)
- `-s, --silent`: Silent/raw mode - outputs only key/value as JSON
- `-r, --raw`: Alias for `--silent`

**env:set**

- `[key]`: Variable key (optional, will be prompted if not provided)
- `-v, --value [value]`: Value to set (string or file path)
  - No `-v` flag: Prompts for value
  - `-v` with no value: Prompts for value input
  - `-v` with value: Uses provided string or reads from file path
- `-s, --silent`: Silent/raw mode - outputs only key/value as JSON
- `-r, --raw`: Alias for `--silent`

**env:del**

- `[key]`: Variable key to delete (optional, will be prompted if not provided)
- `-s, --silent`: Silent/raw mode - suppress decorative output
- `-r, --raw`: Alias for `--silent`

### Authentication Validation

The tool uses JWT (JSON Web Token) authentication with a two-step process:

1. **Initial Setup** (`cx configure`):
   - Validates your username and password via Basic Auth
   - Requests a 30-day refresh token from `/api/cp/auth/jwt/refresh`
   - Saves the refresh token to `.env` file

2. **API Requests** (automatic):
   - Uses the refresh token to obtain a short-lived access token from `/api/cp/auth/jwt`
   - Uses the access token in `Authorization: Bearer <token>` header for API requests
   - This happens automatically for every command

3. **Automatic Token Renewal**:
   - Before each API request, the system checks if the refresh token has less than 15 days remaining
   - If it does, the token is automatically renewed for another 30 days
   - A notification is displayed (unless in silent mode): "🔄 Refresh token has less than 15 days remaining. Renewing automatically..."
   - Your `.env` file is automatically updated with the new token
   - No manual intervention needed!

If username or password are not provided via flags, you will be prompted to enter them interactively.

**Token Expiration:**
- Refresh tokens are valid for **30 days**
- Access tokens are short-lived (typically minutes)
- Tokens with less than **15 days remaining** are automatically renewed
- Manual refresh available with `cx configure --force`

### Output Format

Upon successful authentication, a refresh token is saved to a `.env` file in the current working directory:

```env
# Company: Your Company Name
# Refresh Token (Valid for 30 days)
CX_REFRESH_TOKEN="your_refresh_token_here"
```

**Note**: The refresh token is wrapped in quotes and valid for 30 days from the time it was issued.

### Security

- **JWT Authentication**: Uses industry-standard JWT tokens instead of storing passwords
- **Token Lifecycle**: Refresh token (30 days) and short-lived access tokens for enhanced security
- **Authentication Required**: Credentials are validated before token issuance
- **Git Protection**: The `.env` file is automatically ignored by git to prevent accidental commit
- **Local Storage**: Tokens are stored locally and never transmitted except during authentication
- **Automatic Token Management**: Access tokens are automatically refreshed for each request

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
- `Refresh token expired or invalid`: Run `cx configure` again to obtain a new token
- `Failed to get access token`: Check your refresh token or reconfigure
- `API endpoint not found`: Verify the ConnexCS API is accessible
- `Server error`: Try again later or contact ConnexCS support
- `Network error`: Check your internet connection
- `Invalid JSON data`: Check your JSON syntax in request body
- `ScriptForge does not exist`: Verify the ScriptForge ID is correct

## Sync Commands

Sync your ScriptForge scripts and SQL queries between ConnexCS and your local filesystem.

**Performance:** All network requests (GET/PUT/POST) are executed in parallel for maximum speed.

![Sync Demo](https://cdn.cnxcdn.com/npm/cx-tools/pullpush.gif)

### Pull Scripts

Download all ScriptForge scripts and SQL queries to your local folders:

```bash
# Pull scripts and queries (filtered by configured APP_ID)
cx pull
```

This command will:
1. Fetch all ScriptForge scripts and SQL queries from your account
2. **Fetch all file contents in parallel** for faster performance
3. Filter by configured APP_ID (if set)
4. Detect any local files that will be overwritten
5. **Show diffs** for files with local changes (if any)
6. Ask for confirmation
7. Save each script as `<name>.js` in `./src` and queries as `<name>.sql` in `./query`

**Example output with diff viewing:**
```
📥 Files to be pulled:
══════════════════════════════════════════════════

📜 ScriptForge Scripts: 2 file(s)
  • my-script.js ⚠️  (will overwrite local changes)
  • another-script.js

══════════════════════════════════════════════════
📊 Total: 2 file(s) (2 scripts, 0 queries)
⚠️  Warning: 1 file(s) have local changes that will be overwritten

? Files with local changes detected. What would you like to do?
  ❯ View diffs before proceeding
    Continue without viewing diffs
    Cancel pull operation
```

If you choose to view diffs, you'll see a color-coded diff for each file:
- **Green lines** (`+`): Content that will be added (from remote)
- **Red lines** (`-`): Content that will be removed (your local changes)

### Push Changes

Upload local changes back to ScriptForge and SQL queries:

```bash
# Push local changes
cx push
```

This command will:
1. Read all `.js` files from `./src` and `.sql` files from `./query`
2. **Fetch remote scripts and queries in parallel** for faster comparison
3. Detect changes (modified or new files)
4. **Show diffs** for files that will be updated (if any)
5. Show you what will be updated/created
6. Ask for confirmation
7. **UPDATE and CREATE all changes in parallel** for maximum speed
8. Display results as they complete

**Example output with diff viewing:**
```
📤 Changes to be pushed:
══════════════════════════════════════════════════

� ScriptForge Scripts:
  📝 To UPDATE:
    • my-script.js (ID: 123)
  ✨ To CREATE:
    • new-script.js

══════════════════════════════════════════════════
📊 Total: 2 change(s) (1 update, 1 create)

? Would you like to view diffs before pushing?
  ❯ View diffs for files to be updated
    Continue without viewing diffs
    Cancel push operation
```

If you choose to view diffs, you'll see a color-coded diff for each file being updated:
- **Red lines** (`-`): Content that will be removed (current remote version)
- **Green lines** (`+`): Content that will be added (your local changes)

**Important Notes:**
- Changed files are detected by comparing local code with remote code
- Unchanged files are skipped automatically
- New files require an APP_ID to be configured (`cx configure:app`)
- File names must match the script/query names (e.g., `my-script.js` → script name: `my-script`)

### Clear Local Files

Clear all files from your `./src` and `./query` folders:

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

### AI Instructions

Copy AI instruction files to your project's `.github/` directory. These instructions help GitHub Copilot understand how to work with ConnexCS tools in your project:

```bash
# Copy AI instructions to .github/ directory
cx ai-instructions

# Silent mode (no output)
cx ai-instructions --silent
```

This command will:
1. Create `.github/` directory if it doesn't exist
2. Copy all AI instruction files (`*.instructions.md`) from the package
3. Download comprehensive ScriptForge API documentation from ConnexCS CDN:
   - Main ScriptForge environment documentation
   - Complete API reference for all built-in modules (cxKV, cxRest, cxJob, cxC5Server, etc.)
4. Update `.gitignore` with rules to ignore instruction and API files
5. Update `.npmignore` if it exists

The AI instructions include detailed guidance for:
- Setup and authentication
- ScriptForge script development
- Sync operations (pull/push)
- SQL query execution
- Key-Value store operations
- Environment variable management

**ScriptForge API Documentation:**
The command downloads the complete runtime API documentation including:
- Environment overview and execution types
- All built-in modules (cxKV, cxRest, cxJob, cxCallControl, cxC5Server, etc.)
- Function parameters and authentication
- ES module syntax and NPM library usage

**Note:** GitHub Copilot automatically uses instruction files found in the `.github/` directory to provide better context-aware assistance for your project.

## TODO

- ~~Checkout App ID~~ ✅ Implemented
- ~~SQL on CDR & Userspace Databases + Export as CSV~~ ✅ Implemented
- ~~KV Get/Set/List~~ ✅ Implemented
- ~~Sync between local file system and ConnexCS~~ ✅ Implemented
- Query Builder ✅ Implemented
- ScriptForge Remote Logs
- Investigate Call-ID
- Live Tail
- Live Calls Line per call / Dialogs Live UI

```
