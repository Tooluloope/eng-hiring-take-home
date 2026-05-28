import { useState } from "react";
import { authApi } from "../api/client";
import { AuthContext } from "./AuthContextValue";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const token = localStorage.getItem("token");
    return token ? { token } : null;
  });
  const [loading] = useState(false);

  const login = async (email, password) => {
    const { access_token } = await authApi.login(email, password);
    localStorage.setItem("token", access_token);
    setUser({ token: access_token });
  };

  const register = async (data) => {
    await authApi.register(data);
    await login(data.email, data.password);
  };

  const logout = () => {
    localStorage.removeItem("token");
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
