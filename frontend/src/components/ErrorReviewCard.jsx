import React, { useState } from 'react';
import { AlertCircle, Check, Trash2, FastForward } from 'lucide-react';

const typeLabels = {
  duplicate_entry: '🔁 Duplicate Entry',
  comma_in_amount: '🔢 Invalid Amount Format',
  fractional_amount: '🔢 Precision Issue',
  inconsistent_name: '👤 Name Mismatch',
  missing_payer: '❓ Missing Payer',
  settlement_as_expense: '💸 Settlement Misclassified',
  bad_percentages: '📐 Percentage Mismatch',
  inconsistent_date: '📅 Date Format Issue',
  mixed_currencies: '💱 Currency Conflict',
  conflicting_duplicate: '⚠️ Conflicting Duplicate',
  negative_amount: '➖ Negative Amount',
  missing_currency: '💱 Missing Currency',
  amount_whitespace: '🔢 Invalid Amount (Whitespace)',
  zero_amount: '0️⃣ Zero Amount',
  ambiguous_date: '📅 Ambiguous Date',
  stale_member: '👻 Unknown Member',
  conflicting_split: '⚡ Split Conflict',
  non_group_member: '👤 Guest User',
};

const ErrorReviewCard = ({ 
  anomaly, 
  rowNum, 
  originalData, 
  allUsers, 
  onApplyFix, 
  onSkip, 
  onDelete, 
  index, 
  total 
}) => {
  const [note, setNote] = useState('');
  
  // Specific states for different fix actions
  const [amount, setAmount] = useState(originalData.amount || '');
  const [payer, setPayer] = useState(originalData.paid_by || '');
  const [currency, setCurrency] = useState(originalData.currency || '');
  const [date, setDate] = useState(originalData.date || '');
  const [splitType, setSplitType] = useState(originalData.split_type || 'equal');
  const [duplicateAction, setDuplicateAction] = useState('');
  const [guestMappings, setGuestMappings] = useState({});
  const [removeInactive, setRemoveInactive] = useState(true);
  
  const [percentages, setPercentages] = useState(() => {
    if (anomaly.type !== 'bad_percentages') return {};
    const details = originalData.split_details || '';
    const result = {};
    const parts = details.split(';').map(s => s.trim());
    for (const part of parts) {
      const match = part.match(/^(.+?)\s+([\d.]+)%?$/);
      if (match) {
        result[match[1].trim()] = match[2];
      }
    }
    return result;
  });

  const handleApply = () => {
    let patch = {};
    if (anomaly.type === 'missing_payer' || anomaly.type === 'inconsistent_name') {
      patch.paid_by = payer;
    } else if (anomaly.type.includes('amount')) {
      patch.amount = amount;
    } else if (anomaly.type.includes('currency')) {
      patch.currency = currency;
    } else if (anomaly.type.includes('date')) {
      patch.date = date;
    } else if (anomaly.type === 'settlement_as_expense') {
      patch.split_type = splitType;
    } else if (anomaly.type === 'conflicting_split') {
      patch.split_type = splitType;
    } else if (anomaly.type === 'duplicate_entry') {
      patch._duplicate_resolution = duplicateAction; // We'll handle this in backend or just skip
    } else if (anomaly.type === 'bad_percentages') {
      patch.split_details = Object.entries(percentages).map(([name, val]) => `${name} ${val}%`).join('; ');
    } else if (anomaly.type === 'non_group_member') {
      let updatedSplitWith = originalData.split_with || '';
      Object.entries(guestMappings).forEach(([guest, host]) => {
        if (host) {
          // Replace guest with host in split_with and split_details
          const regex = new RegExp(`\\b${guest}\\b`, 'gi');
          updatedSplitWith = updatedSplitWith.replace(regex, host);
          if (patch.split_details || originalData.split_details) {
            patch.split_details = (patch.split_details || originalData.split_details).replace(regex, host);
          }
        }
      });
      patch.split_with = updatedSplitWith;
    } else if (anomaly.type === 'inactive_member' || anomaly.type === 'stale_member') {
      if (removeInactive) {
        const member = anomaly.original.member || 'meera';
        const regex = new RegExp(`\\b${member}\\b;?|;?\\b${member}\\b`, 'gi');
        patch.split_with = (originalData.split_with || '').replace(regex, '').replace(/^;|;$/g, '').replace(/;+/g, ';').trim();
      }
    }

    onApplyFix(rowNum, patch, note);
  };

  const renderFixUI = () => {
    switch (anomaly.type) {
      case 'duplicate_entry':
      case 'conflicting_duplicate':
        return (
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-700">How would you like to resolve this duplicate?</p>
            <div className="flex gap-4">
              <label className="flex items-center gap-2"><input type="radio" name={`dup-${rowNum}`} onChange={() => setDuplicateAction('keep_this')} /> Keep this one</label>
              <label className="flex items-center gap-2"><input type="radio" name={`dup-${rowNum}`} onChange={() => setDuplicateAction('keep_existing')} /> Keep existing</label>
              <label className="flex items-center gap-2"><input type="radio" name={`dup-${rowNum}`} onChange={() => setDuplicateAction('merge')} /> Merge both</label>
            </div>
          </div>
        );
      case 'missing_payer':
      case 'inconsistent_name':
        return (
          <div>
            <label className="form-label text-sm">Select Payer</label>
            <select className="form-select w-full max-w-xs" value={payer} onChange={(e) => setPayer(e.target.value)}>
              <option value="">Select...</option>
              {allUsers.map(u => <option key={u.id} value={u.display_name}>{u.display_name}</option>)}
            </select>
          </div>
        );
      case 'zero_amount':
      case 'comma_in_amount':
      case 'amount_whitespace':
      case 'fractional_amount':
      case 'negative_amount':
        return (
          <div>
            <label className="form-label text-sm">Correct Amount</label>
            <input type="text" className="form-input w-full max-w-xs" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
        );
      case 'missing_currency':
      case 'mixed_currencies':
        return (
          <div>
            <label className="form-label text-sm">Select Currency</label>
            <select className="form-select w-full max-w-xs" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              <option value="">Select...</option>
              <option value="INR">INR (₹)</option>
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (€)</option>
              <option value="GBP">GBP (£)</option>
            </select>
          </div>
        );
      case 'inconsistent_date':
      case 'ambiguous_date':
        return (
          <div>
            <label className="form-label text-sm">Correct Date</label>
            <input type="date" className="form-input w-full max-w-xs" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        );
      case 'settlement_as_expense':
        return (
          <div className="space-y-3">
            <p className="text-sm font-medium text-gray-700">This looks like a repayment. Convert it?</p>
            <label className="flex items-center gap-2 cursor-pointer">
              <input 
                type="checkbox" 
                className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                checked={splitType === 'settlement'} 
                onChange={(e) => setSplitType(e.target.checked ? 'settlement' : (originalData.split_type || 'equal'))} 
              /> 
              <span className="text-sm">Yes, convert to Settlement</span>
            </label>
          </div>
        );
      case 'conflicting_split':
        return (
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-700">Choose definitive split type:</p>
            <div className="flex gap-4">
              <label className="flex items-center gap-2">
                <input type="radio" name={`split-${rowNum}`} value="equal" checked={splitType === 'equal'} onChange={(e) => setSplitType(e.target.value)} /> Equal
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name={`split-${rowNum}`} value="percentage" checked={splitType === 'percentage'} onChange={(e) => setSplitType(e.target.value)} /> Percentage
              </label>
            </div>
          </div>
        );
      case 'bad_percentages': {
        const total = Object.values(percentages).reduce((s, v) => s + (parseFloat(v) || 0), 0);
        const is100 = Math.abs(total - 100) < 0.01;
        return (
          <div className="space-y-3">
            <p className="text-sm font-medium text-gray-700">Adjust percentages to equal 100%:</p>
            {Object.keys(percentages).map(name => (
              <div key={name} className="flex items-center gap-2">
                <span className="w-24 text-sm font-medium">{name}</span>
                <input 
                  type="number" 
                  className="form-input w-24 text-right" 
                  value={percentages[name]} 
                  onChange={e => setPercentages({...percentages, [name]: e.target.value})} 
                /> <span className="text-gray-500">%</span>
              </div>
            ))}
            <div className={`mt-2 font-bold text-sm ${is100 ? 'text-green-600' : 'text-red-600'}`}>
              Total: {total}% {is100 && '✓'}
            </div>
          </div>
        );
      }
      case 'non_group_member':
        return (
          <div className="space-y-3">
            <p className="text-sm font-medium text-gray-700">Assign unknown participants to a host:</p>
            {anomaly.original.unknown.map(guest => (
              <div key={guest} className="flex items-center gap-2">
                <span className="w-32 text-sm truncate font-medium">{guest}</span>
                <select 
                  className="form-select text-sm w-full max-w-xs" 
                  value={guestMappings[guest] || ''}
                  onChange={(e) => setGuestMappings({...guestMappings, [guest]: e.target.value})}
                >
                  <option value="">Keep as separate Guest</option>
                  {allUsers.map(u => <option key={u.id} value={u.display_name}>{u.display_name}</option>)}
                </select>
              </div>
            ))}
          </div>
        );
      case 'inactive_member':
      case 'stale_member':
        return (
          <div className="space-y-3">
            <p className="text-sm font-medium text-gray-700">Remove {anomaly.original.member || 'this inactive member'} from this expense?</p>
            <div className="flex gap-4">
              <label className="flex items-center gap-2">
                <input type="radio" checked={removeInactive} onChange={() => setRemoveInactive(true)} /> Yes, remove them
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" checked={!removeInactive} onChange={() => setRemoveInactive(false)} /> No, keep them
              </label>
            </div>
          </div>
        );
      default:
        return (
          <p className="text-sm text-gray-500 italic">No specific quick-fix UI for this error type yet. You can use the row editor to fix it.</p>
        );
    }
  };

  return (
    <div className="card mb-6 border-l-4 border-l-amber-500 shadow-sm relative overflow-hidden bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-100 pb-4 mb-4">
        <div className="flex items-center gap-3">
          <AlertCircle className="text-amber-500" size={20} />
          <h3 className="font-bold text-lg text-gray-900">{typeLabels[anomaly.type] || anomaly.type}</h3>
        </div>
        <span className="badge bg-amber-100 text-amber-800 font-semibold px-3 py-1">Error {index} of {total}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left Col: Details & Preview */}
        <div>
          <p className="text-gray-700 mb-4">{anomaly.description}</p>
          
          <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Affected Row (Row {rowNum})</h4>
            <div className="grid grid-cols-2 gap-y-2 text-sm">
              <div className="text-gray-500">Date</div><div className="font-mono text-gray-900">{originalData.date || '—'}</div>
              <div className="text-gray-500">Description</div><div className="font-mono text-gray-900">{originalData.description || '—'}</div>
              <div className="text-gray-500">Paid By</div><div className="font-mono text-gray-900">{originalData.paid_by || '—'}</div>
              <div className="text-gray-500">Amount</div><div className="font-mono text-gray-900">{originalData.amount} {originalData.currency}</div>
              <div className="text-gray-500">Split Type</div><div className="font-mono text-gray-900">{originalData.split_type || '—'}</div>
              <div className="text-gray-500">Split With</div><div className="font-mono text-gray-900 truncate" title={originalData.split_with}>{originalData.split_with || '—'}</div>
            </div>
          </div>
        </div>

        {/* Right Col: Fix Actions */}
        <div className="flex flex-col h-full">
          <div className="bg-blue-50/50 rounded-xl p-4 border border-blue-100 flex-grow mb-4">
            <h4 className="text-sm font-bold text-blue-900 mb-4">Resolution</h4>
            {renderFixUI()}
            
            <div className="mt-4 pt-4 border-t border-blue-100/50">
              <label className="form-label text-xs text-blue-800">Reason / Note (Optional)</label>
              <textarea 
                className="form-input text-sm w-full" 
                rows="2" 
                placeholder="Why are you making this change?"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center gap-2 mt-auto">
            <button className="btn btn-primary flex-1 justify-center" onClick={handleApply}>
              <Check size={16} /> Apply Fix
            </button>
            <button className="btn btn-secondary flex-1 justify-center" onClick={() => onSkip(rowNum)}>
              <FastForward size={16} /> Skip
            </button>
            <button className="btn btn-ghost text-red-600 hover:bg-red-50" title="Delete Row" onClick={() => onDelete(rowNum)}>
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ErrorReviewCard;
