-- Index de performance sur les colonnes fréquemment filtrées

-- Events : requête principale (famille + date)
CREATE INDEX IF NOT EXISTS idx_events_family_date ON events (family_id, date);

-- Events : filtrage par scope
CREATE INDEX IF NOT EXISTS idx_events_scope ON events (scope, family_id);

-- Family messages : affichage chronologique par famille
CREATE INDEX IF NOT EXISTS idx_family_messages_family_id ON family_messages (family_id, created_at);

-- Stripe webhook lookups
CREATE INDEX IF NOT EXISTS idx_profiles_stripe_customer_id ON profiles (stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
