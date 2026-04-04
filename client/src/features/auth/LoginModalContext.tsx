import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

type LoginModalContextValue = {
  openLoginModal: () => void;
  closeLoginModal: () => void;
  isLoginModalOpen: boolean;
};

const LoginModalContext = createContext<LoginModalContextValue | null>(null);

export function LoginModalProvider({ children }: { children: React.ReactNode }) {
  const [isLoginModalOpen, setOpen] = useState(false);
  const openLoginModal = useCallback(() => setOpen(true), []);
  const closeLoginModal = useCallback(() => setOpen(false), []);
  const value = useMemo(
    () => ({ openLoginModal, closeLoginModal, isLoginModalOpen }),
    [openLoginModal, closeLoginModal, isLoginModalOpen]
  );
  return <LoginModalContext.Provider value={value}>{children}</LoginModalContext.Provider>;
}

export function useLoginModal(): LoginModalContextValue {
  const ctx = useContext(LoginModalContext);
  if (!ctx) {
    throw new Error('useLoginModal must be used within LoginModalProvider');
  }
  return ctx;
}
