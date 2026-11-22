"""Expire only generated SQLite snapshots, including prior S3 object versions."""

import json
import re
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlsplit


def expired(name, cutoff):
    match = re.fullmatch(r"world-(\d{8}T\d{6}Z)\.sqlite", name)
    if not match:
        return False
    try:
        timestamp = datetime.strptime(match[1], "%Y%m%dT%H%M%SZ")
    except ValueError:
        return False
    return timestamp.replace(tzinfo=timezone.utc) <= cutoff


def s3_command(operation, *args):
    result = subprocess.run(
        ["aws", "s3api", operation, *args, "--output", "json",
         "--cli-connect-timeout", "10", "--cli-read-timeout", "20"],
        check=True,
        stdout=subprocess.PIPE,
        timeout=45,
    )
    return json.loads(result.stdout)


def prune_s3(uri, cutoff):
    destination = urlsplit(uri)
    if destination.scheme != "s3" or not destination.netloc or not destination.path.strip("/"):
        raise ValueError("Use an S3 backup URI with a bucket and a dedicated prefix")
    prefix = destination.path.strip("/") + "/"
    listing = s3_command(
        "list-object-versions", "--bucket", destination.netloc, "--prefix", prefix + "world-"
    )
    removed = 0
    # Delete older versions before removing their markers. A failed deletion
    # shouldn't make a hidden backup visible again.
    for kind in ("Versions", "DeleteMarkers"):
        objects = [
            {"Key": version["Key"], "VersionId": version["VersionId"]}
            for version in listing.get(kind, [])
            if version["Key"].startswith(prefix) and expired(version["Key"][len(prefix):], cutoff)
        ]
        for offset in range(0, len(objects), 1000):
            response = s3_command(
                "delete-objects", "--bucket", destination.netloc, "--delete",
                json.dumps({"Objects": objects[offset:offset + 1000], "Quiet": True}),
            )
            if response.get("Errors"):
                raise RuntimeError(f"S3 backup cleanup failed: {response['Errors']}")
        removed += len(objects)
    return removed


if __name__ == "__main__":
    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
    local = 0
    for path in Path(sys.argv[1]).iterdir():
        if expired(path.name, cutoff) and path.is_file() and not path.is_symlink():
            path.unlink()
            local += 1
    print(f"Removed {local} expired local snapshots.")
    if sys.argv[2]:
        print(f"Removed {prune_s3(sys.argv[2], cutoff)} expired S3 versions and delete markers.")
