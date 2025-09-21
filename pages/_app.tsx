import type { AppProps } from "next/app";
import "../styles/globals.css";

// pages/_app.tsx
<Head>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{SITE_NAME}</title>
  <link rel="icon" type="image/png" href="/favicon.png" />
</Head>


export default function MyApp({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}
