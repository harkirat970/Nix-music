# yt-dlp cookies

Put your Netscape-format cookie export here as **cookies.txt**:

```text
cookies/cookies.txt
```

Before each download, Nix Music looks for `cookies.txt`, then `www.youtube.com_cookies.txt`, then `music.youtube.com_cookies.txt`. A single differently named `.txt` export also works. With several other exports, select one using `YT_DLP_COOKIES_FILE`. An empty folder allows anonymous playback. Replacing the export takes effect on the next download.

You may set `YT_DLP_COOKIES_FILE` in `.env` to use a different file. An explicitly configured missing or invalid file produces an error rather than silently running unauthenticated.

The original export is never modified. Each extraction gets a private temporary copy, which is removed when the request finishes. Docker Compose mounts this folder read-only. Cached audio does not need a new extraction.

Cookie files can grant access to your account. Keep them local; do not upload them to chats, commit them, or share them. Use only cookies from an account you control. Cookies are used only by yt-dlp audio extraction, not by the metadata/lyrics provider. They do not guarantee access to unavailable tracks.
