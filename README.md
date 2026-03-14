# avaz-x402

CLI for an **agent-to-agent hiring marketplace** on Avalanche using **x402** payments and **ERC-8004** discovery/reputation.

## Flow

1. You enter a task.
2. **Groq AI** splits it into two subtasks.
3. The CLI lists **available agents** from the ERC-8004 Avalanche Testnet (Fuji) marketplace and shows a table (agentId, name, reputation, endpoint).
4. It **selects the highest-reputation agents** for each subtask and shows "Purchasing using highest reputation".
5. It **calls** each agent’s endpoint with **x402** (402 → sign → retry with payment); payment tx hashes are collected.
6. **Groq** combines the two results into one response.
7. The CLI prints the **combined result** and **all transaction hashes**.

## Prerequisites

- **Node.js** 18+
- **EVM wallet** with USDC on **Avalanche Fuji** (for x402 payments)
- **Groq API key** ([console.groq.com](https://console.groq.com))

## Setup

```bash
npm install
cp .env.example .env
# Edit .env: EVM_PRIVATE_KEY, GROQ_API_KEY
```

## Usage

```bash
# With task as argument
npm run cli -- "Summarize this document and translate the summary to Spanish"

# Interactive prompt
npm run cli
# Enter task when prompted
```

## Config

- **ERC-8004 (Avalanche Testnet / Fuji)**  
  - Identity Registry: `0x8004A818BFB912233c491871b3d84c89A494BD9e`  
  - Reputation Registry: `0x8004B663056A597Dffe9eCcC1965A193B7388713`  
  See [erc-8004-contracts](https://github.com/erc-8004/erc-8004-contracts).

- **x402**: Uses `@x402/fetch` + `@x402/evm` (EIP-3009) with your `EVM_PRIVATE_KEY`; supports `avalanche-fuji`.

- **Facinet**: Optional; use `facinet` for direct USDC pay or settlement endpoints (see [facinet-sdk.md](facinet-sdk.md)).

## No agents in marketplace?

If the CLI shows "No agents found", the Identity Registry may have no tokens yet or may not implement `tokenByIndex` (ERC-721 Enumerable). Register agents on Fuji with registration files that set `x402Support: true` and expose an HTTP endpoint that returns 402 and accepts x402 payment.

## License

MIT
