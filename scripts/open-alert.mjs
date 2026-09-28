#!/usr/bin/env node
// Opens a GitHub issue labeled "alert" when a workflow failed (JOB_STATUS
// != success) or wrote warnings to alert.md. One open issue per workflow +
// kind: while it's open, repeats are skipped instead of spamming a comment
// every 15 minutes. Close the issue once fixed (the daily routine does).
import { existsSync, readFileSync } from "node:fs";

const { GITHUB_TOKEN, GITHUB_REPOSITORY, GITHUB_SERVER_URL, GITHUB_RUN_ID, GITHUB_WORKFLOW, JOB_STATUS } = process.env;
const failed = JOB_STATUS && JOB_STATUS !== "success";
const notes = existsSync("alert.md") ? readFileSync("alert.md", "utf8").trim() : "";
const api = (path, init = {}) =>
  fetch(`https://api.github.com/repos/${GITHUB_REPOSITORY}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: "application/vnd.github+json", ...(init.headers ?? {}) },
  });

// A clean run closes this workflow's open "실패" alert (the failure healed,
// e.g. a flaky network call). "경고" alerts stay open until a person closes
// them, because a clean no-op run doesn't prove the warning is resolved.
if (!failed && !notes) {
  const failTitle = `[알림] ${GITHUB_WORKFLOW} 실패`;
  const open = await (await api("/issues?state=open&labels=alert&per_page=100")).json();
  for (const issue of Array.isArray(open) ? open : []) {
    if (issue.title !== failTitle) continue;
    await api(`/issues/${issue.number}/comments`, {
      method: "POST",
      body: JSON.stringify({ body: `다음 실행이 정상으로 끝나서 자동으로 닫습니다: ${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}` }),
    });
    await api(`/issues/${issue.number}`, { method: "PATCH", body: JSON.stringify({ state: "closed" }) });
    console.log(`Closed healed alert #${issue.number}`);
  }
  process.exit(0);
}

const title = `[알림] ${GITHUB_WORKFLOW} ${failed ? "실패" : "경고"}`;
const runUrl = `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`;

await api("/labels", { method: "POST", body: JSON.stringify({ name: "alert", color: "d73a4a" }) }); // 422 if it exists; fine
const open = await (await api("/issues?state=open&labels=alert&per_page=100")).json();
if (Array.isArray(open) && open.some((i) => i.title === title)) {
  console.log(`Alert already open: ${title}`);
  process.exit(0);
}
const body = [
  failed ? `워크플로 **${GITHUB_WORKFLOW}** 가 실패했습니다.` : `워크플로 **${GITHUB_WORKFLOW}** 에서 확인이 필요한 경고가 나왔습니다.`,
  notes && `\n${notes}`,
  `\n실행 로그: ${runUrl}`,
  "\n고친 뒤 이 이슈를 닫으면, 같은 문제가 다시 생길 때 새로 알립니다.",
]
  .filter(Boolean)
  .join("\n");
const res = await api("/issues", { method: "POST", body: JSON.stringify({ title, body, labels: ["alert"] }) });
if (!res.ok) {
  console.error(`could not open alert issue: ${res.status} ${await res.text()}`);
  process.exit(1);
}
console.log(`Opened alert: ${(await res.json()).html_url}`);
