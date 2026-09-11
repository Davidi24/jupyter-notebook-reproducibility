#!/usr/bin/env python3
"""Loopback-only job service that runs the Bash pipeline inside Docker."""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path, PurePosixPath
from urllib.parse import unquote, urlparse


ROOT = Path(__file__).resolve().parents[1]
DATA_OUTPUT_ROOT = ROOT / "data" / "output"
MAIN_DB_DIR = DATA_OUTPUT_ROOT / "db"
JOBS_ROOT = DATA_OUTPUT_ROOT / "web-jobs"
IMAGE_NAME = os.environ.get("NOTEBOOKFAIR_PIPELINE_IMAGE", "notebookfair-pipeline:local")
MAX_BODY_BYTES = 256 * 1024
MAX_NOTEBOOKS = 2000
MAX_LOG_LINES = 80
JOB_TIMEOUT_SECONDS = int(os.environ.get("NOTEBOOKFAIR_JOB_TIMEOUT", "7200"))
SUPPORTED_HOSTS = {"github.com", "codeberg.org", "zenodo.org", "www.zenodo.org"}
TERMINAL_STATES = {"succeeded", "partial", "failed", "cancelled"}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def atomic_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
    temporary.replace(path)


def validate_repository_url(value: object) -> str:
    if not isinstance(value, str) or len(value) > 2048:
        raise ValueError("A valid repository URL is required")
    parsed = urlparse(value.strip())
    if parsed.scheme != "https" or parsed.hostname not in SUPPORTED_HOSTS:
        raise ValueError("Only HTTPS GitHub, Codeberg, and Zenodo URLs are supported")
    if parsed.username or parsed.password or parsed.port:
        raise ValueError("Repository credentials and custom ports are not accepted")
    decoded_path = unquote(parsed.path)
    if ".." in PurePosixPath(decoded_path).parts or "\\" in decoded_path:
        raise ValueError("The repository URL contains an unsafe path")
    parts = [part for part in decoded_path.split("/") if part]
    if parsed.hostname in {"github.com", "codeberg.org"} and len(parts) < 2:
        raise ValueError("The repository URL must contain an owner and repository")
    if parsed.hostname in {"zenodo.org", "www.zenodo.org"} and (
        len(parts) < 2 or parts[0] not in {"record", "records"} or not parts[1].isdigit()
    ):
        raise ValueError("The Zenodo URL must identify a published record")
    return value.strip()


def validate_notebooks(value: object) -> list[str]:
    if not isinstance(value, list) or not value or len(value) > MAX_NOTEBOOKS:
        raise ValueError(f"Provide between 1 and {MAX_NOTEBOOKS} notebook paths")
    validated = []
    for item in value:
        if not isinstance(item, str) or len(item) > 4096:
            raise ValueError("Every notebook path must be a string")
        normalized = item.strip().replace("\\", "/")
        path = PurePosixPath(normalized)
        if not normalized.endswith(".ipynb") or path.is_absolute() or ".." in path.parts:
            raise ValueError("An unsafe notebook path was rejected")
        validated.append(normalized)
    return validated


class JobManager:
    def __init__(self) -> None:
        self.lock = threading.RLock()
        self.image_lock = threading.Lock()
        self.image_ready = False
        self.executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="pipeline-job")
        self.processes: dict[str, tuple[subprocess.Popen, str]] = {}
        MAIN_DB_DIR.mkdir(parents=True, exist_ok=True)
        JOBS_ROOT.mkdir(parents=True, exist_ok=True)
        self._recover_interrupted_jobs()

    def _recover_interrupted_jobs(self) -> None:
        for state_path in JOBS_ROOT.glob("*/state.json"):
            try:
                state = json.loads(state_path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                continue
            if state.get("status") not in TERMINAL_STATES:
                state.update(
                    status="failed",
                    stage="Interrupted",
                    message="The local pipeline runner stopped before this job finished.",
                    error="Runner interrupted",
                    finishedAt=utc_now(),
                )
                atomic_json(state_path, state)

    def _job_dir(self, job_id: str) -> Path:
        if not re.fullmatch(r"[0-9a-f]{32}", job_id):
            raise KeyError(job_id)
        directory = (JOBS_ROOT / job_id).resolve()
        directory.relative_to(JOBS_ROOT.resolve())
        return directory

    def _read(self, job_id: str) -> dict:
        state_path = self._job_dir(job_id) / "state.json"
        if not state_path.is_file():
            raise KeyError(job_id)
        return json.loads(state_path.read_text(encoding="utf-8"))

    def _write(self, job_id: str, **changes: object) -> dict:
        with self.lock:
            state = self._read(job_id)
            state.update(changes, updatedAt=utc_now())
            atomic_json(self._job_dir(job_id) / "state.json", state)
            return state

    def create(self, payload: dict) -> dict:
        repository_id = payload.get("repositoryId")
        if not isinstance(repository_id, str) or not re.fullmatch(r"[0-9a-f-]{36}", repository_id):
            raise ValueError("A valid workspace repository ID is required")
        repository_url = validate_repository_url(payload.get("url"))
        notebooks = validate_notebooks(payload.get("notebooks"))
        job_id = uuid.uuid4().hex
        job_dir = self._job_dir(job_id)
        job_dir.mkdir(parents=True, exist_ok=False)
        state = {
            "id": job_id,
            "repositoryId": repository_id,
            "repositoryUrl": repository_url,
            "notebookCount": len(notebooks),
            "status": "queued",
            "stage": "Queued",
            "progress": 1,
            "message": "Waiting for the isolated pipeline runner.",
            "error": None,
            "createdAt": utc_now(),
            "updatedAt": utc_now(),
            "startedAt": None,
            "finishedAt": None,
        }
        atomic_json(job_dir / "request.json", {"url": repository_url, "notebooks": notebooks})
        atomic_json(job_dir / "state.json", state)
        self.executor.submit(self._run, job_id)
        return state

    def get(self, job_id: str) -> dict:
        with self.lock:
            state = self._read(job_id)
        log_path = self._job_dir(job_id) / "runner.log"
        if log_path.is_file():
            lines = log_path.read_text(encoding="utf-8", errors="replace").splitlines()
            state["log"] = lines[-MAX_LOG_LINES:]
        else:
            state["log"] = []
        result_path = self._job_dir(job_id) / "result.json"
        if result_path.is_file():
            try:
                state["result"] = json.loads(result_path.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                state["result"] = None
        return state

    def cancel(self, job_id: str) -> dict:
        state = self._read(job_id)
        if state.get("status") in TERMINAL_STATES:
            return self.get(job_id)
        process_entry = self.processes.get(job_id)
        if process_entry:
            process, container_name = process_entry
            subprocess.run(
                ["docker", "stop", "--time", "10", container_name],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=20,
                check=False,
            )
            if process.poll() is None:
                process.terminate()
        self._write(
            job_id,
            status="cancelled",
            stage="Cancelled",
            progress=state.get("progress", 0),
            message="The pipeline run was cancelled.",
            finishedAt=utc_now(),
        )
        return self.get(job_id)

    def _docker_available(self) -> bool:
        result = subprocess.run(
            ["docker", "info", "--format", "{{.ServerVersion}}"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=15,
            check=False,
        )
        return result.returncode == 0

    def health(self) -> dict:
        available = self._docker_available()
        return {
            "status": "ok" if available else "unavailable",
            "docker": available,
            "image": IMAGE_NAME,
        }

    def _ensure_volume_ownership(self, log_handle) -> None:
        # The named volume can end up owned by root if it was ever created or
        # touched by a different container/user (for example, an earlier
        # interrupted run). The pipeline container runs as the unprivileged
        # jovyan user (uid 1000) and cannot fix this itself, so repair
        # ownership here, as root, before every run. This is cheap and
        # idempotent — safe to run even when ownership is already correct.
        subprocess.run(
            [
                "docker", "run", "--rm", "--user", "root",
                "--volume", "notebookfair-pyenv-versions:/mnt/pyenv-versions",
                IMAGE_NAME, "chown", "-R", "1000:1000", "/mnt/pyenv-versions",
            ],
            stdout=log_handle,
            stderr=subprocess.STDOUT,
            timeout=30,
            check=False,
        )

    def _ensure_image(self, job_id: str, log_handle) -> None:
        with self.image_lock:
            if self.image_ready:
                return
            self._write(
                job_id,
                status="building",
                stage="Preparing runner",
                progress=4,
                message="Building or refreshing the isolated pipeline image. This only happens once per runner start.",
            )
            result = subprocess.run(
                ["docker", "build", "--tag", IMAGE_NAME, "--file", str(ROOT / "binder" / "Dockerfile"), str(ROOT)],
                stdout=log_handle,
                stderr=subprocess.STDOUT,
                timeout=1800,
                check=False,
            )
            if result.returncode != 0:
                raise RuntimeError("The Docker pipeline image could not be built")
            self.image_ready = True

    def _progress_from_line(self, line: str, completed_notebooks: int, total: int) -> tuple[int, str, str, int]:
        if "[REPO] Cloning" in line:
            return 10, "Acquiring repository", "Cloning the repository in an isolated container.", completed_notebooks
        if "[ZENODO]" in line:
            return 10, "Acquiring repository", "Downloading the Zenodo record in an isolated container.", completed_notebooks
        if "[REPO] Notebooks:" in line:
            match = re.search(r"python=(\d+)", line)
            count = int(match.group(1)) if match else total
            noun = "notebook" if count == 1 else "notebooks"
            return 15, "Acquiring repository", f"Repository acquired — {count} Python {noun} ready.", completed_notebooks
        if "[CLASSIFICATION] Classifying:" in line:
            name = line.split("Classifying:", 1)[-1].strip()
            return 20, "Classifying notebooks", f"Inspecting {name or 'the notebook'} to detect its category.", completed_notebooks
        if "[CLASSIFICATION] Result stored" in line:
            return 24, "Classifying notebooks", "Classification saved. Moving to the next notebook.", completed_notebooks
        if "[REQUIREMENT] Processing requirements" in line:
            return 26, "Resolving dependencies", "Looking for a requirements file in the repository.", completed_notebooks
        if "[REQUIREMENT] Extracting imports" in line:
            return 30, "Resolving dependencies", "Extracting the notebook's code to detect its imports.", completed_notebooks
        if "[REQUIREMENT] Added external library" in line:
            library = line.rsplit(":", 1)[-1].strip()
            return 33, "Resolving dependencies", f"Found dependency: {library or 'unknown package'}.", completed_notebooks
        if "Final requirements.txt created with" in line:
            match = re.search(r"with\s+(\d+)\s+packages", line)
            count = int(match.group(1)) if match else 0
            noun = "package" if count == 1 else "packages"
            return 38, "Resolving dependencies", f"Dependency discovery complete — {count} {noun} found.", completed_notebooks
        if "[REQUIREMENT]" in line:
            return 36, "Resolving dependencies", "Building the notebook's requirements file.", completed_notebooks
        if "[PYENV] Installing Python" in line:
            version = line.split("Installing Python", 1)[-1].split("(", 1)[0].strip()
            return 42, "Creating environment", f"Installing Python {version or 'runtime'} — this can take several minutes the first time.", completed_notebooks
        if "[PYENV] Creating venv" in line:
            return 50, "Creating environment", "Creating an isolated virtual environment.", completed_notebooks
        if "[PYENV] Upgrading pip" in line:
            return 52, "Creating environment", "Installing Jupyter and nbconvert into the environment.", completed_notebooks
        if "[PYENV] Installing: " in line:
            package = line.split("Installing:", 1)[-1].strip()
            return 54, "Installing dependencies", f"Installing {package or 'a package'}.", completed_notebooks
        if "[PYENV] ✓ " in line:
            package = line.split("✓", 1)[-1].strip()
            return 54, "Installing dependencies", f"{package or 'Package'} passed installation.", completed_notebooks
        if "[PYENV] Environment ready." in line:
            version = line.split("Python:", 1)[-1].strip() if "Python:" in line else "Python"
            return 55, "Creating environment", f"The isolated environment passed setup with {version}.", completed_notebooks
        if "[PYENV] Executing notebook:" in line:
            name = line.split("Executing notebook:", 1)[-1].strip()
            progress = 55 + round((completed_notebooks / max(total, 1)) * 35)
            return progress, "Executing notebooks", f"Notebook {completed_notebooks + 1} of {total} is running: {name}.", completed_notebooks
        if "[PYENV] Notebook executed successfully:" in line:
            return -1, "", "", completed_notebooks
        if "[PYENV] Notebook executed with errors:" in line:
            return -1, "", "", completed_notebooks
        if line.startswith("SUCCESS|") or line.startswith("SUCCESS_WITH_ERRORS|") or line.startswith("EXEC_FAIL|"):
            completed_notebooks += 1
            progress = 55 + round((completed_notebooks / max(total, 1)) * 35)
            return progress, "Executing notebooks", f"Completed {completed_notebooks} of {total} notebooks.", completed_notebooks
        if "[NOTEBOOK] ID=" in line and "path=" in line:
            name = line.split("path=", 1)[-1].strip()
            return 94, "Comparing outputs", f"Comparing original and executed outputs for {name}.", completed_notebooks
        if "[NOTEBOOK] Comparing outputs" in line:
            return 92, "Comparing outputs", "Calculating reproducibility results.", completed_notebooks
        return -1, "", "", completed_notebooks

    def _run(self, job_id: str) -> None:
        job_dir = self._job_dir(job_id)
        log_path = job_dir / "runner.log"
        try:
            request = json.loads((job_dir / "request.json").read_text(encoding="utf-8"))
            if not self._docker_available():
                raise RuntimeError("Docker Desktop is not running")
            self._write(
                job_id,
                status="preparing",
                stage="Preparing runner",
                progress=3,
                message="Checking the isolated pipeline environment.",
                startedAt=utc_now(),
            )
            with log_path.open("a", encoding="utf-8", buffering=1) as log_handle:
                self._ensure_image(job_id, log_handle)
                self._ensure_volume_ownership(log_handle)
                container_name = f"notebookfair-{job_id[:20]}"
                environment = os.environ.copy()
                environment.update(
                    WEB_REPO_URL=request["url"],
                    WEB_NOTEBOOK_PATHS=";".join(request["notebooks"]),
                    WEB_JOB_DIR="/job",
                    CLASSIFICATION_ENABLED="true",
                    CLASSIFICATION_RULE_ONLY=os.environ.get("CLASSIFICATION_RULE_ONLY", "true"),
                    PYTHONUNBUFFERED="1",
                )
                command = [
                    "docker", "run", "--rm", "--name", container_name,
                    "--memory", os.environ.get("NOTEBOOKFAIR_JOB_MEMORY", "4g"),
                    "--cpus", os.environ.get("NOTEBOOKFAIR_JOB_CPUS", "2"),
                    "--pids-limit", "512",
                    "--security-opt", "no-new-privileges",
                    "--cap-drop", "ALL",
                    "--volume", f"{ROOT}:/workspace:ro",
                    "--volume", f"{MAIN_DB_DIR}:/workspace/data/output/db:rw",
                    "--volume", f"{job_dir}:/job:rw",
                    "--volume", "notebookfair-pyenv-versions:/home/jovyan/.pyenv/versions",
                    "--tmpfs", "/job/venvs:rw,exec,nosuid,nodev,size=2g,uid=1000,gid=1000,mode=0755",
                    "--workdir", "/job",
                    "--env", "WEB_REPO_URL",
                    "--env", "WEB_NOTEBOOK_PATHS",
                    "--env", "WEB_JOB_DIR",
                    "--env", "CLASSIFICATION_ENABLED",
                    "--env", "CLASSIFICATION_RULE_ONLY",
                    "--env", "PYTHONUNBUFFERED",
                ]
                for secret_name in ("GITHUB_TOKEN", "CODEBERG_TOKEN", "ZENODO_TOKEN"):
                    if environment.get(secret_name):
                        command.extend(("--env", secret_name))
                command.extend((IMAGE_NAME, "bash", "/workspace/pipeline/web-run.sh"))

                self._write(
                    job_id,
                    status="running",
                    stage="Starting pipeline",
                    progress=8,
                    message="The repository is entering the reproducibility pipeline.",
                )
                process = subprocess.Popen(
                    command,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    encoding="utf-8",
                    errors="replace",
                    env=environment,
                )
                self.processes[job_id] = (process, container_name)
                timed_out = threading.Event()

                def stop_after_timeout() -> None:
                    timed_out.set()
                    subprocess.run(
                        ["docker", "stop", "--time", "10", container_name],
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL,
                        timeout=20,
                        check=False,
                    )

                timeout_timer = threading.Timer(JOB_TIMEOUT_SECONDS, stop_after_timeout)
                timeout_timer.daemon = True
                timeout_timer.start()
                completed_notebooks = 0
                try:
                    assert process.stdout is not None
                    for line in process.stdout:
                        log_handle.write(line)
                        progress, stage, message, completed_notebooks = self._progress_from_line(
                            line.rstrip(), completed_notebooks, len(request["notebooks"])
                        )
                        if progress >= 0:
                            current = self._read(job_id)
                            if current.get("status") == "cancelled":
                                return
                            self._write(job_id, progress=progress, stage=stage, message=message)
                    return_code = process.wait()
                finally:
                    timeout_timer.cancel()
                if timed_out.is_set():
                    raise subprocess.TimeoutExpired(command, JOB_TIMEOUT_SECONDS)
                if self._read(job_id).get("status") == "cancelled":
                    return
                result_path = job_dir / "result.json"
                if not result_path.is_file():
                    raise RuntimeError(f"The pipeline exited without a result (exit code {return_code})")
                result = json.loads(result_path.read_text(encoding="utf-8"))
                status = result.get("status")
                if status not in {"succeeded", "partial", "failed"}:
                    status = "failed"
                messages = {
                    "succeeded": "The pipeline completed and all results are ready.",
                    "partial": "The pipeline completed with notebook warnings or failures.",
                    "failed": result.get("error") or "The pipeline could not complete this repository.",
                }
                self._write(
                    job_id,
                    status=status,
                    stage="Completed" if status != "failed" else "Failed",
                    progress=100,
                    message=messages[status],
                    error=result.get("error") if status == "failed" else None,
                    finishedAt=utc_now(),
                )
        except subprocess.TimeoutExpired:
            self.cancel(job_id)
            self._write(
                job_id,
                status="failed",
                stage="Timed out",
                message="The pipeline exceeded its two-hour safety limit.",
                error="Pipeline timed out",
                finishedAt=utc_now(),
            )
        except Exception as error:  # keep the local service alive after job failures
            self._write(
                job_id,
                status="failed",
                stage="Failed",
                message=str(error),
                error=str(error),
                finishedAt=utc_now(),
            )
        finally:
            self.processes.pop(job_id, None)


MANAGER = JobManager()


class Handler(BaseHTTPRequestHandler):
    server_version = "NotebookFairPipeline/1.0"

    def log_message(self, format_string: str, *arguments: object) -> None:
        print(f"[pipeline-runner] {format_string % arguments}")

    def _json(self, status: HTTPStatus, payload: dict) -> None:
        encoded = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(encoded)

    def _job_id(self) -> str | None:
        match = re.fullmatch(r"/jobs/([0-9a-f]{32})(?:/cancel)?", urlparse(self.path).path)
        return match.group(1) if match else None

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/health":
            health = MANAGER.health()
            status = HTTPStatus.OK if health["status"] == "ok" else HTTPStatus.SERVICE_UNAVAILABLE
            self._json(status, health)
            return
        job_id = self._job_id()
        if job_id and path == f"/jobs/{job_id}":
            try:
                self._json(HTTPStatus.OK, MANAGER.get(job_id))
            except KeyError:
                self._json(HTTPStatus.NOT_FOUND, {"error": "Job not found"})
            return
        self._json(HTTPStatus.NOT_FOUND, {"error": "Not found"})

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        if path == "/jobs":
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if length <= 0 or length > MAX_BODY_BYTES:
                    raise ValueError("The job request is empty or too large")
                payload = json.loads(self.rfile.read(length))
                if not isinstance(payload, dict):
                    raise ValueError("The job request must be a JSON object")
                self._json(HTTPStatus.ACCEPTED, MANAGER.create(payload))
            except (ValueError, json.JSONDecodeError) as error:
                self._json(HTTPStatus.BAD_REQUEST, {"error": str(error)})
            return
        job_id = self._job_id()
        if job_id and path == f"/jobs/{job_id}/cancel":
            try:
                self._json(HTTPStatus.OK, MANAGER.cancel(job_id))
            except KeyError:
                self._json(HTTPStatus.NOT_FOUND, {"error": "Job not found"})
            return
        self._json(HTTPStatus.NOT_FOUND, {"error": "Not found"})


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8788)
    arguments = parser.parse_args()
    if arguments.host not in {"127.0.0.1", "::1", "localhost"}:
        raise SystemExit("The pipeline runner may only bind to loopback")
    server = ThreadingHTTPServer((arguments.host, arguments.port), Handler)
    print(f"[pipeline-runner] listening on http://{arguments.host}:{arguments.port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        MANAGER.executor.shutdown(wait=False, cancel_futures=True)


if __name__ == "__main__":
    main()
