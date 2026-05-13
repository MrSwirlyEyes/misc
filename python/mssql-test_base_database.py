"""
tests/test_base_database.py
----------------------------
Unit, mock, and integration tests for BaseDatabaseModule and StoredProcedureError.

Unit/mock tests: no database required.
Integration tests: require Windows Auth + local DB (--run-integration).
"""

import pytest
from unittest.mock import MagicMock, patch, call
from mssql_dbdriver import (
    MSSQLConnectionConfig,
    MSSQLConnection,
    BaseDatabaseModule,
    StoredProcedureError,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_config(**kwargs) -> MSSQLConnectionConfig:
    defaults = dict(server="s", database="d", username="u", password="p")
    defaults.update(kwargs)
    return MSSQLConnectionConfig(**defaults)


def make_mock_connection():
    """Return a MagicMock that behaves like MSSQLConnection."""
    mock_conn = MagicMock(spec=MSSQLConnection)
    mock_cursor = MagicMock()
    mock_conn.get_cursor.return_value.__enter__ = MagicMock(return_value=mock_cursor)
    mock_conn.get_cursor.return_value.__exit__ = MagicMock(return_value=False)
    return mock_conn, mock_cursor


class ConcreteDatabase(BaseDatabaseModule):
    """Minimal concrete subclass for testing."""
    pass


# ---------------------------------------------------------------------------
# StoredProcedureError
# ---------------------------------------------------------------------------

class TestStoredProcedureError:

    def test_message_format(self):
        err = StoredProcedureError("dbo.usp_test", -1, "Something failed")
        assert str(err) == "[dbo.usp_test] failed with code -1: Something failed"

    def test_attributes(self):
        err = StoredProcedureError("dbo.usp_test", -99, "Bad input")
        assert err.sp_name == "dbo.usp_test"
        assert err.error_code == -99
        assert err.message == "Bad input"

    def test_is_exception(self):
        err = StoredProcedureError("sp", -1, "msg")
        assert isinstance(err, Exception)

    def test_can_be_raised_and_caught(self):
        with pytest.raises(StoredProcedureError) as exc_info:
            raise StoredProcedureError("dbo.usp_test", -2, "Failure")
        assert exc_info.value.error_code == -2


# ---------------------------------------------------------------------------
# BaseDatabaseModule constructor
# ---------------------------------------------------------------------------

class TestBaseDatabaseModuleConstructor:

    def test_creates_own_connection_from_config(self):
        config = make_config()
        db = ConcreteDatabase(config)
        assert db._owns_connection is True
        assert isinstance(db._conn, MSSQLConnection)

    def test_creates_own_connection_from_kwargs(self):
        db = ConcreteDatabase(server="s", database="d", username="u", password="p")
        assert db._owns_connection is True

    def test_uses_injected_connection(self):
        mock_conn, _ = make_mock_connection()
        db = ConcreteDatabase(connection=mock_conn)
        assert db._conn is mock_conn
        assert db._owns_connection is False

    def test_injected_connection_not_disconnected_on_exit(self):
        mock_conn, _ = make_mock_connection()
        db = ConcreteDatabase(connection=mock_conn)
        db.__exit__(None, None, None)
        mock_conn.disconnect.assert_not_called()


# ---------------------------------------------------------------------------
# Context manager
# ---------------------------------------------------------------------------

class TestBaseDatabaseModuleContextManager:

    def test_enters_and_connects(self):
        mock_conn, _ = make_mock_connection()
        mock_conn.return_value = mock_conn
        db = ConcreteDatabase(connection=mock_conn)
        db._owns_connection = True
        result = db.__enter__()
        assert result is db
        mock_conn.connect.assert_called_once()

    def test_exits_and_disconnects_when_owns(self):
        mock_conn, _ = make_mock_connection()
        db = ConcreteDatabase(connection=mock_conn)
        db._owns_connection = True
        db.__exit__(None, None, None)
        mock_conn.disconnect.assert_called_once()

    def test_exits_without_disconnect_when_not_owns(self):
        mock_conn, _ = make_mock_connection()
        db = ConcreteDatabase(connection=mock_conn)
        db._owns_connection = False
        db.__exit__(None, None, None)
        mock_conn.disconnect.assert_not_called()

    def test_does_not_connect_when_not_owns(self):
        mock_conn, _ = make_mock_connection()
        db = ConcreteDatabase(connection=mock_conn)
        db._owns_connection = False
        db.__enter__()
        mock_conn.connect.assert_not_called()


# ---------------------------------------------------------------------------
# _fetchall
# ---------------------------------------------------------------------------

class TestFetchAll:

    def _make_db_with_cursor(self, rows, columns):
        mock_conn, mock_cursor = make_mock_connection()
        mock_cursor.description = [(col,) for col in columns]
        mock_cursor.fetchall.return_value = rows
        db = ConcreteDatabase(connection=mock_conn)
        return db, mock_cursor

    def test_returns_list_of_dicts(self):
        db, _ = self._make_db_with_cursor(
            rows=[("Alice", "alice@test.com"), ("Bob", "bob@test.com")],
            columns=["Name", "Email"],
        )
        result = db._fetchall("SELECT * FROM dbo.TestUsers")
        assert result == [
            {"Name": "Alice", "Email": "alice@test.com"},
            {"Name": "Bob", "Email": "bob@test.com"},
        ]

    def test_returns_empty_list_when_no_rows(self):
        db, _ = self._make_db_with_cursor(rows=[], columns=["Name"])
        result = db._fetchall("SELECT * FROM dbo.TestUsers")
        assert result == []

    def test_passes_params_to_cursor(self):
        db, mock_cursor = self._make_db_with_cursor(rows=[], columns=["Name"])
        db._fetchall("SELECT * FROM dbo.TestUsers WHERE Name = ?", ("Alice",))
        mock_cursor.execute.assert_called_once_with(
            "SELECT * FROM dbo.TestUsers WHERE Name = ?", ("Alice",)
        )

    def test_single_column(self):
        db, _ = self._make_db_with_cursor(rows=[(42,)], columns=["ID"])
        result = db._fetchall("SELECT UserID FROM dbo.TestUsers")
        assert result == [{"ID": 42}]


# ---------------------------------------------------------------------------
# _fetchone
# ---------------------------------------------------------------------------

class TestFetchOne:

    def _make_db_with_cursor(self, row, columns):
        mock_conn, mock_cursor = make_mock_connection()
        mock_cursor.description = [(col,) for col in columns]
        mock_cursor.fetchone.return_value = row
        db = ConcreteDatabase(connection=mock_conn)
        return db, mock_cursor

    def test_returns_dict_when_row_found(self):
        db, _ = self._make_db_with_cursor(
            row=("Alice", "alice@test.com"),
            columns=["Name", "Email"],
        )
        result = db._fetchone("SELECT * FROM dbo.TestUsers WHERE UserID = ?", (1,))
        assert result == {"Name": "Alice", "Email": "alice@test.com"}

    def test_returns_none_when_no_row(self):
        db, _ = self._make_db_with_cursor(row=None, columns=["Name", "Email"])
        result = db._fetchone("SELECT * FROM dbo.TestUsers WHERE UserID = ?", (999,))
        assert result is None

    def test_passes_params_to_cursor(self):
        db, mock_cursor = self._make_db_with_cursor(row=None, columns=["Name"])
        db._fetchone("SELECT * FROM dbo.TestUsers WHERE UserID = ?", (1,))
        mock_cursor.execute.assert_called_once_with(
            "SELECT * FROM dbo.TestUsers WHERE UserID = ?", (1,)
        )


# ---------------------------------------------------------------------------
# _exec_sp
# ---------------------------------------------------------------------------

class TestExecSP:

    def _make_db_with_sp_result(self, result_id, message=None):
        mock_conn, mock_cursor = make_mock_connection()
        columns = [("id",), ("message",)] if message is not None else [("id",)]
        mock_cursor.description = columns
        mock_cursor.fetchone.return_value = (
            (result_id, message) if message is not None else (result_id,)
        )
        db = ConcreteDatabase(connection=mock_conn)
        return db, mock_cursor

    def test_returns_id_on_success(self):
        db, _ = self._make_db_with_sp_result(42)
        result = db._exec_sp("dbo.usp_test_success", ("Alice", "alice@test.com"))
        assert result == 42

    def test_raises_stored_procedure_error_on_negative(self):
        db, _ = self._make_db_with_sp_result(-1, "Simulated failure")
        with pytest.raises(StoredProcedureError) as exc_info:
            db._exec_sp("dbo.usp_test_failure", ("Alice",))
        assert exc_info.value.error_code == -1
        assert exc_info.value.message == "Simulated failure"
        assert exc_info.value.sp_name == "dbo.usp_test_failure"

    def test_raises_runtime_error_when_no_rows(self):
        mock_conn, mock_cursor = make_mock_connection()
        mock_cursor.fetchone.return_value = None
        db = ConcreteDatabase(connection=mock_conn)
        with pytest.raises(RuntimeError, match="returned no rows"):
            db._exec_sp("dbo.usp_test_no_rows", ("Alice",))

    def test_no_message_column_uses_fallback(self):
        mock_conn, mock_cursor = make_mock_connection()
        mock_cursor.description = [("id",)]
        mock_cursor.fetchone.return_value = (-1,)
        db = ConcreteDatabase(connection=mock_conn)
        with pytest.raises(StoredProcedureError) as exc_info:
            db._exec_sp("dbo.usp_test_failure", ())
        assert exc_info.value.message == "No message returned."

    def test_builds_correct_exec_sql_no_params(self):
        mock_conn, mock_cursor = make_mock_connection()
        mock_cursor.description = [("id",)]
        mock_cursor.fetchone.return_value = (1,)
        db = ConcreteDatabase(connection=mock_conn)
        db._exec_sp("dbo.usp_test_success")
        sql_called = mock_cursor.execute.call_args[0][0]
        assert sql_called == "EXEC dbo.usp_test_success"

    def test_builds_correct_exec_sql_with_params(self):
        db, mock_cursor = self._make_db_with_sp_result(1)
        db._exec_sp("dbo.usp_test_success", ("Alice", "alice@test.com"))
        sql_called = mock_cursor.execute.call_args[0][0]
        assert sql_called == "EXEC dbo.usp_test_success ?, ?"


# ---------------------------------------------------------------------------
# _exec_sp_fetchall
# ---------------------------------------------------------------------------

class TestExecSPFetchAll:

    def test_returns_list_of_dicts(self):
        mock_conn, mock_cursor = make_mock_connection()
        mock_cursor.description = [("Name",), ("Email",)]
        mock_cursor.fetchall.return_value = [
            ("Alice", "alice@test.com"),
            ("Bob", "bob@test.com"),
        ]
        db = ConcreteDatabase(connection=mock_conn)
        result = db._exec_sp_fetchall("dbo.usp_get_users", ("active",))
        assert result == [
            {"Name": "Alice", "Email": "alice@test.com"},
            {"Name": "Bob", "Email": "bob@test.com"},
        ]

    def test_returns_empty_list(self):
        mock_conn, mock_cursor = make_mock_connection()
        mock_cursor.description = [("Name",)]
        mock_cursor.fetchall.return_value = []
        db = ConcreteDatabase(connection=mock_conn)
        result = db._exec_sp_fetchall("dbo.usp_get_users", ())
        assert result == []

    def test_builds_correct_exec_sql(self):
        mock_conn, mock_cursor = make_mock_connection()
        mock_cursor.description = [("Name",)]
        mock_cursor.fetchall.return_value = []
        db = ConcreteDatabase(connection=mock_conn)
        db._exec_sp_fetchall("dbo.usp_get_users", ("active",))
        sql_called = mock_cursor.execute.call_args[0][0]
        assert sql_called == "EXEC dbo.usp_get_users ?"


# ---------------------------------------------------------------------------
# _run_raw_query
# ---------------------------------------------------------------------------

class TestRunRawQuery:

    def test_returns_results(self):
        mock_conn, mock_cursor = make_mock_connection()
        mock_cursor.description = [("ID",)]
        mock_cursor.fetchall.return_value = [(1,)]
        db = ConcreteDatabase(connection=mock_conn)
        result = db._run_raw_query("SELECT UserID FROM dbo.TestUsers")
        assert result == [{"ID": 1}]

    def test_logs_warning(self, caplog):
        import logging
        mock_conn, mock_cursor = make_mock_connection()
        mock_cursor.description = [("ID",)]
        mock_cursor.fetchall.return_value = []
        db = ConcreteDatabase(connection=mock_conn)
        with caplog.at_level(logging.WARNING):
            db._run_raw_query("SELECT 1")
        assert "consider adding a named method" in caplog.text


# ---------------------------------------------------------------------------
# Integration tests — Windows Auth, local DB only
# ---------------------------------------------------------------------------

class TestBaseDatabaseModuleIntegration:

    @pytest.mark.integration
    def test_fetchall_returns_rows(self, integration_config):
        db = ConcreteDatabase(integration_config)
        with db:
            rows = db._fetchall("SELECT * FROM dbo.TestUsers")
        assert isinstance(rows, list)
        assert len(rows) >= 1
        assert "Name" in rows[0] or "name" in rows[0]

    @pytest.mark.integration
    def test_fetchone_returns_dict(self, integration_config):
        db = ConcreteDatabase(integration_config)
        with db:
            row = db._fetchone("SELECT TOP 1 * FROM dbo.TestUsers")
        assert isinstance(row, dict)
        assert row is not None

    @pytest.mark.integration
    def test_fetchone_returns_none_for_missing(self, integration_config):
        db = ConcreteDatabase(integration_config)
        with db:
            row = db._fetchone(
                "SELECT * FROM dbo.TestUsers WHERE UserID = ?", (-999,)
            )
        assert row is None

    @pytest.mark.integration
    def test_exec_sp_success(self, integration_config):
        db = ConcreteDatabase(integration_config)
        with db:
            result = db._exec_sp("dbo.usp_test_success", ("Alice", "alice@test.com"))
        assert result == 1

    @pytest.mark.integration
    def test_exec_sp_failure_raises(self, integration_config):
        db = ConcreteDatabase(integration_config)
        with db:
            with pytest.raises(StoredProcedureError) as exc_info:
                db._exec_sp("dbo.usp_test_failure", ("Alice",))
        assert exc_info.value.error_code == -1
        assert exc_info.value.message == "Simulated failure"

    @pytest.mark.integration
    def test_exec_sp_no_rows_raises(self, integration_config):
        db = ConcreteDatabase(integration_config)
        with db:
            with pytest.raises(RuntimeError, match="returned no rows"):
                db._exec_sp("dbo.usp_test_no_rows", ("Alice",))

    @pytest.mark.integration
    def test_exec_sp_fetchall_returns_rows(self, integration_config):
        db = ConcreteDatabase(integration_config)
        with db:
            rows = db._exec_sp_fetchall("dbo.usp_test_success", ("Alice", "alice@test.com"))
        assert isinstance(rows, list)

    @pytest.mark.integration
    def test_run_raw_query(self, integration_config):
        db = ConcreteDatabase(integration_config)
        with db:
            rows = db._run_raw_query("SELECT TOP 1 * FROM dbo.TestUsers")
        assert isinstance(rows, list)
        assert len(rows) == 1
