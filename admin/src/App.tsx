import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
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
import { Toast } from './components/Toast';

function App() {
  // Check if token is in URL params (from login redirect)
  const params = new URLSearchParams(window.location.search);
  const tokenFromUrl = params.get('token');
  
  if (tokenFromUrl) {
    localStorage.setItem('adminToken', tokenFromUrl);
    // Remove token from URL for security
    window.history.replaceState({}, document.title, window.location.pathname);
  }
  
  const token = localStorage.getItem('adminToken');
  
  if (!token) {
    window.location.href = 'http://localhost:5000/';
    return null;
  }

  return (
    <BrowserRouter>
      <Toast />
      <Routes>
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
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
