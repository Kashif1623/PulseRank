import { createPublicClient, createWalletClient, http, parseAbi, parseEventLogs, toHex, getAddress, stringToHex, ContractFunctionRevertedError, maxUint256 } from 'viem';
import { readFileSync } from 'node:fs';

// anvil-arc fork layered on top of the verify fork (plain anvil lacks Arc's native-USDC precompile at 0x1800..00,
// so USDC.transfer/transferFrom revert there). The stream is at the predicted address with its verify-fork state.
const RPC = process.env.FORK_RPC ?? 'http://127.0.0.1:38200';
const STREAM = getAddress('0x5da80D5c88Db977af98847Ed3E8C679D96518C63');
const FACTORY = getAddress('0x2bf72d06fb197d698f5b7be88533721ce1f001ff');
const DEPLOYER = getAddress('0xB13fC8D3b0299C8a658CDaD870ed7D40576cC7dE');
const OWNER = getAddress('0x1bc3e8b8bd8724d13dae6de9602f9e4dd1a682e8');
const REGISTRY = getAddress('0x43d74ECe631598746E137CC43a81dFE5C8565aD1');
const SCORE = getAddress('0x418FC1385B55Bd1b26B0c5B7094502ed094864Ce');
const TASK = getAddress('0x8f893D6ad7fa39C881468C556c279b56306C193B');
const USDC = getAddress('0x3600000000000000000000000000000000000000');
const ZERO = '0x0000000000000000000000000000000000000000';
const U = 1_000_000n; // 1 USDC (6 dec)
const WEI_PER_UNIT = 10n ** 12n; // native 18-dec wei per 6-dec USDC unit

const streamAbi = JSON.parse(readFileSync('/home/user/app/contracts/out/PulseStreamV2.sol/PulseStreamV2.json', 'utf8')).abi;
const scoreAbi = parseAbi([
  'function setPulseStream(address s)', 'function pulseStream() view returns (address)', 'function owner() view returns (address)',
  'function scores(address) view returns (uint256)', 'function initialized(address) view returns (bool)',
  'function failedStreams(address) view returns (uint256)',
  'event PulseStreamSet(address indexed pulseStream)',
  'error OwnableUnauthorizedAccount(address account)', 'error ZeroAddress()', 'error NotAuthorized()',
]);
const taskAbi = parseAbi([
  'function setPulseStream(address s)', 'function pulseStream() view returns (address)', 'function owner() view returns (address)',
  'event PulseStreamSet(address indexed pulseStream)',
  'error OwnableUnauthorizedAccount(address account)', 'error ZeroAddress()',
]);
const registryAbi = parseAbi([
  'function registerAgent(bytes32 name, string profileURI, uint256 minDailyRate) returns (uint256)',
  'function hasRegistered(address) view returns (bool)',
  'event AgentRegistered(uint256 indexed agentId, address indexed owner, bytes32 indexed name, string profileURI, uint256 minDailyRate)',
]);
const usdcAbi = parseAbi([
  'function balanceOf(address) view returns (uint256)', 'function approve(address,uint256) returns (bool)',
]);

const pub = createPublicClient({ transport: http(RPC) });
const wallet = createWalletClient({ transport: http(RPC) });
const rpc = (method: string, params: any[] = []) => (pub as any).request({ method, params });

let passed = 0, failed = 0;
const failures: string[] = [];
async function test(name: string, fn: () => Promise<string | void>) {
  const t0 = Date.now();
  try {
    const detail = (await fn()) ?? '';
    passed++;
    console.log(JSON.stringify({ testName: name, status: 'PASS', detail, durationMs: Date.now() - t0 }));
  } catch (e: any) {
    failed++;
    failures.push(name);
    console.log(JSON.stringify({ testName: name, status: 'FAIL', detail: String(e?.shortMessage ?? e?.message ?? e).slice(0, 600), durationMs: Date.now() - t0 }));
  }
}
function assert(c: any, msg: string) { if (!c) throw new Error('assertion failed: ' + msg); }
function eq(a: any, b: any, msg: string) {
  const na = typeof a === 'string' ? a.toLowerCase() : a, nb = typeof b === 'string' ? b.toLowerCase() : b;
  if (na !== nb) throw new Error(`${msg}: expected ${nb}, got ${na}`);
}

const known = new Set<string>();
async function actor(addr: string, usdc = 1000n) {
  const a = getAddress(addr);
  if (!known.has(a)) { await rpc('anvil_impersonateAccount', [a]); known.add(a); }
  await rpc('anvil_setBalance', [a, toHex(usdc * U * WEI_PER_UNIT)]);
  return a;
}
const fresh = () => getAddress(toHex(crypto.getRandomValues(new Uint8Array(20))));

async function send(from: string, address: string, abi: any, functionName: string, args: any[] = []) {
  const hash = await wallet.writeContract({ account: from as `0x${string}`, chain: null, address: address as `0x${string}`, abi, functionName, args } as any);
  const receipt = await pub.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') throw new Error(`tx ${hash} reverted`);
  return { hash, receipt };
}
async function revertName(from: string, address: string, abi: any, functionName: string, args: any[] = []): Promise<string> {
  try {
    await pub.simulateContract({ account: from as `0x${string}`, address: address as `0x${string}`, abi, functionName, args } as any);
  } catch (e: any) {
    const r = e?.walk?.((x: any) => x instanceof ContractFunctionRevertedError);
    return r?.data?.errorName ?? r?.reason ?? e.shortMessage ?? String(e);
  }
  return '<<no revert>>';
}
async function expectRevert(expected: string, from: string, address: string, abi: any, fn: string, args: any[] = []) {
  const got = await revertName(from, address, abi, fn, args);
  if (got !== expected) throw new Error(`expected revert ${expected}, got ${got}`);
}
const read = (address: string, abi: any, functionName: string, args: any[] = []) =>
  pub.readContract({ address: address as `0x${string}`, abi, functionName, args } as any) as Promise<any>;
const sRead = (fn: string, args: any[] = []) => read(STREAM, streamAbi, fn, args);
const usdcBal = (a: string) => read(USDC, usdcAbi, 'balanceOf', [a]) as Promise<bigint>;
async function warp(sec: number) { await rpc('evm_increaseTime', [sec]); await rpc('evm_mine', []); }
const blockTs = async (n: bigint) => (await pub.getBlock({ blockNumber: n })).timestamp;
const ST = { Proposed: 0, Active: 1, Paused: 2, Completed: 3, Reclaimed: 4, Cancelled: 5 };

async function mkAgent(label: string) {
  const a = await actor(fresh());
  const name = stringToHex(`${label}-${Math.random().toString(36).slice(2, 10)}`, { size: 32 });
  await send(a, REGISTRY, registryAbi, 'registerAgent', [name, 'ipfs://fork-test', 0n]);
  assert(await read(REGISTRY, registryAbi, 'hasRegistered', [a]), 'agent registered');
  return a;
}
async function mkFunder() {
  const f = await actor(fresh());
  await send(f, USDC, usdcAbi, 'approve', [STREAM, maxUint256]);
  return f;
}
async function propose(from: string, agent: string, amount: bigint, dur: bigint, mode = 1, taskId = 0n) {
  const r = await send(from, STREAM, streamAbi, 'proposeStream', [agent, amount, dur, mode, taskId]);
  const ev = parseEventLogs({ abi: streamAbi, logs: r.receipt.logs, eventName: 'StreamProposed' }) as any[];
  assert(ev.length === 1, 'one StreamProposed event');
  return { id: ev[0].args.streamId as bigint, ...r };
}
const getStream = (id: bigint) => sRead('getStream', [id]) as Promise<any>;

async function main() {
  const chainId = await pub.getChainId();
  assert(chainId === 5042, 'fork chain id is 5042, got ' + chainId);
  await actor(OWNER, 100n); await actor(FACTORY, 100n); await actor(DEPLOYER, 100n);
  await rpc('anvil_setBalance', [STREAM, '0x0']); // clear any dust left on the stream by earlier probing

  // ───────── 0. Deployment sanity ─────────
  await test('deploy: code present at predicted address', async () => {
    const code = await pub.getCode({ address: STREAM });
    assert(code && code.length > 2, 'no code'); return `code bytes=${(code!.length - 2) / 2}`;
  });
  await test('deploy: registry/scoreContract/taskContract/USDC/owner wired correctly', async () => {
    eq(await sRead('registry'), REGISTRY, 'registry'); eq(await sRead('scoreContract'), SCORE, 'scoreContract');
    eq(await sRead('taskContract'), TASK, 'taskContract'); eq(await sRead('USDC'), USDC, 'USDC');
    eq(await sRead('owner'), OWNER, 'owner');
    eq(await sRead('pendingOwner'), ZERO, 'pendingOwner');
    eq(await sRead('nextStreamId'), 1n, 'nextStreamId');
    return 'all immutables + owner correct';
  });
  await test('deploy: owner is the explicit initialOwner, NOT factory/deployer (no factory lock)', async () => {
    const o = (await sRead('owner')) as string;
    assert(o.toLowerCase() !== FACTORY.toLowerCase() && o.toLowerCase() !== DEPLOYER.toLowerCase(), 'owner equals factory/deployer');
    eq(await read(SCORE, scoreAbi, 'owner'), OWNER, 'score owner'); eq(await read(TASK, taskAbi, 'owner'), OWNER, 'task owner');
    return `owner=${o}`;
  });
  await test('deploy: default mode configs and constants', async () => {
    const m1 = await sRead('getModeConfig', [1]), m2 = await sRead('getModeConfig', [2]), m3 = await sRead('getModeConfig', [3]), m0 = await sRead('getModeConfig', [0]);
    eq(m1[0], 300n, 'm1 hb'); eq(m1[1], 600n, 'm1 grace'); eq(m2[0], 1800n, 'm2 hb'); eq(m2[1], 1800n, 'm2 grace');
    eq(m3[0], 3600n, 'm3 hb'); eq(m3[1], 7200n, 'm3 grace'); eq(m0[0], 0n, 'm0 hb');
    eq(await sRead('MIN_AMOUNT'), 200000n, 'MIN_AMOUNT'); eq(await sRead('PENALTY_BPS'), 500n, 'PENALTY_BPS');
    return 'ok';
  });

  // ───────── 1. Wire stream into the real Score + Task ─────────
  const OLD_STREAM = '0x6f617A19Bc676BffAb6ba857062c43d52f669613';
  await send(OWNER, SCORE, scoreAbi, 'setPulseStream', [OLD_STREAM]); await send(OWNER, TASK, taskAbi, 'setPulseStream', [OLD_STREAM]);
  eq(await read(SCORE, scoreAbi, 'pulseStream'), OLD_STREAM, 'precondition'); eq(await read(TASK, taskAbi, 'pulseStream'), OLD_STREAM, 'precondition');
  await test('setPulseStream: non-owner (random, factory, deployer) reverts on real Score and Task', async () => {
    const rnd = await actor(fresh());
    for (const who of [rnd, FACTORY, DEPLOYER]) {
      await expectRevert('OwnableUnauthorizedAccount', who, SCORE, scoreAbi, 'setPulseStream', [STREAM]);
      await expectRevert('OwnableUnauthorizedAccount', who, TASK, taskAbi, 'setPulseStream', [STREAM]);
    }
  });
  await test('setPulseStream: zero address reverts ZeroAddress (Score and Task)', async () => {
    await expectRevert('ZeroAddress', OWNER, SCORE, scoreAbi, 'setPulseStream', [ZERO]);
    await expectRevert('ZeroAddress', OWNER, TASK, taskAbi, 'setPulseStream', [ZERO]);
  });
  await test('setPulseStream: owner sets new stream on real Score; score.pulseStream()==stream', async () => {
    const before = await read(SCORE, scoreAbi, 'pulseStream');
    const { hash, receipt } = await send(OWNER, SCORE, scoreAbi, 'setPulseStream', [STREAM]);
    eq(await read(SCORE, scoreAbi, 'pulseStream'), STREAM, 'score.pulseStream');
    const ev = parseEventLogs({ abi: scoreAbi, logs: receipt.logs, eventName: 'PulseStreamSet' });
    assert(ev.length === 1, 'PulseStreamSet event');
    return `prev=${before} tx ${hash}`;
  });
  await test('setPulseStream: owner sets new stream on real Task; task.pulseStream()==stream', async () => {
    const before = await read(TASK, taskAbi, 'pulseStream');
    const { hash, receipt } = await send(OWNER, TASK, taskAbi, 'setPulseStream', [STREAM]);
    eq(await read(TASK, taskAbi, 'pulseStream'), STREAM, 'task.pulseStream');
    assert(parseEventLogs({ abi: taskAbi, logs: receipt.logs, eventName: 'PulseStreamSet' }).length === 1, 'event');
    return `prev=${before} tx ${hash}`;
  });
  await test('owner admin: setModeConfig owner OK / non-owner + out-of-range revert; timelocked proposals work', async () => {
    const rnd = await actor(fresh());
    await expectRevert('OwnableUnauthorizedAccount', rnd, STREAM, streamAbi, 'setModeConfig', [1, 300, 600]);
    await expectRevert('OwnableUnauthorizedAccount', FACTORY, STREAM, streamAbi, 'setModeConfig', [1, 300, 600]);
    await expectRevert('InvalidMode', OWNER, STREAM, streamAbi, 'setModeConfig', [1, 299, 600]);
    await expectRevert('InvalidMode', OWNER, STREAM, streamAbi, 'setModeConfig', [1, 300, 7201]);
    const { hash } = await send(OWNER, STREAM, streamAbi, 'setModeConfig', [1, 300, 600]);
    await expectRevert('OwnableUnauthorizedAccount', rnd, STREAM, streamAbi, 'proposeTreasury', [rnd]);
    await expectRevert('ZeroAddress', OWNER, STREAM, streamAbi, 'proposeTreasury', [ZERO]);
    await send(OWNER, STREAM, streamAbi, 'proposeDisputeContract', [rnd]);
    await expectRevert('TimelockNotExpired', OWNER, STREAM, streamAbi, 'commitDisputeContract', []);
    return `tx ${hash}`;
  });

  // ───────── 2. Propose / accept / self-stream ─────────
  const funder = await mkFunder();
  const agent = await mkAgent('agent');
  let nsId = 0n; // non-self stream, accepted later

  await test('proposeStream: input validation reverts', async () => {
    const stranger = fresh();
    await expectRevert('AgentNotRegistered', funder, STREAM, streamAbi, 'proposeStream', [stranger, 10n * U, 3600n, 1, 0n]);
    await expectRevert('AmountTooLow', funder, STREAM, streamAbi, 'proposeStream', [agent, 199_999n, 3600n, 1, 0n]);
    await expectRevert('InvalidDuration', funder, STREAM, streamAbi, 'proposeStream', [agent, 10n * U, 0n, 1, 0n]);
    await expectRevert('InvalidMode', funder, STREAM, streamAbi, 'proposeStream', [agent, 10n * U, 3600n, 9, 0n]);
  });
  await test('proposeStream (funder != agent): created Proposed, USDC escrowed, score NOT initialised', async () => {
    const fb = await usdcBal(funder), sb = await usdcBal(STREAM);
    const fbWei = await pub.getBalance({ address: funder });
    const { id, hash, receipt } = await propose(funder, agent, 10n * U, 3600n);
    nsId = id;
    const s = await getStream(id);
    eq(s.status, ST.Proposed, 'status'); eq(s.funder, funder, 'funder'); eq(s.agent, agent, 'agent'); eq(s.totalAmount, 10n * U, 'total');
    eq(s.startTime, 0n, 'startTime'); eq(s.ratePerSecX18, (10n * U * 10n ** 18n) / 3600n, 'rate');
    const gasWei = receipt.gasUsed * receipt.effectiveGasPrice; // USDC is also the native gas token on Arc
    eq(fbWei - (await pub.getBalance({ address: funder })) - gasWei, 10n * U * WEI_PER_UNIT, 'funder debited (gas adjusted)'); eq((await usdcBal(STREAM)) - sb, 10n * U, 'stream credited');
    assert(!(await read(SCORE, scoreAbi, 'initialized', [agent])), 'score must not be initialised yet');
    const acts = parseEventLogs({ abi: streamAbi, logs: receipt.logs, eventName: 'StreamActivated' });
    assert(acts.length === 0, 'no StreamActivated for non-self stream');
    return `streamId=${id} tx ${hash}`;
  });
  await test('acceptStream: non-agent reverts NotAgent; funder cannot accept', async () => {
    await expectRevert('NotAgent', funder, STREAM, streamAbi, 'acceptStream', [nsId]);
    await expectRevert('NotAgent', fresh(), STREAM, streamAbi, 'acceptStream', [nsId]);
  });
  await test('acceptStream: agent activates, startTime set, real Score initialised to 400, event emitted', async () => {
    const { hash, receipt } = await send(agent, STREAM, streamAbi, 'acceptStream', [nsId]);
    const s = await getStream(nsId);
    const ts = await blockTs(receipt.blockNumber);
    eq(s.status, ST.Active, 'status'); eq(s.startTime, ts, 'startTime'); eq(s.lastHeartbeat, ts, 'lastHeartbeat');
    assert(await read(SCORE, scoreAbi, 'initialized', [agent]), 'score initialised');
    eq(await read(SCORE, scoreAbi, 'scores', [agent]), 400n, 'score 400');
    const act = parseEventLogs({ abi: streamAbi, logs: receipt.logs, eventName: 'StreamActivated' }) as any[];
    assert(act.length === 1 && act[0].args.streamId === nsId && act[0].args.startTime === ts, 'StreamActivated args');
    return `tx ${hash}`;
  });
  await test('acceptStream: second accept reverts WrongStatus', async () => {
    await expectRevert('WrongStatus', agent, STREAM, streamAbi, 'acceptStream', [nsId]);
  });

  await test('self-stream (funder == agent): starts Active immediately; StreamProposed then StreamActivated; score initialised', async () => {
    const a = await mkAgent('selfagent');
    await send(a, USDC, usdcAbi, 'approve', [STREAM, maxUint256]);
    const { id, hash, receipt } = await propose(a, a, 5n * U, 1000n);
    const s = await getStream(id);
    const ts = await blockTs(receipt.blockNumber);
    eq(s.status, ST.Active, 'status Active'); eq(s.startTime, ts, 'startTime'); eq(s.funder, a, 'funder'); eq(s.agent, a, 'agent');
    const prop = (parseEventLogs({ abi: streamAbi, logs: receipt.logs, eventName: 'StreamProposed' }) as any[])[0];
    const act = (parseEventLogs({ abi: streamAbi, logs: receipt.logs, eventName: 'StreamActivated' }) as any[])[0];
    assert(prop && act, 'both events present');
    assert(prop.logIndex < act.logIndex, `StreamProposed (${prop.logIndex}) must precede StreamActivated (${act.logIndex})`);
    eq(act.args.streamId, id, 'activated id');
    eq(await read(SCORE, scoreAbi, 'scores', [a]), 400n, 'score 400');
    return `streamId=${id} tx ${hash}`;
  });

  await test('cancelProposal: only funder, only Proposed; refund credited to pendingPayouts then claimable', async () => {
    const ag = await mkAgent('cancelagent'); const f = await mkFunder();
    const { id } = await propose(f, ag, 3n * U, 600n);
    await expectRevert('NotFunder', ag, STREAM, streamAbi, 'cancelProposal', [id]);
    await send(f, STREAM, streamAbi, 'cancelProposal', [id]);
    eq((await getStream(id)).status, ST.Cancelled, 'Cancelled');
    eq(await sRead('pendingPayouts', [f]), 3n * U, 'refund pending');
    await expectRevert('WrongStatus', f, STREAM, streamAbi, 'cancelProposal', [id]);
    await expectRevert('WrongStatus', ag, STREAM, streamAbi, 'acceptStream', [id]);
    await send(f, STREAM, streamAbi, 'claimPayout', []);
    eq(await sRead('pendingPayouts', [f]), 0n, 'cleared');
  });

  // ───────── 3. settleStream / claimPayout ─────────
  await test('settleStream: Proposed stream reverts WrongStatus (funder and agent)', async () => {
    const ag = await mkAgent('setprop'); const f = await mkFunder();
    const { id } = await propose(f, ag, 4n * U, 600n);
    await expectRevert('WrongStatus', f, STREAM, streamAbi, 'settleStream', [id]);
    await expectRevert('WrongStatus', ag, STREAM, streamAbi, 'settleStream', [id]);
  });
  await test('settleStream: non-participant reverts NotParticipant', async () => {
    await expectRevert('NotParticipant', fresh(), STREAM, streamAbi, 'settleStream', [nsId]);
  });

  // Full-duration settle + payouts on a NON-self stream
  const sAgent = await mkAgent('settleagent'); const sFunder = await mkFunder();
  const SETTLE_TOTAL = 10n * U + 7n; // odd amount to exercise rounding
  let sId = 0n;
  await test('settleStream: Active stream after duration — succeeds once; Completed; pendingPayouts == earned + refund', async () => {
    const p = await propose(sFunder, sAgent, SETTLE_TOTAL, 3600n);
    sId = p.id;
    await send(sAgent, STREAM, streamAbi, 'acceptStream', [sId]);
    await warp(3700);
    const { hash, receipt } = await send(sFunder, STREAM, streamAbi, 'settleStream', [sId]);
    const s = await getStream(sId);
    eq(s.status, ST.Completed, 'Completed');
    const ts = await blockTs(receipt.blockNumber);
    const active = ts - s.startTime > s.durationSecs ? s.durationSecs : ts - s.startTime;
    let expEarned = (s.ratePerSecX18 * active) / 10n ** 18n; if (expEarned > s.totalAmount) expEarned = s.totalAmount;
    eq(s.earnedAmount, expEarned, 'earnedAmount formula');
    const refund = s.totalAmount - s.earnedAmount;
    eq(await sRead('pendingPayouts', [sAgent]), s.earnedAmount, 'agent pending');
    eq(await sRead('pendingPayouts', [sFunder]), refund, 'funder pending');
    eq(s.earnedAmount + refund, SETTLE_TOTAL, 'earned + refund == total');
    const ev = (parseEventLogs({ abi: streamAbi, logs: receipt.logs, eventName: 'StreamCompleted' }) as any[])[0];
    assert(ev && ev.args.earned === s.earnedAmount && ev.args.refund === refund, 'StreamCompleted args');
    return `earned=${s.earnedAmount} refund=${refund} tx ${hash}`;
  });
  await test('settleStream: second settle reverts WrongStatus (both parties); settling Completed reverts', async () => {
    await expectRevert('WrongStatus', sFunder, STREAM, streamAbi, 'settleStream', [sId]);
    await expectRevert('WrongStatus', sAgent, STREAM, streamAbi, 'settleStream', [sId]);
    // a real mined second attempt must also fail and leave pendingPayouts untouched
    const pb = await sRead('pendingPayouts', [sAgent]);
    let reverted = false;
    try { await send(sFunder, STREAM, streamAbi, 'settleStream', [sId]); } catch { reverted = true; }
    assert(reverted, 'second settle tx must not succeed');
    eq(await sRead('pendingPayouts', [sAgent]), pb, 'pendingPayouts unchanged');
  });
  await test('claimPayout: agent receives exactly earned USDC once (stream balance -earned, native delta + gas == earned); second claim reverts NoPayout', async () => {
    const pend = (await sRead('pendingPayouts', [sAgent])) as bigint;
    const streamBefore = await usdcBal(STREAM); const nativeBefore = await pub.getBalance({ address: sAgent });
    const { hash, receipt } = await send(sAgent, STREAM, streamAbi, 'claimPayout', []);
    const gas = receipt.gasUsed * receipt.effectiveGasPrice;
    const nativeAfter = await pub.getBalance({ address: sAgent });
    eq(streamBefore - (await usdcBal(STREAM)), pend, 'stream balance decrease');
    eq(nativeAfter - nativeBefore + gas, pend * WEI_PER_UNIT, 'recipient net received (gas adjusted)');
    eq(await sRead('pendingPayouts', [sAgent]), 0n, 'pending cleared');
    const ev = (parseEventLogs({ abi: streamAbi, logs: receipt.logs, eventName: 'PayoutClaimed' }) as any[])[0];
    assert(ev && ev.args.amount === pend && ev.args.recipient.toLowerCase() === sAgent.toLowerCase(), 'PayoutClaimed event');
    await expectRevert('NoPayout', sAgent, STREAM, streamAbi, 'claimPayout', []);
    return `paid=${pend} gasWei=${gas} tx ${hash}`;
  });
  await test('claimPayout: funder refund paid once; non-party with nothing reverts NoPayout', async () => {
    const pend = (await sRead('pendingPayouts', [sFunder])) as bigint;
    const sb = await usdcBal(STREAM);
    await send(sFunder, STREAM, streamAbi, 'claimPayout', []);
    eq(sb - (await usdcBal(STREAM)), pend, 'stream balance decrease');
    await expectRevert('NoPayout', sFunder, STREAM, streamAbi, 'claimPayout', []);
    await expectRevert('NoPayout', fresh(), STREAM, streamAbi, 'claimPayout', []);
  });

  // Partial settle by the agent mid-stream
  await test('settleStream: mid-stream settle (by agent) splits earned/refund proportionally; conservation holds', async () => {
    const ag = await mkAgent('midagent'); const f = await mkFunder();
    const { id } = await propose(f, ag, 20n * U, 2000n);
    await send(ag, STREAM, streamAbi, 'acceptStream', [id]);
    await warp(1000);
    const { receipt } = await send(ag, STREAM, streamAbi, 'settleStream', [id]);
    const s = await getStream(id); const ts = await blockTs(receipt.blockNumber);
    const expEarned = (s.ratePerSecX18 * (ts - s.startTime)) / 10n ** 18n;
    eq(s.earnedAmount, expEarned, 'earned'); eq(s.status, ST.Completed, 'Completed');
    assert(s.earnedAmount > 9n * U && s.earnedAmount < 11n * U, 'about half earned: ' + s.earnedAmount);
    eq((await sRead('pendingPayouts', [ag])) + (await sRead('pendingPayouts', [f])), 20n * U, 'conservation');
    // the Completed stream can't be settled again
    await expectRevert('WrongStatus', f, STREAM, streamAbi, 'settleStream', [id]);
  });

  await test('settleStream: Reclaimed (cancelTimedOutStream) stream reverts WrongStatus; timeout slashes score by 100, agent paid earned, refund (penalty folded in, no treasury)', async () => {
    const ag = await mkAgent('toagent'); const f = await mkFunder();
    const { id } = await propose(f, ag, 10n * U, 100000n);
    await send(ag, STREAM, streamAbi, 'acceptStream', [id]);
    await expectRevert('StreamNotTimedOut', fresh(), STREAM, streamAbi, 'cancelTimedOutStream', [id]);
    const sc0 = (await read(SCORE, scoreAbi, 'scores', [ag])) as bigint;
    await warp(1000); // > 300 + 600
    assert(await sRead('isTimedOut', [id]), 'isTimedOut');
    const { receipt } = await send(fresh().length ? await actor(fresh()) : ag, STREAM, streamAbi, 'cancelTimedOutStream', [id]);
    const s = await getStream(id);
    eq(s.status, ST.Reclaimed, 'Reclaimed');
    eq((await sRead('pendingPayouts', [ag])) + (await sRead('pendingPayouts', [f])), 10n * U, 'conservation');
    eq(await read(SCORE, scoreAbi, 'scores', [ag]), sc0 - 100n, 'score slashed 100');
    eq(await read(SCORE, scoreAbi, 'failedStreams', [ag]), 1n, 'failedStreams');
    await expectRevert('WrongStatus', f, STREAM, streamAbi, 'settleStream', [id]);
  });

  // ───────── 4. Heartbeats ─────────
  await test('sendHeartbeat: HeartbeatTooEarly before interval; NotAgent for others; WrongStatus on Proposed', async () => {
    const ag = await mkAgent('hbagent'); const f = await mkFunder();
    const prop = await propose(f, ag, 10n * U, 86400n);
    await expectRevert('WrongStatus', ag, STREAM, streamAbi, 'sendHeartbeat', [prop.id]);
    await send(ag, STREAM, streamAbi, 'acceptStream', [prop.id]);
    await expectRevert('HeartbeatTooEarly', ag, STREAM, streamAbi, 'sendHeartbeat', [prop.id]);
    await expectRevert('NotAgent', f, STREAM, streamAbi, 'sendHeartbeat', [prop.id]);
    await warp(100);
    await expectRevert('HeartbeatTooEarly', ag, STREAM, streamAbi, 'sendHeartbeat', [prop.id]);
  });
  await test('sendHeartbeat: succeeds after interval; real Score +1; lastHeartbeat updated; immediate repeat reverts', async () => {
    const ag = await mkAgent('hb2agent'); const f = await mkFunder();
    const { id } = await propose(f, ag, 10n * U, 86400n);
    await send(ag, STREAM, streamAbi, 'acceptStream', [id]);
    const s0 = (await read(SCORE, scoreAbi, 'scores', [ag])) as bigint;
    eq(s0, 400n, 'initial score');
    await warp(301);
    const { hash, receipt } = await send(ag, STREAM, streamAbi, 'sendHeartbeat', [id]);
    eq(await read(SCORE, scoreAbi, 'scores', [ag]), s0 + 1n, 'score +1');
    const s = await getStream(id); eq(s.lastHeartbeat, await blockTs(receipt.blockNumber), 'lastHeartbeat');
    assert(s.earnedAmount > 0n, 'earned accrued');
    const ev = parseEventLogs({ abi: streamAbi, logs: receipt.logs, eventName: 'HeartbeatSent' });
    assert(ev.length === 1, 'HeartbeatSent event');
    await expectRevert('HeartbeatTooEarly', ag, STREAM, streamAbi, 'sendHeartbeat', [id]);
    await warp(301);
    await send(ag, STREAM, streamAbi, 'sendHeartbeat', [id]);
    eq(await read(SCORE, scoreAbi, 'scores', [ag]), s0 + 2n, 'score +2 after second');
    return `tx ${hash}`;
  });
  await test('sendHeartbeat: remaining locked < 1 USDC => succeeds but score unchanged', async () => {
    const ag = await mkAgent('hb3agent'); const f = await mkFunder();
    const { id } = await propose(f, ag, 2n * U, 1000n);
    await send(ag, STREAM, streamAbi, 'acceptStream', [id]);
    await warp(600);
    await send(ag, STREAM, streamAbi, 'sendHeartbeat', [id]);
    eq(await read(SCORE, scoreAbi, 'scores', [ag]), 400n, 'score unchanged (locked < 1 USDC)');
  });
  await test('sendHeartbeat: settled (Completed) stream reverts WrongStatus', async () => {
    await expectRevert('WrongStatus', sAgent, STREAM, streamAbi, 'sendHeartbeat', [sId]);
  });

  // ───────── 5. Ownership ─────────
  await test('renounceOwnership: reverts RenounceDisabled for owner; non-owner reverts Unauthorized; owner unchanged', async () => {
    await expectRevert('RenounceDisabled', OWNER, STREAM, streamAbi, 'renounceOwnership', []);
    await expectRevert('OwnableUnauthorizedAccount', fresh(), STREAM, streamAbi, 'renounceOwnership', []);
    let reverted = false;
    try { await send(OWNER, STREAM, streamAbi, 'renounceOwnership', []); } catch { reverted = true; }
    assert(reverted, 'tx must not succeed');
    eq(await sRead('owner'), OWNER, 'owner unchanged');
  });
  await test('transferOwnership is two-step: pendingOwner set, owner unchanged until acceptOwnership; only pending can accept', async () => {
    const newOwner = await actor(fresh()); const other = await actor(fresh());
    await expectRevert('OwnableUnauthorizedAccount', other, STREAM, streamAbi, 'transferOwnership', [other]);
    await send(OWNER, STREAM, streamAbi, 'transferOwnership', [newOwner]);
    eq(await sRead('owner'), OWNER, 'owner still old'); eq(await sRead('pendingOwner'), newOwner, 'pendingOwner');
    await expectRevert('OwnableUnauthorizedAccount', other, STREAM, streamAbi, 'acceptOwnership', []);
    await expectRevert('OwnableUnauthorizedAccount', OWNER, STREAM, streamAbi, 'acceptOwnership', []);
    // old owner retains admin power during pending
    await send(OWNER, STREAM, streamAbi, 'setModeConfig', [1, 300, 600]);
    await send(newOwner, STREAM, streamAbi, 'acceptOwnership', []);
    eq(await sRead('owner'), newOwner, 'owner == new'); eq(await sRead('pendingOwner'), ZERO, 'pending cleared');
    await expectRevert('OwnableUnauthorizedAccount', OWNER, STREAM, streamAbi, 'setModeConfig', [1, 300, 600]);
    await send(newOwner, STREAM, streamAbi, 'setModeConfig', [1, 300, 600]);
    // hand back to the original owner (two-step) to leave the fork consistent
    await send(newOwner, STREAM, streamAbi, 'transferOwnership', [OWNER]);
    await send(OWNER, STREAM, streamAbi, 'acceptOwnership', []);
    eq(await sRead('owner'), OWNER, 'owner restored');
  });

  console.log(JSON.stringify({ summary: { passed, failed, failures } }));
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error('FATAL', e?.shortMessage ?? e?.message ?? e); process.exit(2); });
