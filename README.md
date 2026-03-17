# Ultraphonics Live Hub

Desktop app for the main laptop. Connects to AbleSet and serves live song charts to band members on tablets over WiFi.

## Installing

1. Download the `.dmg` from [Releases](https://github.com/keepitultra/ultraphonics-web/releases)
2. Open the `.dmg` and drag the app to Applications
3. Run this in Terminal to bypass macOS security:
   ```bash
   xattr -cr "/Applications/Ultraphonics Live Hub.app"
   ```
4. Open the app, click the settings gear, and enter your AbleSet URL (e.g. `http://192.168.1.243:39051`)
5. Share the Live Charts URL shown on the dashboard with band members — they can bookmark it on their tablets

> Make sure the laptop and tablets are on the same WiFi network. The app uses ports 3000 (HTTP) and 8080 (WebSocket).

---

## Development

```bash
yarn install
yarn build              # Build all JS bundles into dist/
yarn start:electron     # Run Electron app locally
yarn build:electron:mac # Build macOS installer
yarn deploy             # Build and deploy web app to Firebase
```

### Releasing

Push a version tag to trigger a GitHub Actions build and create a release:

```bash
git tag v0.1.0
git push origin v0.1.0
```

### Web Scripts

```bash
yarn build             # Bundle all src/ JS into dist/ (minified)
yarn build:dev         # Bundle with sourcemaps, no minification
yarn serve             # Build and serve locally via Firebase emulator (localhost:5002)
yarn preview           # Build and deploy to a Firebase preview channel
yarn deploy            # Build and deploy hosting to production
yarn deploy:rules      # Deploy Firestore security rules only
```

### Other Scripts

```bash
yarn build:icons       # Generate Electron app icons
yarn kill-ports        # Kill processes on ports 3000/8080/39052
yarn migrate           # Run Firestore migrations
```

---

## 📝 License

MIT
