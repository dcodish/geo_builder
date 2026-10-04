<#
.SYNOPSIS
  Start every server a play sheet names, on THIS machine: the batch on `main` plus one worktree per PR.

.DESCRIPTION
  Reads scripts/playsheets/<Sheet>.servers.json - { "main": 5173, "prs": [ { "port": 5174, "branch": "feat/..." }, ... ] } -
  pulls main, makes (or refreshes) a detached worktree per PR branch under C:\projects\geo-pr\<port>, runs `npm install`
  inside each (never a linked node_modules - docs/22 sec.7), opens one window per server, and waits until every port answers.
  Works the same on either PC: everything it needs comes from GitHub.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\play-servers.ps1 -Sheet round-1736
  powershell -ExecutionPolicy Bypass -File scripts\play-servers.ps1 -Sheet round-1736 -Cleanup
#>
param(
  [Parameter(Mandatory = $true)][string]$Sheet,
  [string]$WorktreeRoot = 'C:\projects\geo-pr',
  [switch]$Cleanup
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$cfgPath = Join-Path $repo "scripts\playsheets\$Sheet.servers.json"
if (-not (Test-Path $cfgPath)) { throw "No server list at $cfgPath" }
$cfg = Get-Content $cfgPath -Raw -Encoding UTF8 | ConvertFrom-Json

function Wt($port) { Join-Path $WorktreeRoot "$port" }

if ($Cleanup) {
  foreach ($pr in $cfg.prs) {
    $c = Get-NetTCPConnection -LocalPort $pr.port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($c) {
      # the server's window (its parent) holds the worktree as its working directory - close both
      $parent = (Get-CimInstance Win32_Process -Filter "ProcessId=$($c.OwningProcess)").ParentProcessId
      Stop-Process -Id $c.OwningProcess -Force -Confirm:$false
      $pp = Get-Process -Id $parent -ErrorAction SilentlyContinue
      if ($pp -and $pp.ProcessName -eq 'powershell') { Stop-Process -Id $parent -Force -Confirm:$false }
      "stopped server on $($pr.port)"
    }
    $w = Wt $pr.port
    if (Test-Path $w) {
      Start-Sleep -Seconds 2   # the stopped server releases its files
      git -C $repo worktree remove --force $w
      if (Test-Path $w) { Remove-Item -Recurse -Force $w -ErrorAction SilentlyContinue }
      "removed $w"
    }
  }
  git -C $repo worktree prune
  return
}

# 1. main - only fast-forward a clean main; never touch someone's work in progress.
$branch = (git -C $repo branch --show-current).Trim()
$dirty = git -C $repo status --porcelain
if ($branch -eq 'main' -and -not $dirty) {
  git -C $repo pull --ff-only
} else {
  Write-Warning "The repo is on '$branch' with $(@($dirty).Count) changed files - NOT pulling. The $($cfg.main) server will serve that state."
}
git -C $repo fetch --quiet origin
Push-Location $repo; npm install --no-audit --no-fund; Pop-Location

# 2. one detached worktree per PR, refreshed to the pushed tip.
New-Item -ItemType Directory -Force $WorktreeRoot | Out-Null
foreach ($pr in $cfg.prs) {
  $w = Wt $pr.port
  $ref = "origin/$($pr.branch)"
  if (Test-Path $w) {
    git -C $w checkout --quiet --detach $ref
  } else {
    git -C $repo worktree add --detach $w $ref
  }
  "{0}  {1}  @ {2}" -f $pr.port, $pr.branch, (git -C $w rev-parse --short HEAD).Trim()
  Push-Location $w; npm install --no-audit --no-fund; Pop-Location
}

# 3. one window per server (a port already in use is reported, not taken over).
$servers = @(@{ port = $cfg.main; dir = $repo; label = 'main' }) + @($cfg.prs | ForEach-Object { @{ port = $_.port; dir = (Wt $_.port); label = $_.branch } })
foreach ($s in $servers) {
  if (Get-NetTCPConnection -LocalPort $s.port -State Listen -ErrorAction SilentlyContinue) {
    Write-Warning "Port $($s.port) is already in use - left as is ($($s.label)). Close that server and re-run to replace it."
    continue
  }
  $cmd = "`$host.UI.RawUI.WindowTitle = 'play $($s.port) - $($s.label)'; node node_modules/vite/bin/vite.js --port $($s.port) --strictPort"
  Start-Process powershell -ArgumentList '-NoExit', '-Command', $cmd -WorkingDirectory $s.dir
}

# 4. wait until each answers (vite binds IPv6 localhost - poll `localhost`, not 127.0.0.1).
foreach ($s in $servers) {
  $ok = $false
  for ($i = 0; $i -lt 60 -and -not $ok; $i++) {
    try { $ok = (Invoke-WebRequest -UseBasicParsing "http://localhost:$($s.port)/" -TimeoutSec 3).StatusCode -eq 200 } catch { Start-Sleep -Seconds 2 }
  }
  "{0}  {1}  {2}" -f $(if ($ok) { 'UP  ' } else { 'DOWN' }), "http://localhost:$($s.port)/", $s.label
}
"Play sheet: scripts/playsheets/$Sheet.json  |  stop and remove the PR servers with -Cleanup"
