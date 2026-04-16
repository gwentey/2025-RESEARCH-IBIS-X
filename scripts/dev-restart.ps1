# dev-restart.ps1 -- Rebuild + redeploy + port-forwards en background.
# ASCII only (compatible Windows PowerShell 5.1 qui lit en ANSI).
#
# Usage:
#   .\scripts\dev-restart.ps1                 # rebuild frontend par defaut
#   .\scripts\dev-restart.ps1 -Service api-gateway
#   .\scripts\dev-restart.ps1 -All            # rebuild tous les services backend
#   .\scripts\dev-restart.ps1 -NoBuild        # juste restart + port-forwards
#   .\scripts\dev-restart.ps1 -Stop           # arrete les port-forwards
#
# Les port-forwards tournent via Start-Job. List: Get-Job. Logs: Receive-Job -Id N.

[CmdletBinding()]
param(
    [string]$Service = "frontend",
    [switch]$All,
    [switch]$NoBuild,
    [switch]$Stop
)

$ErrorActionPreference = "Stop"
$Namespace = "ibis-x"

function Write-Step($msg) {
    Write-Host ""
    Write-Host "==> $msg" -ForegroundColor Cyan
}

function Stop-PortForwards {
    Write-Step "Arret des port-forwards en cours"
    Get-Job -Name "pf-*" -ErrorAction SilentlyContinue | ForEach-Object {
        Stop-Job $_ -ErrorAction SilentlyContinue
        Remove-Job $_ -Force -ErrorAction SilentlyContinue
        Write-Host ("  stopped " + $_.Name)
    }
}

if ($Stop) {
    Stop-PortForwards
    Write-Host "OK -- port-forwards arretes." -ForegroundColor Green
    exit 0
}

# 1. Pointer Docker sur le daemon Minikube
Write-Step "Connexion au daemon Docker de Minikube"
& minikube -p minikube docker-env --shell powershell | Invoke-Expression

# 2. Rebuild
if (-not $NoBuild) {
    if ($All) {
        $services = @("frontend", "api-gateway", "service-selection", "ml-pipeline-service", "xai-engine-service")
    } else {
        $services = @($Service)
    }

    foreach ($svc in $services) {
        if (-not (Test-Path $svc)) {
            Write-Host ("  skip " + $svc + " (dossier absent)") -ForegroundColor Yellow
            continue
        }
        Write-Step ("Build image ibis-x-" + $svc)
        $tag = "ibis-x-" + $svc + ":latest"
        docker build -t $tag $svc
        if ($LASTEXITCODE -ne 0) {
            Write-Host ("Build " + $svc + " FAILED") -ForegroundColor Red
            exit 1
        }
    }

    # 3. Rollout restart
    Write-Step "Rollout restart des deployments"
    foreach ($svc in $services) {
        $deploy = $svc
        if ($svc -eq "ml-pipeline-service") { $deploy = "ml-pipeline" }
        if ($svc -eq "xai-engine-service") { $deploy = "xai-engine" }

        $exists = kubectl -n $Namespace get deploy $deploy -o name 2>$null
        if ($exists) {
            kubectl -n $Namespace rollout restart ("deploy/" + $deploy) | Out-Null
            Write-Host ("  restarted " + $deploy)
        }
    }

    # 4. Attendre
    Write-Step "Attente du rollout"
    foreach ($svc in $services) {
        $deploy = $svc
        if ($svc -eq "ml-pipeline-service") { $deploy = "ml-pipeline" }
        if ($svc -eq "xai-engine-service") { $deploy = "xai-engine" }

        $exists = kubectl -n $Namespace get deploy $deploy -o name 2>$null
        if ($exists) {
            kubectl -n $Namespace rollout status ("deploy/" + $deploy) --timeout=180s
        }
    }
}

# 5. Port-forwards en jobs background
Stop-PortForwards

Write-Step "Lancement des port-forwards en background jobs"

$portForwards = @(
    @{ Name = "pf-frontend";      Svc = "frontend";            Local = 8080; Remote = 80 },
    @{ Name = "pf-api";           Svc = "api-gateway-service"; Local = 9000; Remote = 80 },
    @{ Name = "pf-minio-web";     Svc = "minio-service";       Local = 9001; Remote = 80 }
)

$prevEAP = $ErrorActionPreference
$ErrorActionPreference = "Continue"
foreach ($pf in $portForwards) {
    $svcExists = (kubectl -n $Namespace get svc $pf.Svc -o name 2>&1 | Out-String).Trim()
    if ($svcExists -notmatch "^service/") {
        Write-Host ("  skip " + $pf.Name + " -- svc/" + $pf.Svc + " absent") -ForegroundColor Yellow
        continue
    }
    Start-Job -Name $pf.Name -ScriptBlock {
        param($ns, $svc, $local, $remote)
        kubectl -n $ns port-forward ("svc/" + $svc) ($local.ToString() + ":" + $remote.ToString())
    } -ArgumentList $Namespace, $pf.Svc, $pf.Local, $pf.Remote | Out-Null
    Write-Host ("  " + $pf.Name + " -> http://localhost:" + $pf.Local)
}
$ErrorActionPreference = $prevEAP

Start-Sleep -Seconds 2

Write-Host ""
Write-Host "OK -- tout est relance." -ForegroundColor Green
Write-Host ""
Write-Host "  Frontend :  http://localhost:8080"
Write-Host "  API docs :  http://localhost:9000/docs"
Write-Host "  MinIO Web : http://localhost:9001"
Write-Host ""
Write-Host "Commandes utiles :" -ForegroundColor Cyan
Write-Host "  Get-Job                           # lister les jobs"
Write-Host "  Receive-Job -Id N -Keep           # voir les logs d'un job"
Write-Host "  .\scripts\dev-restart.ps1 -Stop   # tout arreter"
