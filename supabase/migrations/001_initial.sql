-- Categories
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense', 'both')),
  icon TEXT DEFAULT '💰',
  color TEXT DEFAULT '#6366f1',
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Labels
CREATE TABLE labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  color TEXT DEFAULT '#6366f1',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Transactions
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Transaction <-> Label junction
CREATE TABLE transaction_labels (
  transaction_id UUID REFERENCES transactions(id) ON DELETE CASCADE,
  label_id UUID REFERENCES labels(id) ON DELETE CASCADE,
  PRIMARY KEY (transaction_id, label_id)
);

-- Seed default categories
INSERT INTO categories (name, type, icon, color, is_default) VALUES
  ('Salary', 'income', '💼', '#22c55e', true),
  ('Freelance', 'income', '💻', '#10b981', true),
  ('Investment', 'income', '📈', '#06b6d4', true),
  ('Gift', 'both', '🎁', '#a78bfa', true),
  ('Food & Drink', 'expense', '🍔', '#f97316', true),
  ('Transport', 'expense', '🚗', '#3b82f6', true),
  ('Housing', 'expense', '🏠', '#8b5cf6', true),
  ('Utilities', 'expense', '💡', '#eab308', true),
  ('Entertainment', 'expense', '🎬', '#ec4899', true),
  ('Healthcare', 'expense', '🏥', '#14b8a6', true),
  ('Shopping', 'expense', '🛍️', '#f43f5e', true),
  ('Other', 'both', '📦', '#94a3b8', true);
