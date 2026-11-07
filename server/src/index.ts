import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import {
  getLiveRates,
  verifyRecipientAccount,
  executeBatchPayout,
  getBlaaizHealth,
  SUPPORTED_CURRENCIES,
  SUPPORTED_BANKS,
} from './lib/blaaiz.js';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '4001', 10);

app.use(cors());
app.use(express.json());

// ─── In-memory payroll store (replace with Prisma for production) ───
interface TeamMember {
  id: string;
  name: string;
  role: string;
  email: string;
  currency: string;
  bankCode: string;
  accountNumber: string;
  accountName: string;
  salaryUSD: number;
  status: 'active' | 'inactive';
  addedAt: string;
}

interface PayrollRun {
  id: string;
  label: string;
  sourceCurrency: string;
  totalSourceAmount: number;
  members: Array<{
    memberId: string;
    name: string;
    amountUSD: number;
    amountLocal: number;
    currency: string;
    fxRate: number;
    status: string;
    paidAt: string | null;
    reference: string;
  }>;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  createdAt: string;
  completedAt?: string;
  blaaizBatchId?: string;
  mode?: string;
}

const teamMembers: TeamMember[] = [
  {
    id: 'mbr_001',
    name: 'Tunde Adeniyi',
    role: 'Full-Stack Engineer',
    email: 'tunde@splitborder.app',
    currency: 'NGN',
    bankCode: '058',
    accountNumber: '0123456789',
    accountName: 'TUNDE ADENIYI BALOGUN',
    salaryUSD: 2500,
    status: 'active',
    addedAt: new Date(Date.now() - 86400000 * 60).toISOString(),
  },
  {
    id: 'mbr_002',
    name: 'Kwame Mensah',
    role: 'Product Designer',
    email: 'kwame@splitborder.app',
    currency: 'GHS',
    bankCode: 'MTN_GH',
    accountNumber: '0244000001',
    accountName: 'KWAME EMMANUEL MENSAH',
    salaryUSD: 1800,
    status: 'active',
    addedAt: new Date(Date.now() - 86400000 * 45).toISOString(),
  },
  {
    id: 'mbr_003',
    name: 'Faith Njoroge',
    role: 'Backend Engineer',
    email: 'faith@splitborder.app',
    currency: 'KES',
    bankCode: 'MPESA_KE',
    accountNumber: '0712000003',
    accountName: 'FAITH MUTHONI NJOROGE',
    salaryUSD: 2100,
    status: 'active',
    addedAt: new Date(Date.now() - 86400000 * 30).toISOString(),
  },
  {
    id: 'mbr_004',
    name: 'Sarah Jenkins',
    role: 'DevOps Engineer',
    email: 'sarah@splitborder.app',
    currency: 'GBP',
    bankCode: 'BARC_UK',
    accountNumber: '12345678',
    accountName: 'SARAH JENKINS',
    salaryUSD: 4200,
    status: 'active',
    addedAt: new Date(Date.now() - 86400000 * 20).toISOString(),
  },
];

const payrollHistory: PayrollRun[] = [
  {
    id: 'run_oct_001',
    label: 'October 2026 Payroll',
    sourceCurrency: 'USD',
    totalSourceAmount: 10600,
    status: 'COMPLETED',
    createdAt: new Date(Date.now() - 86400000 * 10).toISOString(),
    completedAt: new Date(Date.now() - 86400000 * 10 + 3000).toISOString(),
    blaaizBatchId: 'BATCH-OCT2026',
    mode: 'BLAAIZ_SETTLEMENT_RAIL',
    members: teamMembers.map(m => ({
      memberId: m.id,
      name: m.name,
      amountUSD: m.salaryUSD,
      amountLocal: m.currency === 'NGN' ? m.salaryUSD * 1618.5
        : m.currency === 'GHS' ? m.salaryUSD * 15.35
        : m.currency === 'KES' ? m.salaryUSD * 129.2
        : m.salaryUSD * 0.78,
      currency: m.currency,
      fxRate: m.currency === 'NGN' ? 1618.5 : m.currency === 'GHS' ? 15.35 : m.currency === 'KES' ? 129.2 : 0.78,
      status: 'SETTLED',
      paidAt: new Date(Date.now() - 86400000 * 10 + 3000).toISOString(),
      reference: `PAY-${m.id.toUpperCase()}-OCT26`,
    })),
  },
];

// ─── API Routes ───────────────────────────────────────────────────────────────

// Health / status
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'SplitBorder API', timestamp: new Date().toISOString() });
});

app.get('/api/blaaiz/health', (_req, res) => {
  res.json(getBlaaizHealth());
});

// Supported meta
app.get('/api/meta/currencies', (_req, res) => {
  res.json({ currencies: SUPPORTED_CURRENCIES });
});

app.get('/api/meta/banks', (req, res) => {
  const { currency } = req.query;
  const banks = currency
    ? SUPPORTED_BANKS.filter(b => b.currency === String(currency))
    : SUPPORTED_BANKS;
  res.json({ banks });
});

// Live FX rates from Blaaiz
app.get('/api/rates', async (req, res) => {
  try {
    const source = String(req.query.source || 'USD');
    const data = await getLiveRates(source);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Rate fetch failed', detail: (err as Error).message });
  }
});

// Verify a recipient bank account
app.post('/api/verify-account', async (req, res) => {
  const { accountNumber, bankCode, currency } = req.body;
  if (!accountNumber || !bankCode) {
    res.status(400).json({ error: 'accountNumber and bankCode are required' });
    return;
  }
  try {
    const result = await verifyRecipientAccount(accountNumber, bankCode, currency || 'NGN');
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Verification failed', detail: (err as Error).message });
  }
});

// ─── Team Members ───────────────────────────────────────────────────────────
app.get('/api/team', (_req, res) => {
  res.json({ members: teamMembers });
});

app.post('/api/team', async (req, res) => {
  const { name, role, email, currency, bankCode, accountNumber, salaryUSD } = req.body;
  if (!name || !currency || !bankCode || !accountNumber || !salaryUSD) {
    res.status(400).json({ error: 'All fields are required' });
    return;
  }

  try {
    const verif = await verifyRecipientAccount(accountNumber, bankCode, currency);
    const member: TeamMember = {
      id: `mbr_${Date.now().toString(36)}`,
      name,
      role: role || 'Team Member',
      email: email || '',
      currency,
      bankCode,
      accountNumber,
      accountName: verif.accountName || name.toUpperCase(),
      salaryUSD: parseFloat(salaryUSD),
      status: 'active',
      addedAt: new Date().toISOString(),
    };
    teamMembers.push(member);
    res.status(201).json(member);
  } catch (err) {
    res.status(500).json({ error: 'Failed to add team member', detail: (err as Error).message });
  }
});

app.patch('/api/team/:id', (req, res) => {
  const member = teamMembers.find(m => m.id === req.params.id);
  if (!member) {
    res.status(404).json({ error: 'Member not found' });
    return;
  }
  const { salaryUSD, status, role } = req.body;
  if (salaryUSD !== undefined) member.salaryUSD = parseFloat(salaryUSD);
  if (status !== undefined) member.status = status;
  if (role !== undefined) member.role = role;
  res.json(member);
});

app.delete('/api/team/:id', (req, res) => {
  const idx = teamMembers.findIndex(m => m.id === req.params.id);
  if (idx === -1) {
    res.status(404).json({ error: 'Member not found' });
    return;
  }
  const removed = teamMembers.splice(idx, 1)[0];
  res.json({ deleted: removed.id });
});

// ─── Payroll Preview & Execution ────────────────────────────────────────────
app.post('/api/payroll/preview', async (req, res) => {
  const { sourceCurrency = 'USD', memberIds } = req.body;
  const members = memberIds
    ? teamMembers.filter(m => (memberIds as string[]).includes(m.id) && m.status === 'active')
    : teamMembers.filter(m => m.status === 'active');

  try {
    const rateData = await getLiveRates(sourceCurrency);
    const rates = rateData.rates as Record<string, number>;

    const breakdown = members.map(m => {
      const rate = rates[m.currency] || 1;
      return {
        memberId: m.id,
        name: m.name,
        role: m.role,
        amountUSD: m.salaryUSD,
        currency: m.currency,
        fxRate: rate,
        amountLocal: parseFloat((m.salaryUSD * rate).toFixed(2)),
        bank: SUPPORTED_BANKS.find(b => b.code === m.bankCode)?.name || m.bankCode,
        accountNumber: m.accountNumber,
        accountName: m.accountName,
      };
    });

    const totalSourceAmount = members.reduce((sum, m) => sum + m.salaryUSD, 0);
    const blaaizFee = parseFloat((totalSourceAmount * 0.009).toFixed(2)); // 0.9% fee simulation

    res.json({
      sourceCurrency,
      totalSourceAmount,
      blaaizFee,
      totalCharged: parseFloat((totalSourceAmount + blaaizFee).toFixed(2)),
      memberCount: members.length,
      countryCount: new Set(members.map(m => m.currency)).size,
      fxMode: rateData.mode,
      breakdown,
      ratesTimestamp: rateData.timestamp,
    });
  } catch (err) {
    res.status(500).json({ error: 'Preview failed', detail: (err as Error).message });
  }
});

app.post('/api/payroll/run', async (req, res) => {
  const { sourceCurrency = 'USD', label, memberIds } = req.body;
  const members = memberIds
    ? teamMembers.filter(m => (memberIds as string[]).includes(m.id) && m.status === 'active')
    : teamMembers.filter(m => m.status === 'active');

  if (members.length === 0) {
    res.status(400).json({ error: 'No active team members to pay' });
    return;
  }

  try {
    const rateData = await getLiveRates(sourceCurrency);
    const rates = rateData.rates as Record<string, number>;

    const payouts = members.map(m => {
      const rate = rates[m.currency] || 1;
      return {
        id: m.id,
        payeeName: m.name,
        amountSource: m.salaryUSD,
        amountTarget: parseFloat((m.salaryUSD * rate).toFixed(2)),
        currencySource: sourceCurrency,
        currencyTarget: m.currency,
        bankCode: m.bankCode,
        accountNumber: m.accountNumber,
        reference: `SB-${m.id.toUpperCase()}-${Date.now().toString(36).toUpperCase()}`,
      };
    });

    const result = await executeBatchPayout(payouts);

    const run: PayrollRun = {
      id: `run_${Date.now().toString(36)}`,
      label: label || `Payroll – ${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`,
      sourceCurrency,
      totalSourceAmount: members.reduce((s, m) => s + m.salaryUSD, 0),
      status: result.status === 'COMPLETED' ? 'COMPLETED' : 'FAILED',
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      blaaizBatchId: result.batchId,
      mode: result.mode,
      members: payouts.map((p, i) => {
        const disbursement = result.disbursements[i];
        return {
          memberId: p.id,
          name: p.payeeName,
          amountUSD: p.amountSource,
          amountLocal: p.amountTarget,
          currency: p.currencyTarget,
          fxRate: rates[p.currencyTarget] || 1,
          status: disbursement?.status || 'SETTLED',
          paidAt: disbursement?.timestamp || new Date().toISOString(),
          reference: disbursement?.payoutReference || p.reference,
        };
      }),
    };

    payrollHistory.unshift(run);
    res.json(run);
  } catch (err) {
    res.status(500).json({ error: 'Payroll run failed', detail: (err as Error).message });
  }
});

// ─── Payroll History ─────────────────────────────────────────────────────────
app.get('/api/payroll/history', (_req, res) => {
  res.json({ runs: payrollHistory });
});

app.get('/api/payroll/history/:id', (req, res) => {
  const run = payrollHistory.find(r => r.id === req.params.id);
  if (!run) {
    res.status(404).json({ error: 'Payroll run not found' });
    return;
  }
  res.json(run);
});

// ─── Dashboard stats ─────────────────────────────────────────────────────────
app.get('/api/dashboard/stats', (_req, res) => {
  const totalPaid = payrollHistory
    .filter(r => r.status === 'COMPLETED')
    .reduce((s, r) => s + r.totalSourceAmount, 0);

  const activeMembers = teamMembers.filter(m => m.status === 'active').length;
  const countriesCount = new Set(teamMembers.map(m => m.currency)).size;
  const lastRun = payrollHistory[0] || null;

  res.json({
    totalUSDDispatched: totalPaid,
    activeMembers,
    countriesCovered: countriesCount,
    totalRuns: payrollHistory.length,
    lastRunAt: lastRun?.completedAt || null,
    lastRunId: lastRun?.id || null,
  });
});

app.listen(PORT, () => {
  console.log(`\n  ◆ SplitBorder API running at http://localhost:${PORT}`);
  console.log(`  ◆ Blaaiz Health: ${JSON.stringify(getBlaaizHealth())}\n`);
});
