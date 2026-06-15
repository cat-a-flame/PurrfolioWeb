'use client';

import { createContext, useContext, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import TransactionForm, { TransactionFormData } from './TransactionForm';
import Toast from '@/components/ui/Toast';
import { createClient } from '@/lib/supabase/client';
import { getExchangeRates } from '@/lib/exchangeRates';
import type { Category, Label, Wallet } from '@/lib/types';

type AddRecordContextType = {
  openAddDialog: () => void;
};

const AddRecordContext = createContext<AddRecordContextType>({ openAddDialog: () => {} });

export function useAddRecord() {
  return useContext(AddRecordContext);
}

export default function AddRecordProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [toast, setToast] = useState<{ message: string; variant: 'success' | 'error' } | null>(null);

  const openAddDialog = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [catRes, lblRes, walletRes] = await Promise.all([
      supabase.from('categories').select('*').eq('user_id', user.id).order('name'),
      supabase.from('labels').select('*').eq('user_id', user.id).order('name'),
      supabase.from('wallets').select('*').eq('user_id', user.id).order('name'),
    ]);

    if (catRes.data) setCategories(catRes.data);
    if (lblRes.data) setLabels(lblRes.data);
    if (walletRes.data) setWallets(walletRes.data);
    setOpen(true);
  }, []);

  async function handleSave(data: TransactionFormData) {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const getWalletRate = async (walletId: string, date: string): Promise<number | null> => {
      const wallet = wallets.find(w => w.id === walletId);
      if (!wallet?.currency || wallet.currency === 'HUF') return null;
      const rates = await getExchangeRates(date);
      return rates[wallet.currency] ?? null;
    };

    if (data.externalTransfer) {
      const transferGroupId = crypto.randomUUID();
      const exchangeRate = await getWalletRate(data.wallet_id, data.date);
      const { error } = await supabase.from('transactions').insert({
        user_id: user.id,
        type: data.type,
        amount: data.amount,
        wallet_id: data.wallet_id,
        category_id: null,
        date: data.date,
        notes: data.notes || null,
        payer: data.externalTransfer.account_name,
        transfer_group_id: transferGroupId,
        exchange_rate_to_huf: exchangeRate,
      });
      if (error) throw error;

      setOpen(false);
      setToast({ message: 'Transfer recorded.', variant: 'success' });
      window.dispatchEvent(new Event('transaction-added'));
      router.refresh();
      return;
    }

    if (data.transfer) {
      // Generate a shared UUID to link both legs
      const transferGroupId = crypto.randomUUID();
      const common = { user_id: user.id, date: data.date, notes: data.notes || null, transfer_group_id: transferGroupId };

      const [expenseRate, incomeRate] = await Promise.all([
        getWalletRate(data.wallet_id, data.date),
        getWalletRate(data.transfer.to_wallet_id, data.date),
      ]);

      const { error } = await supabase.from('transactions').insert([
        { ...common, type: 'expense', amount: data.amount,             wallet_id: data.wallet_id,          exchange_rate_to_huf: expenseRate },
        { ...common, type: 'income',  amount: data.transfer.to_amount, wallet_id: data.transfer.to_wallet_id, exchange_rate_to_huf: incomeRate },
      ]);
      if (error) throw error;

      setOpen(false);
      setToast({ message: 'Transfer recorded.', variant: 'success' });
      window.dispatchEvent(new Event('transaction-added'));
      router.refresh();
      return;
    }

    const exchangeRate = await getWalletRate(data.wallet_id, data.date);

    const { data: inserted, error } = await supabase
      .from('transactions')
      .insert({
        user_id: user.id,
        type: data.type,
        amount: data.amount,
        wallet_id: data.wallet_id,
        category_id: data.category_id,
        date: data.date,
        notes: data.notes || null,
        payer: data.payer || null,
        exchange_rate_to_huf: exchangeRate,
      })
      .select()
      .single();

    if (error) throw error;

    if (data.label_ids.length > 0 && inserted) {
      await supabase.from('transaction_labels').insert(
        data.label_ids.map((lid) => ({ transaction_id: inserted.id, label_id: lid }))
      );
    }

    setOpen(false);
    setToast({ message: 'Transaction added.', variant: 'success' });
    window.dispatchEvent(new Event('transaction-added'));
    router.refresh();
  }

  return (
    <AddRecordContext.Provider value={{ openAddDialog }}>
      {children}
      {open && (
        <TransactionForm
          wallets={wallets}
          categories={categories}
          labels={labels}
          onSave={handleSave}
          onClose={() => setOpen(false)}
        />
      )}
      {toast && (
        <Toast message={toast.message} variant={toast.variant} onDismiss={() => setToast(null)} />
      )}
    </AddRecordContext.Provider>
  );
}
