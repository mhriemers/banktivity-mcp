# Banktivity MCP Server

An MCP (Model Context Protocol) server that provides access to Banktivity personal finance data.

## Features

### Read Operations
- List accounts with balances
- Query and search transactions
- Get spending/income breakdown by category
- Calculate net worth
- View tags, payees, and transaction templates
- List import rules and scheduled transactions

### Write Operations
- Create, update, and delete transactions
- Add, update, and delete line items
- Create accounts and tags
- Tag/untag transactions
- Reconcile transactions
- Manage payees
- Manage transaction templates
- Manage import rules
- Manage scheduled transactions

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

### Account Tools

| Tool | Description |
|------|-------------|
| `list_accounts` | List all accounts with types and balances |
| `get_account_balance` | Get balance for a specific account |
| `create_account` | Create a new account (checking, savings, credit card, or category) |

### Transaction Tools

| Tool | Description |
|------|-------------|
| `get_transactions` | Get transactions with optional filtering by account/date |
| `search_transactions` | Search transactions by payee name or notes |
| `create_transaction` | Create a new transaction with line items |
| `update_transaction` | Update transaction title, date, note, or cleared status |
| `delete_transaction` | Delete a transaction and its line items |
| `reconcile_transactions` | Mark transactions as cleared/reconciled |

### Line Item Tools

| Tool | Description |
|------|-------------|
| `get_line_item` | Get a specific line item by ID |
| `update_line_item` | Update a line item's account, amount, or memo |
| `delete_line_item` | Delete a line item from a transaction |
| `add_line_item` | Add a new line item to an existing transaction |

### Category & Analysis Tools

| Tool | Description |
|------|-------------|
| `get_spending_by_category` | Get spending breakdown by expense category |
| `get_income_by_category` | Get income breakdown by income category |
| `get_net_worth` | Calculate net worth (assets minus liabilities) |
| `get_summary` | Get database summary with account counts and totals |

### Tag Tools

| Tool | Description |
|------|-------------|
| `get_tags` | List all tags |
| `create_tag` | Create a new tag |
| `tag_transaction` | Add or remove a tag from a transaction |

### Payee Tools

| Tool | Description |
|------|-------------|
| `list_payees` | List all payees with contact information |
| `get_payee` | Get a specific payee by ID |
| `create_payee` | Create a new payee |
| `update_payee` | Update payee information |
| `delete_payee` | Delete a payee |

### Transaction Template Tools

| Tool | Description |
|------|-------------|
| `list_transaction_templates` | List all transaction templates |
| `get_transaction_template` | Get a specific template by ID |
| `create_transaction_template` | Create a new template |
| `update_transaction_template` | Update a template |
| `delete_transaction_template` | Delete a template |

### Import Rule Tools

| Tool | Description |
|------|-------------|
| `list_import_rules` | List all import rules |
| `get_import_rule` | Get a specific import rule by ID |
| `create_import_rule` | Create a new import rule with regex pattern |
| `update_import_rule` | Update an import rule |
| `delete_import_rule` | Delete an import rule |
| `match_import_rules` | Test which rules match a transaction description |

### Scheduled Transaction Tools

| Tool | Description |
|------|-------------|
| `list_scheduled_transactions` | List all scheduled/recurring transactions |
| `get_scheduled_transaction` | Get a specific scheduled transaction by ID |
| `create_scheduled_transaction` | Create a new scheduled transaction |
| `update_scheduled_transaction` | Update a scheduled transaction |
| `delete_scheduled_transaction` | Delete a scheduled transaction |

## Tool Details

### `list_accounts`
Parameters:
- `include_hidden` (boolean): Include hidden accounts (default: false)
- `include_categories` (boolean): Include income/expense categories (default: false)

### `get_transactions`
Parameters:
- `account_id` (number): Filter by account ID
- `account_name` (string): Filter by account name
- `start_date` (string): Start date (YYYY-MM-DD)
- `end_date` (string): End date (YYYY-MM-DD)
- `limit` (number): Maximum transactions to return (default: 50)

### `create_transaction`
Parameters:
- `title` (string, required): Payee or description
- `date` (string, required): Date in YYYY-MM-DD format
- `note` (string): Optional note/memo
- `transaction_type` (string): Type (e.g., 'Deposit', 'Withdrawal', 'Transfer')
- `line_items` (array, required): Array of line items with `account_id`/`account_name`, `amount`, and optional `memo`

### `update_line_item`
Parameters:
- `line_item_id` (number, required): The line item ID to update
- `account_id` (number): New account ID
- `account_name` (string): New account name (alternative to account_id)
- `amount` (number): New amount
- `memo` (string): New memo

### `add_line_item`
Parameters:
- `transaction_id` (number, required): The transaction ID to add the line item to
- `account_id` (number): Account ID for the line item
- `account_name` (string): Account name (alternative to account_id)
- `amount` (number, required): The amount
- `memo` (string): Optional memo

### `create_import_rule`
Parameters:
- `template_id` (number, required): Transaction template ID to apply
- `pattern` (string, required): Regex pattern to match transaction descriptions
- `account_id` (string): Optional account UUID filter
- `payee` (string): Optional payee name to set

### `create_scheduled_transaction`
Parameters:
- `template_id` (number, required): Transaction template ID
- `start_date` (string, required): Start date (YYYY-MM-DD)
- `account_id` (string): Account UUID
- `repeat_interval` (number): Repeat interval (default: 1)
- `repeat_multiplier` (number): Multiplier for interval (default: 1)
- `reminder_days` (number): Days in advance to show reminder (default: 7)

## Security

This server provides both read and write access to your Banktivity data. Write operations will modify your database directly. Always ensure you have backups before using write operations.

## License

MIT
