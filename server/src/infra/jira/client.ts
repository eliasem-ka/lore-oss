export interface JiraClient {
  isConfigured(): boolean;
  createIssue(i: { summary: string; description: string; labels: string[] }): Promise<{ key: string; url: string }>;
  addComment(issueKey: string, body: string): Promise<void>;
}

// Atlassian Document Format — minimal single-paragraph doc (v3 requires ADF, not plain text).
export function toADF(text: string): object {
  return { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text: text || " " }] }] };
}

export function createJiraClient(env: NodeJS.ProcessEnv = process.env): JiraClient {
  const baseUrl = (env.JIRA_BASE_URL ?? "").replace(/\/$/, "");
  const email = env.JIRA_EMAIL ?? "";
  const token = env.JIRA_API_TOKEN ?? "";
  const projectKey = env.JIRA_PROJECT_KEY ?? "";
  const issueType = env.JIRA_ISSUE_TYPE ?? "Task";
  const timeoutMs = Number(env.JIRA_TIMEOUT_MS ?? 10000);
  const auth = "Basic " + Buffer.from(`${email}:${token}`).toString("base64");

  async function call(path: string, body: unknown): Promise<Response> {
    const res = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { authorization: auth, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      const snippet = (await res.text().catch(() => "")).slice(0, 300);
      throw new Error(`Jira ${path} ${res.status}: ${snippet}`);
    }
    return res;
  }

  return {
    isConfigured() {
      return Boolean(baseUrl && email && token && projectKey);
    },
    async createIssue({ summary, description, labels }) {
      const res = await call("/rest/api/3/issue", {
        fields: { project: { key: projectKey }, issuetype: { name: issueType }, summary, description: toADF(description), labels },
      });
      const data = (await res.json()) as { key: string };
      if (!data.key) throw new Error("Jira create-issue response missing key");
      return { key: data.key, url: `${baseUrl}/browse/${data.key}` };
    },
    async addComment(issueKey, body) {
      await call(`/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment`, { body: toADF(body) });
    },
  };
}
