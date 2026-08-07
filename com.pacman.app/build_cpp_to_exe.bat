@echo off
setlocal
set GCC=D:\TDM-GCC\bin\g++.exe
set WINDRES=D:\TDM-GCC\bin\windres.exe
set FLAGS=-std=c++17 -O2 -s -static -mwindows
set LIBS=-lfltk_images -lfltk_png -lfltk_z -lfltk_jpeg -lfltk_forms -lfltk -lgdiplus -lole32 -luuid -lcomctl32 -lws2_32 -lwinspool -lgdi32 -lshell32
"%WINDRES%" pacman.rc -O coff -o pacman.res
if errorlevel 1 exit /b 1
"%GCC%" src\main.cpp src\ui.cpp src\apm_core.cpp src\amsys_client.cpp src\package_info.cpp src\icon_loader.cpp pacman.res -o pacman.exe %FLAGS% %LIBS%
if %errorlevel%==0 (
  echo BUILD OK - pacman.exe
) else (
  echo BUILD FAILED
  exit /b 1
)
