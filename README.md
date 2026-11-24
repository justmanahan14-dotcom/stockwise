# Stockwise

Stockwise is a small-shop inventory manager. Users create an account to manage
their own private inventory, track stock changes, and see reorder warnings.

## Set up Firebase for the first time

### 1. Create a Firebase project

1. Open the [Firebase Console](https://console.firebase.google.com/) and sign in
   with your Google account.
2. Select **Add project**, give it a name such as `stockwise`, and finish the
   guided setup. Analytics is optional for this app.
3. Open **Project settings** (the gear beside Project Overview). In **General**,
   under **Your apps**, select the web icon (`</>`) to register a web app. Give
   it a nickname such as `Stockwise Web`. You do not need to set up Firebase
   Hosting because the frontend will be hosted on Vercel.
4. Firebase will show a web app configuration object. Keep this page open; you
   will copy four values from it in step 5. This browser configuration is meant
   to be public. Firestore Security Rules, not a secret key, protect user data.

### 2. Turn on email/password accounts

1. In Firebase, open **Build → Authentication** and select **Get started**.
2. In **Sign-in method**, select **Email/Password**, enable it, and save.
3. This starter app includes password-reset emails but does not yet verify
   addresses during signup. Leave any email-verification requirement off until
   that flow is added and tested.

### 3. Create the Firestore database and install its security rules

1. Open **Build → Firestore Database** and select **Create database**.
2. Choose a location near your users. Database location is difficult to change
   later.
3. Create the database in **Production mode**, not Test mode.
4. In the database's **Rules** tab, replace the editor contents with the full
   [`firestore.rules`](./firestore.rules) file and select **Publish**. These
   rules require a signed-in user and stop one user from reading another user's
   products. They also require stock and its history entry to change together.
5. In **Indexes**, create the composite index shown in
   [`firestore.indexes.json`](./firestore.indexes.json), or let Firebase create
   it for you the first time you load stock history. Index building can take a
   few minutes.

Do **not** leave Firestore in Test mode. Its temporary open rules can allow
anyone to read or change the database.

### 4. Install the app dependencies

Install [Node.js 20.19 or newer](https://nodejs.org/), open a terminal in the
repository, then run:

```sh
npm.cmd install
```

### 5. Connect your local app to the Firebase web app

Copy `.env.example` to a new file named `.env.local` in the repository root.
Fill these values using the Firebase web app configuration from step 1:

| Environment variable | Firebase config value |
| --- | --- |
| `VITE_FIREBASE_API_KEY` | `apiKey` |
| `VITE_FIREBASE_AUTH_DOMAIN` | `authDomain` |
| `VITE_FIREBASE_PROJECT_ID` | `projectId` |
| `VITE_FIREBASE_APP_ID` | `appId` |

For example, if Firebase shows `projectId: "stockwise-abc12"`, set
`VITE_FIREBASE_PROJECT_ID=stockwise-abc12`. Use your own project values; do not
copy the example values from `.env.example`.

Then start the site:

```sh
npm.cmd run dev
```

Open the local address Vite prints. Select **Sign in → Create an account**, make
a test account with your name, and add a test product. Your name is stored in
the Firebase Authentication profile and used for your dashboard greeting.
Open the same site in a private browser window and create a second account; it
should not see the first account's products. In the first account, try changing
stock and check that the activity appears. This confirms each account has its
own Firebase inventory.

Without `.env.local`, Stockwise shows the landing page. Sign-in and account
creation stay unavailable until Firebase is configured.

## Deploy the security rules and indexes

The website is hosted on Vercel, but Firebase still needs to receive the rules
and index configuration. Install and sign in to the Firebase command-line tool:

```sh
npx.cmd firebase-tools login
npx.cmd firebase-tools use --add
```

When prompted, choose the Firebase project you created. Then publish its rules
and indexes:

```sh
npx.cmd firebase-tools deploy --only firestore:rules,firestore:indexes
```

Alternatively, paste `firestore.rules` into the Firebase Console's Firestore
**Rules** tab and publish it there.

## Deploy the website to Vercel

1. Push the repository to GitHub and import it in Vercel.
2. In Vercel **Project Settings → Environment Variables**, add the same four
   values from `.env.local`, for **Production**, **Preview**, and **Development**
   as needed.
3. Deploy or redeploy the project. Vite embeds `VITE_` variables at build time,
   so changing a value requires a new deployment.
4. In Firebase **Authentication → Settings → Authorized domains**, add your
   Vercel production domain (and any custom domain). Firebase's default
   `localhost` entry is used for local development.

Never put a Firebase service-account JSON file or private server credential in
the frontend or a `VITE_` variable. The four web app configuration values are
used by the browser; Firestore Security Rules and Firebase Authentication
restrict access.

## How the app saves stock safely

Signed-in products are stored in the `products` collection and stock history in
`stockChanges`, with an `ownerId` on each record. The app always filters reads
by the current user's ID; Firestore rules also enforce that ownership.

Stock changes are written as one atomic Firestore transaction. The rules require
the corresponding product and stock-history change together and make history
records immutable. This prevents a client from silently changing the stock
quantity without recording why.

## Screenshots

![Stockwise desktop dashboard](./dashboard.png)

![Stockwise mobile dashboard](./dashboard-mobile.png)
