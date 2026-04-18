import { useState, useEffect } from 'react';
import { getSupabaseAuthSession, getSupabaseAuthUser, supabaseSignInWithPassword, supabaseSignOut } from '../api';

export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Check existing session on mount
    const session = getSupabaseAuthSession();
    const currentUser = getSupabaseAuthUser();
    
    if (session && currentUser) {
      setUser(currentUser);
    }
    setLoading(false);
  }, []);

  const signIn = async (email, password) => {
    setLoading(true);
    setError(null);
    
    try {
      const result = await supabaseSignInWithPassword(email, password);
      setUser(result.user);
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    setLoading(true);
    try {
      await supabaseSignOut();
      setUser(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return {
    user,
    loading,
    error,
    signIn,
    signOut,
    isAuthenticated: !!user
  };
}
