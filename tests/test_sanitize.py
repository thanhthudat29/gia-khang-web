import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from scripts.process import sanitize_name, normalize_playlist_url, convert_video

def test_sanitize_name():
    assert sanitize_name('Video: Special / Test? * <Name> |') == 'Video Special  Test  Name'
    assert sanitize_name('  Normal Name  ') == 'Normal Name'

def test_normalize_playlist_url():
    url_with_list = "https://www.youtube.com/watch?v=jNQXAC9IVRw&list=PL12345"
    normalized = normalize_playlist_url(url_with_list)
    assert normalized == "https://www.youtube.com/playlist?list=PL12345"

    short_url = "https://www.youtube.com/watch?v=jNQXAC9IVRw"
    assert normalize_playlist_url(short_url) == short_url

def test_convert_short_video():
    short_url = "https://www.youtube.com/watch?v=jNQXAC9IVRw"
    test_dir = Path(__file__).resolve().parent / "temp_test"
    test_dir.mkdir(parents=True, exist_ok=True)
    try:
        out_file = convert_video(short_url, test_dir, prefix="test_")
        assert out_file.exists()
        assert out_file.stat().st_size > 0
        print(f"Test convert OK: {out_file.name} ({out_file.stat().st_size} bytes)")
    finally:
        for f in test_dir.glob("*"):
            f.unlink(missing_ok=True)
        test_dir.rmdir()

if __name__ == "__main__":
    test_sanitize_name()
    test_normalize_playlist_url()
    test_convert_short_video()
    print("ALL TESTS PASSED")
