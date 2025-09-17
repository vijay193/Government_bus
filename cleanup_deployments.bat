@echo off
setlocal enabledelayedexpansion

:: Get all deployment IDs
for /f "tokens=*" %%i in ('gh api repos/vijay193/Government_bus/deployments --jq ".[].id"') do (
    set "id_list=!id_list! %%i"
)

:: Split IDs into an array
set count=0
for %%j in (%id_list%) do (
    set /a count+=1
    set "id[!count!]=%%j"
)

:: First ID is the newest, skip it
echo Keeping newest deployment ID: !id[1]!
echo.

:: Delete all other deployments
for /l %%k in (2,1,%count%) do (
    echo Deleting deployment ID: !id[%%k]!
    gh api --method DELETE repos/vijay193/Government_bus/deployments/!id[%%k]!
)

echo.
echo Cleanup finished. Only the latest deployment should remain.
pause
