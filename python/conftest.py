"""
tests/conftest.py
-----------------
Shared fixtures and configuration for the MSSQL dbdriver test suite.

Integration tests require Windows Auth and a local test database.
They are skipped by default and must be enabled explicitly:

    pytest --run-integration

Credentials are loaded from .env.test at the repo root.
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
        help="Run integration tests against a real MSSQL database (Windows Auth, local only).",
    )


def pytest_configure(config):
    config.addinivalue_line(
        "markers",
        "integration: marks tests that require a real MSSQL database (Windows Auth).",
    )


def pytest_collection_modifyitems(config, items):
    if not config.getoption("--run-integration"):
        skip = pytest.mark.skip(
            reason="Integration test — requires Windows Auth and local DB. "
                   "Run with --run-integration to enable."
        )
        for item in items:
            if "integration" in item.keywords:
                item.add_marker(skip)


@pytest.fixture(scope="session")
def integration_config():
    """
    Returns an MSSQLConnectionConfig for integration tests.
    Loaded from .env.test — uses Windows Auth (no username/password).
    """
    from mssql_dbdriver import MSSQLConnectionConfig
    return MSSQLConnectionConfig(
        server=os.environ["TEST_MSSQL_SERVER"],
        database=os.environ["TEST_MSSQL_DATABASE"],
        trusted_connection=True,
    )
