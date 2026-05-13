"""
tests/test_connection.py
-------------------------
Unit, mock, and integration tests for OracleConnection.

Unit/mock tests: no database required.
Integration tests: require Oracle DB credentials (--run-integration).
"""

import pytest
from unittest.mock import MagicMock, patch, PropertyMock
from oracle_dbdriver import OracleConnectionConfig, OracleConnection


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_config(**kwargs) -> OracleConnectionConfig:
    defaults = dict(host="h", service_name="s", username="u", password="p")
    defaults.update(kwargs)
    return OracleConnectionConfig(**defaults)


# ---------------------------------------------------------------------------
# Constructor
# ---------------------------------------------------------------------------

class TestOracleConnectionConstructor:

    def test_accepts_config_instance(self):
        config = make_config()
        conn = OracleConnection(config)
        assert conn.config is config

    def test_accepts_kwargs(self):
        conn = OracleConnection(
            host="h", service_name="s", username="u", password="p"
        )
        assert conn.config.host == "h"

    def test_raises_on_class_not_instance(self):
        with pytest.raises(TypeError, match="Did you forget parentheses"):
            OracleConnection(OracleConnectionConfig)

    def test_initial_connection_is_none(self):
        conn = OracleConnection(make_config())
        assert conn._connection is None

    def test_is_connected_false_initially(self):
        conn = OracleConnection(make_config())
        assert conn.is_connected() is False

    @patch("oracle_dbdriver.oracle_connection.oracledb.init_oracle_client")
    def test_thick_mode_calls_init_oracle_client(self, mock_init):
        config = make_config(thick_mode=True)
        OracleConnection(config)
        mock_init.assert_called_once()

    def test_thin_mode_does_not_call_init_oracle_client(self):
        with patch("oracle_dbdriver.oracle_connection.oracledb.init_oracle_client") as mock_init:
            OracleConnection(make_config(thick_mode=False))
            mock_init.assert_not_called()


# ---------------------------------------------------------------------------
# connect / disconnect
# ---------------------------------------------------------------------------

class TestOracleConnectionLifecycle:

    @patch("oracle_dbdriver.oracle_connection.oracledb.connect")
    def test_connect_opens_connection(self, mock_connect):
        mock_connect.return_value = MagicMock()
        conn = OracleConnection(make_config())
        conn.connect()
        mock_connect.assert_called_once_with(
            user="u", password="p", dsn="h:1521/s"
        )
        assert conn.is_connected() is True

    @patch("oracle_dbdriver.oracle_connection.oracledb.connect")
    def test_connect_skips_if_already_open(self, mock_connect):
        mock_connect.return_value = MagicMock()
        conn = OracleConnection(make_config())
        conn.connect()
        conn.connect()
        mock_connect.assert_called_once()

    @patch("oracle_dbdriver.oracle_connection.oracledb.connect")
    def test_autocommit_set_false(self, mock_connect):
        mock_oracledb_conn = MagicMock()
        mock_connect.return_value = mock_oracledb_conn
        conn = OracleConnection(make_config())
        conn.connect()
        assert mock_oracledb_conn.autocommit is False

    @patch("oracle_dbdriver.oracle_connection.oracledb.connect")
    def test_disconnect_closes_connection(self, mock_connect):
        mock_oracledb_conn = MagicMock()
        mock_connect.return_value = mock_oracledb_conn
        conn = OracleConnection(make_config())
        conn.connect()
        conn.disconnect()
        mock_oracledb_conn.close.assert_called_once()
        assert conn.is_connected() is False

    def test_disconnect_when_not_connected_is_safe(self):
        conn = OracleConnection(make_config())
        conn.disconnect()  # Should not raise

    @patch("oracle_dbdriver.oracle_connection.oracledb.connect")
    def test_context_manager_connects_and_disconnects(self, mock_connect):
        mock_oracledb_conn = MagicMock()
        mock_connect.return_value = mock_oracledb_conn
        with OracleConnection(make_config()) as conn:
            assert conn.is_connected() is True
        mock_oracledb_conn.close.assert_called_once()
        assert conn.is_connected() is False


# ---------------------------------------------------------------------------
# raw_connection property
# ---------------------------------------------------------------------------

class TestRawConnection:

    def test_raises_when_not_connected(self):
        conn = OracleConnection(make_config())
        with pytest.raises(RuntimeError, match="Not connected"):
            _ = conn.raw_connection

    @patch("oracle_dbdriver.oracle_connection.oracledb.connect")
    def test_returns_oracledb_connection(self, mock_connect):
        mock_oracledb_conn = MagicMock()
        mock_connect.return_value = mock_oracledb_conn
        conn = OracleConnection(make_config())
        conn.connect()
        assert conn.raw_connection is mock_oracledb_conn


# ---------------------------------------------------------------------------
# get_cursor
# ---------------------------------------------------------------------------

class TestGetCursor:

    def _make_connected_conn(self, mock_connect):
        mock_cursor = MagicMock()
        mock_oracledb_conn = MagicMock()
        mock_oracledb_conn.cursor.return_value = mock_cursor
        mock_connect.return_value = mock_oracledb_conn
        conn = OracleConnection(make_config())
        conn.connect()
        return conn, mock_oracledb_conn, mock_cursor

    @patch("oracle_dbdriver.oracle_connection.oracledb.connect")
    def test_yields_cursor(self, mock_connect):
        conn, _, mock_cursor = self._make_connected_conn(mock_connect)
        with conn.get_cursor() as cur:
            assert cur is mock_cursor

    @patch("oracle_dbdriver.oracle_connection.oracledb.connect")
    def test_cursor_closed_after_exit(self, mock_connect):
        conn, _, mock_cursor = self._make_connected_conn(mock_connect)
        with conn.get_cursor():
            pass
        mock_cursor.close.assert_called_once()

    @patch("oracle_dbdriver.oracle_connection.oracledb.connect")
    def test_commits_when_commit_on_exit_true(self, mock_connect):
        conn, mock_oracledb_conn, _ = self._make_connected_conn(mock_connect)
        with conn.get_cursor(commit_on_exit=True):
            pass
        mock_oracledb_conn.commit.assert_called_once()

    @patch("oracle_dbdriver.oracle_connection.oracledb.connect")
    def test_no_commit_when_commit_on_exit_false(self, mock_connect):
        conn, mock_oracledb_conn, _ = self._make_connected_conn(mock_connect)
        with conn.get_cursor(commit_on_exit=False):
            pass
        mock_oracledb_conn.commit.assert_not_called()

    @patch("oracle_dbdriver.oracle_connection.oracledb.connect")
    def test_rollback_on_exception(self, mock_connect):
        conn, mock_oracledb_conn, _ = self._make_connected_conn(mock_connect)
        with pytest.raises(ValueError):
            with conn.get_cursor():
                raise ValueError("boom")
        mock_oracledb_conn.rollback.assert_called_once()

    @patch("oracle_dbdriver.oracle_connection.oracledb.connect")
    def test_cursor_closed_even_on_exception(self, mock_connect):
        conn, _, mock_cursor = self._make_connected_conn(mock_connect)
        with pytest.raises(ValueError):
            with conn.get_cursor():
                raise ValueError("boom")
        mock_cursor.close.assert_called_once()

    @patch("oracle_dbdriver.oracle_connection.oracledb.connect")
    def test_auto_connects_if_not_connected(self, mock_connect):
        mock_cursor = MagicMock()
        mock_oracledb_conn = MagicMock()
        mock_oracledb_conn.cursor.return_value = mock_cursor
        mock_connect.return_value = mock_oracledb_conn
        conn = OracleConnection(make_config())
        assert not conn.is_connected()
        with conn.get_cursor():
            pass
        assert conn.is_connected()


# ---------------------------------------------------------------------------
# Integration tests
# ---------------------------------------------------------------------------

class TestOracleConnectionIntegration:

    @pytest.mark.integration
    def test_connect_and_disconnect(self, integration_config):
        conn = OracleConnection(integration_config)
        conn.connect()
        assert conn.is_connected() is True
        conn.disconnect()
        assert conn.is_connected() is False

    @pytest.mark.integration
    def test_context_manager(self, integration_config):
        with OracleConnection(integration_config) as conn:
            assert conn.is_connected() is True
        assert conn.is_connected() is False

    @pytest.mark.integration
    def test_cursor_executes_query(self, integration_config):
        with OracleConnection(integration_config) as conn:
            with conn.get_cursor() as cur:
                cur.execute("SELECT 1 FROM DUAL")
                row = cur.fetchone()
                assert row[0] == 1

    @pytest.mark.integration
    def test_commit_on_exit(self, integration_config):
        with OracleConnection(integration_config) as conn:
            with conn.get_cursor(commit_on_exit=True) as cur:
                cur.execute("SELECT 1 FROM DUAL")

    @pytest.mark.integration
    def test_rollback_on_exception(self, integration_config):
        with OracleConnection(integration_config) as conn:
            with pytest.raises(Exception):
                with conn.get_cursor() as cur:
                    cur.execute("SELECT 1/0 FROM DUAL")
