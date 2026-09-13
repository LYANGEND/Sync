param(
  [string]$Repo = "",
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

function Invoke-Gh {
  param(
    [string[]]$Args,
    [switch]$ReturnJson
  )

  $display = "gh " + ($Args -join " ")
  if ($DryRun) {
    Write-Host "[dry-run] $display"
    if ($ReturnJson) { return $null }
    return ""
  }

  $output = & gh @Args 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed: $display`n$output"
  }

  if ($ReturnJson) {
    if ([string]::IsNullOrWhiteSpace(($output | Out-String))) {
      return $null
    }
    return (($output | Out-String) | ConvertFrom-Json)
  }

  return ($output | Out-String)
}

function Ensure-GhCli {
  if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    throw "GitHub CLI (gh) is required. Install from https://cli.github.com/"
  }
}

function Resolve-Repo {
  param([string]$RepoInput)

  if (-not [string]::IsNullOrWhiteSpace($RepoInput)) {
    return $RepoInput
  }

  if ($DryRun) {
    return "<owner/repo>"
  }

  $resolved = Invoke-Gh -Args @("repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner")
  return $resolved.Trim()
}

function Ensure-Label {
  param(
    [string]$RepoName,
    [string]$Name,
    [string]$Color,
    [string]$Description
  )

  if ($DryRun) {
    Write-Host "[dry-run] ensure label: $Name"
    return
  }

  try {
    Invoke-Gh -Args @("label", "create", $Name, "--color", $Color, "--description", $Description, "--repo", $RepoName) | Out-Null
    Write-Host "Created label: $Name"
  } catch {
    Invoke-Gh -Args @("label", "edit", $Name, "--color", $Color, "--description", $Description, "--repo", $RepoName) | Out-Null
    Write-Host "Updated label: $Name"
  }
}

function Get-MilestoneMap {
  param([string]$RepoName)

  $map = @{}
  if ($DryRun) {
    return $map
  }

  $milestones = Invoke-Gh -Args @("api", "repos/$RepoName/milestones?state=all&per_page=100") -ReturnJson
  if ($milestones) {
    foreach ($m in $milestones) {
      $map[$m.title] = [int]$m.number
    }
  }

  return $map
}

function Ensure-Milestone {
  param(
    [string]$RepoName,
    [hashtable]$MilestoneMap,
    [string]$Title,
    [string]$Description
  )

  if ($MilestoneMap.ContainsKey($Title)) {
    Write-Host "Milestone exists: $Title"
    return
  }

  if ($DryRun) {
    Write-Host "[dry-run] create milestone: $Title"
    return
  }

  $created = Invoke-Gh -Args @(
    "api", "repos/$RepoName/milestones",
    "--method", "POST",
    "-f", "title=$Title",
    "-f", "description=$Description"
  ) -ReturnJson

  $MilestoneMap[$Title] = [int]$created.number
  Write-Host "Created milestone: $Title"
}

function Test-IssueExists {
  param(
    [string]$RepoName,
    [string]$TaskId
  )

  if ($DryRun) {
    return $false
  }

  $query = "[$TaskId] in:title"
  $result = Invoke-Gh -Args @(
    "issue", "list",
    "--repo", $RepoName,
    "--state", "all",
    "--search", $query,
    "--limit", "1",
    "--json", "number,title"
  ) -ReturnJson

  return ($result -and $result.Count -gt 0)
}

function New-IssueBody {
  param(
    [pscustomobject]$Task
  )

  $deps = if ([string]::IsNullOrWhiteSpace($Task.Dependencies)) { "none" } else { $Task.Dependencies }

  return @"
## Traceability
- Task ID: $($Task.Id)
- Workstream: $($Task.Workstream)
- Finding IDs: $($Task.Findings)
- Test IDs: $($Task.Tests)
- Milestone: $($Task.Milestone)
- Dependencies: $deps

## Problem Statement
Address finding(s) $($Task.Findings) by implementing task $($Task.Id).

## Implementation Plan
1. Implement code and schema changes required for this task.
2. Add or update automated tests mapped to listed Test IDs.
3. Validate behavior under expected load and tenant isolation constraints.
4. Update docs/changelog with trace tags.

## Acceptance Criteria
- [ ] Code changes implemented
- [ ] Automated tests added or updated
- [ ] Test IDs validated and passing
- [ ] Trace tags included in PR (finding/task/test)
- [ ] Rollback notes documented

## References
- Plan: docs/backend-remediation-traceable-plan.md
- Board: docs/backend-remediation-task-board.md
"@
}

Ensure-GhCli
$repoName = Resolve-Repo -RepoInput $Repo
Write-Host "Using repository: $repoName"

$labels = @(
  @{ Name = "remediation"; Color = "B60205"; Description = "Remediation work item" },
  @{ Name = "backend"; Color = "1D76DB"; Description = "Backend scope" },
  @{ Name = "ws-1-correctness"; Color = "0E8A16"; Description = "WS-1 Correctness and bug fixes" },
  @{ Name = "ws-2-performance"; Color = "FBCA04"; Description = "WS-2 Performance" },
  @{ Name = "ws-3-queue"; Color = "5319E7"; Description = "WS-3 Queue and async reliability" },
  @{ Name = "ws-4-isolation"; Color = "D93F0B"; Description = "WS-4 Tenant isolation hardening" },
  @{ Name = "priority-p0"; Color = "B60205"; Description = "Highest priority" },
  @{ Name = "priority-p1"; Color = "FBCA04"; Description = "High priority" },
  @{ Name = "priority-p2"; Color = "0E8A16"; Description = "Medium priority" },
  @{ Name = "milestone-m1"; Color = "0052CC"; Description = "Milestone M-1" },
  @{ Name = "milestone-m2"; Color = "0052CC"; Description = "Milestone M-2" },
  @{ Name = "milestone-m3"; Color = "0052CC"; Description = "Milestone M-3" },
  @{ Name = "milestone-m4"; Color = "0052CC"; Description = "Milestone M-4" },
  @{ Name = "milestone-m5"; Color = "0052CC"; Description = "Milestone M-5" }
)

$milestones = @(
  @{ Title = "M-1 WS-1 Correctness"; Description = "Bug fixes and correctness hardening" },
  @{ Title = "M-2 WS-2 Performance Core"; Description = "Core query and endpoint performance fixes" },
  @{ Title = "M-3 WS-3 Queue Reliability"; Description = "Queue foundation and async reliability" },
  @{ Title = "M-4 WS-4 Isolation Hardening"; Description = "Tenant isolation and storage hardening" },
  @{ Title = "M-5 Advanced Performance and AI Snapshot Optimization"; Description = "Advanced performance and AI snapshot optimizations" }
)

$tasks = @(
  [pscustomobject]@{ Id="T-001"; Title="Add unique constraint for class identity per tenant and term"; Workstream="WS-1 Correctness and Bug Fixes"; Findings="F-001"; Tests="TV-001, TV-002"; Milestone="M-1 WS-1 Correctness"; Dependencies=""; Priority="priority-p0"; WsLabel="ws-1-correctness"; MilestoneLabel="milestone-m1" },
  [pscustomobject]@{ Id="T-002"; Title="Refactor bulk import class resolution to idempotent upsert or serialized creation"; Workstream="WS-1 Correctness and Bug Fixes"; Findings="F-001"; Tests="TV-003, TV-004"; Milestone="M-1 WS-1 Correctness"; Dependencies="T-001"; Priority="priority-p0"; WsLabel="ws-1-correctness"; MilestoneLabel="milestone-m1" },
  [pscustomobject]@{ Id="T-003"; Title="Replace invalid ADMIN role usage in tenant routes with valid enum role(s)"; Workstream="WS-1 Correctness and Bug Fixes"; Findings="F-011"; Tests="TV-005"; Milestone="M-1 WS-1 Correctness"; Dependencies=""; Priority="priority-p1"; WsLabel="ws-1-correctness"; MilestoneLabel="milestone-m1" },
  [pscustomobject]@{ Id="T-004"; Title="Add auth policy tests for tenant custom field routes"; Workstream="WS-1 Correctness and Bug Fixes"; Findings="F-011"; Tests="TV-006"; Milestone="M-1 WS-1 Correctness"; Dependencies="T-003"; Priority="priority-p1"; WsLabel="ws-1-correctness"; MilestoneLabel="milestone-m1" },

  [pscustomobject]@{ Id="T-005"; Title="Replace conversation unread N+1 with grouped query"; Workstream="WS-2 Query and Endpoint Performance"; Findings="F-002"; Tests="TV-007, TV-008"; Milestone="M-2 WS-2 Performance Core"; Dependencies=""; Priority="priority-p0"; WsLabel="ws-2-performance"; MilestoneLabel="milestone-m2" },
  [pscustomobject]@{ Id="T-006"; Title="Validate or add index coverage for unread count lookup path"; Workstream="WS-2 Query and Endpoint Performance"; Findings="F-002"; Tests="TV-009"; Milestone="M-2 WS-2 Performance Core"; Dependencies="T-005"; Priority="priority-p1"; WsLabel="ws-2-performance"; MilestoneLabel="milestone-m2" },
  [pscustomobject]@{ Id="T-007"; Title="Batch pending-assessment lookup in parent dashboard flow"; Workstream="WS-2 Query and Endpoint Performance"; Findings="F-003"; Tests="TV-010, TV-011"; Milestone="M-2 WS-2 Performance Core"; Dependencies=""; Priority="priority-p0"; WsLabel="ws-2-performance"; MilestoneLabel="milestone-m2" },
  [pscustomobject]@{ Id="T-008"; Title="Add pagination and bounded limits to reconciliation endpoint"; Workstream="WS-2 Query and Endpoint Performance"; Findings="F-004"; Tests="TV-012, TV-013"; Milestone="M-2 WS-2 Performance Core"; Dependencies=""; Priority="priority-p0"; WsLabel="ws-2-performance"; MilestoneLabel="milestone-m2" },
  [pscustomobject]@{ Id="T-009"; Title="Shift heavy financial report calculations to DB-side aggregations or materialization"; Workstream="WS-2 Query and Endpoint Performance"; Findings="F-004"; Tests="TV-014"; Milestone="M-5 Advanced Performance and AI Snapshot Optimization"; Dependencies="T-008"; Priority="priority-p1"; WsLabel="ws-2-performance"; MilestoneLabel="milestone-m5" },
  [pscustomobject]@{ Id="T-010"; Title="Introduce per-tenant branch-scoped snapshot cache for AI financial advisor"; Workstream="WS-2 Query and Endpoint Performance"; Findings="F-005"; Tests="TV-015, TV-016"; Milestone="M-5 Advanced Performance and AI Snapshot Optimization"; Dependencies=""; Priority="priority-p0"; WsLabel="ws-2-performance"; MilestoneLabel="milestone-m5" },
  [pscustomobject]@{ Id="T-011"; Title="Add event-driven invalidation for AI snapshot cache"; Workstream="WS-2 Query and Endpoint Performance"; Findings="F-005"; Tests="TV-017"; Milestone="M-5 Advanced Performance and AI Snapshot Optimization"; Dependencies="T-010"; Priority="priority-p1"; WsLabel="ws-2-performance"; MilestoneLabel="milestone-m5" },
  [pscustomobject]@{ Id="T-012"; Title="Optimize SMS rate-limit checks using cached counters"; Workstream="WS-2 Query and Endpoint Performance"; Findings="F-007"; Tests="TV-018"; Milestone="M-5 Advanced Performance and AI Snapshot Optimization"; Dependencies="T-013"; Priority="priority-p1"; WsLabel="ws-2-performance"; MilestoneLabel="milestone-m5" },

  [pscustomobject]@{ Id="T-013"; Title="Introduce BullMQ and Redis queue foundation with tenant-aware payload schema"; Workstream="WS-3 Queue and Async Reliability"; Findings="F-005, F-006, F-007"; Tests="TV-019"; Milestone="M-3 WS-3 Queue Reliability"; Dependencies=""; Priority="priority-p0"; WsLabel="ws-3-queue"; MilestoneLabel="milestone-m3" },
  [pscustomobject]@{ Id="T-014"; Title="Add announcement channel job types for fan-out"; Workstream="WS-3 Queue and Async Reliability"; Findings="F-006"; Tests="TV-020, TV-021"; Milestone="M-3 WS-3 Queue Reliability"; Dependencies="T-013"; Priority="priority-p0"; WsLabel="ws-3-queue"; MilestoneLabel="milestone-m3" },
  [pscustomobject]@{ Id="T-015"; Title="Queue payment notification side effects"; Workstream="WS-3 Queue and Async Reliability"; Findings="F-006"; Tests="TV-022"; Milestone="M-3 WS-3 Queue Reliability"; Dependencies="T-013"; Priority="priority-p0"; WsLabel="ws-3-queue"; MilestoneLabel="milestone-m3" },
  [pscustomobject]@{ Id="T-016"; Title="Queue scheduled announcement dispatcher"; Workstream="WS-3 Queue and Async Reliability"; Findings="F-006"; Tests="TV-023"; Milestone="M-3 WS-3 Queue Reliability"; Dependencies="T-013"; Priority="priority-p1"; WsLabel="ws-3-queue"; MilestoneLabel="milestone-m3" },
  [pscustomobject]@{ Id="T-017"; Title="Add retry, backoff, dead-letter, and idempotency keys"; Workstream="WS-3 Queue and Async Reliability"; Findings="F-006"; Tests="TV-024, TV-025"; Milestone="M-3 WS-3 Queue Reliability"; Dependencies="T-014"; Priority="priority-p0"; WsLabel="ws-3-queue"; MilestoneLabel="milestone-m3" },
  [pscustomobject]@{ Id="T-018"; Title="Add worker concurrency controls and provider rate limits"; Workstream="WS-3 Queue and Async Reliability"; Findings="F-006, F-007"; Tests="TV-026"; Milestone="M-3 WS-3 Queue Reliability"; Dependencies="T-014"; Priority="priority-p1"; WsLabel="ws-3-queue"; MilestoneLabel="milestone-m3" },
  [pscustomobject]@{ Id="T-019"; Title="Add queue metrics dashboard and alerts"; Workstream="WS-3 Queue and Async Reliability"; Findings="F-006"; Tests="TV-027"; Milestone="M-3 WS-3 Queue Reliability"; Dependencies="T-013"; Priority="priority-p1"; WsLabel="ws-3-queue"; MilestoneLabel="milestone-m3" },

  [pscustomobject]@{ Id="T-020"; Title="Replace direct static uploads serving with authenticated or signed URL access"; Workstream="WS-4 Tenant Isolation Hardening"; Findings="F-009"; Tests="TV-028"; Milestone="M-4 WS-4 Isolation Hardening"; Dependencies=""; Priority="priority-p0"; WsLabel="ws-4-isolation"; MilestoneLabel="milestone-m4" },
  [pscustomobject]@{ Id="T-021"; Title="Enforce tenant-prefixed storage keys and ownership checks"; Workstream="WS-4 Tenant Isolation Hardening"; Findings="F-009"; Tests="TV-029"; Milestone="M-4 WS-4 Isolation Hardening"; Dependencies="T-020"; Priority="priority-p0"; WsLabel="ws-4-isolation"; MilestoneLabel="milestone-m4" },
  [pscustomobject]@{ Id="T-022"; Title="Redesign push subscription uniqueness and reassignment policy"; Workstream="WS-4 Tenant Isolation Hardening"; Findings="F-010"; Tests="TV-030"; Milestone="M-4 WS-4 Isolation Hardening"; Dependencies=""; Priority="priority-p1"; WsLabel="ws-4-isolation"; MilestoneLabel="milestone-m4" },
  [pscustomobject]@{ Id="T-023"; Title="Replace in-memory API limiter with Redis distributed limiter"; Workstream="WS-4 Tenant Isolation Hardening"; Findings="F-008"; Tests="TV-019 extension"; Milestone="M-4 WS-4 Isolation Hardening"; Dependencies="T-013"; Priority="priority-p1"; WsLabel="ws-4-isolation"; MilestoneLabel="milestone-m4" }
)

Write-Host "Ensuring labels..."
foreach ($label in $labels) {
  Ensure-Label -RepoName $repoName -Name $label.Name -Color $label.Color -Description $label.Description
}

Write-Host "Ensuring milestones..."
$milestoneMap = Get-MilestoneMap -RepoName $repoName
foreach ($m in $milestones) {
  Ensure-Milestone -RepoName $repoName -MilestoneMap $milestoneMap -Title $m.Title -Description $m.Description
}

Write-Host "Ensuring issues..."
foreach ($task in $tasks) {
  if (Test-IssueExists -RepoName $repoName -TaskId $task.Id) {
    Write-Host "Issue already exists for $($task.Id), skipping"
    continue
  }

  $title = "[$($task.Id)] $($task.Title)"
  $body = New-IssueBody -Task $task

  $labelsForIssue = @(
    "remediation",
    "backend",
    $task.WsLabel,
    $task.Priority,
    $task.MilestoneLabel
  )

  $args = @(
    "issue", "create",
    "--repo", $repoName,
    "--title", $title,
    "--body", $body,
    "--milestone", $task.Milestone
  )

  foreach ($l in $labelsForIssue) {
    $args += @("--label", $l)
  }

  if ($DryRun) {
    Write-Host "[dry-run] create issue: $title"
    continue
  }

  Invoke-Gh -Args $args | Out-Null
  Write-Host "Created issue: $title"
}

Write-Host "Completed."
if ($DryRun) {
  Write-Host "Dry-run mode only. Re-run without -DryRun to apply changes."
}
