# Use a specific version of the Supabase PostgreSQL base image
FROM supabase/postgres:15.1.0.70

# Set a non-default username for the PostgreSQL user
ENV POSTGRES_PASSWORD=password

# Set environment variables for the database name and port
ENV POSTGRES_PORT=5432

# Expose the PostgreSQL port
EXPOSE $POSTGRES_PORT

# Set up a volume to persist the PostgreSQL data
VOLUME /var/lib/postgresql/data
COPY ./pg_hba.conf /etc/postgresql/pg_hba.conf


# Start the PostgreSQL server
CMD ["postgres", "-c", "config_file=/etc/postgresql/postgresql.conf"]