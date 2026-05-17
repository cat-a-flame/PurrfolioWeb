export type TransactionType = 'income' | 'expense';

export type Category = {
  id: string;
  user_id: string;
  name: string;
  type: TransactionType | 'both';
  icon: string;
  color: string;
  is_default: boolean;
  created_at: string;
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
  category_id: string | null;
  date: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  category?: Category | null;
  labels?: Label[];
};
