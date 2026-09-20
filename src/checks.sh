#!/bin/bash

command_exists () {
    command -v "$1" >/dev/null 2>&1
}

validate_repo() {
    local repo_url="$1"
    local attempt
    log "[REPO] Validating repository URL: $repo_url"
    for attempt in 1 2 3; do
        if timeout 30 git ls-remote "$repo_url" &>/dev/null; then
            log "[REPO] Repository URL is valid."
            return 0
        fi
        [ "$attempt" -lt 3 ] && sleep 3
    done
    log "[ERROR] Invalid repository URL - $repo_url"
    return 1
}

validate_zenodo() {
    local record_url="$1"
    local record_id
    local -a headers=(-H "Accept: application/json")

    if [[ ! "$record_url" =~ ^https?://(www\.)?zenodo\.org/records?/([0-9]+)([/?#].*)?$ ]]; then
        log "[ERROR] Invalid Zenodo record URL - $record_url"
        return 1
    fi

    record_id="${BASH_REMATCH[2]}"

    if [ -n "${ZENODO_TOKEN:-}" ]; then
        headers+=(-H "Authorization: Bearer $ZENODO_TOKEN")
    fi

    log "[REPO] Validating Zenodo record: $record_id"
    if curl -fsS \
        --retry 2 \
        --retry-all-errors \
        --retry-delay 1 \
        --connect-timeout 10 \
        --max-time 30 \
        "${headers[@]}" \
        "https://zenodo.org/api/records/$record_id" \
        >/dev/null 2>&1; then
        log "[REPO] Zenodo record is valid."
        return 0
    fi

    log "[ERROR] Zenodo record does not exist or is unreachable - $record_url"
    return 1
}
