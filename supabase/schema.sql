-- PennyPuff — complete database schema
-- Run this in the Supabase SQL editor to set up the database from scratch.

-- ─────────────────────────────────────────
-- Tables
-- ─────────────────────────────────────────

CREATE TABLE categories (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL,
  type       TEXT        NOT NULL CHECK (type IN ('income', 'expense', 'both')),
  icon       TEXT        NOT NULL DEFAULT '📁',
  color      TEXT        NOT NULL DEFAULT '#f26e4d',
  is_default BOOLEAN     NOT NULL DEFAULT false,
  parent_id  UUID        REFERENCES categories(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE labels (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL,
  color      TEXT        NOT NULL DEFAULT '#f26e4d',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE wallets (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name            TEXT        NOT NULL,
  currency        TEXT        NOT NULL CHECK (currency IN ('HUF', 'USD', 'EUR')),
  icon            TEXT        NOT NULL DEFAULT '💰',
  color           TEXT        NOT NULL DEFAULT '#f26e4d',
  is_default      BOOLEAN     NOT NULL DEFAULT false,
  starting_balance NUMERIC(15, 2) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE transactions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wallet_id   UUID        NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
  type        TEXT        NOT NULL CHECK (type IN ('income', 'expense')),
  amount      NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
  category_id UUID        REFERENCES categories(id) ON DELETE SET NULL,
  date        DATE        NOT NULL DEFAULT CURRENT_DATE,
  notes              TEXT,
  payer              TEXT,
  transfer_group_id  UUID,
  exchange_rate_to_huf NUMERIC(15, 6),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE transaction_labels (
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  label_id       UUID NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
  PRIMARY KEY (transaction_id, label_id)
);

CREATE TABLE templates (
  id          UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID           NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT           NOT NULL,
  type        TEXT           NOT NULL CHECK (type IN ('income', 'expense')),
  wallet_id   UUID           REFERENCES wallets(id) ON DELETE SET NULL,
  amount      NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
  category_id UUID           REFERENCES categories(id) ON DELETE SET NULL,
  payer       TEXT,
  notes       TEXT,
  created_at  TIMESTAMPTZ    NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE TABLE template_labels (
  template_id UUID NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  label_id    UUID NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
  PRIMARY KEY (template_id, label_id)
);

-- ─────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────

CREATE INDEX idx_categories_user_id   ON categories(user_id);
CREATE INDEX idx_categories_parent_id ON categories(parent_id);
CREATE INDEX idx_labels_user_id       ON labels(user_id);
CREATE INDEX idx_wallets_user_id      ON wallets(user_id);
CREATE INDEX idx_transactions_user_id    ON transactions(user_id);
CREATE INDEX idx_transactions_wallet_id  ON transactions(wallet_id);
CREATE INDEX idx_transactions_category_id ON transactions(category_id);
CREATE INDEX idx_transactions_date       ON transactions(date DESC);
CREATE INDEX idx_tx_labels_transaction   ON transaction_labels(transaction_id);
CREATE INDEX idx_tx_labels_label         ON transaction_labels(label_id);
CREATE INDEX idx_templates_user_id       ON templates(user_id);
CREATE INDEX idx_template_labels_tmpl    ON template_labels(template_id);

-- ─────────────────────────────────────────
-- Row Level Security
-- ─────────────────────────────────────────

ALTER TABLE categories        ENABLE ROW LEVEL SECURITY;
ALTER TABLE labels            ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallets           ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates          ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_labels    ENABLE ROW LEVEL SECURITY;

CREATE POLICY "categories: own rows" ON categories
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "labels: own rows" ON labels
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "wallets: own rows" ON wallets
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "transactions: own rows" ON transactions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "transaction_labels: own rows" ON transaction_labels
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM transactions t
      WHERE t.id = transaction_labels.transaction_id
        AND t.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM transactions t
      WHERE t.id = transaction_labels.transaction_id
        AND t.user_id = auth.uid()
    )
  );

CREATE POLICY "templates: own rows" ON templates
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "template_labels: own rows" ON template_labels
  FOR ALL USING (
    EXISTS (SELECT 1 FROM templates t WHERE t.id = template_labels.template_id AND t.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM templates t WHERE t.id = template_labels.template_id AND t.user_id = auth.uid())
  );

-- ─────────────────────────────────────────
-- Auto-seed default categories on sign-up
-- ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION seed_default_categories()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  INSERT INTO categories (user_id, name, type, icon, color, is_default) VALUES
    (NEW.id, 'Salary',         'income',  '💼', '#16a34a', true),
    (NEW.id, 'Freelance',      'income',  '💻', '#10b981', true),
    (NEW.id, 'Investment',     'income',  '📈', '#06b6d4', true),
    (NEW.id, 'Gift',           'both',    '🎁', '#a78bfa', true),
    (NEW.id, 'Food & Drink',   'expense', '🍔', '#f97316', true),
    (NEW.id, 'Transport',      'expense', '🚗', '#3b82f6', true),
    (NEW.id, 'Housing',        'expense', '🏠', '#8b5cf6', true),
    (NEW.id, 'Utilities',      'expense', '💡', '#eab308', true),
    (NEW.id, 'Entertainment',  'expense', '🎬', '#ec4899', true),
    (NEW.id, 'Healthcare',     'expense', '🏥', '#14b8a6', true),
    (NEW.id, 'Shopping',       'expense', '🛍️', '#f43f5e', true),
    (NEW.id, 'Other',          'both',    '📦', '#94a3b8', true);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE seed_default_categories();

-- ─────────────────────────────────────────
-- Trigger: auto-update updated_at
-- ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER transactions_updated_at
  BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at();

CREATE TRIGGER templates_updated_at
  BEFORE UPDATE ON templates
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at();

-- ─────────────────────────────────────────
-- Recurring / planned payments
-- ─────────────────────────────────────────

CREATE TABLE recurring_payments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  amount      NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
  wallet_id   UUID REFERENCES wallets(id) ON DELETE SET NULL,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  frequency   TEXT NOT NULL CHECK (frequency IN ('weekly', 'biweekly', 'monthly', 'quarterly', 'yearly')),
  start_date  DATE NOT NULL,
  end_date    DATE,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  notes       TEXT,
  payer       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE recurring_payment_labels (
  recurring_payment_id UUID NOT NULL REFERENCES recurring_payments(id) ON DELETE CASCADE,
  label_id             UUID NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
  PRIMARY KEY (recurring_payment_id, label_id)
);

ALTER TABLE recurring_payment_labels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recurring_payment_labels: own rows" ON recurring_payment_labels
  FOR ALL USING (
    EXISTS (SELECT 1 FROM recurring_payments p WHERE p.id = recurring_payment_labels.recurring_payment_id AND p.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM recurring_payments p WHERE p.id = recurring_payment_labels.recurring_payment_id AND p.user_id = auth.uid())
  );

CREATE INDEX idx_recurring_payment_labels_payment ON recurring_payment_labels(recurring_payment_id);

-- Stores only actioned occurrences (paid or skipped); pending ones are computed from the rule.
CREATE TABLE recurring_occurrences (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recurring_payment_id UUID NOT NULL REFERENCES recurring_payments(id) ON DELETE CASCADE,
  user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  due_date             DATE NOT NULL,
  status               TEXT NOT NULL CHECK (status IN ('paid', 'skipped')),
  transaction_id       UUID REFERENCES transactions(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (recurring_payment_id, due_date)
);

CREATE INDEX idx_recurring_payments_user_id    ON recurring_payments(user_id);
CREATE INDEX idx_recurring_occurrences_payment ON recurring_occurrences(recurring_payment_id);
CREATE INDEX idx_recurring_occurrences_user    ON recurring_occurrences(user_id);

ALTER TABLE recurring_payments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_occurrences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recurring_payments: own rows" ON recurring_payments
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "recurring_occurrences: own rows" ON recurring_occurrences
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER recurring_payments_updated_at
  BEFORE UPDATE ON recurring_payments
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at();

-- ─────────────────────────────────────────
-- Migration: run these if upgrading an existing database
-- ─────────────────────────────────────────
-- ALTER TABLE transactions ADD COLUMN IF NOT EXISTS exchange_rate_to_huf NUMERIC(15, 6);
-- ALTER TABLE wallets ADD COLUMN IF NOT EXISTS starting_balance NUMERIC(15, 2) NOT NULL DEFAULT 0;
-- ALTER TABLE transactions ADD COLUMN IF NOT EXISTS payer TEXT;
-- ALTER TABLE transactions ALTER COLUMN wallet_id SET NOT NULL;
-- ALTER TABLE transactions ADD COLUMN IF NOT EXISTS transfer_group_id UUID;
-- CREATE TABLE recurring_payment_labels ( recurring_payment_id UUID NOT NULL REFERENCES recurring_payments(id) ON DELETE CASCADE, label_id UUID NOT NULL REFERENCES labels(id) ON DELETE CASCADE, PRIMARY KEY (recurring_payment_id, label_id) );
-- ALTER TABLE recurring_payment_labels ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "recurring_payment_labels: own rows" ON recurring_payment_labels FOR ALL USING ( EXISTS (SELECT 1 FROM recurring_payments p WHERE p.id = recurring_payment_labels.recurring_payment_id AND p.user_id = auth.uid()) ) WITH CHECK ( EXISTS (SELECT 1 FROM recurring_payments p WHERE p.id = recurring_payment_labels.recurring_payment_id AND p.user_id = auth.uid()) );
-- CREATE INDEX idx_recurring_payment_labels_payment ON recurring_payment_labels(recurring_payment_id);
-- CREATE TABLE recurring_occurrences ( id UUID PRIMARY KEY DEFAULT gen_random_uuid(), recurring_payment_id UUID NOT NULL REFERENCES recurring_payments(id) ON DELETE CASCADE, user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, due_date DATE NOT NULL, status TEXT NOT NULL CHECK (status IN ('paid', 'skipped')), transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (recurring_payment_id, due_date) );
-- CREATE INDEX idx_recurring_occurrences_payment ON recurring_occurrences(recurring_payment_id);
-- CREATE INDEX idx_recurring_occurrences_user ON recurring_occurrences(user_id);
-- ALTER TABLE recurring_occurrences ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "recurring_occurrences: own rows" ON recurring_occurrences FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
-- CREATE TABLE templates ( id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, name TEXT NOT NULL, type TEXT NOT NULL CHECK (type IN ('income', 'expense')), wallet_id UUID REFERENCES wallets(id) ON DELETE SET NULL, amount NUMERIC(15,2) NOT NULL CHECK (amount > 0), category_id UUID REFERENCES categories(id) ON DELETE SET NULL, payer TEXT, notes TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now() );
-- CREATE TABLE template_labels ( template_id UUID NOT NULL REFERENCES templates(id) ON DELETE CASCADE, label_id UUID NOT NULL REFERENCES labels(id) ON DELETE CASCADE, PRIMARY KEY (template_id, label_id) );
-- ALTER TABLE templates ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE template_labels ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "templates: own rows" ON templates FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
-- CREATE POLICY "template_labels: own rows" ON template_labels FOR ALL USING ( EXISTS (SELECT 1 FROM templates t WHERE t.id = template_labels.template_id AND t.user_id = auth.uid()) ) WITH CHECK ( EXISTS (SELECT 1 FROM templates t WHERE t.id = template_labels.template_id AND t.user_id = auth.uid()) );
-- CREATE INDEX idx_templates_user_id ON templates(user_id);
-- CREATE INDEX idx_template_labels_tmpl ON template_labels(template_id);
-- CREATE TRIGGER templates_updated_at BEFORE UPDATE ON templates FOR EACH ROW EXECUTE PROCEDURE update_updated_at();
