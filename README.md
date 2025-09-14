# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/ac0ab0b8-2267-4aed-b05c-b788fdf5461b

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/ac0ab0b8-2267-4aed-b05c-b788fdf5461b) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/ac0ab0b8-2267-4aed-b05c-b788fdf5461b) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/tips-tricks/custom-domain#step-by-step-guide)

---

## iOS Sync Guide (Capacitor)

This guide explains how to update and run the iOS app after making changes to the web code.

### Prerequisites
- Xcode 15+ and a simulator or device
- Node.js + npm, CocoaPods (`sudo gem install cocoapods`)
- Project root: `whisper-money/`

### First-Time Setup (one-off)
1. Install dependencies and build the web bundle:
   - `npm install`
   - `npm run build`
2. Add the iOS platform (once):
   - `npm run cap:add:ios`
3. Open in Xcode and configure signing:
   - `npx cap open ios`
   - Target “App” → Signing & Capabilities → enable “Automatically manage signing”
   - Choose your Team and set a unique Bundle ID (e.g., `com.yourname.whispermoney`)

### Sync After Code Changes
1. Build the web bundle: `npm run build`
2. Sync to native: `npm run cap:sync`
3. Run on simulator/device: `npm run cap:run:ios`
   - Or open in Xcode: `npx cap open ios` → build/run

### Live Dev (optional)
- Start Vite dev server: `npm run dev`
- Load the dev server in the native shell (no rebuilds): `npm run ios:dev`
  - Uses `CAP_SERVER_URL=http://localhost:5173`

### Script Shortcuts
- `npm run cap:update:ios` – update iOS Capacitor deps
- `npm run ios:build` – build web, sync iOS, run

### Opening in Xcode
- Open the workspace (not the folder or `.xcodeproj`):
  - `whisper-money/ios/App/App.xcworkspace`
  - Or use `npx cap open ios`

### Common Issues
- Blank screen: ensure `dist/` exists → `npm run build` → `npm run cap:sync`
- Code not updating: always `npm run build` then `npm run cap:sync`
- Signing errors: set Team + Bundle ID in Xcode “Signing & Capabilities”
- Missing Pods: `cd ios/App && pod install`, then reopen the workspace
