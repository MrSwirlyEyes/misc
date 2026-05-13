"""
tests/test_base_database.py
----------------------------
Unit, mock, and integration tests for OracleBaseDatabaseModule and StoredProcedureError.

Unit/mock tests: no database required.
Integration tests: require Oracle DB credentials (--run-integration).
"""

import pytest
from unittest.mock import MagicMock, patch, call
from oracle_dbdriver import (
    OracleConnectionConfig,
    OracleConnection,
    OracleBaseDatabaseModule,
    StoredProcedureError,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_config(**kwargs) -> OracleConnectionConfig:
    defaults = dict(host="h", service_name="s", username="u", password="p")
    defaults.update(kwargs)
    return OracleConnectionConfig(**defaults)


def make_mock_connection():
    """Return a MagicMock that behaves like OracleConnection."""
    mock_conn = MagicMock(spec=OracleConnection)
    mock_cursor = MagicMock()
    mock_conn.get_cursor.return_value.__enter__ = MagicMock(return_value=mock_cursor)
    mock_conn.get_cursor.return_value.__exit__ = MagicMock(return_value=False)
    return mock_conn, mock_cursor


class ConcreteDatabase(OracleBaseDatabaseModule):
    """Minimal concrete subclass for testing."""
    pass


# ---------------------------------------------------------------------------
# StoredProcedureError
# ---------------------------------------------------------------------------

class TestStoredProcedureError:

    def test_message_format(self):
        err = StoredProcedureError("usp_test", -1, "Something failed")
        assert str(err) == "[usp_test] failed with code -1: Something failed"

    def test_attributes(self):
        err = StoredProcedureError("usp_test", -99, "Bad input")
        assert err.sp_name == "usp_test"
        assert err.error_code == -99
        assert err.message == "Bad input"

    def test_is_exception(self):
        err = StoredProcedureError("sp", -1, "msg")
        assert isinstance(err, Exception)

    def test_can_be_raised_and_caught(self):
        with pytest.raises(StoredProcedureError) as exc_info:
            raise StoredProcedureError("usp_test", -2, "Failure")
        assert exc_info.value.error_code == -2


# ---------------------------------------------------------------------------
# OracleBaseDatabaseModule constructor
# ---------------------------------------------------------------------------

class TestOracleBaseDatabaseModuleConstructor:

    def test_creates_own_connection_from_config(self):
        config = make_config()
        db = ConcreteDatabase(config)
        assert db._owns_connection is True
        assert isinstance(db._conn, OracleConnection)

    def test_creates_own_connection_from_kwargs(self):
        db = ConcreteDatabase(host="h", service_name="s", username="u", password="p")
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

class TestOracleBaseDatabaseModuleContextManager:

    def test_enters_and_connects(self):
        mock_conn, _ = make_mock_connection()
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
# _placeholders
# ---------------------------------------------------------------------------

class TestPlaceholders:

    def test_single(self):
        assert ConcreteDatabase._placeholders(1) == ":1"

    def test_multiple(self):
        assert ConcreteDatabase._placeholders(3) == ":1, :2, :3"

    def test_zero(self):
        assert ConcreteDatabase._placeholders(0) == ""


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
            columns=["NAME", "EMAIL"],
        )
        result = db._fetchall("SELECT * FROM users")
        assert result == [
            {"name": "Alice", "email": "alice@test.com"},
            {"name": "Bob", "email": "bob@test.com"},
        ]

    def test_column_names_lowercased(self):
        db, _ = self._make_db_with_cursor(
            rows=[("Alice",)],
            columns=["NAME"],
        )
        result = db._fetchall("SELECT name FROM users")
        assert "name" in result[0]
        assert "NAME" not in result[0]

    def test_returns_empty_list_when_no_rows(self):
        db, _ = self._make_db_with_cursor(rows=[], columns=["name"])
        result = db._fetchall("SELECT * FROM users")
        assert result == []

    def test_passes_params_to_cursor(self):
        db, mock_cursor = self._make_db_with_cursor(rows=[], columns=["name"])
        db._fetchall("SELECT * FROM users WHERE status = :1", ("active",))
        mock_cursor.execute.assert_called_once_with(
            "SELECT * FROM users WHERE status = :1", ("active",)
        )


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
            columns=["NAME", "EMAIL"],
        )
        result = db._fetchone("SELECT * FROM users WHERE user_id = :1", (1,))
        assert result == {"name": "Alice", "email": "alice@test.com"}

    def test_returns_none_when_no_row(self):
        db, _ = self._make_db_with_cursor(row=None, columns=["NAME", "EMAIL"])
        result = db._fetchone("SELECT * FROM users WHERE user_id = :1", (999,))
        assert result is None

    def test_column_names_lowercased(self):
        db, _ = self._make_db_with_cursor(row=("Alice",), columns=["NAME"])
        result = db._fetchone("SELECT name FROM users WHERE user_id = :1", (1,))
        assert "name" in result
        assert "NAME" not in result


# ---------------------------------------------------------------------------
# _execute
# ---------------------------------------------------------------------------

class TestExecute:

    def test_returns_rowcount(self):
        mock_conn, mock_cursor = make_mock_connection()
        mock_cursor.rowcount = 1
        db = ConcreteDatabase(connection=mock_conn)
        result = db._execute(
            "INSERT INTO users (name, email) VALUES (:1, :2)",
            ("Alice", "alice@test.com"),
        )
        assert result == 1

    def test_passes_sql_and_params(self):
        mock_conn, mock_cursor = make_mock_connection()
        mock_cursor.rowcount = 1
        db = ConcreteDatabase(connection=mock_conn)
        db._execute("DELETE FROM users WHERE user_id = :1", (42,))
        mock_cursor.execute.assert_called_once_with(
            "DELETE FROM users WHERE user_id = :1", (42,)
        )

    def test_zero_rows_affected(self):
        mock_conn, mock_cursor = make_mock_connection()
        mock_cursor.rowcount = 0
        db = ConcreteDatabase(connection=mock_conn)
        result = db._execute("DELETE FROM users WHERE user_id = :1", (999,))
        assert result == 0

    def test_multiple_rows_affected(self):
        mock_conn, mock_cursor = make_mock_connection()
        mock_cursor.rowcount = 5
        db = ConcreteDatabase(connection=mock_conn)
        result = db._execute("UPDATE users SET status = :1", ("inactive",))
        assert result == 5


# ---------------------------------------------------------------------------
# _exec_sp
# ---------------------------------------------------------------------------

class TestExecSP:

    def _make_sp_mock(self, result_id, message=""):
        import oracledb
        mock_conn, mock_cursor = make_mock_connection()
        mock_out_id = MagicMock()
        mock_out_id.getvalue.return_value = result_id
        mock_out_msg = MagicMock()
        mock_out_msg.getvalue.return_value = message

        def var_side_effect(type_):
            if type_ == oracledb.NUMBER:
                return mock_out_id
            return mock_out_msg

        mock_cursor.var.side_effect = var_side_effect
        db = ConcreteDatabase(connection=mock_conn)
        return db, mock_cursor, mock_out_id, mock_out_msg

    def test_returns_id_on_success(self):
        db, _, mock_out_id, _ = self._make_sp_mock(42)
        result = db._exec_sp("usp_insert_user", ("Alice", "alice@test.com"))
        assert result == 42

    def test_raises_stored_procedure_error_on_negative(self):
        db, _, _, _ = self._make_sp_mock(-1, "Simulated failure")
        with pytest.raises(StoredProcedureError) as exc_info:
            db._exec_sp("usp_test_failure", ("Alice",))
        assert exc_info.value.error_code == -1
        assert exc_info.value.message == "Simulated failure"

    def test_no_message_uses_fallback(self):
        db, _, _, mock_out_msg = self._make_sp_mock(-1)
        mock_out_msg.getvalue.return_value = None
        with pytest.raises(StoredProcedureError) as exc_info:
            db._exec_sp("usp_test_failure", ())
        assert exc_info.value.message == "No message returned."

    def test_none_result_treated_as_zero(self):
        db, _, mock_out_id, _ = self._make_sp_mock(None)
        mock_out_id.getvalue.return_value = None
        with pytest.raises(StoredProcedureError):
            db._exec_sp("usp_test", ())

    def test_callproc_called_with_correct_args(self):
        db, mock_cursor, mock_out_id, mock_out_msg = self._make_sp_mock(1)
        db._exec_sp("usp_insert_user", ("Alice", "alice@test.com"))
        mock_cursor.callproc.assert_called_once_with(
            "usp_insert_user",
            ["Alice", "alice@test.com", mock_out_id, mock_out_msg],
        )


# ---------------------------------------------------------------------------
# _exec_sp_fetchall
# ---------------------------------------------------------------------------

class TestExecSPFetchAll:

    def test_returns_list_of_dicts(self):
        import oracledb
        mock_conn, mock_cursor = make_mock_connection()
        mock_ref_cursor = MagicMock()
        mock_ref_cursor.description = [("NAME",), ("EMAIL",)]
        mock_ref_cursor.fetchall.return_value = [
            ("Alice", "alice@test.com"),
            ("Bob", "bob@test.com"),
        ]
        mock_cursor_var = MagicMock()
        mock_cursor_var.getvalue.return_value = mock_ref_cursor
        mock_cursor.var.return_value = mock_cursor_var
        db = ConcreteDatabase(connection=mock_conn)
        result = db._exec_sp_fetchall("usp_get_users", ("active",))
        assert result == [
            {"name": "Alice", "email": "alice@test.com"},
            {"name": "Bob", "email": "bob@test.com"},
        ]

    def test_returns_empty_list(self):
        import oracledb
        mock_conn, mock_cursor = make_mock_connection()
        mock_ref_cursor = MagicMock()
        mock_ref_cursor.description = [("NAME",)]
        mock_ref_cursor.fetchall.return_value = []
        mock_cursor_var = MagicMock()
        mock_cursor_var.getvalue.return_value = mock_ref_cursor
        mock_cursor.var.return_value = mock_cursor_var
        db = ConcreteDatabase(connection=mock_conn)
        result = db._exec_sp_fetchall("usp_get_users", ())
        assert result == []

    def test_column_names_lowercased(self):
        import oracledb
        mock_conn, mock_cursor = make_mock_connection()
        mock_ref_cursor = MagicMock()
        mock_ref_cursor.description = [("NAME",)]
        mock_ref_cursor.fetchall.return_value = [("Alice",)]
        mock_cursor_var = MagicMock()
        mock_cursor_var.getvalue.return_value = mock_ref_cursor
        mock_cursor.var.return_value = mock_cursor_var
        db = ConcreteDatabase(connection=mock_conn)
        result = db._exec_sp_fetchall("usp_get_users", ())
        assert "name" in result[0]
        assert "NAME" not in result[0]


# ---------------------------------------------------------------------------
# _run_raw_query
# ---------------------------------------------------------------------------

class TestRunRawQuery:

    def test_returns_results(self):
        mock_conn, mock_cursor = make_mock_connection()
        mock_cursor.description = [("USER_ID",)]
        mock_cursor.fetchall.return_value = [(1,)]
        db = ConcreteDatabase(connection=mock_conn)
        result = db._run_raw_query("SELECT user_id FROM users")
        assert result == [{"user_id": 1}]

    def test_logs_warning(self, caplog):
        import logging
        mock_conn, mock_cursor = make_mock_connection()
        mock_cursor.description = [("USER_ID",)]
        mock_cursor.fetchall.return_value = []
        db = ConcreteDatabase(connection=mock_conn)
        with caplog.at_level(logging.WARNING):
            db._run_raw_query("SELECT 1 FROM DUAL")
        assert "consider adding a named method" in caplog.text


# ---------------------------------------------------------------------------
# Integration tests
# ---------------------------------------------------------------------------

class TestOracleBaseDatabaseModuleIntegration:

    @pytest.mark.integration
    def test_fetchall_returns_rows(self, integration_config):
        db = ConcreteDatabase(integration_config)
        with db:
            rows = db._fetchall("SELECT * FROM test_users")
        assert isinstance(rows, list)
        assert len(rows) >= 1
        assert "name" in rows[0]

    @pytest.mark.integration
    def test_fetchone_returns_dict(self, integration_config):
        db = ConcreteDatabase(integration_config)
        with db:
            row = db._fetchone("SELECT * FROM test_users WHERE ROWNUM = 1")
        assert isinstance(row, dict)
        assert row is not None

    @pytest.mark.integration
    def test_fetchone_returns_none_for_missing(self, integration_config):
        db = ConcreteDatabase(integration_config)
        with db:
            row = db._fetchone(
                "SELECT * FROM test_users WHERE user_id = :1", (-999,)
            )
        assert row is None

    @pytest.mark.integration
    def test_execute_insert_and_delete(self, integration_config):
        db = ConcreteDatabase(integration_config)
        with db:
            rows_inserted = db._execute(
                "INSERT INTO test_users (name, email, status) VALUES (:1, :2, :3)",
                ("Integration Test", "integration@test.com", "active"),
            )
            assert rows_inserted == 1
            rows_deleted = db._execute(
                "DELETE FROM test_users WHERE email = :1",
                ("integration@test.com",),
            )
            assert rows_deleted == 1

    @pytest.mark.integration
    def test_execute_update(self, integration_config):
        db = ConcreteDatabase(integration_config)
        with db:
            db._execute(
                "INSERT INTO test_users (name, email, status) VALUES (:1, :2, :3)",
                ("Update Test", "update@test.com", "active"),
            )
            rows_updated = db._execute(
                "UPDATE test_users SET status = :1 WHERE email = :2",
                ("inactive", "update@test.com"),
            )
            assert rows_updated == 1
            db._execute(
                "DELETE FROM test_users WHERE email = :1",
                ("update@test.com",),
            )

    @pytest.mark.integration
    def test_run_raw_query(self, integration_config):
        db = ConcreteDatabase(integration_config)
        with db:
            rows = db._run_raw_query("SELECT * FROM test_users WHERE ROWNUM <= 1")
        assert isinstance(rows, list)
        assert len(rows) == 1

    @pytest.mark.integration
    def test_shared_connection(self, integration_config):
        with OracleConnection(integration_config) as shared_conn:
            db1 = ConcreteDatabase(connection=shared_conn)
            db2 = ConcreteDatabase(connection=shared_conn)
            rows1 = db1._fetchall("SELECT 1 AS n FROM DUAL")
            rows2 = db2._fetchall("SELECT 2 AS n FROM DUAL")
        assert rows1 == [{"n": 1}]
        assert rows2 == [{"n": 2}]
