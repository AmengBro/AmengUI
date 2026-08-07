cmake_minimum_required(VERSION 3.16)
project(amsys LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -Wall -Wextra")

file(GLOB_RECURSE SOURCES src/*.cpp)

# Windows resource file for the icon
set(CMAKE_RC_COMPILER windres)
set(CMAKE_RC_FLAGS "-O coff")

add_executable(amsys ${SOURCES} icon.rc)
target_include_directories(amsys PRIVATE src)
target_link_libraries(amsys PRIVATE ole32 oleaut32 wbemuuid)

# ── Login launcher (tty 风格登录界面，登录后以 --user 启动 amsys) ──
add_executable(launcher
    launcher/launcher_main.cpp
    launcher/passwd_shadow.cpp
    src/config.cpp
    src/path_manager.cpp
    src/floder_reader.cpp
    launcher.rc)
target_include_directories(launcher PRIVATE src launcher)
target_link_libraries(launcher PRIVATE ole32 oleaut32 wbemuuid)
