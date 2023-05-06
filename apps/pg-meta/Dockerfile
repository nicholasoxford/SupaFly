
FROM supabase/postgres-meta

ENV PG_META_HOST="fly-local-6pn" \
    PG_META_DB_HOST=supa-slim.internal \
    PG_META_DB_PORT=5432 \
    PG_META_DB_NAME=postgres \
    PG_META_DB_PASSWORD=password 

CMD ["npm", "run", "start", "--", "-H", "fly-local-6pn"]