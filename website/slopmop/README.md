# Slop Mop - Website

This is where users can find install instructions, FAQs, user settings, etc.

Made with Next.js, unit testing implemented with Jest

## Environment setup

The report/admin API routes use Firebase Admin SDK and require server credentials.

Configure one of these options in `.env.local`:

1. `FIREBASE_SERVICE_ACCOUNT_KEY` as full service-account JSON (single line)
2. Split credentials:
   - `FIREBASE_PROJECT_ID`
   - `FIREBASE_CLIENT_EMAIL`
   - `FIREBASE_PRIVATE_KEY` (keep `\\n` escaped in the env value)

If neither is set, Firebase Admin falls back to Application Default Credentials,
which usually requires `GOOGLE_APPLICATION_CREDENTIALS` locally.

Report email frequency is server-controlled and managed in the admin portal.
`REPORT_NOTIFICATION_INTERVAL` is only used as a fallback default before an
admin-saved value exists in Firestore (`immediate`, `daily`, or `weekly`).
End users cannot override this value.

Run locally with:

```bash
npm run dev
```

Run tests with:

```bash
npm run test
npm run test:watch
npm run test:coverage
```
