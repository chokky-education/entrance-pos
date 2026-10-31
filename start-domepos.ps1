# สคริปต์เริ่มต้นระบบ DOME Pos ทั้งชุด (Backend :8085, Frontend :3005, UAT :3056)
$ErrorActionPreference = "Stop"

Write-Host "=== Starting DOME Pos Suite ===" -ForegroundColor Cyan

# 1. Start Backend (:8085)
Write-Host "[1/3] Starting DOME Pos Backend on http://localhost:8085 ..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd d:\domepos\backend; go run ./cmd/api" -WindowStyle Minimized

# 2. Start Frontend (:3005)
Write-Host "[2/3] Starting DOME Pos Frontend on http://localhost:3005 ..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd d:\domepos\frontend; npm run dev" -WindowStyle Minimized

# 3. Start UAT (:3056)
Write-Host "[3/3] Starting DOME Pos UAT Tester on http://localhost:3056 ..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd d:\domepos\uat; pnpm dev" -WindowStyle Minimized

Write-Host "DOME Pos is starting up!" -ForegroundColor Green
Write-Host "  -> POS Screen : http://localhost:3005" -ForegroundColor White
Write-Host "  -> Backend API: http://localhost:8085/health" -ForegroundColor White
Write-Host "  -> UAT System : http://localhost:3056" -ForegroundColor White
