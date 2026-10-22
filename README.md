This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

Use Node.js **22.23.4 or a newer 22.x release**. The minimum version includes the
[October 21, 2026 security fixes](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases).
With nvm, run `nvm install` and `nvm use` (on nvm-windows, specify `22.23.4`
explicitly). Restart development servers after upgrading Node.js.

The `engines.node` setting declares this requirement; it does not upgrade an
existing Node.js installation. Production hosts must also use a patched runtime.

## Dependency security maintenance

The October 2026 dependency update keeps Next.js on the 15.5 maintenance line.
The scoped `overrides.next.postcss` entry selects a patched PostCSS 8 release
because Next.js 15.5 still pins an older version. Keep this override until the
upstream dependency is patched, and verify changes with `npm ci`, `npm test`,
`npm run lint`, `npx tsc --noEmit`, and `npm run build`.

Run `npm audit --omit=dev` to check runtime dependencies and `npm audit` to
include development tools. The development-only chain
`eslint-config-next -> @next/eslint-plugin-next -> fast-glob -> micromatch -> braces`
is affected by [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
As of October 22, 2026, no patched `braces` release is available. Avoid feeding
untrusted glob patterns to lint tooling and recheck the advisory before updating.
Do not use `npm audit fix --force` to downgrade the Next.js lint configuration to
14.x; keep it aligned with the application's Next.js version.

## Running locally

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
