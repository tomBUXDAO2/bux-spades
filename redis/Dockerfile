FROM redis:7-alpine

# Create directory and config file with password
RUN mkdir -p /usr/local/etc/redis && \
    echo "requirepass bux-spades-redis-2025" > /usr/local/etc/redis/redis.conf

# Expose Redis port
EXPOSE 6379

# Start Redis server with config
CMD ["redis-server", "/usr/local/etc/redis/redis.conf"]
