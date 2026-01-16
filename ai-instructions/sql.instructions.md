# CX Tools - SQL Queries

Query the ConnexCS CDR database or Userspace databases.

---

## Database Environment

### Backend Databases

There are two backend databases available:

1. **`cdr` - ClickHouse Database (Read-Only)**
   - Call Detail Records (CDR) database
   - Contains telecommunications call data
   - **Read-only access** - no modifications allowed
   - Two primary tables:
     - `cdr` - Raw call detail records
     - `breakout` - Materialized view with pre-aggregated data for analytics

2. **`userspace` - MySQL Database (Read-Write)**
   - Flexible storage for application-specific data
   - Fully read-write capable
   - Used for custom data storage needs (number lists, leadsets, application data, etc.)
   - Schema is application-specific and flexible

*Note: For specific database versions and detailed schemas, query the databases directly using `SHOW DATABASES`, `SHOW TABLES`, and `SHOW CREATE TABLE` commands.*

### Performance Best Practices

#### CDR Database (ClickHouse)
- **Always include date/time filters** - CDR & Breakout queries must filter by date/time to ensure reasonable performance
- **Prioritize short timeframes** - Even with millions of records, shorter date ranges perform better
- **Storage tiers**:
  - **Hot storage** (past year): Fast queries, reasonably quick response times
  - **Warm storage** (older than 1 year): Much slower, stored on NAS
- **Use `breakout` table first** - For analytical and billing queries, check `cdr.breakout` (materialized view) before querying raw `cdr` table
  - `breakout` contains pre-aggregated data for common analytics
  - Only query `cdr` table when you need raw records or data not available in `breakout`
- **Concurrent query limit** - Keep concurrent queries under 4 at any time

#### Result Set Considerations
- **JSON format** (default): Good for small to medium result sets, but requires parsing large JSON objects
- **CSV format** (`--csv`): Recommended for large result sets, more efficient for processing
- **No hard limit on result set size**, but consider memory and parsing performance

#### Userspace Database (MySQL)
- No special performance restrictions
- Fully supports read-write operations
- Schema and performance depend on your specific use case

#### Data Retention
- Retention policies are configured in the ConnexCS account UI
- Check your account settings for specific retention periods

---

## Command: `cx sql`

```bash
cx sql                        # Interactive: prompts for SQL query

cx sql "SHOW DATABASES"              # Get list of databases
cx sql "SHOW TABLES FROM cdr"     # Get a list of tables (CDR database)
cx sql "SHOW CREATE TABLE cdr.cdr"     # Get table creation statement

cx sql "SELECT * FROM cdr LIMIT 10"  # Execute SQL on CDR database (default)
cx sql "SELECT * FROM myTable LIMIT 10" -u  # Execute SQL on Userspace database

cx sql "SELECT * FROM cdr LIMIT 10" --csv     # Output as CSV format
cx sql "SELECT * FROM cdr LIMIT 10" -s        # Silent mode for piping
cx sql "SELECT * FROM cdr LIMIT 10" -s > results.json  # Save to file
```

### Options

| Option | Alias | Description |
|--------|-------|-------------|
| `[query]` | | SQL query string (optional, prompts if not provided) |
| `-u` | `--userspace` | Query userspace database instead of CDR (default: CDR) |
| `-p [params]` | `--params [params]` | JSON parameters for prepared statements (JSON string or file path) |
| | `--csv` | Return results in CSV format instead of JSON |
| `-s` | `--silent` | Raw output only (for piping) |
| `-r` | `--raw` | Alias for `--silent` |

---

## Query Examples

### Basic Queries

```bash
# Select recent CDR records (default CDR database)
cx sql "SELECT * FROM cdr WHERE dt > DATE_SUB(NOW(), INTERVAL 1 DAY) LIMIT 10"

# Query userspace database
cx sql "SELECT * FROM myTable WHERE status = 'active'" -u

# Count calls by destination
cx sql "SELECT dest_number, COUNT(*) as calls FROM cdr WHERE dt > DATE_SUB(NOW(), INTERVAL 1 DAY) GROUP BY dest_number LIMIT 100"

# Filter by duration
cx sql "SELECT * FROM cdr WHERE dt > DATE_SUB(NOW(), INTERVAL 1 DAY) AND duration > 60"
```

### Prepared Statements with Parameters

You can use prepared statements with `:` placeholders and pass parameters via `-p`:

```bash
# Using inline JSON parameters
cx sql "SELECT * FROM cdr WHERE dest_number = :dest LIMIT 10" -p '{"dest": "+1234567890"}'

# Using parameters from a JSON file
cx sql "SELECT * FROM cdr WHERE dt > :start_date AND status = :status" -p ./params.json

# Userspace database with parameters
cx sql "SELECT * FROM myTable WHERE id = :id" -u -p '{"id": 123}'

# Multiple parameters
cx sql "SELECT * FROM cdr WHERE src_number = :src AND dest_number = :dest" -p '{"src": "+1111111111", "dest": "+2222222222"}'
```

**Example params.json:**
```json
{
  "start_date": "2024-01-01",
  "status": "answered"
}
```

### Output Formats

```bash
# JSON output (default)
cx sql "SELECT * FROM cdr LIMIT 5"

# CSV output
cx sql "SELECT * FROM cdr LIMIT 5" --csv

# Save JSON to file
cx sql "SELECT * FROM cdr LIMIT 100" -s > data.json

# Save CSV to file
cx sql "SELECT * FROM cdr LIMIT 100" --csv -s > data.csv

# Query userspace with CSV output
cx sql "SELECT * FROM myTable" -u --csv
```

### Piping to Other Tools

```bash
# Filter with jq
cx sql "SELECT dest_number, COUNT(*) as calls FROM cdr LIMIT 100" -s | jq '.[] | select(.calls > 10)'

# Process CSV with other tools
cx sql "SELECT * FROM cdr LIMIT 1000" --csv -s | csvstat

# Count results
cx sql "SELECT * FROM cdr LIMIT 1000" -s | jq 'length'

# Query userspace and pipe to jq
cx sql "SELECT * FROM myTable WHERE status = 'active'" -u -s | jq '.'
```

---

## API Endpoint

The SQL command uses the `/setup/query/0/run` endpoint with the following request format:

```json
{
  "_query": "SELECT * FROM myTable WHERE abc = :b",
  "_src": "cdr",
  "b": "test"
}
```

- `_query`: The SQL query with `:` placeholders for prepared statements
- `_src`: Database source - either `"cdr"` (default) or `"userspace"` (with `-u` flag)
- Additional fields: Parameters for prepared statement placeholders

---

## Response Schema

### JSON Response

```json
[
    {
        "id": 12345,
        "dt": "2024-01-15T10:30:00Z",
        "src_number": "+1234567890",
        "dest_number": "+0987654321",
        "duration": 120,
        "status": "answered",
        ...
    },
    ...
]
```

### CSV Response

```csv
id,dt,src_number,dest_number,duration,status
12345,2024-01-15T10:30:00Z,+1234567890,+0987654321,120,answered
...
```

---

## CDR Table Schema

Common fields in the CDR (Call Detail Record) table:

| Field | Type | Description |
|-------|------|-------------|
| `id` | INTEGER | Unique record identifier |
| `dt` | DATETIME | Call date/time |
| `src_number` | VARCHAR | Source/caller number |
| `dest_number` | VARCHAR | Destination number |
| `duration` | INTEGER | Call duration in seconds |
| `status` | VARCHAR | Call status |
| `hangup_cause` | VARCHAR | Hangup cause code |

*Note: Actual schema may vary. Contact ConnexCS support for full schema documentation.*

---

## SQL Query Files

SQL queries can be synced with `cx pull` and `cx push`:

```bash
# Pull queries to ./query/
cx pull

# Edit ./query/my-report.sql
# Push changes back
cx push
```

Query files are stored in `./query/*.sql`.

---

## Error Handling

| Error | Solution |
|-------|----------|
| `SQL syntax error` | Check your SQL syntax |
| `Table not found` | Verify table name exists |
| `Permission denied` | Check database access permissions |
| `Query timeout` | Simplify query or add LIMIT clause |
