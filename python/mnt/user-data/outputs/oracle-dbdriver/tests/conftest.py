"""
tests/conftest.py
-----------------
Shared fixtures and configuration for the Oracle dbdriver test suite.

Integration tests require a real Oracle database.
They are skipped by default and must be enabled explicitly:

    pytest --run-integration

In CI, credentials are loaded from GitHub Actions secrets.
Locally, credentials are loaded from .env.test at the repo root.
"""

import os
import pytest
from dotenv import load_dotenv

load_dotenv(".env.test")


def pytest_addoption(parser):
    parser.addoption(
        "--run-integration",
        action="store_true",
        default=False,
        help="Run integration tests against a real Oracle database.",
    )


def pytest_configure(config):
    config.addinivalue_line(
        "markers",
        "integration: marks tests that require a real Oracle database.",
    )


def pytest_collection_modifyitems(config, items):
    if not config.getoption("--run-integration"):
        skip = pytest.mark.skip(
            reason="Integration test — requires Oracle DB credentials. "
                   "Run with --run-integration to enable."
        )
        for item in items:
            if "integration" in item.keywords:
                item.add_marker(skip)


@pytest.fixture(scope="session")
def integration_config():
    """
    Returns an OracleConnectionConfig for integration tests.
    Loaded from .env.test locally or GitHub Actions secrets in CI.
    """
    from oracle_dbdriver import OracleConnectionConfig
    return OracleConnectionConfig(
        host=os.environ["TEST_ORACLE_HOST"],
        service_name=os.environ["TEST_ORACLE_SERVICE"],
        username=os.environ["TEST_ORACLE_USER"],
        password=os.environ["TEST_ORACLE_PASSWORD"],
        port=int(os.environ.get("TEST_ORACLE_PORT", "1521")),
    )
