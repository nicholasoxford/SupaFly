FROM postgrest/postgrest

ENV PGRST_DB_ANON_ROLE: "anon" \
    PGRST_DB_URI: "postgres://authenticated:password@supa-slim.internal:5432/postgres" \ 
    PGRST_DB_USE_LEGACY_GUCS: "false" \ 
    PGRST_JWT_SECRET: "ve6d85nqdd3imcemq0qiztoojid8rsv5shcqy7g2" \
    PGRST_DB_SCHEMAS="public,storage,graphql_public" \
    PGRST_SERVER_HOST="fly-local-6pn"