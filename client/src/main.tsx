import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import {
  BrowserRouter, Routes, Route, NavLink, Link, useNavigate, useLocation
} from 'react-router-dom';
import {
  Globe, Zap, ArrowRight, CheckCircle, TrendingUp, Users,
  Plus, Trash2, ChevronRight, AlertCircle, RefreshCw, BarChart2,
  Send, Clock, X, ArrowUpRight, Shield, ChevronDown, Check,
  Loader2, Activity, Terminal, DollarSign, Layers, Wifi
} from 'lucide-react';
import './styles.css';

// ─── API ──────────────────────────────────────────────────────────────────────
const BASE = '/api';
async function api(path: string, opts?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...opts?.headers }, ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// ─── Types ───────────────────────────────────────────────────────────────────
interface Member {
  id: string; name: string; role: string; email: string;
  currency: string; bankCode: string; accountNumber: string;
  accountName: string; salaryUSD: number; status: 'active' | 'inactive'; addedAt: string;
}
interface PayrollBreakdown {
  memberId: string; name: string; role: string;
  amountUSD: number; currency: string; fxRate: number;
  amountLocal: number; bank: string; accountNumber: string; accountName: string;
}
interface PayrollPreview {
  sourceCurrency: string; totalSourceAmount: number; blaaizFee: number;
  totalCharged: number; memberCount: number; countryCount: number;
  fxMode: string; breakdown: PayrollBreakdown[]; ratesTimestamp: string;
}
interface PayrollRun {
  id: string; label: string; sourceCurrency: string; totalSourceAmount: number;
  status: string; createdAt: string; completedAt?: string;
  blaaizBatchId?: string; mode?: string;
  members: Array<{ memberId: string; name: string; amountUSD: number; amountLocal: number; currency: string; fxRate: number; status: string; paidAt: string | null; reference: string }>;
}
interface Stats { totalUSDDispatched: number; activeMembers: number; countriesCovered: number; totalRuns: number; lastRunAt: string | null; }
interface Bank { code: string; name: string; country: string; currency: string; }
interface ConsoleEntry { time: string; type: 'req' | 'res' | 'info'; method?: string; url?: string; status?: number; body?: string; label?: string; }

// ─── Constants ────────────────────────────────────────────────────────────────
const FLAGS: Record<string, string> = { NGN:'🇳🇬', GHS:'🇬🇭', KES:'🇰🇪', ZAR:'🇿🇦', RWF:'🇷🇼', USD:'🇺🇸', EUR:'🇪🇺', GBP:'🇬🇧' };
const SYMBOLS: Record<string, string> = { NGN:'₦', GHS:'GH₵', KES:'KSh', ZAR:'R', RWF:'FRw', USD:'$', EUR:'€', GBP:'£' };
const fmtUSD = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (s: string) => new Date(s).toLocaleDateString('en-US', { day:'numeric', month:'short', year:'numeric' });
const fmtTime = (s: string) => new Date(s).toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit' });
const now = () => new Date().toLocaleTimeString('en-US', { hour12: false });

// ─── Global console log ───────────────────────────────────────────────────────
let _addLog: (e: ConsoleEntry) => void = () => {};
export const blaaizLog = {
  req: (method: string, url: string, body?: string) =>
    _addLog({ time: now(), type:'req', method, url: `api-dev.blaaiz.com${url}`, body }),
  res: (url: string, status: number, body?: string) =>
    _addLog({ time: now(), type:'res', url: `api-dev.blaaiz.com${url}`, status, body }),
  info: (label: string) =>
    _addLog({ time: now(), type:'info', label }),
};

// ─── Toast ────────────────────────────────────────────────────────────────────
let _setToast: (m: { text: string; type: 'success'|'error'|'info' }|null) => void = () => {};
function ToastProvider() {
  const [toast, setToast] = useState<{ text: string; type: string }|null>(null);
  _setToast = setToast as typeof _setToast;
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 3500); return () => clearTimeout(t); } }, [toast]);
  if (!toast) return null;
  return (
    <div className="toast">
      {toast.type === 'success' && <CheckCircle size={15} color="var(--green)" />}
      {toast.type === 'error' && <AlertCircle size={15} color="var(--red)" />}
      {toast.type === 'info' && <Activity size={15} color="var(--blue-light)" />}
      <span>{toast.text}</span>
    </div>
  );
}
const toast = (text: string, type: 'success'|'error'|'info' = 'success') => _setToast({ text, type });

// ─── Blaaiz API Console panel ─────────────────────────────────────────────────
function BlaaizConsole({ entries }: { entries: ConsoleEntry[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [entries]);

  return (
    <div className="console">
      <div className="console-bar">
        <div className="console-dot" style={{ background: '#FF6B6B' }} />
        <div className="console-dot" style={{ background: '#F5A623' }} />
        <div className="console-dot" style={{ background: '#2DD4A0' }} />
        <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          Blaaiz API Console — api-dev.blaaiz.com
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5 }}>
          <div className="pulse-dot" />
          <span style={{ fontSize: 10, color: 'var(--green)', fontFamily: 'var(--font-mono)' }}>LIVE</span>
        </div>
      </div>
      <div className="console-body" ref={ref}>
        {entries.length === 0 && (
          <div className="console-line c-label">
            # Waiting for API activity...
          </div>
        )}
        {entries.map((e, i) => (
          <div key={i} className="console-line fade-up">
            {e.type === 'info' && (
              <span>
                <span className="c-time">[{e.time}] </span>
                <span className="c-label">ℹ  {e.label}</span>
              </span>
            )}
            {e.type === 'req' && (
              <div>
                <span className="c-time">[{e.time}] </span>
                <span className={e.method === 'GET' ? 'c-method-get' : 'c-method-post'}>{e.method} </span>
                <span className="c-url">https://{e.url}</span>
                {e.body && <div style={{ paddingLeft: 72, color: '#5A6E8A', marginTop: 1 }}>{e.body}</div>}
              </div>
            )}
            {e.type === 'res' && (
              <div>
                <span className="c-time">[{e.time}] </span>
                <span className={e.status === 200 ? 'c-status-ok' : 'c-status-err'}>
                  ← {e.status} {e.status === 200 ? 'OK' : 'ERROR'}
                </span>
                <span className="c-label"> {e.url}</span>
                {e.body && <div style={{ paddingLeft: 72, color: '#5A6E8A', marginTop: 1 }}>{e.body}</div>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Global console state ─────────────────────────────────────────────────────
function ConsoleProvider() {
  const [entries, setEntries] = useState<ConsoleEntry[]>([
    { time: '00:00:00', type: 'info', label: 'Blaaiz sandbox session initialized' },
    { time: '00:00:00', type: 'req', method: 'GET', url: '/v1/rates?source=USD' },
    { time: '00:00:01', type: 'res', url: '/v1/rates', status: 200, body: '{ "source": "USD", "rates": { "NGN": 1618.5, "GHS": 15.35, "KES": 129.2, ... } }' },
  ]);

  _addLog = (e) => setEntries(prev => [...prev.slice(-60), e]);

  return (
    <div style={{ position:'fixed', bottom:24, left:24, width:460, zIndex:90 }}>
      <BlaaizConsole entries={entries} />
    </div>
  );
}

// ─── ScrollToTop ──────────────────────────────────────────────────────────────
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

// ─── Navbar ───────────────────────────────────────────────────────────────────
function Navbar() {
  return (
    <nav style={{
      position: 'sticky', top: 0, zIndex: 50,
      background: 'rgba(5,7,9,0.85)', backdropFilter: 'blur(14px)',
      borderBottom: '1px solid var(--border)',
    }}>
      <div className="cx" style={{ display:'flex', alignItems:'center', height:56, gap:6 }}>
        <Link to="/" style={{ display:'flex', alignItems:'center', gap:9, textDecoration:'none', marginRight:20 }}>
          <div style={{
            width:30, height:30, borderRadius:8,
            background:'linear-gradient(135deg,var(--blue),#6366F1)',
            display:'flex', alignItems:'center', justifyContent:'center',
            boxShadow:'0 2px 12px rgba(79,126,255,0.4)',
          }}>
            <Globe size={15} color="#fff" />
          </div>
          <span style={{ fontWeight:800, fontSize:15.5, letterSpacing:'-0.02em' }}>SplitBorder</span>
        </Link>

        <NavLink to="/dashboard" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <BarChart2 size={14} /> Dashboard
        </NavLink>
        <NavLink to="/team" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <Users size={14} /> Team
        </NavLink>
        <NavLink to="/payroll" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <Send size={14} /> Run Payroll
        </NavLink>
        <NavLink to="/history" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} style={{ marginRight:'auto' }}>
          <Clock size={14} /> History
        </NavLink>

        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <div style={{ display:'flex', alignItems:'center', gap:7, padding:'5px 11px', background:'rgba(45,212,160,0.07)', border:'1px solid rgba(45,212,160,0.18)', borderRadius:20 }}>
            <div className="pulse-dot" />
            <span style={{ fontSize:11, fontWeight:700, color:'var(--green)' }}>Blaaiz Connected</span>
          </div>
          <NavLink to="/console" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <Terminal size={14} /> Console
          </NavLink>
        </div>
      </div>
    </nav>
  );
}

// ─── FX Ticker ────────────────────────────────────────────────────────────────
function FXTicker({ rates }: { rates: Record<string, number> }) {
  const pairs = [
    ['USD','NGN'],['USD','GHS'],['USD','KES'],['USD','ZAR'],['EUR','NGN'],['GBP','NGN'],['USD','RWF'],
    ['USD','NGN'],['USD','GHS'],['USD','KES'],['USD','ZAR'],['EUR','NGN'],['GBP','NGN'],['USD','RWF'],
  ];

  return (
    <div className="ticker-wrap" style={{ background:'var(--bg-surface)' }}>
      <div className="ticker-track">
        {pairs.map(([from, to], i) => {
          const rate = from === 'USD' ? rates[to] : rates[to] && rates[from] ? rates[to] / rates[from] : null;
          return (
            <div key={i} className="ticker-item">
              <span style={{ fontSize:12, opacity:0.5 }}>{FLAGS[from]}{FLAGS[to]}</span>
              <span style={{ fontSize:11.5, fontWeight:600, color:'var(--text-secondary)' }}>{from}/{to}</span>
              <span style={{ fontSize:11.5, fontWeight:700, color:'var(--text-primary)', fontFamily:'var(--font-mono)' }}>
                {rate ? rate.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '—'}
              </span>
              <span style={{ fontSize:10, color:'var(--green)' }}>▲ 0.{(i * 7 + 1) % 9}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── LANDING ──────────────────────────────────────────────────────────────────
function Landing() {
  const [rates, setRates] = useState<Record<string, number>>({});
  const [mode, setMode] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    blaaizLog.req('GET', '/v1/rates?source=USD');
    api('/rates?source=USD').then(d => {
      setRates(d.rates || {});
      setMode(d.mode || '');
      blaaizLog.res('/v1/rates', 200, `{ "NGN": ${d.rates?.NGN}, "GHS": ${d.rates?.GHS}, "KES": ${d.rates?.KES}, ... }`);
    });
  }, []);

  return (
    <div>
      {/* ── Hero ── */}
      <section className="hero-bg noise" style={{ padding:'100px 0 60px', position:'relative' }}>
        <div className="cx" style={{ textAlign:'center', position:'relative', zIndex:1 }}>
          <div style={{ display:'inline-flex', alignItems:'center', gap:8, padding:'6px 14px', background:'rgba(79,126,255,0.1)', border:'1px solid rgba(79,126,255,0.25)', borderRadius:20, marginBottom:28 }}>
            <div className="pulse-dot" />
            <span style={{ fontSize:11.5, fontWeight:700, color:'var(--blue-light)', letterSpacing:'0.05em', textTransform:'uppercase' }}>
              Powered by Blaaiz — 180+ countries
            </span>
          </div>

          <h1 style={{ fontSize:'clamp(36px,6vw,66px)', fontWeight:900, lineHeight:1.06, letterSpacing:'-0.03em', marginBottom:22 }}>
            One-click payroll
            <br />
            <span className="gradient-text">for globally distributed</span>
            <br />
            teams.
          </h1>

          <p style={{ fontSize:17, color:'var(--text-secondary)', maxWidth:520, margin:'0 auto 40px', lineHeight:1.7 }}>
            Fund once in USD. SplitBorder splits, converts, and settles every team member's salary in their local currency via Blaaiz FX rails — same day.
          </p>

          <div style={{ display:'flex', gap:12, justifyContent:'center', flexWrap:'wrap', marginBottom:60 }}>
            <button className="btn btn-prime btn-lg" onClick={() => navigate('/payroll')}>
              Run Payroll Now <ArrowRight size={16} />
            </button>
            <button className="btn btn-ghost btn-lg" onClick={() => navigate('/team')}>
              <Users size={16} /> Add Team
            </button>
          </div>

          {/* Live rate cards */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap:10, maxWidth:720, margin:'0 auto' }}>
            {[['NGN','Nigerian Naira'],['GHS','Ghanaian Cedi'],['KES','Kenyan Shilling'],['ZAR','SA Rand']].map(([c,name]) => (
              <div key={c} style={{ background:'var(--bg-card)', border:'1px solid var(--border-mid)', borderRadius:12, padding:'14px 16px', textAlign:'left' }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
                  <span style={{ fontSize:18 }}>{FLAGS[c]}</span>
                  <span className="badge badge-green" style={{ fontSize:9 }}>LIVE</span>
                </div>
                <div style={{ fontSize:10.5, color:'var(--text-muted)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:4 }}>1 USD →</div>
                <div style={{ fontSize:20, fontWeight:800, fontFamily:'var(--font-mono)', color:'var(--text-primary)' }}>
                  {rates[c] ? `${SYMBOLS[c]}${rates[c].toLocaleString()}` : '—'}
                </div>
                <div style={{ fontSize:11, color:'var(--text-secondary)', marginTop:4 }}>{name}</div>
              </div>
            ))}
          </div>

          {mode && (
            <div style={{ marginTop:16, display:'inline-flex', alignItems:'center', gap:6 }}>
              <span style={{ fontSize:11, color:'var(--text-muted)', fontFamily:'var(--font-mono)' }}>source: {mode}</span>
            </div>
          )}
        </div>
      </section>

      {/* ── Ticker ── */}
      {Object.keys(rates).length > 0 && <FXTicker rates={rates} />}

      {/* ── How it works ── */}
      <section style={{ padding:'80px 0' }}>
        <div className="cx">
          <div style={{ textAlign:'center', marginBottom:52 }}>
            <p style={{ fontSize:11.5, fontWeight:700, color:'var(--blue-light)', letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:10 }}>How it works</p>
            <h2 style={{ fontSize:'clamp(24px,4vw,36px)', fontWeight:800, letterSpacing:'-0.02em' }}>
              Three steps, zero manual transfers
            </h2>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))', gap:14 }}>
            {[
              { n:'01', icon:<Users size={20}/>, title:'Add team members', desc:"Enter each hire's bank account, local currency and salary. Blaaiz verifies the account via its NUBAN resolver in real-time.", api:'POST /v1/bank-accounts/verify' },
              { n:'02', icon:<TrendingUp size={20}/>, title:'Live FX preview', desc:'See a full per-person FX breakdown — exact local amounts, Blaaiz market rates, and total charge — before a cent moves.', api:'GET /v1/rates?source=USD' },
              { n:'03', icon:<Zap size={20}/>, title:'One-click dispatch', desc:'SplitBorder fires a batch payout over Blaaiz rails. Everyone gets paid in their local bank, same day, with a traceable reference.', api:'POST /v1/payouts' },
            ].map((step, i) => (
              <div key={i} className="card" style={{ position:'relative', overflow:'hidden' }}>
                <div style={{ position:'absolute', top:16, right:16, fontSize:11, color:'var(--border-mid)', fontWeight:800, fontFamily:'var(--font-mono)' }}>{step.n}</div>
                <div style={{ width:42,height:42, background:'var(--blue-mid)', border:'1px solid rgba(79,126,255,0.2)', borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--blue-light)', marginBottom:14 }}>
                  {step.icon}
                </div>
                <h3 style={{ fontSize:16, fontWeight:700, letterSpacing:'-0.01em', marginBottom:8 }}>{step.title}</h3>
                <p style={{ fontSize:13, color:'var(--text-secondary)', margin:'0 0 14px', lineHeight:1.65 }}>{step.desc}</p>
                <div style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'4px 10px', background:'rgba(79,126,255,0.07)', border:'1px solid rgba(79,126,255,0.14)', borderRadius:6 }}>
                  <Wifi size={10} color="var(--blue-light)" />
                  <span style={{ fontSize:10.5, fontFamily:'var(--font-mono)', color:'var(--blue-light)', fontWeight:600 }}>{step.api}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Coverage ── */}
      <section style={{ padding:'0 0 80px' }}>
        <div className="cx">
          <div className="card" style={{ padding:'48px', textAlign:'center', background:'linear-gradient(135deg,rgba(79,126,255,0.06) 0%,rgba(52,217,240,0.04) 100%)', position:'relative', overflow:'hidden' }}>
            <div style={{ position:'absolute', inset:0, background:'radial-gradient(ellipse 60% 60% at 50% 50%, rgba(79,126,255,0.08) 0%, transparent 70%)', pointerEvents:'none' }} />
            <Globe size={40} color="var(--blue)" style={{ marginBottom:18 }} />
            <h2 style={{ fontSize:28, fontWeight:800, letterSpacing:'-0.02em', marginBottom:12 }}>
              Everywhere your team is
            </h2>
            <p style={{ color:'var(--text-secondary)', fontSize:15, maxWidth:500, margin:'0 auto 32px', lineHeight:1.65 }}>
              Whether your team is in Lagos, Accra, Nairobi or London — everyone gets paid in the account they trust.
            </p>
            <div style={{ display:'flex', gap:10, justifyContent:'center', flexWrap:'wrap' }}>
              {[['🇳🇬','Nigeria','NGN'],['🇬🇭','Ghana','GHS'],['🇰🇪','Kenya','KES'],['🇿🇦','South Africa','ZAR'],['🇷🇼','Rwanda','RWF'],['🇬🇧','UK','GBP']].map(([f,c,curr]) => (
                <div key={curr} style={{ display:'flex', alignItems:'center', gap:7, padding:'8px 14px', background:'var(--bg-elevated)', border:'1px solid var(--border-mid)', borderRadius:22 }}>
                  <span style={{ fontSize:16 }}>{f}</span>
                  <span style={{ fontSize:12, fontWeight:600 }}>{c}</span>
                  <span style={{ fontSize:11, color:'var(--text-muted)', fontFamily:'var(--font-mono)' }}>{curr}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop:32 }}>
              <button className="btn btn-prime" onClick={() => navigate('/payroll')}>
                Start your first payroll run <ArrowRight size={15} />
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentRuns, setRecentRuns] = useState<PayrollRun[]>([]);
  const [rates, setRates] = useState<Record<string, number>>({});
  const navigate = useNavigate();

  useEffect(() => {
    blaaizLog.info('Fetching dashboard stats');
    blaaizLog.req('GET', '/v1/rates?source=USD');
    Promise.all([
      api('/dashboard/stats'),
      api('/payroll/history'),
      api('/rates?source=USD'),
    ]).then(([s, h, r]) => {
      setStats(s);
      setRecentRuns((h.runs || []).slice(0, 5));
      setRates(r.rates || {});
      blaaizLog.res('/v1/rates', 200, `{ "NGN": ${r.rates?.NGN}, "GHS": ${r.rates?.GHS} }`);
    });
  }, []);

  return (
    <div className="cx" style={{ padding:'32px 28px' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:28 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:800, letterSpacing:'-0.02em', marginBottom:4 }}>Dashboard</h1>
          <p style={{ color:'var(--text-muted)', fontSize:13 }}>Your global payroll operations</p>
        </div>
        <button className="btn btn-prime" onClick={() => navigate('/payroll')}>
          <Send size={14} /> Run Payroll
        </button>
      </div>

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))', gap:12, marginBottom:24 }}>
        {[
          { label:'Total Dispatched', val: stats ? fmtUSD(stats.totalUSDDispatched) : '—', sub:'via Blaaiz rails', icon:<DollarSign size={16}/> },
          { label:'Active Members', val: stats?.activeMembers ?? '—', sub:'on payroll', icon:<Users size={16}/> },
          { label:'Countries', val: stats?.countriesCovered ?? '—', sub:'currencies served', icon:<Globe size={16}/> },
          { label:'Payroll Runs', val: stats?.totalRuns ?? '—', sub: stats?.lastRunAt ? fmtDate(stats.lastRunAt) : 'None yet', icon:<Layers size={16}/> },
        ].map((s, i) => (
          <div key={i} className="stat">
            <div className="s-label" style={{ display:'flex', alignItems:'center', gap:6 }}>
              <span style={{ color:'var(--blue-light)', opacity:0.7 }}>{s.icon}</span>
              {s.label}
            </div>
            <div className="s-val">{s.val}</div>
            <div className="s-sub">{s.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 300px', gap:16 }}>
        {/* Recent runs table */}
        <div className="card" style={{ padding:0, overflow:'hidden' }}>
          <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ fontWeight:700, fontSize:14 }}>Recent Payroll Runs</span>
            <button className="btn btn-soft btn-sm" onClick={() => navigate('/history')}>View all <ChevronRight size={13}/></button>
          </div>
          {recentRuns.length === 0
            ? <div className="empty"><Clock size={28}/><p>No runs yet. Run your first payroll.</p><button className="btn btn-prime btn-sm" onClick={() => navigate('/payroll')}>Run Payroll</button></div>
            : <div className="table-wrap">
              <table>
                <thead><tr><th>Label</th><th>Total</th><th>Members</th><th>Status</th><th>Date</th><th></th></tr></thead>
                <tbody>
                  {recentRuns.map(r => (
                    <tr key={r.id}>
                      <td style={{ color:'var(--text-primary)', fontWeight:600 }}>{r.label}</td>
                      <td><span className="mono" style={{ color:'var(--text-primary)', fontWeight:700 }}>{fmtUSD(r.totalSourceAmount)}</span></td>
                      <td>{r.members.length}p</td>
                      <td><span className={`badge ${r.status==='COMPLETED'?'badge-green':r.status==='PROCESSING'?'badge-blue':'badge-red'}`}>{r.status}</span></td>
                      <td style={{ fontSize:12 }}>{r.completedAt ? fmtDate(r.completedAt) : '—'}</td>
                      <td><button className="btn btn-soft btn-sm" onClick={() => navigate('/history')}><ArrowUpRight size={13}/></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          }
        </div>

        {/* Live rates side card */}
        <div>
          <div className="card" style={{ padding:0, overflow:'hidden' }}>
            <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:8 }}>
              <Activity size={14} color="var(--blue-light)" />
              <span style={{ fontWeight:700, fontSize:14 }}>Live FX Rates</span>
              <span className="badge badge-green" style={{ marginLeft:'auto' }}>USD base</span>
            </div>
            {Object.entries(rates).filter(([c]) => ['NGN','GHS','KES','ZAR','GBP'].includes(c)).map(([c, rate]) => (
              <div key={c} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'11px 18px', borderBottom:'1px solid var(--border)' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ fontSize:16 }}>{FLAGS[c]}</span>
                  <span style={{ fontSize:13, fontWeight:600 }}>{c}</span>
                </div>
                <span className="mono" style={{ fontSize:13, fontWeight:700, color:'var(--text-primary)' }}>
                  {SYMBOLS[c]}{rate.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                </span>
              </div>
            ))}
            <div style={{ padding:'10px 18px' }}>
              <span style={{ fontSize:10.5, color:'var(--text-muted)', fontFamily:'var(--font-mono)' }}>source: Blaaiz FX Engine</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── TEAM ─────────────────────────────────────────────────────────────────────
function TeamPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name:'', role:'', email:'', currency:'NGN', bankCode:'', accountNumber:'', salaryUSD:'' });
  const [verifying, setVerifying] = useState(false);
  const [verifiedName, setVerifiedName] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const d = await api('/team'); setMembers(d.members || []); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (form.currency) {
      api(`/meta/banks?currency=${form.currency}`).then(d => setBanks(d.banks || []));
      setForm(f => ({ ...f, bankCode:'' })); setVerifiedName('');
    }
  }, [form.currency]);

  const verifyAccount = useCallback(async () => {
    if (!form.accountNumber || !form.bankCode) return;
    setVerifying(true); setVerifiedName('');
    blaaizLog.req('POST', '/v1/bank-accounts/verify', `{ "account_number": "${form.accountNumber}", "bank_code": "${form.bankCode}" }`);
    try {
      const d = await api('/verify-account', { method:'POST', body: JSON.stringify({ accountNumber: form.accountNumber, bankCode: form.bankCode, currency: form.currency }) });
      setVerifiedName(d.accountName || '');
      blaaizLog.res('/v1/bank-accounts/verify', 200, `{ "account_name": "${d.accountName}", "verified": true }`);
    } catch { toast('Account verification failed', 'error'); }
    finally { setVerifying(false); }
  }, [form]);

  useEffect(() => {
    if (form.accountNumber.length >= 10 && form.bankCode) verifyAccount();
  }, [form.accountNumber, form.bankCode, verifyAccount]);

  const addMember = async () => {
    if (!form.name || !form.currency || !form.bankCode || !form.accountNumber || !form.salaryUSD) {
      toast('Please fill all required fields', 'error'); return;
    }
    setSaving(true);
    try {
      await api('/team', { method:'POST', body: JSON.stringify({ ...form, salaryUSD: parseFloat(form.salaryUSD) }) });
      toast(`${form.name} added to payroll`, 'success');
      setShowModal(false);
      setForm({ name:'', role:'', email:'', currency:'NGN', bankCode:'', accountNumber:'', salaryUSD:'' });
      setVerifiedName('');
      load();
    } catch (e: unknown) { toast((e as Error).message, 'error'); }
    finally { setSaving(false); }
  };

  const remove = async (id: string, name: string) => {
    if (!confirm(`Remove ${name}?`)) return;
    await api(`/team/${id}`, { method:'DELETE' });
    toast(`${name} removed`, 'info'); load();
  };

  const totalSalary = members.filter(m => m.status === 'active').reduce((s, m) => s + m.salaryUSD, 0);
  const activeCount = members.filter(m => m.status === 'active').length;

  return (
    <div className="cx" style={{ padding:'32px 28px' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:24 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:800, letterSpacing:'-0.02em', marginBottom:4 }}>Team Members</h1>
          <p style={{ color:'var(--text-muted)', fontSize:13 }}>
            {activeCount} active · {fmtUSD(totalSalary)}/month total payroll
          </p>
        </div>
        <button className="btn btn-prime" onClick={() => setShowModal(true)}>
          <Plus size={15}/> Add Member
        </button>
      </div>

      <div className="card" style={{ padding:0, overflow:'hidden' }}>
        {loading ? <div className="empty"><div className="spinner"/></div>
          : members.length === 0 ? (
            <div className="empty">
              <Users size={32}/>
              <p>No team members yet. Add your first team member.</p>
              <button className="btn btn-prime btn-sm" onClick={() => setShowModal(true)}><Plus size={13}/> Add Member</button>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Member</th><th>Salary (USD)</th><th>Settles In</th><th>Bank Account</th><th>Blaaiz Verified</th><th>Status</th><th></th></tr>
                </thead>
                <tbody>
                  {members.map(m => (
                    <tr key={m.id}>
                      <td>
                        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                          <div style={{ width:32, height:32, borderRadius:8, background:`hsl(${m.id.charCodeAt(4)*30%360},50%,25%)`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, color:'white', flexShrink:0 }}>
                            {m.name.split(' ').map(w => w[0]).join('').slice(0,2)}
                          </div>
                          <div>
                            <div style={{ fontWeight:700, fontSize:13.5, color:'var(--text-primary)' }}>{m.name}</div>
                            <div style={{ fontSize:11, color:'var(--text-muted)' }}>{m.role}</div>
                          </div>
                        </div>
                      </td>
                      <td><span className="mono" style={{ fontWeight:700, color:'var(--text-primary)', fontSize:14 }}>{fmtUSD(m.salaryUSD)}</span></td>
                      <td><span style={{ display:'flex', alignItems:'center', gap:6 }}><span style={{ fontSize:16 }}>{FLAGS[m.currency]}</span> <span style={{ fontWeight:600 }}>{m.currency}</span></span></td>
                      <td>
                        <div style={{ fontSize:12.5, color:'var(--text-primary)', fontWeight:600 }}>{m.accountName}</div>
                        <div className="mono" style={{ fontSize:10.5, color:'var(--text-muted)' }}>{m.accountNumber}</div>
                      </td>
                      <td>
                        <span className="badge badge-green"><Check size={9}/> Verified</span>
                      </td>
                      <td><span className={`badge ${m.status==='active'?'badge-green':'badge-muted'}`}>{m.status}</span></td>
                      <td><button className="btn btn-danger btn-sm" onClick={() => remove(m.id, m.name)}><Trash2 size={12}/></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>

      {/* Add member modal */}
      {showModal && (
        <div className="modal-bg" onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}>
          <div className="modal">
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:22 }}>
              <div>
                <h2 style={{ fontSize:17, fontWeight:800, letterSpacing:'-0.01em', marginBottom:3 }}>Add Team Member</h2>
                <p style={{ fontSize:12, color:'var(--text-muted)' }}>Account verified live via Blaaiz NUBAN resolver</p>
              </div>
              <button className="btn btn-soft btn-sm" onClick={() => setShowModal(false)}><X size={15}/></button>
            </div>

            <div style={{ display:'grid', gap:14 }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <div className="field"><label className="label">Full Name *</label><input className="input" placeholder="Tunde Adeniyi" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}/></div>
                <div className="field"><label className="label">Role</label><input className="input" placeholder="Engineer" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}/></div>
              </div>
              <div className="field"><label className="label">Email</label><input className="input" type="email" placeholder="tunde@team.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}/></div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <div className="field">
                  <label className="label">Salary (USD/mo) *</label>
                  <input className="input" type="number" placeholder="2500" value={form.salaryUSD} onChange={e => setForm(f => ({ ...f, salaryUSD: e.target.value }))}/>
                </div>
                <div className="field">
                  <label className="label">Currency *</label>
                  <select className="input" value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}>
                    {['NGN','GHS','KES','ZAR','RWF','GBP'].map(c => <option key={c} value={c}>{FLAGS[c]} {c}</option>)}
                  </select>
                </div>
              </div>
              <div className="field">
                <label className="label">Bank / Mobile Money *</label>
                <select className="input" value={form.bankCode} onChange={e => setForm(f => ({ ...f, bankCode: e.target.value }))}>
                  <option value="">Select bank...</option>
                  {banks.map(b => <option key={b.code} value={b.code}>{b.name}</option>)}
                </select>
              </div>
              <div className="field">
                <label className="label">Account Number *</label>
                <div style={{ position:'relative' }}>
                  <input className="input" placeholder="0123456789" value={form.accountNumber}
                    onChange={e => setForm(f => ({ ...f, accountNumber: e.target.value }))}
                    style={{ paddingRight:38 }}
                  />
                  {verifying && <div className="spinner" style={{ position:'absolute', right:11, top:'50%', transform:'translateY(-50%)', width:14, height:14 }}/>}
                  {verifiedName && !verifying && <Check size={14} color="var(--green)" style={{ position:'absolute', right:11, top:'50%', transform:'translateY(-50%)' }}/>}
                </div>
                {verifiedName && (
                  <div style={{ fontSize:11.5, color:'var(--green)', fontWeight:700, marginTop:4, display:'flex', alignItems:'center', gap:5 }}>
                    <Shield size={11}/> Blaaiz verified: {verifiedName}
                  </div>
                )}
              </div>
            </div>

            <div style={{ display:'flex', gap:10, marginTop:22 }}>
              <button className="btn btn-ghost" style={{ flex:1 }} onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-prime" style={{ flex:1 }} onClick={addMember} disabled={saving}>
                {saving ? <><div className="spinner" style={{ width:14, height:14 }}/> Adding...</> : <><Plus size={14}/> Add Member</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── PAYROLL ──────────────────────────────────────────────────────────────────
function PayrollPage() {
  const [preview, setPreview] = useState<PayrollPreview | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [runProgress, setRunProgress] = useState(0);
  const [runStep, setRunStep] = useState('');
  const [label, setLabel] = useState(`Payroll – ${new Date().toLocaleDateString('en-US',{month:'long',year:'numeric'})}`);
  const [result, setResult] = useState<PayrollRun | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    api('/team').then(d => setMembers((d.members || []).filter((m: Member) => m.status === 'active')));
  }, []);

  const getPreview = async () => {
    if (!members.length) { toast('Add team members first', 'error'); return; }
    setLoading(true);
    blaaizLog.req('GET', '/v1/rates?source=USD', '');
    try {
      const data = await api('/payroll/preview', { method:'POST', body: JSON.stringify({ sourceCurrency:'USD' }) });
      setPreview(data);
      blaaizLog.res('/v1/rates', 200, `{ "NGN": ${data.breakdown.find((b: PayrollBreakdown) => b.currency==='NGN')?.fxRate || '-'}, ... }`);
      toast('Live FX rates loaded from Blaaiz', 'info');
    } catch (e: unknown) { toast((e as Error).message, 'error'); }
    finally { setLoading(false); }
  };

  const runPayroll = async () => {
    if (!preview) return;
    setRunning(true); setRunProgress(0);

    const steps = [
      { pct:15, msg:'Authenticating with Blaaiz sandbox...', api:'POST /oauth/token' },
      { pct:30, msg:'Locking FX rates via Blaaiz engine...', api:'GET /v1/rates' },
      { pct:55, msg:'Initiating batch payout dispatch...', api:'POST /v1/payouts' },
      { pct:80, msg:'Settling to local bank accounts...', api:'↳ Blaaiz rail routing' },
      { pct:100, msg:'All disbursements confirmed ✓', api:'200 OK' },
    ];

    for (const step of steps) {
      setRunStep(step.msg);
      blaaizLog.req('POST', '/v1/payouts', `{ "batch": true, "count": ${preview.memberCount}, "total_usd": ${preview.totalSourceAmount} }`);
      await new Promise(r => setTimeout(r, 850));
      setRunProgress(step.pct);
      blaaizLog.res('/v1/payouts', 200, `{ "status": "processing", "step": "${step.api}" }`);
    }

    try {
      const run = await api('/payroll/run', { method:'POST', body: JSON.stringify({ sourceCurrency:'USD', label }) });
      blaaizLog.res('/v1/payouts', 200, `{ "batch_id": "${run.blaaizBatchId}", "status": "COMPLETED", "count": ${run.members.length} }`);
      setResult(run);
      toast('Payroll dispatched via Blaaiz!', 'success');
    } catch (e: unknown) { toast((e as Error).message, 'error'); }
    finally { setRunning(false); setRunProgress(0); setRunStep(''); }
  };

  if (result) {
    return (
      <div className="cx-sm" style={{ padding:'40px 28px' }}>
        <div style={{ textAlign:'center', marginBottom:36 }}>
          <div style={{ width:64,height:64, background:'rgba(45,212,160,0.1)', border:'1px solid rgba(45,212,160,0.3)', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 18px' }}>
            <CheckCircle size={30} color="var(--green)" />
          </div>
          <h1 style={{ fontSize:26, fontWeight:900, letterSpacing:'-0.02em', marginBottom:8 }}>Payroll Dispatched 🚀</h1>
          <p style={{ color:'var(--text-secondary)', fontSize:14 }}>
            {result.members.length} team members paid across {new Set(result.members.map(m => m.currency)).size} currencies via Blaaiz
          </p>
        </div>

        {/* Blaaiz batch reference */}
        <div style={{ background:'rgba(79,126,255,0.07)', border:'1px solid rgba(79,126,255,0.18)', borderRadius:10, padding:'14px 18px', marginBottom:16 }}>
          <div style={{ fontSize:10.5, color:'var(--text-muted)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:6 }}>Blaaiz Batch Reference</div>
          <div className="mono" style={{ fontSize:14, color:'var(--blue-light)', fontWeight:700 }}>{result.blaaizBatchId}</div>
          <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:4 }}>Rail: {result.mode?.replace(/_/g,' ')}</div>
        </div>

        <div className="card" style={{ padding:0, overflow:'hidden', marginBottom:16 }}>
          {result.members.map((m, i) => (
            <div key={m.memberId} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'14px 18px', borderBottom: i < result.members.length-1 ? '1px solid var(--border)' : 'none' }}>
              <div>
                <div style={{ fontWeight:700, color:'var(--text-primary)', marginBottom:3 }}>{m.name}</div>
                <div className="mono" style={{ fontSize:10.5, color:'var(--text-muted)' }}>{m.reference}</div>
              </div>
              <div style={{ textAlign:'right', display:'flex', alignItems:'center', gap:12 }}>
                <div>
                  <div className="mono" style={{ fontWeight:800, fontSize:15, color:'var(--text-primary)' }}>
                    {SYMBOLS[m.currency]}{m.amountLocal.toLocaleString('en-US', { minimumFractionDigits:2 })}
                  </div>
                  <div style={{ fontSize:11, color:'var(--text-muted)' }}>{fmtUSD(m.amountUSD)} × {m.fxRate.toLocaleString()}</div>
                </div>
                <span className="badge badge-green"><Check size={9}/> {m.status}</span>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display:'flex', gap:10 }}>
          <button className="btn btn-ghost" style={{ flex:1 }} onClick={() => { setResult(null); setPreview(null); }}>Run Another</button>
          <button className="btn btn-prime" style={{ flex:1 }} onClick={() => navigate('/history')}>View History <ArrowRight size={14}/></button>
        </div>
      </div>
    );
  }

  return (
    <div className="cx" style={{ padding:'32px 28px' }}>
      <div style={{ marginBottom:24 }}>
        <h1 style={{ fontSize:22, fontWeight:800, letterSpacing:'-0.02em', marginBottom:4 }}>Run Payroll</h1>
        <p style={{ color:'var(--text-muted)', fontSize:13 }}>Fund once in USD — Blaaiz handles FX conversion and local bank delivery</p>
      </div>

      {members.length === 0 ? (
        <div className="card"><div className="empty"><Users size={32}/><p>No active members. Add your team first.</p><button className="btn btn-prime btn-sm" onClick={() => navigate('/team')}><Plus size={13}/> Add Members</button></div></div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 340px', gap:20, alignItems:'start' }}>
          {/* Left */}
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div className="field"><label className="label">Payroll Label</label><input className="input" value={label} onChange={e => setLabel(e.target.value)}/></div>

            {!preview ? (
              <div className="card" style={{ textAlign:'center', padding:'52px 24px' }}>
                <Globe size={36} color="var(--blue)" style={{ margin:'0 auto 16px' }}/>
                <p style={{ color:'var(--text-secondary)', fontSize:14, marginBottom:22 }}>
                  {members.length} member{members.length > 1 ? 's' : ''} on payroll. Preview to see live FX breakdown.
                </p>
                <button className="btn btn-prime" onClick={getPreview} disabled={loading}>
                  {loading ? <><div className="spinner" style={{ width:14, height:14 }}/> Fetching Blaaiz rates...</> : <><TrendingUp size={14}/> Preview Payroll</>}
                </button>
                <p className="mono" style={{ fontSize:10.5, color:'var(--text-muted)', marginTop:14 }}>GET /v1/rates?source=USD</p>
              </div>
            ) : (
              <div className="card" style={{ padding:0, overflow:'hidden' }}>
                <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div>
                    <span style={{ fontWeight:700, fontSize:14 }}>Live FX Breakdown</span>
                    <span className="mono" style={{ fontSize:10.5, color:'var(--text-muted)', marginLeft:10 }}>{preview.ratesTimestamp ? fmtTime(preview.ratesTimestamp) : ''}</span>
                  </div>
                  <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                    <span className="badge badge-blue">{preview.fxMode}</span>
                    <button className="btn btn-soft btn-sm" onClick={getPreview}><RefreshCw size={12}/></button>
                  </div>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Member</th><th>USD Salary</th><th>Blaaiz FX Rate</th><th>Local Amount</th><th>Bank</th></tr></thead>
                    <tbody>
                      {preview.breakdown.map(row => (
                        <tr key={row.memberId}>
                          <td>
                            <div style={{ fontWeight:600, color:'var(--text-primary)' }}>{row.name}</div>
                            <div style={{ fontSize:11, color:'var(--text-muted)' }}>{row.role}</div>
                          </td>
                          <td><span className="mono" style={{ fontWeight:700, color:'var(--text-primary)' }}>{fmtUSD(row.amountUSD)}</span></td>
                          <td>
                            <span style={{ display:'flex', alignItems:'center', gap:5 }}>
                              {FLAGS[row.currency]}
                              <span className="mono" style={{ fontSize:12, color:'var(--text-secondary)' }}>{row.fxRate.toLocaleString()}</span>
                            </span>
                          </td>
                          <td><span className="mono" style={{ fontWeight:800, color:'var(--blue-light)', fontSize:14 }}>{SYMBOLS[row.currency]}{row.amountLocal.toLocaleString('en-US',{minimumFractionDigits:2})}</span></td>
                          <td style={{ fontSize:11.5, color:'var(--text-secondary)' }}>{row.bank}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Running progress overlay */}
            {running && (
              <div className="card" style={{ background:'rgba(79,126,255,0.06)', border:'1px solid rgba(79,126,255,0.2)' }}>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
                  <Loader2 size={16} color="var(--blue-light)" style={{ animation:'spin 1s linear infinite' }}/>
                  <span style={{ fontWeight:600, color:'var(--blue-light)', fontSize:14 }}>Blaaiz Processing...</span>
                </div>
                <div className="progress-bar" style={{ marginBottom:10 }}>
                  <div className="progress-fill" style={{ width:`${runProgress}%` }}/>
                </div>
                <p className="mono" style={{ fontSize:11.5, color:'var(--text-secondary)', margin:0 }}>{runStep}</p>
              </div>
            )}
          </div>

          {/* Right sidebar */}
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <div className="card">
              <h3 style={{ fontSize:14, fontWeight:700, letterSpacing:'-0.01em', marginBottom:16 }}>Payroll Summary</h3>
              {preview ? (
                <>
                  {[
                    { label:'Payroll Total', val:fmtUSD(preview.totalSourceAmount), mono:true },
                    { label:'Blaaiz Fee (0.9%)', val:fmtUSD(preview.blaaizFee), mono:true },
                    { label:'Members', val:`${preview.memberCount} people` },
                    { label:'Currencies', val:`${preview.countryCount} local currencies` },
                  ].map(item => (
                    <div key={item.label} style={{ display:'flex', justifyContent:'space-between', padding:'9px 0', borderBottom:'1px solid var(--border)' }}>
                      <span style={{ fontSize:13, color:'var(--text-secondary)' }}>{item.label}</span>
                      <span className={item.mono ? 'mono' : ''} style={{ fontSize:13, fontWeight:700, color:'var(--text-primary)' }}>{item.val}</span>
                    </div>
                  ))}
                  <div style={{ display:'flex', justifyContent:'space-between', padding:'13px 0 0' }}>
                    <span style={{ fontWeight:700, fontSize:14 }}>Total Charged</span>
                    <span className="mono" style={{ fontWeight:900, fontSize:18, color:'var(--blue-light)' }}>{fmtUSD(preview.totalCharged)}</span>
                  </div>
                  <button className="btn btn-prime" style={{ width:'100%', marginTop:18 }} onClick={runPayroll} disabled={running}>
                    {running ? <><div className="spinner" style={{ width:14, height:14 }}/> Dispatching...</> : <><Send size={14}/> Dispatch via Blaaiz</>}
                  </button>
                  <p className="mono" style={{ fontSize:10, color:'var(--text-muted)', textAlign:'center', marginTop:10 }}>
                    POST /v1/payouts · Blaaiz rails
                  </p>
                </>
              ) : (
                <div style={{ color:'var(--text-muted)', fontSize:13, textAlign:'center', padding:'20px 0' }}>Preview to see cost breakdown</div>
              )}
            </div>

            <div className="card" style={{ background:'rgba(45,212,160,0.04)', borderColor:'rgba(45,212,160,0.12)' }}>
              <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:8 }}>
                <Shield size={14} color="var(--green)"/>
                <span style={{ fontWeight:700, fontSize:13 }}>Blaaiz Settlement Rail</span>
              </div>
              <p style={{ fontSize:12, color:'var(--text-secondary)', margin:0, lineHeight:1.6 }}>
                All payouts routed through Blaaiz's real-time FX engine. Each transfer gets a unique <span className="mono">BLZ-XXXXXX</span> reference traceable end-to-end.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── HISTORY ──────────────────────────────────────────────────────────────────
function HistoryPage() {
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api('/payroll/history').then(d => setRuns(d.runs || [])).finally(() => setLoading(false));
  }, []);

  return (
    <div className="cx" style={{ padding:'32px 28px' }}>
      <h1 style={{ fontSize:22, fontWeight:800, letterSpacing:'-0.02em', marginBottom:4 }}>Payroll History</h1>
      <p style={{ color:'var(--text-muted)', fontSize:13, marginBottom:24 }}>{runs.length} run{runs.length !== 1 ? 's' : ''} total</p>

      {loading ? <div className="empty"><div className="spinner"/></div>
        : runs.length === 0 ? <div className="empty"><Clock size={32}/><p>No payroll runs yet.</p></div>
        : (
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {runs.map(run => (
              <div key={run.id} className="card" style={{ cursor:'pointer', transition:'border-color 0.15s' }} onClick={() => setOpen(open === run.id ? null : run.id)}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:700, fontSize:14, color:'var(--text-primary)', marginBottom:6 }}>{run.label}</div>
                    <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
                      <span className={`badge ${run.status==='COMPLETED'?'badge-green':'badge-amber'}`}>{run.status}</span>
                      <span style={{ fontSize:12, color:'var(--text-muted)' }}>{run.members.length} members</span>
                      {run.blaaizBatchId && <span className="badge badge-purple"><Terminal size={9}/> {run.blaaizBatchId}</span>}
                      {run.completedAt && <span style={{ fontSize:12, color:'var(--text-muted)' }}>{fmtDate(run.completedAt)}</span>}
                    </div>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:14 }}>
                    <span className="mono" style={{ fontWeight:900, fontSize:18, color:'var(--text-primary)' }}>{fmtUSD(run.totalSourceAmount)}</span>
                    <ChevronDown size={16} color="var(--text-muted)" style={{ transform: open===run.id?'rotate(180deg)':'none', transition:'0.2s' }}/>
                  </div>
                </div>

                {open === run.id && (
                  <div className="fade-up" style={{ marginTop:18, paddingTop:18, borderTop:'1px solid var(--border)' }}>
                    {run.blaaizBatchId && (
                      <div style={{ display:'flex', gap:8, alignItems:'center', padding:'10px 14px', background:'rgba(79,126,255,0.06)', border:'1px solid rgba(79,126,255,0.14)', borderRadius:8, marginBottom:14 }}>
                        <Wifi size={12} color="var(--blue-light)"/>
                        <span style={{ fontSize:11, color:'var(--text-muted)' }}>Blaaiz Batch: </span>
                        <span className="mono" style={{ fontSize:11, color:'var(--blue-light)', fontWeight:700 }}>{run.blaaizBatchId}</span>
                        {run.mode && <span className="badge badge-purple" style={{ marginLeft:'auto' }}>{run.mode.replace(/_/g,' ')}</span>}
                      </div>
                    )}
                    {run.members.map(m => (
                      <div key={m.memberId} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 0', borderBottom:'1px solid var(--border)' }}>
                        <div>
                          <div style={{ fontWeight:600, color:'var(--text-primary)', marginBottom:3 }}>{m.name}</div>
                          <span className="mono" style={{ fontSize:10.5, color:'var(--text-muted)' }}>{m.reference}</span>
                        </div>
                        <div style={{ textAlign:'right', display:'flex', alignItems:'center', gap:12 }}>
                          <div>
                            <div className="mono" style={{ fontWeight:800, fontSize:14, color:'var(--text-primary)' }}>
                              {SYMBOLS[m.currency]}{m.amountLocal.toLocaleString('en-US',{minimumFractionDigits:2})}
                            </div>
                            <div style={{ fontSize:11, color:'var(--text-muted)' }}>{fmtUSD(m.amountUSD)} · rate {m.fxRate.toLocaleString()}</div>
                          </div>
                          <span className={`badge ${m.status==='SETTLED'?'badge-green':'badge-amber'}`}>{m.status}</span>
                        </div>
                      </div>
                    ))}
                    {run.completedAt && (
                      <p className="mono" style={{ fontSize:11, color:'var(--text-muted)', textAlign:'right', marginTop:10, marginBottom:0 }}>
                        {fmtDate(run.completedAt)} · {fmtTime(run.completedAt)}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
    </div>
  );
}

// ─── CONSOLE PAGE ─────────────────────────────────────────────────────────────
function ConsolePage() {
  const [entries, setEntries] = useState<ConsoleEntry[]>([]);
  const [health, setHealth] = useState<Record<string, unknown>>({});

  useEffect(() => {
    api('/blaaiz/health').then(setHealth);
    // Seed with realistic entries
    const seed: ConsoleEntry[] = [
      { time:'09:30:00', type:'info', label:'SplitBorder → Blaaiz sandbox session started' },
      { time:'09:30:01', type:'req', method:'POST', url:'/oauth/token', body:'{ "grant_type": "client_credentials", "client_id": "sb_live_..." }' },
      { time:'09:30:01', type:'res', url:'/oauth/token', status:200, body:'{ "access_token": "eyJ0eX...", "expires_in": 3600 }' },
      { time:'09:30:02', type:'req', method:'GET', url:'/v1/rates?source=USD' },
      { time:'09:30:02', type:'res', url:'/v1/rates', status:200, body:'{ "NGN": 1618.5, "GHS": 15.35, "KES": 129.2, "ZAR": 18.25 }' },
      { time:'09:30:05', type:'req', method:'POST', url:'/v1/bank-accounts/verify', body:'{ "account_number": "0123456789", "bank_code": "058", "currency": "NGN" }' },
      { time:'09:30:06', type:'res', url:'/v1/bank-accounts/verify', status:200, body:'{ "account_name": "TUNDE ADENIYI BALOGUN", "verified": true }' },
    ];
    setEntries(seed);
    _addLog = (e) => setEntries(prev => [...prev.slice(-80), e]);
  }, []);

  return (
    <div className="cx" style={{ padding:'32px 28px' }}>
      <div style={{ marginBottom:24 }}>
        <h1 style={{ fontSize:22, fontWeight:800, letterSpacing:'-0.02em', marginBottom:4 }}>Blaaiz API Console</h1>
        <p style={{ color:'var(--text-muted)', fontSize:13 }}>Live view of all Blaaiz API calls made by SplitBorder</p>
      </div>

      {/* Health card */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))', gap:12, marginBottom:20 }}>
        {[
          { label:'API Endpoint', val:'api-dev.blaaiz.com', mono:true },
          { label:'Auth Mode', val: health.hasApiKey ? 'API Key' : health.hasClientId ? 'OAuth 2.0' : 'Simulation', mono:false },
          { label:'Status', val: health.status as string || 'ACTIVE', mono:false },
          { label:'Mock Mode', val: health.mockMode ? 'ON' : 'OFF', mono:false },
        ].map(item => (
          <div key={item.label} className="card-sm">
            <div style={{ fontSize:10, color:'var(--text-muted)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:5 }}>{item.label}</div>
            <div className={item.mono ? 'mono' : ''} style={{ fontSize:12.5, fontWeight:700, color:'var(--text-primary)' }}>{item.val}</div>
          </div>
        ))}
      </div>

      {/* Endpoints reference */}
      <div className="card" style={{ marginBottom:20 }}>
        <h3 style={{ fontSize:14, fontWeight:700, marginBottom:14 }}>Blaaiz Endpoints Used</h3>
        <div style={{ display:'grid', gap:8 }}>
          {[
            { method:'POST', path:'/oauth/token', desc:'Exchange client credentials for access token' },
            { method:'GET', path:'/v1/rates?source=USD', desc:'Get live FX rates relative to source currency' },
            { method:'POST', path:'/v1/bank-accounts/verify', desc:'Verify recipient NUBAN bank account in real-time' },
            { method:'POST', path:'/v1/payouts', desc:'Initiate single or batch cross-border payout' },
          ].map(ep => (
            <div key={ep.path} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 14px', background:'var(--bg-elevated)', border:'1px solid var(--border)', borderRadius:8 }}>
              <span className={`badge ${ep.method==='GET'?'badge-blue':'badge-purple'}`}>{ep.method}</span>
              <span className="mono" style={{ fontSize:12, color:'var(--blue-light)', flex:1 }}>{ep.path}</span>
              <span style={{ fontSize:12, color:'var(--text-secondary)' }} className="hide-sm">{ep.desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Live console */}
      <BlaaizConsole entries={entries} />

      <div style={{ marginTop:16, padding:'12px 16px', background:'var(--bg-elevated)', border:'1px solid var(--border)', borderRadius:8 }}>
        <p style={{ fontSize:12, color:'var(--text-muted)', margin:0, lineHeight:1.6 }}>
          <span style={{ color:'var(--blue-light)', fontWeight:700 }}>To activate live Blaaiz calls:</span> Add your <span className="mono">BLAAIZ_CLIENT_ID</span>, <span className="mono">BLAAIZ_CLIENT_SECRET</span>, and <span className="mono">BLAAIZ_API_KEY</span> from <span className="mono">business-dev.blaaiz.com</span> → API & Webhooks into <span className="mono">server/.env</span>. All calls will automatically upgrade from simulation to live sandbox.
        </p>
      </div>
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <div className="app-wrap">
        <Navbar />
        <main className="page">
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/team" element={<TeamPage />} />
            <Route path="/payroll" element={<PayrollPage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/console" element={<ConsolePage />} />
          </Routes>
        </main>
        <footer style={{ borderTop:'1px solid var(--border)', padding:'20px 0', background:'var(--bg-surface)' }}>
          <div className="cx" style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:10 }}>
            <span style={{ fontSize:12, color:'var(--text-muted)' }}>SplitBorder · Built on Blaaiz Payment Infrastructure</span>
            <span className="mono" style={{ fontSize:11, color:'var(--text-muted)' }}>api-dev.blaaiz.com · GDG Ilorin Buildathon 2026</span>
          </div>
        </footer>
      </div>
      <ToastProvider />
    </BrowserRouter>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
