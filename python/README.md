# mssql-dbdriver

A lightweight, reusable MS SQL Server database driver for Python 3.12+. Provides a generic connection manager and a base class for building database-specific query modules — designed to be extended, not modified.

---

## Features

- Generic MS SQL Server connection manager with context manager support
- Supports both SQL Server credential auth and Windows Integrated Authentication
- Base class for database-specific query modules — one base, many databases
- All writes enforced through stored procedures
- SP result contract: positive integer = success (entity ID), negative integer = failure with message
- Automatic commit on success, rollback on failure
- Connection sharing across multiple database modules
- 100% test coverage with pytest

---

## Requirements

- Python 3.12+
- [`pyodbc`](https://github.com/mkleehammer/pyodbc)
- [Microsoft ODBC Driver for SQL Server](https://learn.microsoft.com/en-us/sql/connect/odbc/download-odbc-driver-for-sql-server)

---

## Installation

### From GitHub (recommended)

```bash
pip install git+ssh://git@github.com/yourorg/mssql-dbdriver.git
```

### Pin to a specific version or commit

```bash
pip install git+ssh://git@github.com/yourorg/mssql-dbdriver.git@v0.1.0
pip install git+ssh://git@github.com/yourorg/mssql-dbdriver.git@abc1234
```

### In `requirements.txt`

```
git+ssh://git@github.com/yourorg/mssql-dbdriver.git@v0.1.0
```

---

## Quick Start

### 1. Configure a connection

```python
from mssql_dbdriver import MSSQLConnectionConfig

# SQL Server credentials
config = MSSQLConnectionConfig(
    server="myserver",
    database="MyDatabase",
    username="sa",
    password="secret",
)

# Windows Integrated Authentication (no username/password needed)
config = MSSQLConnectionConfig(
    server="myserver",
    database="MyDatabase",
    trusted_connection=True,
)
```

### 2. Use the connection directly

```python
from mssql_dbdriver import MSSQLConnection

with MSSQLConnection(config) as conn:
    with conn.get_cursor() as cur:
        cur.execute("SELECT * FROM dbo.Users")
        rows = cur.fetchall()
```

### 3. Build a database module

Subclass `BaseDatabaseModule` for each database. Reads use direct SQL. All writes must go through stored procedures.

```python
from mssql_dbdriver import BaseDatabaseModule, StoredProcedureError

class UserDatabase(BaseDatabaseModule):

    # Reads — direct SELECT
    def get_all_users(self) -> list[dict]:
        return self._fetchall("SELECT * FROM dbo.Users")

    def get_user_by_id(self, user_id: int) -> dict | None:
        return self._fetchone(
            "SELECT * FROM dbo.Users WHERE UserID = ?",
            (user_id,),
        )

    def get_users_by_status(self, status: str) -> list[dict]:
        return self._fetchall(
            "SELECT * FROM dbo.Users WHERE Status = ?",
            (status,),
        )

    # Writes — stored procedures only
    def insert_user(self, name: str, email: str) -> int:
        """Returns the new UserID on success."""
        return self._exec_sp("dbo.usp_InsertUser", (name, email))

    def update_user_status(self, user_id: int, status: str) -> int:
        return self._exec_sp("dbo.usp_UpdateUserStatus", (user_id, status))

    def delete_user(self, user_id: int) -> int:
        return self._exec_sp("dbo.usp_DeleteUser", (user_id,))
```

### 4. Use your database module

```python
from mssql_dbdriver import MSSQLConnectionConfig, StoredProcedureError

config = MSSQLConnectionConfig(
    server="myserver",
    database="MyDatabase",
    trusted_connection=True,
)

with UserDatabase(config) as db:
    # Read
    users = db.get_all_users()

    # Write — handles SP success/failure automatically
    try:
        new_id = db.insert_user("Alice", "alice@example.com")
        print(f"Created user with ID {new_id}")
    except StoredProcedureError as e:
        print(f"SP failed — code: {e.error_code}, reason: {e.message}")
```

---

## Stored Procedure Contract

All write stored procedures must return a single row with:

| Column | Type | Meaning |
|---|---|---|
| First column | `INT` | Positive = success (entity ID returned). Negative = failure (error code). |
| `message` | `VARCHAR` | Error detail. Only required when returning a negative code. |

Example SP:

```sql
CREATE PROCEDURE dbo.usp_InsertUser
    @Name  NVARCHAR(100),
    @Email NVARCHAR(100)
AS
BEGIN
    -- On success
    SELECT SCOPE_IDENTITY() AS ID, '' AS message

    -- On failure
    -- SELECT -1 AS ID, 'Email already exists' AS message
END
```

---

## Configuration Reference

```python
MSSQLConnectionConfig(
    server="myserver",              # Required. Hostname or IP.
    database="MyDatabase",          # Required. Database name.
    username=None,                  # Required unless trusted_connection=True.
    password=None,                  # Required unless trusted_connection=True.
    odbc_driver="ODBC Driver 17 for SQL Server",  # ODBC driver name.
    port=1433,                      # SQL Server port. Must be 1–65535.
    trusted_connection=False,       # True = Windows Integrated Auth.
    timeout=30,                     # Connection timeout in seconds.
    extra_params={},                # Additional ODBC key/value pairs.
)
```

---

## Advanced Usage

### Share one connection across multiple database modules

```python
from mssql_dbdriver import MSSQLConnection

with MSSQLConnection(config) as shared_conn:
    user_db  = UserDatabase(connection=shared_conn)
    order_db = OrderDatabase(connection=shared_conn)

    users  = user_db.get_all_users()
    orders = order_db.get_all_orders()
```

### Use a stored procedure that returns a result set

```python
class UserDatabase(BaseDatabaseModule):
    def get_active_users_via_sp(self) -> list[dict]:
        return self._exec_sp_fetchall("dbo.usp_GetActiveUsers", ("active",))
```

### Ad-hoc queries (escape hatch)

```python
class UserDatabase(BaseDatabaseModule):
    def search(self, term: str) -> list[dict]:
        return self._run_raw_query(
            "SELECT * FROM dbo.Users WHERE Name LIKE ?",
            (f"%{term}%",),
        )
```

---

## Error Handling

```python
from mssql_dbdriver import StoredProcedureError

try:
    new_id = db.insert_user("Alice", "alice@example.com")
except StoredProcedureError as e:
    print(e.sp_name)    # "dbo.usp_InsertUser"
    print(e.error_code) # -1
    print(e.message)    # "Email already exists"
```

`get_cursor` automatically rolls back the transaction on any unhandled exception and re-raises it — no manual rollback needed.

---

## Running Tests

```bash
# Install dev dependencies
pip install -e ".[dev]"

# Unit and mock tests only (no database required)
pytest -k "not integration"

# All tests including integration (requires Windows Auth + local DB)
cp .env.test.example .env.test
# Edit .env.test with your server and database name
pytest --run-integration
```

Integration tests require the following objects in your test database:

```sql
CREATE TABLE dbo.TestUsers (
    UserID INT IDENTITY(1,1) PRIMARY KEY,
    Name   NVARCHAR(100) NOT NULL,
    Email  NVARCHAR(100) NOT NULL,
    Status NVARCHAR(20)  DEFAULT 'active'
);

INSERT INTO dbo.TestUsers (Name, Email, Status)
VALUES ('Test User', 'test@example.com', 'active');

CREATE PROCEDURE dbo.usp_test_success
    @Name NVARCHAR(100), @Email NVARCHAR(100)
AS BEGIN SELECT 1 AS ID, '' AS message END;

CREATE PROCEDURE dbo.usp_test_failure
    @Name NVARCHAR(100)
AS BEGIN SELECT -1 AS ID, 'Simulated failure' AS message END;

CREATE PROCEDURE dbo.usp_test_no_rows
    @Name NVARCHAR(100)
AS BEGIN SELECT TOP 0 1 AS ID, '' AS message WHERE 1 = 0 END;
```

---

## Project Structure

```
mssql-dbdriver/
├── mssql_dbdriver/
│   ├── __init__.py          # Public API exports
│   ├── db_connection.py     # MSSQLConnectionConfig, MSSQLConnection
│   └── base_database.py     # BaseDatabaseModule, StoredProcedureError
├── tests/
│   ├── conftest.py          # Fixtures, --run-integration flag
│   ├── test_config.py       # Config validation + connection string tests
│   ├── test_connection.py   # Connection lifecycle + cursor tests
│   └── test_base_database.py # Query helpers + SP contract tests
├── .env.test.example        # Integration test credential template
├── pyproject.toml
└── README.md
```

---

## License

MIT
