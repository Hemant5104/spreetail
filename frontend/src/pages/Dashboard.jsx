import React, { useEffect, useState } from 'react';
import { GroupsAPI, BalancesAPI, ExpensesAPI } from '../api';
import { useAuth } from '../context/AuthContext';
import { Plus } from 'lucide-react';
import { Link } from 'react-router-dom';

const Dashboard = () => {
  const { user } = useAuth();
  const [groups, setGroups] = useState([]);
  const [group, setGroup] = useState(null);
  const [balances, setBalances] = useState(null);
  const [expenses, setExpenses] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const fetchedGroups = await GroupsAPI.getGroups();
        if (fetchedGroups.length === 0) {
          setLoading(false);
          return;
        }

        setGroups(fetchedGroups);
        const activeGroup = fetchedGroups[0];
        setGroup(activeGroup);

        const [balanceData, expenseData] = await Promise.all([
          BalancesAPI.getGroupBalances(activeGroup.id),
          ExpensesAPI.getExpenses(activeGroup.id, 1),
        ]);

        setBalances(balanceData);
        setExpenses(expenseData);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleGroupChange = async (e) => {
    const selectedId = parseInt(e.target.value, 10);
    const selectedGroup = groups.find(g => g.id === selectedId);
    if (!selectedGroup) return;

    setGroup(selectedGroup);
    setLoading(true);
    try {
      const [balanceData, expenseData] = await Promise.all([
        BalancesAPI.getGroupBalances(selectedGroup.id),
        ExpensesAPI.getExpenses(selectedGroup.id, 1),
      ]);
      setBalances(balanceData);
      setExpenses(expenseData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading && !group) return <div className="spinner"></div>;

  if (!group) {
    return (
      <div className="empty-state fade-in">
        <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        <h3>No groups yet</h3>
        <p>Create a group to start tracking shared expenses</p>
        <Link to="/groups" className="btn btn-primary btn-lg mt-4">Create Group</Link>
      </div>
    );
  }

  if (error) return <div className="empty-state"><h3>Error</h3><p>{error}</p></div>;

  const myBalance = balances?.balances?.find(b => b.userId === user.id);
  const formatCurrency = (val) => val < 0 ? `-₹${Math.abs(val).toFixed(2)}` : `₹${val.toFixed(2)}`;

  return (
    <div className="fade-in">
      <div className="page-header">
        <div className="page-header-actions" style={{ alignItems: 'flex-start' }}>
          <div>
            <h1>Dashboard</h1>
            <p>Welcome back, {user.display_name}</p>
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
            <Link to="/expenses" className="btn btn-primary">
              <Plus size={18} /> Add Expense
            </Link>
          </div>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Your Balance</div>
          <div className={`stat-value ${myBalance && myBalance.netBalance >= 0 ? 'positive' : 'negative'}`}>
            {myBalance ? formatCurrency(myBalance.netBalance) : '₹0.00'}
          </div>
          <div className="stat-change">{myBalance && myBalance.netBalance >= 0 ? 'Others owe you' : 'You owe others'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Expenses</div>
          <div className="stat-value neutral">{expenses?.total || 0}</div>
          <div className="stat-change">In {group.name}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Group Members</div>
          <div className="stat-value neutral">{group.member_count || balances?.balances?.length || 0}</div>
          <div className="stat-change">Active members</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">To Settle</div>
          <div className="stat-value neutral">{balances?.suggestedSettlements?.length || 0}</div>
          <div className="stat-change">Pending settlements</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="card" style={{ gridColumn: 'span 2' }}>
          <div className="card-header">
            <h3 className="card-title">Recent Expenses</h3>
            <Link to="/expenses" className="btn btn-ghost btn-sm">View All →</Link>
          </div>
          {expenses?.expenses?.slice(0, 8).map(exp => (
            <div key={exp.id} className="settlement-item" style={{ background: 'transparent', borderBottom: '1px solid rgba(255,255,255,0.05)', borderRadius: 0 }}>
              <div style={{ background: 'rgba(111,209,215,0.15)', padding: '8px', borderRadius: '8px' }}>💰</div>
              <div>
                <div className="font-bold">{exp.description}</div>
                <div className="text-muted text-sm">Paid by {exp.payer_name}</div>
              </div>
              <div className="ml-auto text-right">
                <div className="font-bold">
                  {exp.currency !== 'INR' ? (
                    <span>{exp.currency === 'USD' ? '$' : ''}{parseFloat(exp.amount).toFixed(2)}</span>
                  ) : (
                    <span>₹{parseFloat(exp.amount).toFixed(2)}</span>
                  )}
                </div>
                <div className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
                  {exp.currency !== 'INR' && <span className="badge badge-accent mr-1" style={{ fontSize: '9px', padding: '1px 5px' }}>{exp.currency}</span>}
                  {exp.split_type.toUpperCase()}
                </div>
              </div>
            </div>
          ))}
          {!expenses?.expenses?.length && (
            <div className="text-center text-muted p-4">No expenses yet</div>
          )}
        </div>

        <div className="card card-accent">
          <div className="card-header">
            <h3 className="card-title">Settle Up</h3>
          </div>
          <p className="card-subtitle mb-4">Simplified — who pays whom</p>
          {balances?.suggestedSettlements?.length === 0 ? (
            <div className="text-center text-muted p-4">All settled! 🎉</div>
          ) : (
            balances?.suggestedSettlements?.map((s, i) => (
              <div key={i} className="settlement-item mb-2 p-2">
                <div className="settlement-names text-sm">{s.from.name}</div>
                <div className="settlement-arrow px-2">→</div>
                <div className="settlement-names text-sm">{s.to.name}</div>
                <div className="settlement-amount text-sm">{formatCurrency(s.amount)}</div>
              </div>
            ))
          )}
          <Link to="/balances" className="btn btn-ghost btn-sm w-full mt-4" style={{ justifyContent: 'center' }}>
            View Full Breakdown →
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
