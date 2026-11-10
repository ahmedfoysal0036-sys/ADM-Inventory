# ADM Inventory
Created by: Ahmed Faisal 0036

Materials inventory (Stationery + Grocery): stock, inbound, outbound, monthly register, Excel download. Plain HTML/CSS/JS, hosted on GitHub Pages, data in Firebase Firestore (free plan).

## Test locally
Open `index.html` in a browser. With the default `config.js` it runs in local test mode (October sheet data is loaded, stored only in that browser).

## Go live (shared cloud data, Realtime Database)
1. Firebase Console -> project `adm-inventory` -> Build -> Realtime Database (already created).
2. Build -> Authentication -> Sign-in method -> enable Email/Password, then Users -> Add user.
3. Project settings -> Your apps -> Web (</>) -> copy `apiKey`, `appId` and the `databaseURL` (shown at the top of the Realtime Database page) into `config.js`.
4. Realtime Database -> Rules, paste and publish:
```
{
  "rules": {
    ".read": "auth != null",
    ".write": "auth != null"
  }
}
```
5. Authentication -> Settings -> Authorized domains -> add `YOURNAME.github.io`.
6. Push this folder to GitHub -> Settings -> Pages -> Deploy from branch `main` / root.
7. Open the site, sign in, go to Stock and press "Load items from October sheet" once.
