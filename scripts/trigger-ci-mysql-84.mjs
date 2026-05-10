#!/usr/bin/env node
// Usage: set GITHUB_TOKEN in env to query/dispatch workflow
const token = process.env.GITHUB_TOKEN;
const owner = 'zarjun247';
const repo = '247-customer-app';
if (!token) {
  console.error('GITHUB_TOKEN not set. Cannot trigger or inspect CI.');
  process.exit(2);
}

(async function(){
  const headers = { Authorization: `token ${token}`, Accept: 'application/vnd.github+json' };
  // List workflows
  const wfRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/workflows`, { headers });
  const wfJson = await wfRes.json();
  const mysqlWorkflows = (wfJson.workflows || []).filter(w => /mysql/i.test(w.name) || /mysql/i.test(w.path));
  if (mysqlWorkflows.length === 0) {
    console.log('No mysql workflows found. Workflows:', (wfJson.workflows || []).map(w=>w.name).join(', '));
    return;
  }
  // pick first
  const wf = mysqlWorkflows[0];
  console.log('Found workflow:', wf.name, wf.path);
  // Trigger a dispatch
  const dispatchRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/workflows/${wf.id}/dispatches`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ ref: 'main', inputs: { trigger: 'mysql-8.4-concurrency' } }) });
  if (dispatchRes.status === 204) {
    console.log('Workflow dispatched successfully. Check Actions ->', wf.name);
  } else {
    const body = await dispatchRes.text();
    console.error('Dispatch failed:', dispatchRes.status, body);
  }
})();
