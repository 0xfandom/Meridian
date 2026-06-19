import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  Rocket,
  Boxes,
  Code as CodeIcon,
  ShieldAlert,
} from "lucide-react";
import { DocsSidebar } from "@/components/docs-sidebar";

const POPULAR = [
  {
    Icon: Rocket,
    eyebrow: "Getting Started",
    title: "Quickstart",
    desc: "Connect a Margin Account and read its health in a few lines.",
    href: "#quickstart",
  },
  {
    Icon: Boxes,
    eyebrow: "Protocol",
    title: "Architecture",
    desc: "Capital, risk, and execution as independent, custody-safe layers.",
    href: "#architecture",
  },
  {
    Icon: CodeIcon,
    eyebrow: "Developers",
    title: "TypeScript SDK",
    desc: "Accounts, credit lines, and risk reads in one package.",
    href: "#sdk",
  },
  {
    Icon: ShieldAlert,
    eyebrow: "Risk",
    title: "Risk Parameters",
    desc: "Per-asset LTVs, liquidation thresholds, penalties, and caps.",
    href: "#risk-parameters",
  },
];

const QUICK_LINKS = [
  { label: "Quickstart", href: "#quickstart" },
  { label: "SDK", href: "#sdk" },
  { label: "API", href: "#api" },
  { label: "Risk", href: "#risk-parameters" },
];

export const metadata = {
  title: "Meridian — Documentation",
  description:
    "Protocol documentation for Meridian, the non-custodial digital-asset prime brokerage.",
};

function Sec({
  id,
  eyebrow,
  title,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-hair pt-12 first:border-0 first:pt-0">
      <span className="font-mono text-[12px] font-medium uppercase tracking-[0.22em] text-red">
        {eyebrow}
      </span>
      <h2 className="mt-2.5 font-sans text-[31px] font-extrabold leading-tight tracking-tight text-ink">
        {title}
      </h2>
      <div className="mt-5 space-y-4 text-[15px] leading-relaxed text-ink-s">{children}</div>
    </section>
  );
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="my-5 overflow-x-auto rounded-xl border border-hair">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="bg-[#f4f4f2]">
            {head.map((h) => (
              <th
                key={h}
                className="border-b border-hair px-4 py-3 text-left font-mono text-[11px] font-semibold uppercase tracking-wider text-ink-m"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="even:bg-[#fafaf9]">
              {r.map((c, j) => (
                <td
                  key={j}
                  className={`border-b border-hair px-4 py-3 align-top text-ink-s ${j === 0 ? "font-medium text-ink" : ""}`}
                >
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Code({ children }: { children: string }) {
  return (
    <pre className="my-5 overflow-x-auto rounded-xl bg-ink p-5 text-[13px] leading-relaxed text-white/90">
      <code>{children}</code>
    </pre>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2 pl-1">
      {items.map((it, i) => (
        <li key={i} className="flex gap-3">
          <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-red" />
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}

export default function DocsPage() {
  return (
    <main className="min-h-screen bg-white text-ink">
      {/* top bar */}
      <header className="sticky top-0 z-40 border-b border-hair bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <Link href="/" className="font-sans text-[18px] font-bold tracking-tight text-ink">
              Meridian<sup className="text-[10px] text-red">®</sup>
            </Link>
            <span className="rounded-full border border-hair px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-wider text-ink-m">
              Docs
            </span>
            <span className="hidden font-mono text-[11px] text-ink-f sm:inline">v1.0</span>
          </div>
          <div className="flex items-center gap-5 text-[13px]">
            <Link
              href="/"
              className="flex items-center gap-1.5 text-ink-m transition-colors hover:text-ink"
            >
              <ArrowLeft size={14} strokeWidth={2.25} /> Back to site
            </Link>
            <a
              href="https://github.com/0xfandom"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden items-center gap-1 font-medium text-ink transition-colors hover:text-red sm:flex"
            >
              GitHub <ArrowUpRight size={13} strokeWidth={2.5} />
            </a>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1400px] gap-12 px-6">
        {/* sidebar */}
        <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-56 shrink-0 overflow-y-auto py-10 lg:block">
          <DocsSidebar />
        </aside>

        {/* content */}
        <article className="min-w-0 max-w-3xl flex-1 space-y-16 py-12">
          {/* docs hero + popular pages */}
          <div className="space-y-5">
            <div className="relative overflow-hidden rounded-[24px] bg-[#f1f1ef] px-7 py-10 lg:px-10 lg:py-12">
              {/* watermark */}
              <span className="pointer-events-none absolute -bottom-10 right-2 select-none font-sans text-[11rem] font-black leading-none tracking-tighter text-[#e6e6e3] lg:text-[13rem]">
                docs
              </span>
              <div className="relative">
                <span className="inline-flex items-center gap-2 rounded-full border border-hair bg-white px-3 py-1 font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-ink-m">
                  <span className="h-1.5 w-1.5 rounded-full bg-red" /> Documentation · v1.0
                </span>
                <h1 className="mt-5 font-sans text-[44px] font-extrabold leading-[0.92] tracking-tight text-ink lg:text-[56px]">
                  Build on Meridian<span className="text-red">.</span>
                </h1>
                <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-ink-s">
                  The non-custodial digital-asset prime brokerage. Pooled credit, a cross-margin
                  account, and a portfolio risk engine spanning DeFi and CeFi — settled on-chain,
                  never custodial.
                </p>

                {/* quick links */}
                <div className="mt-7 flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-f">
                    Jump to
                  </span>
                  {QUICK_LINKS.map((q) => (
                    <a
                      key={q.href}
                      href={q.href}
                      className="rounded-full bg-white px-3.5 py-1.5 text-[13px] font-medium text-ink transition-colors hover:bg-ink hover:text-white"
                    >
                      {q.label}
                    </a>
                  ))}
                </div>
              </div>
            </div>

            {/* popular pages */}
            <div className="grid gap-3 sm:grid-cols-2">
              {POPULAR.map(({ Icon, eyebrow, title, desc, href }) => (
                <a
                  key={href}
                  href={href}
                  className="group flex flex-col rounded-2xl border border-hair bg-white p-5 transition-colors hover:border-ink"
                >
                  <div className="flex items-center justify-between">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-off text-ink transition-colors group-hover:bg-red group-hover:text-white">
                      <Icon size={17} strokeWidth={2} />
                    </span>
                    <ArrowUpRight
                      size={16}
                      className="text-ink-f transition-colors group-hover:text-ink"
                    />
                  </div>
                  <span className="mt-3 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-m">
                    {eyebrow}
                  </span>
                  <span className="mt-1 font-sans text-[16px] font-bold tracking-tight text-ink">
                    {title}
                  </span>
                  <span className="mt-1.5 text-[13px] leading-snug text-ink-m">{desc}</span>
                </a>
              ))}
            </div>
          </div>

          <Sec id="introduction" eyebrow="Getting Started" title="Introduction">
            <p>
              Meridian is a credit protocol for professional digital-asset desks. Lenders supply
              liquidity into tranched pools; managers borrow against blended collateral through a
              constrained Margin Account and execute across connected venues — all while assets
              remain in self-custody.
            </p>
            <p>
              The protocol is built around four primitives, covered in detail throughout these docs:
            </p>
            <Bullets
              items={[
                "Pooled Credit — senior and junior tranches priced by utilization.",
                "Margin Account — one cross-margin book across DeFi and CeFi.",
                "Risk Engine — real-time portfolio scoring, VaR, and liquidation paths.",
                "Settlement — on-chain, atomic, with continuous proof of reserves.",
              ]}
            />
          </Sec>

          <Sec id="core-concepts" eyebrow="Getting Started" title="Core Concepts">
            <Table
              head={["Term", "Definition"]}
              rows={[
                ["Pool", "A tranched lending vault for a single asset (e.g. USDC, ETH)."],
                [
                  "Credit line",
                  "The borrowing capacity granted to a Margin Account, priced from collateral and pool utilization.",
                ],
                [
                  "Margin Account",
                  "A non-custodial account that nets collateral and debt into one cross-margin book.",
                ],
                [
                  "Health Factor",
                  "Ratio of risk-adjusted collateral to debt; below 1.0 a position is liquidatable.",
                ],
                ["Utilization", "Borrowed / supplied for a pool; drives the interest-rate curve."],
                [
                  "Tranche",
                  "A seniority layer within a pool — senior absorbs losses last, junior first.",
                ],
              ]}
            />
          </Sec>

          <Sec id="quickstart" eyebrow="Getting Started" title="Quickstart">
            <p>
              Connect a Margin Account and read its health in a few lines using the TypeScript SDK.
            </p>
            <Code>{`import { Meridian } from "@meridian/sdk";

const m = new Meridian({ network: "mainnet" });
const account = await m.marginAccount(signer);

// supply collateral and open a credit line
await account.deposit({ asset: "ETH", amount: "25" });
const line = await account.openCreditLine({ leverage: 5 });

console.log(line.available, account.healthFactor);`}</Code>
            <p>
              See the{" "}
              <a href="#sdk" className="font-medium text-red underline-offset-2 hover:underline">
                SDK
              </a>{" "}
              section for installation and the full reference.
            </p>
          </Sec>

          <Sec id="architecture" eyebrow="Protocol" title="Architecture">
            <p>
              Meridian separates capital, risk, and execution into independent layers so that a
              failure or pause in one does not compromise custody in another.
            </p>
            <Bullets
              items={[
                "Capital layer — pool vaults hold supplied liquidity and mint tranche tokens.",
                "Account layer — Margin Accounts net collateral and debt; assets are escrowed in user-owned smart accounts.",
                "Risk layer — the off-chain risk engine streams marks and pushes signed risk states on-chain.",
                "Execution layer — adapters route orders to DeFi protocols and CeFi venues under account constraints.",
                "Settlement layer — atomic on-chain settlement with proof-of-reserves attestations.",
              ]}
            />
          </Sec>

          <Sec id="pooled-credit" eyebrow="Protocol" title="Pooled Credit">
            <p>
              Each pool is split into a <strong>senior</strong> and a <strong>junior</strong>{" "}
              tranche. Junior absorbs first losses and earns a higher yield; senior is protected and
              earns a lower, steadier rate. Interest accrues continuously along a utilization curve.
            </p>
            <Table
              head={["Pool", "Senior APY", "Junior APY", "Utilization", "TVL"]}
              rows={[
                ["USDC", "4.1%", "9.8%", "71%", "$410M"],
                ["ETH", "2.6%", "6.4%", "63%", "$284M"],
                ["BTC", "2.2%", "5.7%", "58%", "$151M"],
                ["SOL", "3.9%", "11.2%", "66%", "$62M"],
              ]}
            />
            <p>
              Rates shown are indicative. Live values are published on-chain and through the API.
            </p>
          </Sec>

          <Sec id="margin-accounts" eyebrow="Protocol" title="Margin Accounts">
            <p>
              A Margin Account is a user-owned smart account that nets every position into a single
              cross-margin book. Collateral from multiple assets and venues backs a single credit
              line, enabling up to
              <strong> 5× </strong> leverage from one signature.
            </p>
            <Bullets
              items={[
                "Cross-margin — gains on one position offset margin on another.",
                "Constraints — per-account caps on leverage, asset concentration, and venue exposure.",
                "Non-custodial — withdrawals are permissionless whenever the health factor allows.",
                "Programmatic — limits and automations are enforced by the account contract, not an operator.",
              ]}
            />
          </Sec>

          <Sec id="risk-engine" eyebrow="Protocol" title="Risk Engine">
            <p>
              The risk engine scores every account in real time. It marks positions across all
              venues, computes Value-at-Risk, and projects liquidation paths before margin is
              breached.
            </p>
            <p>The health factor is defined as:</p>
            <Code>{`healthFactor = Σ(collateralᵢ × liquidationThresholdᵢ) / totalDebt

// liquidatable when healthFactor < 1.0`}</Code>
            <p>
              Risk states are signed and pushed on-chain so that liquidations and withdrawal checks
              remain trust-minimized even when a venue feed is delayed.
            </p>
          </Sec>

          <Sec id="settlement" eyebrow="Protocol" title="Settlement & Custody">
            <p>
              Settlement is on-chain and atomic — a trade either completes in full or reverts.
              Assets never leave the user&rsquo;s smart account except into whitelisted venue
              adapters, and balances are continuously attested through proof-of-reserves.
            </p>
            <Bullets
              items={[
                "Atomic settlement — no partial-fill custody risk.",
                "Self-custody — no operator can move user assets.",
                "Proof of reserves — Merkle attestations published every epoch.",
              ]}
            />
          </Sec>

          <Sec id="risk-parameters" eyebrow="Risk" title="Risk Parameters">
            <p>
              Per-asset parameters govern how much can be borrowed against collateral and when
              liquidation begins.
            </p>
            <Table
              head={["Asset", "Max LTV", "Liq. Threshold", "Liq. Penalty", "Caps"]}
              rows={[
                ["USDC", "90%", "93%", "4%", "$250M"],
                ["ETH", "82%", "86%", "7%", "$180M"],
                ["BTC", "80%", "85%", "7%", "$160M"],
                ["SOL", "65%", "72%", "10%", "$40M"],
              ]}
            />
          </Sec>

          <Sec id="liquidations" eyebrow="Risk" title="Liquidations">
            <p>
              When an account&rsquo;s health factor falls below 1.0, liquidators may repay a portion
              of its debt in exchange for discounted collateral. Liquidations are partial by default
              — only enough is closed to restore the account above the threshold.
            </p>
            <Bullets
              items={[
                "Partial close-factor caps each liquidation at 50% of outstanding debt.",
                "Liquidation penalty is paid to the liquidator and a protocol reserve.",
                "Dutch-auction fallback engages if open-market liquidity is insufficient.",
              ]}
            />
          </Sec>

          <Sec id="oracles" eyebrow="Risk" title="Oracles">
            <p>
              Prices are aggregated from multiple independent sources with staleness and deviation
              checks. A median-of-feeds is used on-chain; CeFi marks are signed by the risk engine
              and cross-checked against on-chain references.
            </p>
            <Bullets
              items={[
                "Primary: decentralized push oracles (Pyth, Chainlink).",
                "Secondary: TWAP from deep on-chain pools.",
                "Circuit breakers halt borrowing on feed divergence beyond tolerance.",
              ]}
            />
          </Sec>

          <Sec id="contracts" eyebrow="Developers" title="Smart Contracts">
            <p>
              Core deployments. Always verify addresses against the on-chain registry before
              integrating.
            </p>
            <Table
              head={["Contract", "Network", "Address"]}
              rows={[
                ["CreditController", "Ethereum", "0x4f2a…b91c"],
                ["MarginAccountFactory", "Ethereum", "0x9c1d…07ae"],
                ["RiskOracle", "Ethereum", "0x12b8…5f30"],
                ["PoolManager", "Ethereum", "0x77e0…aa42"],
                ["SettlementRouter", "Base", "0x0a3f…c8d1"],
              ]}
            />
          </Sec>

          <Sec id="sdk" eyebrow="Developers" title="SDK">
            <p>The TypeScript SDK wraps account management, credit lines, and risk reads.</p>
            <Code>{`npm install @meridian/sdk
# or
pnpm add @meridian/sdk`}</Code>
            <Code>{`import { Meridian } from "@meridian/sdk";

const m = new Meridian({ network: "mainnet", rpc: process.env.RPC_URL });

const pools = await m.pools();                 // list pools + live rates
const acct  = await m.marginAccount(signer);   // load / create account
const risk  = await acct.risk();               // health, VaR, exposures`}</Code>
          </Sec>

          <Sec id="api" eyebrow="Developers" title="API Reference">
            <p>
              The REST API exposes read endpoints for pools, accounts, and risk. Authenticated
              routes use an API key.
            </p>
            <Table
              head={["Method", "Endpoint", "Returns"]}
              rows={[
                ["GET", "/v1/pools", "All pools with live rates and utilization"],
                ["GET", "/v1/accounts/:id", "Account collateral, debt, health factor"],
                ["GET", "/v1/accounts/:id/risk", "VaR, exposures, liquidation price"],
                ["POST", "/v1/webhooks", "Subscribe to margin-call and liquidation events"],
              ]}
            />
            <Code>{`curl https://api.meridian.fi/v1/accounts/0x4f2a/risk \\
  -H "Authorization: Bearer $MERIDIAN_API_KEY"`}</Code>
          </Sec>

          <Sec id="audits" eyebrow="Security" title="Audits">
            <p>
              The protocol is reviewed by independent security firms before every major release.
            </p>
            <Table
              head={["Firm", "Scope", "Date", "Report"]}
              rows={[
                ["Trail of Bits", "Core credit + accounts", "2026-02", "PDF"],
                ["Spearbit", "Risk oracle + settlement", "2026-03", "PDF"],
                ["OtterSec", "Base deployment", "2026-04", "PDF"],
              ]}
            />
          </Sec>

          <Sec id="bug-bounty" eyebrow="Security" title="Bug Bounty">
            <p>
              Responsible disclosure is rewarded by severity. Report to security@meridian.fi with a
              reproduction.
            </p>
            <Table
              head={["Severity", "Examples", "Reward"]}
              rows={[
                ["Critical", "Loss of user funds, custody bypass", "up to $1,000,000"],
                ["High", "Insolvency, oracle manipulation", "up to $250,000"],
                ["Medium", "Griefing, liveness failures", "up to $40,000"],
                ["Low", "Best-practice deviations", "up to $5,000"],
              ]}
            />
          </Sec>

          <Sec id="fees" eyebrow="Resources" title="Fees">
            <Table
              head={["Fee", "Amount", "Paid to"]}
              rows={[
                ["Borrow interest", "Utilization curve", "Lenders + reserve"],
                ["Origination", "0.05% of credit line", "Protocol reserve"],
                ["Liquidation penalty", "4% – 10% by asset", "Liquidator + reserve"],
                ["Performance", "10% of junior yield", "Protocol reserve"],
              ]}
            />
          </Sec>

          <Sec id="governance" eyebrow="Resources" title="Governance">
            <p>
              Protocol parameters — risk caps, supported assets, fee splits — are controlled by
              governance, which ramps from a security council multisig toward token-holder voting as
              the system matures.
            </p>
            <Bullets
              items={[
                "Security council can pause markets and execute emergency upgrades behind a timelock.",
                "Parameter changes pass through a public proposal and review window.",
                "Treasury funds audits, the bounty program, and liquidity incentives.",
              ]}
            />
          </Sec>

          <Sec id="faq" eyebrow="Resources" title="FAQ">
            <div className="space-y-5">
              {[
                [
                  "Is Meridian custodial?",
                  "No. Assets stay in user-owned smart accounts; no operator can move them. Withdrawals are permissionless whenever the health factor allows.",
                ],
                [
                  "What leverage is available?",
                  "Up to 5× on the cross-margin book, subject to per-account and per-asset caps.",
                ],
                [
                  "What happens in a liquidation?",
                  "A partial close restores the account above its liquidation threshold; only enough debt is repaid to recover health.",
                ],
                [
                  "Which venues are supported?",
                  "Major DeFi protocols and select CeFi venues through whitelisted adapters. Coverage expands through governance.",
                ],
              ].map(([q, a]) => (
                <div key={q}>
                  <p className="font-sans text-[15px] font-bold text-ink">{q}</p>
                  <p className="mt-1.5 text-[14px] leading-relaxed text-ink-m">{a}</p>
                </div>
              ))}
            </div>
          </Sec>

          <Sec id="glossary" eyebrow="Resources" title="Glossary">
            <Table
              head={["Term", "Meaning"]}
              rows={[
                [
                  "VaR",
                  "Value-at-Risk — expected worst-case loss over a horizon at a confidence level.",
                ],
                ["LTV", "Loan-to-Value — borrow limit as a fraction of collateral value."],
                ["Cross-margin", "Collateral and debt netted across all positions in one book."],
                ["Senior / Junior", "Loss-absorption seniority of a pool tranche."],
                [
                  "Proof of reserves",
                  "Cryptographic attestation that custodied balances back liabilities.",
                ],
              ]}
            />
          </Sec>

          {/* footer */}
          <div className="flex flex-col gap-3 border-t border-hair pt-8 text-[13px] text-ink-m sm:flex-row sm:items-center sm:justify-between">
            <span>© 2026 Meridian. Documentation v1.0.</span>
            <div className="flex items-center gap-5">
              <Link href="/" className="transition-colors hover:text-ink">
                Home
              </Link>
              <a
                href="https://github.com/0xfandom"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 transition-colors hover:text-ink"
              >
                GitHub <ArrowUpRight size={12} strokeWidth={2.5} />
              </a>
              <a
                href="mailto:kashyapshivank01@gmail.com"
                className="transition-colors hover:text-ink"
              >
                Contact
              </a>
            </div>
          </div>
        </article>
      </div>
    </main>
  );
}
