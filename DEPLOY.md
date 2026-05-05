# Deploying Field Companion to GitHub Pages (Free, Forever)

## One-time setup (~5 minutes)

### 1. Create a GitHub account
Go to https://github.com and sign up (free).

### 2. Create a new repository
- Click the **+** button → "New repository"
- Name it: `field-companion`
- Set it to **Public**
- Click "Create repository"

### 3. Upload files
Click "uploading an existing file" on the repo page and drag all these files:
```
index.html
manifest.json
sw.js
css/style.css
js/db.js
js/app.js
icons/icon-192.png
icons/icon-512.png
```
Make sure to keep the folder structure (`css/`, `js/`, `icons/`).

### 4. Enable GitHub Pages
- Go to your repo → **Settings** → **Pages** (left sidebar)
- Under "Source", select **Deploy from a branch**
- Branch: **main** / folder: **/ (root)**
- Click **Save**

### 5. Your app is live at:
```
https://YOUR_USERNAME.github.io/field-companion/
```
It will be ready in ~1 minute.

## Installing on your phone

### Android:
1. Open the URL in Chrome
2. Tap the three-dot menu → "Add to Home screen"
3. Done — it opens like a native app

### iOS:
1. Open the URL in Safari
2. Tap the Share button (box with arrow)
3. Tap "Add to Home Screen"
4. Done

## Updating the app in the future
Just edit files on GitHub.com directly (click the file → pencil icon → commit).
Changes go live automatically within 1-2 minutes.

## Your data
All entries are stored on YOUR device in IndexedDB.
No server. No account. No expiry. No one can see your data.
Use "Export CSV" in the Stats tab to backup your data anytime.
