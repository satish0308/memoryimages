#!/usr/bin/env python3
"""
MyMemoryPics - OS-Level Host Disk Purge Tool for Read-Only Mounts

Safely inspects and permanently deletes files from your physical host hard drive
that were marked for permanent deletion in the MyMemoryPics web interface.
"""

import os
import sys
import argparse
import subprocess
import json
import urllib.parse
from typing import List, Dict, Any

CONTAINER_MOUNT_PREFIX = "/data/originals/all_extracts/"
DEFAULT_HOST_MOUNT_PREFIX = "/media/satish/Data2/all_extracts/"

def format_size(bytes_val: int) -> str:
    """Formats bytes into human readable string."""
    for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
        if bytes_val < 1024.0:
            return f"{bytes_val:3.1f} {unit}"
        bytes_val /= 1024.0
    return f"{bytes_val:.1f} PB"

def fetch_pending_items(container_name: str = "memorypics-backend") -> List[Dict[str, Any]]:
    """Fetches list of pending disk deletions from the backend container."""
    python_code = """
import json
from app.database import SessionLocal
from app.models.media import Media

db = SessionLocal()
items = db.query(Media).filter(Media.pending_disk_deletion == True).all()
res = [
    {
        "id": m.id,
        "filename": m.filename,
        "original_path": m.original_path,
        "file_size": m.file_size or 0,
        "marked_at": m.marked_for_deletion_at.isoformat() if m.marked_for_deletion_at else None
    }
    for m in items
]
db.close()
print(json.dumps(res))
"""
    cmd = ["docker", "exec", container_name, "python3", "-c", python_code]
    try:
        proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True)
        # Find json in stdout
        output = proc.stdout.strip()
        return json.loads(output)
    except subprocess.CalledProcessError as e:
        print(f"Error querying container {container_name}: {e.stderr}", file=sys.stderr)
        return []
    except json.JSONDecodeError as e:
        print(f"Error decoding JSON response from container: {e}\nRaw output: {proc.stdout}", file=sys.stderr)
        return []

def finalize_db_purge(media_ids: List[int], container_name: str = "memorypics-backend") -> Dict[str, Any]:
    """Tells the backend to purge database records, face detections, thumbnails, and embeddings."""
    if not media_ids:
        return {"purged": 0}

    python_code = f"""
import json, os
from app.database import SessionLocal
from app.models.media import Media

db = SessionLocal()
target_ids = {json.dumps(media_ids)}
items = db.query(Media).filter(Media.id.in_(target_ids)).all()
purged_count = 0
for item in items:
    for thumb in [item.thumbnail_256_path, item.thumbnail_1080_path]:
        if thumb and os.path.isfile(thumb):
            try:
                os.remove(thumb)
            except Exception:
                pass
    db.delete(item)
    purged_count += 1
db.commit()
db.close()
print(json.dumps({{"purged": purged_count}}))
"""
    cmd = ["docker", "exec", container_name, "python3", "-c", python_code]
    try:
        proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True)
        return json.loads(proc.stdout.strip())
    except Exception as e:
        print(f"Warning finalizing database records in container: {e}", file=sys.stderr)
        return {"purged": 0}

def main():
    parser = argparse.ArgumentParser(
        description="Permanently delete files marked for deletion on read-only host mounts."
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Preview files that would be deleted without removing them from disk."
    )
    parser.add_argument(
        "-y", "--yes", action="store_true",
        help="Execute deletion immediately without interactive confirmation."
    )
    parser.add_argument(
        "--google-photos", "--gp", action="store_true",
        help="Display optimized Google Photos search queries and links to easily delete these in cloud."
    )
    parser.add_argument(
        "--save-query", type=str, default=None,
        help="Save Google Photos search query or filenames list to specified file path."
    )
    parser.add_argument(
        "--host-prefix", default=DEFAULT_HOST_MOUNT_PREFIX,
        help=f"Host filesystem path mapping for {CONTAINER_MOUNT_PREFIX} (default: {DEFAULT_HOST_MOUNT_PREFIX})"
    )
    parser.add_argument(
        "--container", default="memorypics-backend",
        help="Docker container name for backend API (default: memorypics-backend)"
    )

    args = parser.parse_args()

    print("=================================================================")
    print("  MyMemoryPics - Host OS Permanent Deletion Manager")
    print("=================================================================\n")

    print(f"🔍 Fetching items marked for permanent deletion from {args.container}...")
    pending = fetch_pending_items(args.container)

    if not pending:
        print("✅ No files are currently marked for permanent deletion. Everything is clean!\n")
        return

    print(f"📋 Found {len(pending)} file(s) marked for permanent deletion:\n")

    total_bytes = 0
    valid_files_to_delete = []

    for idx, item in enumerate(pending, 1):
        container_path = item.get("original_path") or ""
        # Translate path
        if container_path.startswith(CONTAINER_MOUNT_PREFIX):
            rel = container_path[len(CONTAINER_MOUNT_PREFIX):]
            host_path = os.path.join(args.host_prefix, rel)
        else:
            host_path = container_path

        size = item.get("file_size", 0)
        total_bytes += size
        file_exists = os.path.isfile(host_path)

        exists_label = "✅ Found on host" if file_exists else "⚠️ Not found on host"
        print(f"  [{idx}] {item['filename']} ({format_size(size)})")
        print(f"      Host Path : {host_path} [{exists_label}]")
        if item.get("marked_at"):
            print(f"      Marked At : {item['marked_at']}")

        if file_exists:
            valid_files_to_delete.append((item["id"], host_path, size))
        else:
            # File is already gone on host; record can still be purged from DB
            valid_files_to_delete.append((item["id"], None, size))

    print(f"\n📊 Total Space to Reclaim: {format_size(total_bytes)}")
    print(f"   Files on Disk to Delete: {sum(1 for _, p, _ in valid_files_to_delete if p is not None)}")
    print(f"   Stale DB Records to Clean: {sum(1 for _, p, _ in valid_files_to_delete if p is None)}")

    filenames = [item["filename"] for item in pending if item.get("filename")]
    if args.google_photos or args.save_query:
        print("\n=================================================================")
        print("  Google Photos Search Queries (For Cloud Deletion)")
        print("=================================================================")
        batch_size = 15
        query_lines = []
        for i in range(0, len(filenames), batch_size):
            chunk = filenames[i:i + batch_size]
            formatted_chunk = [f'"{fn}"' if any(c in fn for c in ' -()[]+') else fn for fn in chunk]
            b_query = " OR ".join(formatted_chunk)
            query_lines.append(b_query)
            encoded = urllib.parse.quote(b_query)
            print(f"\n[Batch {i // batch_size + 1}] ({len(chunk)} files):")
            print(f"Query : {b_query}")
            print(f"URL   : https://photos.google.com/search/{encoded}")

        if args.save_query:
            try:
                with open(args.save_query, "w", encoding="utf-8") as f:
                    f.write("\n\n".join(query_lines))
                print(f"\n💾 Saved Google Photos query to: {args.save_query}")
            except Exception as e:
                print(f"\n✗ Error saving query file: {e}", file=sys.stderr)

        if not args.yes and not args.dry_run:
            print("\nTip: In Google Photos web, select matches and press 'Shift + #' to trash.")

    if args.dry_run:
        print("\n🔎 Dry-run mode enabled: No files were touched or deleted.")
        return

    if not args.yes:
        print("\n⚠️  WARNING: This will PERMANENTLY remove the files from your physical hard drive.")
        print("   This action CANNOT be undone.")
        confirm = input("\nProceed with permanent deletion? [y/N]: ").strip().lower()
        if confirm not in ['y', 'yes']:
            print("❌ Operation cancelled by user.")
            return

    print("\n🗑️  Executing physical file deletion on host...")
    deleted_ids = []
    reclaimed_bytes = 0

    for m_id, host_path, size in valid_files_to_delete:
        if host_path and os.path.isfile(host_path):
            try:
                os.remove(host_path)
                deleted_ids.append(m_id)
                reclaimed_bytes += size
                print(f"  ✓ Deleted: {host_path}")
            except Exception as e:
                print(f"  ✗ Failed to delete {host_path}: {e}", file=sys.stderr)
        else:
            deleted_ids.append(m_id)
            print(f"  ✓ Cleaned stale record: {m_id}")

    print(f"\n🔄 Updating MyMemoryPics database and clearing AI embeddings...")
    res = finalize_db_purge(deleted_ids, args.container)

    print("\n=================================================================")
    print(f"✅ Success! Permanently purged {res.get('purged', len(deleted_ids))} records from database.")
    print(f"💾 Total physical disk space reclaimed: {format_size(reclaimed_bytes)}")
    print("=================================================================\n")

if __name__ == "__main__":
    main()
