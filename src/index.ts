#!/usr/bin/env node
import 'dotenv/config';
import { program } from 'commander';
import { privateKeyToAccount } from 'viem/accounts';
import { getEnvVar } from './config.js';
import { splitTaskIntoTwo } from './split.js';
import { listMarketplaceAgents } from './discovery/marketplace.js';
import { createPaymentFetch } from './payment/x402Client.js';
import { callAgent } from './agents.js';
import { combineResults } from './combine.js';
import type { MarketplaceAgent } from './discovery/marketplace.js';
import type { Subtask } from './split.js';

program
  .name('avaz')
  .description('Agent-to-agent hiring marketplace on Avalanche x402 + ERC-8004')
  .argument('[task]', 'User task to split and delegate to marketplace agents')
  .option('-q, --quiet', 'Less output')
  .action(async (taskArg: string | undefined, opts: { quiet?: boolean }) => {
    const task = taskArg?.trim() ?? await promptTask();
    if (!task) {
      console.error('No task provided. Use: avaz "Your task here"');
      process.exit(1);
    }

    const privateKey = getEnvVar('EVM_PRIVATE_KEY').replace(/^0x/, '').trim();
    const hexKey = (`0x${privateKey}` as `0x${string}`);
    const account = privateKeyToAccount(hexKey);
    const payerAddress = account.address;
    const clientAddresses: `0x${string}`[] = [payerAddress];

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
      console.log('');
      console.log('To demo: register agents with x402Support in their registration file, then run again.');
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

    const fetchWithPayment = createPaymentFetch(() => getEnvVar('EVM_PRIVATE_KEY'));
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
      const result = await callAgent(
        url,
        { subtask: subtask.description },
        fetchWithPayment
      );

      results.push({ description: subtask.description, body: result.body });
      if (result.txHash) txHashes.push(result.txHash);

      const txLine = result.txHash ? ` — Payment tx: ${result.txHash}` : '';
      console.log(`[Subtask ${i + 1}] Agent: ${agent.name} (agentId ${agent.agentId})${txLine}`);
    }

    console.log('');
    const combined = await combineResults(
      results[0].description,
      results[0].body,
      results[1].description,
      results[1].body
    );
    console.log('--- Combined result ---');
    console.log(combined);
    console.log('');
    console.log('=== Transaction hashes ===');
    if (txHashes.length === 0) console.log('  (none from x402 payments)');
    else txHashes.forEach((h) => console.log(h));
  });

function printAgentsTable(agents: MarketplaceAgent[]) {
  const rows = agents.slice(0, 15).map((a) => ({
    agentId: String(a.agentId),
    name: (a.name || '').slice(0, 20),
    reputation: String(a.reputationScore),
    endpoint: (a.endpoint || '-').slice(0, 35),
  }));
  const col = (key: keyof (typeof rows)[0], w: number) =>
    key === 'endpoint' ? w + 10 : w;
  const widths = {
    agentId: 10,
    name: 22,
    reputation: 12,
    endpoint: 45,
  };
  const sep = '|';
  const header = [sep, 'agentId'.padEnd(widths.agentId), sep, 'name'.padEnd(widths.name), sep, 'reputation'.padEnd(widths.reputation), sep, 'endpoint'.padEnd(widths.endpoint), sep].join(' ');
  const line = sep + '-'.repeat(header.length - 2) + sep;
  console.log(header);
  console.log(line);
  for (const r of rows) {
    console.log(
      [sep, r.agentId.padEnd(widths.agentId), sep, r.name.padEnd(widths.name), sep, r.reputation.padEnd(widths.reputation), sep, r.endpoint.padEnd(widths.endpoint), sep].join(' ')
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
