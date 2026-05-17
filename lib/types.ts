export type TransactionType = 'income' | 'expense';
export type Currency = 'HUF' | 'USD' | 'EUR';

export type Wallet = {
  id: string;
  user_id: string;
  name: string;
  currency: Currency;
  icon: string;
  color: string;
  is_default: boolean;
  created_at: string;
};

export type Category = {
  id: string;
  user_id: string;
  name: string;
  type: TransactionType | 'both';
  icon: string;
  color: string;
  is_default: boolean;
  parent_id: string | null;
  created_at: string;
  children?: Category[];
};

export type Label = {
  id: string;
  user_id: string;
  name: string;
  color: string;
  created_at: string;
};

export type Transaction = {
  id: string;
  user_id: string;
  type: TransactionType;
  amount: number;
  wallet_id: string | null;
  category_id: string | null;
  date: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  wallet?: Wallet | null;
  category?: Category | null;
  labels?: Label[];
};
