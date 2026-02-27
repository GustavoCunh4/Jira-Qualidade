const GLOBAL_SYNC_EVENT = "jqcc:global-sync-done";
const ISSUES_SEARCH_EVENT = "jqcc:issues-search";

export function dispatchGlobalSyncDone() {
  window.dispatchEvent(new CustomEvent(GLOBAL_SYNC_EVENT));
}

export function onGlobalSyncDone(handler: () => void) {
  window.addEventListener(GLOBAL_SYNC_EVENT, handler);
  return () => window.removeEventListener(GLOBAL_SYNC_EVENT, handler);
}

export function dispatchIssuesSearch(query: string) {
  window.dispatchEvent(new CustomEvent(ISSUES_SEARCH_EVENT, { detail: { query } }));
}

export function onIssuesSearch(handler: (query: string) => void) {
  const wrapped = (event: Event) => {
    const custom = event as CustomEvent<{ query?: string }>;
    handler(custom.detail?.query || "");
  };
  window.addEventListener(ISSUES_SEARCH_EVENT, wrapped);
  return () => window.removeEventListener(ISSUES_SEARCH_EVENT, wrapped);
}
