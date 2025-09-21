// pages/_app.tsx
import type { AppProps } from "next/app";
import Head from "next/head";
import "../styles/globals.css";
import { SITE_NAME } from "../utils/constants";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{SITE_NAME}</title>

        {/* Favicon (single PNG) */}
        <link rel="icon" type="image/png" href="/favicon.png" />

        {/* Optional extras:
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        */}
      </Head>
      <Component {...pageProps} />
    </>
  );
}
