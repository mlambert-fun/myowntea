import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Ingredients from './pages/Ingredients';
import Products from './pages/Products';
import ProductForm from './pages/ProductForm';
import Variants from './pages/Variants';
import Options from './pages/Options';
import Customers from './pages/Customers';
import CustomerDetail from './pages/CustomerDetail';
import CustomerWishlists from './pages/CustomerWishlists';
import Carts from './pages/Carts';
import Orders from './pages/Orders';
import OrderDetailPage from './pages/OrderDetail';
import Shipments from './pages/Shipments';
import Discounts from './pages/Discounts';
import DiscountFormPage from './pages/DiscountForm';
import Settings from './pages/Settings';
import BlendListings from './pages/BlendListings';
import Packs from './pages/Packs';
import SubscriptionPlans from './pages/SubscriptionPlans';
import AutomationJobs from './pages/AutomationJobs';
import Emails from './pages/Emails';
import RedirectRules from './pages/RedirectRules';
import Translations from './pages/Translations';
import { Toast } from './components/Toast';
import LoginPage from './pages/Login';
import { AdminAuthProvider, useAdminAuth } from './auth';
import { t } from './lib/i18n';

function AdminLoadingScreen() {
  return (
    <div className="admin-auth-screen">
      <div className="admin-auth-card admin-auth-card-loading">
        <p className="admin-auth-eyebrow">My Own Tea</p>
        <h1 className="admin-auth-title">{t('admin.pages.login.loading_session_title')}</h1>
        <p className="admin-auth-subtitle">{t('admin.pages.login.loading_session_subtitle')}</p>
      </div>
    </div>
  );
}

function ProtectedAdminRoutes() {
  const { user, loading } = useAdminAuth();
  const location = useLocation();

  if (loading) {
    return <AdminLoadingScreen />;
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}

function AppRoutes() {
  const { user, loading } = useAdminAuth();

  if (loading) {
    return <AdminLoadingScreen />;
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route element={<ProtectedAdminRoutes />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/ingredients" element={<Ingredients />} />
        <Route path="/products" element={<Products />} />
        <Route path="/products/new" element={<ProductForm />} />
        <Route path="/products/:id" element={<ProductForm />} />
        <Route path="/variants" element={<Variants />} />
        <Route path="/options" element={<Options />} />
        <Route path="/customers" element={<Customers />} />
        <Route path="/customers/:id" element={<CustomerDetail />} />
        <Route path="/customers/:id/wishlists" element={<CustomerWishlists />} />
        <Route path="/carts" element={<Carts />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/orders/:id" element={<OrderDetailPage />} />
        <Route path="/shipments" element={<Shipments />} />
        <Route path="/discounts" element={<Discounts />} />
        <Route path="/discounts/new" element={<DiscountFormPage />} />
        <Route path="/discounts/:id/edit" element={<DiscountFormPage />} />
        <Route path="/blend-listings" element={<BlendListings />} />
        <Route path="/packs" element={<Packs />} />
        <Route path="/subscription-plans" element={<SubscriptionPlans />} />
        <Route path="/automation-jobs" element={<AutomationJobs />} />
        <Route path="/emails" element={<Emails />} />
        <Route path="/redirect-rules" element={<RedirectRules />} />
        <Route path="/translations" element={<Translations />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to={user ? '/' : '/login'} replace />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AdminAuthProvider>
        <Toast />
        <AppRoutes />
      </AdminAuthProvider>
    </BrowserRouter>
  );
}

export default App;
