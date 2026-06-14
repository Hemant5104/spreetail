import React, { useState, useEffect } from 'react';
import { ExpensesAPI, GroupsAPI } from '../api';
import { useAuth } from '../context/AuthContext';
import { Plus, Trash2, X } from 'lucide-react';

const Expenses = () => {
  const { user } = useAuth();
  const [expenses, setExpenses] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [groups, setGroups] = useState([]);
  const [group, setGroup] = useState(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Add Expense modal
  const [showAdd, setShowAdd] = useState(false);
  const [desc, setDesc] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [splitType, setSplitType] = useState('equal');
  const [notes, setNotes] = useState('');
  const [selectedMembers, setSelectedMembers] = useState({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const fetchedGroups = await GroupsAPI.getGroups();
      if (fetchedGroups.length === 0) { setLoading(false); return; }
      setGroups(fetchedGroups);

      // Keep current group if it exists in the fetched list, otherwise default to first
      let activeGroup = fetchedGroups[0];
      if (group) {
        const found = fetchedGroups.find(g => g.id === group.id);
        if (found) activeGroup = found;
      }
      setGroup(activeGroup);

      const detail = await GroupsAPI.getGroup(activeGroup.id);
      const activeMembers = detail.members.filter((m) => !m.left_at);
      setMembers(activeMembers);

      const data = await ExpensesAPI.getExpenses(activeGroup.id, page);
      setExpenses(data.expenses);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGroupChange = (e) => {
    const selectedId = parseInt(e.target.value, 10);
    const selectedGroup = groups.find(g => g.id === selectedId);
    if (!selectedGroup) return;
    setGroup(selectedGroup);
    setPage(1); // Reset page on group change
  };

  // Re-fetch when group changes
  useEffect(() => {
    if (group) fetchData();
  }, [group?.id, page]); // Dependency array to fetch on group change or page change

  const openAddModal = () => {
    const initial = {};
    members.forEach((m) => {
      initial[m.user_id] = { checked: true, value: '' };
    });
    setSelectedMembers(initial);
    setDesc('');
    setAmount('');
    setCurrency('INR');
    setDate(new Date().toISOString().split('T')[0]);
    setSplitType('equal');
    setNotes('');
    setShowAdd(true);
  };

  const toggleMember = (userId) => {
    setSelectedMembers((prev) => ({
      ...prev,
      [userId]: { ...prev[userId], checked: !prev[userId]?.checked },
    }));
  };

  const setMemberValue = (userId, val) => {
    setSelectedMembers((prev) => ({
      ...prev,
      [userId]: { ...prev[userId], value: val },
    }));
  };

  const handleCreateExpense = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      const amt = parseFloat(amount);
      const checkedIds = Object.entries(selectedMembers)
        .filter(([, v]) => v.checked)
        .map(([id]) => parseInt(id));

      const splits = checkedIds.map((uid) => {
        let shareAmount;
        if (splitType === 'equal') {
          shareAmount = Math.round((amt / checkedIds.length) * 100) / 100;
        } else if (splitType === 'percentage') {
          const pct = parseFloat(selectedMembers[uid]?.value) || 0;
          shareAmount = Math.round((amt * pct / 100) * 100) / 100;
        } else if (splitType === 'share') {
          shareAmount = parseFloat(selectedMembers[uid]?.value) || 1;
        } else {
          shareAmount = parseFloat(selectedMembers[uid]?.value) || 0;
        }
        return { user_id: uid, share_amount: shareAmount };
      });

      if (splitType === 'share') {
        const totalShares = splits.reduce((s, sp) => s + sp.share_amount, 0);
        splits.forEach((sp) => {
          sp.share_amount = Math.round((amt * sp.share_amount / totalShares) * 100) / 100;
        });
      }

      await ExpensesAPI.createExpense({
        group_id: group.id,
        description: desc,
        amount: amt,
        currency,
        date,
        split_type: splitType,
        notes,
        splits,
      });

      setShowAdd(false);
      setPage(1);
      fetchData();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this expense?')) return;
    try {
      await ExpensesAPI.deleteExpense(id);
      fetchData();
    } catch (err) {
      setError(err.message);
    }
  };

  const fmtCurrency = (val, cur = 'INR') =>
    cur === 'INR'
      ? `₹${parseFloat(val).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
      : `$${parseFloat(val).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

  const fmtCurrencyDual = (val, cur = 'INR') => {
    if (cur === 'INR') return fmtCurrency(val, cur);
    const original = fmtCurrency(val, cur);
    const converted = parseFloat(val) * 83.5; // fallback rate
    return { original, converted: `≈ ₹${converted.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` };
  };

  const fmtDate = (d) =>
    d ? new Date(d).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

  if (loading && expenses.length === 0) return <div className="spinner"></div>;
  if (!group) return <div className="empty-state"><h3>No group</h3><p>Create a group first.</p></div>;

  return (
    <div className="fade-in">
      <div className="page-header">
        <div className="page-header-actions" style={{ alignItems: 'flex-start' }}>
          <div>
            <h1>Expenses</h1>
            <p>{total} expenses in {group.name}</p>
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
            <button className="btn btn-primary" onClick={openAddModal}>
              <Plus size={16} /> Add Expense
            </button>
          </div>
        </div>
      </div>

      {error && <div style={{ color: 'var(--danger)', marginBottom: '1rem' }}>{error}</div>}

      <div className="card" style={{ padding: 0 }}>
        {expenses.length > 0 ? (
          <>
            <div className="table-wrapper" style={{ border: 'none' }}>
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Description</th>
                    <th>Paid By</th>
                    <th>Amount</th>
                    <th>Split</th>
                    <th>Participants</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((exp) => {
                    const splits = exp.splits ? exp.splits.filter((s) => s.user_id) : [];
                    return (
                      <tr key={exp.id}>
                        <td>{fmtDate(exp.date)}</td>
                        <td>
                          <strong>{exp.description}</strong>
                          {exp.notes && (
                            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', marginTop: 2 }}>
                              {exp.notes}
                            </div>
                          )}
                        </td>
                        <td>{exp.payer_name || '—'}</td>
                        <td className="font-bold">
                          {exp.currency !== 'INR' ? (
                            <div>
                              <div>{fmtCurrency(exp.amount, exp.currency)}</div>
                              <div className="text-xs text-gray-400 mt-0.5">
                                {fmtCurrencyDual(exp.amount, exp.currency).converted}
                              </div>
                            </div>
                          ) : fmtCurrency(exp.amount, exp.currency)}
                        </td>
                        <td><span className="badge badge-neutral">{exp.split_type}</span></td>
                        <td>
                          <div className="chip-group">
                            {splits.slice(0, 3).map((s) => (
                              <span key={s.user_id} className="chip">{s.display_name}</span>
                            ))}
                            {splits.length > 3 && <span className="chip">+{splits.length - 3}</span>}
                          </div>
                        </td>
                        <td>
                          <button className="btn-icon" title="Delete" onClick={() => handleDelete(exp.id)}>
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-4)', borderTop: '1px solid var(--border-color)' }}>
                <span style={{ color: 'var(--text-muted)' }}>Page {page} of {totalPages}</span>
                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                  <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Prev</button>
                  <button className="btn btn-secondary btn-sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next →</button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="empty-state">
            <h3>No expenses yet</h3>
            <p>Add an expense or import your CSV to get started</p>
          </div>
        )}
      </div>

      {/* ---- Add Expense Modal ---- */}
      {showAdd && (
        <div className="modal-overlay visible" onClick={(e) => e.target === e.currentTarget && setShowAdd(false)}>
          <div className="modal-content" style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <h3 className="modal-title">Add Expense</h3>
              <button className="modal-close" onClick={() => setShowAdd(false)}><X size={16} /></button>
            </div>
            <form onSubmit={handleCreateExpense}>
              <div className="form-group">
                <label className="form-label">Description</label>
                <input type="text" className="form-input" placeholder="What was this for?" value={desc} onChange={(e) => setDesc(e.target.value)} required />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Amount</label>
                  <input type="number" className="form-input" step="0.01" min="0" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Currency</label>
                  <select className="form-select" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                    <option value="INR">INR (₹)</option>
                    <option value="USD">USD ($)</option>
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Date</label>
                  <input type="date" className="form-input" value={date} onChange={(e) => setDate(e.target.value)} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Split Type</label>
                  <select className="form-select" value={splitType} onChange={(e) => setSplitType(e.target.value)}>
                    <option value="equal">Equal</option>
                    <option value="unequal">Unequal (exact amounts)</option>
                    <option value="percentage">Percentage</option>
                    <option value="share">Shares (ratio)</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Split With</label>
                <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                  {members.map((m) => (
                    <label key={m.user_id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={selectedMembers[m.user_id]?.checked || false}
                        onChange={() => toggleMember(m.user_id)}
                      />
                      <span style={{ flex: 1 }}>{m.display_name}</span>
                      {splitType !== 'equal' && (
                        <input
                          type="number"
                          className="form-input"
                          style={{ width: 100 }}
                          step="0.01"
                          placeholder={splitType === 'percentage' ? '%' : splitType === 'share' ? 'Shares' : 'Amount'}
                          value={selectedMembers[m.user_id]?.value || ''}
                          onChange={(e) => setMemberValue(m.user_id, e.target.value)}
                        />
                      )}
                    </label>
                  ))}
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Notes</label>
                <input type="text" className="form-input" placeholder="Optional notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowAdd(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Adding...' : 'Add Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Expenses;
