# CX Tools - Setup & Authentication

`cx-tools` (command: `cx`) is a CLI for interacting with the ConnexCS SaaS platform.

**Installation:** `npm install -g @connexcs/tools`

## Quick Reference

```bash
cx -h                    # Show all available commands
cx <command> -h          # Show help for a specific command
```

---

## Initial Setup

Before using any commands, configure your ConnexCS credentials:

### Step 1: Configure Authentication

```bash
cx configure
```

Or with flags:
```bash
cx configure --username <user> --password <pass>
```

**Options:**
| Option | Alias | Description |
|--------|-------|-------------|
| `-u` | `--username` | ConnexCS username |
| `-p` | `--password` | ConnexCS password |
| `-f` | `--force` | Force overwrite existing .env file |

### Step 2: Configure App ID

```bash
cx configure:app
```

This is required for:
- Creating new ScriptForge scripts
- Filtering the script list by app

---

## Authentication Flow

### How It Works

1. **Initial Setup** (`cx configure`):
   - Validates username/password via Basic Auth against ConnexCS API
   - Requests a 30-day refresh token from `/api/cp/auth/jwt/refresh`
   - Token is tied to your machine (audience claim: `cx-tools@hostname`)
   - Saves refresh token to `.env` file

2. **API Requests** (automatic):
   - Uses refresh token to obtain short-lived access token from `/api/cp/auth/jwt`
   - Access token used in `Authorization: Bearer <token>` header
   - Happens automatically for every command

3. **Token Auto-Renewal**:
   - Before each request, checks if refresh token has < 15 days remaining
   - If so, automatically renews for another 30 days
   - `.env` file updated automatically
   - Notification shown (unless in silent mode)

### Token Lifecycle

| Token Type | Validity | Notes |
|------------|----------|-------|
| Refresh Token | 30 days | Stored in `.env`, auto-renews at 15 days |
| Access Token | Minutes | Generated per-request, not stored |

### Manual Token Refresh

```bash
cx configure --force
```

---

## Environment File

The `.env` file is created in your current working directory:

```env
# Company: Your Company Name
# Refresh Token (Valid for 30 days)
CX_REFRESH_TOKEN="your_refresh_token_here"
APP_ID="12345"
```

**Security:**
- Add `.env` to your `.gitignore` to prevent committing credentials
- Tokens are stored locally and never transmitted except during authentication
- Each token is machine-specific

---

## Common Options (All Commands)

| Option | Alias | Description |
|--------|-------|-------------|
| `-s` | `--silent` | Raw output only, no formatting (for piping) |
| `-r` | `--raw` | Alias for `--silent` |
| `-h` | `--help` | Show command help |

---

## Error Handling

| Error | Solution |
|-------|----------|
| `Invalid username or password` | Check ConnexCS credentials |
| `Refresh token expired or invalid` | Run `cx configure` again |
| `Failed to get access token` | Check refresh token or reconfigure |
| `API endpoint not found` | Verify ConnexCS API is accessible |
| `Network error` | Check internet connection |
