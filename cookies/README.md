# yt-dlp cookies

Put your Netscape-format cookie export here as **cookies.txt**:

```text
cookies/cookies.txt
```

Nix Music detects this file before each audio extraction. If it is absent, yt-dlp runs without cookies. Adding or replacing the file does not require restarting the bot. JSON/browser database exports are not supported.

You may set `YT_DLP_COOKIES_FILE` in `.env` to use a different file. An explicitly configured missing or invalid file produces an error rather than silently running unauthenticated.

The original export is never modified. Each extraction gets a private temporary copy, which is removed when the request finishes. Docker Compose mounts this folder read-only. Cached audio does not need a new extraction.

Cookie files can grant access to your account. Keep them local; do not upload them to chats, commit them, or share them. Use only cookies from an account you control. Cookies are used only by yt-dlp audio extraction, not by the metadata/lyrics provider. They do not guarantee access to unavailable tracks.
