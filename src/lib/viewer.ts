const VIEWER_KEY = "gamesidev-viewer";

export function getViewerKey() {
  try {
    let key = localStorage.getItem(VIEWER_KEY);
    if (!key) {
      key = crypto.randomUUID();
      localStorage.setItem(VIEWER_KEY, key);
    }
    return key;
  } catch {
    return crypto.randomUUID();
  }
}
