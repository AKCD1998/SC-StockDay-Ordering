@echo off
cd /d "%~dp0"
node --env-file=.env src/index.js --execute --branch=000
node --env-file=.env src/index.js --execute --branch=005
