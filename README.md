# Banktivity MCP Server

An MCP (Model Context Protocol) server that provides read-only access to Banktivity personal finance data.

## Features

- List all accounts with balances
- Query transactions by account, date range
- Search transactions by payee name
- Get spending breakdown by category
- Get income breakdown by category
- Calculate net worth
- View tags

## Installation

```bash
npm install
npm run build
```

## Configuration

Set the `BANKTIVITY_FILE_PATH` environment variable to point to your `.bank8` file:

```bash
export BANKTIVITY_FILE_PATH="/path/to/your/Personal.bank8"
```

## Usage with Claude Desktop

Add to your Claude Desktop configuration (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "banktivity": {
      "command": "node",
      "args": ["/path/to/banktivity-mcp/dist/index.js"],
      "env": {
        "BANKTIVITY_FILE_PATH": "/path/to/your/Personal.bank8"
      }
    }
  }
}
```

## Available Tools

### `list_accounts`
List all accounts with their types and current balances.

Parameters:
- `include_hidden` (boolean): Include hidden accounts (default: false)
- `include_categories` (boolean): Include income/expense categories (default: false)

### `get_account_balance`
Get the current balance for a specific account.

Parameters:
- `account_id` (number): The account ID
- `account_name` (string): The account name (alternative to account_id)

### `get_transactions`
Get transactions with optional filtering.

Parameters:
- `account_id` (number): Filter by account ID
- `account_name` (string): Filter by account name
- `start_date` (string): Start date (YYYY-MM-DD)
- `end_date` (string): End date (YYYY-MM-DD)
- `limit` (number): Maximum transactions to return (default: 50)

### `search_transactions`
Search transactions by payee name or notes.

Parameters:
- `query` (string, required): Search query
- `limit` (number): Maximum results (default: 50)

### `get_spending_by_category`
Get spending breakdown by expense category.

Parameters:
- `start_date` (string): Start date (YYYY-MM-DD)
- `end_date` (string): End date (YYYY-MM-DD)

### `get_income_by_category`
Get income breakdown by income category.

Parameters:
- `start_date` (string): Start date (YYYY-MM-DD)
- `end_date` (string): End date (YYYY-MM-DD)

### `get_net_worth`
Calculate current net worth (assets minus liabilities).

### `get_tags`
List all tags used for transactions.

### `get_summary`
Get a summary of the database including account counts and transaction totals.

## Security

This server provides **read-only** access to your Banktivity data. It cannot modify, create, or delete any data.

## License

MIT
