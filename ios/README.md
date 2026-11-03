# MindLyte for iPhone and iPad

A SwiftUI app around the MindLyte web app, with native extras:

- **Background audio and lock-screen controls**: sessions keep playing with the screen locked; play, pause and end from the lock screen or Control Centre.
- **Daily reminder**: a local notification at the time you choose.
- **Apple Health**: each session of a minute or more saved as mindful minutes.
- **Native settings**: open with "App settings" in the menu.

## Run it

```sh
brew install xcodegen      # once
cd ios
xcodegen                   # creates MindLyte.xcodeproj
open MindLyte.xcodeproj
```

In Xcode: select the MindLyte target, **Signing & Capabilities**, choose your Team. Then pick an iPhone simulator and press Run.

Re-run `xcodegen` after pulling changes that add or remove files.

## Notes

- Immersive (WebXR) mode isn't available inside iOS apps, so the app shows the standard view; the headset buttons are hidden.
- Apple Health can't be tested in every simulator; use a real iPhone for that.
- Safari > Develop > Simulator lets you inspect the web page inside the app.
