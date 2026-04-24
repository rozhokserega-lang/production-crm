import { createContext, useContext, useState } from "react";

const ErrorContext = createContext(null);

export function ErrorProvider({ children }) {
  const [error, setError] = useState("");
  return (
    <ErrorContext.Provider value={{ error, setError }}>
      {children}
    </ErrorContext.Provider>
  );
}

export function useError() {
  const ctx = useContext(ErrorContext);
  if (!ctx) throw new Error("useError must be used within ErrorProvider");
  return ctx;
}
