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

### Command Options

- `-u, --username <username>`: Specify username via command line
- `-p, --password <password>`: Specify password via command line  
- `-f, --force`: Force overwrite existing .env file

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

### Error Handling

The tool provides clear error messages for common issues:

- `Invalid username or password`: Check your ConnexCS login credentials
- `API endpoint not found`: Verify the ConnexCS API is accessible
- `Server error`: Try again later or contact ConnexCS support
- `Network error`: Check your internet connection
