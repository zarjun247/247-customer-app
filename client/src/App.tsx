import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Onboarding from "./pages/Onboarding";
import Catalog from "./pages/Catalog";
import Cart from "./pages/Cart";
import Orders from "./pages/Orders";
import OrderDetail from "./pages/OrderDetail";
import RxUpload from "./pages/RxUpload";
import Profile from "./pages/Profile";
import Invoices from "./pages/Invoices";
import RefillReminders from "./pages/RefillReminders";

function Router() {
  // make sure to consider if you need authentication for certain routes
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/login" component={Login} />
      <Route path="/onboarding" component={Onboarding} />
      <Route path="/catalog" component={Catalog} />
      <Route path="/cart" component={Cart} />
      <Route path="/orders" component={Orders} />
      <Route path="/orders/:id" component={OrderDetail} />
      <Route path="/rx-upload" component={RxUpload} />
      <Route path="/profile" component={Profile} />
      <Route path="/invoices" component={Invoices} />
      <Route path="/refills" component={RefillReminders} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="dark"
        // switchable
      >
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
