"""
tests/test_config.py
--------------------
Unit tests for MSSQLConnectionConfig and build_connection_string.
No database required.
"""

import pytest
from mssql_dbdriver import MSSQLConnectionConfig, build_connection_string


# ---------------------------------------------------------------------------
# MSSQLConnectionConfig — valid construction
# ---------------------------------------------------------------------------

class TestMSSQLConnectionConfigValid:

    def test_basic_credentials(self):
        config = MSSQLConnectionConfig(
            server="myserver",
            database="mydb",
            username="sa",
            password="secret",
        )
        assert config.server == "myserver"
        assert config.database == "mydb"
        assert config.username == "sa"
        assert config.password == "secret"

    def test_defaults(self):
        config = MSSQLConnectionConfig(
            server="myserver",
            database="mydb",
            username="sa",
            password="secret",
        )
        assert config.odbc_driver == "ODBC Driver 17 for SQL Server"
        assert config.port == 1433
        assert config.trusted_connection is False
        assert config.timeout == 30
        assert config.extra_params == {}

    def test_trusted_connection_no_credentials_required(self):
        config = MSSQLConnectionConfig(
            server="myserver",
            database="mydb",
            trusted_connection=True,
        )
        assert config.trusted_connection is True
        assert config.username is None
        assert config.password is None

    def test_custom_port(self):
        config = MSSQLConnectionConfig(
            server="myserver",
            database="mydb",
            username="sa",
            password="secret",
            port=1434,
        )
        assert config.port == 1434

    def test_custom_timeout(self):
        config = MSSQLConnectionConfig(
            server="myserver",
            database="mydb",
            username="sa",
            password="secret",
            timeout=60,
        )
        assert config.timeout == 60

    def test_custom_odbc_driver(self):
        config = MSSQLConnectionConfig(
            server="myserver",
            database="mydb",
            username="sa",
            password="secret",
            odbc_driver="ODBC Driver 18 for SQL Server",
        )
        assert config.odbc_driver == "ODBC Driver 18 for SQL Server"

    def test_extra_params(self):
        config = MSSQLConnectionConfig(
            server="myserver",
            database="mydb",
            username="sa",
            password="secret",
            extra_params={"Encrypt": "yes"},
        )
        assert config.extra_params == {"Encrypt": "yes"}

    def test_port_boundary_low(self):
        config = MSSQLConnectionConfig(
            server="s", database="d", username="u", password="p", port=1
        )
        assert config.port == 1

    def test_port_boundary_high(self):
        config = MSSQLConnectionConfig(
            server="s", database="d", username="u", password="p", port=65535
        )
        assert config.port == 65535


# ---------------------------------------------------------------------------
# MSSQLConnectionConfig — validation errors
# ---------------------------------------------------------------------------

class TestMSSQLConnectionConfigInvalid:

    def test_missing_username_raises(self):
        with pytest.raises(ValueError, match="username and password are required"):
            MSSQLConnectionConfig(
                server="myserver",
                database="mydb",
                password="secret",
            )

    def test_missing_password_raises(self):
        with pytest.raises(ValueError, match="username and password are required"):
            MSSQLConnectionConfig(
                server="myserver",
                database="mydb",
                username="sa",
            )

    def test_empty_username_raises(self):
        with pytest.raises(ValueError, match="username and password are required"):
            MSSQLConnectionConfig(
                server="myserver",
                database="mydb",
                username="",
                password="secret",
            )

    def test_empty_password_raises(self):
        with pytest.raises(ValueError, match="username and password are required"):
            MSSQLConnectionConfig(
                server="myserver",
                database="mydb",
                username="sa",
                password="",
            )

    def test_port_zero_raises(self):
        with pytest.raises(ValueError, match="port must be between 1 and 65535"):
            MSSQLConnectionConfig(
                server="s", database="d", username="u", password="p", port=0
            )

    def test_port_too_high_raises(self):
        with pytest.raises(ValueError, match="port must be between 1 and 65535"):
            MSSQLConnectionConfig(
                server="s", database="d", username="u", password="p", port=65536
            )

    def test_negative_port_raises(self):
        with pytest.raises(ValueError, match="port must be between 1 and 65535"):
            MSSQLConnectionConfig(
                server="s", database="d", username="u", password="p", port=-1
            )

    def test_zero_timeout_raises(self):
        with pytest.raises(ValueError, match="timeout must be greater than 0"):
            MSSQLConnectionConfig(
                server="s", database="d", username="u", password="p", timeout=0
            )

    def test_negative_timeout_raises(self):
        with pytest.raises(ValueError, match="timeout must be greater than 0"):
            MSSQLConnectionConfig(
                server="s", database="d", username="u", password="p", timeout=-5
            )


# ---------------------------------------------------------------------------
# build_connection_string
# ---------------------------------------------------------------------------

class TestBuildConnectionString:

    def test_credential_auth_format(self):
        config = MSSQLConnectionConfig(
            server="myserver",
            database="mydb",
            username="sa",
            password="secret",
        )
        conn_str = build_connection_string(config)
        assert "DRIVER={ODBC Driver 17 for SQL Server}" in conn_str
        assert "SERVER=myserver,1433" in conn_str
        assert "DATABASE=mydb" in conn_str
        assert "UID=sa" in conn_str
        assert "PWD=secret" in conn_str
        assert "Timeout=30" in conn_str
        assert "Trusted_Connection" not in conn_str

    def test_trusted_connection_format(self):
        config = MSSQLConnectionConfig(
            server="myserver",
            database="mydb",
            trusted_connection=True,
        )
        conn_str = build_connection_string(config)
        assert "Trusted_Connection=yes" in conn_str
        assert "UID" not in conn_str
        assert "PWD" not in conn_str

    def test_custom_port_in_string(self):
        config = MSSQLConnectionConfig(
            server="myserver",
            database="mydb",
            username="sa",
            password="secret",
            port=1434,
        )
        conn_str = build_connection_string(config)
        assert "SERVER=myserver,1434" in conn_str

    def test_custom_driver_in_string(self):
        config = MSSQLConnectionConfig(
            server="myserver",
            database="mydb",
            username="sa",
            password="secret",
            odbc_driver="ODBC Driver 18 for SQL Server",
        )
        conn_str = build_connection_string(config)
        assert "DRIVER={ODBC Driver 18 for SQL Server}" in conn_str

    def test_extra_params_appended(self):
        config = MSSQLConnectionConfig(
            server="myserver",
            database="mydb",
            username="sa",
            password="secret",
            extra_params={"Encrypt": "yes", "TrustServerCertificate": "no"},
        )
        conn_str = build_connection_string(config)
        assert "Encrypt=yes" in conn_str
        assert "TrustServerCertificate=no" in conn_str

    def test_semicolon_separated(self):
        config = MSSQLConnectionConfig(
            server="s", database="d", username="u", password="p"
        )
        conn_str = build_connection_string(config)
        parts = conn_str.split(";")
        assert len(parts) >= 5
        assert all("=" in part for part in parts)

    def test_custom_timeout_in_string(self):
        config = MSSQLConnectionConfig(
            server="s", database="d", username="u", password="p", timeout=60
        )
        conn_str = build_connection_string(config)
        assert "Timeout=60" in conn_str
