@echo off
rem Cria o atalho "Projecao Assembleia" na area de trabalho, com o icone da igreja
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$p=(Get-Location).Path; $nome='Proje'+[char]0xE7+[char]0xE3+'o Assembleia'; $d=[Environment]::GetFolderPath('Desktop'); $s=(New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $d ($nome+'.lnk'))); $s.TargetPath='wscript.exe'; $s.Arguments=[char]34+(Join-Path $p 'abrir.vbs')+[char]34; $s.WorkingDirectory=$p; $s.IconLocation=(Join-Path $p 'assets\icone.ico')+',0'; $s.Description=$nome; $s.Save()"
echo Atalho criado na area de trabalho.
