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
import AccountSubscriptions from '@/sections/account/AccountSubscriptions';
import CreationsPage from '@/sections/CreationsPage';
import CreationDetailPage from '@/sections/CreationDetailPage';
import SubscriptionsLandingPage from '@/sections/SubscriptionsLandingPage';
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
import LoginErrorPage from '@/sections/LoginErrorPage';
import ResetPasswordPage from '@/sections/ResetPasswordPage';
import LivraisonRetoursPage from '@/sections/LivraisonRetoursPage';
import ConditionsGeneralesPage from '@/sections/ConditionsGeneralesPage';
import PolitiqueConfidentialitePage from '@/sections/PolitiqueConfidentialitePage';
import FaqPage from '@/sections/FaqPage';
import ContactPage from '@/sections/ContactPage';
import { PublicOnlyRoute, PrivateRoute } from '@/components/routing/RouteGuards';
import { FrontendRedirectResolver } from '@/components/routing/FrontendRedirectResolver';
import { Toast } from '@/components/Toast';
import MaintenancePage from '@/sections/MaintenancePage';
import { StoreSettingsProvider } from '@/context/StoreSettingsContext';
import { CloseCrossCursor } from '@/components/CloseCrossCursor';

function App() {
  return (
    <AuthProvider>
      <StoreSettingsProvider>
        <BlendProvider>
          <div className="min-h-screen bg-[var(--cream-apothecary)]">
            <CloseCrossCursor />
            <CartDrawer />
            <WishlistDrawer />
            <Toast />
            <FrontendRedirectResolver />
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
            <Route path="/login-error" element={<LoginErrorPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/livraison-retours" element={<LivraisonRetoursPage />} />
            <Route path="/conditions-generales" element={<ConditionsGeneralesPage />} />
            <Route path="/politique-confidentialite" element={<PolitiqueConfidentialitePage />} />
            <Route path="/faq" element={<FaqPage />} />
            <Route path="/contact" element={<ContactPage />} />
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
              <Route path="subscriptions" element={<AccountSubscriptions />} />
            </Route>
            <Route path="/logout" element={<LogoutPage />} />
            <Route path="/cart" element={<CartPage />} />
            <Route path="/checkout" element={<CheckoutPage />} />
            <Route path="/maintenance" element={<MaintenancePage />} />
            <Route path="/accessoires" element={<AccessoriesPage />} />
            <Route path="/accessoires/:slug" element={<AccessoryDetailPage />} />
            <Route path="/creations" element={<CreationsPage />} />
            <Route path="/creations/:slug" element={<CreationDetailPage />} />
            <Route path="/subscriptions" element={<SubscriptionsLandingPage />} />
            <Route path="/order" element={<OrderConfirmation />} />
            <Route path="/order/:id" element={<OrderConfirmation />} />
            <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </div>
        </BlendProvider>
      </StoreSettingsProvider>
    </AuthProvider>
  );
}

export default App;
