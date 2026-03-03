import { BlendProvider } from '@/context/BlendContext';
import { AuthProvider } from '@/context/AuthContext';
import { Routes, Route } from 'react-router-dom';
import HomePage from '@/sections/HomePage';
import { AccountLayout } from '@/components/account/AccountLayout';
import AccountDashboard from '@/sections/account/AccountDashboard';
import AccountEdit from '@/sections/account/AccountEdit';
import AccountOrders from '@/sections/account/AccountOrders';
import AccountOrderDetail from '@/sections/account/AccountOrderDetail';
import AccountAddressBook from '@/sections/account/AccountAddressBook';
import AccountInvoice from '@/sections/account/AccountInvoice';
import CreationsPage from '@/sections/CreationsPage';
import CreationDetailPage from '@/sections/CreationDetailPage';
import SubscriptionsPage from '@/sections/SubscriptionsPage';
import CartPage from '@/sections/CartPage';
import CheckoutPage from '@/sections/CheckoutPage';
import OrderConfirmation from '@/sections/OrderConfirmation';
import { CartDrawer } from '@/components/cart-drawer/CartDrawer';
import { WishlistDrawer } from '@/components/wishlist-drawer/WishlistDrawer';
import LoginPage from '@/sections/LoginPage';
import RegisterPage from '@/sections/RegisterPage';
import AccessoriesPage from '@/sections/AccessoriesPage';
import AccessoryDetailPage from '@/sections/AccessoryDetailPage';
import LogoutPage from '@/sections/LogoutPage';
import NotFoundPage from '@/sections/NotFoundPage';
import ForgotPasswordPage from '@/sections/ForgotPasswordPage';
import ResetPasswordPage from '@/sections/ResetPasswordPage';
import { PublicOnlyRoute, PrivateRoute } from '@/components/routing/RouteGuards';
import { Toast } from '@/components/Toast';

function App() {
  return (
    <AuthProvider>
      <BlendProvider>
        <div className="min-h-screen bg-[var(--cream-apothecary)]">
          <CartDrawer />
          <WishlistDrawer />
          <Toast />
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route
              path="/login"
              element={
                <PublicOnlyRoute>
                  <LoginPage />
                </PublicOnlyRoute>
              }
            />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route
              path="/register"
              element={
                <PublicOnlyRoute>
                  <RegisterPage />
                </PublicOnlyRoute>
              }
            />
            <Route
              path="/account"
              element={
                <PrivateRoute>
                  <AccountLayout />
                </PrivateRoute>
              }
            >
              <Route index element={<AccountDashboard />} />
              <Route path="edit" element={<AccountEdit />} />
              <Route path="orders" element={<AccountOrders />} />
              <Route path="order/:orderId" element={<AccountOrderDetail />} />
              <Route path="order/:orderId/invoice" element={<AccountInvoice />} />
              <Route path="address" element={<AccountAddressBook />} />
            </Route>
            <Route path="/logout" element={<LogoutPage />} />
            <Route path="/cart" element={<CartPage />} />
            <Route path="/checkout" element={<CheckoutPage />} />
            <Route path="/accessoires" element={<AccessoriesPage />} />
            <Route path="/accessoires/:slug" element={<AccessoryDetailPage />} />
            <Route path="/creations" element={<CreationsPage />} />
            <Route path="/creations/:slug" element={<CreationDetailPage />} />
            <Route path="/subscriptions" element={<SubscriptionsPage />} />
            <Route path="/order" element={<OrderConfirmation />} />
            <Route path="/order/:id" element={<OrderConfirmation />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </div>
      </BlendProvider>
    </AuthProvider>
  );
}

export default App;
