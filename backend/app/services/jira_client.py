import json
import logging
import time
from typing import Any

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)


class JiraClientError(Exception):
    def __init__(self, status_code: int, message: str):
        super().__init__(message)
        self.status_code = status_code


class JiraClient:
    def __init__(self):
        settings = get_settings()
        if not settings.jira_base_url or not settings.jira_email or not settings.jira_api_token:
            raise JiraClientError(400, "Credenciais do Jira não configuradas")
        self.base_url = str(settings.jira_base_url).rstrip("/")
        self.auth = (settings.jira_email, settings.jira_api_token)
        self.timeout = 20

    def _request(self, method: str, path: str, **kwargs: Any) -> dict[str, Any] | list[Any]:
        retries = 3
        backoff = 1
        url = f"{self.base_url}{path}"
        for attempt in range(retries):
            with httpx.Client(timeout=self.timeout) as client:
                response = client.request(method, url, auth=self.auth, **kwargs)
            logger.info(
                "jira_request method=%s path=%s status=%s attempt=%s",
                method,
                path,
                response.status_code,
                attempt + 1,
            )
            if response.status_code in (429, 500, 502, 503, 504):
                time.sleep(backoff)
                backoff *= 2
                continue
            if response.status_code >= 400:
                raise JiraClientError(response.status_code, _extract_jira_message(response.text))
            if response.text:
                return response.json()
            return {}
        raise JiraClientError(429, "Jira rate limit or transient error")

    def search_issues(
        self,
        jql: str,
        fields: list[str],
        max_results: int = 50,
        next_page_token: str | None = None,
    ):
        payload: dict[str, Any] = {
            "jql": jql,
            "maxResults": max_results,
            "fields": fields,
        }
        if next_page_token:
            payload["nextPageToken"] = next_page_token
        return self._request("POST", "/rest/api/3/search/jql", json=payload)

    def approximate_count(self, jql: str):
        payload = {"jql": jql}
        return self._request("POST", "/rest/api/3/search/approximate-count", json=payload)

    def myself(self):
        return self._request("GET", "/rest/api/3/myself")

    def create_issue(self, payload: dict[str, Any]):
        return self._request("POST", "/rest/api/3/issue", json=payload)

    def add_comment(self, issue_key: str, body: str):
        payload = {"body": body}
        return self._request("POST", f"/rest/api/3/issue/{issue_key}/comment", json=payload)

    def get_transitions(self, issue_key: str):
        return self._request("GET", f"/rest/api/3/issue/{issue_key}/transitions")

    def transition_issue(self, issue_key: str, transition_id: str):
        payload = {"transition": {"id": transition_id}}
        return self._request("POST", f"/rest/api/3/issue/{issue_key}/transitions", json=payload)

    def assign_issue(self, issue_key: str, account_id: str):
        payload = {"accountId": account_id}
        return self._request("PUT", f"/rest/api/3/issue/{issue_key}/assignee", json=payload)

    def user_search(self, query: str):
        params = {"query": query}
        return self._request("GET", "/rest/api/3/user/search", params=params)


def _extract_jira_message(raw: str) -> str:
    text = (raw or "").strip()
    if not text:
        return "Erro de integracao com Jira."
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        return text
    if isinstance(parsed, dict):
        error_messages = parsed.get("errorMessages") or []
        if error_messages:
            return " | ".join(str(item) for item in error_messages)
        errors = parsed.get("errors") or {}
        if isinstance(errors, dict) and errors:
            return " | ".join(f"{k}: {v}" for k, v in errors.items())
    return text
