from __future__ import annotations

import argparse
import platform
import shutil
import sys
from dataclasses import dataclass
from pathlib import Path
import os

DESKTOP_EXECUTABLE_NAME = "hbs-backend"
ARCH_ALIASES = {
    "arm64": "arm64",
    "aarch64": "arm64",
    "x64": "x64",
    "x86_64": "x64",
    "amd64": "x64",
}


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


def normalize_target_arch(
    target_arch: str | None, machine_name: str | None = None
) -> str:
    raw_value = (target_arch or machine_name or platform.machine()).lower()

    if raw_value in ARCH_ALIASES:
        return ARCH_ALIASES[raw_value]

    raise ValueError(
        f"不支持的桌面目标架构: {raw_value}，仅支持 arm64 / x64。"
    )


def build_output_paths(project_root: Path, target_arch: str) -> DesktopBuildPaths:
    backend_dir = project_root / "backend"
    normalized_arch = normalize_target_arch(target_arch)
    dist_dir = backend_dir / "dist-desktop" / normalized_arch
    bundle_dir = dist_dir / DESKTOP_EXECUTABLE_NAME
    return DesktopBuildPaths(
        entry_script=backend_dir / "desktop_server.py",
        dist_dir=dist_dir,
        work_dir=backend_dir / "build-desktop" / normalized_arch,
        cache_dir=backend_dir / ".pyinstaller" / normalized_arch,
        spec_dir=backend_dir,
        bundle_dir=bundle_dir,
        executable_path=bundle_dir / build_executable_filename(),
    )


def build_pyinstaller_args(project_root: Path, target_arch: str) -> list[str]:
    paths = build_output_paths(project_root, target_arch)
    backend_dir = project_root / "backend"
    args = [
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
        str(backend_dir),
        "--hidden-import",
        "orjson",
        "--add-data",
        f"{backend_dir / 'db_migrations'}:db_migrations",
        "--add-data",
        f"{backend_dir / 'alembic.ini'}:.",
    ]
    # 排除不会在 sidecar 运行时用到的模块，缩 PyInstaller bundle 体积。
    # 排错原则：每条都必须经过验证 backend 主路径不依赖：
    #   - watchfiles：uvicorn[standard] 默认拉，仅 reload 模式用
    #   - tkinter / unittest / test：标准库巨大模块，sidecar 不用
    #   - pytest 套件：仅测试时用，运行时不需要
    #   - setuptools / pkg_resources：少数库会 fall back 引用,PyInstaller 处理后多余
    #   - numpy：CLAUDE.md 约束 analytics 不引入 numpy，少数依赖 fall back 引用
    #   - distutils / lib2to3 / pydoc_data：废弃或仅供 2→3 转译/文档查看用
    #   - wheel / pip：构建/装包工具，运行期不需要
    #   - PIL.ImageTk：Pillow 的 tkinter 桥接,sidecar 无 GUI
    #   - multiprocessing.tests / xml.dom.minidom.tests：标准库自测套件
    excludes = [
        "watchfiles",
        "tkinter",
        "unittest",
        "test",
        "pytest",
        "_pytest",
        "setuptools",
        "numpy",
        "distutils",
        "lib2to3",
        "pydoc_data",
        "wheel",
        "pip",
        "PIL.ImageTk",
        "multiprocessing.tests",
        "xml.dom.minidom.tests",
    ]
    for module in excludes:
        args.extend(["--exclude-module", module])
    args.append(str(paths.entry_script))
    return args


def build_pyinstaller_environment(
    project_root: Path, target_arch: str
) -> dict[str, str]:
    paths = build_output_paths(project_root, target_arch)
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


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--arch", default=None)
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)

    try:
        target_arch = normalize_target_arch(args.arch)
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    project_root = Path(__file__).resolve().parents[1]
    paths = build_output_paths(project_root, target_arch)
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
    os.environ.update(build_pyinstaller_environment(project_root, target_arch))

    try:
        PyInstaller.__main__.run(build_pyinstaller_args(project_root, target_arch))
    finally:
        os.environ.clear()
        os.environ.update(original_environment)

    if not paths.executable_path.exists():
        print(f"后端桌面二进制未生成: {paths.executable_path}", file=sys.stderr)
        return 1

    print(f"后端桌面二进制已生成 ({target_arch}): {paths.executable_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
