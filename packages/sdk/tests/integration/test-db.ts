import Database from "better-sqlite3";
import { Z_ENT, ACCOUNT_CLASS } from "../../src/constants.js";
import { nowAsCoreData } from "../../src/utils/date.js";
import { generateUUID } from "../../src/utils/uuid.js";

/**
 * Create an in-memory SQLite database with Banktivity schema
 */
export function createTestDatabase(): Database.Database {
  const db = new Database(":memory:");

  // Create Core Data metadata table
  db.exec(`
    CREATE TABLE Z_PRIMARYKEY (
      Z_ENT INTEGER PRIMARY KEY,
      Z_NAME TEXT,
      Z_SUPER INTEGER,
      Z_MAX INTEGER
    )
  `);

  // Create currency table
  db.exec(`
    CREATE TABLE ZCURRENCY (
      Z_PK INTEGER PRIMARY KEY AUTOINCREMENT,
      Z_ENT INTEGER,
      Z_OPT INTEGER,
      ZPCODE TEXT,
      ZPNAME TEXT
    )
  `);

  // Create transaction type table
  db.exec(`
    CREATE TABLE ZTRANSACTIONTYPE (
      Z_PK INTEGER PRIMARY KEY AUTOINCREMENT,
      Z_ENT INTEGER,
      Z_OPT INTEGER,
      ZPNAME TEXT,
      ZPSHORTNAME TEXT
    )
  `);

  // Create account table
  db.exec(`
    CREATE TABLE ZACCOUNT (
      Z_PK INTEGER PRIMARY KEY AUTOINCREMENT,
      Z_ENT INTEGER,
      Z_OPT INTEGER,
      ZPPARENT INTEGER,
      ZCURRENCY INTEGER,
      ZPACCOUNTCLASS INTEGER,
      ZPDEBIT INTEGER DEFAULT 1,
      ZPTAXABLE INTEGER DEFAULT 0,
      ZPNAME TEXT,
      ZPFULLNAME TEXT,
      ZPHIDDEN INTEGER DEFAULT 0,
      ZPCREATIONTIME REAL,
      ZPMODIFICATIONDATE REAL,
      ZPUNIQUEID TEXT
    )
  `);

  // Create transaction table
  db.exec(`
    CREATE TABLE ZTRANSACTION (
      Z_PK INTEGER PRIMARY KEY AUTOINCREMENT,
      Z_ENT INTEGER,
      Z_OPT INTEGER,
      ZPTRANSACTIONTYPE INTEGER,
      ZPCURRENCY INTEGER,
      ZPCREATIONTIME REAL,
      ZPDATE REAL,
      ZPMODIFICATIONDATE REAL,
      ZPTITLE TEXT,
      ZPNOTE TEXT,
      ZPUNIQUEID TEXT,
      ZPCLEARED INTEGER DEFAULT 0,
      ZPVOID INTEGER DEFAULT 0
    )
  `);

  // Create line item table
  db.exec(`
    CREATE TABLE ZLINEITEM (
      Z_PK INTEGER PRIMARY KEY AUTOINCREMENT,
      Z_ENT INTEGER,
      Z_OPT INTEGER,
      ZPACCOUNT INTEGER,
      ZPTRANSACTION INTEGER,
      ZPCREATIONTIME REAL,
      ZPTRANSACTIONAMOUNT REAL,
      ZPEXCHANGERATE REAL,
      ZPRUNNINGBALANCE REAL,
      ZPMEMO TEXT,
      ZPUNIQUEID TEXT,
      ZPCLEARED INTEGER DEFAULT 0,
      FOREIGN KEY (ZPACCOUNT) REFERENCES ZACCOUNT(Z_PK),
      FOREIGN KEY (ZPTRANSACTION) REFERENCES ZTRANSACTION(Z_PK)
    )
  `);

  // Create tag table
  db.exec(`
    CREATE TABLE ZTAG (
      Z_PK INTEGER PRIMARY KEY AUTOINCREMENT,
      Z_ENT INTEGER,
      Z_OPT INTEGER,
      ZPCREATIONTIME REAL,
      ZPMODIFICATIONDATE REAL,
      ZPNAME TEXT,
      ZPCANONICALNAME TEXT,
      ZPUNIQUEID TEXT
    )
  `);

  // Create tag-lineitem junction table
  db.exec(`
    CREATE TABLE Z_19PTAGS (
      Z_19PLINEITEMS INTEGER,
      Z_47PTAGS INTEGER,
      PRIMARY KEY (Z_19PLINEITEMS, Z_47PTAGS)
    )
  `);

  // Create transaction template table
  db.exec(`
    CREATE TABLE ZTRANSACTIONTEMPLATE (
      Z_PK INTEGER PRIMARY KEY AUTOINCREMENT,
      Z_ENT INTEGER,
      Z_OPT INTEGER,
      ZPACTIVE INTEGER DEFAULT 1,
      ZPFIXEDAMOUNT INTEGER DEFAULT 1,
      ZPCREATIONTIME REAL,
      ZPMODIFICATIONDATE REAL,
      ZPLASTAPPLIEDDATE REAL,
      ZPAMOUNT REAL,
      ZPCURRENCYID TEXT,
      ZPNOTE TEXT,
      ZPTITLE TEXT,
      ZPUNIQUEID TEXT
    )
  `);

  // Create line item template table
  db.exec(`
    CREATE TABLE ZLINEITEMTEMPLATE (
      Z_PK INTEGER PRIMARY KEY AUTOINCREMENT,
      Z_ENT INTEGER,
      Z_OPT INTEGER,
      ZPFIXEDAMOUNT INTEGER DEFAULT 1,
      ZPTRANSACTIONTEMPLATE INTEGER,
      ZPCREATIONTIME REAL,
      ZPTRANSACTIONAMOUNT REAL,
      ZPACCOUNTID TEXT,
      ZPMEMO TEXT,
      FOREIGN KEY (ZPTRANSACTIONTEMPLATE) REFERENCES ZTRANSACTIONTEMPLATE(Z_PK)
    )
  `);

  // Create template selector table (for import rules and scheduled transactions)
  db.exec(`
    CREATE TABLE ZTEMPLATESELECTOR (
      Z_PK INTEGER PRIMARY KEY AUTOINCREMENT,
      Z_ENT INTEGER,
      Z_OPT INTEGER,
      ZPTRANSACTIONTEMPLATE INTEGER,
      ZPRECURRINGTRANSACTION INTEGER,
      ZPCREATIONTIME REAL,
      ZPMODIFICATIONDATE REAL,
      ZPSTARTDATE REAL,
      ZPEXTERNALCALENDARNEXTDATE REAL,
      ZPREPEATINTERVAL INTEGER,
      ZPREPEATMULTIPLIER INTEGER,
      ZPDETAILSEXPRESSION TEXT,
      ZPACCOUNTID TEXT,
      ZPPAYEE TEXT,
      ZPREMINDDAYSINADVANCE INTEGER,
      ZPUNIQUEID TEXT,
      FOREIGN KEY (ZPTRANSACTIONTEMPLATE) REFERENCES ZTRANSACTIONTEMPLATE(Z_PK)
    )
  `);

  // Create recurring transaction table
  db.exec(`
    CREATE TABLE ZRECURRINGTRANSACTION (
      Z_PK INTEGER PRIMARY KEY AUTOINCREMENT,
      Z_ENT INTEGER,
      Z_OPT INTEGER,
      ZPATTRIBUTES INTEGER,
      ZPPRIORITY INTEGER,
      ZPREMINDDAYSINADVANCE INTEGER,
      ZPCREATIONTIME REAL,
      ZPFIRSTUNPROCESSEDEVENTDATE REAL,
      ZPMODIFICATIONDATE REAL,
      ZPUNIQUEID TEXT
    )
  `);

  return db;
}

/**
 * Seed database with initial data
 */
export function seedTestDatabase(db: Database.Database): TestData {
  const now = nowAsCoreData();

  // Insert default currency
  const currencyResult = db.prepare(`
    INSERT INTO ZCURRENCY (Z_ENT, Z_OPT, ZPCODE, ZPNAME)
    VALUES (?, 0, 'EUR', 'Euro')
  `).run(4);
  const currencyId = currencyResult.lastInsertRowid as number;

  // Insert transaction types
  db.prepare(`
    INSERT INTO ZTRANSACTIONTYPE (Z_ENT, Z_OPT, ZPNAME, ZPSHORTNAME)
    VALUES (?, 0, 'Withdrawal', 'W')
  `).run(Z_ENT.TRANSACTION_TYPE);
  db.prepare(`
    INSERT INTO ZTRANSACTIONTYPE (Z_ENT, Z_OPT, ZPNAME, ZPSHORTNAME)
    VALUES (?, 0, 'Deposit', 'D')
  `).run(Z_ENT.TRANSACTION_TYPE);

  // Insert checking account
  const checkingResult = db.prepare(`
    INSERT INTO ZACCOUNT (
      Z_ENT, Z_OPT, ZCURRENCY, ZPACCOUNTCLASS,
      ZPNAME, ZPFULLNAME, ZPCREATIONTIME, ZPMODIFICATIONDATE, ZPUNIQUEID
    ) VALUES (?, 0, ?, ?, 'Checking', 'Checking', ?, ?, ?)
  `).run(Z_ENT.ACCOUNT, currencyId, ACCOUNT_CLASS.CHECKING, now, now, generateUUID());
  const checkingAccountId = checkingResult.lastInsertRowid as number;

  // Insert savings account
  const savingsResult = db.prepare(`
    INSERT INTO ZACCOUNT (
      Z_ENT, Z_OPT, ZCURRENCY, ZPACCOUNTCLASS,
      ZPNAME, ZPFULLNAME, ZPCREATIONTIME, ZPMODIFICATIONDATE, ZPUNIQUEID
    ) VALUES (?, 0, ?, ?, 'Savings', 'Savings', ?, ?, ?)
  `).run(Z_ENT.ACCOUNT, currencyId, ACCOUNT_CLASS.SAVINGS, now, now, generateUUID());
  const savingsAccountId = savingsResult.lastInsertRowid as number;

  // Insert expense category
  const expenseResult = db.prepare(`
    INSERT INTO ZACCOUNT (
      Z_ENT, Z_OPT, ZCURRENCY, ZPACCOUNTCLASS,
      ZPNAME, ZPFULLNAME, ZPCREATIONTIME, ZPMODIFICATIONDATE, ZPUNIQUEID
    ) VALUES (?, 0, ?, ?, 'Groceries', 'Expenses:Groceries', ?, ?, ?)
  `).run(Z_ENT.CATEGORY, currencyId, ACCOUNT_CLASS.EXPENSE, now, now, generateUUID());
  const expenseAccountId = expenseResult.lastInsertRowid as number;

  // Insert income category
  const incomeResult = db.prepare(`
    INSERT INTO ZACCOUNT (
      Z_ENT, Z_OPT, ZCURRENCY, ZPACCOUNTCLASS,
      ZPNAME, ZPFULLNAME, ZPCREATIONTIME, ZPMODIFICATIONDATE, ZPUNIQUEID
    ) VALUES (?, 0, ?, ?, 'Salary', 'Income:Salary', ?, ?, ?)
  `).run(Z_ENT.CATEGORY, currencyId, ACCOUNT_CLASS.INCOME, now, now, generateUUID());
  const incomeAccountId = incomeResult.lastInsertRowid as number;

  return {
    currencyId,
    accounts: {
      checking: checkingAccountId,
      savings: savingsAccountId,
      groceries: expenseAccountId,
      salary: incomeAccountId,
    },
  };
}

export interface TestData {
  currencyId: number;
  accounts: {
    checking: number;
    savings: number;
    groceries: number;
    salary: number;
  };
}

/**
 * Create a mock DatabaseConnection-like object for testing
 */
export function createMockConnection(db: Database.Database) {
  return {
    instance: db,
    close: () => db.close(),
    getDefaultCurrencyId: () => {
      const row = db.prepare("SELECT Z_PK as id FROM ZCURRENCY LIMIT 1").get() as { id: number } | undefined;
      return row?.id ?? null;
    },
    getCurrencyIdByCode: (code: string) => {
      const row = db.prepare("SELECT Z_PK as id FROM ZCURRENCY WHERE ZPCODE = ?").get(code) as { id: number } | undefined;
      return row?.id ?? null;
    },
    getTransactionTypeId: (typeName: string) => {
      const row = db.prepare("SELECT Z_PK as id FROM ZTRANSACTIONTYPE WHERE ZPNAME = ? OR ZPSHORTNAME = ?").get(typeName, typeName) as { id: number } | undefined;
      return row?.id ?? null;
    },
  };
}
