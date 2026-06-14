import React, { useState, useEffect } from 'react';
import { GroupsAPI, AuthAPI } from '../api';
import { useAuth } from '../context/AuthContext';
import { Plus, Trash2, UserPlus, Users, X } from 'lucide-react';

const Groups = () => {
  const { user } = useAuth();
  const [groups, setGroups] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [joinAsMember, setJoinAsMember] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Detail modal
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [groupDetail, setGroupDetail] = useState(null);
  const [addMemberId, setAddMemberId] = useState('');
  const [addMemberDate, setAddMemberDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    fetchGroups();
    fetchUsers();
  }, []);

  const fetchGroups = async () => {
    try {
      const data = await GroupsAPI.getGroups();
      setGroups(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const data = await AuthAPI.getUsers();
      setAllUsers(data);
    } catch (err) {
      console.error('Failed to fetch users:', err);
    }
  };

  const openGroupDetail = async (groupId) => {
    try {
      const data = await GroupsAPI.getGroup(groupId);
      setGroupDetail(data);
      setSelectedGroup(groupId);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await GroupsAPI.createGroup({ name: newName, description: newDesc, join_as_member: joinAsMember });
      setShowCreate(false);
      setNewName('');
      setNewDesc('');
      setJoinAsMember(true);
      fetchGroups();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteGroup = async (groupId) => {
    if (!window.confirm('Delete this group and all its data?')) return;
    try {
      await GroupsAPI.deleteGroup(groupId);
      setSelectedGroup(null);
      setGroupDetail(null);
      fetchGroups();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleAddMember = async () => {
    if (!addMemberId) return;
    try {
      await GroupsAPI.addMember(selectedGroup, {
        user_id: parseInt(addMemberId),
        joined_at: addMemberDate,
      });
      setAddMemberId('');
      openGroupDetail(selectedGroup);
      fetchGroups();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleRemoveMember = async (userId) => {
    if (!window.confirm('Remove this member?')) return;
    try {
      await GroupsAPI.removeMember(selectedGroup, userId, {
        left_at: new Date().toISOString().split('T')[0],
      });
      openGroupDetail(selectedGroup);
      fetchGroups();
    } catch (err) {
      setError(err.message);
    }
  };

  const formatDate = (d) =>
    d ? new Date(d).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

  // Users not currently active in this group
  const availableUsers = groupDetail
    ? allUsers.filter(
        (u) => !groupDetail.members.find((m) => m.user_id === u.id && !m.left_at)
      )
    : [];

  if (loading) return <div className="spinner"></div>;

  return (
    <div className="fade-in">
      <div className="page-header">
        <div className="page-header-actions">
          <div>
            <h1>Groups</h1>
            <p>Manage your expense groups and memberships</p>
          </div>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            <Plus size={16} /> New Group
          </button>
        </div>
      </div>

      {error && <div style={{ color: 'var(--danger)', marginBottom: '1rem' }}>{error}</div>}

      {groups.length === 0 ? (
        <div className="empty-state">
          <Users size={64} strokeWidth={1.2} />
          <h3>No groups yet</h3>
          <p>Create your first group to start tracking expenses</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 'var(--space-4)' }}>
          {groups.map((g) => (
            <div key={g.id} className="card" style={{ cursor: 'pointer' }} onClick={() => openGroupDetail(g.id)}>
              <div className="card-header">
                <div>
                  <h3 className="card-title">{g.name}</h3>
                  <div className="card-subtitle">{g.description || 'No description'}</div>
                </div>
                <span className="badge badge-accent">{g.member_count || 0} members</span>
              </div>
              <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)', marginTop: 'var(--space-3)' }}>
                Created by {g.created_by_name || 'Unknown'} · {formatDate(g.created_at)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ---- Create Group Modal ---- */}
      {showCreate && (
        <div className="modal-overlay visible" onClick={(e) => e.target === e.currentTarget && setShowCreate(false)}>
          <div className="modal-content">
            <div className="modal-header">
              <h3 className="modal-title">Create Group</h3>
              <button className="modal-close" onClick={() => setShowCreate(false)}>
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleCreateGroup}>
              <div className="form-group">
                <label className="form-label">Group Name</label>
                <input
                  type="text" className="form-input" placeholder="e.g., Flat Expenses"
                  value={newName} onChange={(e) => setNewName(e.target.value)} required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea
                  className="form-textarea" placeholder="Optional description..."
                  value={newDesc} onChange={(e) => setNewDesc(e.target.value)}
                />
              </div>
              <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <input 
                  type="checkbox" 
                  id="joinAsMember"
                  checked={joinAsMember}
                  onChange={(e) => setJoinAsMember(e.target.checked)}
                />
                <label htmlFor="joinAsMember" style={{ cursor: 'pointer' }}>Join this group as a member</label>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Creating...' : 'Create Group'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---- Group Detail Modal ---- */}
      {selectedGroup && groupDetail && (
        <div className="modal-overlay visible" onClick={(e) => e.target === e.currentTarget && setSelectedGroup(null)}>
          <div className="modal-content" style={{ maxWidth: 640 }}>
            <div className="modal-header">
              <h3 className="modal-title">{groupDetail.name}</h3>
              <button className="modal-close" onClick={() => setSelectedGroup(null)}>
                <X size={16} />
              </button>
            </div>

            <p style={{ color: 'var(--text-muted)', marginBottom: 'var(--space-6)' }}>
              {groupDetail.description || 'No description'}
            </p>

            {/* Members Table */}
            <h4 style={{ fontWeight: 600, marginBottom: 'var(--space-3)' }}>Members</h4>
            <div className="table-wrapper" style={{ marginBottom: 'var(--space-6)' }}>
              <table>
                <thead>
                  <tr><th>Name</th><th>Joined</th><th>Status</th><th></th></tr>
                </thead>
                <tbody>
                  {groupDetail.members.map((m) => (
                    <tr key={`${m.user_id}-${m.joined_at}`}>
                      <td>
                        <strong>{m.display_name}</strong>{' '}
                        <span style={{ color: 'var(--text-muted)' }}>@{m.username}</span>
                      </td>
                      <td>{formatDate(m.joined_at)}</td>
                      <td>
                        {m.left_at ? (
                          <span className="badge badge-warning">Left {formatDate(m.left_at)}</span>
                        ) : (
                          <span className="badge badge-success">Active</span>
                        )}
                      </td>
                      <td>
                        {!m.left_at && (
                          <button className="btn-icon" title="Remove" onClick={() => handleRemoveMember(m.user_id)}>
                            <Trash2 size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Add Member */}
            <h4 style={{ fontWeight: 600, marginBottom: 'var(--space-3)' }}>
              <UserPlus size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
              Add Member
            </h4>
            <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <select className="form-select" value={addMemberId} onChange={(e) => setAddMemberId(e.target.value)}>
                  <option value="">Select user...</option>
                  {availableUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.display_name} (@{u.username})
                    </option>
                  ))}
                </select>
              </div>
              <input
                type="date" className="form-input" style={{ width: 160 }}
                value={addMemberDate} onChange={(e) => setAddMemberDate(e.target.value)}
              />
              <button className="btn btn-primary btn-sm" onClick={handleAddMember} disabled={!addMemberId}>
                Add
              </button>
            </div>

            {/* Delete Group */}
            <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
              <button className="btn btn-danger btn-sm" onClick={() => handleDeleteGroup(selectedGroup)}>
                <Trash2 size={14} /> Delete Group
              </button>
              <button className="btn btn-secondary" onClick={() => setSelectedGroup(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Groups;
