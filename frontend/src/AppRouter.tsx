import { BrowserRouter, Route, Routes } from "react-router-dom";
import App from "./App";
import AdminPage from "./AdminPage";
import PrivateView from "./PrivateView";
import ProfileView from "./ProfileView";
import ErrorBoundary from "./components/ErrorBoundary";

export default function AppRouter() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/private/:token" element={<PrivateView />} />
          <Route path="/u/:userId" element={<ProfileView />} />
          <Route path="/*" element={<App />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
