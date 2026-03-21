from pathlib import Path

from build_desktop import DESKTOP_EXECUTABLE_NAME
from build_desktop import normalize_target_arch
from build_desktop import build_pyinstaller_environment
from build_desktop import build_output_paths
from build_desktop import build_pyinstaller_args


def test_build_output_paths_match_desktop_bundle_layout():
    project_root = Path("/tmp/household-balance-sheet")

    paths = build_output_paths(project_root, "arm64")

    assert paths.entry_script == project_root / "backend" / "desktop_server.py"
    assert paths.dist_dir == project_root / "backend" / "dist-desktop" / "arm64"
    assert paths.work_dir == project_root / "backend" / "build-desktop" / "arm64"
    assert paths.cache_dir == project_root / "backend" / ".pyinstaller" / "arm64"
    assert paths.spec_dir == project_root / "backend"
    assert (
        paths.executable_path
        == paths.dist_dir / DESKTOP_EXECUTABLE_NAME / DESKTOP_EXECUTABLE_NAME
    )


def test_pyinstaller_args_target_onedir_binary_for_desktop_bundle():
    project_root = Path("/tmp/household-balance-sheet")

    args = build_pyinstaller_args(project_root, "x64")

    assert "--onedir" in args
    assert "--onefile" not in args
    assert "--noconfirm" in args
    assert "--clean" in args
    assert "--name" in args
    assert DESKTOP_EXECUTABLE_NAME in args
    assert "--distpath" in args
    assert str(project_root / "backend" / "dist-desktop" / "x64") in args
    assert "--workpath" in args
    assert str(project_root / "backend" / "build-desktop" / "x64") in args
    assert "--paths" in args
    assert str(project_root / "backend") in args
    assert str(project_root / "backend" / "desktop_server.py") == args[-1]


def test_pyinstaller_environment_uses_workspace_local_cache_dir():
    project_root = Path("/tmp/household-balance-sheet")

    env = build_pyinstaller_environment(project_root, "x64")

    assert env["PYINSTALLER_CONFIG_DIR"] == str(
        project_root / "backend" / ".pyinstaller" / "x64"
    )


def test_normalize_target_arch_maps_known_host_values():
    assert normalize_target_arch(None, machine_name="arm64") == "arm64"
    assert normalize_target_arch(None, machine_name="x86_64") == "x64"
    assert normalize_target_arch("amd64", machine_name="arm64") == "x64"
