# RoomRevive: setup in about 20 minutes (no coding)

## What's in this folder
- `index.html`: the app people see (upload, style, before/after slider)
- `api/redesign.js`: the private part that talks to the AI (keeps your key secret)
- `package.json`, `vercel.json`: settings, leave as they are

## Step 1: Get an AI key
1. Go to https://aistudio.google.com and sign in with a Google account.
2. Click "Get API key" and create one. Copy it somewhere safe.
3. Image models may require billing to be turned on. If you enable billing, set a low
   monthly budget alert in Google Cloud so costs can't surprise you.

## Step 2: Put the files on GitHub
1. Create a free account at https://github.com and click "New repository". Name it `roomrevive`.
2. Click "uploading an existing file", then drag in ALL the unzipped files,
   including the `api` folder. Click "Commit changes".

## Step 3: Publish on Vercel
1. Go to https://vercel.com, sign up with your GitHub account, click "Add New... Project",
   and import `roomrevive`.
2. Before clicking Deploy, open "Environment Variables" and add:
   - `GEMINI_API_KEY` = the key from Step 1
   - `ACCESS_CODE` = a password you choose (share it only with companies you invite)
3. Click Deploy. You'll get a link like `https://roomrevive-abc.vercel.app`. Send it to companies.

## Changing things later
- Edit a file on GitHub (pencil icon) and Vercel republishes automatically.
- To change or add styles, edit the `STYLES` list in `api/redesign.js` and add a matching
  option in `index.html`.
- If the AI model is retired, set an environment variable `GEMINI_MODEL` in Vercel to a
  current image model name from the Google AI Studio model list.
- To remove the access code, delete the `ACCESS_CODE` variable.

## Good to know
- Vercel's free plan is intended for personal, non-commercial use. Plan to upgrade
  (or move hosting) once you start charging customers.
- Every redesign costs a small amount on your AI account. `HOURLY_LIMIT` (default 15
  per visitor) and the access code help control this, but a budget cap on your AI
  account is the real safety net.
- Photos are sent to the AI provider to be processed. Add a privacy policy before
  real customers use it.
