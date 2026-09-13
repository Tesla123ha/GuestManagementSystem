# Guest Management System

A simple website for your mom's birthday party. Guests scan a QR code, type
their name, and wait to be seated. You (the admin) assign each guest a table
from your phone or laptop, and everyone's screen updates instantly, including
a live floor plan.

Your Firebase project (GuestManagementSystem) is already connected in this
code, so you do not need to change anything in `src/firebase.js`.

## 1. Install and run it on your computer

You need [Node.js](https://nodejs.org) installed first (download the LTS
version if you don't have it).

Open a terminal in this folder and run:

```
npm install
npm run dev
```

This will print a local address, usually `http://localhost:5173`. Open that
in your browser to see the site. Opening the homepage now takes you straight
to the admin login. The guest scan page lives at its own address,
`/checkin` (for example `http://localhost:5173/checkin`), which is what
the QR code points to. The other admin pages are at `/dashboard`,
`/guests`, `/tables`, `/checkins`, and `/settings`.

## 2. Turn on the Firestore security rules

Right now your Firestore database is in test mode, which works, but it does
not yet match the rules written for this app. To apply them:

1. Open the file `firestore.rules` in this folder.
2. Go to your [Firebase Console](https://console.firebase.google.com), open
   your project, click **Firestore Database**, then click the **Rules** tab.
3. Copy everything from `firestore.rules` and paste it in, replacing what is
   there.
4. Click **Publish**.

## 3. Put your first tables in

Log in at `/login` with the admin email and password you created in Firebase
Authentication. Go to the **Tables** page and add a table for each table at
the party (table number and how many seats it has). You can do this any
time, even the night before the party.

## 4. Set your party details and get your QR code

Go to **Settings**, fill in the party name, date, and venue, and click
**Save Changes**. Then download the QR code shown on that page. This QR
code points to your website's homepage, which is the scan page guests will
use.

Note: the QR code only works once your site is deployed to a real web
address (see step 5). While testing on your own computer, the link only
works on that same computer.

## 5. Put the website online so guests can scan it

The easiest free option is Firebase Hosting, since you already have a
Firebase project:

```
npm install -g firebase-tools
firebase login
npm run build
firebase init hosting
```

When `firebase init hosting` asks questions, answer:
- Use an existing project → choose `guestmanagementsystem-cd385`
- What do you want to use as your public directory? → type `dist`
- Configure as a single-page app? → type `y` (yes)
- Set up automatic builds with GitHub? → type `n` (no)

Then deploy with:

```
firebase deploy --only hosting
```

It will print a live web address like
`https://guestmanagementsystem-cd385.web.app`. That is your real party site.
Go back to **Settings** on the live site and download the QR code again, now
that it points to the real address, and print it or display it at the entrance.

## How the flow works

- A guest scans the QR code and types their name.
- They see a waiting screen with their place in line.
- You open **Check-Ins**, click their entry, and assign a table and seat.
- Their screen updates automatically to show their table, with a live map
  of the venue and their table highlighted.
- The **Dashboard** gives you a running total of guests and open seats.
- **Guest List** lets you keep a planning list of everyone invited, ahead
  of the party. Paste a full list at once (one name per line, or separated
  by commas), or add, rename, and remove names one at a time.
- **Tables** shows every seat at every table as its own box. Click an open
  seat to fill it, either by choosing someone already checked in, or by
  typing a new name to pre-seat them before the party starts. Click a
  filled seat to remove that guest from it.
- **Guests** and **Check-Ins** let you click anywhere on a row to edit that
  guest, and there's a Delete button on every row to remove someone.

Since the rules and pages changed, if you already published the old
`firestore.rules`, republish the updated version from this project so the
Guest List page works (step 2 above).

