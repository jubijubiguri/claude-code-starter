# =============================================================================
# claude-code-starter 셋업 스크립트
#
# 하는 일:
#   1. 공통 표준 CLAUDE.md를 전역 위치(~\.claude\CLAUDE.md)에 설치 (기존 파일은 백업)
#   2. 사용자 설정(~\.claude\settings.json)에 팀 마켓플레이스와 플러그인 활성화를 병합
#   3. 필요한 프로그램(Claude Code, Node.js, Python) 설치 여부 확인
#
# 실행법 (PowerShell):
#   powershell -ExecutionPolicy Bypass -File .\setup.ps1
#
# 여러 번 실행해도 안전합니다 (이미 설정된 항목은 건너뜁니다).
# =============================================================================

param(
    # 테스트용: 설치 대상 홈 디렉토리 (기본값: 현재 사용자 홈)
    [string]$TargetHome = $HOME
)

$ErrorActionPreference = "Stop"

$MarketplaceRepo = "jubijubiguri/claude-code-starter"
$ClaudeDir    = Join-Path $TargetHome ".claude"
$GlobalMd     = Join-Path $ClaudeDir "CLAUDE.md"
$SettingsPath = Join-Path $ClaudeDir "settings.json"
$SourceMd     = Join-Path $PSScriptRoot "setup\CLAUDE.md"
$Stamp        = Get-Date -Format "yyyyMMdd-HHmmss"

function Write-Step($msg)  { Write-Host "`n== $msg" -ForegroundColor Cyan }
function Write-Ok($msg)    { Write-Host "   [OK] $msg" -ForegroundColor Green }
function Write-Skip($msg)  { Write-Host "   [--] $msg" -ForegroundColor DarkGray }
function Write-Warn2($msg) { Write-Host "   [!!] $msg" -ForegroundColor Yellow }

function Set-Prop($obj, $name, $value) {
    if ($obj.PSObject.Properties.Name -contains $name) { $obj.$name = $value }
    else { $obj | Add-Member -NotePropertyName $name -NotePropertyValue $value }
}

function Get-OrAddProp($obj, $name) {
    if (-not ($obj.PSObject.Properties.Name -contains $name)) {
        $obj | Add-Member -NotePropertyName $name -NotePropertyValue ([pscustomobject]@{})
    }
    return $obj.$name
}

Write-Host "============================================="
Write-Host " Claude Code Starter 셋업"
Write-Host "============================================="

# -----------------------------------------------------------------------------
Write-Step "1/4 필요한 프로그램 확인"
# -----------------------------------------------------------------------------

if (Get-Command claude -ErrorAction SilentlyContinue) {
    $versionText = claude --version 2>$null
    $m = [regex]::Match("$versionText", '\d+\.\d+\.\d+')
    if ($m.Success) {
        $version = [version]$m.Value
        if ($version -lt [version]'2.1.139') {
            Write-Warn2 "Claude Code 2.1.139 이상이 필요합니다. 현재: $version"
            Write-Warn2 "claude update 를 실행한 뒤 셋업을 다시 진행해주세요."
            exit 1
        }
        Write-Ok "Claude Code 설치됨 (v$version)"
    } else {
        Write-Ok "Claude Code 설치됨 (버전 확인 불가 — 계속 진행)"
    }
} else {
    Write-Warn2 "Claude Code를 찾을 수 없습니다. 설치 후 다시 실행해주세요."
    Write-Warn2 "설치 안내: https://code.claude.com/docs"
    exit 1
}

if (Get-Command node -ErrorAction SilentlyContinue) {
    Write-Ok "Node.js 설치됨 ($(node --version))"
} else {
    Write-Warn2 "Node.js가 없습니다. 안전 가드(Hook)가 동작하려면 반드시 필요합니다."
    Write-Warn2 "https://nodejs.org 에서 LTS 버전을 설치한 뒤 이 스크립트를 다시 실행해주세요."
    exit 1
}

$pythonOk = $false
foreach ($py in @("python", "py")) {
    if (Get-Command $py -ErrorAction SilentlyContinue) { $pythonOk = $true; break }
}
if ($pythonOk) {
    Write-Ok "Python 설치됨"
} else {
    Write-Warn2 "Python이 없습니다. 지금 필수는 아니지만, 진단 도구(AI-Ready/토큰 분석)를 쓸 때 필요합니다."
    Write-Warn2 "나중에 https://www.python.org/downloads 에서 설치하시면 됩니다. (셋업은 계속 진행합니다)"
}

# -----------------------------------------------------------------------------
Write-Step "2/4 공통 표준 CLAUDE.md 설치"
# -----------------------------------------------------------------------------

if (-not (Test-Path $SourceMd)) {
    Write-Warn2 "setup\CLAUDE.md를 찾을 수 없습니다. 저장소 폴더 안에서 실행했는지 확인해주세요."
    exit 1
}
if (-not (Test-Path $ClaudeDir)) { New-Item -ItemType Directory -Path $ClaudeDir | Out-Null }

if (Test-Path $GlobalMd) {
    $same = (Get-FileHash $GlobalMd).Hash -eq (Get-FileHash $SourceMd).Hash
    if ($same) {
        Write-Skip "이미 최신 상태 — 건너뜀"
    } else {
        $backup = Join-Path $ClaudeDir "CLAUDE.backup-$Stamp.md"
        Copy-Item $GlobalMd $backup
        Copy-Item $SourceMd $GlobalMd -Force
        Write-Ok "설치 완료 (기존 파일은 $(Split-Path $backup -Leaf) 로 백업)"
        Write-Warn2 "기존 파일에 직접 추가하신 개인 지침이 있었다면, 백업에서 꺼내 새 파일 맨 아래에 붙여주세요."
    }
} else {
    Copy-Item $SourceMd $GlobalMd
    Write-Ok "설치 완료: $GlobalMd"
}

# -----------------------------------------------------------------------------
Write-Step "3/4 플러그인 설정 병합 (settings.json)"
# -----------------------------------------------------------------------------

if (Test-Path $SettingsPath) {
    $raw = Get-Content $SettingsPath -Raw
    if ([string]::IsNullOrWhiteSpace($raw)) { $settings = [pscustomobject]@{} }
    else {
        try { $settings = $raw | ConvertFrom-Json }
        catch {
            Write-Warn2 "settings.json이 올바른 JSON이 아닙니다. 손대지 않고 중단합니다. 파일을 확인해주세요: $SettingsPath"
            exit 1
        }
    }
    Copy-Item $SettingsPath (Join-Path $ClaudeDir "settings.backup-$Stamp.json")
} else {
    $settings = [pscustomobject]@{}
}

$mkts = Get-OrAddProp $settings "extraKnownMarketplaces"
Set-Prop $mkts "company-tools" ([pscustomobject]@{
    source = [pscustomobject]@{ source = "github"; repo = $MarketplaceRepo }
})
Set-Prop $mkts "claude-plugins-official" ([pscustomobject]@{
    source = [pscustomobject]@{ source = "github"; repo = "anthropics/claude-plugins-official" }
})
Write-Ok "마켓플레이스 등록: company-tools, claude-plugins-official"

$plugins = Get-OrAddProp $settings "enabledPlugins"
Set-Prop $plugins "team-guards@company-tools" $true
Set-Prop $plugins "team-toolbox@company-tools" $true
Set-Prop $plugins "claude-md-management@claude-plugins-official" $true
# 개발 실천 가드는 옵트인 — 사용자가 이미 켜둔 값은 존중하고, 없을 때만 꺼짐으로 추가
if (-not ($plugins.PSObject.Properties.Name -contains "team-dev-practice@company-tools")) {
    Set-Prop $plugins "team-dev-practice@company-tools" $false
}
Write-Ok "플러그인 활성화: team-guards, team-toolbox, claude-md-management (dev-practice는 옵트인)"

$json = $settings | ConvertTo-Json -Depth 20
[System.IO.File]::WriteAllText($SettingsPath, $json, (New-Object System.Text.UTF8Encoding($false)))
Write-Ok "저장 완료: $SettingsPath"

# -----------------------------------------------------------------------------
Write-Step "4/4 완료"
# -----------------------------------------------------------------------------

Write-Host ""
Write-Host " 셋업이 끝났습니다. 다음 순서로 확인해보세요:" -ForegroundColor Cyan
Write-Host ""
Write-Host "   1. Claude Code를 (열려 있었다면 껐다가) 새로 실행"
Write-Host "   2. /plugin 입력 -> team-guards, team-toolbox 활성 확인"
Write-Host "      (처음에는 플러그인 내려받기로 잠시 걸릴 수 있습니다)"
Write-Host "   3. guides\onboarding-course.md 를 열고 온보딩 코스 시작"
Write-Host ""
