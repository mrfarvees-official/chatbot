import type { Metadata } from "next";
import Link from "next/link";
import release from "../../public/downloads/site-agent.json";
import { SavedTheme } from "./saved-theme";

export const metadata: Metadata = {
  title: "Install Site Agent | Chatbot",
  description: "Download Site Agent and follow the steps to install it in Chrome, Edge, or Opera GX.",
};

const browsers = [
  { name: "Google Chrome", address: "chrome://extensions" },
  { name: "Microsoft Edge", address: "edge://extensions" },
  { name: "Opera / Opera GX", address: "opera://extensions" },
];

export default function ExtensionPage() {
  return (
    <main className="chatbot-shell min-h-screen px-5 py-10 sm:py-16">
      <SavedTheme />
      <div className="mx-auto max-w-3xl space-y-8">
        <Link href="/" className="chatbot-muted inline-flex text-sm underline underline-offset-4">← Back to Chatbot</Link>
        <header className="space-y-4">
          <p className="chatbot-muted text-xs uppercase tracking-[0.18em]">Browser extension · v{release.version}</p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Let Chatbot act in your browser</h1>
          <p className="chatbot-muted max-w-2xl leading-7">Site Agent connects Chatbot to Gmail, Google Calendar, and Google Meet in your browser. Download the ZIP, extract it, and load the folder using your browser’s Developer mode.</p>
          <a href={`/downloads/${release.file}`} download className="inline-flex items-center gap-3 rounded-xl bg-[#2563eb] px-5 py-3 font-medium text-white transition hover:bg-[#1d4ed8] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-500">
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" /></svg>
            Download Site Agent ZIP <span className="text-xs text-blue-100">{Math.ceil(release.sizeBytes / 1024)} KB</span>
          </a>
          <p className="chatbot-subtle text-sm">For desktop Chrome, Edge, and Opera GX. No build tools needed.</p>
        </header>

        <section className="chatbot-surface rounded-2xl border p-5 sm:p-7" aria-labelledby="install-steps">
          <h2 id="install-steps" className="mb-6 text-xl font-semibold">Install step by step</h2>
          <ol className="list-decimal space-y-6 pl-5 marker:font-semibold marker:text-[var(--chatbot-muted)]">
            <li className="pl-2"><h3 className="font-medium">Download and extract the ZIP</h3><p className="chatbot-muted mt-1 leading-6">Save the download, then use Extract All on Windows or open it on macOS. Keep the extracted folder somewhere permanent, such as Documents/Site Agent. The folder you select later must contain <code>manifest.json</code>.</p></li>
            <li className="pl-2"><h3 className="font-medium">Open your browser’s Extensions page</h3><p className="chatbot-muted mt-1 leading-6">Copy the address for your browser below into its address bar and press Enter.</p>
              <dl className="mt-3 space-y-2">{browsers.map((browser) => <div key={browser.name} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--chatbot-border)] px-3 py-2 text-sm"><dt>{browser.name}</dt><dd><code className="select-all text-[var(--chatbot-text-soft)]">{browser.address}</code></dd></div>)}</dl>
            </li>
            <li className="pl-2"><h3 className="font-medium">Turn on Developer mode</h3><p className="chatbot-muted mt-1 leading-6">Enable the Developer mode toggle on the Extensions page.</p></li>
            <li className="pl-2"><h3 className="font-medium">Choose Load unpacked</h3><p className="chatbot-muted mt-1 leading-6">Click Load unpacked (or Load unpacked extension in Opera), then select the extracted folder containing <code>manifest.json</code>. Select the folder, not the ZIP.</p></li>
            <li className="pl-2"><h3 className="font-medium">Check the installed extension</h3><p className="chatbot-muted mt-1 leading-6">Look for Site Agent v{release.version} and make sure it is enabled. You can pin its blue shield icon from the browser’s Extensions menu for quick access.</p></li>
            <li className="pl-2"><h3 className="font-medium">Return to Chatbot and refresh</h3><p className="chatbot-muted mt-1 leading-6">Open Chatbot in the same browser and browser profile. Refresh the page and look under Browser access in the sidebar for Extension connected · v{release.version}. Sign in to use browser tools.</p></li>
            <li className="pl-2"><h3 className="font-medium">Try a browser action</h3><p className="chatbot-muted mt-1 leading-6">Keep Gmail signed in and ask Chatbot to create an email draft with your recipient and message. Allow site access when the extension asks. Drafting does not send the email; asking Chatbot to send opens a separate approval popup for review.</p></li>
          </ol>
        </section>

        <section className="space-y-3" aria-labelledby="update-extension">
          <h2 id="update-extension" className="text-xl font-semibold">Updating or reconnecting</h2>
          <p className="chatbot-muted leading-7">To update, extract the latest ZIP over your existing Site Agent folder, then click Reload on the extension’s card. Refresh Chatbot and any open Gmail, Calendar, or Meet tabs. If it still shows as disconnected, check that Site Agent is enabled in the same browser profile.</p>
          <p className="chatbot-muted leading-7">Site Agent connects to this Chatbot at chatbot.farvees.xyz and localhost development addresses. It is a Chromium extension; Firefox and Safari are not supported by this package.</p>
          <p className="chatbot-muted text-sm">Official installation help: <a className="underline" href="https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked" target="_blank" rel="noreferrer">Chrome</a> · <a className="underline" href="https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/getting-started/extension-sideloading" target="_blank" rel="noreferrer">Edge</a> · <a className="underline" href="https://help.opera.com/en/extensions/testing/" target="_blank" rel="noreferrer">Opera</a></p>
        </section>
        <footer className="chatbot-subtle border-t border-[var(--chatbot-border)] pt-5 text-xs">
          <details><summary className="cursor-pointer">Download integrity (SHA-256)</summary><code className="mt-3 block break-all">{release.sha256}</code></details>
        </footer>
      </div>
    </main>
  );
}
