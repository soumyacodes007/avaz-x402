#!/usr/bin/env node
import 'dotenv/config';
import { program } from 'commander';
import { privateKeyToAccount } from 'viem/accounts';
import { getEnvVar } from './config.js';
import { splitTaskIntoTwo } from './split.js';
import { listMarketplaceAgents } from './discovery/marketplace.js';
import { createPaymentFetch } from './payment/x402Client.js';
import { callAgent } from './agents.js';
import { sendUSDCPayment } from './payment/directPayment.js';
import { combineResults } from './combine.js';
import { selectAgentsByCapability } from './selectAgents.js';
import { writeArticle } from './writeArticle.js';
import type { MarketplaceAgent } from './discovery/marketplace.js';
import type { Subtask } from './split.js';

// ──────────────────────────────────────────────────────────────────
// Command 1: Original marketplace flow (Plan B)
// ──────────────────────────────────────────────────────────────────
program
  .name('avaz')
  .description('Agent-to-agent hiring marketplace on Avalanche x402 + ERC-8004');

program
  .command('hire')
  .description('Split a task into 2 subtasks, discover agents, pay via x402, combine results')
  .argument('[task]', 'User task to split and delegate to marketplace agents')
  .option('-q, --quiet', 'Less output')
  .action(async (taskArg: string | undefined, opts: { quiet?: boolean }) => {
    const task = taskArg?.trim() ?? await promptTask();
    if (!task) {
      console.error('No task provided. Use: avaz hire "Your task here"');
      process.exit(1);
    }

    const { payerAddress, clientAddresses, fetchWithPayment } = setupWallet();

    console.log('=== Task ===');
    console.log(task);
    console.log('');

    const subtasks = await splitTaskIntoTwo(task);
    console.log('=== Subtasks (Groq) ===');
    subtasks.forEach((s, i) => console.log(`  ${i + 1}. ${s.description}`));
    console.log('');

    const agents = await listMarketplaceAgents(clientAddresses);
    console.log('=== Available agents in marketplace ===');
    if (agents.length === 0) {
      console.log('  (No agents found on ERC-8004 Avalanche Testnet. Register agents or check RPC.)');
      process.exit(0);
    }

    printAgentsTable(agents);
    console.log('');

    const selected = selectAgentsForSubtasks(agents, subtasks);
    console.log('=== Purchasing using highest reputation ===');
    selected.forEach(({ subtask, agent }, i) => {
      console.log(`  Subtask ${i + 1}: "${subtask.description.slice(0, 50)}..." → ${agent.name} (agentId ${agent.agentId}, reputation ${agent.reputationScore})`);
    });
    console.log('');

    const txHashes: string[] = [];
    const results: { description: string; body: string }[] = [];

    for (let i = 0; i < 2; i++) {
      const { subtask, agent } = selected[i];
      const endpoint = agent.endpoint || agent.registration?.services?.[0]?.endpoint;
      if (!endpoint) {
        console.warn(`[Subtask ${i + 1}] Agent ${agent.name} has no callable endpoint; skipping.`);
        results.push({ description: subtask.description, body: '(no endpoint)' });
        continue;
      }

      const url = endpoint.startsWith('http') ? endpoint : `https://${endpoint}`;
      const result = await callAgent(url, { subtask: subtask.description }, fetchWithPayment);

      results.push({ description: subtask.description, body: result.body });
      if (result.txHash) txHashes.push(result.txHash);

      const txLine = result.txHash ? ` — Payment tx: ${result.txHash}` : '';
      console.log(`[Subtask ${i + 1}] Agent: ${agent.name} (agentId ${agent.agentId})${txLine}`);
    }

    console.log('');
    const combined = await combineResults(
      results[0].description, results[0].body,
      results[1].description, results[1].body
    );
    console.log('--- Combined result ---');
    console.log(combined);
    printTxHashes(txHashes);
  });

// ──────────────────────────────────────────────────────────────────
// Command 2: 4-Agent Article Pipeline (Plan A)
// ──────────────────────────────────────────────────────────────────
program
  .command('article')
  .description('Discover 4 agents (2 research + 2 stats), select best of each, pay via x402, write article with Qwen')
  .argument('[topic]', 'Article topic', 'the growth of Indian population')
  .action(async (topic: string) => {
    console.log('\n╔══════════════════════════════════════════════════════╗');
    console.log('║   4-Agent Article Pipeline  —  Qwen3-32B Writer     ║');
    console.log('╚══════════════════════════════════════════════════════╝\n');

    const { payerAddress, clientAddresses, fetchWithPayment } = setupWallet();

    console.log(`📝 Topic: "${topic}"\n`);

    // Step 1: Discover all agents
    console.log('🔍 Step 1: Discovering agents from ERC-8004...');
    const agents = await listMarketplaceAgents(clientAddresses);

    if (agents.length === 0) {
      console.log('  ❌ No agents found on ERC-8004 Avalanche Testnet.');
      console.log('  Run scripts/register-agents.ts first, then seed reputation.\n');
      process.exit(0);
    }

    // Show all agents with capability tags
    console.log(`\n  Found ${agents.length} agent(s):\n`);
    printAgentsTableWithCapability(agents);
    console.log('');

    // Step 2: Select 1 research + 1 stats by highest reputation
    console.log('🎯 Step 2: Selecting agents by capability + reputation...');
    const selected = selectAgentsByCapability(agents);

    if (!selected) {
      console.log('  ❌ Need at least 1 research agent and 1 stats agent.');
      console.log('  Register workers with "research" and "statistical-analytics" capabilities.\n');
      process.exit(1);
      return; // TypeScript narrowing
    }

    console.log(`  ✅ Research:  ${selected.research.name} (agentId ${selected.research.agentId}, reputation ${selected.research.reputationScore})`);
    console.log(`  ✅ Stats:     ${selected.stats.name} (agentId ${selected.stats.agentId}, reputation ${selected.stats.reputationScore})\n`);

    // Step 3: Pay and fetch from both agents
    console.log('💳 Step 3: Paying agents via on-chain USDC transfer (0.001 USD each)...\n');
    const txHashes: string[] = [];
    const PAYMENT_AMOUNT = 1000n; // 0.001 USDC in token units (6 decimals)

    // Call research agent
    const researchEndpoint = selected.research.endpoint || selected.research.registration?.services?.[0]?.endpoint;
    let researchResult = '';
    if (researchEndpoint) {
      const url = researchEndpoint.startsWith('http') ? researchEndpoint : `https://${researchEndpoint}`;
      const fullUrl = `${url}${url.includes('?') ? '&' : '?'}query=${encodeURIComponent(topic)}`;

      // Pre-pay: send USDC on-chain to the worker wallet
      const workerWallet = (selected.research.registration as any)?.metadata?.walletAddress || payerAddress;
      try {
        console.log(`  💰 Sending 0.001 USDC to research agent (${workerWallet.slice(0, 10)}...)...`);
        const payment = await sendUSDCPayment(workerWallet as `0x${string}`, PAYMENT_AMOUNT);
        txHashes.push(payment.txHash);
        console.log(`  ✅ Payment confirmed! tx: ${payment.txHash}`);
      } catch (err: any) {
        console.log(`  ⚠️  Pre-payment failed: ${err.message} — calling agent anyway`);
      }

      console.log(`  📡 Calling Research agent at ${url}...`);
      const res = await callAgent(fullUrl, { subtask: `Research: ${topic}` }, fetchWithPayment);
      researchResult = extractResult(res.body);
      if (res.txHash && !txHashes.includes(res.txHash)) txHashes.push(res.txHash);
      console.log(`  ✅ Research agent responded (${researchResult.length} chars)\n`);
    } else {
      console.log(`  ⚠️  Research agent has no endpoint; skipping.\n`);
    }

    // Call stats agent
    const statsEndpoint = selected.stats.endpoint || selected.stats.registration?.services?.[0]?.endpoint;
    let statsResult = '';
    if (statsEndpoint) {
      const url = statsEndpoint.startsWith('http') ? statsEndpoint : `https://${statsEndpoint}`;
      const fullUrl = `${url}${url.includes('?') ? '&' : '?'}query=${encodeURIComponent(topic)}`;

      // Pre-pay: send USDC on-chain to the worker wallet
      const workerWallet = (selected.stats.registration as any)?.metadata?.walletAddress || payerAddress;
      try {
        console.log(`  💰 Sending 0.001 USDC to stats agent (${workerWallet.slice(0, 10)}...)...`);
        const payment = await sendUSDCPayment(workerWallet as `0x${string}`, PAYMENT_AMOUNT);
        txHashes.push(payment.txHash);
        console.log(`  ✅ Payment confirmed! tx: ${payment.txHash}`);
      } catch (err: any) {
        console.log(`  ⚠️  Pre-payment failed: ${err.message} — calling agent anyway`);
      }

      console.log(`  📡 Calling Stats agent at ${url}...`);
      const res = await callAgent(fullUrl, { subtask: `Stats: ${topic}` }, fetchWithPayment);
      statsResult = extractResult(res.body);
      if (res.txHash && !txHashes.includes(res.txHash)) txHashes.push(res.txHash);
      console.log(`  ✅ Stats agent responded (${statsResult.length} chars)\n`);
    } else {
      console.log(`  ⚠️  Stats agent has no endpoint; skipping.\n`);
    }

    // Step 4: Write article with Qwen
    console.log('✍️  Step 4: Writing article with Groq Qwen3-32B...\n');
    const article = await writeArticle(topic, researchResult, statsResult);

    console.log('╔══════════════════════════════════════════════════════╗');
    console.log('║                    ARTICLE OUTPUT                    ║');
    console.log('╚══════════════════════════════════════════════════════╝\n');
    console.log(article);

    // Step 5: Print transaction hashes
    printTxHashes(txHashes);
  });

// ──────────────────────────────────────────────────────────────────
// Default: show help if no command
// ──────────────────────────────────────────────────────────────────
program
  .action(() => {
    program.help();
  });

// ──────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────

function setupWallet() {
  const privateKey = getEnvVar('EVM_PRIVATE_KEY').replace(/^0x/, '').trim();
  const hexKey = (`0x${privateKey}` as `0x${string}`);
  const account = privateKeyToAccount(hexKey);
  const payerAddress = account.address;

  // Include both the payer and the feedback wallet for reputation queries
  // (getSummary only returns feedback from specified client addresses)
  const clientAddresses: `0x${string}`[] = [payerAddress];
  const feedbackKey = process.env.FEEDBACK_PRIVATE_KEY;
  if (feedbackKey) {
    const fbKey = (feedbackKey.startsWith('0x') ? feedbackKey : `0x${feedbackKey}`) as `0x${string}`;
    const feedbackAddress = privateKeyToAccount(fbKey).address;
    if (feedbackAddress.toLowerCase() !== payerAddress.toLowerCase()) {
      clientAddresses.push(feedbackAddress);
    }
  }

  const fetchWithPayment = createPaymentFetch(() => getEnvVar('EVM_PRIVATE_KEY'));
  return { payerAddress, clientAddresses, fetchWithPayment };
}

function extractResult(body: string): string {
  try {
    const json = JSON.parse(body);
    return json.result || json.body || body;
  } catch {
    return body;
  }
}

function printAgentsTable(agents: MarketplaceAgent[]) {
  const widths = { agentId: 10, name: 22, reputation: 12, endpoint: 45 };
  const sep = '|';
  const header = [sep, 'agentId'.padEnd(widths.agentId), sep, 'name'.padEnd(widths.name), sep, 'reputation'.padEnd(widths.reputation), sep, 'endpoint'.padEnd(widths.endpoint), sep].join(' ');
  const line = sep + '-'.repeat(header.length - 2) + sep;
  console.log(header);
  console.log(line);
  for (const a of agents.slice(0, 15)) {
    console.log(
      [sep, String(a.agentId).padEnd(widths.agentId), sep, (a.name || '').slice(0, 20).padEnd(widths.name), sep, String(a.reputationScore).padEnd(widths.reputation), sep, (a.endpoint || '-').slice(0, 43).padEnd(widths.endpoint), sep].join(' ')
    );
  }
}

function printAgentsTableWithCapability(agents: MarketplaceAgent[]) {
  const widths = { agentId: 8, name: 20, capability: 22, reputation: 10, endpoint: 35 };
  const sep = '|';
  const header = [
    sep, 'agentId'.padEnd(widths.agentId),
    sep, 'name'.padEnd(widths.name),
    sep, 'capability'.padEnd(widths.capability),
    sep, 'reputation'.padEnd(widths.reputation),
    sep, 'endpoint'.padEnd(widths.endpoint), sep
  ].join(' ');
  const line = sep + '-'.repeat(header.length - 2) + sep;
  console.log(`  ${header}`);
  console.log(`  ${line}`);
  for (const a of agents.slice(0, 15)) {
    console.log(
      `  ${[
        sep, String(a.agentId).padEnd(widths.agentId),
        sep, (a.name || '').slice(0, 18).padEnd(widths.name),
        sep, (a.capability || 'unknown').padEnd(widths.capability),
        sep, String(a.reputationScore).padEnd(widths.reputation),
        sep, (a.endpoint || '-').slice(0, 33).padEnd(widths.endpoint), sep
      ].join(' ')}`
    );
  }
}

function selectAgentsForSubtasks(
  agents: MarketplaceAgent[],
  subtasks: Subtask[]
): Array<{ subtask: Subtask; agent: MarketplaceAgent }> {
  if (agents.length >= 2) {
    return [
      { subtask: subtasks[0], agent: agents[0] },
      { subtask: subtasks[1], agent: agents[1] },
    ];
  }
  const a = agents[0];
  return [
    { subtask: subtasks[0], agent: a },
    { subtask: subtasks[1], agent: a },
  ];
}

function printTxHashes(txHashes: string[]) {
  console.log('\n=== Transaction hashes ===');
  if (txHashes.length === 0) {
    console.log('  (none from x402 payments)');
  } else {
    txHashes.forEach((h) => console.log(`  ${h}`));
  }
  console.log('');
}

async function promptTask(): Promise<string> {
  return new Promise((resolve) => {
    const readline = require('readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('Enter task: ', (answer: string) => {
      rl.close();
      resolve(answer?.trim() ?? '');
    });
  });
}

program.parse();
