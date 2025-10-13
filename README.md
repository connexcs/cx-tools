# cx-tools

ConnexCS Tools

## Installation

```bash
npm install -g cx-tools
```

## Usage

### Configure Credentials

Set up your ConnexCS username and password credentials that will be validated and stored in a `.env` file:

```bash
# Interactive prompts (recommended)
cx-tools configure

# Using command line flags
cx-tools configure --username myuser --password mypass

# Force overwrite existing .env file
cx-tools configure --force
```

### Run ScriptForge Scripts

Execute ScriptForge scripts on your ConnexCS platform:

```bash
# Interactive mode - prompts for ID and request body options
cx-tools run

# Provide ScriptForge ID as argument (will prompt for body options)
cx-tools run 12345

# Provide both ID and JSON request body
cx-tools run 12345 --body '{"key": "value"}'

# Use a JSON file as request body
cx-tools run 12345 --body request.json

# Combine argument and option
cx-tools run --body '{"data": "test"}' 12345
```

### Interactive Body Options

When no `--body` option is provided, the tool will prompt you with:

- **No body (send empty POST request)**: Sends an empty JSON object `{}`
- **Provide JSON data**: Opens an editor where you can:
  - Enter JSON data directly: `{"key": "value"}`
  - Specify a file path: `./data.json`

### Configure Command Options

- `-u, --username <username>`: Specify username via command line
- `-p, --password <password>`: Specify password via command line  
- `-f, --force`: Force overwrite existing .env file

### Run Command Options

- `[id]`: ScriptForge ID (optional, will be prompted if not provided)
- `-b, --body <body>`: JSON request body (can be JSON string or file path)

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


# TODO:

- Checkout App ID
- SQL on CDR & Userspace Databases + Export as CSV
- KV Get/Set/List
- Query Builder
- Sync between local file system and ConnexCS
- ScriptForge Remote Logs
- Investigate Call-ID
- Live Tail
- Live Calls Line per call / Dialogs Live UI