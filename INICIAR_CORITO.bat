@echo off
title Corito Domino - Servidor
echo ============================================
echo   CORITO DOMINO - Servidor + Tunel HTTPS
echo ============================================
echo.
echo Abriendo el servidor del juego...
start "Corito Servidor" cmd /k "cd /d %~dp0 && node server.js"
timeout /t 3 >nul
echo.
echo Abriendo el tunel HTTPS de Cloudflare...
echo.
echo  >> CUANDO APAREZCA UN ENLACE  https://....trycloudflare.com
echo     ESE ES EL LINK QUE COMPARTES CON TUS AMIGOS.
echo.
echo  (Deja ESTA ventana y la del servidor ABIERTAS mientras juegan.)
echo.
cloudflared.exe tunnel --url http://localhost:8080
pause
