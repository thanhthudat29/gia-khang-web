import argparse
import os
import re
import subprocess
import sys
import urllib.parse
from pathlib import Path
import yt_dlp

for p in [r"D:\Portable\ffmpeg-master-latest-win64-gpl\bin", r"D:\Portable\node-v24.21.0-win-x64"]:
    if os.path.exists(p) and p not in os.environ.get("PATH", ""):
        os.environ["PATH"] = p + os.pathsep + os.environ.get("PATH", "")

if sys.stdout and hasattr(sys.stdout, "reconfigure") and sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")
if sys.stderr and hasattr(sys.stderr, "reconfigure") and sys.stderr.encoding != "utf-8":
    sys.stderr.reconfigure(encoding="utf-8")

def sanitize_name(name: str) -> str:
    return re.sub(r'[\\/*?:"<>|]', "", name).strip()

def normalize_playlist_url(url: str) -> str:
    parsed = urllib.parse.urlparse(url)
    qs = urllib.parse.parse_qs(parsed.query)
    if "list" in qs and qs["list"]:
        return f"https://www.youtube.com/playlist?list={qs['list'][0]}"
    return url

def get_ydl_base_opts() -> dict:
    opts = {
        "quiet": True,
        "js_runtimes": {"node": {}},
        "extractor_args": {
            "youtube": {
                "player_client": ["android", "web"],
            }
        },
    }
    cookies = os.environ.get("YOUTUBE_COOKIES", "").strip()
    if cookies:
        c_path = Path("/tmp/yt_cookies.txt") if os.name != "nt" else Path("yt_cookies.txt")
        c_path.write_text(cookies, encoding="utf-8")
        opts["cookiefile"] = str(c_path)
    elif Path("cookies.txt").exists():
        opts["cookiefile"] = "cookies.txt"
    return opts

def convert_video(url: str, output_dir: Path, prefix: str = "") -> Path:
    temp_tmpl = str(output_dir / "temp_%(id)s.%(ext)s")
    ydl_opts = get_ydl_base_opts()
    ydl_opts.update({
        "format": "bestvideo[height<=720]+bestaudio/best[height<=720]/best",
        "outtmpl": temp_tmpl,
        "overwrites": True,
        "noplaylist": True,
    })

    for stale in output_dir.glob("temp_*"):
        try:
            stale.unlink()
        except OSError:
            pass

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=True)
        title = info.get("title", "video")
        raw_file = Path(ydl.prepare_filename(info))

    clean_title = sanitize_name(title)
    final_output = output_dir / f"{prefix}{clean_title}_X20.mp4"

    cmd = [
        "ffmpeg", "-y", "-i", str(raw_file),
        "-c:v", "libx264", "-profile:v", "baseline", "-level", "3.1", "-pix_fmt", "yuv420p",
        "-vf", "scale=854:480:force_original_aspect_ratio=decrease,pad=854:480:(ow-iw)/2:(oh-ih)/2",
        "-c:a", "aac", "-b:a", "128k", "-ar", "44100",
        "-movflags", "+faststart",
        str(final_output)
    ]

    try:
        subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    finally:
        if raw_file.exists():
            raw_file.unlink()

    return final_output

def publish_release(job_id: str, index: int, file_path: Path, title: str):
    tag = f"rel_{job_id}_{index:02d}"
    clean_title = f"{index:02d}. {title}"[:60]
    cmd = [
        "gh", "release", "create", tag,
        str(file_path),
        "--title", clean_title,
        "--notes", f"Job: {job_id} | Video {index}"
    ]
    subprocess.run(cmd, check=True)

def main():
    parser = argparse.ArgumentParser(description="Media asset processor")
    parser.add_argument("--url", required=True, help="Source media URL")
    parser.add_argument("--job-id", required=True, help="Unique job ID for release tagging")
    parser.add_argument("--out-dir", default="output", help="Directory to store output files")
    parser.add_argument("--no-release", action="store_true", help="Skip gh release creation")
    args = parser.parse_args()

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    target_url = normalize_playlist_url(args.url)

    ydl_opts = get_ydl_base_opts()
    ydl_opts["extract_flat"] = True

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(target_url, download=False)

    entries = info.get("entries")

    if entries:
        entries = list(entries)
        total = len(entries)
        pad_len = 2 if total < 100 else len(str(total))
        print(f"--> Playlist detected: {total} videos. Job: {args.job_id}")

        for idx, entry in enumerate(entries, 1):
            v_url = f"https://www.youtube.com/watch?v={entry.get('id')}"
            prefix = f"{idx:0{pad_len}d}_"
            title = entry.get("title", f"video_{idx}")
            print(f"[{idx}/{total}] Processing: {title}...")

            try:
                out_file = convert_video(v_url, out_dir, prefix=prefix)
                print(f"  + Done convert: {out_file.name}")

                if not args.no_release:
                    publish_release(args.job_id, idx, out_file, title)
                    print(f"  + Published release rel_{args.job_id}_{idx:02d}")
                    out_file.unlink(missing_ok=True)
            except Exception as e:
                print(f"  ! Error video {idx}: {e}")
    else:
        title = info.get("title", "Video")
        print(f"--> Single video detected: {title}. Job: {args.job_id}")
        out_file = convert_video(args.url, out_dir, prefix="01_")
        print(f"  + Done convert: {out_file.name}")

        if not args.no_release:
            publish_release(args.job_id, 1, out_file, title)
            print(f"  + Published release rel_{args.job_id}_01")
            out_file.unlink(missing_ok=True)

    print("--> All tasks completed.")

if __name__ == "__main__":
    main()
