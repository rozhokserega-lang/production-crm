import React, { useState, Suspense } from 'react';
import { Layout } from './components/Layout/Layout';
import { useAuth } from './hooks/useAuth';
import { useFilters } from './hooks/useFilters';
import { VIEWS, TABS } from './constants/views';
import { 
  ShipmentView,
  WorkshopView,
  OverviewView,
  WarehouseView,
  LaborView,
  StatsView,
  FurnitureView,
  AdminView
} from './views';

// Loading fallback for lazy components
const ViewLoader = () => (
  <div className="view-loader">
    <div className="spinner"></div>
    <p>Загрузка...</p>
  </div>
);

function App() {
  const [currentView, setCurrentView] = useState('shipment');
  const [currentTab, setCurrentTab] = useState('all');
  
  const { user, loading: authLoading, signIn, signOut, isAuthenticated } = useAuth();
  const { filters, updateFilter, resetFilters } = useFilters();

  // Show loading screen during auth check
  if (authLoading) {
    return (
      <div className="auth-loading">
        <div className="spinner"></div>
        <p>Проверка авторизации...</p>
      </div>
    );
  }

  // Show login if not authenticated
  if (!isAuthenticated) {
    return <LoginView onSignIn={signIn} />;
  }

  const handleViewChange = (viewId) => {
    setCurrentView(viewId);
    // Reset tab when switching views
    setCurrentTab('all');
  };

  const handleTabChange = (tabId) => {
    setCurrentTab(tabId);
  };

  const showTabs = ['workshop', 'overview'].includes(currentView);

  const renderCurrentView = () => {
    const viewProps = {
      filters,
      updateFilter,
      resetFilters,
      currentTab,
      onTabChange: handleTabChange
    };

    return (
      <Suspense fallback={<ViewLoader />}>
        {currentView === 'shipment' && <ShipmentView {...viewProps} />}
        {currentView === 'workshop' && <WorkshopView {...viewProps} />}
        {currentView === 'overview' && <OverviewView {...viewProps} />}
        {currentView === 'warehouse' && <WarehouseView {...viewProps} />}
        {currentView === 'labor' && <LaborView {...viewProps} />}
        {currentView === 'stats' && <StatsView {...viewProps} />}
        {currentView === 'furniture' && <FurnitureView {...viewProps} />}
        {currentView === 'admin' && <AdminView {...viewProps} />}
      </Suspense>
    );
  };

  return (
    <Layout
      currentView={currentView}
      currentTab={currentTab}
      onViewChange={handleViewChange}
      onTabChange={handleTabChange}
      showTabs={showTabs}
      user={user}
      onSignOut={signOut}
    >
      {renderCurrentView()}
    </Layout>
  );
}

// Simple login component
function LoginView({ onSignIn }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await onSignIn(email, password);
    } catch (err) {
      setError(err.message || 'Ошибка входа');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <h1>Production CRM</h1>
        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="email">Email:</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="password">Пароль:</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error && <div className="error-message">{error}</div>}

          <button 
            type="submit" 
            className="login-btn"
            disabled={loading}
          >
            {loading ? 'Вход...' : 'Войти'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default App;
