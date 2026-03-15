from __future__ import annotations

import shutil
import sys
from dataclasses import dataclass
from pathlib import Path
import os

DESKTOP_EXECUTABLE_NAME = "ham-backend"


def build_executable_filename() -> str:
    return f"{DESKTOP_EXECUTABLE_NAME}.exe" if sys.platform == "win32" else DESKTOP_EXECUTABLE_NAME


@dataclass(frozen=True)
class DesktopBuildPaths:
    entry_script: Path
    dist_dir: Path
    work_dir: Path
    cache_dir: Path
    spec_dir: Path
    bundle_dir: Path
    executable_path: Path


def build_output_paths(project_root: Path) -> DesktopBuildPaths:
    backend_dir = project_root / "backend"
    dist_dir = backend_dir / "dist-desktop"
    bundle_dir = dist_dir / DESKTOP_EXECUTABLE_NAME
    return DesktopBuildPaths(
        entry_script=backend_dir / "desktop_server.py",
        dist_dir=dist_dir,
        work_dir=backend_dir / "build-desktop",
        cache_dir=backend_dir / ".pyinstaller",
        spec_dir=backend_dir,
        bundle_dir=bundle_dir,
        executable_path=bundle_dir / build_executable_filename(),
    )


def build_pyinstaller_args(project_root: Path) -> list[str]:
    paths = build_output_paths(project_root)
    return [
        "--noconfirm",
        "--clean",
        "--onedir",
        "--name",
        DESKTOP_EXECUTABLE_NAME,
        "--distpath",
        str(paths.dist_dir),
        "--workpath",
        str(paths.work_dir),
        "--specpath",
        str(paths.spec_dir),
        "--paths",
        str(project_root / "backend"),
        str(paths.entry_script),
    ]


def build_pyinstaller_environment(project_root: Path) -> dict[str, str]:
    paths = build_output_paths(project_root)
    return {
        **os.environ,
        "PYINSTALLER_CONFIG_DIR": str(paths.cache_dir),
    }


def _remove_previous_build(paths: DesktopBuildPaths) -> None:
    for directory in (paths.dist_dir, paths.work_dir, paths.cache_dir):
        if directory.exists():
            shutil.rmtree(directory)

    spec_file = paths.spec_dir / f"{DESKTOP_EXECUTABLE_NAME}.spec"
    if spec_file.exists():
        spec_file.unlink()


def main() -> int:
    project_root = Path(__file__).resolve().parents[1]
    paths = build_output_paths(project_root)
    _remove_previous_build(paths)

    try:
        import PyInstaller.__main__
    except ModuleNotFoundError:
        print(
            "缺少 PyInstaller。请先执行 `pip install -r backend/requirements-desktop.txt`。",
            file=sys.stderr,
        )
        return 1

    paths.cache_dir.mkdir(parents=True, exist_ok=True)
    original_environment = os.environ.copy()
    os.environ.update(build_pyinstaller_environment(project_root))

    try:
        PyInstaller.__main__.run(build_pyinstaller_args(project_root))
    finally:
        os.environ.clear()
        os.environ.update(original_environment)

    if not paths.executable_path.exists():
        print(f"后端桌面二进制未生成: {paths.executable_path}", file=sys.stderr)
        return 1

    print(f"后端桌面二进制已生成: {paths.executable_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
