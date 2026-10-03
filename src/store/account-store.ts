import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { TradingAccountSnapshot, EquityUpdatePayload } from "@/types";
import { AccountStatus } from "@prisma/client";

interface AccountStore {
  // Account list
  accounts: TradingAccountSnapshot[];
  selectedAccount: TradingAccountSnapshot | null;

  // Live P&L data from WebSocket
  pnlData: EquityUpdatePayload | null;

  // Actions
  setAccounts: (accounts: TradingAccountSnapshot[]) => void;
  selectAccount: (account: TradingAccountSnapshot) => void;
  setPnlData: (data: EquityUpdatePayload) => void;
  updateAccountStatus: (accountId: string, status: AccountStatus) => void;
  updateAccountEquity: (accountId: string, equity: number) => void;
}

export const useAccountStore = create<AccountStore>()(
  devtools(
    (set) => ({
      accounts: [],
      selectedAccount: null,
      pnlData: null,

      setAccounts: (accounts) => set({ accounts }),

      selectAccount: (account) =>
        set({ selectedAccount: account, pnlData: null }),

      setPnlData: (data) => set({ pnlData: data }),

      updateAccountStatus: (accountId, status) =>
        set((state) => ({
          accounts: state.accounts.map((a) =>
            a.accountId === accountId ? { ...a, status } : a
          ),
          selectedAccount:
            state.selectedAccount?.accountId === accountId
              ? { ...state.selectedAccount, status }
              : state.selectedAccount,
        })),

      updateAccountEquity: (accountId, equity) =>
        set((state) => ({
          accounts: state.accounts.map((a) =>
            a.accountId === accountId ? { ...a, equity } : a
          ),
          selectedAccount:
            state.selectedAccount?.accountId === accountId
              ? { ...state.selectedAccount, equity }
              : state.selectedAccount,
        })),
    }),
    { name: "AccountStore" }
  )
);
