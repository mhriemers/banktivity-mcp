# Banktivity SDK & MCP Server

A TypeScript SDK and MCP (Model Context Protocol) server for accessing Banktivity personal finance data.

## Packages

This monorepo contains two packages:

- **`banktivity-sdk`** - A standalone TypeScript SDK for interacting with Banktivity databases
- **`banktivity-mcp`** - An MCP server built on top of the SDK for use with Claude Desktop

## Quick Start

### Installation

```bash
npm install
npm run build
```

### Usage with Claude Desktop

Add to your Claude Desktop configuration (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "banktivity": {
      "command": "node",
      "args": ["/path/to/banktivity-mcp/packages/mcp/dist/index.js"],
      "env": {
        "BANKTIVITY_FILE_PATH": "/path/to/your/Personal.bank8"
      }
    }
  }
}
```

## SDK Usage

The SDK can be used independently in any TypeScript/JavaScript project:

```typescript
import { BanktivityClient } from "banktivity-sdk";

const client = new BanktivityClient({ filePath: "/path/to/file.bank8" });

// List accounts
const accounts = client.accounts.list();
console.log(accounts);

// Get account balance
const balance = client.accounts.getBalance(accountId);

// Create a transaction
const result = client.transactions.create({
  title: "Coffee Shop",
  date: "2024-01-15",
  lineItems: [
    { accountId: 1, amount: -5.50 },
    { accountId: 42, amount: 5.50 }
  ]
});

// Search transactions
const transactions = client.transactions.search("grocery");

// Close connection when done
client.close();
```

### SDK API Reference

#### Accounts
```typescript
client.accounts.list({ includeHidden?: boolean }): Account[]
client.accounts.get(id: number): Account | null
client.accounts.findByName(name: string): Account | null
client.accounts.getBalance(id: number): number
client.accounts.create(input: CreateAccountInput): number
client.accounts.getNetWorth(): NetWorth
client.accounts.getCategoryAnalysis(type: "income" | "expense", filter?): CategorySpending[]
```

#### Transactions
```typescript
client.transactions.list(filter?: TransactionFilter): Transaction[]
client.transactions.get(id: number): Transaction | null
client.transactions.search(query: string, limit?: number): Transaction[]
client.transactions.count(): number
client.transactions.create(input: CreateTransactionInput): { transactionId, lineItemIds }
client.transactions.update(id: number, input: UpdateTransactionInput): boolean
client.transactions.delete(id: number): boolean
client.transactions.reconcile(ids: number[], cleared?: boolean): number
```

#### Line Items
```typescript
client.lineItems.get(id: number): LineItem | null
client.lineItems.getForTransaction(transactionId: number): LineItem[]
client.lineItems.create(transactionId, accountId, amount, memo?): number
client.lineItems.update(id: number, input: UpdateLineItemInput): boolean
client.lineItems.delete(id: number): boolean
```

#### Tags
```typescript
client.tags.list(): Tag[]
client.tags.get(id: number): Tag | null
client.tags.getByName(name: string): Tag | null
client.tags.create(name: string): number
client.tags.tagTransaction(transactionId, tagId): number
client.tags.untagTransaction(transactionId, tagId): number
```

#### Templates
```typescript
client.templates.list(): TransactionTemplate[]
client.templates.get(id: number): TransactionTemplate | null
client.templates.create(input: CreateTransactionTemplateInput): number
client.templates.update(id: number, input: UpdateTransactionTemplateInput): boolean
client.templates.delete(id: number): boolean
```

#### Import Rules
```typescript
client.importRules.list(): ImportRule[]
client.importRules.get(id: number): ImportRule | null
client.importRules.create(input: CreateImportRuleInput): number
client.importRules.update(id: number, input: UpdateImportRuleInput): boolean
client.importRules.delete(id: number): boolean
client.importRules.match(description: string): ImportRule[]
```

#### Scheduled Transactions
```typescript
client.scheduledTransactions.list(): ScheduledTransaction[]
client.scheduledTransactions.get(id: number): ScheduledTransaction | null
client.scheduledTransactions.create(input: CreateScheduledTransactionInput): number
client.scheduledTransactions.update(id: number, input: UpdateScheduledTransactionInput): boolean
client.scheduledTransactions.delete(id: number): boolean
```

## MCP Tools

The MCP server provides 35 tools for interacting with Banktivity:

### Account Tools
| Tool | Description |
|------|-------------|
| `list_accounts` | List all accounts with types and balances |
| `get_account_balance` | Get balance for a specific account |
| `create_account` | Create a new account |
| `get_spending_by_category` | Get spending breakdown by expense category |
| `get_income_by_category` | Get income breakdown by income category |
| `get_net_worth` | Calculate net worth |
| `get_summary` | Get database summary |

### Transaction Tools
| Tool | Description |
|------|-------------|
| `get_transactions` | Get transactions with optional filtering |
| `search_transactions` | Search transactions by payee or notes |
| `create_transaction` | Create a new transaction with line items |
| `update_transaction` | Update transaction details |
| `delete_transaction` | Delete a transaction |
| `reconcile_transactions` | Mark transactions as cleared |

### Line Item Tools
| Tool | Description |
|------|-------------|
| `get_line_item` | Get a specific line item |
| `update_line_item` | Update a line item |
| `delete_line_item` | Delete a line item |
| `add_line_item` | Add a line item to a transaction |

### Tag Tools
| Tool | Description |
|------|-------------|
| `get_tags` | List all tags |
| `create_tag` | Create a new tag |
| `tag_transaction` | Add or remove a tag from a transaction |

### Template Tools
| Tool | Description |
|------|-------------|
| `list_transaction_templates` | List all templates |
| `get_transaction_template` | Get a specific template |
| `create_transaction_template` | Create a new template |
| `update_transaction_template` | Update a template |
| `delete_transaction_template` | Delete a template |

### Import Rule Tools
| Tool | Description |
|------|-------------|
| `list_import_rules` | List all import rules |
| `get_import_rule` | Get a specific import rule |
| `create_import_rule` | Create a new import rule |
| `update_import_rule` | Update an import rule |
| `delete_import_rule` | Delete an import rule |
| `match_import_rules` | Test which rules match a description |

### Scheduled Transaction Tools
| Tool | Description |
|------|-------------|
| `list_scheduled_transactions` | List all scheduled transactions |
| `get_scheduled_transaction` | Get a specific scheduled transaction |
| `create_scheduled_transaction` | Create a new scheduled transaction |
| `update_scheduled_transaction` | Update a scheduled transaction |
| `delete_scheduled_transaction` | Delete a scheduled transaction |

## Project Structure

```
banktivity-mcp/
├── package.json              # Root workspace config
├── tsconfig.base.json        # Shared TypeScript config
├── packages/
│   ├── sdk/                  # banktivity-sdk package
│   │   ├── src/
│   │   │   ├── index.ts      # Main exports
│   │   │   ├── client.ts     # BanktivityClient class
│   │   │   ├── types.ts      # TypeScript interfaces
│   │   │   ├── constants.ts  # Database constants
│   │   │   ├── errors.ts     # Custom error classes
│   │   │   ├── connection.ts # Database connection
│   │   │   ├── utils/        # Utility functions
│   │   │   └── repositories/ # Data access layer
│   │   └── package.json
│   │
│   └── mcp/                  # banktivity-mcp package
│       ├── src/
│       │   ├── index.ts      # MCP server entry point
│       │   └── tools/        # Tool implementations
│       └── package.json
```

## Security

This server provides both read and write access to your Banktivity data. Write operations will modify your database directly. Always ensure you have backups before using write operations.

## License

MIT
