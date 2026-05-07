# Docker Desktop setup blocker

## Goal
Configure and start Docker for the CRM frontend.

## What was checked

- `docker --version` works: Docker CLI is installed.
- `docker compose version` works: Docker Compose is installed.
- `docker context ls` shows `desktop-linux` as the active context.

## Failure

`docker info` fails with:

```text
Server:
ERROR: Error response from daemon: Docker Desktop is unable to start
errors pretty printing info
```

## Additional diagnostics

Services:

```text
com.docker.service Stopped Manual
LxssManager        Running Manual
vmcompute          Stopped Manual
```

`wsl --status` reported that the WSL 2 kernel is not found/needs update and suggested running:

```text
wsl --update
```

`wsl --update` was started and is still running in a separate terminal.

Attempting to start Docker Desktop from CLI did not fix it:

```text
Docker Desktop is unable to start
```

Attempting to inspect Windows optional features failed because the command requires elevated permissions:

```text
Get-WindowsOptionalFeature : requested operation requires elevation
```

## Likely cause

Docker Desktop is installed, but the Docker daemon cannot start because Windows virtualization/WSL2 backend is not fully ready. Most likely causes:

- WSL2 kernel update has not completed;
- Virtual Machine Platform is disabled;
- Windows Hypervisor Platform/Hyper-V support is disabled;
- `vmcompute` service cannot start without elevated/system configuration;
- reboot is required after Docker/WSL installation.

## Recommended next actions for user

1. Let the running `wsl --update` command finish.
2. Reboot Windows.
3. Open Docker Desktop manually and wait until it says Docker is running.
4. If Docker still cannot start, open PowerShell as Administrator and run:

```powershell
wsl --update
wsl --set-default-version 2
dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart
dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart
```

5. Reboot again.
6. Run:

```bat
docker info
```

Only after Docker daemon starts should the project commands be run:

```bat
docker compose config
docker compose up --build web
```
