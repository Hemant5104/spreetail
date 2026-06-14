import React, { useState, useEffect, useRef } from 'react';
import { ImportAPI, GroupsAPI, AuthAPI } from '../api';
import { Upload, CheckCircle, X, Edit2, Save, FileText, Trash2, Clock, Eye } from 'lucide-react';
import ErrorReviewCard from '../components/ErrorReviewCard';

const Import = () => {
  const [groups, setGroups] = useState([]);
  const [group, setGroup] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [commitResult, setCommitResult] = useState(null);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  
  // Tabs & History
  const [activeTab, setActiveTab] = useState('import');
  const [importHistory, setImportHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [viewEditsModal, setViewEditsModal] = useState(null);

  // Group Members & All Users for dropdowns
  const [groupMembers, setGroupMembers] = useState([]);
  const [allUsers, setAllUsers] = useState([]);

  // Manual Editing State
  const [editedRows, setEditedRows] = useState({});
  const [editingRowIndex, setEditingRowIndex] = useState(null);
  const [editFormData, setEditFormData] = useState({});
  const [resolvedIndices, setResolvedIndices] = useState(new Set());

  useEffect(() => {
    const fetchGroup = async () => {
      try {
        const fetchedGroups = await GroupsAPI.getGroups();
        setGroups(fetchedGroups);
        if (fetchedGroups.length > 0) setGroup(fetchedGroups[0]);
      } catch (err) {
        console.error(err);
      }
    };
    const fetchUsers = async () => {
      try {
        const users = await AuthAPI.getUsers();
        setAllUsers(users);
      } catch (err) {
        console.error(err);
      }
    };
    fetchGroup();
    fetchUsers();
  }, []);

  useEffect(() => {
    if (group && activeTab === 'history') {
      fetchHistory();
    }
  }, [group, activeTab]);

  useEffect(() => {
    const fetchGroupMembers = async () => {
      if (!group) return;
      try {
        const fullGroup = await GroupsAPI.getGroup(group.id);
        setGroupMembers(fullGroup.members || []);
      } catch (err) {
        console.error('Failed to fetch group members', err);
      }
    };
    fetchGroupMembers();
  }, [group]);

  const fetchHistory = async () => {
    if (!group) return;
    setHistoryLoading(true);
    try {
      const history = await ImportAPI.getImportHistory(group.id);
      setImportHistory(history);
    } catch (err) {
      console.error(err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleGroupChange = (e) => {
    const selectedId = parseInt(e.target.value, 10);
    const selectedGroup = groups.find(g => g.id === selectedId);
    setGroup(selectedGroup || null);
    // Reset state when group changes
    setImportResult(null);
    setCommitResult(null);
    setEditedRows({});
    setResolvedIndices(new Set());
    setError('');
  };

  const analyzeFile = async (file) => {
    if (!group) {
      setError('Please create or select a group first');
      return;
    }

    setImporting(true);
    setError('');
    setImportResult(null);
    setCommitResult(null);
    setEditedRows({});
    setResolvedIndices(new Set());

    try {
      const formData = new FormData();
      formData.append('csv', file);
      formData.append('group_id', group.id);

      const result = await ImportAPI.analyzeCSV(formData);
      setImportResult(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setImporting(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) analyzeFile(file);
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) analyzeFile(file);
    // Reset file input so same file can be selected again
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClearFile = () => {
    setImportResult(null);
    setCommitResult(null);
    setEditedRows({});
    setResolvedIndices(new Set());
    setError('');
  };

  const handleCommit = async () => {
    if (!importResult) return;
    setImporting(true);
    setError('');

    try {
      const result = await ImportAPI.commitImport({
        import_id: importResult.importId,
        group_id: group.id,
        csv_path: importResult.csvFilePath,
        resolutions: {},
        edited_rows: editedRows,
      });
      setCommitResult(result);
      if (activeTab === 'history') fetchHistory();
    } catch (err) {
      setError(err.message);
    } finally {
      setImporting(false);
    }
  };

  const typeLabels = {
    duplicate_entry: '🔁 Duplicate',
    comma_in_amount: '🔢 Format',
    fractional_amount: '🔢 Precision',
    inconsistent_name: '👤 Name',
    missing_payer: '❓ Missing',
    settlement_as_expense: '💸 Settlement',
    bad_percentages: '📐 Percentage',
    inconsistent_date: '📅 Date',
    mixed_currencies: '💱 Currency',
    conflicting_duplicate: '⚠️ Conflict',
    negative_amount: '➖ Refund',
    missing_currency: '💱 Missing',
    amount_whitespace: '🔢 Format',
    zero_amount: '0️⃣ Zero',
    ambiguous_date: '📅 Ambiguous',
    stale_member: '👻 Stale',
    conflicting_split: '⚡ Conflict',
    non_group_member: '👤 Guest',
  };

  // Group anomalies by row
  const anomaliesByRow = {};
  const anomalies = importResult?.anomalies || [];
  
  anomalies.forEach((a) => {
    if (!a.rows) return;
    a.rows.forEach((r) => {
      if (!anomaliesByRow[r]) {
        anomaliesByRow[r] = [];
      }
      anomaliesByRow[r].push(a);
    });
  });

  const handleEditClick = (rowNum) => {
    const existingEdits = editedRows[rowNum];
    const originalData = importResult?.processedRows?.[rowNum - 2] || {};
    
    setEditFormData({
      date: existingEdits?.date ?? (originalData.date || ''),
      description: existingEdits?.description ?? (originalData.description || ''),
      amount: existingEdits?.amount ?? (originalData.amount || ''),
      paid_by: existingEdits?.paid_by ?? (originalData.paid_by || ''),
      currency: existingEdits?.currency ?? (originalData.currency || ''),
      split_type: existingEdits?.split_type ?? (originalData.split_type || ''),
      split_details: existingEdits?.split_details ?? (originalData.split_details || ''),
      split_with: existingEdits?.split_with ?? (originalData.split_with || ''),
      notes: existingEdits?.notes ?? (originalData.notes || ''),
    });
    setEditingRowIndex(rowNum);
  };

  const handleSplitTypeChange = (newType) => {
    if (newType === 'equal') {
      const allNames = allUsers.map(m => m.display_name).join(';');
      setEditFormData(prev => ({ ...prev, split_type: newType, split_with: allNames, split_details: allNames }));
    } else {
      setEditFormData(prev => ({ ...prev, split_type: newType }));
    }
  };

  const handleSaveEdit = (rowNum) => {
    setEditedRows({
      ...editedRows,
      [rowNum]: { ...editFormData }
    });
    setEditingRowIndex(null);
  };

  return (
    <div className="fade-in w-full flex flex-col items-center">
      <div className="w-full max-w-[900px]">
        <div className="page-header">
          <div className="page-header-actions" style={{ alignItems: 'flex-start' }}>
            <div>
              <h1>Import Expenses</h1>
              <p>Upload your CSV file — detect anomalies and manually resolve them before importing.</p>
            </div>
            {groups.length > 0 && (
              <select 
                className="form-select" 
                value={group?.id || ''} 
                onChange={handleGroupChange}
                style={{ width: '200px' }}
              >
                {groups.map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div className="tabs mb-8">
          <button className={`tab ${activeTab === 'import' ? 'active' : ''}`} onClick={() => setActiveTab('import')}>
            <Upload size={16} className="inline mr-2" /> Import CSV
          </button>
          <button className={`tab ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>
            <Clock size={16} className="inline mr-2" /> Import History
          </button>
        </div>

        {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl">{error}</div>}

        {activeTab === 'history' && (
          <div className="card" style={{ padding: 0 }}>
            {historyLoading ? (
              <div className="spinner my-8"></div>
            ) : importHistory.length > 0 ? (
              <div className="table-wrapper" style={{ border: 'none' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Imported By</th>
                      <th>Rows</th>
                      <th>Success</th>
                      <th>Skipped</th>
                      <th>Edits</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {importHistory.map(h => (
                      <tr key={h.id}>
                        <td>{new Date(h.created_at).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                        <td>{h.importer_name}</td>
                        <td>{h.total_rows}</td>
                        <td className="text-emerald-600 font-bold">{h.imported_rows}</td>
                        <td className="text-amber-500 font-bold">{h.skipped_rows}</td>
                        <td>
                          {h.edited_rows && Object.keys(h.edited_rows).length > 0 ? (
                            <span className="badge badge-success">{Object.keys(h.edited_rows).length} rows</span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td>
                          {h.edited_rows && Object.keys(h.edited_rows).length > 0 && (
                            <button className="btn btn-secondary btn-sm" onClick={() => setViewEditsModal(h)}>
                              <Eye size={14} /> View Edits
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-state">
                <FileText size={48} className="text-gray-300" />
                <h3>No import history</h3>
                <p>You haven't imported any CSV files for this group yet.</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'import' && (
          <>
            {/* Commit Result */}
            {commitResult && (
              <div className="card mb-6 slide-up" style={{ borderColor: '#10B981' }}>
                <div className="card-header">
                  <h3 className="card-title flex items-center gap-2">
                    <CheckCircle size={24} className="text-emerald-500" />
                    Import Complete!
                  </h3>
                </div>
                <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
                  <div className="stat-card p-4">
                    <div className="stat-value text-emerald-600">{commitResult.imported}</div>
                    <div className="stat-label">Imported</div>
                  </div>
                  <div className="stat-card p-4">
                    <div className="stat-value text-amber-500">{commitResult.skipped}</div>
                    <div className="stat-label">Skipped</div>
                  </div>
                  <div className="stat-card p-4">
                    <div className="stat-value text-blue-500">{commitResult.settlements}</div>
                    <div className="stat-label">Settlements</div>
                  </div>
                </div>
                {commitResult.errors && commitResult.errors.length > 0 && (
                  <div className="table-wrapper mt-4">
                    <table>
                      <thead><tr><th>Row</th><th>Error</th></tr></thead>
                      <tbody>
                        {commitResult.errors.map((e, i) => (
                          <tr key={i}><td>{e.row}</td><td className="text-red-600 font-medium">{e.error}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <button className="btn btn-secondary mt-6 w-full" onClick={handleClearFile}>
                  Import Another File
                </button>
              </div>
            )}

            {/* Dropzone */}
            {!commitResult && !importResult && (
              <div className="card mb-6">
                <div
                  style={{
                    border: `2px dashed ${dragOver ? '#000' : '#D1D5DB'}`,
                    borderRadius: '1rem',
                    padding: '4rem 2rem',
                    textAlign: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    backgroundColor: dragOver ? '#F3F4F6' : 'transparent',
                  }}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {importing ? (
                    <>
                      <div className="spinner mb-4 border-t-black"></div>
                      <h3 className="text-lg font-bold text-gray-900">Analyzing CSV...</h3>
                      <p className="text-gray-500">Detecting anomalies and checking row counts</p>
                    </>
                  ) : (
                    <>
                      <Upload size={48} className="mx-auto mb-4 text-gray-400" />
                      <h3 className="text-lg font-bold text-gray-900 mb-1">Drop your CSV file here</h3>
                      <p className="text-gray-500">or click to browse · Supports expenses_export.csv</p>
                    </>
                  )}
                  <input type="file" ref={fileInputRef} accept=".csv" style={{ display: 'none' }} onChange={handleFileSelect} />
                </div>
              </div>
            )}

            {/* Row-Wise Problem Display */}
            {importResult && !commitResult && (
              <div className="slide-up">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900">Review Errors</h2>
                    <p className="text-gray-500">Please review and fix the following anomalies before importing.</p>
                  </div>
                  <button className="btn btn-secondary" onClick={handleClearFile}>
                    <Trash2 size={16} /> Remove File
                  </button>
                </div>

                <div className="space-y-6">
                  {(() => {
                    const flatAnomalies = [];
                    (importResult.anomalies || []).forEach(a => {
                      if (a.rows) {
                        a.rows.forEach(r => flatAnomalies.push({ anomaly: a, rowNum: r }));
                      }
                    });

                    const unresolvedAnomalies = flatAnomalies
                      .map((item, idx) => ({ ...item, idx }))
                      .filter(item => !resolvedIndices.has(item.idx) && item.anomaly.severity === 'review');

                    if (unresolvedAnomalies.length === 0) {
                      return (
                        <div className="empty-state">
                          <CheckCircle size={48} className="text-emerald-400" />
                          <h3>All problems resolved!</h3>
                          <p>Your CSV is ready to import.</p>
                        </div>
                      );
                    }

                    return unresolvedAnomalies.map(({ anomaly, rowNum, idx }, currentDisplayIdx) => {
                      const originalData = importResult.processedRows[rowNum - 2] || {};
                      
                      const handleApplyFix = (rNum, patchData, note) => {
                        setEditedRows(prev => ({
                          ...prev,
                          [rNum]: { ...(prev[rNum] || {}), ...patchData, _fix_note: note }
                        }));
                        setResolvedIndices(prev => new Set(prev).add(idx));
                      };

                      const handleSkip = () => {
                        setResolvedIndices(prev => new Set(prev).add(idx));
                      };

                      const handleDeleteRow = (rNum) => {
                        setEditedRows(prev => ({
                          ...prev,
                          [rNum]: { _deleted: true }
                        }));
                        // Also mark any other anomaly for this row as resolved so it disappears
                        const newResolved = new Set(resolvedIndices);
                        flatAnomalies.forEach((f, fIdx) => {
                          if (f.rowNum === rNum) newResolved.add(fIdx);
                        });
                        setResolvedIndices(newResolved);
                      };

                      return (
                        <ErrorReviewCard
                          key={idx}
                          anomaly={anomaly}
                          rowNum={rowNum}
                          originalData={{ ...originalData, ...(editedRows[rowNum] || {}) }}
                          allUsers={allUsers}
                          onApplyFix={handleApplyFix}
                          onSkip={handleSkip}
                          onDelete={handleDeleteRow}
                          index={currentDisplayIdx + 1}
                          total={unresolvedAnomalies.length}
                        />
                      );
                    });
                  })()}
                </div>

                {/* Commit Footer */}
                <div className="mt-8 flex items-center justify-between p-6 bg-white border border-gray-200 rounded-2xl shadow-sm">
                  <div>
                    <h3 className="font-bold text-lg text-gray-900">Ready to import?</h3>
                    <p className="text-gray-500">You've manually edited {Object.keys(editedRows).length} rows.</p>
                  </div>
                  <button className="btn btn-primary btn-lg" onClick={handleCommit} disabled={importing}>
                    {importing ? 'Importing...' : '✓ Commit Import'}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* View Edits Modal */}
      {viewEditsModal && (
        <div className="modal-overlay visible" onClick={(e) => e.target === e.currentTarget && setViewEditsModal(null)}>
          <div className="modal-content" style={{ maxWidth: '800px' }}>
            <div className="modal-header">
              <h3 className="modal-title">Manually Edited Rows</h3>
              <button className="modal-close" onClick={() => setViewEditsModal(null)}><X size={16} /></button>
            </div>
            <div className="space-y-4">
              {Object.entries(viewEditsModal.edited_rows || {}).map(([rowNum, edits]) => (
                <div key={rowNum} className="card p-4 border-l-4 border-l-emerald-500">
                  <h4 className="font-bold text-gray-900 mb-2">Row {rowNum}</h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    {Object.entries(edits).map(([key, val]) => (
                      <div key={key}>
                        <span className="text-gray-500 font-semibold uppercase text-xs tracking-wider">{key.replace('_', ' ')}</span>
                        <div className="font-mono mt-1 text-gray-900">{val || '—'}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Import;
