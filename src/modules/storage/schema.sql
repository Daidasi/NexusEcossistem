CREATE TABLE IF NOT EXISTS users (
 id uuid PRIMARY KEY, email text UNIQUE NOT NULL, name text NOT NULL,
 password_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS rate_limits (
 key text PRIMARY KEY, hits integer NOT NULL DEFAULT 1, expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS projects (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES users(id), name text NOT NULL
);
CREATE TABLE IF NOT EXISTS project_members (
 project_id uuid REFERENCES projects(id) ON DELETE CASCADE, user_id uuid REFERENCES users(id),
 PRIMARY KEY(project_id,user_id)
);
CREATE TABLE IF NOT EXISTS rooms (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES users(id), name text NOT NULL,
 project_id uuid REFERENCES projects(id), created_at timestamptz NOT NULL DEFAULT now(),
 budget_micro bigint NOT NULL DEFAULT 0, spent_micro bigint NOT NULL DEFAULT 0,
 reserved_micro bigint NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS room_members (
 room_id uuid REFERENCES rooms(id) ON DELETE CASCADE, user_id uuid REFERENCES users(id),
 PRIMARY KEY(room_id,user_id)
);
CREATE TABLE IF NOT EXISTS invitations (
 token_hash text PRIMARY KEY, room_id uuid NOT NULL REFERENCES rooms(id),
 email text NOT NULL, expires_at timestamptz NOT NULL, used boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS connections (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES users(id),
 provider text NOT NULL CHECK (provider IN ('openai','anthropic','google')),
 model text NOT NULL, name text NOT NULL, secret text NOT NULL,
 available boolean NOT NULL DEFAULT true, status text NOT NULL DEFAULT 'unverified',
 token_budget bigint NOT NULL, tokens_spent bigint NOT NULL DEFAULT 0,
 tokens_reserved bigint NOT NULL DEFAULT 0, budget_micro bigint NOT NULL,
 spent_micro bigint NOT NULL DEFAULT 0, reserved_micro bigint NOT NULL DEFAULT 0,
 input_rate numeric NOT NULL, output_rate numeric NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS room_connections (
 room_id uuid REFERENCES rooms(id), connection_id uuid REFERENCES connections(id),
 policy text NOT NULL CHECK (policy IN ('owner','members')),
 payer text NOT NULL CHECK (payer IN ('owner','room')),
 active boolean NOT NULL DEFAULT true, PRIMARY KEY(room_id,connection_id)
);
CREATE TABLE IF NOT EXISTS memories (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES users(id), title text NOT NULL,
 content text NOT NULL, scope text NOT NULL CHECK (scope IN ('personal','room','project')),
 room_id uuid REFERENCES rooms(id), project_id uuid REFERENCES projects(id),
 origin text NOT NULL CHECK (origin IN ('imported','derived','nexus')),
 source text NOT NULL, source_hash text NOT NULL,
 version integer NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK ((scope='personal' AND room_id IS NULL AND project_id IS NULL) OR
        (scope='room' AND room_id IS NOT NULL AND project_id IS NULL) OR
        (scope='project' AND project_id IS NOT NULL AND room_id IS NULL))
);
CREATE TABLE IF NOT EXISTS memory_grants (
 memory_id uuid REFERENCES memories(id) ON DELETE CASCADE,
 connection_id uuid REFERENCES connections(id), PRIMARY KEY(memory_id,connection_id)
);
CREATE TABLE IF NOT EXISTS import_drafts (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES users(id),
 content text NOT NULL, source text NOT NULL, source_hash text NOT NULL,
 expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS runs (
 id uuid PRIMARY KEY, room_id uuid NOT NULL REFERENCES rooms(id), actor_id uuid NOT NULL REFERENCES users(id),
 request_id uuid NOT NULL, status text NOT NULL DEFAULT 'running',
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(actor_id,request_id)
);
CREATE TABLE IF NOT EXISTS messages (
 id uuid PRIMARY KEY, room_id uuid NOT NULL REFERENCES rooms(id),
 run_id uuid REFERENCES runs(id), author_id uuid NOT NULL REFERENCES users(id),
 connection_id uuid REFERENCES connections(id), author_name text NOT NULL,
 provider text, model text, role text NOT NULL CHECK (role IN ('user','assistant','error')),
 content text NOT NULL, memory_refs jsonb NOT NULL DEFAULT '[]',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS usage (
 id uuid PRIMARY KEY, run_id uuid REFERENCES runs(id), room_id uuid NOT NULL REFERENCES rooms(id),
 connection_id uuid NOT NULL REFERENCES connections(id), actor_id uuid NOT NULL REFERENCES users(id),
 status text NOT NULL, input_tokens integer NOT NULL DEFAULT 0, output_tokens integer NOT NULL DEFAULT 0,
 reserved_tokens bigint NOT NULL, reserved_micro bigint NOT NULL, cost_micro bigint NOT NULL DEFAULT 0,
 payer text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS audit (
 id uuid PRIMARY KEY, actor_id uuid NOT NULL REFERENCES users(id), room_id uuid REFERENCES rooms(id),
 action text NOT NULL, target_id uuid, details jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_room_time ON messages(room_id,created_at);
CREATE INDEX IF NOT EXISTS memories_room ON memories(room_id);
CREATE INDEX IF NOT EXISTS memories_project ON memories(project_id);
CREATE INDEX IF NOT EXISTS usage_connection ON usage(connection_id,created_at);
CREATE INDEX IF NOT EXISTS audit_room ON audit(room_id,created_at);
CREATE TABLE IF NOT EXISTS memory_versions (
 memory_id uuid REFERENCES memories(id) ON DELETE CASCADE, version integer NOT NULL,
 content text NOT NULL, origin text NOT NULL, source_hash text NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(memory_id,version)
);
CREATE INDEX IF NOT EXISTS drafts_expiry ON import_drafts(expires_at);
