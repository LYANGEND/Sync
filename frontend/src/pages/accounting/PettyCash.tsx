import { useState, useEffect } from 'react';
import { Plus, Wallet, ArrowUpCircle, ArrowDownCircle, Loader2 } from 'lucide-react';
import { pettyCashApi, PettyCashAccount, PettyCashTransaction } from '../../services/accountingService';
import Modal from '../../components/ui/Modal';
import toast from 'react-hot-toast';

const PettyCash = ({ embedded = false }: { embedded?: boolean }) => {
  const [accounts, setAccounts] = useState<PettyCashAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [transactions, setTransactions] = useState<PettyCashTransaction[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Modals
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [showTransactionModal, setShowTransactionModal] = useState(false);
  const [accountForm, setAccountForm] = useState({ name: '', floatAmount: '', custodianId: '' });
  const [txForm, setTxForm] = useState({ accountId: '', type: 'DISBURSEMENT', amount: '', description: '', category: '' });

  useEffect(() => {
    loadAccounts();
  }, []);

  useEffect(() => {
    if (selectedAccountId) {
      loadAccountData(selectedAccountId);
    }
  }, [selectedAccountId]);

  const loadAccounts = async () => {
    setLoading(true);
    try {
      const res = await pettyCashApi.getAccounts();
      const accts = res.data.accounts || res.data || [];
      setAccounts(accts);
      if (accts.length > 0 && !selectedAccountId) {
        setSelectedAccountId(accts[0].id);
      }
    } catch {
      toast.error('Failed to load accounts');
    } finally {
      setLoading(false);
    }
  };

  const loadAccountData = async (id: string) => {
    try {
      const [txRes, sumRes] = await Promise.all([
        pettyCashApi.getTransactions(id),
        pettyCashApi.getSummary(id),
      ]);
      setTransactions(txRes.data.transactions || txRes.data || []);
      setSummary(sumRes.data);
    } catch {
      toast.error('Failed to load account data');
    }
  };

  const handleCreateAccount = async () => {
    try {
      await pettyCashApi.createAccount({
        name: accountForm.name,
        floatAmount: parseFloat(accountForm.floatAmount),
        custodianId: accountForm.custodianId,
      });
      toast.success('Account created');
      setShowAccountModal(false);
      setAccountForm({ name: '', floatAmount: '', custodianId: '' });
      loadAccounts();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to create account');
    }
  };

  const handleCreateTransaction = async () => {
    try {
      await pettyCashApi.createTransaction({
        accountId: txForm.accountId || selectedAccountId,
        type: txForm.type,
        amount: parseFloat(txForm.amount),
        description: txForm.description,
        category: txForm.category || undefined,
      });
      toast.success('Transaction recorded');
      setShowTransactionModal(false);
      setTxForm({ accountId: '', type: 'DISBURSEMENT', amount: '', description: '', category: '' });
      if (selectedAccountId) {
        loadAccountData(selectedAccountId);
        loadAccounts();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to record transaction');
    }
  };

  const selectedAccount = accounts.find(a => a.id === selectedAccountId);
  const fmt = (n: number) => `K${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

  if (loading) {
    return <div className="ds-page"><div role="status" className="ds-surface flex items-center justify-center gap-3 h-64"><Loader2 size={32} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /><span className="ds-helper">Loading petty cash accounts…</span></div></div>;
  }

  return (
    <div className="ds-page">
      <div className="ds-page-header">
        {!embedded && (
          <div className="min-w-0">
            <h1 className="ds-page-title">Petty Cash</h1>
            <p className="ds-page-subtitle">Manage petty cash floats and transactions</p>
          </div>
        )}
        <div className="ds-actions">
          <button onClick={() => setShowAccountModal(true)}
            className="ds-button-secondary">
            <Wallet size={16} aria-hidden="true" /><span>New Account</span>
          </button>
          {selectedAccountId && (
            <button onClick={() => { setTxForm({ ...txForm, accountId: selectedAccountId }); setShowTransactionModal(true); }}
              className="ds-button-primary">
              <Plus size={16} aria-hidden="true" /><span>New Transaction</span>
            </button>
          )}
        </div>
      </div>

      {accounts.length === 0 ? (
        <div className="ds-surface ds-empty">
          <Wallet size={48} className="mx-auto mb-4" aria-hidden="true" />
          <p>No petty cash accounts yet. Create one to get started.</p>
        </div>
      ) : (
        <>
          {/* Account Selector */}
          <div className="ds-surface p-4 flex flex-wrap gap-3" role="group" aria-label="Petty cash accounts">
            {accounts.map(acct => (
              <button key={acct.id} onClick={() => setSelectedAccountId(acct.id)}
                aria-pressed={selectedAccountId === acct.id}
                className={`min-w-0 max-w-full flex-col items-start text-left ${
                  selectedAccountId === acct.id
                    ? 'ds-button-primary'
                    : 'ds-button-outline'
                }`}>
                <span className="font-semibold text-sm break-words w-full">{acct.name}</span>
                <span className={`ds-badge ${acct.balance < acct.floatAmount * 0.2 ? 'ds-badge-error' : 'ds-badge-success'}`}>
                  <span>{acct.balance < acct.floatAmount * 0.2 ? 'Low balance: ' : 'Balance: '}</span>
                  {fmt(acct.balance)}
                </span>
                <span className="text-sm">Float: {fmt(acct.floatAmount)}</span>
              </button>
            ))}
          </div>

          {selectedAccount && (
            <>
              {/* Stats */}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <div className="ds-card">
                  <p className="ds-helper">Float Amount</p>
                  <p className="text-2xl font-bold break-words text-blue-700 dark:text-blue-300">{fmt(selectedAccount.floatAmount)}</p>
                </div>
                <div className="ds-card">
                  <p className="ds-helper">Current Balance</p>
                  <p className="text-2xl font-bold break-words text-green-700 dark:text-green-300">{fmt(selectedAccount.balance)}</p>
                </div>
                <div className="ds-card">
                  <p className="ds-helper">Total Disbursed</p>
                  <p className="text-2xl font-bold break-words text-red-700 dark:text-red-300">{fmt(summary?.totalDisbursed || 0)}</p>
                </div>
                <div className="ds-card">
                  <p className="ds-helper">Total Replenished</p>
                  <p className="text-2xl font-bold break-words text-purple-700 dark:text-purple-300">{fmt(summary?.totalReplenished || 0)}</p>
                </div>
              </div>

              {/* Summary by category */}
              {summary?.byCategory && summary.byCategory.length > 0 && (
                <div className="ds-card ds-section">
                  <h3>Spending by Category</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                    {summary.byCategory.map((cat: any) => (
                      <div key={cat.category || 'uncategorized'} className="ds-surface-muted min-w-0 p-4 break-words">
                        <p className="ds-helper">{(cat.category || 'Uncategorized').replace(/_/g, ' ')}</p>
                        <p className="font-semibold">{fmt(cat._sum?.amount || 0)}</p>
                        <p className="ds-helper">{cat._count} txn(s)</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Transactions */}
              <div className="ds-card ds-section">
                <h3>Recent Transactions</h3>
                <div className="ds-table-container" role="region" aria-label="Recent petty cash transactions" tabIndex={0}>
                <table className="ds-table">
                  <thead>
                    <tr>
                      <th scope="col">Date</th>
                      <th scope="col">Type</th>
                      <th scope="col">Description</th>
                      <th scope="col">Category</th>
                      <th scope="col" className="text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.length === 0 ? (
                      <tr><td colSpan={5} className="text-center"><span className="ds-helper">No transactions yet</span></td></tr>
                    ) : transactions.map(tx => (
                      <tr key={tx.id}>
                        <td className="whitespace-nowrap">{new Date(tx.date).toLocaleDateString()}</td>
                        <td>
                          {tx.type === 'DISBURSEMENT' ? (
                            <span className="ds-badge ds-badge-error"><ArrowUpCircle size={14} aria-hidden="true" /><span>Disbursement</span></span>
                          ) : (
                            <span className="ds-badge ds-badge-success"><ArrowDownCircle size={14} aria-hidden="true" /><span>Replenishment</span></span>
                          )}
                        </td>
                        <td className="max-w-xs truncate">{tx.description}</td>
                        <td className="text-[var(--text-secondary)]">{(tx.category || '—').replace(/_/g, ' ')}</td>
                        <td className={`text-right font-semibold whitespace-nowrap ${tx.type === 'DISBURSEMENT' ? 'text-red-700 dark:text-red-300' : 'text-green-700 dark:text-green-300'}`}>
                          {tx.type === 'DISBURSEMENT' ? '-' : '+'}{fmt(tx.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* ======== ACCOUNT MODAL ======== */}
      {showAccountModal && (
        <Modal open={showAccountModal} onClose={() => setShowAccountModal(false)} title="New Petty Cash Account"
          footer={<>
            <button onClick={() => setShowAccountModal(false)} className="ds-button-outline">Cancel</button>
            <button onClick={handleCreateAccount} className="ds-button-primary">Create Account</button>
          </>}>
          <div className="ds-section">
            <div className="ds-field">
              <label htmlFor="petty-cash-account-name" className="ds-label">Account Name</label>
              <input id="petty-cash-account-name" type="text" value={accountForm.name} onChange={e => setAccountForm({ ...accountForm, name: e.target.value })}
                className="ds-input" placeholder="e.g., Main Office Petty Cash" />
            </div>
            <div className="ds-field">
              <label htmlFor="petty-cash-float-amount" className="ds-label">Float Amount (ZMW)</label>
              <input id="petty-cash-float-amount" type="number" step="0.01" value={accountForm.floatAmount} onChange={e => setAccountForm({ ...accountForm, floatAmount: e.target.value })}
                className="ds-input" placeholder="0.00" />
            </div>
            <div className="ds-field">
              <label htmlFor="petty-cash-custodian" className="ds-label">Custodian User ID</label>
              <input id="petty-cash-custodian" type="text" value={accountForm.custodianId} onChange={e => setAccountForm({ ...accountForm, custodianId: e.target.value })}
                className="ds-input" placeholder="User ID of the custodian" />
            </div>
          </div>
        </Modal>
      )}

      {/* ======== TRANSACTION MODAL ======== */}
      {showTransactionModal && (
        <Modal open={showTransactionModal} onClose={() => setShowTransactionModal(false)} title="New Transaction"
          footer={<>
            <button onClick={() => setShowTransactionModal(false)} className="ds-button-outline">Cancel</button>
            <button onClick={handleCreateTransaction} className="ds-button-primary">Record Transaction</button>
          </>}>
          <div className="ds-section">
            <div className="ds-field">
              <label htmlFor="petty-cash-transaction-type" className="ds-label">Type</label>
              <select id="petty-cash-transaction-type" value={txForm.type} onChange={e => setTxForm({ ...txForm, type: e.target.value })}
                className="ds-select">
                <option value="DISBURSEMENT">Disbursement (Cash Out)</option>
                <option value="REPLENISHMENT">Replenishment (Cash In)</option>
              </select>
            </div>
            <div className="ds-field">
              <label htmlFor="petty-cash-transaction-amount" className="ds-label">Amount (ZMW)</label>
              <input id="petty-cash-transaction-amount" type="number" step="0.01" value={txForm.amount} onChange={e => setTxForm({ ...txForm, amount: e.target.value })}
                className="ds-input" placeholder="0.00" />
            </div>
            <div className="ds-field">
              <label htmlFor="petty-cash-description" className="ds-label">Description</label>
              <input id="petty-cash-description" type="text" value={txForm.description} onChange={e => setTxForm({ ...txForm, description: e.target.value })}
                className="ds-input" placeholder="What was this for?" />
            </div>
            <div className="ds-field">
              <label htmlFor="petty-cash-category" className="ds-label">Category (optional)</label>
              <input id="petty-cash-category" type="text" value={txForm.category} onChange={e => setTxForm({ ...txForm, category: e.target.value })}
                className="ds-input" placeholder="e.g., Office Supplies" />
            </div>
            {selectedAccount && (
              <div className="ds-surface-muted p-4">
                <p className="ds-helper">Current Balance: <span className="font-bold text-green-700 dark:text-green-300">{fmt(selectedAccount.balance)}</span></p>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
};

export default PettyCash;
