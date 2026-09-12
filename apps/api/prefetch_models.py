"""Prefetch Hugging Face weights for the active profile (used in Docker build)."""

from __future__ import annotations

from engine.config import MODEL_CACHE, MODEL_IDS, settings

MODEL_CACHE.mkdir(parents=True, exist_ok=True)

from huggingface_hub import snapshot_download  # noqa: E402

repos: list[str] = []
if settings.enable_silverguard:
    repos.append(MODEL_IDS["silverguard"])
if settings.enable_ast:
    repos.append(MODEL_IDS["ast"])
if settings.enable_w2v2:
    repos.append(MODEL_IDS["w2v2"])

print(f"profile={settings.profile} prefetching {repos}")
for repo in repos:
    snapshot_download(repo_id=repo, cache_dir=str(MODEL_CACHE))
    print(f"  ok {repo}")
print("prefetch complete")
