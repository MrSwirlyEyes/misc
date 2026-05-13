"""
tests/test_connection.py
-------------------------
Unit and integration tests for MSSQLConnection.

Unit/mock tests: no database required.
Integration tests: require Windows Auth + local DB (--run-integration).
"""

import pytest
from unittest.mock import MagicMock, patch, call
from mssql_dbdriver import MSSQLConnectionConfig, MSSQLConnection


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_config(**kwargs) -> MSSQLConnectionConfig:
    defaults = dict(server="s", database="d", username="u", password="p")
    defaults.update(kwargs)
    return MSSQLConnectionConfig(**defaults)


def make_trusted_config(**kwargs) -> MSSQLConnectionConfig:
    defaults = dict(server="s", database="d", trusted_connection=True)
    defaults.update(kwargs)
    return MSSQLConnectionConfig(**defaults)


# ---------------------------------------------------------------------------
# Constructor
# ---------------------------------------------------------------------------

class TestMSSQLConnectionConstructor:

    def test_accepts_config_instance(self):
        config = make_config()
        conn = MSSQLConnection(config)
        assert conn.config is config

    def test_accepts_kwargs(self):
        conn = MSSQLConnection(server="s", database="d", username="u", password="p")
        assert conn.config.server == "s"

    def test_raises_on_class_not_instance(self):
        with pytest.raises(TypeError, match="Did you forget parentheses"):
            MSSQLConnection(MSSQLConnectionConfig)

    def test_initial_connection_is_none(self):
        conn = MSSQLConnection(make_config())
        assert conn._connection is None

    def test_is_connected_false_initially(self):
        conn = MSSQLConnection(make_config())
        assert conn.is_connected() is False


# ---------------------------------------------------------------------------
# connect / disconnect
# ---------------------------------------------------------------------------

class TestMSSQLConnectionLifecycle:

    @patch("mssql_dbdriver.db_connection.pyodbc.connect")
    def test_connect_opens_connection(self, mock_connect):
        mock_connect.return_value = MagicMock()
        conn = MSSQLConnection(make_config())
        conn.connect()
        mock_connect.assert_called_once()
        assert conn.is_connected() is True

    @patch("mssql_dbdriver.db_connection.pyodbc.connect")
    def test_connect_skips_if_already_open(self, mock_connect):
        mock_connect.return_value = MagicMock()
        conn = MSSQLConnection(make_config())
        conn.connect()
        conn.connect()
        mock_connect.assert_called_once()

    @patch("mssql_dbdriver.db_connection.pyodbc.connect")
    def test_disconnect_closes_connection(self, mock_connect):
        mock_pyodbc_conn = MagicMock()
        mock_connect.return_value = mock_pyodbc_conn
        conn = MSSQLConnection(make_config())
        conn.connect()
        conn.disconnect()
        mock_pyodbc_conn.close.assert_called_once()
        assert conn.is_connected() is False

    def test_disconnect_when_not_connected_is_safe(self):
        conn = MSSQLConnection(make_config())
        conn.disconnect()  # Should not raise

    @patch("mssql_dbdriver.db_connection.pyodbc.connect")
    def test_context_manager_connects_and_disconnects(self, mock_connect):
        mock_pyodbc_conn = MagicMock()
        mock_connect.return_value = mock_pyodbc_conn
        config = make_config()
        with MSSQLConnection(config) as conn:
            assert conn.is_connected() is True
        mock_pyodbc_conn.close.assert_called_once()
        assert conn.is_connected() is False

    @patch("mssql_dbdriver.db_connection.pyodbc.connect")
    def test_autocommit_false(self, mock_connect):
        mock_pyodbc_conn = MagicMock()
        mock_connect.return_value = mock_pyodbc_conn
        conn = MSSQLConnection(make_config())
        conn.connect()
        _, kwargs = mock_connect.call_args
        assert kwargs.get("autocommit") is False


# ---------------------------------------------------------------------------
# raw_connection property
# ---------------------------------------------------------------------------

class TestRawConnection:

    def test_raises_when_not_connected(self):
        conn = MSSQLConnection(make_config())
        with pytest.raises(RuntimeError, match="Not connected"):
            _ = conn.raw_connection

    @patch("mssql_dbdriver.db_connection.pyodbc.connect")
    def test_returns_pyodbc_connection(self, mock_connect):
        mock_pyodbc_conn = MagicMock()
        mock_connect.return_value = mock_pyodbc_conn
        conn = MSSQLConnection(make_config())
        conn.connect()
        assert conn.raw_connection is mock_pyodbc_conn


# ---------------------------------------------------------------------------
# get_cursor
# ---------------------------------------------------------------------------

class TestGetCursor:

    def _make_connected_conn(self, mock_connect):
        mock_cursor = MagicMock()
        mock_pyodbc_conn = MagicMock()
        mock_pyodbc_conn.cursor.return_value = mock_cursor
        mock_connect.return_value = mock_pyodbc_conn
        conn = MSSQLConnection(make_config())
        conn.connect()
        return conn, mock_pyodbc_conn, mock_cursor

    @patch("mssql_dbdriver.db_connection.pyodbc.connect")
    def test_yields_cursor(self, mock_connect):
        conn, _, mock_cursor = self._make_connected_conn(mock_connect)
        with conn.get_cursor() as cur:
            assert cur is mock_cursor

    @patch("mssql_dbdriver.db_connection.pyodbc.connect")
    def test_cursor_closed_after_exit(self, mock_connect):
        conn, _, mock_cursor = self._make_connected_conn(mock_connect)
        with conn.get_cursor() as cur:
            pass
        mock_cursor.close.assert_called_once()

    @patch("mssql_dbdriver.db_connection.pyodbc.connect")
    def test_commits_when_commit_on_exit_true(self, mock_connect):
        conn, mock_pyodbc_conn, _ = self._make_connected_conn(mock_connect)
        with conn.get_cursor(commit_on_exit=True):
            pass
        mock_pyodbc_conn.commit.assert_called_once()

    @patch("mssql_dbdriver.db_connection.pyodbc.connect")
    def test_no_commit_when_commit_on_exit_false(self, mock_connect):
        conn, mock_pyodbc_conn, _ = self._make_connected_conn(mock_connect)
        with conn.get_cursor(commit_on_exit=False):
            pass
        mock_pyodbc_conn.commit.assert_not_called()

    @patch("mssql_dbdriver.db_connection.pyodbc.connect")
    def test_rollback_on_exception(self, mock_connect):
        conn, mock_pyodbc_conn, _ = self._make_connected_conn(mock_connect)
        with pytest.raises(ValueError):
            with conn.get_cursor() as cur:
                raise ValueError("boom")
        mock_pyodbc_conn.rollback.assert_called_once()

    @patch("mssql_dbdriver.db_connection.pyodbc.connect")
    def test_cursor_closed_even_on_exception(self, mock_connect):
        conn, _, mock_cursor = self._make_connected_conn(mock_connect)
        with pytest.raises(ValueError):
            with conn.get_cursor() as cur:
                raise ValueError("boom")
        mock_cursor.close.assert_called_once()

    @patch("mssql_dbdriver.db_connection.pyodbc.connect")
    def test_auto_connects_if_not_connected(self, mock_connect):
        mock_cursor = MagicMock()
        mock_pyodbc_conn = MagicMock()
        mock_pyodbc_conn.cursor.return_value = mock_cursor
        mock_connect.return_value = mock_pyodbc_conn
        conn = MSSQLConnection(make_config())
        assert not conn.is_connected()
        with conn.get_cursor():
            pass
        assert conn.is_connected()


# ---------------------------------------------------------------------------
# Integration tests — Windows Auth, local DB only
# ---------------------------------------------------------------------------

class TestMSSQLConnectionIntegration:

    @pytest.mark.integration
    def test_connect_and_disconnect(self, integration_config):
        conn = MSSQLConnection(integration_config)
        conn.connect()
        assert conn.is_connected() is True
        conn.disconnect()
        assert conn.is_connected() is False

    @pytest.mark.integration
    def test_context_manager(self, integration_config):
        with MSSQLConnection(integration_config) as conn:
            assert conn.is_connected() is True
        assert conn.is_connected() is False

    @pytest.mark.integration
    def test_cursor_executes_query(self, integration_config):
        with MSSQLConnection(integration_config) as conn:
            with conn.get_cursor() as cur:
                cur.execute("SELECT 1 AS n")
                row = cur.fetchone()
                assert row[0] == 1

    @pytest.mark.integration
    def test_commit_on_exit(self, integration_config):
        with MSSQLConnection(integration_config) as conn:
            with conn.get_cursor(commit_on_exit=True) as cur:
                cur.execute("SELECT 1 AS n")

    @pytest.mark.integration
    def test_rollback_on_exception(self, integration_config):
        with MSSQLConnection(integration_config) as conn:
            with pytest.raises(Exception):
                with conn.get_cursor() as cur:
                    cur.execute("SELECT 1/0")  # Division by zero
