import React, { useState, useEffect } from 'react';
import { BalancesAPI, GroupsAPI } from '../api';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { X, ArrowRight, ChevronRight } from 'lucide-react';

const Balances = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [groups, setGroups] = useState([]);
  const [group, setGroup] = useState(null);
  const [balances, setBalances] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Drill-down
  const [drillUser, setDrillUser] = useState(null);
  const [drillData, setDrillData] = useState(null);
  const [drillLoading, setDrillLoading] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const fetchedGroups = await GroupsAPI.getGroups();
      if (fetchedGroups.length === 0) { setLoading(false); return; }
      setGroups(fetchedGroups);
      
      let g = fetchedGroups[0];
      if (group) {
        const found = fetchedGroups.find(grp => grp.id === group.id);
        if (found) g = found;
      }
      setGroup(g);

      const data = await BalancesAPI.getGroupBalances(g.id);
      setBalances(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGroupChange = async (e) => {
    const selectedId = parseInt(e.target.value, 10);
    const selectedGroup = groups.find(g => g.id === selectedId);
    if (!selectedGroup) return;

    setGroup(selectedGroup);
    setLoading(true);
    setDrillUser(null);
    try {
      const data = await BalancesAPI.getGroupBalances(selectedGroup.id);
      setBalances(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const openDrilldown = async (userId, displayName) => {
    setDrillUser({ userId, displayName });
    setDrillLoading(true);
    try {
      const data = await BalancesAPI.getUserBalance(group.id, userId);
      setDrillData(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setDrillLoading(false);
    }
  };

  const fmtCurrency = (val) => {
    const sign = val < 0 ? '-' : '';
    return `${sign}₹${Math.abs(val).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
  };

  const fmtDate = (d) =>
    d ? new Date(d).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

  const handleSettleUp = (settlement) => {
    navigate('/settlements', {
      state: {
        prefill: {
          groupId: group.id,
          paidTo: settlement.to.userId,
          amount: settlement.amount,
          notes: `Settlement: ${settlement.from.name} → ${settlement.to.name}`,
        },
      },
    });
  };

  if (loading) return <div className="spinner"></div>;
  if (!group) return <div className="empty-state"><h3>No group</h3></div>;
  if (!balances) return <div className="empty-state"><h3>No data</h3></div>;

  const sorted = [...balances.balances].sort((a, b) => Math.abs(b.netBalance) - Math.abs(a.netBalance));
  const maxAbs = Math.max(...sorted.map((b) => Math.abs(b.netBalance)), 1);

  return (
    <div className="fade-in">
      <div className="page-header">
        <div className="page-header-actions" style={{ alignItems: 'flex-start' }}>
          <div>
            <h1>Balances</h1>
            <p>Who owes whom in {group.name} — click any member for expense breakdown</p>
          </div>
          <select 
            className="form-select" 
            value={group.id} 
            onChange={handleGroupChange}
            style={{ minWidth: '200px' }}
          >
            {groups.map(g => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </div>
      </div>

      {error && <div style={{ color: 'var(--danger)', marginBottom: '1rem' }}>{error}</div>}

      {/* Balance Bars */}
      <div className="card mb-6">
        <div className="card-header">
          <h3 className="card-title">Net Balances</h3>
          <span className="badge badge-neutral">All amounts in INR</span>
        </div>
        {sorted.map((b) => (
          <div
            key={b.userId}
            className="balance-bar-container"
            style={{ cursor: 'pointer' }}
            onClick={() => openDrilldown(b.userId, b.displayName)}
          >
            <div className="balance-bar-header">
              <span className="balance-bar-name">
                {b.displayName}
                {b.leftAt && <span className="badge badge-warning" style={{ marginLeft: 8 }}>Left</span>}
              </span>
              <span className={`balance-bar-amount ${b.netBalance >= 0 ? 'text-success' : 'text-danger'}`}>
                {b.netBalance >= 0 ? '+' : ''}{fmtCurrency(b.netBalance)}
              </span>
            </div>
            <div className="balance-bar">
              <div
                className={`balance-bar-fill ${b.netBalance >= 0 ? 'positive' : 'negative'}`}
                style={{ width: `${(Math.abs(b.netBalance) / maxAbs * 100).toFixed(1)}%` }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 'var(--space-1)', fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>
              <span>Paid: {fmtCurrency(b.totalPaid)}</span>
              <span>Share: {fmtCurrency(b.totalOwed)}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Settlement Suggestions */}
      <div className="card card-accent">
        <div className="card-header">
          <h3 className="card-title">Simplified Settlements</h3>
          <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)' }}>
            {balances.suggestedSettlements.length} transaction{balances.suggestedSettlements.length !== 1 ? 's' : ''} to settle all debts
          </span>
        </div>
        {balances.suggestedSettlements.length === 0 ? (
          <div className="empty-state" style={{ padding: '2rem' }}><h3>All settled! 🎉</h3></div>
        ) : (
          balances.suggestedSettlements.map((s, i) => (
            <div key={i} className="settlement-item" style={{ flexWrap: 'wrap' }}>
              <div className="nav-user-avatar" style={{ width: 32, height: 32, fontSize: 12 }}>{s.from.name[0]}</div>
              <div className="settlement-names"><strong>{s.from.name}</strong></div>
              <div className="settlement-arrow"><ArrowRight size={18} /></div>
              <div className="nav-user-avatar" style={{ width: 32, height: 32, fontSize: 12, background: 'linear-gradient(135deg, #5DF8D8, #6FD1D7)' }}>{s.to.name[0]}</div>
              <div className="settlement-names"><strong>{s.to.name}</strong></div>
              <div className="settlement-amount">{fmtCurrency(s.amount)}</div>
              <button
                className="btn btn-success btn-sm"
                onClick={() => handleSettleUp(s)}
                style={{ marginLeft: '0.5rem' }}
              >
                Settle Up <ChevronRight size={14} />
              </button>
            </div>
          ))
        )}
      </div>

      {/* ---- Drilldown Modal ---- */}
      {drillUser && (
        <div className="modal-overlay visible" onClick={(e) => e.target === e.currentTarget && setDrillUser(null)}>
          <div className="modal-content" style={{ maxWidth: 700 }}>
            <div className="modal-header">
              <h3 className="modal-title">{drillUser.displayName}'s Breakdown</h3>
              <button className="modal-close" onClick={() => setDrillUser(null)}><X size={16} /></button>
            </div>

            {drillLoading ? <div className="spinner"></div> : drillData ? (
              <>
                <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginBottom: 'var(--space-6)' }}>
                  <div className="stat-card" style={{ padding: 'var(--space-4)' }}>
                    <div className="stat-label" style={{ fontSize: 10 }}>Paid</div>
                    <div className="stat-value" style={{ fontSize: 'var(--font-size-lg)' }}>{fmtCurrency(drillData.totalPaid)}</div>
                  </div>
                  <div className="stat-card" style={{ padding: 'var(--space-4)' }}>
                    <div className="stat-label" style={{ fontSize: 10 }}>Share</div>
                    <div className="stat-value" style={{ fontSize: 'var(--font-size-lg)' }}>{fmtCurrency(drillData.totalOwed)}</div>
                  </div>
                  <div className="stat-card" style={{ padding: 'var(--space-4)' }}>
                    <div className="stat-label" style={{ fontSize: 10 }}>Net</div>
                    <div className={`stat-value ${drillData.netBalance >= 0 ? 'positive' : 'negative'}`} style={{ fontSize: 'var(--font-size-lg)' }}>
                      {drillData.netBalance >= 0 ? '+' : ''}{fmtCurrency(drillData.netBalance)}
                    </div>
                  </div>
                </div>

                <div className="table-wrapper" style={{ maxHeight: 400, overflowY: 'auto' }}>
                  <table>
                    <thead>
                      <tr><th>Date</th><th>Expense</th><th>Paid By</th><th>Your Share</th><th>You Paid</th><th>Net</th></tr>
                    </thead>
                    <tbody>
                      {drillData.breakdown.map((row, i) => (
                        <tr key={i}>
                          <td>{fmtDate(row.date)}</td>
                          <td>
                            <div className="font-bold">{row.description}</div>
                            {row.currency !== 'INR' && (
                              <div className="mt-1">
                                <span className="badge badge-accent">{row.currency}</span>
                                <span className="text-xs text-gray-400 ml-2">
                                  Original: {row.currency === 'USD' ? '$' : ''}{parseFloat(row.amount).toFixed(2)}
                                </span>
                              </div>
                            )}
                          </td>
                          <td>{row.paidBy}</td>
                          <td>
                            <div>{fmtCurrency(row.yourShareINR)}</div>
                            {row.currency !== 'INR' && (
                              <div className="text-xs text-gray-400">{row.currency === 'USD' ? '$' : ''}{parseFloat(row.yourShare).toFixed(2)}</div>
                            )}
                          </td>
                          <td>{row.youPaidINR > 0 ? fmtCurrency(row.youPaidINR) : '—'}</td>
                          <td className={row.netImpact >= 0 ? 'text-success' : 'text-danger'}>
                            <span className="font-bold">{row.netImpact >= 0 ? '+' : ''}{fmtCurrency(row.netImpact)}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
};

export default Balances;
