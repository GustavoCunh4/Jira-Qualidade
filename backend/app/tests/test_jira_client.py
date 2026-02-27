import os

import respx

from app.core.config import get_settings
from app.services.jira_client import JiraClient, JiraClientError


def _set_env():
    os.environ["JIRA_BASE_URL"] = "https://example.atlassian.net"
    os.environ["JIRA_EMAIL"] = "test@example.com"
    os.environ["JIRA_API_TOKEN"] = "token"
    get_settings.cache_clear()


def test_search_issues_success(monkeypatch):
    _set_env()
    with respx.mock(base_url="https://example.atlassian.net") as respx_mock:
        respx_mock.post("/rest/api/3/search/jql").respond(
            200, json={"issues": [], "isLast": True, "nextPageToken": None}
        )
        client = JiraClient()
        data = client.search_issues("project = TEST", fields=["summary"])
        assert data["issues"] == []


def test_unauthorized(monkeypatch):
    _set_env()
    with respx.mock(base_url="https://example.atlassian.net") as respx_mock:
        respx_mock.post("/rest/api/3/search/jql").respond(401, text="Unauthorized")
        client = JiraClient()
        try:
            client.search_issues("project = TEST", fields=["summary"])
        except JiraClientError as exc:
            assert exc.status_code == 401
        else:
            raise AssertionError("Expected JiraClientError")
