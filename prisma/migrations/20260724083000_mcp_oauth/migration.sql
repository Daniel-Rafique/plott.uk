CREATE TABLE "oauth_clients" (
  "id" TEXT NOT NULL,
  "client_id" TEXT NOT NULL,
  "client_name" TEXT NOT NULL,
  "client_uri" TEXT,
  "redirect_uris" TEXT[] NOT NULL,
  "token_endpoint_auth_method" TEXT NOT NULL DEFAULT 'none',
  "client_secret_hash" TEXT,
  "grant_types" TEXT[] NOT NULL DEFAULT ARRAY['authorization_code', 'refresh_token']::TEXT[],
  "response_types" TEXT[] NOT NULL DEFAULT ARRAY['code']::TEXT[],
  "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(3),
  CONSTRAINT "oauth_clients_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "oauth_clients_client_id_key" ON "oauth_clients"("client_id");

CREATE TABLE "oauth_grants" (
  "id" TEXT NOT NULL,
  "client_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "scopes" TEXT[] NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "revoked_at" TIMESTAMP(3),
  CONSTRAINT "oauth_grants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "oauth_grants_client_id_user_id_company_id_key"
  ON "oauth_grants"("client_id", "user_id", "company_id");
CREATE INDEX "oauth_grants_user_id_company_id_idx"
  ON "oauth_grants"("user_id", "company_id");

CREATE TABLE "oauth_authorization_codes" (
  "id" TEXT NOT NULL,
  "code_hash" TEXT NOT NULL,
  "client_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "scopes" TEXT[] NOT NULL,
  "redirect_uri" TEXT NOT NULL,
  "resource" TEXT NOT NULL,
  "code_challenge" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "used_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "oauth_authorization_codes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "oauth_authorization_codes_code_hash_key"
  ON "oauth_authorization_codes"("code_hash");
CREATE INDEX "oauth_authorization_codes_expires_at_idx"
  ON "oauth_authorization_codes"("expires_at");

CREATE TABLE "oauth_refresh_tokens" (
  "id" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL,
  "family_id" TEXT NOT NULL,
  "grant_id" TEXT NOT NULL,
  "scopes" TEXT[] NOT NULL,
  "resource" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "consumed_at" TIMESTAMP(3),
  "revoked_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "oauth_refresh_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "oauth_refresh_tokens_token_hash_key"
  ON "oauth_refresh_tokens"("token_hash");
CREATE INDEX "oauth_refresh_tokens_family_id_idx"
  ON "oauth_refresh_tokens"("family_id");
CREATE INDEX "oauth_refresh_tokens_grant_id_idx"
  ON "oauth_refresh_tokens"("grant_id");
CREATE INDEX "oauth_refresh_tokens_expires_at_idx"
  ON "oauth_refresh_tokens"("expires_at");

CREATE TABLE "oauth_revoked_access_tokens" (
  "jti" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "revoked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "oauth_revoked_access_tokens_pkey" PRIMARY KEY ("jti")
);

CREATE INDEX "oauth_revoked_access_tokens_expires_at_idx"
  ON "oauth_revoked_access_tokens"("expires_at");

CREATE TABLE "oauth_audit_events" (
  "id" TEXT NOT NULL,
  "event" TEXT NOT NULL,
  "client_id" TEXT,
  "user_id" TEXT,
  "company_id" TEXT,
  "jti" TEXT,
  "tool_name" TEXT,
  "outcome" TEXT NOT NULL,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "oauth_audit_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "oauth_audit_events_user_id_company_id_created_at_idx"
  ON "oauth_audit_events"("user_id", "company_id", "created_at");
CREATE INDEX "oauth_audit_events_client_id_created_at_idx"
  ON "oauth_audit_events"("client_id", "created_at");

CREATE TABLE "mcp_idempotency_keys" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "tool_name" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "result" JSONB,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "mcp_idempotency_keys_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "mcp_idempotency_keys_company_id_user_id_tool_name_key_key"
  ON "mcp_idempotency_keys"("company_id", "user_id", "tool_name", "key");
CREATE INDEX "mcp_idempotency_keys_expires_at_idx"
  ON "mcp_idempotency_keys"("expires_at");

ALTER TABLE "oauth_grants"
  ADD CONSTRAINT "oauth_grants_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "oauth_clients"("client_id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "oauth_grants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "oauth_grants_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "oauth_authorization_codes"
  ADD CONSTRAINT "oauth_authorization_codes_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "oauth_clients"("client_id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "oauth_authorization_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "oauth_authorization_codes_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "oauth_refresh_tokens"
  ADD CONSTRAINT "oauth_refresh_tokens_grant_id_fkey" FOREIGN KEY ("grant_id") REFERENCES "oauth_grants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "oauth_audit_events"
  ADD CONSTRAINT "oauth_audit_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "oauth_audit_events_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "mcp_idempotency_keys"
  ADD CONSTRAINT "mcp_idempotency_keys_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "mcp_idempotency_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
