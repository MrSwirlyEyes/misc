# oracle-dbdriver

A lightweight, reusable Oracle database driver for Python 3.12+. Provides a generic connection manager and a base class for building database-specific query modules — designed to be extended, not modified.

---

## Features

- Generic Oracle connection manager with context manager support
- Thin mode by default — no Oracle Client installation required
- Optional thick mode for advanced Oracle Client features
- Base class for database-specific query modules — one base, many databases
- Direct INSERT, UPDATE, DELETE supported (no stored procedure restriction)
- Stored procedure support via `callproc` with typed OUT parameters
- REF CURSOR support for SPs that return result sets
- Automatic commit on success, rollback on failure
- Connection sharing across multiple database modules
- 100% test coverage with pytest

---

## Requirements

- Python 3.12+
- [`python-oracledb`](https://python-oracledb.readthedocs.io/)
- Oracle Client libraries (only required if using `thick_mode=True`)

---

## Installation

### From GitHub (recommended)

```bash
pip install git+ssh://git@github.com/yourorg/oracle-dbdriver.git
```

### Pin to a specific version or commit

```bash
pip install git+ssh://git@github.com/yourorg/oracle-dbdriver.git@v0.1.0
pip install git+ssh://git@github.com/yourorg/oracle-dbdriver.git@abc1234
```

### In `requirements.txt`

```
git+ssh://git@github.com/yourorg/oracle-dbdriver.git@v0.1.0
```

---

## Quick Start

### 1. Configure a connection

```python
from oracle_dbdriver import OracleConnectionConfig

config = OracleConnectionConfig(
    host="myhost",
    service_name="MYSERVICE",
    username="myuser",
    password="secret",
)
```

### 2. Use the connection directly

```python
from oracle_dbdriver import OracleConnection

with OracleConnection(config) as conn:
    with conn.get_cursor() as cur:
        cur.execute("SELECT * FROM users")
        rows = cur.fetchall()
```

### 3. Build a database module

Subclass `OracleBaseDatabaseModule` for each database. Reads and writes can both use direct SQL — no stored procedure restriction.

```python
from oracle_dbdriver import OracleBaseDatabaseModule, StoredProcedureError

class UserDatabase(OracleBaseDatabaseModule):

    # Reads — direct SELECT
    # Oracle bind variables use :1, :2, :3 positional syntax
    def get_all_users(self) -> list[dict]:
        return self._fetchall("SELECT * FROM users")

    def get_user_by_id(self, user_id: int) -> dict | None:
        return self._fetchone(
            "SELECT * FROM users WHERE user_id = :1",
            (user_id,),
        )

    def get_users_by_status(self, status: str) -> list[dict]:
        return self._fetchall(
            "SELECT * FROM users WHERE status = :1",
            (status,),
        )

    # Writes — direct DML (no SP restriction)
    def insert_user(self, name: str, email: str, status: str = "active") -> int:
        """Returns the number of rows affected."""
        return self._execute(
            "INSERT INTO users (name, email, status) VALUES (:1, :2, :3)",
            (name, email, status),
        )

    def update_user_status(self, user_id: int, status: str) -> int:
        return self._execute(
            "UPDATE users SET status = :1 WHERE user_id = :2",
            (status, user_id),
        )

    def delete_user(self, user_id: int) -> int:
        return self._execute(
            "DELETE FROM users WHERE user_id = :1",
            (user_id,),
        )

    # Writes — stored procedure (when business logic warrants it)
    def deactivate_cascade(self, user_id: int) -> int:
        """Returns entity ID on success, raises StoredProcedureError on failure."""
        return self._exec_sp("usp_deactivate_user_cascade", (user_id,))
```

### 4. Use your database module

```python
from oracle_dbdriver import OracleConnectionConfig, StoredProcedureError

config = OracleConnectionConfig(
    host="myhost",
    service_name="MYSERVICE",
    username="myuser",
    password="secret",
)

with UserDatabase(config) as db:
    # Read
    users = db.get_all_users()

    # Direct write
    rows_affected = db.insert_user("Alice", "alice@example.com")
    print(f"Inserted {rows_affected} row(s)")

    # SP write
    try:
        entity_id = db.deactivate_cascade(user_id=42)
        print(f"Deactivated user, entity ID: {entity_id}")
    except StoredProcedureError as e:
        print(f"SP failed — code: {e.error_code}, reason: {e.message}")
```

---

## Bind Variables

Oracle uses named or positional bind variables — never string interpolation. This driver uses positional syntax:

```python
# Correct
self._fetchall("SELECT * FROM users WHERE status = :1", ("active",))
self._execute("INSERT INTO users (name) VALUES (:1)", ("Alice",))

# Never do this — SQL injection risk
self._fetchall(f"SELECT * FROM users WHERE status = '{status}'")
```

Use the `_placeholders()` helper when building dynamic SQL:

```python
count = 3
placeholders = self._placeholders(count)  # ":1, :2, :3"
```

---

## Stored Procedure Contract

Stored procedures called via `_exec_sp` must have two trailing OUT parameters:

| Parameter | Type | Meaning |
|---|---|---|
| `p_id` | `NUMBER OUT` | Positive = success (entity ID). Negative = failure (error code). |
| `p_message` | `VARCHAR2 OUT` | Error detail. Populated on failure. |

Example SP:

```sql
CREATE OR REPLACE PROCEDURE usp_insert_user(
    p_name    IN  VARCHAR2,
    p_email   IN  VARCHAR2,
    p_id      OUT NUMBER,
    p_message OUT VARCHAR2
) AS
BEGIN
    INSERT INTO users (name, email)
    VALUES (p_name, p_email)
    RETURNING user_id INTO p_id;

    p_message := '';
EXCEPTION
    WHEN DUP_VAL_ON_INDEX THEN
        p_id      := -1;
        p_message := 'Email already exists';
END;
```

For SPs that return a result set, use a `SYS_REFCURSOR` as the last OUT parameter:

```sql
CREATE OR REPLACE PROCEDURE usp_get_active_users(
    p_status IN  VARCHAR2,
    p_cursor OUT SYS_REFCURSOR
) AS
BEGIN
    OPEN p_cursor FOR
        SELECT * FROM users WHERE status = p_status;
END;
```

```python
def get_active_users_via_sp(self, status: str) -> list[dict]:
    return self._exec_sp_fetchall("usp_get_active_users", (status,))
```

---

## Configuration Reference

```python
OracleConnectionConfig(
    host="myhost",              # Required. Hostname or IP.
    service_name="MYSERVICE",  # Required. Oracle service name.
    username="myuser",         # Required.
    password="secret",         # Required.
    port=1521,                 # Oracle listener port. Must be 1–65535.
    thick_mode=False,          # True = use Oracle Client libs (thick mode).
    timeout=30,                # Connection timeout in seconds.
    extra_params={},           # Additional connection parameters.
)
```

### Thin vs Thick Mode

| Mode | Default | Oracle Client Required | Use When |
|---|---|---|---|
| Thin | Yes | No | Most use cases — works out of the box |
| Thick | No | Yes | Wallets, advanced auth, older Oracle features |

```python
# Thick mode — requires Oracle Client installed on the machine
config = OracleConnectionConfig(
    host="myhost",
    service_name="MYSERVICE",
    username="myuser",
    password="secret",
    thick_mode=True,
)
```

---

## Advanced Usage

### Share one connection across multiple database modules

```python
from oracle_dbdriver import OracleConnection

with OracleConnection(config) as shared_conn:
    user_db  = UserDatabase(connection=shared_conn)
    order_db = OrderDatabase(connection=shared_conn)

    users  = user_db.get_all_users()
    orders = order_db.get_all_orders()
```

### Ad-hoc queries (escape hatch)

```python
class UserDatabase(OracleBaseDatabaseModule):
    def search(self, term: str) -> list[dict]:
        return self._run_raw_query(
            "SELECT * FROM users WHERE name LIKE :1",
            (f"%{term}%",),
        )
```

---

## Error Handling

### Direct DML errors

`_execute` rolls back automatically on any exception and re-raises it:

```python
try:
    db.insert_user("Alice", "alice@example.com")
except Exception as e:
    # Transaction already rolled back
    print(f"Insert failed: {e}")
```

### Stored procedure errors

```python
from oracle_dbdriver import StoredProcedureError

try:
    entity_id = db.deactivate_cascade(user_id=42)
except StoredProcedureError as e:
    print(e.sp_name)    # "usp_deactivate_user_cascade"
    print(e.error_code) # -1
    print(e.message)    # "User not found"
```

---

## Running Tests

```bash
# Install dev dependencies
pip install -e ".[dev]"

# Unit and mock tests only (no database required)
pytest -k "not integration"

# All tests including integration (requires Oracle DB credentials)
cp .env.test.example .env.test
# Edit .env.test with your credentials
pytest --run-integration
```

### `.env.test` format

```ini
TEST_ORACLE_HOST=your-host
TEST_ORACLE_SERVICE=your-service
TEST_ORACLE_USER=your-username
TEST_ORACLE_PASSWORD=your-password
TEST_ORACLE_PORT=1521
```

### Test database setup

Integration tests require the following table with at least one seeded row:

```sql
CREATE TABLE test_users (
    user_id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name    VARCHAR2(100) NOT NULL,
    email   VARCHAR2(100) NOT NULL,
    status  VARCHAR2(20)  DEFAULT 'active'
);

INSERT INTO test_users (name, email, status)
VALUES ('Test User', 'test@example.com', 'active');
COMMIT;
```

### GitHub Actions

Integration tests run in CI using GitHub Actions secrets. Add the following secrets to your repository under `Settings → Secrets → Actions`:

| Secret | Description |
|---|---|
| `TEST_ORACLE_HOST` | Oracle host |
| `TEST_ORACLE_SERVICE` | Oracle service name |
| `TEST_ORACLE_USER` | Oracle username |
| `TEST_ORACLE_PASSWORD` | Oracle password |
| `TEST_ORACLE_PORT` | Oracle port (default 1521) |

---

## Project Structure

```
oracle-dbdriver/
├── oracle_dbdriver/
│   ├── __init__.py                # Public API exports
│   ├── oracle_connection.py       # OracleConnectionConfig, OracleConnection
│   └── oracle_base_database.py   # OracleBaseDatabaseModule, StoredProcedureError
├── tests/
│   ├── conftest.py                # Fixtures, --run-integration flag
│   ├── test_config.py             # Config validation + DSN tests
│   ├── test_connection.py         # Connection lifecycle + cursor tests
│   └── test_base_database.py     # Query helpers + SP contract tests
├── .env.test.example              # Integration test credential template
├── pyproject.toml
└── README.md
```

---

## License

MIT
