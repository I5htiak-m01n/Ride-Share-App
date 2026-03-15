import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { walletAPI, paymentAPI } from '../api/client';
import './Dashboard.css';

const PRESET_AMOUNTS = [100, 200, 500, 1000, 2000, 5000];

function Wallet() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [balance, setBalance] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [customAmount, setCustomAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  const fetchBalance = useCallback(async () => {
    try {
      const res = await walletAPI.getBalance();
      setBalance(parseFloat(res.data.wallet.balance));
    } catch (err) {
      console.error('fetchBalance error:', err);
    }
  }, []);

  const fetchTransactions = useCallback(async () => {
    try {
      const res = await walletAPI.getTransactions(20, 0);
      setTransactions(res.data.transactions || []);
    } catch (err) {
      console.error('fetchTransactions error:', err);
    }
  }, []);

  // Check for payment redirect status on mount
  useEffect(() => {
    const status = searchParams.get('status');
    if (status === 'success') {
      setSuccessMsg('Payment successful! Your wallet has been topped up.');
      setSearchParams({}, { replace: true });
    } else if (status === 'fail') {
      setError('Payment failed. Please try again.');
      setSearchParams({}, { replace: true });
    } else if (status === 'cancel') {
      setError('Payment was cancelled.');
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    fetchBalance();
    fetchTransactions();
  }, [fetchBalance, fetchTransactions]);

  const handleTopUp = async (amount) => {
    if (!amount || amount <= 0) {
      setError('Enter a valid amount');
      return;
    }
    setError(null);
    setSuccessMsg(null);
    setLoading(true);
    try {
      const res = await paymentAPI.initTopUp(amount);
      if (res.data.url) {
        window.location.href = res.data.url;
      } else {
        setError('Could not start payment. Try again.');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to initiate payment');
    } finally {
      setLoading(false);
    }
  };

  const handleCustomTopUp = () => {
    const amount = parseFloat(customAmount);
    if (isNaN(amount) || amount <= 0) {
      setError('Enter a valid amount');
      return;
    }
    handleTopUp(amount);
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const getDashboardPath = () => {
    if (user?.role === 'driver') return '/driver/dashboard';
    return '/rider/dashboard';
  };

  const formatDate = (ts) => {
    const d = new Date(ts);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      + ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  const typeLabel = (type) => {
    switch (type) {
      case 'wallet_topup': return 'Top-Up';
      case 'ride_payment': return 'Ride Payment';
      case 'refund_payout': return 'Refund';
      case 'platform_fee': return 'Platform Fee';
      default: return type;
    }
  };

  return (
    <div className="dashboard-container">
      <nav className="dashboard-nav">
        <div className="nav-brand">
          <h2>RideShare</h2>
        </div>
        <div className="nav-user">
          <span>Hi, {user?.name || 'User'}</span>
          <button onClick={handleLogout} className="logout-btn">Log out</button>
        </div>
      </nav>

      <div className="dashboard-content">
        <div className="dashboard-header">
          <div>
            <h1>Wallet</h1>
            <p>Manage your balance and top up via SSLCommerz</p>
          </div>
          <button
            onClick={() => navigate(getDashboardPath())}
            className="card-button secondary"
          >
            Back to Dashboard
          </button>
        </div>

        {error && <div className="error-banner">{error}</div>}
        {successMsg && <div className="info-banner">{successMsg}</div>}

        {/* Balance Card */}
        <div className="wallet-page-balance">
          <span>Current Balance</span>
          <strong>{balance !== null ? `${balance.toFixed(2)} BDT` : '...'}</strong>
        </div>

        {/* Top-Up Section */}
        <div className="wallet-topup-section">
          <h3>Top Up Wallet</h3>
          <p className="wallet-topup-hint">Select an amount or enter a custom value</p>
          <div className="wallet-preset-grid">
            {PRESET_AMOUNTS.map((amt) => (
              <button
                key={amt}
                className="wallet-preset-btn"
                onClick={() => handleTopUp(amt)}
                disabled={loading}
              >
                {amt} BDT
              </button>
            ))}
          </div>
          <div className="wallet-custom-row">
            <input
              type="number"
              min="1"
              placeholder="Custom amount"
              value={customAmount}
              onChange={(e) => setCustomAmount(e.target.value)}
              disabled={loading}
            />
            <button
              onClick={handleCustomTopUp}
              disabled={loading || !customAmount}
              className="wallet-custom-btn"
            >
              {loading ? 'Processing...' : 'Top Up'}
            </button>
          </div>
        </div>

        {/* Transaction History */}
        <div className="wallet-txn-section">
          <h3>Recent Transactions</h3>
          {transactions.length === 0 ? (
            <div className="empty-state">
              <h3>No transactions yet</h3>
              <p>Your transaction history will appear here</p>
            </div>
          ) : (
            <div className="wallet-txn-list">
              {transactions.map((txn) => (
                <div key={txn.txn_id} className="wallet-txn-item">
                  <div className="wallet-txn-left">
                    <span className={`wallet-txn-type ${txn.type}`}>{typeLabel(txn.type)}</span>
                    <span className="wallet-txn-date">{formatDate(txn.ts)}</span>
                  </div>
                  <div className="wallet-txn-right">
                    <span className={`wallet-txn-amount ${
                      txn.type === 'wallet_topup' || txn.type === 'refund_payout'
                        ? 'credit'
                        : txn.type === 'ride_payment'
                          ? (user?.role === 'driver' ? 'credit' : 'debit')
                          : txn.type === 'platform_fee'
                            ? 'debit'
                            : 'debit'
                    }`}>
                      {txn.type === 'wallet_topup' || txn.type === 'refund_payout'
                        ? '+'
                        : txn.type === 'ride_payment'
                          ? (user?.role === 'driver' ? '+' : '-')
                          : '-'
                      }{parseFloat(txn.amount).toFixed(2)} {txn.currency}
                    </span>
                    <span className={`wallet-txn-status ${txn.status}`}>{txn.status}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Wallet;
