"""
tests/test_config.py
--------------------
Unit tests for OracleConnectionConfig.
No database required.
"""

import pytest
from oracle_dbdriver import OracleConnectionConfig


# ---------------------------------------------------------------------------
# OracleConnectionConfig — valid construction
# ---------------------------------------------------------------------------

class TestOracleConnectionConfigValid:

    def test_basic_construction(self):
        config = OracleConnectionConfig(
            host="myhost",
            service_name="MYSERVICE",
            username="myuser",
            password="secret",
        )
        assert config.host == "myhost"
        assert config.service_name == "MYSERVICE"
        assert config.username == "myuser"
        assert config.password == "secret"

    def test_defaults(self):
        config = OracleConnectionConfig(
            host="myhost",
            service_name="MYSERVICE",
            username="myuser",
            password="secret",
        )
        assert config.port == 1521
        assert config.thick_mode is False
        assert config.timeout == 30
        assert config.extra_params == {}

    def test_custom_port(self):
        config = OracleConnectionConfig(
            host="h", service_name="s", username="u", password="p", port=1522
        )
        assert config.port == 1522

    def test_custom_timeout(self):
        config = OracleConnectionConfig(
            host="h", service_name="s", username="u", password="p", timeout=60
        )
        assert config.timeout == 60

    def test_thick_mode(self):
        config = OracleConnectionConfig(
            host="h", service_name="s", username="u", password="p", thick_mode=True
        )
        assert config.thick_mode is True

    def test_extra_params(self):
        config = OracleConnectionConfig(
            host="h", service_name="s", username="u", password="p",
            extra_params={"encoding": "UTF-8"},
        )
        assert config.extra_params == {"encoding": "UTF-8"}

    def test_dsn_format(self):
        config = OracleConnectionConfig(
            host="myhost", service_name="MYSERVICE", username="u", password="p"
        )
        assert config.dsn == "myhost:1521/MYSERVICE"

    def test_dsn_custom_port(self):
        config = OracleConnectionConfig(
            host="myhost", service_name="MYSERVICE",
            username="u", password="p", port=1522
        )
        assert config.dsn == "myhost:1522/MYSERVICE"

    def test_port_boundary_low(self):
        config = OracleConnectionConfig(
            host="h", service_name="s", username="u", password="p", port=1
        )
        assert config.port == 1

    def test_port_boundary_high(self):
        config = OracleConnectionConfig(
            host="h", service_name="s", username="u", password="p", port=65535
        )
        assert config.port == 65535


# ---------------------------------------------------------------------------
# OracleConnectionConfig — validation errors
# ---------------------------------------------------------------------------

class TestOracleConnectionConfigInvalid:

    def test_missing_username_raises(self):
        with pytest.raises(ValueError, match="username and password are required"):
            OracleConnectionConfig(
                host="h", service_name="s", username="", password="p"
            )

    def test_missing_password_raises(self):
        with pytest.raises(ValueError, match="username and password are required"):
            OracleConnectionConfig(
                host="h", service_name="s", username="u", password=""
            )

    def test_port_zero_raises(self):
        with pytest.raises(ValueError, match="port must be between 1 and 65535"):
            OracleConnectionConfig(
                host="h", service_name="s", username="u", password="p", port=0
            )

    def test_port_too_high_raises(self):
        with pytest.raises(ValueError, match="port must be between 1 and 65535"):
            OracleConnectionConfig(
                host="h", service_name="s", username="u", password="p", port=65536
            )

    def test_negative_port_raises(self):
        with pytest.raises(ValueError, match="port must be between 1 and 65535"):
            OracleConnectionConfig(
                host="h", service_name="s", username="u", password="p", port=-1
            )

    def test_zero_timeout_raises(self):
        with pytest.raises(ValueError, match="timeout must be greater than 0"):
            OracleConnectionConfig(
                host="h", service_name="s", username="u", password="p", timeout=0
            )

    def test_negative_timeout_raises(self):
        with pytest.raises(ValueError, match="timeout must be greater than 0"):
            OracleConnectionConfig(
                host="h", service_name="s", username="u", password="p", timeout=-1
            )
