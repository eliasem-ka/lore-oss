import { describe, it, expect } from "vitest";
import { toADF, createJiraClient } from "./client.js";

describe("jira/client", () => {
  describe("toADF", () => {
    it("converts text to ADF paragraph structure", () => {
      const result = toADF("hello world");
      expect(result).toEqual({
        type: "doc",
        version: 1,
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "hello world",
              },
            ],
          },
        ],
      });
    });

    it("uses single space for empty text", () => {
      const result = toADF("");
      expect(result).toEqual({
        type: "doc",
        version: 1,
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: " ",
              },
            ],
          },
        ],
      });
    });
  });

  describe("createJiraClient", () => {
    it("isConfigured returns false with empty env", () => {
      const client = createJiraClient({});
      expect(client.isConfigured()).toBe(false);
    });

    it("isConfigured returns true when all required env vars are set", () => {
      const client = createJiraClient({
        JIRA_BASE_URL: "https://x.atlassian.net",
        JIRA_EMAIL: "a@b.c",
        JIRA_API_TOKEN: "t",
        JIRA_PROJECT_KEY: "DOC",
      });
      expect(client.isConfigured()).toBe(true);
    });

    it("isConfigured returns false when base URL is missing", () => {
      const client = createJiraClient({
        JIRA_EMAIL: "a@b.c",
        JIRA_API_TOKEN: "t",
        JIRA_PROJECT_KEY: "DOC",
      });
      expect(client.isConfigured()).toBe(false);
    });

    it("isConfigured returns false when email is missing", () => {
      const client = createJiraClient({
        JIRA_BASE_URL: "https://x.atlassian.net",
        JIRA_API_TOKEN: "t",
        JIRA_PROJECT_KEY: "DOC",
      });
      expect(client.isConfigured()).toBe(false);
    });

    it("isConfigured returns false when token is missing", () => {
      const client = createJiraClient({
        JIRA_BASE_URL: "https://x.atlassian.net",
        JIRA_EMAIL: "a@b.c",
        JIRA_PROJECT_KEY: "DOC",
      });
      expect(client.isConfigured()).toBe(false);
    });

    it("isConfigured returns false when project key is missing", () => {
      const client = createJiraClient({
        JIRA_BASE_URL: "https://x.atlassian.net",
        JIRA_EMAIL: "a@b.c",
        JIRA_API_TOKEN: "t",
      });
      expect(client.isConfigured()).toBe(false);
    });
  });
});
