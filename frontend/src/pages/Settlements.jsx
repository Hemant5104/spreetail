import React, { useState, useEffect } from 'react';
import { SettlementsAPI, GroupsAPI, AuthAPI } from '../api';
import { useAuth } from '../context/AuthContext';
import { useLocation } from 'react-router-dom';
import { Plus, Trash2, X } from 'lucide-react';

const Settlements = () => {
  const { user } = useAuth();
  const location = useLocation();
  const [groups, setGroups] = useState([]);
  const [group, setGroup] = useState(null);
  const [settlements, setSettlements] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [prefillApplied, setPrefillApplied] = useState(false);

  // Modal
  const [showAdd, setShowAdd] = useState(false);
  const [paidBy, setPaidBy] = useState('');
  const [paidTo, setPaidTo] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  // Handle prefill from Balances page "Settle Up" button
  useEffect(() => {
    if (location.state?.prefill && !prefillApplied && allUsers.length > 0 && groups.length > 0) {
      const { groupId, paidTo: prefillPaidTo, amount: prefillAmount, notes: prefillNotes } = location.state.prefill;
      
      // Switch to the correct group if different
      const targetGroup = groups.find(g => g.id === groupId);
      if (targetGroup) setGroup(targetGroup);

      setPaidBy(String(user.id));
      setPaidTo(String(prefillPaidTo));
      setAmount(String(prefillAmount));
      if (prefillNotes) setNotes(prefillNotes);
      setShowAdd(true);
      setPrefillApplied(true);
    }
  }, [location.state, allUsers, groups, prefillApplied]);

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

      const [settleData, users] = await Promise.all([
        SettlementsAPI.getSettlements(g.id),
        AuthAPI.getUsers(),
      ]);

      setSettlements(settleData);
      setAllUsers(users);
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
    try {
      const settleData = await SettlementsAPI.getSettlements(selectedGroup.id);
      setSettlements(settleData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      await SettlementsAPI.createSettlement({
        group_id: group.id,
        paid_by: paidBy ? parseInt(paidBy) : user.id,
        paid_to: parseInt(paidTo),
        amount: parseFloat(amount),
        currency,
        date,
        notes,
      });
      setShowAdd(false);
      setPaidBy(String(user.id));
      setPaidTo('');
      setAmount('');
      setNotes('');
      fetchData();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this settlement?')) return;
    try {
      await SettlementsAPI.deleteSettlement(id);
      fetchData();
    } catch (err) {
      setError(err.message);
    }
  };

  const fmtCurrency = (val, cur = 'INR') =>
    cur === 'INR'
      ? `₹${parseFloat(val).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
      : `$${parseFloat(val).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

  const fmtDate = (d) =>
    d ? new Date(d).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

  if (loading) return <div className="spinner"></div>;
  if (!group) return <div className="empty-state"><h3>No group</h3></div>;

  return (
    <div className="fade-in">
      <div className="page-header">
        <div className="page-header-actions" style={{ alignItems: 'flex-start' }}>
          <div>
            <h1>Settlements</h1>
            <p>Record payments between group members</p>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
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
            <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
              <Plus size={16} /> Record Payment
            </button>
          </div>
        </div>
      </div>

      {error && <div style={{ color: 'var(--danger)', marginBottom: '1rem' }}>{error}</div>}

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-900">Settlement History</h2>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {settlements.length > 0 ? (
          <div className="table-wrapper" style={{ border: 'none' }}>
            <table>
              <thead>
                <tr><th>Date</th><th>From</th><th></th><th>To</th><th>Amount</th><th>Notes</th><th></th></tr>
              </thead>
              <tbody>
                {settlements.map((s) => (
                  <tr key={s.id}>
                    <td>{fmtDate(s.date)}</td>
                    <td><strong>{s.payer_name}</strong></td>
                    <td style={{ textAlign: 'center', color: 'var(--accent-primary)', fontWeight: 600, fontSize: 'var(--font-size-lg)' }}>→</td>
                    <td><strong>{s.payee_name}</strong></td>
                    <td className="font-bold">{fmtCurrency(s.amount, s.currency)}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{s.notes || '—'}</td>
                    <td>
                      <button className="btn-icon" title="Delete" onClick={() => handleDelete(s.id)}>
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <h3>No settlements yet</h3>
            <p>Record a payment when someone settles a debt</p>
          </div>
        )}
      </div>

      {/* ---- Add Settlement Modal ---- */}
      {showAdd && (
        <div className="modal-overlay visible" onClick={(e) => e.target === e.currentTarget && setShowAdd(false)}>
          <div className="modal-content">
            <div className="modal-header">
              <h3 className="modal-title">Record Payment</h3>
              <button className="modal-close" onClick={() => setShowAdd(false)}><X size={16} /></button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Paid By</label>
                  <select className="form-select" value={paidBy || user.id} onChange={(e) => setPaidBy(e.target.value)} required>
                    {allUsers.map((u) => (
                      <option key={u.id} value={u.id}>{u.display_name} {u.id === user.id ? '(You)' : ''}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Paying To</label>
                  <select className="form-select" value={paidTo} onChange={(e) => setPaidTo(e.target.value)} required>
                    <option value="">Select recipient...</option>
                    {allUsers.filter((u) => u.id !== parseInt(paidBy || user.id)).map((u) => (
                      <option key={u.id} value={u.id}>{u.display_name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Amount</label>
                  <input type="number" className="form-input" step="0.01" min="0.01" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Currency</label>
                  <select className="form-select" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                    <option value="INR">INR (₹)</option>
                    <option value="USD">USD ($)</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Date</label>
                <input type="date" className="form-input" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Notes</label>
                <input type="text" className="form-input" placeholder="Optional notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowAdd(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Recording...' : 'Record Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settlements;
